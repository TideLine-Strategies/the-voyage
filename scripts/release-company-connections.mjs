import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {signedHeaders} from '../src/company-signing.js';
const commit=process.env.AGENT_RELEASE_COMMIT,origin='https://voyage.tidelinestrats.com';assert(commit&&process.env.AGENT_RELEASE_TASK);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
const mode=process.argv[2];assert(['--apply','--reconcile','--verify'].includes(mode));
const configFile=process.env.COMPANY_OPERATIONS_CONFIG;assert(configFile);assert.equal((await fs.stat(configFile)).mode&0o077,0);const config=JSON.parse(await fs.readFile(configFile,'utf8'));assert.equal(config.voyageOrigin,origin);
const cli=args=>execFileSync('node_modules/.bin/wrangler',[...args,'--profile','tideline'],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe'],env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'}});
if(mode==='--apply'){assert.equal(execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0],commit);cli(['deploy','--keep-vars','--var','RELEASE_COMMIT:'+commit,'--message','company-connections:'+commit]);}
const revision=await(await fetch(origin+'/__release.json',{redirect:'manual',signal:AbortSignal.timeout(15000)})).json();assert.equal(revision.commit,commit,'Different live revision; reconcile without replaying deployment');
const runtime=path.join(os.homedir(),'Library/Application Support/TideLine/Company Analytics');
if(mode!=='--verify'){
 let installed;try{installed=JSON.parse(await fs.readFile(path.join(runtime,'release.json'),'utf8'));}catch{}
 if(installed?.commit!==commit){execFileSync(process.execPath,['scripts/install-company-sync.mjs'],{stdio:'inherit',env:process.env,timeout:180000});await fs.writeFile(path.join(runtime,'release.json'),JSON.stringify({commit}),{mode:0o600});}
}
const active=JSON.parse(cli(['deployments','list','--name','the-voyage','--json'])).sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);assert(active?.versions.some(v=>v.percentage===100));
if(mode==='--verify'){
 for(const company of ['tideline','wonplace','voyage']){const url=origin+'/api/company-events/'+company;const r=await fetch(url,{headers:await signedHeaders(config.secrets[company],'GET',url,'company-connections'),signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const data=await r.json();assert.equal(data.company,company);for(const name of ['cloudflare','github']){const provider=data.providers.find(p=>p.provider===name);assert.equal(provider?.status,'ok');assert(Date.now()-provider.checkedAt<1800000,'Provider snapshot must be fresh');}}
 assert.equal((await fetch(origin+'/api/companies/tideline/acquisition',{redirect:'manual',signal:AbortSignal.timeout(15000)})).status,403);
 const ui=JSON.parse(await fs.readFile(process.env.COMPANY_CONNECTIONS_UI_RECEIPT,'utf8'));assert.equal(ui.commit,commit);for(const flag of ['accepted','acquisitionReadVerified','sourcesFreshVerified','sidebarPreserved','unknownNotZeroVerified'])assert.equal(ui[flag],true);assert(ui.screenshot);
 const installed=JSON.parse(await fs.readFile(path.join(runtime,'release.json'),'utf8'));assert.equal(installed.commit,commit);
 await fs.writeFile(process.env.AGENT_RELEASE_RECEIPT,JSON.stringify({commit,deploymentId:active.id,accepted:true,evidence:{ui,scheduledCollector:true,providerSnapshotsFresh:true,anonymousAcquisitionDenied:true}}));
}
console.log(JSON.stringify({commit,deploymentId:active.id,revisionVerified:true}));
