// A ticket contract around the existing coordinator CLI, not a replacement coordinator.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {signedHeaders} from '../src/company-signing.js';
export const products={'github.com/quanbuilds/premieros':'wonplace','github.com/quanbuilds/the-voyage':'voyage'};
export function gateArguments(args){
 const result=[],ticket={};let command=false;
 for(let i=0;i<args.length;i++){
  const a=args[i];if(a==='--'){command=true;result.push(a);continue;}
  const match=!command&&a.match(/^(--crm-ticket|--crm-owner|--crm-lead)(?:=(.*))?$/);
  if(!match){result.push(a);continue;}
  const key=match[1].slice(6);if(key in ticket)throw Error('Duplicate CRM argument');
  if(key==='lead'){if(match[2]!==undefined)throw Error('Use --crm-lead without a value');ticket.lead=true;continue;}
  const value=match[2]??args[++i];if(!value||value.startsWith('--'))throw Error('Missing '+match[1]);ticket[key]=value;
 }
 return {args:result,ticket};
}
export function repositoryProduct(repo){
 const remote=execFileSync('git',['-C',repo,'remote','get-url','origin'],{encoding:'utf8',timeout:10000}).trim().replace(/^git@/,'').replace('github.com:','github.com/').replace(/^https?:\/\//,'').replace(/\.git$/,'').replace(/\/$/,'');return products[remote]||null;
}
export function validateStart(ticket){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticket.ticket||'')||typeof ticket.owner!=='string'||ticket.owner.length>150)throw Error('Ticket reporting required: add --crm-ticket FULL_UUID --crm-owner REQUESTING_OWNER. No task was started. Existing task control commands remain available.');
}
export function validateSubmission(task,record,head,contract){
 if(!products[task.identity]||task.created*1000<contract.enforcedAt)return;
 if(!record||record.link.taskId!==task.id||record.link.identity!==task.identity||record.link.agent!==task.agent||!record.linkReceipt?.accepted)throw Error('Submission held: this new task needs an accepted CRM link. Use ticket-task-progress.mjs link, then wait for its receipt.');
 if(!record.reportReceipt?.accepted||record.reportReceipt.commit!==head||record.queuedReportId&&record.queuedReportId!==record.reportReceipt.reportId)throw Error('Submission held: save a structured report for the current committed HEAD with '+(contract.reportCommand||'ticket-task-progress.mjs')+' report --task '+task.id+' --file REPORT.json and wait for its accepted receipt. Include checks and remaining gates.');
 if(record.error)throw Error('Submission held: progress reporting has an unresolved delivery error.');
}
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function runGate(raw,{root=path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),core=path.join(os.homedir(),'.agent-workspaces/coordinator/coordinator.py'),transport=fetch}={}){
 const {args,ticket}=gateArguments(raw),command=args[0];
 const argument=name=>{const equal=args.find(a=>a.startsWith(name+'='));return equal?equal.slice(name.length+1):args[args.indexOf(name)+1];};
 const invoke=()=>{const child=spawn('/usr/bin/python3',[core,...args],{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?128:1);});};
 if(!['start','launch','submit'].includes(command)||args.includes('--help')){invoke();return;}
 if(command==='submit'){
  // Queue is the coordinator's authorized RPC when called from a managed sandbox.
  const task=JSON.parse(execFileSync('/usr/bin/python3',[core,'queue',process.env.AGENT_COORDINATOR_TASK||args.slice(1).find(a=>/^[0-9a-f]{12}$/.test(a))||''],{encoding:'utf8',timeout:10000,maxBuffer:500000}));
  const contract=products[task.identity]?await read(path.join(root,'reporting-contract.json')):null;if(products[task.identity]&&!contract?.enforcedAt)throw Error('Reporting contract missing; restore the audited contract before submitting governed work.');
  if(products[task.identity]&&task.created*1000>=contract.enforcedAt){const record=await read(path.join(root,'task-progress',task.id+'.json')),head=execFileSync('git',['-C',task.worktree,'rev-parse','HEAD'],{encoding:'utf8',timeout:10000}).trim();const queued=await read(path.join(root,'task-progress',task.id+'.report.json'))||await read(path.join(os.homedir(),'.agent-workspaces/coordinator/worker-data',task.id,'ticket-report.json'));if(record&&queued)record.queuedReportId=queued.report?.requestId;validateSubmission(task,record,head,contract);}
  invoke();return;
 }
 const repo=argument('--repo');if(!repo||repo===command){invoke();return;}
 const company=repositoryProduct(repo);if(!company){invoke();return;}
 validateStart(ticket);const contract=await read(path.join(root,'reporting-contract.json'));if(!contract?.enforcedAt)throw Error('Reporting contract missing; restore the audited contract before starting governed work.');const agent=argument('--agent');if(!['codex','claude'].includes(agent))throw Error('Ticket reporting supports Codex and Claude for these products.');
 const config=JSON.parse(await fs.readFile(contract.configPath,'utf8')),runtimeId=(await fs.readFile(path.join(root,'worker-id'),'utf8')).trim(),identity=Object.keys(products).find(k=>products[k]===company);
 const send=async value=>{const url='https://voyage.tidelinestrats.com/api/company-ticket-task-progress/'+company,body=JSON.stringify({...value,runtimeId}),r=await transport(url,{method:'POST',headers:await signedHeaders(config.secrets[company],'POST',url,'Owner coordinator ticket contract',body),body,redirect:'manual',signal:AbortSignal.timeout(15000)}),data=await r.json();if(!r.ok||data.accepted!==true)throw Error(data.error||'Ticket validation unavailable');return data;};
 const link={ticket:ticket.ticket,identity,agent,requestedBy:ticket.owner,lead:ticket.lead===true};await send({...link,action:'validate',taskId:'000000000000'});
 const dir=path.join(root,'task-progress');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const register=async taskId=>{
  const file=path.join(dir,taskId+'.json'),record={company,link:{...link,taskId}};
  try{await fs.writeFile(file,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});}catch{throw Error('Coordinator task '+taskId+' was created but its link could not be queued. Do not relaunch; reconcile this task ID.');}
  // Link is durable before contacting CRM. A lost response is retried by the existing worker.
  try{await send({...record.link,action:'link'});}catch(error){console.error('CRM link queued for task '+taskId+': '+error.message);}
 };
 if(command==='start'){
  const task=JSON.parse(execFileSync('/usr/bin/python3',[core,...args],{encoding:'utf8',timeout:60000,maxBuffer:500000}));if(!/^[0-9a-f]{12}$/.test(task.id||''))throw Error('Coordinator task identity unavailable; reconcile before retry');await register(task.id);console.log(JSON.stringify({...task,ticket:ticket.ticket,reporting:'Explicit link queued; confirm receipts before submission.'}));return;
 }
 // Preserve the supervised launcher's stdin/stdout, task ownership and sandbox.
 const child=spawn('/usr/bin/python3',[core,...args],{stdio:['inherit','inherit','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});let buffer='',registered=false,registration=Promise.resolve();
 child.stderr.on('data',chunk=>{process.stderr.write(chunk);if(registered)return;buffer=(buffer+chunk.toString()).slice(-1000);const match=buffer.match(/Queued task ([0-9a-f]{12})/);if(match){registered=true;registration=register(match[1]).catch(error=>{console.error('Task '+match[1]+' requires link reconciliation: '+error.message);process.exitCode=1;});}});
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',async(code,signal)=>{await registration;process.exitCode=process.exitCode||code||(signal?128:0);});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runGate(process.argv.slice(2)).catch(error=>{console.error('agent-workspace: '+error.message);process.exitCode=1;});
