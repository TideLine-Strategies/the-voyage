// Coordinator-only release: preserve existing secrets, sources and content workers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const commit=process.env.AGENT_RELEASE_COMMIT;
assert(commit&&process.env.AGENT_RELEASE_TASK,'Managed release required');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');
assert(apply||verify||process.argv.includes('--reconcile'));
const origin='https://voyage.tidelinestrats.com';
const cli=args=>JSON.parse(execFileSync('node_modules/.bin/wrangler',[...args,'--profile','tideline'],{encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'},timeout:120000,stdio:['ignore','pipe','pipe']}));
if(apply){
 assert.equal(execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0],commit,'Only current main may deploy');
 execFileSync('node_modules/.bin/wrangler',['deploy','--keep-vars','--message','company-tickets:'+commit,'--var','RELEASE_COMMIT:'+commit,'--profile','tideline'],{stdio:'inherit',timeout:120000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'}});
}
const revision=await(await fetch(origin+'/__release.json',{redirect:'manual',signal:AbortSignal.timeout(15000)})).json();
assert.equal(revision.commit,commit,'Different active revision; reconcile without replaying');
const deployments=cli(['deployments','list','--name','the-voyage','--json']);
const active=deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);
assert(active?.versions.some(v=>v.percentage===100));
if(verify){
 for(const route of ['/api/company-tickets?company=wonplace','/api/company-tickets?company=tideline'])assert.equal((await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(15000)})).status,403);
 const ui=JSON.parse(await fs.readFile(process.env.COMPANY_TICKETS_UI_RECEIPT,'utf8'));
 assert.equal(ui.commit,commit);
 for(const key of ['accepted','companyTabVerified','createEditVerified','notesVerified','imageViewVerified','imageRemovalVerified','trashRestoreVerified','originalReportsPreserved','productScopeVerified','draftConflictVerified','kanbanStageCountsVerified','stageMovePersisted','sourceStageCoverageVerified','listToggleVerified','codingActionsVerified','signedHandoffVerified','sourceScreenshotsIncluded','dailyReviewInstalled','dailyEmailSentVerified'])assert.equal(ui[key],true,key);
 assert(ui.screenshot);
 await fs.writeFile(process.env.AGENT_RELEASE_RECEIPT,JSON.stringify({commit,deploymentId:active.id,accepted:true,evidence:{ui,anonymousTicketsDenied:true}}));
}
console.log(JSON.stringify({commit,deploymentId:active.id,revisionVerified:true}));
