import {handleCompanyTickets} from '../src/company-tickets.js';
import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {ticketResolutionBlocker} from '../src/ticket-resolution-gate.js';
const id='11111111-1111-4111-8111-111111111111',commit='a'.repeat(40),taskId='123456abcdef';
function setup(task){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT)');if(task)sql.prepare('INSERT INTO documents VALUES(?,?,?)').run('company_ticket_tasks','voyage:'+taskId,JSON.stringify({reportContract:2,taskId,ticket:id,snapshot:{state:'complete',delivery:'merge',commit},milestones:[{kind:'complete',at:100}],...task}));const env={DB:{prepare(query){return{bind(...values){return{async all(){return{results:sql.prepare(query).all(...values)}}}}}}}};return{env,sql};}
const report=at=>({at,content:{via:'coordinator-task',taskId,commit,checks:'Verified actual delivery; no remaining acceptance gates'}});
test('new work needs completed delivery and a final report after its completion milestone',async()=>{let {env}=setup({snapshot:{state:'working'}});assert.match(await ticketResolutionBlocker(env,'voyage',{id}),/not complete/);({env}=setup({}));assert.match(await ticketResolutionBlocker(env,'voyage',{id,workReports:[report(99)]}),/final structured report/);assert.equal(await ticketResolutionBlocker(env,'voyage',{id,workReports:[report(101)]}),null);assert.equal(await ticketResolutionBlocker(env,'wonplace',{id}),null);});
test('deployment acceptance and its final report are independently required',async()=>{let {env}=setup({snapshot:{state:'complete',commit,delivery:'deploy'}});assert.match(await ticketResolutionBlocker(env,'voyage',{id,workReports:[report(500)]}),/exact deployment and live acceptance/);({env}=setup({snapshot:{state:'complete',commit,delivery:'deploy',liveAcceptance:{at:200,commit:'b'.repeat(40),deploymentId:'provider-deployment'}}}));assert.match(await ticketResolutionBlocker(env,'voyage',{id,workReports:[report(150)]}),/final structured report/);assert.equal(await ticketResolutionBlocker(env,'voyage',{id,workReports:[report(201)]}),null);const wrong=report(201);wrong.content.commit='c'.repeat(40);assert.match(await ticketResolutionBlocker(env,'voyage',{id,workReports:[wrong]}),/final structured report/);});
test('retained legacy links do not retroactively change closure rules; cancellation is not a verified fix',async()=>{let {env}=setup({reportContract:1,snapshot:{state:'repair_required'}});assert.equal(await ticketResolutionBlocker(env,'voyage',{id}),null);({env}=setup({snapshot:{state:'cancelled'}}));assert.match(await ticketResolutionBlocker(env,'voyage',{id}),/cancelled/);});

test('ticket API refuses resolution before final task evidence without changing the ticket',async()=>{
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,revision INTEGER DEFAULT 1,updated_at INTEGER,PRIMARY KEY(collection,id))');
 const issue={id,company:'voyage',title:'Tracked change',status:'in_progress',notes:[],history:[],attachments:[]};
 sql.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run('company_tickets','voyage:'+id,JSON.stringify(issue),1,Date.now());
 sql.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run('company_ticket_tasks','voyage:'+taskId,JSON.stringify({ticket:id,taskId,reportContract:2,snapshot:{state:'working'}}),1,Date.now());
 const DB={
  prepare(query){return {
   bind(...values){return {
    async first(){return sql.prepare(query).get(...values)||null;},
    async all(){return {results:sql.prepare(query).all(...values)};},
    async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}
   };}
  };}
 };
 const response=await handleCompanyTickets(new Request('https://voyage.tidelinestrats.com/api/company-tickets/'+id+'?company=voyage',{method:'PATCH',body:JSON.stringify({status:'resolved',expectedRevision:1})}),{DB},{id:'QS',name:'Owner Demo',role:'edit'},['api','company-tickets',id]);
 assert.equal(response.status,409);
 const saved=JSON.parse(sql.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').get('company_tickets','voyage:'+id).data_json);
 assert.equal(saved.status,'in_progress');assert.equal(saved.humanReviews,undefined);
});
