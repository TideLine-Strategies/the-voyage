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
export function accountPage(env={}){
 const configured=!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),passwordConfigured=!!(env.ACCOUNT_AUTH_URL&&env.ACCOUNT_AUTH_PUBLIC_KEY);
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · The Voyage</title><style>body{font:16px system-ui;background:#071726;color:#f1f6fa;min-height:100vh;display:grid;place-content:center;margin:0;padding:24px}main{width:min(380px,85vw)}a{display:block;background:#42b6d4;color:#071726;border-radius:8px;padding:14px;text-align:center;font-weight:700;text-decoration:none}p{line-height:1.5}label{display:block;margin:14px 0}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:8px}input{margin-top:6px}button{cursor:pointer}</style><main><h1>The Voyage</h1><h2>Sign in to your account</h2>${configured?'<p>Use your company Google account.</p><a href="/auth/google">Sign in with Google</a>':passwordConfigured?'<p>Use your WonPlace staff email and password.</p>':'<p>Company sign-in is being configured. Existing signed-in devices can continue to use Voyage.</p>'}${passwordConfigured?'<form method="post" action="/auth/password"><label>Email<input type="email" name="email" autocomplete="username" maxlength="254" required></label><label>Password<input type="password" name="password" autocomplete="current-password" maxlength="128" required></label><button>Sign in</button><p role="status" data-auth-status></p></form><details><summary>Forgot your password?</summary><p>This uses your WonPlace staff account. Resetting its password also changes your WonPlace sign-in.</p><form method="post" action="/auth/recover"><label>Company email<input type="email" name="email" autocomplete="username" maxlength="254" required></label><button>Send recovery email</button><p role="status" data-auth-status></p></form></details>':''}<p>Your company account permissions determine what you can access.</p></main><script src="/auth/form.js"></script></html>`,{status:configured||passwordConfigured?200:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
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
 if(path==='/auth/form.js'&&request.method==='GET')return new Response(accountFormScript,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path==='/auth/password'||path==='/auth/recover'||path==='/auth/mfa')return handlePassword(request,env,{audit,readJson,exchange});
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
   await env.DB.prepare('INSERT INTO oauth_logins(state_hash,nonce,verifier,expires_at) VALUES(?,?,?,?)').bind(hash(state),nonce,verifier,Date.now()+600000).run();
   const destination=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   destination.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:randomChallenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
   return new Response(null,{status:303,headers:{location:destination.toString(),'cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':`voyage_oauth=${state}; Max-Age=600; Path=/auth/google; Secure; HttpOnly; SameSite=Lax`}});
  }
  const state=url.searchParams.get('state')||'',cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('voyage_oauth='))?.slice(13)||'';
  if(!/^[a-f0-9]{64}$/.test(state)||cookie.length!==64||!timingSafeEqual(Buffer.from(state),Buffer.from(cookie)))throw Error('Sign-in expired');
  const login=await env.DB.prepare('DELETE FROM oauth_logins WHERE state_hash=? AND expires_at>? RETURNING nonce,verifier').bind(hash(state),Date.now()).first();
  const code=url.searchParams.get('code');if(!login||!code||code.length>4096)throw Error('Sign-in expired');
   const token=await oauthResponse(await exchange('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code',code,code_verifier:login.verifier}),redirect:'manual',...timeoutOption()}));
  const member=await verifyGoogle(token.id_token,env,login.nonce);if(!member)return json({error:'This Google account does not have company access.'},403,{'set-cookie':expire});
  const session=randomBytes(32).toString('hex'),now=Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash(session),member.id,now+180*86400000,now).run();
  await audit(env,member.id,'Signed in',null,null,'Google account');
  return new Response(null,{status:303,headers:{location:'/', 'cache-control':'private, no-store','referrer-policy':'no-referrer','set-cookie':`voyage_session=${session}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`}});
 }catch{return json({error:'Google sign-in could not finish. Return to the sign-in page and try again.'},401,{'set-cookie':expire});}
}
const randomChallenge=verifier=>createHash('sha256').update(verifier).digest('base64url');

const accountFormScript=`for(const form of document.querySelectorAll('form')){let challenge=null;form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-auth-status]');button.disabled=true;status.textContent='';try{const body=challenge?{token:challenge.challengeToken,factorId:challenge.factorId,code:form.querySelector('[name=code]').value}:Object.fromEntries(new FormData(form));const response=await fetch(challenge?'/auth/mfa':form.action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error||'Sign-in is unavailable.');if(data.mfaRequired){challenge=data;form.querySelector('[name=password]').value='';const label=document.createElement('label');label.textContent='Authenticator code';const input=document.createElement('input');input.name='code';input.autocomplete='one-time-code';input.inputMode='numeric';input.pattern='[0-9]{6}';input.required=true;label.append(input);form.querySelector('[name=password]').required=false;form.insertBefore(label,button);button.textContent='Verify and sign in';input.focus();}else if(form.action.endsWith('/recover'))status.textContent=data.message;else{challenge=null;location.replace('/')}}catch(error){status.textContent=error.message}finally{button.disabled=false}});}`;
async function handlePassword(request,env,{audit,readJson,exchange}){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin not allowed'},403);
 if(!env.ACCOUNT_AUTH_URL||!env.ACCOUNT_AUTH_PUBLIC_KEY)return json({error:'Account sign-in is not configured.'},503);
 let stage='provider-config';
 try{
  const provider=new URL(env.ACCOUNT_AUTH_URL);if(provider.protocol!=='https:'||!provider.hostname.endsWith('.supabase.co')||provider.pathname!=='/'||provider.search||provider.hash||provider.username)throw Error('Invalid provider');
  stage='rate-limit-ip';
  if(!await limit(env.DB,'account-ip:'+String(request.headers.get('cf-connecting-ip')||'unknown'),20))return json({error:'Too many attempts. Try again in 15 minutes.'},429,{'retry-after':'900'});
  if(new URL(request.url).pathname==='/auth/mfa')return completeMfa(request,env,{audit,readJson,exchange},provider);
  stage='request-body';
  const data=await readJson(request),email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(!email||email.length>254)return json({error:'Enter your company email.'},400);
  const recover=new URL(request.url).pathname==='/auth/recover';
  stage='rate-limit-account';
  if(!await limit(env.DB,'account-email:'+email,recover?3:10))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
  stage='member-lookup';
  const member=await env.DB.prepare('SELECT id,name,role FROM members WHERE email=? AND active=1').bind(email).first();
  if(recover){
   if(member){
    stage='provider-recovery';
    const target=new URL('/auth/v1/recover',provider);target.searchParams.set('redirect_to',env.ACCOUNT_RECOVERY_URL);
    const response=await exchange(target.toString(),{method:'POST',headers:{apikey:env.ACCOUNT_AUTH_PUBLIC_KEY,'content-type':'application/json'},body:JSON.stringify({email}),redirect:'manual',...timeoutOption()});
    if(!response.ok)return json({error:'Recovery email is temporarily unavailable. Try again later.'},503);
   }
   return json({ok:true,message:'If this account can recover access, a recovery email has been requested. Check your inbox.'});
  }
  if(typeof data.password!=='string'||data.password.length<1||data.password.length>128)return json({error:'Enter your account password.'},400);
  stage='provider-password';
  const response=await exchange(new URL('/auth/v1/token?grant_type=password',provider).toString(),{method:'POST',headers:{apikey:env.ACCOUNT_AUTH_PUBLIC_KEY,'content-type':'application/json'},body:JSON.stringify({email,password:data.password}),redirect:'manual',...timeoutOption()});
  if(!response.ok)return json({error:response.status===429?'Too many sign-in attempts. Try again later.':'Email or password is incorrect.'},response.status===429?429:401);
  const result=await oauthResponse(response);
  if(!member||!result.user?.id||!result.user?.email_confirmed_at||result.user.email?.toLowerCase()!==email)return json({error:'Email or password is incorrect.'},401);
  const factors=(result.user.factors||[]).filter(f=>f.status==='verified');
  if(factors.length){const factor=factors.find(f=>f.factor_type==='totp');if(!factor||!result.access_token)return json({error:'Use Google sign-in or your supported company verification method.'},403);return json({mfaRequired:true,challengeToken:result.access_token,factorId:factor.id});}
  // Never persist provider access/refresh tokens. Only create the existing Voyage session.
  const session=randomBytes(32).toString('hex'),now=Date.now();
  await env.DB.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash(session),member.id,now+180*86400000,now).run();
  await audit(env,member.id,'Signed in',null,null,'Company account password');
  return json({ok:true},200,{'set-cookie':`voyage_session=${session}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`});
 }catch(error){
  console.error(JSON.stringify({event:'account_signin_failure',route:new URL(request.url).pathname,stage,error:error?.name||'Error',message:String(error?.message||'').slice(0,240)}));
  return json({error:'Account sign-in is temporarily unavailable. Please try again later.'},503);
 }
}

async function completeMfa(request,env,{audit,readJson,exchange},provider){
 const data=await readJson(request);
 if(typeof data.token!=='string'||data.token.length>8192||! /^[0-9a-f-]{36}$/i.test(data.factorId||'')||! /^\d{6}$/.test(data.code||''))return json({error:'Enter the six-digit authenticator code.'},400);
 const authHeaders={apikey:env.ACCOUNT_AUTH_PUBLIC_KEY,authorization:'Bearer '+data.token,'content-type':'application/json'};
 const user=await oauthResponse(await exchange(new URL('/auth/v1/user',provider).toString(),{headers:authHeaders,redirect:'manual',...timeoutOption()}));
 const factor=(user.factors||[]).find(f=>f.id===data.factorId&&f.status==='verified'&&f.factor_type==='totp');
 if(!factor||!user.email_confirmed_at)return json({error:'Account verification failed.'},401);
 const member=await env.DB.prepare('SELECT id,name,role FROM members WHERE email=? AND active=1').bind(String(user.email||'').toLowerCase()).first();
 if(!member)return json({error:'Account verification failed.'},401);
 if(!await limit(env.DB,'mfa:'+member.id,10))return json({error:'Too many verification attempts. Try again in 15 minutes.'},429);
 const challenge=await oauthResponse(await exchange(new URL('/auth/v1/factors/'+data.factorId+'/challenge',provider).toString(),{method:'POST',headers:authHeaders,body:'{}',redirect:'manual',...timeoutOption()}));
 const response=await exchange(new URL('/auth/v1/factors/'+data.factorId+'/verify',provider).toString(),{method:'POST',headers:authHeaders,body:JSON.stringify({challenge_id:challenge.id,code:data.code}),redirect:'manual',...timeoutOption()});
 if(!response.ok)return json({error:'Authenticator code is incorrect or expired.'},401);
 const verified=await oauthResponse(response);
 if(verified.user?.id!==user.id||!verified.access_token)return json({error:'Account verification failed.'},401);
 const session=randomBytes(32).toString('hex'),now=Date.now();
 await env.DB.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash(session),member.id,now+180*86400000,now).run();
 await audit(env,member.id,'Signed in',null,null,'Company account password and authenticator');
 return json({ok:true},200,{'set-cookie':`voyage_session=${session}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`});
}
