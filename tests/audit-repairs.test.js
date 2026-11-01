import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readSessionLog,sessionLog} from '../scripts/ticket-session-log.mjs';
const html=fs.readFileSync('public/index.html','utf8');
const fn=name=>html.match(new RegExp('async function '+name+'\\([^]*?\\n\\}'))[0];
test('failed note save preserves draft, dirty editor and history; retry reuses identity',async()=>{
 const draft={id:'draft',draft:true,oppId:'a',type:'Discovery'},notes=[],drafts=[draft],ids=[],history=[];let dirty=true,fail=true,rendered=0,insertions=0;
 const context={nDrafts:drafts,notes,opps:[{id:'a',name:'Synthetic'}],me:'QS',live:true,Date,fmtDate:x=>x,toast(){},track(){},logAct:x=>history.push(x),document:{activeElement:null},renderNotes(){rendered++},db:{collection:()=>({doc(id){id ||= 'saved-'+ ++insertions;ids.push(id);return {id,set:async()=>{if(fail)throw Error('offline');}};}})}};
 vm.createContext(context);vm.runInContext(fn('write')+'\n'+fn('saveNote'),context);
 const card={classList:{remove(){dirty=false;}}},data={text:'Irreplaceable note',date:'2026-11-01'};
 await context.saveNote(draft,data,card);assert.equal(context.nDrafts.length,1);assert.equal(notes.length,0);assert.equal(history.length,0);assert(dirty);assert.equal(rendered,0);
 fail=false;await context.saveNote(draft,data,card);assert.deepEqual(ids,['saved-1','saved-1']);assert.equal(context.nDrafts.length,0);assert.equal(notes[0].text,data.text);assert.equal(history.length,1);assert(!dirty);
});
async function adapter(role='guest'){
 const timers=[],calls=[],events=[],listeners={};let now=Date.now(),expired=false;
 const window={addEventListener(name,fn){listeners[name]=fn;},dispatchEvent:e=>events.push(e.detail)},document={hidden:false,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('public/voyage-db.js','utf8'),{window,document,Date:class extends Date{static now(){return now}},URLSearchParams,CustomEvent:class{constructor(t,x){this.detail=x.detail}},crypto,setInterval:f=>{timers.push(f);return 1},clearInterval(){},fetch:async(url,opts)=>{calls.push({url,method:opts?.method});return url==='/api/me'?Response.json({id:'G',role}):expired?Response.json({error:'Sign in with the approved TideLine account',code:'authentication_required'},{status:403}):Response.json({docs:[]});}});
 await window.voyageDb.init();return {db:window.voyageDb,timers,calls,events,expire(){expired=true},advance(){now+=16000;listeners.pointerdown?.();timers.forEach(f=>f());}};
}
test('guest permission mirror permits own profile and contact PATCH but rejects foreign/create/delete',async()=>{
 const {db}=await adapter();await db.doc('profiles/G').update({bio:'Hello'});await db.doc('contacts/c').update({email:'valid@example.invalid'});
 await assert.rejects(db.doc('profiles/OTHER').update({bio:'No'}),{code:'guest_forbidden'});await assert.rejects(db.doc('contacts/c').delete(),{code:'guest_forbidden'});await assert.rejects(db.collection('contacts').add({name:'No'}),{code:'guest_forbidden'});
});
test('expired session preserves status and stops polling instead of retrying',async()=>{
 const a=await adapter('edit');a.expire();let caught;a.db.collection('opps').onSnapshot(()=>{},e=>{caught=e;});await new Promise(setImmediate);assert.equal(caught.status,403);assert.equal(caught.code,'authentication_required');const count=a.calls.length;a.advance();await new Promise(setImmediate);assert.equal(a.calls.length,count);
});
test('bounded agent log retains metadata and newest events past 2 MiB',async t=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'voyage-log-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'agent.log');
 const event=(type,data)=>JSON.stringify({type,...data})+'\n';await fsp.writeFile(file,'Queued task 123456abcdef\n'+event('ticket.ready',{control:'/synthetic/control'})+event('ticket.thread',{threadId:'synthetic-thread'})+event('ticket.delta',{text:'x'.repeat(2200000)})+event('ticket.delta',{text:'Newest message'})+event('ticket.command',{id:'ack',accepted:true}));
 const log=await readSessionLog(file);assert.match(log,/Queued task 123456abcdef/);const parsed=sessionLog(log);assert(parsed.truncated);assert.equal(parsed.threadId,'synthetic-thread');assert.equal(parsed.control,'/synthetic/control');assert.match(parsed.transcript,/Newest message/);assert.equal(parsed.commandResults[0].id,'ack');assert(!parsed.transcript.includes('xxxx'));
});
test('a normal Codex app-server exit remains a successful bridge exit',async t=>{
 const {spawn}=await import('node:child_process');const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'voyage-codex-stub-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'codex');await fsp.writeFile(file,'#!/usr/bin/env node\n'+`const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);if(m.id){console.log(JSON.stringify({id:m.id,result:m.method==='thread/start'?{thread:{id:'synthetic-thread'}}:{}}));if(m.method==='turn/start')setTimeout(()=>process.exit(0),10);}});`,{mode:0o700});
 const input=path.join(dir,'input.json');await fsp.writeFile(input,JSON.stringify({prompt:'Synthetic no-provider test'}));
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/ticket-codex-session.mjs',input],{env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,AGENT_COORDINATOR_TASK:''},stdio:'ignore'});const timer=setTimeout(()=>{child.kill();reject(Error('Stub bridge timed out'));},5000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve(code);});});assert.equal(result,0);
});
test('agent polling is quiet when hidden, offline or terminal, and backs off errors',async()=>{
 const source=fs.readFileSync('public/company-tickets.js','utf8'),start=source.indexOf('    let pollFailures=0;'),end=source.indexOf(';void poll();',start);
 const timers=[],calls=[],ctx={job:null,closed:false,document:{hidden:true},navigator:{onLine:true},dialog:{isConnected:true,getClientRects:()=>[{}]},requestSpec:{company:'voyage',id:'synthetic'},sessionState:{},send:{},show(){},setTimeout:(fn,ms)=>timers.push({fn,ms}),fetch:async p=>{calls.push(p);return Response.json({jobs:[]});}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';globalThis.poll=poll;',ctx);
 await ctx.poll();assert.equal(calls.length,0);ctx.document.hidden=false;ctx.navigator.onLine=false;await ctx.poll();assert.equal(calls.length,0);
 ctx.navigator.onLine=true;await ctx.poll();assert.equal(calls.length,1);assert.equal(timers.at(-1).ms,30000);
 ctx.job={state:'completed'};const count=timers.length;await ctx.poll();assert.equal(calls.length,1);assert.equal(timers.length,count);
 ctx.job=null;ctx.fetch=async()=>{throw Error('offline');};await ctx.poll();assert.equal(timers.at(-1).ms,5000);
});
test('streaming byte bounds cancel oversize input and do not deadlock a cloned Request',async()=>{
 const {readBoundedBytes}=await import('../src/bounded-body.js');let cancelled=false;
 const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(8));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedBytes({body},10),RangeError);await new Promise(setImmediate);assert(cancelled);
 const request=new Request('https://synthetic.invalid',{method:'POST',body:'123456789012345',duplex:'half'}),copy=request.clone();
 const deadline=new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Cloned-body reader deadlocked')),1000);t.unref();});
 await assert.rejects(Promise.race([readBoundedBytes(copy,10),deadline]),RangeError);
 await assert.rejects(readBoundedBytes(request,10),RangeError);
 const bytes=await readBoundedBytes(new Response('hello'),5);assert.equal(new TextDecoder().decode(bytes),'hello');
});
