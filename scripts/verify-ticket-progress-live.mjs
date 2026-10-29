import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {signedHeaders} from '../src/company-signing.js';
const commit=process.env.AGENT_RELEASE_COMMIT,origin='https://voyage.tidelinestrats.com';assert(/^[0-9a-f]{40}$/.test(commit||''));
assert.equal((await(await fetch(origin+'/__release.json',{redirect:'manual'})).json()).commit,commit);
const root=path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),installed=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));assert.equal(installed.activeWebCommit,commit);
const proof=JSON.parse(await fs.readFile(process.env.TICKET_PROGRESS_UI_RECEIPT,'utf8'));assert.equal(proof.commit,commit);
for(const key of ['accepted','linkedTaskVisible','checkpointSeparateFromHeartbeat','activityUnverified','unlinkedCoverageVisible','noRealHumanReviewSigned'])assert.equal(proof[key],true,key);
const record=JSON.parse(await fs.readFile(path.join(root,'task-progress',proof.taskId+'.json'),'utf8'));assert.equal(record.receipt?.accepted,true);assert(!record.error,'Local progress reporting has an unresolved error');
const config=JSON.parse(await fs.readFile(process.env.COMPANY_OPERATIONS_CONFIG,'utf8')),runtimeId=(await fs.readFile(path.join(root,'worker-id'),'utf8')).trim(),url=origin+'/api/company-ticket-task-progress/'+record.company,body=JSON.stringify({...record.link,runtimeId,action:'link'});
const response=await fetch(url,{method:'POST',headers:await signedHeaders(config.secrets[record.company],'POST',url,'Progress release verification',body),body,redirect:'manual',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);const remote=await response.json();assert.equal(remote.accepted,true);assert.equal(remote.duplicate,true);assert.equal(remote.task.taskId,proof.taskId);assert(remote.task.sequence>=record.receipt.sequence);assert.equal(remote.task.snapshot.activity,'unverified');assert.equal(remote.task.snapshot.ticketAcceptance,'pending');assert(remote.task.snapshot.checkpointAt);assert(remote.task.milestones.length);
let contractEvidence=null;
if(process.env.TICKET_CONTRACT_RECEIPT){
 contractEvidence=JSON.parse(await fs.readFile(process.env.TICKET_CONTRACT_RECEIPT,'utf8'));assert.equal(contractEvidence.commit,commit);
 for(const key of ['accepted','missingStartRejected','noTaskCreatedForMissingTicket','unreportedSubmitHeld','reportReceiptVerified'])assert.equal(contractEvidence[key],true,key);
 const contract=JSON.parse(await fs.readFile(path.join(root,'reporting-contract.json'),'utf8')),hash=value=>createHash('sha256').update(value).digest('hex');
 assert.equal(hash(await fs.readFile(path.join(os.homedir(),'.local/bin/agent-workspace'))),contract.launcherHash);assert.equal(hash(await fs.readFile(contract.corePath)),contract.coreHash);
 const validation=JSON.parse(await fs.readFile(path.join(root,'task-progress',contractEvidence.validatorTaskId+'.json'),'utf8'));
 assert.equal(validation.reportReceipt?.accepted,true);assert.equal(validation.reportReceipt.reportId,contractEvidence.reportId);
}
const deployments=JSON.parse(execFileSync('node_modules/.bin/wrangler',['deployments','list','--name','the-voyage','--profile','tideline','--json'],{encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'},stdio:['ignore','pipe','pipe']})),active=deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);assert(active?.versions.some(v=>v.percentage===100));
await fs.writeFile(process.env.AGENT_RELEASE_RECEIPT,JSON.stringify({commit,deploymentId:active.id,accepted:true,evidence:{contract:contractEvidence,ui:proof,task:proof.taskId,acceptedProgressSequence:remote.task.sequence,journalCursor:remote.task.eventCursor}}));
