// Daily read-only owner-visible YouTube and LinkedIn reporting, with signed readback.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {collectLinkedInSafari,linkedinBinding} from './linkedin-safari-source.mjs';
import {collectPageSocial} from './page-social-browser-source.mjs';import {signedHeaders} from '../src/company-signing.js';import {accountSnapshot} from '../src/company-social.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file=path.join(root,'page-social-last-sync.json'),lock=path.join(root,'.page-social.lock');let handle,controller,exitCode=0;
const atomic=async value=>{await fs.writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(file+'.tmp',file);};
try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}catch(e){if(e.code==='EEXIST'){console.log('Page social collector already running');process.exit(0);}throw e;}
try{
 const configFile=process.env.COMPANY_OPERATIONS_CONFIG;if(!configFile||(await fs.stat(configFile)).mode&0o077)throw Error('Private configuration required');const config=JSON.parse(await fs.readFile(configFile,'utf8'));if(config.voyageOrigin!=='https://voyage.tidelinestrats.com')throw Error('Wrong destination');
 const request=async(company,method,payload)=>{const url=config.voyageOrigin+'/api/company-events/'+company,body=payload?JSON.stringify(payload):'',r=await fetch(url,{method,headers:await signedHeaders(config.secrets[company],method,url,'native-page-analytics',body),...(payload?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source request unavailable');return r.json();};
 // Reconcile each uncertain write independently; one product cannot stall the other.
 const previous=JSON.parse(await fs.readFile(file,'utf8').catch(()=>'{}')),pending=[];
 for(const item of Array.isArray(previous.pending)?previous.pending:previous.pending?[previous.pending]:[]){try{const remote=await request(item.company,'GET'),stored=remote.social?.accounts?.find(a=>a.platform===item.account.platform)?.latest;if(!stored||stored.observedAt<item.account.observedAt)pending.push(item);}catch{pending.push(item);}}

 const reports=[],results=[],archiveDir=path.join(root,'evidence',new Date().toISOString().replaceAll(':','-'));
 // Quan's own Safari session is independent of YouTube's original Atlas profile.
 try{const file=path.join(root,'linkedin-browser-binding.json');if((await fs.stat(file)).mode&0o077)throw Error('Private owner binding required');const binding=linkedinBinding(JSON.parse(await fs.readFile(file,'utf8')));reports.push(await collectLinkedInSafari({binding,archiveDir}));}catch{reports.push({company:'tideline',platform:'linkedin',status:'unavailable',reason:'owner_binding_or_session_unavailable'});}
 try{const helper=process.env.TIKTOK_ACCESS_HELPER||path.join(os.homedir(),'Downloads/JIM/scripts/f100rd_access.py');controller=JSON.parse(execFileSync('/usr/bin/python3',[path.join(root,'scripts/claim-page-social.py'),helper,...process.argv.slice(2)],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}));const {chromium}=await import('playwright-core');reports.push(...await collectPageSocial({controller,chromium,archiveDir}));}catch{reports.push({company:'wonplace',platform:'youtube',status:'unavailable'});}

 for(const report of reports){if(report.status!=='connected'){results.push({company:report.company,platform:report.platform,status:'unavailable',reason:report.reason||'read_failed'});continue;}
  if(pending.some(p=>p.company===report.company&&p.account.platform===report.platform)){results.push({company:report.company,platform:report.platform,status:'reconciliation_required'});continue;}
  const account=accountSnapshot(report.value,Date.now(),report.company),item={company:report.company,account};pending.push(item);await atomic({status:'sending',pending,checkedAt:Date.now(),results});
  try{
   try{await request(report.company,'POST',{events:[],socialAccounts:[account]});}catch{}
   const remote=await request(report.company,'GET'),stored=remote.social?.accounts?.find(a=>a.platform===account.platform)?.latest;if(stored?.observedAt!==account.observedAt||stored.evidenceSha256!==account.evidenceSha256)throw Error('Persisted native report differs');pending.splice(pending.indexOf(item),1);results.push({company:report.company,platform:report.platform,status:'connected',observedAt:account.observedAt,...(report.ownerProfileVerified?{ownerProfileVerified:report.ownerProfileVerified}:{})});
  }catch{results.push({company:report.company,platform:report.platform,status:'reconciliation_required'});exitCode=1;}
  await atomic({status:pending.length?'reconciliation_required':'verified',pending,checkedAt:Date.now(),results});
 }
 await atomic({status:pending.length?'reconciliation_required':results.every(r=>r.status==='connected')?'ok':'partial',pending,checkedAt:Date.now(),results});console.log(JSON.stringify({status:pending.length?'reconciliation_required':'verified',sources:results}));

}catch{exitCode=1;const previous=JSON.parse(await fs.readFile(file,'utf8').catch(()=>'{}'));await atomic((Array.isArray(previous.pending)?previous.pending.length:previous.pending)?{...previous,status:'reconciliation_required'}:{status:'unavailable',checkedAt:Date.now(),reason:'native_read_or_admission_failed'});console.log(JSON.stringify({status:'unavailable',reason:'native_read_or_admission_failed'}));}
finally{if(controller){try{const r=await fetch('http://127.0.0.1:17771/api/tasks/'+controller.task_id+'/session/release',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leaseId:controller.lease_id}),signal:AbortSignal.timeout(15000)});if(!r.ok)exitCode=1;}catch{exitCode=1;}}await handle.close();await fs.unlink(lock);}
process.exit(exitCode);
