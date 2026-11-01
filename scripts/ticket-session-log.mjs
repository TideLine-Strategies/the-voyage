import fs from 'node:fs/promises';
// Keep initialization metadata, but bound transcript reads to the newest complete records.
export async function readSessionLog(file,maxBytes=2*1024*1024){
 const handle=await fs.open(file);
 try{
  const {size}=await handle.stat(),start=Math.max(0,size-maxBytes),bytes=Buffer.alloc(Math.min(size,maxBytes));
  const {bytesRead}=await handle.read(bytes,0,bytes.length,start);
  let tail=bytes.subarray(0,bytesRead).toString('utf8');
  if(!start)return tail;
  tail=tail.slice(tail.indexOf('\n')+1); // Discard the partial first JSON record.
  const head=Buffer.alloc(Math.min(start,65536)),read=await handle.read(head,0,head.length,0);
  const headText=head.subarray(0,read.bytesRead).toString('utf8'),task=headText.match(/Queued task ([a-f0-9]{12})/);
  const metadata=headText.split('\n').filter(line=>{try{return ['ticket.ready','ticket.thread'].includes(JSON.parse(line).type);}catch{return false;}}).join('\n');
  return metadata+'\n'+(task?'Queued task '+task[1]+'\n':'')+JSON.stringify({type:'ticket.log_truncated'})+'\n'+tail;
 }finally{await handle.close();}
}
// Only display Codex conversational events, never provider/auth or raw shell logs.
export function sessionLog(text){let transcript='',threadId=null,sessionStatus=null,control=null,truncated=false;const commandResults=[];
 for(const line of text.split('\n')){let e;try{e=JSON.parse(line);}catch{continue;}
  if(e.type==='ticket.log_truncated')truncated=true;
  if(e.type==='ticket.ready')control=e.control;
  if(e.type==='ticket.thread')threadId=e.threadId;
  if(e.type==='ticket.delta')transcript+=e.text;
  if(e.type==='ticket.status'){sessionStatus=e.status;transcript+='\n\n[Codex '+e.status+']\n';}
  if(['ticket.notice','ticket.error'].includes(e.type))transcript+='\n['+e.text+']\n';
  if(e.type==='ticket.command')commandResults.push({id:e.id,accepted:e.accepted,error:e.error});
 }
 return {transcript:(truncated?'[Earlier output omitted]\n':'')+transcript.slice(-24000),truncated,threadId,sessionStatus,control,commandResults:commandResults.slice(-20)};
}
