import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {signedHeaders} from '../src/company-signing.js';
const origin='https://voyage.tidelinestrats.com';
export async function startTicketPolling({root,config,agents,workerToken}){
 const file=path.join(root,'worker-id');let runtimeId;try{runtimeId=(await fs.readFile(file,'utf8')).trim();}catch{runtimeId=randomUUID();await fs.writeFile(file,runtimeId,{mode:0o600});}
 if(!/^[0-9a-f-]{36}$/i.test(runtimeId))throw Error('Invalid persisted worker identity');
 const source=async(company,value)=>{const url=origin+'/api/company-ticket-jobs/'+company,body=JSON.stringify(value),r=await fetch(url,{method:'POST',headers:await signedHeaders(config.secrets[company],'POST',url,'Owner Mac coding worker',body),body,redirect:'manual',signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Job source unavailable');return d;};
 const local=async(route,options={})=>{const r=await fetch('http://127.0.0.1:38918'+route,{...options,headers:{origin,'x-ticket-worker':workerToken,...options.headers},signal:AbortSignal.timeout(120000)}),d=await r.json();if(!r.ok)throw Error(d.error||'Local coding helper unavailable');return d;};
 let busy=false,lastDigest='';
 const update=async(company,j)=>{
  let localJob;try{localJob=await local('/jobs/'+j.localJobId);}catch{await source(company,{action:'ack',runtimeId,jobId:j.id,state:'delivery_uncertain',error:'Claim exists but local launch status cannot be reconciled. No automatic relaunch.'});return;}
  const t=localJob.task,failed=['worker_failed','launcher_failed'].includes(localJob.status),state=t?.state==='complete'?'completed':failed?'failed':t?.state==='cancelled'?'blocked':t?.state==='repair_required'||t?.state==='owner_lost'?'blocked':t?'running':'admitted';
  await source(company,{action:'ack',runtimeId,jobId:j.id,state,task:t||null,error:failed?'Local coding worker failed. Inspect the managed task and private helper logs.':undefined});
 };
 const tick=async()=>{if(busy)return;busy=true;try{
   const capabilities=typeof agents==='function'?agents():agents;
   for(const company of ['wonplace','voyage']){
    const jobs=await source(company,{action:'poll',runtimeId,agents:capabilities});for(const j of jobs.active)await update(company,j);
    for(const j of jobs.queued.slice(0,2)){
     let claimed;try{claimed=await source(company,{action:'claim',runtimeId,jobId:j.id});}catch{continue;}
     try{await local('/handoff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(claimed.envelope)});await source(company,{action:'ack',runtimeId,jobId:j.id,state:'admitted'});}catch(e){await source(company,{action:'ack',runtimeId,jobId:j.id,state:'delivery_uncertain',error:e.message+' Check local job '+claimed.envelope.payload.nonce+' before another launch.'});}
    }
   }
   try{const text=await fs.readFile(path.join(root,'last-digest.json'),'utf8');if(text!==lastDigest){const d=JSON.parse(text);await source('tideline',{action:'digest',digest:{day:d.day,status:d.status,messageId:d.messageId||null}});lastDigest=text;}}catch{}
   await fs.writeFile(path.join(root,'worker-status.json'),JSON.stringify({checkedAt:Date.now(),status:'ok',runtimeId})+'\n',{mode:0o600});
  }catch(error){await fs.writeFile(path.join(root,'worker-status.json'),JSON.stringify({checkedAt:Date.now(),status:'source_unavailable',error:error.message})+'\n',{mode:0o600});}finally{busy=false;}};
 const timer=setInterval(()=>{void tick();},15000);void tick();return()=>clearInterval(timer);
}
