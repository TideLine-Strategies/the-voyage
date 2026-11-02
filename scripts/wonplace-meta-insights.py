#!/usr/bin/env python3
"""Read-only metrics for owner-confirmed rebranded account IDs. No token output."""
import json,sys,datetime,importlib.util,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
helper=Path(os.environ.get('WONPLACE_SOCIAL_ACCESS_HELPER',str(Path.home()/'Downloads/JIM/jim/architecture/social_access.py')))
spec=importlib.util.spec_from_file_location('wonplace_existing_social_access',helper)
access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)
IG_ID='17841474678217484'
PAGE_ID='681105458418105'
def collect():
 credential=access.stored_credential(access.lane_config('f100rd_instagram'))
 if not credential or str(credential.get('ig_user_id'))!=IG_ID or str(credential.get('page_id'))!=PAGE_ID:
  return {'status':'blocked','reason':'pinned_existing_credential_unavailable'}
 token=credential['access_token'];reports=[]
 for platform,identifier,fields in [('instagram',IG_ID,'id,username,followers_count,media_count'),('facebook',PAGE_ID,'id,name,followers_count,fan_count')]:
  try:
   data=access.graph_get(identifier,token,fields=fields)
   if str(data.get('id'))!=identifier:raise RuntimeError('identity mismatch')
   counts={k:data[k] for k in ['followers_count','media_count','fan_count'] if isinstance(data.get(k),int) and not isinstance(data[k],bool) and data[k]>=0}
   insights=[]
   if platform=='instagram':
    end=int(datetime.datetime.now().timestamp());start=end-30*86400
    for metric in ['reach','views','profile_links_taps']:
     try:
      response=access.graph_get(identifier+'/insights',token,metric=metric,period='day',metric_type='total_value',since=str(start),until=str(end))
      rows=response.get('data',[])
      if len(rows)==1 and rows[0].get('name')==metric and isinstance(rows[0].get('total_value',{}).get('value'),int):
       insights.append({'metric':metric,'value':rows[0]['total_value']['value'],'from':start*1000,'to':end*1000})
     except Exception:pass
   reports.append({'platform':platform,'accountId':identifier,'insights':insights,'label':data.get('username') or data.get('name'),'observedAt':int(datetime.datetime.now().timestamp()*1000),'counts':counts,'status':'connected','coverage':'Current native account counters. Includes inherited audience and legacy posts; not unique gym owners, reach, leads or sales.'})
  except Exception as error:
   reports.append({'platform':platform,'accountId':identifier,'status':'unavailable','reason':type(error).__name__})
 return {'status':'ok' if all(r['status']=='connected' for r in reports) else 'partial','reports':reports}
if __name__=='__main__':
 try:print(json.dumps(collect()))
 except Exception as error:print(json.dumps({'status':'blocked','reason':type(error).__name__}));sys.exit(1)
