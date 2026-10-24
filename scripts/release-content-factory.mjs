// Managed current-main release. Automatic and managed builds share exact asset identity.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {signedHeaders} from '../src/company-ops.js';
const commit=process.env.AGENT_RELEASE_COMMIT;assert(commit&&process.env.AGENT_RELEASE_TASK,'Managed release context required');assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
assert(process.argv.some(a=>['--apply','--verify','--reconcile'].includes(a)));
const configFile=process.env.COMPANY_OPERATIONS_CONFIG;assert(configFile&&process.env.CONTENT_BASELINE_FILE,'Private source paths required');assert.equal((await fs.stat(configFile)).mode&0o077,0);
const config=JSON.parse(await fs.readFile(configFile,'utf8'));assert.equal(config.voyageOrigin,'https://voyage.tidelinestrats.com');
const cli=args=>execFileSync('node_modules/.bin/wrangler',[...args,'--profile','tideline'],{encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'58008ae4816f34f96786f0f52834dce5'},timeout:120000,maxBuffer:4000000,stdio:['ignore','pipe','pipe']});
if(process.argv.includes('--apply'))assert.equal(execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0],commit,'Only the published current main may deploy');
if(process.argv.includes('--apply'))cli(['deploy','--keep-vars','--var','RELEASE_COMMIT:'+commit,'--message','content-factory:'+commit]);
const deployments=JSON.parse(cli(['deployments','list','--name','the-voyage','--json'])),active=deployments.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1),version=active?.versions.find(v=>v.percentage===100)?.version_id;assert(version);
const detail=JSON.parse(cli(['versions','view',version,'--name','the-voyage','--json']));const liveIdentity=await (await fetch(config.voyageOrigin+'/__release.json',{redirect:'manual',signal:AbortSignal.timeout(15000)})).json();assert.equal(liveIdentity.commit,commit,'Active build differs; reconcile without replaying deployment');
if(process.argv.includes('--apply')||process.argv.includes('--reconcile')){
 for(const script of ['scripts/content-sync.mjs','scripts/content-baseline-sync.mjs','scripts/content-import-assets.mjs'])execFileSync(process.execPath,[script,...(script.endsWith('/content-sync.mjs')?['--send']:[])],{stdio:'inherit'});
 {for(const script of ['scripts/install-factory-native.mjs','scripts/install-content-sync.mjs','scripts/install-content-operator.mjs'])execFileSync(process.execPath,[script],{stdio:'inherit'});}
}
if(process.argv.includes('--verify')){
 const url=config.voyageOrigin+'/api/content-factory-source',r=await fetch(url,{headers:await signedHeaders(config.secrets.tideline,'GET',url,'factory-release'),redirect:'manual',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const source=await r.json();assert.equal(source.baseline?.posts.length,2);
 for(const route of ['/factory/','/api/content-factory','/api/content-ops'])assert.equal((await fetch(config.voyageOrigin+route,{redirect:'manual',signal:AbortSignal.timeout(15000)})).status,403);
 const live=await (await fetch(config.voyageOrigin+'/__release.json',{signal:AbortSignal.timeout(15000)})).json();assert.equal(live.commit,commit);
 const uiFile=process.env.CONTENT_FACTORY_UI_RECEIPT;assert(uiFile,'Signed-in live acceptance receipt required');const ui=JSON.parse(await fs.readFile(uiFile,'utf8'));assert.equal(ui.commit,commit);for(const key of ['accepted','twoPublishedSourcesVerified','serverPersistenceVerified','approvalIdentityVerified','staleApprovalVerified','responsiveVerified','noPlaceholdersVerified','privateMediaPlaybackVerified','publisherAvatarVerified','researchDatesVerified','agentPassAndLivingDocsVerified'])assert.equal(ui[key],true,'Live UI acceptance required: '+key);assert(ui.screenshot);
 await fs.writeFile(process.env.AGENT_RELEASE_RECEIPT,JSON.stringify({commit,deploymentId:active.id,accepted:true,evidence:{version,sourcePosts:source.baseline.posts.map(p=>p.id),anonymousDenied:true,ui}}));
}
console.log(JSON.stringify({commit,deploymentId:active.id,version}));
