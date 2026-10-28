"""Run Codex in a PTY and bracket-paste a draft only after its composer is ready."""
import os,sys,pty,select,termios,tty,signal,fcntl,struct,re,pathlib,time

def bracketed_draft(prompt):
    # Strip terminal controls from untrusted ticket text. Newlines stay inside paste.
    clean=''.join(c for c in prompt if c in '\n\t' or (ord(c)>=32 and ord(c)!=127))
    return b'\x1b[200~'+clean.encode()+b'\x1b[201~'

def expanded_chunks(prompt, size=128):
    clean=''.join(c for c in prompt if c in '\n\t' or (ord(c)>=32 and not 127<=ord(c)<=159))
    return [bracketed_draft(clean[i:i+size]) for i in range(0,len(clean),size)]

def main():
    import json
    prompt=json.load(open(sys.argv[1]))['prompt']
    receipt={'pasted':False,'expanded':False,'submitted':False,'at':time.time(),'taskId':None,'cwd':os.path.expanduser('~'),'permissions':'full-access'}
    status=pathlib.Path(sys.argv[1]).with_name('draft-status.json')
    status.write_text(json.dumps(receipt))
    fd=sys.stdin.fileno(); previous=termios.tcgetattr(fd)
    pid,master=pty.fork()
    if pid==0:
        if os.environ.get('TERM') in (None,'','dumb'):os.environ['TERM']='xterm-256color'
        for key in list(os.environ):
            if key.startswith(('AGENT_WORKSPACE_','AGENT_COORDINATOR_')) or key=='CODEX_CI':os.environ.pop(key,None)
        os.chdir(os.path.expanduser('~'))
        os.execvp('codex',['codex','--yolo','--no-daemon','-C',os.path.expanduser('~'),'-c','disable_paste_burst=true'])
    def resize(*_):
        try:
            rows,cols,x,y=struct.unpack('HHHH',fcntl.ioctl(fd,termios.TIOCGWINSZ,b'\0'*8))
            fcntl.ioctl(master,termios.TIOCSWINSZ,struct.pack('HHHH',rows or 24,cols or 100,x,y))
        except OSError:pass
    signal.signal(signal.SIGWINCH,resize);signal.signal(signal.SIGTERM,lambda *_:sys.exit(143));resize();seen=b'';pasted=False;paste_started=False;chunks=[];next_paste=0
    try:
        tty.setraw(fd)
        while True:
            ready,writable,_=select.select([fd,master],[master] if chunks and time.monotonic()>=next_paste else [],[],0.015 if chunks else 1)
            if master in ready:
                try:data=os.read(master,65536)
                except OSError:break
                if not data:break
                os.write(sys.stdout.fileno(),data);seen=(seen+data)[-32768:]
                match=re.search(rb'Queued task ([a-f0-9]{12})',seen)
                if match and not receipt['taskId']:
                    receipt['taskId']=match[1].decode();status.write_text(json.dumps(receipt))
                if not paste_started and b'\x1b[?2004h' in seen and '›'.encode() in seen:
                    chunks=expanded_chunks(prompt);paste_started=True
            if master in writable and chunks:
                # Drain renders between small writes; never block both PTY directions.
                part=chunks[0];written=os.write(master,part)
                if written<len(part):chunks[0]=part[written:]
                else:chunks.pop(0)
                next_paste=time.monotonic()+0.015
                if not chunks:
                    pasted=True;receipt.update(pasted=True,expanded=True,at=time.time(),supervisorPid=pid);status.write_text(json.dumps(receipt))
            if fd in ready:
                data=os.read(fd,65536)
                if not data:break
                if pasted and (b'\r' in data or b'\n' in data):
                    receipt['submitted']=True;status.write_text(json.dumps(receipt))
                os.write(master,data)
    finally:
        termios.tcsetattr(fd,termios.TCSADRAIN,previous)
        try:os.killpg(pid,signal.SIGTERM)
        except (ProcessLookupError,PermissionError):pass
    _,status=os.waitpid(pid,0);return os.waitstatus_to_exitcode(status)
if __name__=='__main__':sys.exit(main())
