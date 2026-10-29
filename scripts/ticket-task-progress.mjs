import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {signedHeaders} from '../src/company-signing.js';
const origin='https://voyage.tidelinestrats.com';
const identities={wonplace:'github.com/quanbuilds/premieros',voyage:'github.com/quanbuilds/the-voyage'};
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const write=async(file,value)=>{const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value)+'\n',{mode:0o600});await fs.rename(tmp,file);};
export function coordinatorTasks(){
 // Explicit projection: never select capabilities, environment, command text or private logs.
 const script="import sqlite3,json,sys; d=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); d.row_factory=sqlite3.Row; print(json.dumps([dict(r) for r in d.execute('SELECT id,identity,agent,state,stage,heartbeat,head,created FROM tasks')]))";
 return JSON.parse(execFileSync('/usr/bin/python3',['-c',script,path.join(os.homedir(),'.agent-workspaces/coordinator/tasks.sqlite3')],{encoding:'utf8',timeout:10000,maxBuffer:4000000}));
}
export function coordinatorEvents(taskId,after=0){
 const script="import sqlite3,json,sys; d=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); d.row_factory=sqlite3.Row; print(json.dumps([dict(r) for r in d.execute(\"SELECT id,CAST(at*1000 AS INTEGER) at,kind FROM events WHERE task_id=? AND id>? AND kind!='updated' ORDER BY id LIMIT 50\",(sys.argv[2],int(sys.argv[3])))]))";
 return JSON.parse(execFileSync('/usr/bin/python3',['-c',script,path.join(os.homedir(),'.agent-workspaces/coordinator/tasks.sqlite3'),taskId,String(after)],{encoding:'utf8',timeout:10000,maxBuffer:100000}));
}
export async function syncTaskProgress({root,config,tasks=coordinatorTasks(),eventsReader=coordinatorEvents,transport=fetch,now=Date.now()}){
 const dir=path.join(root,'task-progress');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const lock=path.join(dir,'sync.lock');let handle;
 try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(String(process.pid));}catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await fs.readFile(lock,'utf8'));if(!Number.isSafeInteger(pid)||pid<1)throw Error('Progress lock is unreadable; reconcile before retry');try{process.kill(pid,0);return {busy:true};}catch(e){if(e.code!=='ESRCH')throw e;}await fs.unlink(lock);return {retry:true};}
 try{
  const runtimeId=(await fs.readFile(path.join(root,'worker-id'),'utf8')).trim();
  const send=async(company,value)=>{const url=origin+'/api/company-ticket-task-progress/'+company,body=JSON.stringify(value),r=await transport(url,{method:'POST',headers:await signedHeaders(config.secrets[company],'POST',url,'Owner Mac task progress',body),body,redirect:'manual',signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok||data.accepted!==true)throw Error(data.error||'Progress receipt not accepted');return data;};
  const files=(await fs.readdir(dir)).filter(f=>/^[0-9a-f]{12}\.json$/.test(f)),linked=new Set(),errors=[];
  for(const file of files){const full=path.join(dir,file),record=await read(full),task=tasks.find(t=>t.id===record.link.taskId);linked.add(record.link.taskId);
   try{
    if(!task||task.identity!==identities[record.company]||task.agent!==record.link.agent)throw Error('Coordinator identity does not match explicit ticket link');
    if(!record.linkReceipt){const receipt=await send(record.company,{...record.link,runtimeId,action:'link'});record.linkReceipt={at:now,accepted:receipt.accepted};await write(full,record);}
    if(!record.pending){const checkpoint=await read(path.join(dir,task.id+'.checkpoint.json'));if(checkpoint){record.checkpoint=checkpoint.text;record.checkpointAt=checkpoint.at;}const milestones=eventsReader(task.id,record.eventCursor||0);const snapshot={milestones,state:task.state,stage:task.stage||'',heartbeatAt:task.heartbeat?Math.floor(task.heartbeat*1000):null,checkpoint:record.checkpoint||'',checkpointAt:record.checkpointAt||null,commit:task.head||null},substantive=JSON.stringify({...snapshot,heartbeatAt:null,milestones:[]}),previous=record.lastSnapshot&&JSON.stringify({...record.lastSnapshot,heartbeatAt:null,milestones:[]});
     if(!milestones.length&&substantive===previous&&now-(record.receipt?.at||0)<60000)continue;
     record.pending={action:'progress',taskId:task.id,runtimeId,sequence:(record.sequence||0)+1,snapshot};await write(full,record);
    }
    const receipt=await send(record.company,record.pending);if(receipt.sequence!==record.pending.sequence)throw Error('Progress receipt sequence mismatch');
    record.eventCursor=record.pending.snapshot.milestones?.at(-1)?.id||record.eventCursor||0;record.sequence=receipt.sequence;record.lastSnapshot=record.pending.snapshot;record.receipt={at:now,accepted:true,sequence:receipt.sequence};delete record.pending;delete record.error;await write(full,record);
   }catch(error){record.error={at:now,message:String(error.message).slice(0,300)};await write(full,record);errors.push({taskId:record.link.taskId,...record.error});}
  }
  const unlinked=tasks.filter(t=>Object.values(identities).includes(t.identity)&&!['complete','cancelled'].includes(t.state)&&!linked.has(t.id)).map(({id,identity,state})=>({id,identity,state}));
  const status={checkedAt:now,status:errors.length?'reporting_failed':'ok',linked:linked.size,unlinked,errors};await write(path.join(root,'task-progress-status.json'),status);return status;
 }finally{await handle.close();await fs.unlink(lock);}
}
async function main(){
 const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined,root=process.env.TICKET_OPERATIONS_HOME||path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),dir=path.join(root,'task-progress');
 const command=args[0];if(!['start','link','checkpoint','sync','status'].includes(command))throw Error('Use link --task ID --company PRODUCT --ticket UUID --owner EMAIL [--lead], checkpoint --task ID --text TEXT, sync, or status');
 if(command==='status'){console.log(JSON.stringify(await read(path.join(root,'task-progress-status.json')),null,2));return;}
 if(command==='start'){
  const company=get('--company'),ticket=get('--ticket'),owner=get('--owner'),title=get('--title');
  if(!identities[company]||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket||'')||!['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'].includes(owner)||!title?.trim())throw Error('Start requires company, exact ticket UUID, requesting owner and title');
  const repo=company==='wonplace'?path.join(os.homedir(),'Downloads/premier-ops-mvp'):path.join(os.homedir(),'.agent-workspaces/staging/the-voyage');
  const task=JSON.parse(execFileSync('agent-workspace',['start','--agent','codex','--repo',repo,'--task',title],{encoding:'utf8',timeout:60000,maxBuffer:100000}));
  if(!/^[0-9a-f]{12}$/.test(task.id||''))throw Error('Coordinator did not return a durable task ID; reconcile before retry');
  await fs.mkdir(dir,{recursive:true,mode:0o700});await fs.writeFile(path.join(dir,task.id+'.json'),JSON.stringify({company,link:{taskId:task.id,ticket,identity:identities[company],agent:'codex',requestedBy:owner,lead:args.includes('--lead')}})+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...task,ticket,reporting:'link queued; verify sync receipt before claiming CRM is updated'}));return;
 }
 if(command==='link'||command==='checkpoint'){
  const taskId=get('--task');if(!/^[0-9a-f]{12}$/.test(taskId||''))throw Error('Exact coordinator task ID required');const task=coordinatorTasks().find(t=>t.id===taskId);if(!task)throw Error('Coordinator task not found');await fs.mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,taskId+'.json');
  if(command==='link'){const company=get('--company'),ticket=get('--ticket'),requestedBy=get('--owner');if(task.identity!==identities[company]||!['codex','claude'].includes(task.agent)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket||'')||!['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'].includes(requestedBy))throw Error('Explicit allowed repository, ticket UUID and requesting owner required');const link={taskId,ticket,identity:task.identity,agent:task.agent,requestedBy,lead:args.includes('--lead')};await fs.writeFile(file,JSON.stringify({company,link})+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({queued:true,taskId}));return;}
  // Checkpoints use a separate atomic file so they cannot overwrite in-flight delivery state.
  const text=get('--text');if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Checkpoint text under 4000 characters required');if(!await read(file))throw Error('Link this task before recording a checkpoint');await write(path.join(dir,taskId+'.checkpoint.json'),{text:text.trim(),at:Date.now()});console.log(JSON.stringify({queued:true,taskId}));return;
 }
 const config=JSON.parse(await fs.readFile(process.env.COMPANY_OPERATIONS_CONFIG,'utf8'));console.log(JSON.stringify(await syncTaskProgress({root,config})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
