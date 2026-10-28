"""Run Codex in a PTY and bracket-paste a draft only after its composer is ready."""
import os,sys,pty,select,termios,tty,signal,fcntl,struct

def bracketed_draft(prompt):
    # Strip terminal controls from untrusted ticket text. Newlines stay inside paste.
    clean=''.join(c for c in prompt if c in '\n\t' or (ord(c)>=32 and ord(c)!=127))
    return b'\x1b[200~'+clean.encode()+b'\x1b[201~'

def main():
    import json
    prompt=json.load(open(sys.argv[1]))['prompt']
    fd=sys.stdin.fileno(); previous=termios.tcgetattr(fd)
    pid,master=pty.fork()
    if pid==0:os.execvp('codex',['codex','--yolo','--no-daemon'])
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
                if not pasted and b'\x1b[?2004h' in seen:
                    os.write(master,bracketed_draft(prompt));pasted=True
            if fd in ready:
                data=os.read(fd,65536)
                if not data:break
                os.write(master,data)
    finally:
        termios.tcsetattr(fd,termios.TCSADRAIN,previous)
        try:os.killpg(pid,signal.SIGTERM)
        except ProcessLookupError:pass
    _,status=os.waitpid(pid,0);return os.waitstatus_to_exitcode(status)
if __name__=='__main__':sys.exit(main())
