# Synthetic PTY, fake coordinator, no Terminal.app or model turn.
import os,pty,select,tempfile,pathlib,json,sys,time
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);(root/'prompt.json').write_text(json.dumps({'prompt':'First line\nSecond line'}))
    fake=root/'agent-workspace';fake.write_text("#!/usr/bin/python3\nimport os,sys,tty,pathlib\nassert sys.argv[-3:]==['codex','--yolo','--no-daemon']\ntty.setraw(0)\nos.write(1,b'\\x1b[?2004h'+chr(8250).encode())\nb=b''\nwhile b'\\x1b[201~' not in b:b+=os.read(0,65536)\npathlib.Path(os.environ['CAPTURE']).write_bytes(b)\n");fake.chmod(0o700)
    env={**os.environ,'PATH':directory+':'+os.environ['PATH'],'CAPTURE':str(root/'captured')}
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
    os.waitpid(pid,0)
    assert (root/'captured').read_bytes()==b'\x1b[200~First line\nSecond line\x1b[201~'
    receipt=json.loads((root/'draft-status.json').read_text());assert receipt['pasted'] and receipt['submitted'] is False
print('Managed PTY handoff pasted the exact multiline draft without Enter.')
