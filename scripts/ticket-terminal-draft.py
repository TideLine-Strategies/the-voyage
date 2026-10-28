"""Run Codex in a PTY and bracket-paste a draft only after its composer is ready."""
import os,sys,pty,select,termios,tty,signal,fcntl,struct,re,pathlib,time

def bracketed_draft(prompt):
    # Strip terminal controls from untrusted ticket text. Newlines stay inside paste.
    clean=''.join(c for c in prompt if c in '\n\t' or (ord(c)>=32 and ord(c)!=127))
    return b'\x1b[200~'+clean.encode()+b'\x1b[201~'

def main():
    import json
    prompt=json.load(open(sys.argv[1]))['prompt']
    receipt={'pasted':False,'submitted':False,'at':time.time(),'taskId':None}
    status=pathlib.Path(sys.argv[1]).with_name('draft-status.json')
    status.write_text(json.dumps(receipt))
    fd=sys.stdin.fileno(); previous=termios.tcgetattr(fd)
    pid,master=pty.fork()
    if pid==0:
        if os.environ.get('TERM') in (None,'','dumb'):os.environ['TERM']='xterm-256color'
        os.execvp('agent-workspace',['agent-workspace','launch','--agent','codex','--repo',sys.argv[2],'--task',sys.argv[3],'--delivery','deploy','--','codex','--yolo','--no-daemon'])
    def resize(*_):
        try:fcntl.ioctl(master,termios.TIOCSWINSZ,fcntl.ioctl(fd,termios.TIOCGWINSZ,b'\0'*8))
        except OSError:pass
    signal.signal(signal.SIGWINCH,resize);signal.signal(signal.SIGTERM,lambda *_:sys.exit(143));resize();seen=b'';pasted=False
    try:
        tty.setraw(fd)
        while True:
            ready,_,_=select.select([fd,master],[],[],1)
            if master in ready:
                try:data=os.read(master,65536)
                except OSError:break
                if not data:break
                os.write(sys.stdout.fileno(),data);seen=(seen+data)[-32768:]
                match=re.search(rb'Queued task ([a-f0-9]{12})',seen)
                if match and not receipt['taskId']:
                    receipt['taskId']=match[1].decode();status.write_text(json.dumps(receipt))
                if not pasted and b'\x1b[?2004h' in seen and '›'.encode() in seen:
                    os.write(master,bracketed_draft(prompt));pasted=True
                    receipt.update(pasted=True,at=time.time(),supervisorPid=pid);status.write_text(json.dumps(receipt))
            if fd in ready:
                data=os.read(fd,65536)
                if not data:break
                os.write(master,data)
    finally:
        termios.tcsetattr(fd,termios.TCSADRAIN,previous)
        try:os.killpg(pid,signal.SIGTERM)
        except (ProcessLookupError,PermissionError):pass
    _,status=os.waitpid(pid,0);return os.waitstatus_to_exitcode(status)
if __name__=='__main__':sys.exit(main())
