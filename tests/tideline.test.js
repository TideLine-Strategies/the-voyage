import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {handleTideline,importInquiry,tidelineSummary} from '../src/tideline.js';
function wrap(sql){const db={prepare(q){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:sql.prepare(q).run(...args).changes}};}};},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};return db;}
function fixture(){
 const siteSql=new DatabaseSync(':memory:'),crmSql=new DatabaseSync(':memory:');
 siteSql.exec(`CREATE TABLE contact_inquiries(id TEXT PRIMARY KEY,submitted_at TEXT,name TEXT,business TEXT,email TEXT,phone TEXT,message TEXT,notification_status TEXT);CREATE TABLE site_events(id TEXT PRIMARY KEY,created_at TEXT,kind TEXT,page TEXT,session_id TEXT,referrer_host TEXT,device TEXT);CREATE TABLE loki_audits(id TEXT,created_at TEXT,result_json TEXT);CREATE TABLE loki_operators(id TEXT,created_at TEXT);CREATE TABLE loki_moves(id TEXT,created_at TEXT,status TEXT);`);
 crmSql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const site=wrap(siteSql),crm=wrap(crmSql),id='11111111-1111-4111-8111-111111111111',stamp=new Date().toISOString();
 siteSql.prepare('INSERT INTO contact_inquiries VALUES (?,?,?,?,?,?,?,?)').run(id,stamp,'Test Owner','Fictional Studio','owner@example.invalid','','Need an enrollment workflow','pending');
 return {siteSql,crmSql,site,crm,id,stamp};
}
test('TideLine endpoints deny guest access before touching the business database',async()=>{
 const request=new Request('https://voyage.example/api/tideline/analytics');
 const response=await handleTideline(request,{TIDELINE_DB:{prepare(){throw Error('must not access')}}},{id:'MJ',role:'guest'},()=>{});
 assert.equal(response.status,403);
 assert.equal((await handleTideline(request,{}, {role:'edit'},()=>{})).status,503);
});
test('inquiry import is atomic and idempotent, preserving subsequent CRM edits',async()=>{
 const f=fixture();let result=await importInquiry(f.site,f.crm,f.id,{id:'QS'});assert.equal(result.created,true);
 assert.equal(f.crmSql.prepare("SELECT COUNT(*) n FROM documents WHERE collection='opps'").get().n,1);
 f.crmSql.prepare("UPDATE documents SET data_json=json_set(data_json,'$.stage',3) WHERE collection='opps'").run();
 result=await importInquiry(f.site,f.crm,f.id,{id:'CK'});assert.equal(result.created,false);
 assert.equal(JSON.parse(f.crmSql.prepare("SELECT data_json FROM documents WHERE collection='opps'").get().data_json).stage,3);
 assert.equal(f.crmSql.prepare("SELECT COUNT(*) n FROM documents WHERE collection='contacts'").get().n,1);
 assert.equal(f.crmSql.prepare("SELECT COUNT(*) n FROM documents WHERE collection='notes'").get().n,1);
});
test('another inquiry from the same email links to the existing account without duplicating it',async()=>{
 const f=fixture();const first=await importInquiry(f.site,f.crm,f.id,{id:'QS'});
 const other='22222222-2222-4222-8222-222222222222';f.siteSql.prepare('INSERT INTO contact_inquiries SELECT ?,submitted_at,name,business,email,phone,message,notification_status FROM contact_inquiries').run(other);
 const next=await importInquiry(f.site,f.crm,other,{id:'QS'});assert.equal(next.oppId,first.oppId);
 assert.equal(f.crmSql.prepare("SELECT COUNT(*) n FROM documents WHERE collection='opps'").get().n,1);
 assert.equal(f.crmSql.prepare("SELECT COUNT(*) n FROM documents WHERE collection='notes'").get().n,2);
});
test('summary joins real SQL analytics to CRM provenance without exposing audit access tokens',async()=>{
 const f=fixture();await importInquiry(f.site,f.crm,f.id,{id:'QS'});
 f.siteSql.prepare('INSERT INTO site_events VALUES (?,?,?,?,?,?,?)').run('event',f.stamp,'page_view','home','anonymous','example.com','phone');
 f.siteSql.prepare('INSERT INTO loki_audits VALUES (?,?,?)').run('audit',f.stamp,'{"opportunities":[1,2,3]}');
 const s=await tidelineSummary(f.site,f.crm,30);assert.equal(s.traffic.sessions,1);assert.equal(s.audits.completed,1);assert.equal(s.pipeline.accounts,1);assert.ok(s.inquiries[0].oppId);
 assert.doesNotMatch(JSON.stringify(s),/token_hash|last_message_json|opportunities/);
});
