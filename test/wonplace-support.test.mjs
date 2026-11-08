import test from 'node:test';import assert from 'node:assert/strict';import {supportPolicy,supportCall,drainSupportIntake,forwardSupportDelivery} from '../src/wonplace-support.js';
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
test('automation defaults off and does not touch existing work',async()=>{assert.deepEqual(await drainSupportIntake({},uuid(1),()=>{throw Error('No network');}),{enabled:false});});
test('dev investigation cannot inherit production authority from report text',()=>{const text=supportPolicy({id:uuid(1),support:{kind:'investigate'}});assert.match(text,/Delivery is dev only/);assert.match(text,/untrusted evidence/);assert.match(text,/specific button clicks/);assert.match(text,/support-delivery.mjs/);assert.match(text,/exact dev workflow and provider receipts/);assert.equal(supportPolicy({}),'');});
test('support source is pinned, signed and refuses redirects or non-JSON',async()=>{
 const env={WONPLACE_TICKETS_ORIGIN:'https://premieros-preview.signallabs.workers.dev',WONPLACE_TICKETS_SECRET:'a'.repeat(40)};let observed;
 const result=await supportCall(env,{operation:'poll',runtimeId:uuid(1)},async(url,opt)=>{observed={url,opt};return Response.json({items:[]});});assert.deepEqual(result,{items:[]});assert.equal(observed.url.pathname,'/api/integrations/voyage/support');assert.equal(observed.opt.redirect,'manual');assert.match(observed.opt.headers['x-voyage-signature'],/^[a-f0-9]{64}$/);
 await assert.rejects(supportCall({...env,WONPLACE_TICKETS_ORIGIN:'https://attacker.invalid'},{}),/origin/);await assert.rejects(supportCall(env,{},async()=>new Response('',{status:302})),/unavailable/);
});
test('callbacks require the claiming runtime and exact admitted task',async()=>{
 const job={runtimeId:uuid(1),task:{id:'123456789abc'},support:{kind:'investigate',ticketId:uuid(2),runtimeId:uuid(1),claimToken:uuid(3)}};
 await assert.rejects(forwardSupportDelivery({},job,uuid(9),{operation:'candidate'}),/own/);await assert.rejects(forwardSupportDelivery({},job,uuid(1),{operation:'progress',taskId:'ffffffffffff'}),/Exact admitted/);await assert.rejects(forwardSupportDelivery({},job,uuid(1),{operation:'approval',taskId:'123456789abc'}),/not a release/);await assert.rejects(forwardSupportDelivery({},job,uuid(1),{operation:'released',taskId:'123456789abc'}),/approved release job/);
});
test('changed dev publication rejects a candidate before sending it to the staff desk',async()=>{
 const job={runtimeId:uuid(1),task:{id:'123456789abc'},support:{kind:'investigate',ticketId:uuid(2),runtimeId:uuid(1),claimToken:uuid(3)}};let count=0;
 await assert.rejects(forwardSupportDelivery({},job,uuid(1),{operation:'candidate',taskId:'123456789abc',candidate:{taskId:'123456789abc',devCommit:'a'.repeat(40),checks:{status:'passed'}}},async()=>{count++;return Response.json({commit:'b'.repeat(40)});}),/no longer serves/);assert.equal(count,1);
});
test('manual requests cannot create a second active or uncertain coding job for one ticket',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{handleTicketQueue}=await import('../src/ticket-job-queue.js'),sql=new DatabaseSync(':memory:');
 try{sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,PRIMARY KEY(collection,id));CREATE TABLE members(id TEXT PRIMARY KEY,role TEXT,active INTEGER,email TEXT)');sql.prepare('INSERT INTO members VALUES(?,?,?,?)').run('QS','edit',1,'q.stewart@tidelinestrats.com');sql.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run('company_tickets','voyage:'+uuid(1),JSON.stringify({id:uuid(1),title:'Fictional roster',status:'open',notes:[],attachments:[],deleted:false}),1,Date.now());
  const env={VOYAGE_OPERATIONS_SECRET:'a'.repeat(40),DB:{prepare(query){return{bind(...args){return{first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};}};}}};
  const request=async id=>handleTicketQueue(new Request('https://voyage.tidelinestrats.com/api/ticket-handoff',{method:'POST',body:JSON.stringify({action:'queue',requestId:id,company:'voyage',id:uuid(1),source:'company',agent:'codex'})}),env,{id:'QS',role:'edit'},['api','ticket-handoff'],r=>r.json());
  assert.equal((await request(uuid(2))).status,202);assert.equal((await request(uuid(3))).status,409);sql.exec("UPDATE documents SET data_json=json_set(data_json,'$.state','delivery_uncertain') WHERE collection='company_ticket_jobs'");assert.equal((await request(uuid(4))).status,409);assert.equal(sql.prepare("SELECT count(*) n FROM documents WHERE collection='company_ticket_jobs'").get().n,1);
 }finally{sql.close();}
});
test('a release job can refresh only the unchanged reviewed content and requires a new approval',async()=>{
 const original={id:uuid(8),sourceCommit:'a'.repeat(40),tree:'b'.repeat(40),mainCommit:'c'.repeat(40)},job={runtimeId:uuid(1),task:{id:'123456789abc'},support:{kind:'release',ticketId:uuid(2),runtimeId:uuid(1),claimToken:uuid(3),outboxId:uuid(4)}},candidate={...original,id:uuid(9),mainCommit:'e'.repeat(40),devCommit:'d'.repeat(40),taskId:'123456789abc',checks:{status:'passed'}};
 const env={WONPLACE_TICKETS_ORIGIN:'https://premieros-preview.signallabs.workers.dev',WONPLACE_TICKETS_SECRET:'a'.repeat(40)},operations=[];
 const transport=async(url,opt={})=>{if(String(url).includes('__dev/status'))return Response.json({commit:candidate.devCommit});const body=JSON.parse(opt.body);operations.push(body.operation);if(body.operation==='approval')return Response.json({approved:true,candidate:original});if(body.operation==='candidate')return Response.json({ok:true});throw Error('Unexpected callback');};
 assert.equal((await forwardSupportDelivery(env,job,uuid(1),{operation:'candidate',taskId:'123456789abc',candidate},transport)).ok,true);assert.deepEqual(operations,['approval','candidate']);
 await assert.rejects(forwardSupportDelivery(env,job,uuid(1),{operation:'candidate',taskId:'123456789abc',candidate:{...candidate,tree:'f'.repeat(40)}},transport),/unchanged reviewed/);
 await assert.rejects(forwardSupportDelivery(env,job,uuid(1),{operation:'candidate',taskId:'123456789abc',candidate:{...candidate,mainCommit:original.mainCommit}},transport),/unchanged reviewed/);
});
