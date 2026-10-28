import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startTicketPolling} from './ticket-worker-poll.mjs';
import {launchArgs,codingEnv,interactiveArgs,terminalCommand} from './ticket-coding-plan.mjs';
import {sessionLog} from './ticket-session-log.mjs';
import {signedHeaders,verifySource} from '../src/company-signing.js';
const origin='https://voyage.tidelinestrats.com',port=38918;
const home=os.homedir(),runtime=process.env.TICKET_OPERATIONS_HOME||path.dirname(path.dirname(fileURLToPath(import.meta.url))),stateRoot=path.join(runtime,'state');
const repos={wonplace:path.join(home,'Downloads/premier-ops-mvp'),voyage:path.join(home,'.agent-workspaces/staging/the-voyage')};
const config=JSON.parse(await fs.readFile(process.env.COMPANY_OPERATIONS_CONFIG,'utf8'));
if(config.voyageOrigin!==origin)throw Error('Wrong Voyage origin');await fs.mkdir(stateRoot,{recursive:true,mode:0o700});
const put=(file,v)=>fs.writeFile(file,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const get=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}};
function respond(res,status,data){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type','access-control-allow-private-network':'true','vary':'Origin'});res.end(JSON.stringify(data));}
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function body(req){let size=0,all='';for await(const c of req){size+=c.length;if(size>100000)throw Error('Handoff too large');all+=c;}return JSON.parse(all);}

const workerToken=randomBytes(32).toString('hex');
let authChecked=0,authAgents=[];
function availableAgents(){if(Date.now()-authChecked<60000)return authAgents;authChecked=Date.now();authAgents=['codex','claude'].filter(agent=>{try{if(agent==='codex'){execFileSync('codex',['login','status'],{stdio:'ignore',env:codingEnv(agent),timeout:10000});return true;}const d=JSON.parse(execFileSync('claude',['auth','status','--json'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],env:codingEnv(agent),timeout:10000}));return d.loggedIn===true;}catch{return false;}});return authAgents;}
let launchBusy=false;
createServer(async(req,res)=>{
 let ownsLaunch=false;
 if(req.headers.origin!==origin||req.headers.host!=='127.0.0.1:'+port||req.socket.remoteAddress!=='127.0.0.1'){respond(res,403,{error:'Local Voyage origin required'});return;}
 if(req.method==='OPTIONS'){respond(res,200,{ok:true});return;}
 try{
  if(req.method==='GET'&&req.url==='/health'){let digest=null;try{digest=await get(path.join(runtime,'last-digest.json'));}catch{}respond(res,200,{service:'tideline-ticket-operations',repositories:Object.keys(repos),dailyReview:{hour:9,timezone:'America/Chicago',coverage:'Owner Mac awake, native Mail and Muninn connector required',last:digest&&{day:digest.day,status:digest.status,messageId:digest.messageId}},agents:availableAgents()});return;}
  if(req.headers['x-ticket-worker']!==workerToken){respond(res,403,{error:'Owner Mac queue worker authentication required'});return;}
  const match=req.url.match(/^\/jobs\/([0-9a-f-]{36})(\/control)?$/i);
  if(match){const nonceFile=path.join(stateRoot,match[1]+'.json'),job=await get(nonceFile);if(!job){respond(res,404,{error:'Job not found'});return;}
   let log='';try{const f=await fs.open(path.join(stateRoot,job.id,'agent.log'));try{const stat=await f.stat(),bytes=Buffer.alloc(Math.min(stat.size,2*1024*1024));await f.read(bytes,0,bytes.length,0);log=bytes.toString();}finally{await f.close();}}catch{}
   const draft=job.mode==='terminal_draft'?await get(path.join(stateRoot,job.id,'draft-status.json')):null;
   const taskId=draft?.taskId||job.task||log.match(/Queued task ([a-f0-9]{12})/)?.[1];let task=null;if(taskId)try{const q=JSON.parse(execFileSync('agent-workspace',['queue',taskId],{encoding:'utf8',timeout:10000}));task={id:q.id,state:q.state,stage:q.stage};}catch{}
   const session=sessionLog(log);
   if(req.method==='POST'&&match[2]){const c=await body(req);if(job.mode!=='interactive'||!session.control||!task||task.state!=='working'||!['message','interrupt'].includes(c.action)||!/^[0-9a-f-]{36}$/i.test(c.id)||c.action==='message'&&(typeof c.text!=='string'||!c.text.trim()||c.text.length>12000))throw Error('Codex session is not ready for this command');
    const expected=path.join(home,'.agent-workspaces/coordinator/worker-data',task.id,'ticket-control');if(path.resolve(session.control)!==expected)throw Error('Unexpected session control path');
    const file=path.join(expected,c.id+'.json');if(!await get(file+'.accepted')){try{await fs.writeFile(file,JSON.stringify({id:c.id,sequence:Number.isSafeInteger(c.sequence)?c.sequence:0,action:c.action,text:c.text||''}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}respond(res,202,{accepted:true});return;}
   if(req.method==='GET'&&!match[2]){const {control,...publicSession}=session;respond(res,200,{jobId:job.id,status:job.status,task,draft:draft&&{pasted:draft.pasted===true,submitted:draft.submitted===true},...publicSession,error:job.signal?'Worker stopped by '+job.signal:job.exitCode?'Worker exited with code '+job.exitCode:job.error||null});return;}
  }
  if(req.method!=='POST'||req.url!=='/handoff'){respond(res,404,{error:'Not found'});return;}
  if(launchBusy){respond(res,409,{error:'Another handoff is being admitted. Retry after it finishes.'});return;}launchBusy=true;ownsLaunch=true;
  const envelope=await body(req),p=envelope.payload;
  if(!p||!['codex','claude'].includes(p.agent)||!['worker','interactive','terminal_draft'].includes(p.mode||'worker')||(p.mode||'worker')!=='worker'&&p.agent!=='codex'||!repos[p.company]||!['original','company'].includes(p.source)||!/^[0-9a-f-]{36}$/i.test(p.id)||!/^[0-9a-f-]{36}$/i.test(p.nonce)||typeof p.prompt!=='string'||p.prompt.length>50000||!Array.isArray(p.attachments)||p.attachments.length>13||!Number.isFinite(p.issuedAt)||Math.abs(Date.now()-p.issuedAt)>300000)throw Error('Invalid or expired ticket handoff. Copy the prompt for an unconfigured repository.');
  const verification=new Request(origin+'/ticket-handoff',{method:'POST',headers:{'x-voyage-time':envelope.time,'x-voyage-actor':p.actor,'x-voyage-signature':envelope.signature}});
  if(!await verifySource(verification,config.secrets[p.company],JSON.stringify(p)))throw Error('Ticket handoff signature is invalid');
  const nonceFile=path.join(stateRoot,p.nonce+'.json');let claimed;try{claimed=await fs.open(nonceFile,'wx',0o600);}catch{throw Error('This launch request was already used. Check the existing task.');}await claimed.close();
  // A durable coordinator task prevents double-launching this report, even after a restart.
  for(const name of p.mode==='terminal_draft'?[]:await fs.readdir(stateRoot)){const job=await get(path.join(stateRoot,name));if(job?.ticket===p.id&&job.company===p.company&&job.source===p.source&&job.task){try{const task=JSON.parse(execFileSync('agent-workspace',['queue',job.task],{encoding:'utf8',timeout:10000}));if(!['complete','cancelled'].includes(task.state))throw Object.assign(Error('A coding task already exists for this ticket: '+job.task),{duplicate:true});}catch(error){if(error.duplicate)throw error;throw Error('Could not reconcile the earlier coding task. No new agent was started.');}}else if(job?.ticket===p.id&&job.company===p.company&&alive(job.pid))throw Error('A coding launcher is already running for this ticket.');}
  const work=path.join(stateRoot,p.nonce);await fs.mkdir(work,{mode:0o700});const images=[];
  for(const [index,a]of p.attachments.entries()){
   if(a.mime&&!a.mime.startsWith('image/'))continue;
   if((a.ticketId&&!/^[0-9a-f-]{36}$/i.test(a.ticketId))||(a.source&&!['original','company'].includes(a.source))||typeof a.file!=='string'||!/^(?:\d|[0-9a-f-]{36})$/i.test(a.file))throw Error('Invalid image reference');
   const url=origin+'/api/company-ticket-image/'+p.company+'/'+(a.ticketId||p.id)+'/'+(a.source||p.source)+'/'+a.file,r=await fetch(url,{headers:await signedHeaders(config.secrets[p.company],'GET',url,'ticket-coding-launcher'),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Screenshot could not be retrieved; no agent was started.');
   const chunks=[];let size=0;for await(const c of r.body){size+=c.byteLength;if(size>6*1024*1024)throw Error('Screenshot too large for coding handoff');chunks.push(c);}const bytes=Buffer.concat(chunks);if(!(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes[0]===255&&bytes[1]===216)||bytes.toString('ascii',0,6).startsWith('GIF8')||(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')))throw Error('Attachment is not a supported screenshot; use Copy prompt to inspect it manually.');const file=path.join(work,'screenshot-'+index+'.png');await fs.writeFile(file,bytes,{mode:0o600});images.push(file);
  }
  const promptFile=path.join(work,'prompt.json'),prompt=p.prompt+'\n\nAttached local screenshots (read these before deciding on a repair):\n'+images.join('\n')+'\n\nUse resource-run for heavy checks. This is a supervised isolated workspace; commit scoped work and submit using AGENT_WORKSPACE_SESSION. Routine deployment goes through the coordinator; never push main or deploy directly. Record exact verification and unresolved owner gates.';
  await fs.writeFile(promptFile,JSON.stringify({prompt}),{mode:0o600});
  const job={id:p.nonce,ticket:p.id,company:p.company,source:p.source,agent:p.agent,mode:p.mode||'worker',requestedBy:p.actor,status:'queued',at:Date.now(),task:null};await put(nonceFile,job);
  if(p.mode==='terminal_draft'){
   const command=path.join(work,'Open Codex.command');await fs.writeFile(command,terminalCommand(p,repos[p.company],path.join(runtime,'scripts/ticket-terminal-draft.py'),promptFile),{mode:0o700});
   execFileSync('/usr/bin/open',['-a','Terminal',command],{timeout:10000});job.status='draft_opened';await put(nonceFile,job);respond(res,202,{jobId:job.id,status:job.status,message:'Terminal opened with an unsubmitted Codex draft.'});return;
  }
  const args=p.mode==='interactive'?interactiveArgs(p,repos[p.company],path.join(runtime,'scripts/ticket-codex-session.mjs'),promptFile):launchArgs(p,repos[p.company]);if(p.mode!=='interactive'&&p.agent==='codex'&&images.length)args.splice(args.length-1,0,...images.flatMap(f=>['--image',f]));
  const stdinFile=path.join(work,'prompt.txt');await fs.writeFile(stdinFile,prompt,{mode:0o600});
  const input=await fs.open(stdinFile,'r'),out=await fs.open(path.join(work,'agent.log'),'a',0o600);
  // Independent process group and file-backed IO survive helper reloads. No pipe EOF or unconsumed pipe can terminate the supervisor.
  const child=spawn('agent-workspace',args,{cwd:home,detached:true,stdio:[input.fd,out.fd,out.fd],env:codingEnv(p.agent)});job.pid=child.pid;job.status='admitted';await put(nonceFile,job);await input.close();await out.close();
  child.on('error',error=>{job.status='launcher_failed';job.error=error.message;void put(nonceFile,job);});child.on('exit',(code,signal)=>{job.status=code===0?'worker_exited':'worker_failed';job.exitCode=code;job.signal=signal;void put(nonceFile,job);});child.unref();

  respond(res,202,{jobId:job.id,status:job.status,message:'Coding agent queued in a managed isolated workspace. A queue entry is not a completed fix.'});
 }catch(error){respond(res,400,{error:error.message});}finally{if(ownsLaunch)launchBusy=false;}
}).listen(port,'127.0.0.1',()=>{console.log('Ticket operations listening on 127.0.0.1:'+port);void startTicketPolling({root:runtime,config,workerToken,agents:availableAgents}).catch(()=>console.error('Ticket queue worker could not initialize'));});
