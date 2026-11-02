#!/usr/bin/env python3
"""Claim an existing exact TikTok profile; recover only a rejected stale resume."""
import importlib.util,json,subprocess,sys,urllib.error
from pathlib import Path
helper=Path(sys.argv[1]);args=sys.argv[2:]
r=subprocess.run(['/usr/bin/python3',str(helper),*args],capture_output=True,text=True,timeout=60)
if r.returncode==0 or args!=['claim','tiktok']:
 print(r.stdout,end='');sys.exit(r.returncode)
# The legacy helper may choose an executed lease which the broker can no longer
# resume. Reconcile current broker state before requesting a new task in place.
try:
 last=json.loads(r.stdout)
 if last.get('status')!='blocked' or last.get('error')!='HTTPError':raise ValueError('Not a stale resume')
 spec=importlib.util.spec_from_file_location('existing_access',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 binding=m.config()['bindings']['tiktok'];snapshot=m.state();workers=[w for w in snapshot['workers'].values() if m.profile_of(w)==binding['profile']]
 if len(workers)!=1 or workers[0].get('currentTaskId'):raise ValueError('Exact profile unavailable')
 worker=workers[0];old=m.released_session(binding,snapshot,worker['id'])
 if not old:raise ValueError('No rejected released session')
 try:
  resumed=m.resume_session(old);ready=m.validate_session(binding,m.state(),old['id'],old['lease']['id']);print(json.dumps(resumed));print(json.dumps(ready));sys.exit(0)
 except urllib.error.HTTPError as error:
  body=json.loads(error.read())
  if error.code!=400 or body.get('error')!='Released persistent session, matching lease and free original worker required':raise ValueError('Resume failure requires review')
 fresh=m.state();current=fresh['workers'][worker['id']]
 if current.get('currentTaskId') or m.profile_of(current)!=binding['profile']:raise ValueError('Profile ownership changed')
 cmd=[str(m.WALL),'claim',worker['id'],'F10 tiktok persistent access',binding['url'],'compact','session']
 if binding.get('social_profile'):cmd.append(binding['social_profile'])
 claim=subprocess.run(cmd,capture_output=True,text=True,timeout=60);print(claim.stdout,end='')
 if claim.returncode:sys.exit(claim.returncode)
 receipt=json.loads(claim.stdout);ready=m.validate_session(binding,m.state(),receipt['taskId'],receipt['lease']['id']);print(json.dumps(ready))
except Exception:
 print(json.dumps({'status':'blocked','error':'Exact released-profile recovery unavailable'}));sys.exit(2)
