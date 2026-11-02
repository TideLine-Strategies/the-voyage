#!/usr/bin/env python3
"""Admit the existing original Atlas profile, then obtain its governed controller."""
import importlib.util,json,subprocess,sys
from pathlib import Path
helper=Path(sys.argv[1]);spec=importlib.util.spec_from_file_location('access',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
binding=m.config()['bindings']['youtube'];snapshot=m.state();worker=snapshot['workers'].get(binding['worker'],{})
if m.profile_of(worker)!=binding['profile']:raise SystemExit('Original Atlas profile binding requires recovery')
args=sys.argv[2:]
if args:
 if len(args)!=4 or args[0]!='--task' or args[2]!='--lease':raise SystemExit('Explicit task and lease required')
 task,lease=args[1],args[3]
else:
 if worker.get('currentTaskId'):raise SystemExit('Original Atlas profile is busy')
 r=subprocess.run([str(m.WALL),'claim',worker['id'],'WonPlace and TideLine read-only page analytics',binding['url'],'compact','session'],capture_output=True,text=True,timeout=60)
 if r.returncode:raise SystemExit('Browser admission unavailable')
 receipt=json.loads(r.stdout)
 if not receipt.get('sessionReady'):raise SystemExit('Browser placement unavailable')
 task,lease=receipt['taskId'],receipt['lease']['id']
ready=m.validate_session(binding,m.state(),task,lease)
r=subprocess.run([str(m.WALL),'controller',task,lease],capture_output=True,text=True,timeout=30)
if r.returncode:raise SystemExit('Governed controller unavailable; persistent session retained')
gateway=json.loads(r.stdout)
if gateway.get('taskId')!=task or gateway.get('pageTargetId')!=ready['page_target_id']:raise SystemExit('Controller identity mismatch')
ready['endpoint']=gateway['endpoint'];print(json.dumps(ready))
