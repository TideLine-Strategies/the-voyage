import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {tidelineSummary,handleTideline} from '../src/tideline.js';
function adapter(sql){return {prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const stmt of statements)out.push(await stmt.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}};}
function fixture(){
 const site=new DatabaseSync(':memory:'),crm=new DatabaseSync(':memory:');site.exec(fs.readFileSync(new URL('./fixtures/tideline-source.sql',import.meta.url),'utf8'));crm.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const env={DB:adapter(crm),TIDELINE_DB:adapter(site)};const now=new Date().toISOString(),id=crypto.randomUUID();
 site.prepare('INSERT INTO contact_inquiries(id,submitted_at,name,business,email,phone,message) VALUES (?,?,?,?,?,?,?)').run(id,now,'Synthetic founder','Synthetic service','founder@example.invalid','','Synthetic inquiry');
 site.prepare('INSERT INTO loki_waitlist(phone,submitted_at) VALUES (?,?)').run('+12025550101',now);
 const call=(method,path,body,role='edit',origin='https://voyage.example')=>handleTideline(new Request('https://voyage.example'+path,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{id:'QS',role},req=>req.json());
 return {site,crm,env,now,id,call};
}
test('TideLine lead analytics keeps source signups, CRM links and anonymous conversions distinct',async()=>{
 const {site,env,now,call,id}=fixture();const session=crypto.randomUUID();site.prepare('INSERT INTO site_events VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),now,'page_view','home',session,'','desktop');
 site.prepare('INSERT INTO conversion_events VALUES (?,?,?,?,?)').run('hash-only',now,'contact_submitted',session,'desktop');
 assert.equal((await call('POST','/api/tideline/import',{kind:'contact',id})).status,200);
 assert.equal((await call('POST','/api/tideline/import',{kind:'waitlist',id:'+12025550101'})).status,200);
 const out=await tidelineSummary(env.TIDELINE_DB,env.DB);assert.equal(out.traffic.sessions,1);assert.equal(out.conversions[0].events,1);assert.equal(out.inquiries[0].syncStatus,'linked');assert.equal(out.waitlist[0].syncStatus,'linked');assert.equal(out.pipeline.accounts,2);
 assert(!JSON.stringify(out.conversions).includes(session));assert(!('turns' in out));
});
test('retries are idempotent and never replace edited CRM account fields',async()=>{
 const {crm,id,call}=fixture();let a=await (await call('POST','/api/tideline/import',{kind:'contact',id})).json();
 crm.prepare("UPDATE documents SET data_json=json_set(data_json,'$.stage',3,'$.notes','Staff edit') WHERE collection='opps' AND id=?").run(a.oppId);
 let b=await (await call('POST','/api/tideline/import',{kind:'contact',id})).json();assert.equal(a.oppId,b.oppId);assert.equal(crm.prepare("SELECT count(*) n FROM documents WHERE collection='notes'").get().n,1);assert.equal(JSON.parse(crm.prepare("SELECT data_json FROM documents WHERE collection='opps'").get().data_json).notes,'Staff edit');
});
test('guests and cross-origin writes cannot read or link private intake',async()=>{
 const {call,id}=fixture();assert.equal((await call('GET','/api/tideline/analytics',null,'guest')).status,403);assert.equal((await call('POST','/api/tideline/import',{kind:'contact',id},'guest')).status,403);assert.equal((await call('POST','/api/tideline/import',{kind:'contact',id},'edit','https://other.example')).status,403);assert.equal((await call('POST','/api/tideline/import',{kind:'private',id})).status,400);
});
test('missing new source tables are reported as unavailable measurement, not fake zero conversions',async()=>{
 const {site,env}=fixture();site.exec('DROP TABLE conversion_events; DROP TABLE crm_intake_receipts; DROP TABLE loki_waitlist');const result=await tidelineSummary(env.TIDELINE_DB,env.DB);assert.equal(result.conversions,null);assert.equal(result.coverage.conversionTracking,false);assert.equal(result.inquiries.length,1);
});
