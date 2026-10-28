# Synthetic PTY and fake Codex: root access, expanded paste, no submitted turn.
import os,pty,select,tempfile,pathlib,json,sys,time
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);text=('Section to edit\n'*100);(root/'prompt.json').write_text(json.dumps({'prompt':text}))
    fake=root/'codex';fake.write_text("#!/usr/bin/python3\nimport os,sys,tty,pathlib,json\nassert '--yolo' in sys.argv and '-C' in sys.argv\nassert sys.argv[sys.argv.index('-C')+1]==os.path.expanduser('~')\nassert 'disable_paste_burst=true' in sys.argv\nassert 'AGENT_COORDINATOR_TASK' not in os.environ\ntty.setraw(0)\nos.write(1,b'\\x1b[?2004h'+chr(8250).encode())\nb=b''\nexpected=int(os.environ['CHUNKS'])\nwhile b.count(b'\\x1b[201~')<expected:b+=os.read(0,65536)\npathlib.Path(os.environ['CAPTURE']).write_bytes(b)\n");fake.chmod(0o700)
    import importlib.util
    spec=importlib.util.spec_from_file_location('driver','scripts/ticket-terminal-draft.py');driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
    chunks=driver.expanded_chunks(text);env={**os.environ,'PATH':directory+':'+os.environ['PATH'],'CAPTURE':str(root/'captured'),'CHUNKS':str(len(chunks)),'AGENT_COORDINATOR_TASK':'must-be-cleared'}
    pid,master=pty.fork()
    if pid==0:os.execve('/usr/bin/python3',['python3','-B','scripts/ticket-terminal-draft.py',str(root/'prompt.json'),'/synthetic/repo','Synthetic draft'],env)
    deadline=time.time()+10
    while time.time()<deadline:
        ready,_,_=select.select([master],[],[],.1)
        if ready:
            try:
                if not os.read(master,65536):break
            except OSError:break
    else:raise AssertionError('Draft driver did not finish')
    os.waitpid(pid,0);assert (root/'captured').read_bytes()==b''.join(chunks)
    for chunk in chunks:assert len(chunk.decode()[6:-6])<=128
    receipt=json.loads((root/'draft-status.json').read_text());assert receipt['pasted'] and receipt['expanded'] and receipt['submitted'] is False;assert receipt['permissions']=='full-access'
print('Root Codex launch and expanded multiline draft verified without Enter.')
