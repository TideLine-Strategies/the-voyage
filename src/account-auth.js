import {loginPage,handleVoyagePassword} from './voyage-auth.js';
import {finishTrakrConnection} from './company-trakr.js';
import {finishGA4Connection} from './company-ga4-auth.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';
const headers={'content-type':'application/json','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const hash=value=>createHash('sha256').update(value).digest('hex');
// Cloudflare's request-scoped fetch must be invoked through the active global,
// rather than retained and called as a detached platform function.
// workerd rejects redirect:'error' before I/O. Use manual and reject non-2xx
// responses below, so credentials are never forwarded to a redirect destination.
const runtimeFetch=(...args)=>globalThis.fetch(...args);
const timeoutOption=()=>typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(10000)}:{};
export const accountPage=loginPage;
async function limit(db,bucket,max){
 const now=Date.now(),windowStart=Math.floor(now/900000)*900000;
 const bucketHash=hash(bucket);
 await db.prepare('INSERT INTO login_limits(bucket,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start').bind(bucketHash,windowStart).run();
 const row=await db.prepare('SELECT attempts FROM login_limits WHERE bucket=?').bind(bucketHash).first();
 if(!row)throw Error('Login limit state unavailable');
 return row.attempts<=max;
}
export async function handleAccountAuth(request,env,{audit,readJson,verifyGoogle=googleMember,exchange=runtimeFetch}){
 const path=new URL(request.url).pathname;
 if(path==='/auth/trakr/callback')return finishTrakrConnection(request,env);
 if(path==='/auth/ga4/callback')return finishGA4Connection(request,env,{exchange});
 if(['/auth/form.js','/auth/password','/auth/recover','/auth/mfa','/auth/setup'].includes(path))return handleVoyagePassword(request,env,{audit,readJson});
 if(path==='/login'&&request.method==='GET')return accountPage(env);
 if(path==='/auth/google'||path==='/auth/google/callback')return handleGoogleLogin(request,env,{audit,verifyGoogle,exchange});
 return json({error:'Not found'},404);
}
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function googleMember(idToken,env,nonce,verify=jwtVerify){
 const {payload}=await verify(idToken,googleKeys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,requiredClaims:['exp','iat','sub','email','email_verified','nonce']});
 if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.email!=='string'||!payload.sub)throw Error('Google identity was not verified');
 return env.DB.prepare('SELECT id,name,role FROM members WHERE email=? AND active=1').bind(payload.email.trim().toLowerCase()).first();
}
async function oauthResponse(response){
 if(!response.ok)throw Error('Google sign-in failed');
 const reader=response.body.getReader(),parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw Error('Invalid identity response');}parts.push(value);}
 const bytes=new Uint8Array(size);let position=0;for(const part of parts){bytes.set(part,position);position+=part.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));
}
async function handleGoogleLogin(request,env,{audit,verifyGoogle,exchange}){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return json({error:'Company sign-in is not configured yet.'},503);
 const url=new URL(request.url),callback=url.origin+'/auth/google/callback';
 const expire='voyage_oauth=; Max-Age=0; Path=/auth/google; Secure; HttpOnly; SameSite=Lax';
 try{
  if(url.pathname==='/auth/google'){
   if(!await limit(env.DB,'oauth-ip:'+String(request.headers.get('cf-connecting-ip')||'unknown'),30))return json({error:'Too many sign-in attempts. Try again in 15 minutes.'},429);
   const state=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
   await env.DB.prepare('DELETE FROM login_limits WHERE window_start < ?').bind(Date.now()-86400000).run();
   await env.DB.prepare('DELETE FROM oauth_logins WHERE expires_at < ?').bind(Date.now()).run();
   await env.DB.prepare('INSERT INTO oauth_logins(state_hash,nonce,verifier,expires_at,remember_device) VALUES(?,?,?,?,?)').bind(hash(state),nonce,verifier,Date.now()+600000,url.searchParams.get('remember')==='1'?1:0).run();
   const destination=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   destination.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:randomChallenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
   return new Response(null,{status:303,headers:{location:destination.toString(),'cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':`voyage_oauth=${state}; Max-Age=600; Path=/auth/google; Secure; HttpOnly; SameSite=Lax`}});
  }
  const state=url.searchParams.get('state')||'',cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('voyage_oauth='))?.slice(13)||'';
  if(!/^[a-f0-9]{64}$/.test(state)||cookie.length!==64||!timingSafeEqual(Buffer.from(state),Buffer.from(cookie)))throw Error('Sign-in expired');
  const login=await env.DB.prepare('DELETE FROM oauth_logins WHERE state_hash=? AND expires_at>? RETURNING nonce,verifier,remember_device').bind(hash(state),Date.now()).first();
  const code=url.searchParams.get('code');if(!login||!code||code.length>4096)throw Error('Sign-in expired');
   const token=await oauthResponse(await exchange('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code',code,code_verifier:login.verifier}),redirect:'manual',...timeoutOption()}));
  const member=await verifyGoogle(token.id_token,env,login.nonce);if(!member)return json({error:'This Google account does not have company access.'},403,{'set-cookie':expire});
  const session=randomBytes(32).toString('hex'),now=Date.now(),remember=login.remember_device===1,maxAge=remember?15552000:43200;
  await env.DB.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash(session),member.id,now+maxAge*1000,now).run();
  await audit(env,member.id,'Signed in',null,null,'Google account');
  return new Response(null,{status:303,headers:{location:'/', 'cache-control':'private, no-store','referrer-policy':'no-referrer','set-cookie':`voyage_session=${session}; ${remember?'Max-Age='+maxAge+'; ':''}Path=/; Secure; HttpOnly; SameSite=Lax`}});
 }catch{return json({error:'Google sign-in could not finish. Return to the sign-in page and try again.'},401,{'set-cookie':expire});}
}
const randomChallenge=verifier=>createHash('sha256').update(verifier).digest('base64url');
