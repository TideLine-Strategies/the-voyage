import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWonPlaceTickets } from '../src/wonplace-tickets.js';
const env={WONPLACE_TICKETS_ORIGIN:'https://wonplace.example',WONPLACE_TICKETS_SECRET:'test-integration-secret-0000000000000000000'},actor={id:'QS',role:'edit'},id='11111111-1111-4111-8111-111111111111';
const req=(path='',body)=>new Request('https://voyage.example/api/tickets'+path,{method:body?'PATCH':'GET',...body?{body:JSON.stringify(body)}:{}});
test('guests and unconfigured integrations cannot reach source',async()=>{
 let called=false;const transport=()=>{called=true;};
 assert.equal((await handleWonPlaceTickets(req(),env,{role:'guest'},['api','tickets'],transport)).status,403);
 assert.equal((await handleWonPlaceTickets(req(),{},actor,['api','tickets'],transport)).status,503);assert.equal(called,false);
});
test('proxy signs fixed source path and authenticated actor, never forwards cookies',async()=>{
 const body={status:'resolved',expectedRevision:'4'};
 const response=await handleWonPlaceTickets(req('/'+id,body),env,actor,['api','tickets',id],async(url,options)=>{
  assert.equal(url,'https://wonplace.example/api/integrations/voyage/tickets/'+id);assert.equal(options.headers['x-voyage-actor'],'QS');assert.equal(options.headers.cookie,undefined);assert.equal(options.redirect,'manual');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WONPLACE_TICKETS_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=[options.method,new URL(url).pathname,options.headers['x-voyage-time'],'QS',JSON.stringify(body)].join('\n');
  assert.equal(await crypto.subtle.verify('HMAC',key,Uint8Array.from(options.headers['x-voyage-signature'].match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(signed)),true);
  return Response.json({issue:{id,status:'resolved'}});
 });assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('upstream conflicts are preserved; HTML quota responses are not success',async()=>{
 const conflict=await handleWonPlaceTickets(req(),env,actor,['api','tickets'],async()=>Response.json({error:'Ticket changed'},{status:409}));assert.equal(conflict.status,409);
 const html=await handleWonPlaceTickets(req(),env,actor,['api','tickets'],async()=>new Response('quota',{status:429}));assert.equal(html.status,503);
});
test('reject arbitrary routes and stream authenticated attachment downloads',async()=>{
 let called=false;const no=()=>{called=true;};
 assert.equal((await handleWonPlaceTickets(req(),env,actor,['api','tickets','../secret'],no)).status,404);assert.equal(called,false);
 const response=await handleWonPlaceTickets(req(),env,actor,['api','tickets',id,'attachments','0'],async()=>new Response('image-bytes',{headers:{'content-disposition':'attachment; filename="screen.png"'}}));
 assert.equal(await response.text(),'image-bytes');assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.match(response.headers.get('content-disposition'),/attachment/);
});

test('Worker without AbortSignal.timeout still reaches the signed source',async()=>{
 const original=AbortSignal.timeout;
 try{AbortSignal.timeout=undefined;let reached=false;
 const result=await handleWonPlaceTickets(new Request('https://voyage.example/api/tickets'),{WONPLACE_TICKETS_ORIGIN:'https://wonplace.example',WONPLACE_TICKETS_SECRET:'a'.repeat(64)},{id:'quan',role:'edit'},['api','tickets'],async()=>{reached=true;return Response.json({items:[],nextOffset:null});});
 assert.equal(reached,true);assert.equal(result.status,200);
 }finally{AbortSignal.timeout=original;}
});

test('source redirects are never followed or reported as saved',async()=>{
 const response=await handleWonPlaceTickets(req(),env,actor,['api','tickets'],async()=>new Response(null,{status:302,headers:{location:'https://untrusted.example'}}));
 assert.equal(response.status,502);assert.match((await response.json()).error,/redirected/);
});
