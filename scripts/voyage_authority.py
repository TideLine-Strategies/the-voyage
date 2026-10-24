"""Fresh Factory approval authority; never grants route, rights or publishing permissions."""
import json,os,time,hmac,hashlib,urllib.request
from pathlib import Path
CACHE={}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def open_request(request,timeout):return urllib.request.build_opener(NoRedirect).open(request,timeout=timeout)
def factory_authorized(queue,row,for_publish=True):
 try:
  source=queue.db.execute('SELECT manifest FROM sources WHERE id=?',(row['source_id'],)).fetchone()
  manifest=json.loads(source['manifest']);authority=manifest.get('factory_approval');payload=json.loads(row['payload'])
  if not authority or authority['brand']!=row['brand'] or manifest['source']['key']!='voyage:'+authority['itemId']+':'+authority['approval']['hash']:return False
  if payload['caption']!=authority['copy']:return False
  if authority['mediaAssetId']:
   if len(payload['media'])!=1 or payload['media'][0]['sha256']!=authority['mediaAssetId']:return False
  elif payload['media']:return False
  key=(authority['itemId'],authority['approval']['hash']);prior=CACHE.get(key)
  if not for_publish and prior and time.time()-prior[0]<30:return prior[1]
  config_path=Path(os.environ.get('COMPANY_OPERATIONS_CONFIG',str(Path.home()/'.agent-workspaces/private/company-operations/5210cba00745.json')))
  if config_path.stat().st_mode&0o077:return False
  config=json.loads(config_path.read_text());origin=config['voyageOrigin']
  if origin!='https://voyage.tidelinestrats.com':return False
  body=json.dumps({'action':'production_verify','itemId':authority['itemId'],'approvalHash':authority['approval']['hash'],'mediaAssetId':authority['mediaAssetId'],'copy':authority['copy']},separators=(',',':'),ensure_ascii=False).encode()
  # Matches the existing company-ops signed-source contract.
  stamp=str(int(time.time()*1000));actor='factory-native-approval';path='/api/content-agent-source'
  message=b'\n'.join([b'POST',path.encode(),stamp.encode(),actor.encode(),body])
  signature=hmac.new(config['secrets']['tideline'].encode(),message,hashlib.sha256).hexdigest()
  request=urllib.request.Request(origin+path,data=body,headers={'content-type':'application/json','x-voyage-time':stamp,'x-voyage-actor':actor,'x-voyage-signature':signature})
  with open_request(request,timeout=10) as response:accepted=json.load(response).get('authorized') is True
  CACHE[key]=(time.time(),accepted);return accepted
 except (OSError,ValueError,KeyError,TypeError):return False
