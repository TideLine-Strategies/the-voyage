import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {launchArgs} from './ticket-coding-plan.mjs';
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

let launchBusy=false;
createServer(async(req,res)=>{
 let ownsLaunch=false;
 if(req.headers.origin!==origin||req.headers.host!=='127.0.0.1:'+port||req.socket.remoteAddress!=='127.0.0.1'){respond(res,403,{error:'Local Voyage origin required'});return;}
 if(req.method==='OPTIONS'){respond(res,200,{ok:true});return;}
 try{
  if(req.method==='GET'&&req.url==='/health'){let digest=null;try{digest=await get(path.join(runtime,'last-digest.json'));}catch{}respond(res,200,{service:'tideline-ticket-operations',repositories:Object.keys(repos),dailyReview:{hour:9,timezone:'America/Chicago',coverage:'Owner Mac awake, native Mail and Muninn connector required',last:digest&&{day:digest.day,status:digest.status,messageId:digest.messageId}},agents:['codex','claude'].filter(name=>{try{execFileSync('/usr/bin/which',[name],{stdio:'ignore'});return true;}catch{return false;}})});return;}
  if(req.method==='GET'&&/^\/jobs\/[0-9a-f-]{36}$/i.test(req.url)){const job=await get(path.join(stateRoot,req.url.split('/')[2]+'.json'));if(!job){respond(res,404,{error:'Job not found'});return;}let task=null;if(job.task)try{const q=JSON.parse(execFileSync('agent-workspace',['queue',job.task],{encoding:'utf8',timeout:10000}));task={id:q.id,state:q.state,stage:q.stage};}catch{}respond(res,200,{jobId:job.id,status:job.status,task});return;}
  if(req.method!=='POST'||req.url!=='/handoff'){respond(res,404,{error:'Not found'});return;}
  if(launchBusy){respond(res,409,{error:'Another handoff is being admitted. Retry after it finishes.'});return;}launchBusy=true;ownsLaunch=true;
  const envelope=await body(req),p=envelope.payload;
  if(!p||!['codex','claude'].includes(p.agent)||!repos[p.company]||!['original','company'].includes(p.source)||!/^[0-9a-f-]{36}$/i.test(p.id)||!/^[0-9a-f-]{36}$/i.test(p.nonce)||typeof p.prompt!=='string'||p.prompt.length>50000||!Array.isArray(p.attachments)||p.attachments.length>13||!Number.isFinite(p.issuedAt)||Math.abs(Date.now()-p.issuedAt)>300000)throw Error('Invalid or expired ticket handoff. Copy the prompt for an unconfigured repository.');
  const verification=new Request(origin+'/ticket-handoff',{method:'POST',headers:{'x-voyage-time':envelope.time,'x-voyage-actor':p.actor,'x-voyage-signature':envelope.signature}});
  if(!await verifySource(verification,config.secrets[p.company],JSON.stringify(p)))throw Error('Ticket handoff signature is invalid');
  const nonceFile=path.join(stateRoot,p.nonce+'.json');let claimed;try{claimed=await fs.open(nonceFile,'wx',0o600);}catch{throw Error('This launch request was already used. Check the existing task.');}await claimed.close();
  // A durable coordinator task prevents double-launching this report, even after a restart.
  for(const name of await fs.readdir(stateRoot)){const job=await get(path.join(stateRoot,name));if(job?.ticket===p.id&&job.company===p.company&&job.source===p.source&&job.task){try{const task=JSON.parse(execFileSync('agent-workspace',['queue',job.task],{encoding:'utf8',timeout:10000}));if(!['complete','cancelled'].includes(task.state))throw Object.assign(Error('A coding task already exists for this ticket: '+job.task),{duplicate:true});}catch(error){if(error.duplicate)throw error;throw Error('Could not reconcile the earlier coding task. No new agent was started.');}}else if(job?.ticket===p.id&&job.company===p.company&&alive(job.pid))throw Error('A coding launcher is already running for this ticket.');}
  const work=path.join(stateRoot,p.nonce);await fs.mkdir(work,{mode:0o700});const images=[];
  for(const [index,a]of p.attachments.entries()){
   if(a.mime&&!a.mime.startsWith('image/'))continue;
   if((a.ticketId&&!/^[0-9a-f-]{36}$/i.test(a.ticketId))||(a.source&&!['original','company'].includes(a.source))||typeof a.file!=='string'||!/^(?:\d|[0-9a-f-]{36})$/i.test(a.file))throw Error('Invalid image reference');
   const url=origin+'/api/company-ticket-image/'+p.company+'/'+(a.ticketId||p.id)+'/'+(a.source||p.source)+'/'+a.file,r=await fetch(url,{headers:await signedHeaders(config.secrets[p.company],'GET',url,'ticket-coding-launcher'),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Screenshot could not be retrieved; no agent was started.');
   const chunks=[];let size=0;for await(const c of r.body){size+=c.byteLength;if(size>6*1024*1024)throw Error('Screenshot too large for coding handoff');chunks.push(c);}const bytes=Buffer.concat(chunks);if(!(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes[0]===255&&bytes[1]===216)||bytes.toString('ascii',0,6).startsWith('GIF8')||(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')))throw Error('Attachment is not a supported screenshot; use Copy prompt to inspect it manually.');const file=path.join(work,'screenshot-'+index+'.png');await fs.writeFile(file,bytes,{mode:0o600});images.push(file);
  }
  const args=launchArgs(p,repos[p.company]);if(p.agent==='codex'&&images.length)args.splice(args.length-1,0,...images.flatMap(f=>['--image',f]));
  const child=spawn('agent-workspace',args,{cwd:home,stdio:['pipe','pipe','pipe'],env:{...process.env,CLAUDECODE:undefined}}),job={id:p.nonce,ticket:p.id,company:p.company,source:p.source,agent:p.agent,requestedBy:p.actor,pid:child.pid,status:'queued',at:Date.now(),task:null};await put(nonceFile,job);
  const out=await fs.open(path.join(work,'agent.log'),'a',0o600);let logged=0;const log=c=>{if(logged>2000000)return;logged+=c.length;void out.write(c).catch(()=>{});};child.stdout.on('data',log);child.stderr.on('data',c=>{const match=String(c).match(/Queued task ([a-f0-9]{12})/);if(match){job.task=match[1];job.status='running';void put(nonceFile,job);}log(c);});
  child.on('error',()=>{job.status='launcher_failed';void put(nonceFile,job);});child.on('exit',code=>{job.status=code===0?'worker_exited':'worker_failed';job.exitCode=code;void put(nonceFile,job);void out.close().catch(()=>{});});
  child.stdin.on('error',()=>{});child.stdin.end(p.prompt+'\n\nAttached local screenshots (read these before deciding on a repair):\n'+images.join('\n')+'\n\nUse resource-run for heavy checks. This is a supervised isolated workspace; commit scoped work and submit using AGENT_WORKSPACE_SESSION. Routine deployment goes through the coordinator; never push main or deploy directly. Record exact verification and unresolved owner gates.');
  respond(res,202,{jobId:job.id,status:job.status,message:'Coding agent queued in a managed isolated workspace. A queue entry is not a completed fix.'});
 }catch(error){respond(res,400,{error:error.message});}finally{if(ownsLaunch)launchBusy=false;}
}).listen(port,'127.0.0.1',()=>console.log('Ticket operations listening on 127.0.0.1:'+port));
