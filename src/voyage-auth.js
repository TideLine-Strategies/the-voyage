import {scryptAsync} from '@noble/hashes/scrypt.js';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const headers={'content-type':'application/json','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(x,status=200)=>Response.json(x,{status,headers});
export async function passwordHash(password,salt){return Buffer.from(await scryptAsync(password,salt,{N:32768,r:8,p:3,dkLen:32,maxmem:64*1024*1024})).toString('hex');}
async function allowed(db,key,max){const window=Math.floor(Date.now()/900000)*900000;await db.prepare('INSERT INTO login_limits(bucket,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start').bind(hash('voyage:'+key),window).run();return (await db.prepare('SELECT attempts FROM login_limits WHERE bucket=?').bind(hash('voyage:'+key)).first()).attempts<=max;}
const generic={message:'If this account has Voyage access, a password setup email will arrive shortly.'};
export async function sendPasswordLink(env,email,audit=async()=>{}){
 const member=await env.DB.prepare('SELECT id,email FROM members WHERE lower(email)=? AND active=1').bind(email).first();
 if(!member)return false;
 const raw=token(),now=Date.now(),digest=hash(raw);
 await env.DB.prepare('DELETE FROM voyage_password_links WHERE expires_at<?').bind(now).run();
 await env.DB.prepare('INSERT INTO voyage_password_links(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(digest,member.id,now+3600000,now).run();
 const url='https://voyage.tidelinestrats.com/auth/setup#'+raw;
 const text='Your Voyage account is ready. Set or reset your Voyage password using this private link:\n\n'+url+'\n\nThis link expires in one hour and works once. Your Voyage password is separate from WonPlace. If you did not request this, you can ignore this email.';
 try{if(!env.EMAIL)throw Error('Email unavailable');const receipt=await env.EMAIL.send({from:{email:'voyage@accounts.tidelinestrats.com',name:'TideLine · Voyage'},to:member.email,subject:'Set up your Voyage password',text,html:'<p>Your Voyage account is ready.</p><p><a href="'+url+'">Set your Voyage password</a></p><p>This private link expires in one hour and works once. Your Voyage password is separate from WonPlace. Ignore this email if you did not request it.</p>'});if(!receipt?.messageId)throw Error('No email receipt');await env.DB.prepare("UPDATE voyage_password_links SET delivery='accepted',message_id=? WHERE token_hash=?").bind(receipt.messageId,digest).run();await audit(env,member.id,'Voyage password email accepted',null,null,null);return true;}catch{await env.DB.prepare("UPDATE voyage_password_links SET delivery='uncertain' WHERE token_hash=?").bind(digest).run();return false;}
}
export function loginPage(env={},setup=false){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${setup?'Set password':'Sign in'} · Voyage</title><style>body{font:16px system-ui;background:#0c1020;color:#f1f6fa;min-height:100vh;display:grid;place-content:center;margin:0;padding:24px}main{width:min(400px,85vw)}p{line-height:1.5;color:#b6c3d2}label{display:block;margin:16px 0}input,button,a.google{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:9px}input{margin-top:6px}button,a.google{background:#ed5266;color:white;border:0;cursor:pointer}a.google{display:block;text-align:center;text-decoration:none;background:#233149}details{margin-top:24px}a{color:#9bccff}</style><main><h1>The Voyage</h1><h2>${setup?'Set your Voyage password':'Sign in to Voyage'}</h2><p>Your Voyage account and password are independent of WonPlace.</p>${setup?'<form data-path="/auth/setup"><label>New password<input name="password" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><label>Confirm password<input name="confirm" type="password" minlength="15" maxlength="128" autocomplete="new-password" required></label><p>Use at least 15 characters.</p><button>Save Voyage password</button><p role="status"></p></form>':`${env.GOOGLE_CLIENT_ID?'<a class="google" href="/auth/google">Sign in with Google</a>':''}<form data-path="/auth/password"><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Voyage password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><button>Sign in</button><p role="status"></p></form><details><summary>First visit or forgot your password?</summary><form data-path="/auth/recover"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label><button>Email a password setup link</button><p role="status"></p></form></details>`}</main><script src="/auth/form.js"></script></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});}
export const formScript=`let setupToken=location.hash.slice(1);if(setupToken)history.replaceState(null,'',location.pathname);for(const form of document.querySelectorAll('form'))form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[role=status]'),data=Object.fromEntries(new FormData(form)),path=form.dataset.path;button.disabled=true;try{if(path==='/auth/setup'){if(data.password!==data.confirm)throw Error('Passwords must match.');data.token=setupToken;delete data.confirm;}const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'}),body=await r.json();if(!r.ok)throw Error(body.error||'Please try again.');if(path==='/auth/password')location.replace('/');else if(path==='/auth/setup'){setupToken='';form.replaceChildren();const p=document.createElement('p');p.textContent='Your Voyage password is saved.';const a=document.createElement('a');a.href='/login';a.textContent='Continue to sign in';form.append(p,a);}else status.textContent=body.message;}catch(err){status.textContent=err.message;}finally{button.disabled=false;}});`;
export async function handleVoyagePassword(request,env,{readJson=r=>r.json(),audit=async()=>{}}={}){
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/auth/setup')return loginPage(env,true);
 if(request.method==='GET'&&path==='/auth/form.js')return new Response(formScript,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origin not allowed'},403);
 try{
 if(!await allowed(env.DB,'ip:'+String(request.headers.get('cf-connecting-ip')||'unknown'),20))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
 const data=await readJson(request),email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
 if(path==='/auth/mfa')return json({error:'Use your independent Voyage account.'},410);
 if(path==='/auth/setup'){
 if(!/^[a-f0-9]{64}$/.test(data.token||''))return json({error:'This link is invalid or expired. Request a new one.'},400);
 if(typeof data.password!=='string'||data.password.length<15||data.password.length>128)return json({error:'Use a password between 15 and 128 characters.'},400);
 const link=await env.DB.prepare('SELECT l.member_id FROM voyage_password_links l JOIN members m ON m.id=l.member_id WHERE l.token_hash=? AND l.expires_at>? AND m.active=1').bind(hash(data.token),Date.now()).first();
 if(!link)return json({error:'This link is invalid or expired. Request a new one.'},400);
 const salt=token(),derived=await passwordHash(data.password,salt),now=Date.now(),digest=hash(data.token);
 const results=await env.DB.batch([
 env.DB.prepare('INSERT INTO voyage_credentials(member_id,salt,password_hash,updated_at) SELECT l.member_id,?,?,? FROM voyage_password_links l JOIN members m ON m.id=l.member_id WHERE l.token_hash=? AND l.expires_at>? AND m.active=1 ON CONFLICT(member_id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,updated_at=excluded.updated_at').bind(salt,derived,now,digest,now),
 env.DB.prepare('DELETE FROM sessions WHERE member_id IN (SELECT member_id FROM voyage_password_links WHERE token_hash=? AND expires_at>?)').bind(digest,now),
 env.DB.prepare('DELETE FROM voyage_password_links WHERE member_id IN (SELECT member_id FROM voyage_password_links WHERE token_hash=? AND expires_at>?)').bind(digest,now)]);
 if(!results[0].meta.changes)return json({error:'This link was already used. Request a new one.'},400);
 await audit(env,link.member_id,'Voyage password changed',null,null,null);return json({ok:true});
 }
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return json({error:'Enter a valid email.'},400);
 if(!await allowed(env.DB,'email:'+email,path==='/auth/recover'?3:10))return path==='/auth/recover'?json(generic):json({error:'Too many attempts. Try again in 15 minutes.'},429);
 if(path==='/auth/recover'){await sendPasswordLink(env,email,audit);return json(generic);}
 if(path!=='/auth/password')return json({error:'Not found'},404);
 if(typeof data.password!=='string'||!data.password.length||data.password.length>128)return json({error:'Email or Voyage password is incorrect.'},401);
 const row=await env.DB.prepare('SELECT m.id,c.salt,c.password_hash FROM members m JOIN voyage_credentials c ON c.member_id=m.id WHERE lower(m.email)=? AND m.active=1').bind(email).first();
 const derived=await passwordHash(data.password,row?.salt||'0'.repeat(64));
 if(!row||!timingSafeEqual(Buffer.from(derived,'hex'),Buffer.from(row.password_hash,'hex')))return json({error:'Email or Voyage password is incorrect.'},401);
 const raw=token(),now=Date.now();const issued=await env.DB.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) SELECT ?,m.id,?,? FROM members m JOIN voyage_credentials c ON c.member_id=m.id WHERE m.id=? AND m.active=1 AND c.password_hash=?').bind(hash(raw),now+180*86400000,now,row.id,row.password_hash).run();if(!issued.meta.changes)return json({error:'Credentials changed. Please sign in again.'},401);await audit(env,row.id,'Signed in',null,null,'Voyage password');
 return new Response(JSON.stringify({ok:true}),{headers:{...headers,'set-cookie':`voyage_session=${raw}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`}});
 }catch{return json({error:'Voyage sign-in is temporarily unavailable. Please try again.'},503);}
}
