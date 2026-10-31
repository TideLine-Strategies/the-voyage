import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {presenceInput,taskColor,roomColors} from '../src/ticket-collaboration.js';
import {roomPython,roomHtml} from '../scripts/install-room-task-colors.mjs';
test('task palette is stable and matches Room; presence cannot select arbitrary fields or inject identities',()=>{
 for(const id of ['123456abcdef','abcdef123456','10b3663efd24'])assert(roomColors.includes(taskColor(id)));
 assert.equal(taskColor('10b3663efd24'),taskColor('10b3663efd24'));
 assert.deepEqual(presenceInput({field:'note',draft:'Hello',caret:2,status:'typing'}),{field:'note',draft:'Hello',caret:2,status:'typing'});
 for(const input of [{field:'password'},{field:'description',draft:'x',caret:2},{draft:'x'},{taskId:'fake'},{field:'description',draft:'a'.repeat(12001)}])assert.throws(()=>presenceInput(input));
});
test('Room patch is bounded, idempotent and fails closed on unexpected source',()=>{
 const py='def snapshot():\n    return dict(at=now, desktop=desktop, sessions=[])\n',html='<main><script>function draw(){paint();}</script>';
 assert.equal(roomPython(roomPython(py)),roomPython(py));assert(roomPython(py).includes('crmTasks=task_colors'));
 assert.equal(roomHtml(roomHtml(html)),roomHtml(html));assert(roomHtml(html).includes('chip.textContent=task.label'));
 assert.throws(()=>roomPython('changed'));assert.throws(()=>roomHtml('changed'));
});
test('collaboration browser code never dispatches keyboard events, focuses controls or assigns human field values',()=>{
 const js=fs.readFileSync('public/ticket-collaboration.js','utf8');assert(!/\.focus\(|\.value\s*=|KeyboardEvent|\.click\(/.test(js));assert(js.includes('pointer-events')===false);assert(js.includes('expiresAt>Date.now()'));
});

import {DatabaseSync} from 'node:sqlite';
import {sourceCollaboration} from '../src/ticket-collaboration.js';
import {signedHeaders} from '../src/company-signing.js';
function completedWorkspace(){
 const sql=new DatabaseSync(':memory:'),taskId='123456abcdef',ticket='11111111-1111-4111-8111-111111111111',runtimeId='33333333-3333-4333-8333-333333333333',commit='a'.repeat(40),secret='test-completed-workspace-secret-000000000000';
 sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,PRIMARY KEY(collection,id));CREATE TABLE members(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER,email TEXT)');
 sql.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run('QS','Quan','edit',1,'q.stewart@tidelinestrats.com');
 const task={taskId,ticket,runtimeId,requestedBy:'QS',agent:'codex',reportContract:2,snapshot:{state:'complete',delivery:'deploy',commit,liveAcceptance:{at:200,commit,deploymentId:'deployment'}},milestones:[{kind:'complete',at:300}]};
 const issue={id:ticket,company:'voyage',title:'Completed fix',status:'in_progress',notes:[],history:[],attachments:[],workReports:[{at:400,content:{via:'coordinator-task',taskId,commit,checks:'Exact deployment and UI checked'}}]};
 const put=(collection,value)=>sql.prepare('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?)').run(collection,'voyage:'+(collection==='company_tickets'?ticket:taskId),JSON.stringify(value),1,Date.now());put('company_tickets',issue);put('company_ticket_tasks',task);
 let presence=0;const hub={taskSnapshot:async()=>({tasks:[]}),touchTask:async()=>{presence++},publishTask:async()=>{presence++},markTaskConflict:async()=>{presence++},removeTask:async()=>{}};
 const DB={prepare(query){return {bind(...v){return {first:async()=>sql.prepare(query).get(...v)||null,all:async()=>({results:sql.prepare(query).all(...v)}),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...v).changes)}})};}};}};
 DB.batch=async statements=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}};
 const env={VOYAGE_OPERATIONS_SECRET:secret,COMPANY_HUB:{idFromName:x=>x,get:()=>hub},DB};
 const call=async(action,extra={})=>{const url='https://voyage.tidelinestrats.com/api/company-ticket-collaboration/voyage',body=JSON.stringify({taskId,runtimeId,action,...extra});return sourceCollaboration(new Request(url,{method:'POST',headers:await signedHeaders(secret,'POST',url,'test',body),body}),env)};
 return{sql,task,issue,put,call,presence:()=>presence};
}
test('completed task can read and finalize its own delivered ticket without reviving presence or signing human review',async()=>{
 const x=completedWorkspace();assert.equal((await x.call('read')).status,200);
 const saved=await x.call('save',{expectedRevision:1,patch:{status:'resolved'}});assert.equal(saved.status,200);const {issue}=await saved.json();assert.equal(issue.status,'resolved');assert.equal(issue.revision,2);assert.equal(issue.humanReviews,undefined);assert.match(issue.history.at(-1).by,/Codex/);assert.equal(x.presence(),0);
 assert.equal((await x.call('save',{expectedRevision:1,patch:{status:'in_review'}})).status,409);
});
test('completed handoff retains evidence, owner, identity and immutable-content boundaries',async()=>{
 for(const patch of [{status:'open'},{title:'Changed'},{status:'resolved',description:'Changed'},{status:'resolved',humanReviews:[]}]){const x=completedWorkspace();assert.equal((await x.call('save',{expectedRevision:1,patch})).status,409)}
 for(const change of [x=>{x.issue.workReports=[];x.put('company_tickets',x.issue)},x=>{x.task.snapshot.liveAcceptance=null;x.put('company_ticket_tasks',x.task)},x=>{x.task.snapshot.state='cancelled';x.put('company_ticket_tasks',x.task)},x=>{x.task.snapshot.state='owner_lost';x.put('company_ticket_tasks',x.task)}]){const x=completedWorkspace();change(x);assert.equal((await x.call('save',{expectedRevision:1,patch:{status:'resolved'}})).status,409)}
 const x=completedWorkspace();assert.equal((await x.call('presence',{presence:{status:'typing'}})).status,409);assert.equal((await x.call('read',{runtimeId:'another-runtime'})).status,403);x.sql.prepare('UPDATE members SET active=0').run();assert.equal((await x.call('read')).status,403);
});
