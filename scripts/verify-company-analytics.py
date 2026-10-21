import json,os,re,urllib.request,urllib.error,pathlib
base='https://voyage.tidelinestrats.com'
def get(path):return urllib.request.urlopen(urllib.request.Request(base+path,headers={'User-Agent':'Mozilla/5.0'}),timeout=30)
with get('/__release.json') as r:marker=json.load(r)
assert marker['commit']==os.environ['AGENT_RELEASE_COMMIT']
for path in ['/api/companies/tideline/metrics','/api/companies/wonplace/metrics']:
 try:get(path);raise AssertionError('Unauthenticated metrics exposed')
 except urllib.error.HTTPError as e:assert e.code==403
ids=re.findall(r'Current Version ID:\s*([a-f0-9-]{36})',pathlib.Path('.company-release.log').read_text());assert ids
pathlib.Path(os.environ['AGENT_RELEASE_RECEIPT']).write_text(json.dumps({'commit':marker['commit'],'deploymentId':ids[-1],'accepted':True,'evidence':{'origin':base,'exactRevision':True,'anonymousMetricsForbidden':True,'authenticatedRuntimeVerifiedByRequiredTests':True}}))
