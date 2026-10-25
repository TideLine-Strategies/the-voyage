// One bounded read per provider. Scheduled by the separately installed company collector.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {signedHeaders} from '../src/company-signing.js';
const company=process.argv[2],send=process.argv.includes('--send');
const config={tideline:{repo:'quanbuilds/quan-stewart-portfolio',profile:'tideline',account:'58008ae4816f34f96786f0f52834dce5',worker:'go'},wonplace:{repo:'quanbuilds/premieros',profile:'youcast',account:'a9283f25898ab483951c7166eaba15c2',worker:'premieros-preview'},voyage:{repo:'TideLine-Strategies/the-voyage',profile:'tideline',account:'58008ae4816f34f96786f0f52834dce5',worker:'the-voyage'}}[company];
if(!config)throw Error('Usage: node scripts/company-sync.mjs tideline|wonplace|voyage [--send] [--financials /private/business-records.json]');
const gh=path=>JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',timeout:20000,maxBuffer:2000000,stdio:['ignore','pipe','pipe']}));
const providers=[];
try{
 const repo=gh('repos/'+config.repo),runs=gh('repos/'+config.repo+'/actions/runs?per_page=10'),pulls=gh('repos/'+config.repo+'/pulls?state=open&per_page=100');
 providers.push({provider:'github',resource:repo.full_name,status:'ok',url:repo.html_url,metrics:{openPullRequestsInPage:pulls.length,recentRuns:runs.workflow_runs.length,failedRecentRuns:runs.workflow_runs.filter(r=>r.conclusion==='failure').length,inProgressRecentRuns:runs.workflow_runs.filter(r=>r.status==='in_progress').length},coverage:'Latest 10 Actions runs and up to 100 open pull requests for this exact repository. '+(company==='tideline'?'Shared portfolio repository: activity is not restricted to TideLine paths.':'Not all company repositories.')});
}catch{providers.push({provider:'github',resource:config.repo,status:'unavailable',metrics:{},coverage:'GitHub read failed. No current result is available.'});}
try{
 const cli=process.env.COMPANY_WRANGLER;
 const raw=execFileSync(cli||process.execPath,[...(cli?[]:['node_modules/wrangler/bin/wrangler.js']),'auth','token','--profile',config.profile,'--json'],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});const {token}=JSON.parse(raw.slice(raw.indexOf('{')));
 if(!token)throw Error('No credentials');const now=new Date();
 const query='query($account: String!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $account}) { workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: $start, datetime_leq: $end, scriptName: "'+config.worker+'"}) { sum { requests errors subrequests } } } } }';
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({query,variables:{account:config.account,start:new Date(now-86400000).toISOString(),end:now.toISOString()}}),signal:AbortSignal.timeout(15000)}),body=await r.json();
 if(!r.ok||body.errors||!body.data?.viewer?.accounts?.length)throw Error('Analytics unavailable');const totals={requests:0,errors:0,subrequests:0};for(const item of body.data.viewer.accounts[0].workersInvocationsAdaptive)for(const key of Object.keys(totals))totals[key]+=item.sum[key]||0;
 providers.push({provider:'cloudflare',resource:config.worker,status:'ok',url:'https://dash.cloudflare.com/'+config.account+'/workers/services/view/'+config.worker+'/production',metrics:totals,coverage:'Last 24 hours for this exact Worker. Adaptive analytics may be sampled. Request metrics are not remaining account quota or a provider invoice.'});
}catch{providers.push({provider:'cloudflare',resource:config.worker,status:'unavailable',metrics:{},coverage:'Cloudflare read failed. No current result is available.'});}
let financials=[];const index=process.argv.indexOf('--financials');if(index>=0){financials=JSON.parse(await readFile(process.argv[index+1],'utf8'));if(!Array.isArray(financials)||financials.length>50)throw Error('Use up to 50 company-only financial records with stable IDs');}
const payload={events:[],providers,financials};
if(!send)console.log(JSON.stringify({company,...payload},null,2));
else{
 let secret=process.env.COMPANY_SYNC_SECRET;
 const origin=process.env.VOYAGE_ORIGIN||'https://voyage.tidelinestrats.com';
 if(!secret&&process.env.COMPANY_OPERATIONS_CONFIG){const file=process.env.COMPANY_OPERATIONS_CONFIG;const fs=await import('node:fs/promises');if((await fs.stat(file)).mode&0o077)throw Error('Company configuration must be private');const c=JSON.parse(await fs.readFile(file,'utf8'));if(c.voyageOrigin!==origin)throw Error('Company origin mismatch');secret=c.secrets?.[company];}
 if(!secret||secret.length<32)throw Error('COMPANY_SYNC_SECRET is required to send');
 const url=new URL('/api/company-events/'+company,origin);if(url.protocol!=='https:'||url.origin!=='https://voyage.tidelinestrats.com')throw Error('Use the production Voyage origin');
 const body=JSON.stringify(payload),r=await fetch(url,{method:'POST',headers:await signedHeaders(secret,'POST',url.toString(),'company-sync',body),body,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Company synchronization was not accepted ('+r.status+')');console.log(JSON.stringify({company,receipt:await r.json()}));
}
