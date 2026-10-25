// Read-only native TikTok capture. No cookies, passwords, publishing or payments.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {collectTikTok,parseObjects} from './tiktok-browser-source.mjs';import {signedHeaders} from '../src/company-signing.js';import {socialSnapshot} from '../src/company-social.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),stateFile=path.join(root,'last-sync.json');
const helper=process.env.TIKTOK_ACCESS_HELPER||path.join(os.homedir(),'Downloads/JIM/scripts/f100rd_access.py');
let controller,broker,config,lastPayload,lockHandle;const lockFile=path.join(root,'.collector.lock');
try{lockHandle=await fs.open(lockFile,'wx',0o600);await lockHandle.writeFile(JSON.stringify({pid:process.pid}));}catch(e){if(e.code==='EEXIST'){console.log(JSON.stringify({status:'deferred',reason:'collector_already_running'}));process.exit(0);}throw e;}
const atomic=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await fs.rename(file+'.tmp',file);};
const helperRun=args=>{try{return parseObjects(execFileSync('/usr/bin/python3',[helper,...args],{cwd:path.dirname(path.dirname(helper)),encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}));}catch(e){const objects=parseObjects(String(e.stdout||''));throw Object.assign(Error('Browser access unavailable'),{code:'browser_busy',routing:objects.at(-1)?.status});}};
async function sourceRequest(method,payload){const url='https://voyage.tidelinestrats.com/api/company-events/wonplace',body=payload?JSON.stringify(payload):'';const r=await fetch(url,{method,headers:await signedHeaders(config.secrets.wonplace,method,url,'tiktok-native-collector',body),...(payload?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source receipt unavailable');return r.json();}
async function main(){
 const configFile=process.env.COMPANY_OPERATIONS_CONFIG;if(!configFile||(await fs.stat(configFile)).mode&0o077)throw Error('Private existing source configuration required');config=JSON.parse(await fs.readFile(configFile,'utf8'));if(config.voyageOrigin!=='https://voyage.tidelinestrats.com'||typeof config.secrets?.wonplace!=='string'||config.secrets.wonplace.length<32)throw Error('Wrong company source configuration');
 const access=JSON.parse(await fs.readFile(path.join(path.dirname(helper),'../jim/config/content_access.json'),'utf8'));broker=access.broker_url;if(new URL(broker).hostname!=='127.0.0.1')throw Error('Unsupported browser broker');
 const previous=JSON.parse(await fs.readFile(stateFile,'utf8').catch(()=>'{"status":"new"}'));
 if(previous.status==='sending'){const remote=await sourceRequest('GET');if(remote.social?.latest?.observedAt===previous.observedAt)await atomic(stateFile,{status:'reconciled',observedAt:previous.observedAt,checkedAt:Date.now()});else if(!(remote.social?.latest?.observedAt>previous.observedAt))throw Error('Prior source delivery needs reconciliation');}
 const taskIndex=process.argv.indexOf('--task'),leaseIndex=process.argv.indexOf('--lease');
 const result=taskIndex>=0&&leaseIndex>=0?helperRun(['controller','tiktok','--task',process.argv[taskIndex+1],'--lease',process.argv[leaseIndex+1]]):helperRun(['claim','tiktok']);
 controller=result.findLast(v=>v.status==='controller_ready_identity_check_required');if(!controller)throw Object.assign(Error('No admitted browser'),{code:'browser_busy'});
 const {chromium}=await import('playwright-core');
 const dir=path.join(root,'evidence',new Date().toISOString().replaceAll(':','-'));
 const snapshot=await collectTikTok({controller,archiveDir:dir,chromium,parser:path.join(root,'scripts/parse-tiktok-export.py')});socialSnapshot(snapshot);
 lastPayload={events:[],social:snapshot};await atomic(path.join(root,'latest-source.json'),snapshot);await atomic(stateFile,{status:'sending',observedAt:snapshot.observedAt,checkedAt:Date.now()});
 let receipt;try{receipt=await sourceRequest('POST',lastPayload);}catch{const remote=await sourceRequest('GET');if(remote.social?.latest?.observedAt!==snapshot.observedAt)throw Error('Source receipt needs reconciliation');receipt={social:{handle:'wonplaceapp',observedAt:snapshot.observedAt},reconciled:true};}
 if(receipt.social?.observedAt!==snapshot.observedAt||receipt.social?.handle!=='wonplaceapp')throw Error('Wrong social receipt');
 const remote=await sourceRequest('GET');if(remote.social?.latest?.observedAt!==snapshot.observedAt||remote.social?.latest?.account?.followers!==snapshot.account.followers)throw Error('Persisted social readback differs');
 await atomic(stateFile,{status:'ok',checkedAt:Date.now(),observedAt:snapshot.observedAt,handle:'wonplaceapp',period:snapshot.overview.start+' — '+snapshot.overview.end,followers:snapshot.account.followers,videoViews:snapshot.overview.videoViews,baselineAt:remote.social.baseline.observedAt});
 console.log(JSON.stringify({status:'ok',handle:'wonplaceapp',followers:snapshot.account.followers,videoViews:snapshot.overview.videoViews,sourceReadbackVerified:true}));
}
let exitCode=0;
try{await main();}catch(error){exitCode=1;const code=['login_required','browser_busy','account_mismatch'].includes(error.code)?error.code:'read_failed';let state={status:'unavailable',checkedAt:Date.now(),reason:code};try{const pending=JSON.parse(await fs.readFile(stateFile,'utf8'));if(pending.status==='sending')state={...pending,error:'Source receipt needs reconciliation'};}catch{}if(state.status!=='sending'&&config){try{await sourceRequest('POST',{events:[],socialAttempt:{observedAt:Date.now(),status:'unavailable',reason:code}});}catch{}}await atomic(stateFile,state);console.log(JSON.stringify({status:state.status,reason:code}));}
finally{if(controller&&broker){try{const response=await fetch(broker+'/api/tasks/'+controller.task_id+'/session/release',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({leaseId:controller.lease_id}),signal:AbortSignal.timeout(15000)});if(!response.ok){console.error('Browser lease release not confirmed');exitCode=1;}}catch{console.error('Browser lease release not confirmed');exitCode=1;}}}
if(lockHandle){await lockHandle.close();await fs.unlink(lockFile);}
// Disconnect this client process; never close the persistent browser/context.
process.exit(exitCode);
