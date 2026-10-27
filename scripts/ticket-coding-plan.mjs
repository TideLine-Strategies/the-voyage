export function launchArgs(p,repo){const worker=p.agent==='codex'?['codex','exec','--json','--sandbox','workspace-write','-']:['claude','-p','--output-format','json','--permission-mode','acceptEdits'];return ['launch','--agent',p.agent,'--repo',repo,'--task',p.code+' '+p.title.slice(0,120),'--delivery','deploy','--',...worker];}

export function codingEnv(agent,input=process.env){const env={...input};delete env.CLAUDECODE;if(agent==='claude')delete env.CLAUDE_CODE_OAUTH_TOKEN;if(agent==='codex')env.CODEX_CI='1';return env;}
