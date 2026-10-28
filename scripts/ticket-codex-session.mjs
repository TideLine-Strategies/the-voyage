// Private stdio app-server bridge. The coordinator supplies the isolated cwd.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
const input=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const control=path.join(process.env.TMPDIR,'ticket-control');await fs.mkdir(control,{recursive:true,mode:0o700});
console.log(JSON.stringify({type:'ticket.ready',control}));
const child=spawn('codex',['app-server','--listen','stdio://'],{stdio:['pipe','pipe','inherit']});
let seq=0,threadId,turnId,busy=false;const pending=new Map();
const emit=(type,value)=>console.log(JSON.stringify({type,...value}));
const write=m=>child.stdin.write(JSON.stringify(m)+'\n');
const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Codex request timed out: '+method));},60000);pending.set(id,{resolve,reject,timer});write({id,method,params});});
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
 if(m.id!==undefined&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}
 if(m.id!==undefined){write({id:m.id,error:{code:-32601,message:'This ticket interface cannot grant additional permissions. Use the terminal for owner interaction.'}});emit('ticket.notice',{text:'Codex needs an owner interaction: '+m.method});return;}
 if(m.method==='item/agentMessage/delta')emit('ticket.delta',{text:String(m.params.delta||'').slice(0,12000)});
 if(m.method==='turn/started'){busy=true;turnId=m.params.turn.id;emit('ticket.status',{status:'working'});}
 if(m.method==='turn/completed'){busy=false;emit('ticket.status',{status:m.params.turn.status,error:m.params.turn.error?.message||null});}
});
child.on('error',e=>{emit('ticket.error',{text:e.message});process.exitCode=1;});
child.on('exit',(code,signal)=>{emit('ticket.exit',{code,signal});process.exit(code||1);});
await rpc('initialize',{clientInfo:{name:'voyage_ticket_codex',title:'Voyage ticket Codex',version:'1.0.0'}});write({method:'initialized',params:{}});
const start=await rpc('thread/start',{cwd:process.cwd(),sandbox:'workspace-write',approvalPolicy:'on-request',developerInstructions:'Work only on the assigned product ticket in this managed isolated worktree. Read AGENTS.md. Use resource-run for heavy checks. Commit scoped work and submit using AGENT_WORKSPACE_SESSION. Do not merge or deploy directly. Report live acceptance honestly.'});threadId=start.thread.id;emit('ticket.thread',{threadId});
const send=async text=>{if(busy)throw Error('Wait for Codex to finish, or interrupt the active turn first.');busy=true;try{await rpc('turn/start',{threadId,input:[{type:'text',text}]});}catch(e){busy=false;throw e;}};
if(process.argv.includes('--probe')){console.log(JSON.stringify({type:'ticket.probe',initialized:true,threadId,turnStarted:false}));child.kill('SIGTERM');process.exit(0);}
await send(input.prompt);
let checking=false;setInterval(async()=>{if(checking)return;checking=true;try{for(const name of (await fs.readdir(control)).filter(n=>/^[0-9a-f-]{36}\.json$/.test(n)).sort()){const file=path.join(control,name),c=JSON.parse(await fs.readFile(file,'utf8'));await fs.rename(file,file+'.accepted');try{if(c.action==='interrupt'){if(busy&&turnId)await rpc('turn/interrupt',{threadId,turnId});}else if(c.action==='message'){if(busy&&turnId)await rpc('turn/steer',{threadId,expectedTurnId:turnId,input:[{type:'text',text:c.text}]});else await send(c.text);}emit('ticket.command',{id:c.id,accepted:true});}catch(e){emit('ticket.command',{id:c.id,accepted:false,error:e.message});}}}catch(e){emit('ticket.error',{text:e.message});}finally{checking=false;}},500);
