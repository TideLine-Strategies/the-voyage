import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../src/worker.js';
import {companyEvent,snapshotFrom} from '../src/company-events.js';
import {handleCompany,ingestCompany,companySummary,signedHeaders,verifySource,financialRecord,providerSnapshot} from '../src/company-ops.js';
const secret='company-integration-test-00000000000000',origin='https://voyage.example';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('migrations/0001_initial.sql','utf8'));
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}};},async all(){return {results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)||null;}};}};
 const buckets=new Map();const env={DB,WONPLACE_OPERATIONS_SECRET:secret,TIDELINE_OPERATIONS_SECRET:secret+'tideline',COMPANY_HUB:{idFromName:name=>name,get:id=>({trakrReport:async()=>({status:'not_connected',financials:null}),snapshot:async()=>snapshotFrom(buckets.get(id)||[]),ingest:async events=>{buckets.set(id,[...(buckets.get(id)||[]),...events.map(e=>companyEvent(e))]);return {accepted:events.length};},fetch:async()=>new Response('stream')})}};
 const call=(company,operation='',method='GET',body=null,actor={role:'edit',id:'QS'})=>{const path='/api/companies/'+company+(operation?'/'+operation:'');const request=new Request(origin+path,{method,headers:{origin},...(body?{body:JSON.stringify(body)}:{})});return handleCompany(request,env,actor,path.split('/').filter(Boolean),r=>r.json());};
 return {env,call,sqlite};
}
const finance={product:'wonplace',id:'cloudflare-bill',kind:'bill',status:'due',label:'Hosting',amountCents:500,currency:'USD',date:'2026-10-16',recurrence:'monthly'};
test('company financials are isolated, idempotent and preserve received versus expected revenue',async()=>{
 const {env,call}=fixture();assert.equal((await call('wonplace','financials','PUT',finance)).status,200);await call('wonplace','financials','PUT',finance);
 assert.equal((await companySummary(env,'wonplace')).financials.length,1);assert.equal((await companySummary(env,'tideline')).financials.length,0);assert.equal((await companySummary(env,'tideline')).brandFinancials.length,1);assert.throws(()=>financialRecord({...finance,product:'personal'}));
 const expected=financialRecord({...finance,kind:'revenue',status:'expected'});assert.equal(expected.status,'expected');assert.throws(()=>financialRecord({...finance,amountCents:1.5}));assert.throws(()=>financialRecord({...finance,kind:'revenue'}));assert.throws(()=>financialRecord({...finance,date:'2026-02-30'}));
});
test('guests and unknown companies are denied; secrets in source URLs rejected',async()=>{
 const {call}=fixture();assert.equal((await call('wonplace','','GET',null,{role:'guest'})).status,403);assert.equal((await call('other')).status,404);
 for(const url of ['http://github.com/org/repo','https://user:secret@github.com/org/repo','https://github.com/org/repo?token=secret'])assert.equal((await call('wonplace','connections','PUT',{id:'git',provider:'github',label:'GitHub',url})).status,400);
 const r=await call('tideline','connections','PUT',{id:'github',provider:'github',label:'Repo',url:'https://github.com/TideLine-Strategies/the-voyage'});assert.equal((await r.json()).status,'linked');
});
async function signed(path,body,customSecret=secret,method='POST') {const url=origin+path,text=body?JSON.stringify(body):'';return new Request(url,{method,headers:await signedHeaders(customSecret,method,url,'wonplace',text),...(text?{body:text}:{})});}
test('signed ingestion cannot cross company boundary or be modified; source imports remain idempotent',async()=>{
 const {env}=fixture(),body={events:[{id:'event-1',kind:'presence',userId:'staff',userName:'Test Staff',sessionId:'session-1',action:'active',page:'calendar'}],providers:[{provider:'github',resource:'org/repo',status:'ok',metrics:{openPRs:3}}],financials:[finance]};
 const run=async request=>ingestCompany(request,env,r=>r.json());assert.equal((await run(await signed('/api/company-events/wonplace',body))).status,200);
 assert.equal((await companySummary(env,'tideline')).live.activeUsers.length,0);assert.equal((await companySummary(env,'wonplace')).live.activeUsers[0].userName,'Test Staff');
 assert.equal((await run(await signed('/api/company-events/tideline',body))).status,401);
 const altered=await signed('/api/company-events/wonplace',body);assert.equal(await verifySource(altered,secret,JSON.stringify({...body,events:[]})),false);
 await run(await signed('/api/company-events/wonplace',body));assert.equal((await companySummary(env,'wonplace')).financials.length,1);
 const source=await run(await signed('/api/company-events/wonplace',null,secret,'GET'));const data=await source.json();assert.equal(data.company,'wonplace');assert.equal(data.financials,undefined);
});
test('presence expires and hidden/left sessions are not counted active; sensitive fields dropped',()=>{
 const event=companyEvent({id:'1',kind:'presence',userId:'u',sessionId:'s',password:'SECRET',action:'active'},1000);
 assert.equal(JSON.stringify(event).includes('SECRET'),false);assert.equal(snapshotFrom([event],90000).activeUsers.length,1);assert.equal(snapshotFrom([event],92000).activeUsers.length,0);
 assert.equal(snapshotFrom([event,{...event,id:'2',at:2000,action:'left'}],3000).activeUsers.length,0);
 assert.throws(()=>providerSnapshot({provider:'github',resource:'a',status:'ok',metrics:{requests:NaN}}));
});
test('anonymous company endpoints and source reads fail closed',async()=>{
 const {env}=fixture();for(const path of ['/api/companies/wonplace','/api/companies/tideline','/api/companies/wonplace/live'])assert.equal((await worker.fetch(new Request(origin+path),env)).status,403);
 assert.equal((await ingestCompany(new Request(origin+'/api/company-events/wonplace'),env,r=>r.json())).status,401);
});

test('stale financial updates are refused and imports cannot replace manual edits',async()=>{
 const {env,call}=fixture();await call('wonplace','financials','PUT',finance);
 let row=(await companySummary(env,'wonplace')).financials[0];
 assert.equal((await call('wonplace','financials','PUT',{...finance,status:'paid',expectedRevision:row.revision})).status,200);
 assert.equal((await call('wonplace','financials','PUT',{...finance,status:'due',expectedRevision:row.revision})).status,400);
 assert.equal((await companySummary(env,'tideline')).brandFinancials[0].status,'paid');
});

test('cockpit preferences persist by company and guests cannot read metrics or change targets',async()=>{
 const {call}=fixture(),settings={aim:'Grow paying WonPlace customers',focus:['customers.paying','api.errorRate','revenue.received'],rules:{'api.requests':{direction:'above',warning:50000,critical:90000}}};
 assert.equal((await call('wonplace','cockpit','PUT',settings)).status,200);
 const response=await call('wonplace','metrics'),data=await response.json();assert.equal(response.status,200);assert.equal(data.settings.aim,settings.aim);assert.equal(data.metrics.find(m=>m.id==='api.requests').rule.critical,90000);
 const other=await(await call('tideline','metrics')).json();assert.notEqual(other.settings.aim,settings.aim);
 assert.equal((await call('wonplace','metrics','GET',null,{role:'guest'})).status,403);assert.equal((await call('wonplace','cockpit','PUT',settings,{role:'guest'})).status,403);
 assert.equal((await call('wonplace','cockpit','PUT',{...settings,focus:['personal.balance']})).status,400);
});


test('GA4 reports stay editor-only and in the TideLine website scope',async()=>{
 const {call}=fixture();assert.equal((await call('tideline','ga4','GET',null,{role:'guest',id:'guest'})).status,403);assert.equal((await call('wonplace','ga4')).status,404);const response=await call('tideline','ga4');assert.equal(response.status,200);const body=await response.json();assert.equal(body.propertyId,'560552440');assert.equal(body.connected,false);assert.equal(body.status,'not_connected');assert.equal(body.totals,undefined);
});
