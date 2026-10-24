import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
export const GA4_OWNER='q.stewart@tidelinestrats.com';
const PROPERTY='560552440',COLLECTION='company_tideline_ga4_connection',SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const runtimeFetch=(...args)=>globalThis.fetch(...args);
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const secure={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const expired='voyage_ga4_oauth=; Max-Age=0; Path=/auth/ga4; Secure; HttpOnly; SameSite=Lax';
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{...secure,...extra}});
export const ga4Configured=env=>!!(env.GA4_CLIENT_ID&&env.GA4_CLIENT_SECRET&&env.GA4_TOKEN_ENCRYPTION_KEY);
async function encryptionKey(env){const key=Buffer.from(env.GA4_TOKEN_ENCRYPTION_KEY||'','base64url');if(key.length!==32)throw Error('Reporting encryption unavailable');return crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(env,value){const iv=randomBytes(12),bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(PROPERTY)},await encryptionKey(env),new TextEncoder().encode(JSON.stringify(value)));return {iv:iv.toString('base64url'),ciphertext:Buffer.from(bytes).toString('base64url')};}
export async function ga4Connection(env){const row=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind(COLLECTION,'google').first();if(!row)return null;const data=JSON.parse(row.data_json);if(data.email!==GA4_OWNER||data.propertyId!==PROPERTY)throw Error('Wrong reporting identity');const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(data.iv,'base64url'),additionalData:new TextEncoder().encode(PROPERTY)},await encryptionKey(env),Buffer.from(data.ciphertext,'base64url'));const value=JSON.parse(new TextDecoder().decode(plaintext));if(typeof value.refreshToken!=='string'||!value.refreshToken||value.refreshToken.length>8192)throw Error('Invalid reporting connection');return {...value,email:data.email};}
export async function startGA4Connection(request,env,actor){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(actor.role!=='edit'||request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Not allowed'},403);
 if(!ga4Configured(env))return json({error:'Google reporting connection is being configured.'},503);
 const owner=await env.DB.prepare('SELECT email FROM members WHERE id=? AND active=1').bind(actor.id).first();if(owner?.email?.toLowerCase()!==GA4_OWNER)return json({error:'Only the verified TideLine Google account can connect this property.'},403);
 const state=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
 await env.DB.prepare('DELETE FROM oauth_logins WHERE expires_at<?').bind(Date.now()).run();
 await env.DB.prepare('INSERT INTO oauth_logins(state_hash,nonce,verifier,expires_at) VALUES(?,?,?,?)').bind(hash(state),JSON.stringify({purpose:'tideline-ga4',nonce,actorId:actor.id}),verifier,Date.now()+600000).run();
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:env.GA4_CLIENT_ID,redirect_uri:new URL(request.url).origin+'/auth/ga4/callback',response_type:'code',scope:'openid email '+SCOPE,state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent',login_hint:GA4_OWNER,authuser:GA4_OWNER}).toString();
 return json({authorizationUrl:url.toString()},200,{'set-cookie':`voyage_ga4_oauth=${state}; Max-Age=600; Path=/auth/ga4; Secure; HttpOnly; SameSite=Lax`});
}
async function boundedJson(response){if(!response.ok)throw Error('Google reporting request failed');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw Error('Oversized token response');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString());}
export async function finishGA4Connection(request,env,{exchange=runtimeFetch,verify=jwtVerify}={}){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 try{
  if(!ga4Configured(env))throw Error();const url=new URL(request.url),state=url.searchParams.get('state')||'',cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('voyage_ga4_oauth='))?.slice(17)||'';
  if(!/^[a-f0-9]{64}$/.test(state)||cookie.length!==64||!timingSafeEqual(Buffer.from(state),Buffer.from(cookie)))throw Error();
  const login=await env.DB.prepare('DELETE FROM oauth_logins WHERE state_hash=? AND expires_at>? RETURNING nonce,verifier').bind(hash(state),Date.now()).first();if(!login)throw Error();const pending=JSON.parse(login.nonce),code=url.searchParams.get('code');if(pending.purpose!=='tideline-ga4'||!code||code.length>4096)throw Error();
  const token=await boundedJson(await exchange('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GA4_CLIENT_ID,client_secret:env.GA4_CLIENT_SECRET,redirect_uri:url.origin+'/auth/ga4/callback',grant_type:'authorization_code',code,code_verifier:login.verifier}),redirect:'manual',signal:AbortSignal.timeout(15000)}));
  const {payload}=await verify(token.id_token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GA4_CLIENT_ID,requiredClaims:['exp','iat','sub','email','email_verified','nonce']});if(payload.nonce!==pending.nonce||payload.email_verified!==true||payload.email?.toLowerCase()!==GA4_OWNER||!payload.sub)throw Error();
  const owner=await env.DB.prepare('SELECT id,role,email FROM members WHERE id=? AND active=1').bind(pending.actorId).first();if(owner?.role!=='edit'||owner.email?.toLowerCase()!==GA4_OWNER)throw Error();
  if(!(token.scope||'').split(' ').includes(SCOPE)||typeof token.refresh_token!=='string'||!token.refresh_token||token.refresh_token.length>8192)throw Error();
  const record={email:GA4_OWNER,propertyId:PROPERTY,connectedBy:owner.id,connectedAt:Date.now(),...await seal(env,{refreshToken:token.refresh_token})};
  await env.DB.batch([env.DB.prepare('INSERT INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=revision+1,updated_at=excluded.updated_at').bind(COLLECTION,'google',JSON.stringify(record),Date.now()),env.DB.prepare('DELETE FROM documents WHERE collection=? AND id=?').bind('company_tideline_ga4','report')]);
  return new Response(null,{status:303,headers:{...secure,location:'/?view=company&ga4=connected','set-cookie':expired}});
 }catch{return json({error:'Google reporting could not connect. Use q.stewart@tidelinestrats.com and try again from Company.'},400,{'set-cookie':expired});}
}
export async function reportingAccessToken(env,exchange=runtimeFetch){const connection=await ga4Connection(env);if(!connection)return null;const token=await boundedJson(await exchange('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GA4_CLIENT_ID,client_secret:env.GA4_CLIENT_SECRET,refresh_token:connection.refreshToken,grant_type:'refresh_token'}),redirect:'manual',signal:AbortSignal.timeout(10000)}));if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>8192)throw Error('Invalid reporting access token');return token.access_token;}
