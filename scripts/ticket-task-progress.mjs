import {blockerForTask,taskLabel} from '../src/task-blockers.js';
import {workReportFields} from '../src/ticket-work-report.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {signedHeaders} from '../src/company-signing.js';
const origin='https://voyage.tidelinestrats.com';
const identities={wonplace:'github.com/quanbuilds/premieros',voyage:'github.com/quanbuilds/the-voyage'};
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const write=async(file,value)=>{const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value)+'\n',{mode:0o600});await fs.rename(tmp,file);};
export function coordinatorTasks(){
 // Explicit projection: never select capabilities, environment, command text or private logs.
 const script="import sqlite3,json,sys; d=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); d.row_factory=sqlite3.Row; print(json.dumps([dict(r) for r in d.execute(\"SELECT t.id,t.task,t.updated,CASE WHEN lower(t.error) LIKE '%scope%' OR lower(t.error) LIKE '%merge conflict%' THEN 'integration' WHEN lower(t.error) LIKE '%verify-live failed%' THEN 'verification' WHEN lower(t.error) LIKE '%test failed%' THEN 'checks' WHEN lower(t.error) LIKE '%authentication%' OR lower(t.error) LIKE '%permission%' THEN 'access' ELSE NULL END failureKind,t.identity,t.agent,t.state,t.stage,t.heartbeat,t.head,t.created,t.delivery,CAST(r.at*1000 AS INTEGER) acceptanceAt,json_extract(r.detail,'$.commit') liveCommit,json_extract(r.detail,'$.deploymentId') deploymentId,json_extract(r.detail,'$.accepted') liveAccepted FROM tasks t LEFT JOIN receipts r ON r.task_id=t.id AND r.stage='live-acceptance'\")]))";
 return JSON.parse(execFileSync('/usr/bin/python3',['-c',script,path.join(os.homedir(),'.agent-workspaces/coordinator/tasks.sqlite3')],{encoding:'utf8',timeout:10000,maxBuffer:4000000}));
}
export function coverageGroup(state){return ['queued','admitting','working','submitted','releasing','awaiting_remote','retry_wait'].includes(state)?'current':'recovery';}
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
  const files=(await fs.readdir(dir)).filter(f=>/^[0-9a-f]{12}\.json$/.test(f)),linked=new Set(),errors=[],roomLabels=new Map();
  for(const file of files){const full=path.join(dir,file),record=await read(full),task=tasks.find(t=>t.id===record.link.taskId);linked.add(record.link.taskId);roomLabels.set(record.link.taskId,record.receipt?.label);
   try{
    if(!task||task.identity!==identities[record.company]||task.agent!==record.link.agent)throw Error('Coordinator identity does not match explicit ticket link');
    if(!record.linkReceipt){const receipt=await send(record.company,{...record.link,runtimeId,action:'link'});record.linkReceipt={at:now,accepted:receipt.accepted};await write(full,record);}
    const report=await read(path.join(dir,task.id+'.report.json'))||await read(path.join(os.homedir(),'.agent-workspaces/coordinator/worker-data',task.id,'ticket-report.json'));
    if(report&&record.reportReceipt?.reportId!==report.report.requestId){
     if(report.taskId!==task.id||report.action!=='report')throw Error('Report task identity mismatch');
     const receipt=await send(record.company,{...report,runtimeId});if(receipt.reportId!==report.report.requestId||receipt.commit!==report.commit||receipt.taskId!==task.id)throw Error('Report receipt mismatch');
     record.reportReceipt={at:now,accepted:true,reportId:receipt.reportId,commit:receipt.commit};delete record.error;await write(full,record);
    }
    if(!record.pending){const checkpoint=await read(path.join(dir,task.id+'.checkpoint.json'))||await read(path.join(os.homedir(),'.agent-workspaces/coordinator/worker-data',task.id,'ticket-checkpoint.json'));if(checkpoint){record.checkpoint=checkpoint.text;record.checkpointAt=checkpoint.at;}const milestones=eventsReader(task.id,record.eventCursor||0);const snapshot={...(blockerForTask(task,now)?{blocker:blockerForTask(task,now)}:{}),...(task.task?{taskTitle:task.task.slice(0,200)}:{}),delivery:task.delivery||'merge',liveAcceptance:task.liveAccepted===1?{commit:task.liveCommit,deploymentId:task.deploymentId,at:task.acceptanceAt}:null,milestones,state:task.state,stage:task.stage||'',heartbeatAt:task.heartbeat?Math.floor(task.heartbeat*1000):null,checkpoint:record.checkpoint||'',checkpointAt:record.checkpointAt||null,commit:task.head||null},substantive=JSON.stringify({...snapshot,heartbeatAt:null,milestones:[]}),previous=record.lastSnapshot&&JSON.stringify({...record.lastSnapshot,heartbeatAt:null,milestones:[]});
     if(!milestones.length&&substantive===previous&&now-(record.receipt?.at||0)<60000)continue;
     record.pending={action:'progress',taskId:task.id,runtimeId,sequence:(record.sequence||0)+1,snapshot};await write(full,record);
    }
    const receipt=await send(record.company,record.pending);if(receipt.sequence!==record.pending.sequence)throw Error('Progress receipt sequence mismatch');
    record.eventCursor=record.pending.snapshot.milestones?.at(-1)?.id||record.eventCursor||0;record.sequence=receipt.sequence;record.lastSnapshot=record.pending.snapshot;record.receipt={at:now,accepted:true,sequence:receipt.sequence,label:receipt.label||record.receipt?.label};roomLabels.set(task.id,record.receipt.label);delete record.pending;delete record.error;await write(full,record);
   }catch(error){record.error={at:now,message:String(error.message).slice(0,300)};await write(full,record);errors.push({taskId:record.link.taskId,company:record.company,...record.error});}
  }
  const unlinked=tasks.filter(t=>Object.values(identities).includes(t.identity)&&!['complete','cancelled'].includes(t.state)&&!linked.has(t.id)).map(({id,identity,state})=>({id,identity,state,group:coverageGroup(state)}));
  const palette=['#83bcb0','#8faed5','#baa1d3','#c4b385','#87b9ca','#c599aa','#a2bb87','#aeabe0'];
  const roomTasks=tasks.filter(t=>linked.has(t.id)&&coverageGroup(t.state)==='current'&&t.heartbeat&&now-t.heartbeat*1000<90000).slice(0,64).map(t=>{let h=0;for(const c of t.id)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return {taskId:t.id,label:taskLabel(roomLabels.get(t.id)||t.task||t.id),color:palette[h%palette.length],state:t.state,expiresAt:Math.floor(t.heartbeat*1000)+90000};});
  await write(path.join(root,'task-room.json'),{checkedAt:now,tasks:roomTasks});
  const status={checkedAt:now,status:errors.length?'reporting_failed':'ok',linked:linked.size,unlinked,errors};await write(path.join(root,'task-progress-status.json'),status);return status;
 }finally{await handle.close();await fs.unlink(lock);}
}
async function main(){
 const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined,root=process.env.TICKET_OPERATIONS_HOME||path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),dir=path.join(root,'task-progress');
 const command=args[0];if(!['start','link','checkpoint','report','sync','status'].includes(command))throw Error('Use link --task ID --company PRODUCT --ticket UUID --owner EMAIL [--lead], checkpoint --task ID --text TEXT, sync, or status');
 if(command==='status'){const taskId=get('--task');if(taskId&&!/^[0-9a-f]{12}$/.test(taskId))throw Error('Exact task ID required');const record=taskId?await read(path.join(dir,taskId+'.json')):await read(path.join(root,'task-progress-status.json'));console.log(JSON.stringify(record,null,2));return;}
 if(command==='start'){
  const company=get('--company'),ticket=get('--ticket'),owner=get('--owner'),title=get('--title');
  if(!identities[company]||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket||'')||!['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'].includes(owner)||!title?.trim())throw Error('Start requires company, exact ticket UUID, requesting owner and title');
  const repo=company==='wonplace'?path.join(os.homedir(),'Downloads/premier-ops-mvp'):path.join(os.homedir(),'.agent-workspaces/staging/the-voyage');
  const gated=await read(path.join(root,'reporting-contract.json'));const startArgs=['start','--agent','codex','--repo',repo,'--task',title,...gated?.enforcedAt?['--crm-ticket',ticket,'--crm-owner',owner,...args.includes('--lead')?['--crm-lead']:[]]:[]];
  const task=JSON.parse(execFileSync('agent-workspace',startArgs,{encoding:'utf8',timeout:60000,maxBuffer:100000}));
  if(!/^[0-9a-f]{12}$/.test(task.id||''))throw Error('Coordinator did not return a durable task ID; reconcile before retry');
  await fs.mkdir(dir,{recursive:true,mode:0o700});if(!gated?.enforcedAt)await fs.writeFile(path.join(dir,task.id+'.json'),JSON.stringify({company,link:{taskId:task.id,ticket,identity:identities[company],agent:'codex',requestedBy:owner,lead:args.includes('--lead')}})+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({...task,ticket,reporting:'link queued; verify sync receipt before claiming CRM is updated'}));return;
 }
 if(['link','checkpoint','report'].includes(command)){
  const taskId=get('--task');if(!/^[0-9a-f]{12}$/.test(taskId||''))throw Error('Exact coordinator task ID required');const task=(command==='report'||process.env.AGENT_COORDINATOR_TASK===taskId)?JSON.parse(execFileSync('agent-workspace',['queue',taskId],{encoding:'utf8',timeout:10000})):coordinatorTasks().find(t=>t.id===taskId);if(!task)throw Error('Coordinator task not found');if(process.env.AGENT_COORDINATOR_TASK!==taskId)await fs.mkdir(dir,{recursive:true,mode:0o700});const file=path.join(dir,taskId+'.json');
  if(command==='link'){const company=get('--company'),ticket=get('--ticket'),requestedBy=get('--owner');if(task.identity!==identities[company]||!['codex','claude'].includes(task.agent)||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket||'')||!['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'].includes(requestedBy))throw Error('Explicit allowed repository, ticket UUID and requesting owner required');const link={taskId,ticket,identity:task.identity,agent:task.agent,requestedBy,lead:args.includes('--lead')};await fs.writeFile(file,JSON.stringify({company,link})+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({queued:true,taskId}));return;}
  if(command==='report'){
   const fileName=get('--file');if(!fileName||!task.worktree)throw Error('Committed task worktree and --file JSON required');const stat=await fs.stat(fileName);if(stat.size>32000)throw Error('Report JSON exceeds 32 KB');const value=JSON.parse(await fs.readFile(fileName,'utf8'));
   if(Object.keys(value).some(k=>!['requestId','summary','changes','checks','links'].includes(k))||typeof value.checks!=='string'||!value.checks.trim())throw Error('Report accepts summary, changes, checks, links and optional requestId only');
   const delivered=['complete','cancelled'].includes(task.state)&&/^[0-9a-f]{40}$/.test(task.head||''),commit=delivered?task.head:execFileSync('git',['-C',task.worktree,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(delivered)execFileSync('git',['-C',task.repo,'cat-file','-e',commit+'^{commit}'],{stdio:'ignore'});else{execFileSync('git',['-C',task.worktree,'diff','--quiet'],{stdio:'ignore'});execFileSync('git',['-C',task.worktree,'diff','--cached','--quiet'],{stdio:'ignore'});}
   const digest=createHash('sha256').update(JSON.stringify({taskId,commit,value})).digest('hex'),requestId=value.requestId||digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32),fields=workReportFields({...value,requestId,performer:task.agent}),{performer,...report}=fields;
   const target=process.env.AGENT_COORDINATOR_TASK===taskId?path.join(process.env.TMPDIR,'ticket-report.json'):path.join(dir,taskId+'.report.json');await write(target,{action:'report',taskId,commit,report});console.log(JSON.stringify({queued:true,taskId,requestId,commit,message:'Wait for accepted reportReceipt before submission; status is separate from ticket acceptance.'}));return;
  }
  // Checkpoints use a separate atomic file so they cannot overwrite in-flight delivery state.
  const text=get('--text');if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Checkpoint text under 4000 characters required');if(!await read(file))throw Error('Link this task before recording a checkpoint');await write(process.env.AGENT_COORDINATOR_TASK===taskId?path.join(process.env.TMPDIR,'ticket-checkpoint.json'):path.join(dir,taskId+'.checkpoint.json'),{text:text.trim(),at:Date.now()});console.log(JSON.stringify({queued:true,taskId}));return;
 }
 const config=JSON.parse(await fs.readFile(process.env.COMPANY_OPERATIONS_CONFIG,'utf8'));console.log(JSON.stringify(await syncTaskProgress({root,config})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
