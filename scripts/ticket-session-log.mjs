// Only display Codex conversational events, never provider/auth or raw shell logs.
export function sessionLog(text){let transcript='',threadId=null,sessionStatus=null,control=null;const commandResults=[];
 for(const line of text.split('\n')){let e;try{e=JSON.parse(line);}catch{continue;}
  if(e.type==='ticket.ready')control=e.control;
  if(e.type==='ticket.thread')threadId=e.threadId;
  if(e.type==='ticket.delta')transcript+=e.text;
  if(e.type==='ticket.status'){sessionStatus=e.status;transcript+='\n\n[Codex '+e.status+']\n';}
  if(['ticket.notice','ticket.error'].includes(e.type))transcript+='\n['+e.text+']\n';
  if(e.type==='ticket.command')commandResults.push({id:e.id,accepted:e.accepted,error:e.error});
 }
 return {transcript:transcript.slice(-24000),threadId,sessionStatus,control,commandResults:commandResults.slice(-20)};
}
