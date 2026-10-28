import fs from 'node:fs/promises';import path from 'node:path';import {signedHeaders} from '../src/company-signing.js';
const uuid=/^[0-9a-f-]{36}$/i,origin='https://voyage.tidelinestrats.com';
const read=async(file,max)=>{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Invalid evidence file');return JSON.parse(await fs.readFile(file,'utf8'));};
export async function evidenceContext(root,job){
 const work=path.join(root,'state',job.id),outbox=path.join(work,'completion-evidence');await fs.mkdir(outbox,{recursive:true,mode:0o700});const context=path.join(work,'evidence-context.json');
 const value={version:1,localJobId:job.id,company:job.company,ticket:job.ticket,outbox};try{await fs.writeFile(context,JSON.stringify(value),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}return context;
}
export function evidenceInstructions(root,nonce){const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";return '\n\nCompletion screenshots: after verifying the fix, capture and inspect relevant screenshot(s), then attach them to this same ticket with:\n'+quote(process.execPath)+' '+quote(path.join(root,'scripts/ticket-evidence.mjs'))+' --context '+quote(path.join(root,'state',nonce,'evidence-context.json'))+' --file /absolute/path/to/screenshot.png --caption "What was verified"\nRepeat --file for multiple screenshots. PNG, JPEG or WebP, up to 1 MB each and 10 per ticket. Resize or compress oversized screenshots before uploading. Wait for accepted:true and record the returned attachment IDs in your completion note. Do not claim an upload succeeded without a receipt. Original staff reports receive evidence on their linked Company ticket. Attaching evidence does not resolve the ticket. If screenshot capture is unavailable, report that limitation honestly. Never upload secrets or unrelated private records.';}
export async function drainTicketEvidence({root,config,transport=fetch}){
 const state=path.join(root,'state');let sent=0;for(const name of await fs.readdir(state)){
  if(!/^[0-9a-f-]{36}\.json$/i.test(name))continue;let job;try{job=await read(path.join(state,name),100000);}catch{continue;}if(!job||job.agent!=='codex'||!['wonplace','voyage'].includes(job.company)||!uuid.test(job.id))continue;
  await evidenceContext(root,job);const outbox=path.join(state,job.id,'completion-evidence');
  for(const name of await fs.readdir(outbox)){
   if(!/^[0-9a-f-]{36}\.json$/i.test(name))continue;const file=path.join(outbox,name),receiptFile=file+'.receipt.json';let receipt;try{receipt=await read(receiptFile,20000);}catch{}if(receipt?.accepted||receipt?.state==='failed'||receipt?.retryAfter>Date.now())continue;if(sent++>=4)return;
   try{const value=await read(file,1450000);if(value.localJobId!==job.id||value.requestId!==name.slice(0,-5))throw Error('Evidence does not match its job');const url=origin+'/api/company-ticket-evidence/'+job.company,body=JSON.stringify(value),r=await transport(url,{method:'POST',headers:await signedHeaders(config.secrets[job.company],'POST',url,'Owner Mac screenshot publisher',body),body,redirect:'manual',signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok){const e=Error(data.error||'Evidence upload unavailable');e.permanent=[400,403,404,413,415].includes(r.status);throw e;}if(data.accepted!==true||!data.attachment?.id)throw Error('Evidence receipt was incomplete');receipt={...data,state:'attached',at:Date.now()};
   }catch(error){receipt={accepted:false,state:error.permanent?'failed':'retrying',error:String(error.message).slice(0,400),at:Date.now(),retryAfter:Date.now()+60000};}
   await fs.writeFile(receiptFile,JSON.stringify(receipt),{mode:0o600});
  }
 }
}
