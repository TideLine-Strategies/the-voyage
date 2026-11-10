import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {sourceTaskProgress,ticketTasks} from '../src/ticket-task-progress.js';import {signedHeaders} from '../src/company-signing.js';
const origin='https://voyage.tidelinestrats.com',secret='test-source-ticket-secret-0000000000000000',ticket='11111111-1111-4111-8111-111111111111',runtime='33333333-3333-4333-8333-333333333333';
function setup(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,PRIMARY KEY(collection,id));CREATE TABLE members(id TEXT PRIMARY KEY,role TEXT,active INTEGER,email TEXT);');sql.prepare('INSERT INTO members VALUES(?,?,?,?)').run('QS','edit',1,'q.stewart@tidelinestrats.com');sql.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run('company_tickets','voyage:'+ticket,JSON.stringify({id:ticket,title:'Fix roster',status:'open',notes:[],attachments:[],deleted:false}),1,Date.now());return {sql,env:{VOYAGE_OPERATIONS_SECRET:secret,DB:{prepare(query){return {bind(...values){return{async first(){return sql.prepare(query).get(...values)||null;},async all(){return{results:sql.prepare(query).all(...values)};},async run(){return{meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};}};}}}};}
const link={action:'link',taskId:'123456abcdef',runtimeId:runtime,ticket,identity:'github.com/quanbuilds/the-voyage',agent:'codex',requestedBy:'q.stewart@tidelinestrats.com',lead:true};
async function call(env,value,signed=true,company='voyage'){const url=origin+'/api/company-ticket-task-progress/'+company,body=JSON.stringify(value);return sourceTaskProgress(new Request(url,{method:'POST',headers:signed?await signedHeaders(secret,'POST',url,'test',body):{},body}),env,r=>r.json());}
const progress=(sequence=1,extra={})=>({action:'progress',taskId:link.taskId,runtimeId:runtime,sequence,snapshot:{state:'working',stage:'fetch',heartbeatAt:Date.now(),checkpoint:'Planning; no implementation yet',checkpointAt:Date.now(),...extra}});

test('signed progress retains completion outside the bounded archive journal and rejects client supplied proof',async()=>{
 const {env,sql}=setup();await call(env,link);const done=progress(1,{state:'complete',stage:'done',commit:'a'.repeat(40),delivery:'deploy',liveAcceptance:{at:200,commit:'b'.repeat(40),deploymentId:'provider'},milestones:[{id:1,at:100,kind:'complete'}]});
 assert.equal((await call(env,{...done,snapshot:{...done.snapshot,completionProof:{at:1}}})).status,400);
 assert.equal((await call(env,done)).status,200);
 for(let batch=0;batch<6;batch++){
  const milestones=Array.from({length:50},(_,i)=>({id:2+batch*50+i,at:300+batch*50+i,kind:'apfs_clone_complete'}));
  assert.equal((await call(env,{...done,sequence:batch+2,snapshot:{...done.snapshot,milestones}})).status,200);
 }
 const task=(await ticketTasks(env,'voyage',ticket))[0];assert.equal(task.milestones.length,200);assert.equal(task.milestones.some(m=>m.kind==='complete'),false);assert.deepEqual(task.completionProof,{commit:'a'.repeat(40),at:100,source:'coordinator-milestone',milestoneId:1});
 const issue=JSON.parse(sql.prepare("SELECT data_json FROM documents WHERE collection='company_tickets'").get().data_json);assert.equal(issue.status,'open');assert.equal(issue.humanReviews,undefined);
});
test('a fresh authenticated old-task observation requires a new final report without inventing an old milestone',async()=>{
 const {env}=setup();await call(env,link);const done=progress(1,{state:'complete',stage:'done',commit:'a'.repeat(40)});const before=Date.now();assert.equal((await call(env,done)).status,200);const task=(await ticketTasks(env,'voyage',ticket))[0];assert.equal(task.completionProof.source,'signed-complete-snapshot');assert(task.completionProof.at>=before);assert.deepEqual(task.milestones,[]);
 assert.equal((await call(env,done)).status,200);assert.deepEqual((await ticketTasks(env,'voyage',ticket))[0].completionProof,task.completionProof);
 assert.equal((await call(env,progress(2,{state:'working',commit:'a'.repeat(40)}))).status,200);assert.equal((await ticketTasks(env,'voyage',ticket))[0].completionProof,null);
});
