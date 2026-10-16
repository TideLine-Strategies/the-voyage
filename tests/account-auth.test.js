import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
import {handleAccountAuth,googleMember,accountPage} from '../src/account-auth.js';
import worker from '../src/worker.js';
const origin='https://voyage.example';
const {privateKey,publicKey}=await generateKeyPair('RS256');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}};},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};
 const env={DB,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'},audits=[];
 const deps={audit:async(...args)=>audits.push(args),verifyGoogle:(token,e,nonce)=>googleMember(token,e,nonce,(jwt,keys,options)=>jwtVerify(jwt,publicKey,options))};
 const start=()=>handleAccountAuth(new Request(origin+'/auth/google'),env,deps);
 const callback=(state,cookie,exchange)=>handleAccountAuth(new Request(origin+'/auth/google/callback?code=fake-code&state='+state,{headers:{cookie}}),env,{...deps,exchange});
 return {sqlite,env,start,callback,audits};
}
async function tokenFor(nonce,overrides={}){return new SignJWT({email:'q.stewart@tidelinestrats.com',email_verified:true,nonce,...overrides}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('test-client').setSubject('google-subject').setIssuedAt().setExpirationTime('5m').sign(privateKey);}
async function begin(f){const response=await f.start(),url=new URL(response.headers.get('location'));return {response,url,state:url.searchParams.get('state'),nonce:url.searchParams.get('nonce'),cookie:response.headers.get('set-cookie').split(';')[0]};}
test('regular Google login issues a private session for the original member and private APIs recognize it',async()=>{
 const f=fixture(),b=await begin(f);assert.equal(b.response.status,303);assert.equal(b.url.searchParams.get('code_challenge_method'),'S256');
 const response=await f.callback(b.state,b.cookie,async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.ok(options.body.get('code_verifier'));return Response.json({id_token:await tokenFor(b.nonce)});});
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
 const me=await worker.fetch(new Request(origin+'/api/me',{headers:{cookie:cookie.split(';')[0]}}),f.env);assert.equal((await me.json()).id,'QS');assert.equal(f.audits.length,1);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM oauth_logins').get().n,0);
 const replay=await f.callback(b.state,b.cookie,async()=>{throw Error('must not exchange twice');});assert.equal(replay.status,401);
});
test('forged state, missing browser binding and expired OAuth request never exchange codes',async()=>{
 const f=fixture(),b=await begin(f);let calls=0;const exchange=async()=>{calls++;};
 assert.equal((await f.callback(b.state,'',exchange)).status,401);
 assert.equal((await f.callback('f'.repeat(64),b.cookie,exchange)).status,401);
 f.sqlite.exec('UPDATE oauth_logins SET expires_at=0');assert.equal((await f.callback(b.state,b.cookie,exchange)).status,401);assert.equal(calls,0);
});
test('unverified email, wrong nonce, outsiders and inactive members receive no sessions',async()=>{
 for(const change of [{email_verified:false},{nonce:'other'},{email:'outsider@example.com'},{inactive:true}]){
  const f=fixture(),b=await begin(f);if(change.inactive)f.sqlite.exec("UPDATE members SET active=0 WHERE id='QS'");
  const response=await f.callback(b.state,b.cookie,async()=>Response.json({id_token:await tokenFor(b.nonce,change)}));assert.ok([401,403].includes(response.status));assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0);
 }
});
test('JWT signature and audience are verified, not merely decoded',async()=>{
 const f=fixture();const wrong=await new SignJWT({email:'q.stewart@tidelinestrats.com',email_verified:true,nonce:'nonce'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('other-client').setSubject('sub').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 await assert.rejects(googleMember(wrong,f.env,'nonce',(jwt,keys,options)=>jwtVerify(jwt,publicKey,options)));
 const token=await tokenFor('nonce');const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({email:'forged@example.com'})).toString('base64url');await assert.rejects(googleMember(parts.join('.'),f.env,'nonce',(jwt,keys,options)=>jwtVerify(jwt,publicKey,options)));
});
test('old invitation links cannot create sessions and sign-in attempts are durably bounded',async()=>{
 const f=fixture();const old=await worker.fetch(new Request(origin+'/invite/'+'a'.repeat(43)),f.env);assert.equal(old.status,303);assert.match(old.headers.get('location'),/\/login$/);
 for(let i=0;i<30;i++)assert.equal((await f.start()).status,303);
 assert.equal((await f.start()).status,429);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0);
});
const passwordEnv=f=>({...f.env,ACCOUNT_AUTH_URL:'https://example.supabase.co',ACCOUNT_AUTH_PUBLIC_KEY:'public-key',ACCOUNT_RECOVERY_URL:'https://wonplace.example/'});
const passwordRequest=(path,body,originHeader=origin)=>new Request(origin+path,{method:'POST',headers:{origin:originHeader,'content-type':'application/json'},body:JSON.stringify(body)});
test('password sign-in verifies confirmed provider identity, keeps Voyage role, and discards provider tokens',async()=>{
 const f=fixture();let sent;
 const response=await handleAccountAuth(passwordRequest('/auth/password',{email:'q.stewart@tidelinestrats.com',password:'synthetic-password'}),passwordEnv(f),{readJson:r=>r.json(),audit:async()=>{},exchange:async(url,options)=>{sent={url,options};return Response.json({access_token:'provider-access-secret',refresh_token:'provider-refresh-secret',user:{id:'provider-id',email:'q.stewart@tidelinestrats.com',email_confirmed_at:'2026-01-01'}});}});
 assert.equal(response.status,200);assert.equal(sent.url,'https://example.supabase.co/auth/v1/token?grant_type=password');assert.doesNotMatch(await response.text(),/provider-access|provider-refresh/);
 const me=await worker.fetch(new Request(origin+'/api/me',{headers:{cookie:response.headers.get('set-cookie').split(';')[0]}}),f.env);assert.equal((await me.json()).role,'edit');
});
test('wrong credentials, unconfirmed or mismatched identities and unapproved accounts cannot sign in',async()=>{
 for(const result of [null,{id:'x',email:'q.stewart@tidelinestrats.com'},{id:'x',email:'other@example.com',email_confirmed_at:'2026-01-01'}]){
  const f=fixture();const response=await handleAccountAuth(passwordRequest('/auth/password',{email:'q.stewart@tidelinestrats.com',password:'synthetic'}),passwordEnv(f),{readJson:r=>r.json(),audit:async()=>{},exchange:async()=>result?Response.json({user:result}):Response.json({error:'bad'},{status:400})});assert.equal(response.status,401);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0);
 }
});
test('password login cannot bypass enabled provider MFA',async()=>{
 const f=fixture(),factor={id:'11111111-1111-4111-8111-111111111111',status:'verified',factor_type:'totp'};
 const user={id:'provider-id',email:'q.stewart@tidelinestrats.com',email_confirmed_at:'2026-01-01',factors:[factor]};
 const response=await handleAccountAuth(passwordRequest('/auth/password',{email:user.email,password:'synthetic'}),passwordEnv(f),{readJson:r=>r.json(),audit:async()=>{},exchange:async()=>Response.json({user,access_token:'ephemeral-provider-token'})});
 assert.equal((await response.json()).mfaRequired,true);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0);
 const paths=[];
 const verified=await handleAccountAuth(passwordRequest('/auth/mfa',{token:'ephemeral-provider-token',factorId:factor.id,code:'123456'}),passwordEnv(f),{readJson:r=>r.json(),audit:async()=>{},exchange:async(url)=>{paths.push(new URL(url).pathname);return Response.json(url.endsWith('/user')?user:url.endsWith('/challenge')?{id:'challenge-id'}:{user,access_token:'verified-token'});}});
 assert.equal(verified.status,200);assert.equal(paths.length,3);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,1);assert.doesNotMatch(await verified.text(),/verified-token/);
});
test('recovery uses configured first-party destination and does not create sessions or reveal unknown accounts',async()=>{
 const f=fixture();let sends=0;
 const deps={readJson:r=>r.json(),audit:async()=>{},exchange:async(url)=>{sends++;assert.equal(new URL(url).searchParams.get('redirect_to'),'https://wonplace.example/');return Response.json({});}};
 for(const email of ['q.stewart@tidelinestrats.com','outsider@example.com']){
  const response=await handleAccountAuth(passwordRequest('/auth/recover',{email}),passwordEnv(f),deps);assert.equal(response.status,200);assert.match((await response.json()).message,/If this account/);
 }
 assert.equal(sends,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sessions').get().n,0);
 const csrf=await handleAccountAuth(passwordRequest('/auth/password',{},'https://evil.example'),passwordEnv(f),deps);assert.equal(csrf.status,403);
});

test('auth forms never fall back to sending credentials in a URL when JavaScript fails',async()=>{
 const html=await accountPage({ACCOUNT_AUTH_URL:'https://example.supabase.co',ACCOUNT_AUTH_PUBLIC_KEY:'public-key'}).text();
 const forms=[...html.matchAll(/<form\b[^>]*>/g)];assert.equal(forms.length,2);
 for(const [form] of forms)assert.match(form,/method="post"/);
});
