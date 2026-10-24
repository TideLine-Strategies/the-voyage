#!/usr/bin/env python3
"""Exact preexisting business-source lane; supported broker admission, no launch/login."""
import argparse,json,subprocess,urllib.request,urllib.error,time
from pathlib import Path
import sys
runtime=Path(__file__).resolve().parent
if not (runtime/'social.py').exists():runtime=Path.home()/'.stewartos/automations/wonplace-social'
sys.path.insert(0,str(runtime))
from social import ROOT,read,atomic,now
BASE='http://127.0.0.1:17771'
STATE=ROOT/'state/source-browser-binding.json'
def request(task,action,lease):
 req=urllib.request.Request(BASE+'/api/tasks/'+task+'/session/'+action,data=json.dumps({'leaseId':lease}).encode(),headers={'Content-Type':'application/json'},method='POST')
 return json.load(urllib.request.urlopen(req,timeout=30))
def binding_state(lane):
 config=read(ROOT/'config.json')
 if lane in ('source','atlas'):return config['observer']['browser_binding'],STATE
 return config['browser_lanes'][lane],ROOT/'state'/('browser-binding-'+lane+'.json')
def normal_reclaim(binding):
 state=json.load(urllib.request.urlopen(BASE+'/api/state',timeout=10));worker=state['workers'][binding['worker']]
 if worker.get('currentTaskId'):raise ValueError('Pinned browser worker has another active task; no reclaim')
 if worker.get('profilePath')!=binding.get('profile_path'):raise ValueError('Pinned existing browser profile differs; no replacement')
 url=binding['entry_url'];payload={'worker':binding['worker'],'objective':'Owner-authorized business source/destination native operator; preserve exact existing profile','url':url,'displayNeed':'standard','preserveSession':True,'allowedDomains':binding['allowed_domains'],'source':'interactive-agent-claim'}
 if binding.get('browser_profile'):payload['browserProfile']=binding['browser_profile']
 req=urllib.request.Request(BASE+'/api/tasks',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST');task=json.load(urllib.request.urlopen(req,timeout=30))
 for _ in range(60):
  state=json.load(urllib.request.urlopen(BASE+'/api/state',timeout=10));task=next((t for t in state['tasks'] if t['id']==task['id']),task)
  if task.get('sessionReady') or task.get('status') in ('blocked','failed','approval_needed'):break
  time.sleep(.5)
 if task.get('assignedWorker')!=binding['worker'] or state['workers'][binding['worker']].get('profilePath')!=binding['profile_path']:raise ValueError('Normal claim did not retain exact worker/profile')
 return task
def acquire(lane='source'):
 binding,state=binding_state(lane);old=read(state) if state.exists() else binding
 if old.get('task_id')!=binding['task_id'] and (not binding.get('worker') or not binding.get('profile_path') or old.get('worker')!=binding.get('worker') or old.get('profile_path')!=binding.get('profile_path')):raise ValueError('Persisted browser binding differs from approved lane/profile')
 if old.get('state')=='active':raise ValueError('Prior browser turn still active; reconcile/release it before acquiring')
 task_id=old['task_id']
 try:result=request(task_id,'resume',old['lease_id'])
 except urllib.error.HTTPError as error:
  detail=error.read().decode('utf-8','replace')
  retired=False
  if error.code==400 and 'Released persistent session, matching lease and free original worker required' in detail:
   snapshot=json.load(urllib.request.urlopen(BASE+'/api/state',timeout=10))
   prior=next((t for t in snapshot['tasks'] if t['id']==task_id),{})
   worker=snapshot['workers'][binding['worker']]
   retired=prior.get('status') in ('executed','completed','cancelled','failed') and not worker.get('currentTaskId') and worker.get('profilePath')==binding.get('profile_path') and old.get('state')!='active'
  if not retired and (error.code!=400 or 'Original scoped browser tab is no longer available' not in detail):raise ValueError('Normal scoped resume refused: '+detail[:250])
  result=normal_reclaim(binding);task_id=result['id']
 lease=result.get('lease') or {}
 if not result.get('sessionReady') or not lease.get('id'):raise ValueError('Exact source browser placement/session not ready')
 receipt={'task_id':task_id,'lease_id':lease['id'],'state':'active','acquired_at':now(),'company_id':binding.get('company_id'),'lane':lane,'worker':binding.get('worker'),'profile_path':binding.get('profile_path')};atomic(state,receipt)
 proc=subprocess.run([str(Path.home()/'.local/bin/macarchy-wall'),'controller','task='+task_id,'lease='+lease['id']],capture_output=True,text=True,timeout=30)
 if proc.returncode:raise ValueError('Normal revocable controller refused; release owned active lease through this helper')
 controller=json.loads(proc.stdout)
 if not controller.get('endpoint'):raise ValueError('No normal revocable controller endpoint')
 endpoint=controller['endpoint'].rstrip('/')
 version=json.load(urllib.request.urlopen(endpoint+'/json/version',timeout=20))
 if not version.get('webSocketDebuggerUrl'):raise ValueError('Gateway did not return its lease-bound websocket')
 return {**receipt,'controller':controller,'websocket_url':version['webSocketDebuggerUrl']}
def renew(lane='source'):
 binding,state=binding_state(lane);owned=read(state)
 if owned.get('state')!='active' or (owned.get('task_id')!=binding['task_id'] and (owned.get('worker')!=binding.get('worker') or owned.get('profile_path')!=binding.get('profile_path'))):raise ValueError('No matching owned active lease for renewal')
 result=request(owned['task_id'],'renew',owned['lease_id']);lease=result.get('lease') or {}
 if not result.get('sessionReady') or lease.get('id')!=owned['lease_id']:raise ValueError('Normal lease renewal did not retain active ownership')
 owned['renewed_at']=now();atomic(state,owned);return owned
def release(lane='source'):
 binding,state=binding_state(lane);owned=read(state)
 if (owned.get('task_id')!=binding['task_id'] and (not binding.get('worker') or not binding.get('profile_path') or owned.get('worker')!=binding.get('worker') or owned.get('profile_path')!=binding.get('profile_path'))) or owned.get('state')!='active':raise ValueError('No matching owned active source lease')
 result=request(owned['task_id'],'release',owned['lease_id']);owned.update(state='released',released_at=now(),release_status=result.get('status'));atomic(state,owned);return owned
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['acquire','release','renew']);p.add_argument('--lane',choices=['source','atlas','ember'],default='source');a=p.parse_args()
 try:print(json.dumps({'acquire':acquire,'release':release,'renew':renew}[a.action](a.lane),indent=2))
 except Exception as e:print(json.dumps({'ok':False,'blocker':str(e)[:500]}));raise SystemExit(2)
