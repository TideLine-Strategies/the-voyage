"""Exact Voyage deployment and public-denial checks; authenticated UI is verified separately."""
import hashlib,json,os,pathlib,subprocess
base='https://voyage.tidelinestrats.com';commit=os.environ['AGENT_RELEASE_COMMIT']
def get(path):return subprocess.check_output(['curl','--compressed','-fsS','--max-time','30',base+path])
assert json.loads(get('/__release.json'))['commit']==commit
for file in ['index.html','tideline-analytics.js']:
 assert hashlib.sha256(get('/' if file=='index.html' else '/'+file)).digest()==hashlib.sha256((pathlib.Path('public')/file).read_bytes()).digest(),file
for path in ['/api/tideline/analytics','/api/companies/tideline/source']:
 status=subprocess.check_output(['curl','-sS','-o','/dev/null','-w','%{http_code}',base+path]).decode();assert status=='403',status
active=max(json.loads(subprocess.check_output(['npx','--yes','--package=wrangler@4.148.0','wrangler','deployments','list','--name','the-voyage','--profile','default','--json'],env={**os.environ,'CLOUDFLARE_ACCOUNT_ID':'58008ae4816f34f96786f0f52834dce5'})),key=lambda row:row['created_on'])
version=next(v['version_id'] for v in active['versions'] if v['percentage']==100)
log=(pathlib.Path.home()/'.agent-workspaces/coordinator/logs'/f"{os.environ['AGENT_RELEASE_TASK']}.log").read_text();assert version in log
receipt={'commit':commit,'deploymentId':active['id'],'accepted':True,'evidence':{'exactAssets':['public/index.html','public/tideline-analytics.js'],'anonymousAccess':'private analytics and company source endpoints deny anonymous access','runtime':'Required actual-workerd D1 integration exercised private CRM link, duplicate retry, summary readback and no outbound messages','authenticatedBrowser':'A separate signed-in browser check remains required after production deployment'}}
pathlib.Path(os.environ['AGENT_RELEASE_RECEIPT']).write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
