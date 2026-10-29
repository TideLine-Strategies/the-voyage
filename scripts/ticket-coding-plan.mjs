import os from 'node:os';
export function launchArgs(p,repo){if(p.agent==='codex')return ['exec','--json','--yolo','-C',os.homedir(),'-'];return ['launch','--agent',p.agent,'--repo',repo,'--task',p.code+' '+p.title.slice(0,120),'--delivery','deploy','--crm-ticket',p.id,'--crm-owner',p.actor,'--','claude','-p','--output-format','json','--permission-mode','acceptEdits'];}
export function codingEnv(agent,input=process.env){const env={...input};delete env.CLAUDECODE;if(agent==='claude')delete env.CLAUDE_CODE_OAUTH_TOKEN;if(agent==='codex'){delete env.CODEX_CI;for(const key of Object.keys(env))if(key.startsWith('AGENT_WORKSPACE_')||key.startsWith('AGENT_COORDINATOR_'))delete env[key];}return env;}
export function interactiveArgs(p,repo,sessionScript,promptFile){return [sessionScript,promptFile];}

export function terminalCommand(p,repo,driver,promptFile){const quote=s=>"'"+String(s).replaceAll("'","'\\''")+"'";return '#!/bin/sh\nexport PATH='+quote(process.env.PATH)+'\nexec '+['/usr/bin/python3',driver,promptFile,repo,p.code+' '+p.title.slice(0,120)].map(quote).join(' ')+'\n';}
