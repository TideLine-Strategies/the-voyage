// Actual workerd Request/fetch validation; mock the network only after runtime construction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {passwordHash} from '../src/voyage-auth.js';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const built=await build({entryPoints:['src/entry.js'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],target:'es2022'});
let calls=[];let redirect=false;
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-29',compatibilityFlags:['nodejs_compat'],durableObjects:{COMPANY_HUB:{className:'CompanyHub',useSQLite:true}},d1Databases:{DB:'auth'},bindings:{ACCOUNT_AUTH_URL:'https://fixture.supabase.co',ACCOUNT_AUTH_PUBLIC_KEY:'synthetic-public-key',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',WONPLACE_TICKETS_ORIGIN:'https://wonplace.example',WONPLACE_TICKETS_SECRET:'synthetic-source-secret-000000000000'},outboundService:async request=>{const u=new URL(request.url);if(u.hostname==='fixture.supabase.co'&&u.pathname==='/auth/v1/token'){calls.push('password');return redirect?new Response(null,{status:302,headers:{location:'https://outsider.example/capture'}}):Response.json({error:'invalid credentials'},{status:400});}if(u.hostname==='oauth2.googleapis.com'){calls.push('google');return Response.json({error:'invalid_grant'},{status:400});}if(u.hostname==='wonplace.example'&&u.pathname==='/api/integrations/voyage/tickets'){calls.push('tickets');return Response.json({items:[{code:'ISS-FIXTURE'}],nextOffset:null});}if(u.hostname==='wonplace.example')return Response.json({company:'wonplace',diagnostics:{incidents:[]},aiUsage:[]});throw Error('Unexpected outbound destination');}}));
try{
 const db=await mf.getD1Database('DB');for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort()){for(const sql of fs.readFileSync('migrations/'+name,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();}
 const origin='https://voyage.example';
 const password=()=>mf.dispatchFetch(origin+'/auth/password',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'no-account@example.invalid',password:'synthetic-invalid'})});
 let r=await password();assert.equal(r.status,401);assert(!calls.includes('password'));assert.match((await r.json()).error,/incorrect/);
 const salt='a'.repeat(64),validPassword='runtime Voyage password only';await db.prepare('INSERT INTO voyage_credentials(member_id,salt,password_hash,updated_at) VALUES(?,?,?,?)').bind('QS',salt,await passwordHash(validPassword,salt),Date.now()).run();r=await mf.dispatchFetch(origin+'/auth/password',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'q.stewart@tidelinestrats.com',password:validPassword})});assert.equal(r.status,200);assert(r.headers.get('set-cookie'));assert(!calls.includes('password'));
 redirect=true;r=await password();assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
 const start=await mf.dispatchFetch(origin+'/auth/google',{redirect:'manual'}),url=new URL(start.headers.get('location')||(()=>{throw Error('OAuth start '+start.status)})()),cookie=start.headers.get('set-cookie').split(';')[0];
 r=await mf.dispatchFetch(origin+'/auth/google/callback?state='+url.searchParams.get('state')+'&code=synthetic-invalid',{headers:{cookie}});assert.equal(r.status,401);assert(calls.includes('google'));
 const token='c'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');await db.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,'QS',Date.now()+60000,Date.now()).run();
 r=await mf.dispatchFetch(origin+'/api/companies/wonplace/source',{headers:{cookie:'voyage_session='+token}});assert.equal(r.status,200);assert.equal((await r.json()).connected,true);
 r=await mf.dispatchFetch(origin+'/api/tickets',{headers:{cookie:'voyage_session='+token}});assert.equal(r.status,200);assert.equal((await r.json()).items[0].code,'ISS-FIXTURE');assert(calls.includes('tickets'));
 console.log(JSON.stringify({ticketsSourceRead:true,accepted:true,actualWorkerdFetch:true,independentPasswordVerified:true,googleTokenProviderReached:true,redirectNotFollowed:true,companySourceRead:true}));
}finally{await mf.dispose();}
