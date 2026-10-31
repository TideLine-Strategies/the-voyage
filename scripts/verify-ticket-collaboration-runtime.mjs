import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {signedHeaders} from '../src/company-signing.js';
const built=await build({entryPoints:['src/entry.js'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],target:'es2022'});
const secret='synthetic-collaboration-secret-000000000000',origin='https://voyage.example',runtime='33333333-3333-4333-8333-333333333333',ticket='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',ids=['123456abcdef','abcdef123456'];
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-29',compatibilityFlags:['nodejs_compat'],durableObjects:{COMPANY_HUB:{className:'CompanyHub',useSQLite:true}},d1Databases:{DB:'collab'},bindings:{VOYAGE_OPERATIONS_SECRET:secret}}));
const sockets=[];
try{
 const db=await mf.getD1Database('DB');for(const name of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync('migrations/'+name,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 for(const id of [ticket,other])await db.prepare('INSERT INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?)').bind('company_tickets','voyage:'+id,JSON.stringify({id,title:'Runtime collaboration '+id.slice(0,4),description:'Original',status:'open',notes:[],history:[],attachments:[]}),Date.now()).run();
 for(const id of ids)await db.prepare('INSERT INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?)').bind('company_ticket_tasks','voyage:'+id,JSON.stringify({taskId:id,runtimeId:runtime,ticket,company:'voyage',requestedBy:'QS',agent:'codex',snapshot:{state:'working'}}),Date.now()).run();
 const token='c'.repeat(64),hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');await db.prepare('INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,'QS',Date.now()+3600000,Date.now()).run();const cookie='voyage_session='+token;
 const call=async(action,data={},id=ids[0],signed=true)=>{const url=origin+'/api/company-ticket-collaboration/voyage',body=JSON.stringify({action,taskId:id,runtimeId:runtime,...data});return mf.dispatchFetch(url,{method:'POST',headers:signed?await signedHeaders(secret,'POST',url,'test',body):{},body});};
 assert.equal((await call('read',{},ids[0],false)).status,401);assert.equal((await call('read',{runtimeId:'bad'})).status,403);assert.equal((await mf.dispatchFetch(origin+'/api/ticket-collaboration?company=voyage')).status,403);
 for(let n=0;n<2;n++){const r=await mf.dispatchFetch(origin+'/api/ticket-collaboration/live?company=voyage',{headers:{cookie,origin,upgrade:'websocket'}});assert.equal(r.status,101);r.webSocket.accept();sockets.push(r.webSocket);}
 const received=[];sockets[1].addEventListener('message',e=>received.push(JSON.parse(e.data)));
 const draft=(text)=>({field:'description',draft:text,caret:text.length,status:'typing'});
 const results=await Promise.all(ids.map((id,i)=>call('presence',{expectedSequence:0,presence:draft('Draft '+i)},id)));assert.deepEqual(results.map(r=>r.status),[200,200]);
 const read=await(await call('read')).json();assert.equal(read.workspace.tasks.length,2);assert.deepEqual(read.workspace.tasks.map(t=>t.draft).sort(),['Draft 0','Draft 1']);assert.equal(read.issue.description,'Original');
 assert.equal((await call('presence',{expectedSequence:0,presence:draft('Stale overwrite')})).status,409);
 assert.equal((await call('presence',{expectedSequence:1,presence:{field:'password',draft:'bad'}})).status,400);
 assert.equal((await call('save',{expectedRevision:1,patch:{description:'First saved'}})).status,200);
 assert.equal((await call('save',{expectedRevision:1,patch:{description:'Overwrite'}},ids[1])).status,409);
 const latest=await(await call('read',{},ids[1])).json();assert.equal(latest.issue.description,'First saved');assert.equal(latest.workspace.tasks.find(t=>t.taskId===ids[1]).draft,'Draft 1');assert.equal(latest.workspace.tasks.find(t=>t.taskId===ids[1]).status,'conflict');assert.equal(latest.issue.history.at(-1).author.kind,'agent');assert.equal(latest.issue.history.at(-1).taskId,ids[0]);
 assert.equal((await call('save',{expectedRevision:latest.issue.revision,patch:{humanReviews:[]}})).status,400);
 assert.equal((await call('save',{expectedRevision:latest.issue.revision,patch:{description:'Reconciled'}},ids[1])).status,200);
 assert.equal((await call('read',{ticket:other})).status,400);
 await new Promise(r=>setTimeout(r,100));assert(received.some(d=>d.tasks?.length===2));
 const wrongOrigin=await mf.dispatchFetch(origin+'/api/ticket-collaboration/live?company=voyage',{headers:{cookie,origin:'https://evil.example',upgrade:'websocket'}});assert.equal(wrongOrigin.status,403);
 await db.prepare("UPDATE members SET active=0 WHERE id='QS'").run();assert.equal((await call('read')).status,403);
 console.log(JSON.stringify({accepted:true,actualWorkerd:true,twoIndependentTasks:true,twoLiveSubscribers:true,staleSaveRejected:true,conflictDraftRetained:true,agentAttribution:true,ownerRevocation:true,productAndTicketScope:true}));
}finally{for(const socket of sockets)socket.close();await mf.dispose();}
