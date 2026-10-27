import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleCompanyTickets,ticketFields,decodeScreenshot} from '../src/company-tickets.js';
const id='11111111-1111-4111-8111-111111111111',actor={id:'QS',name:'Quan',role:'edit'};
function db(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,PRIMARY KEY(collection,id))');return {prepare(query){return {bind(...values){return {async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};}};},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
function request(env,method='GET',suffix='',body,company='wonplace',user=actor){const path=['api','company-tickets',...suffix.split('/').filter(Boolean)];return handleCompanyTickets(new Request('https://voyage.example/api/company-tickets/'+suffix+'?company='+company,{method,...body?{body:JSON.stringify(body)}:{}}),env,user,path);}
const png=btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0));
test('editor-only CRUD, persisted fields, notes, history, optimistic conflict and recoverable trash',async()=>{
 const env={DB:db()};assert.equal((await request(env,'GET','',null,'wonplace',{role:'guest'})).status,403);
 let r=await request(env,'POST','',{id,title:'Attendance freezes',priority:'high',steps:'Open roster',links:'https://github.com/example/repo/pull/1'});assert.equal(r.status,201);let t=(await r.json()).issue;assert.equal(t.revision,1);
 r=await request(env,'PATCH',id,{title:'Attendance repaired',status:'in_review',assignee:'Cody',expectedRevision:1});t=(await r.json()).issue;assert.equal(t.assignee,'Cody');assert.equal(t.revision,2);
 assert.equal((await request(env,'PATCH',id,{title:'stale overwrite',expectedRevision:1})).status,409);
 t=(await(await request(env,'PATCH',id,{note:'Verified tablet reproduction',expectedRevision:2})).json()).issue;assert.equal(t.notes[0].by,'Quan');assert.equal(t.history.length,3);
 t=(await(await request(env,'DELETE',id,{expectedRevision:3})).json()).issue;assert.equal(t.deleted,true);
 assert.equal((await request(env,'PATCH',id,{title:'hidden edit',expectedRevision:4})).status,409);
 t=(await(await request(env,'PATCH',id,{restore:true,expectedRevision:4})).json()).issue;assert.equal(t.deleted,false);assert.equal(t.title,'Attendance repaired');
 const listed=await(await request(env)).json();assert.equal(listed.items.length,1);
});
test('screenshots are private, product-bound, validated and revisioned with parent',async()=>{
 const env={DB:db()};await request(env,'POST','',{id,title:'Evidence'});
 let t=(await(await request(env,'POST',id+'/attachments',{name:'screen.png',data:png,expectedRevision:1})).json()).issue;assert.equal(t.attachments.length,1);const file=t.attachments[0].id;
 let image=await request(env,'GET',id+'/attachments/'+file);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.match(image.headers.get('cache-control'),/no-store/);
 assert.equal((await request(env,'GET',id+'/attachments/'+file,null,'tideline')).status,404);
 assert.equal((await request(env,'GET',id+'/attachments/'+file,null,'wonplace',{role:'guest'})).status,403);
 assert.equal((await request(env,'POST',id+'/attachments',{name:'old.png',data:png,expectedRevision:1})).status,409);
 t=(await(await request(env,'GET',id)).json()).issue;assert.equal(t.attachments.length,1);
 assert.equal((await request(env,'DELETE',id+'/attachments/'+file,{expectedRevision:2})).status,200);
 assert.equal((await request(env,'GET',id+'/attachments/'+file)).status,404);
 assert.equal((await env.DB.prepare('SELECT data_json FROM documents WHERE collection=?').bind('company_ticket_images').all()).results.length,0);
});
test('same ID can exist in different products; source triage is idempotent and original reports untouched',async()=>{
 const env={DB:db()};await request(env,'POST','',{id,sourceId:id,title:'WonPlace report'});await request(env,'POST','',{id,sourceId:id,title:'Duplicate should not overwrite'});await request(env,'POST','',{id,title:'TideLine task'},'tideline');
 assert.equal((await(await request(env)).json()).items.length,1);assert.equal((await(await request(env,'GET',id)).json()).issue.title,'WonPlace report');assert.equal((await(await request(env,'GET',id,null,'tideline')).json()).issue.title,'TideLine task');
 assert.equal((await request(env,'POST','',{id,sourceId:id,title:'Wrong product'},'loki')).status,400);
});
test('validation rejects oversized content, malformed routes and executable screenshots or links',async()=>{
 assert.throws(()=>ticketFields({title:''}));assert.throws(()=>ticketFields({links:'javascript:alert(1)'}));assert.throws(()=>ticketFields({status:'invented'}));assert.throws(()=>ticketFields({description:'x'.repeat(12001)}));assert.throws(()=>decodeScreenshot({name:'bad.svg',data:btoa('<svg onload="alert(1)"></svg>')}));
 const env={DB:db()};assert.equal((await request(env,'POST','',{id,title:'x'.repeat(50000)})).status,413);assert.equal((await request(env,'GET','../secret')).status,404);assert.equal((await request(env,'GET','',null,'unknown')).status,400);
});
