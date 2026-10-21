import assert from 'node:assert/strict';import fs from 'node:fs';import {build} from 'esbuild';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const built=await build({entryPoints:['src/entry.js'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],target:'es2022'});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-29',compatibilityFlags:['nodejs_compat'],durableObjects:{COMPANY_HUB:{className:'CompanyHub',useSQLite:true}},d1Databases:{DB:'crm',TIDELINE_DB:'site'},outboundService:()=>{throw Error('Intake must not send outbound messages')}}));
try{
 const db=await mf.getD1Database('DB'),site=await mf.getD1Database('TIDELINE_DB');
 for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync('migrations/'+name,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 for(const sql of fs.readFileSync('tests/fixtures/tideline-source.sql','utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await site.prepare(sql).run();
 const token='d'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');await db.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,'QS',Date.now()+60000,Date.now()).run();
 const origin='https://voyage.example',headers={cookie:'voyage_session='+token,origin,'content-type':'application/json'},id=crypto.randomUUID();
 await site.prepare('INSERT INTO contact_inquiries(id,submitted_at,name,business,email,message) VALUES(?,?,?,?,?,?)').bind(id,new Date().toISOString(),'Synthetic owner','Synthetic service','owner@example.invalid','No outreach; runtime fixture').run();
 assert.equal((await mf.dispatchFetch(origin+'/api/tideline/analytics')).status,403);
 let r=await mf.dispatchFetch(origin+'/api/tideline/import',{method:'POST',headers,body:JSON.stringify({kind:'contact',id})});assert.equal(r.status,200);assert.equal((await r.json()).status,'linked');
 r=await mf.dispatchFetch(origin+'/api/tideline/import',{method:'POST',headers,body:JSON.stringify({kind:'contact',id})});assert.equal(r.status,200);
 const summary=await(await mf.dispatchFetch(origin+'/api/tideline/analytics',{headers})).json();assert.equal(summary.inquiries[0].syncStatus,'linked');assert.equal(summary.pipeline.accounts,1);assert.equal(summary.coverage.conversionTracking,true);
 assert.equal((await db.prepare("SELECT count(*) n FROM documents WHERE collection='notes'").first()).n,1);
 console.log(JSON.stringify({accepted:true,actualWorkerd:true,realD1Bindings:true,crmLinkAndReadback:true,duplicateSafe:true,anonymousDenied:true,outboundMessages:0}));
}finally{await mf.dispose();}
