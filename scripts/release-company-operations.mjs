// Run only through the managed coordinator after protected review.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {signedHeaders} from '../src/company-ops.js';
const file=process.env.COMPANY_OPERATIONS_CONFIG;assert(file,'Private company configuration is required');
assert.equal((await fs.stat(file)).mode&0o077,0,'Private configuration permissions are too broad');
const config=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(config.brand,'tideline');assert.equal(config.voyageOrigin,'https://voyage.tidelinestrats.com');assert.equal(config.wonplaceOrigin,'https://premieros-preview.signallabs.workers.dev');
for(const name of ['wonplace','tideline','loki','voyage','tickets'])assert(/^[a-f0-9]{64}$/.test(config.secrets[name]));
const bindings={WONPLACE_OPERATIONS_SECRET:config.secrets.wonplace,TIDELINE_OPERATIONS_SECRET:config.secrets.tideline,LOKI_OPERATIONS_SECRET:config.secrets.loki,VOYAGE_OPERATIONS_SECRET:config.secrets.voyage,WONPLACE_TICKETS_SECRET:config.secrets.tickets,WONPLACE_TICKETS_ORIGIN:config.wonplaceOrigin};
const cli=(args,input)=>{try{return execFileSync('node_modules/.bin/wrangler',[...args,'--profile','tideline'],{encoding:'utf8',input,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'},timeout:120000,maxBuffer:4000000,stdio:['pipe','pipe','pipe']});}catch{throw Error('Cloudflare operation did not complete cleanly. Reconcile the provider before retrying a deployment.');}};
if(!process.argv.some(arg=>['--apply','--verify','--reconcile'].includes(arg))){console.log(JSON.stringify({target:'the-voyage',profile:'tideline',bindings:Object.keys(bindings),providerChanges:false}));process.exit(0);}
const commit=process.env.AGENT_RELEASE_COMMIT;assert(process.env.AGENT_RELEASE_TASK&&commit,'Managed release context is required');assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
if(process.argv.includes('--apply')){
 cli(['secret','bulk'],JSON.stringify(bindings));
 cli(['deploy','--keep-vars','--message','company-operations:'+commit]);
 for(const product of ['tideline','wonplace','voyage'])execFileSync('node',['scripts/company-sync.mjs',product,'--send'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,env:{...process.env,COMPANY_SYNC_SECRET:config.secrets[product]}});
}
const deployments=JSON.parse(cli(['deployments','list','--name','the-voyage','--json'])),active=deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1),version=active.versions.find(v=>v.percentage===100)?.version_id;assert(version);
const detail=JSON.parse(cli(['versions','view',version,'--name','the-voyage','--json']));assert.equal(detail.annotations?.['workers/message'],'company-operations:'+commit,'Active provider version does not match this release; do not replay');
console.log(JSON.stringify({commit,deploymentId:active.id,version,providerVersionVerified:true}));
if(process.argv.includes('--verify')){
 const url=config.voyageOrigin+'/api/company-events/wonplace',response=await fetch(url,{headers:await signedHeaders(config.secrets.wonplace,'GET',url,'company-release'),signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,'Company source handshake unavailable');const live=await response.json();assert.equal(live.company,'wonplace');
 for(const product of ['wonplace','tideline','loki','voyage']){const denied=await fetch(config.voyageOrigin+'/api/companies/'+product,{signal:AbortSignal.timeout(15000)});assert.equal(denied.status,403);}
 const uiFile=process.env.COMPANY_OPERATIONS_UI_RECEIPT;assert(uiFile,'Awaiting real signed-in company page and WonPlace activity acceptance; no live UI receipt is present');
 const ui=JSON.parse(await fs.readFile(uiFile,'utf8'));assert.equal(ui.voyageCommit,commit);assert.equal(ui.accepted,true);assert(ui.staffEventId&&(ui.originalIncidentId||ui.noVisibleIncidentsVerified)&&ui.companyIsolationVerified&&ui.screenshot);
 assert(live.live.events.some(event=>event.id===ui.staffEventId),'Accepted staff event is not present in the live product feed');
 const receipt={commit,deploymentId:active.id,accepted:true,evidence:{activeVersion:version,signedSourceRead:true,anonymousDenied:true,ui}};await fs.writeFile(process.env.AGENT_RELEASE_RECEIPT,JSON.stringify(receipt));console.log(JSON.stringify(receipt));
}
