import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),config=process.env.COMPANY_OPERATIONS_CONFIG;
if(!config)throw Error('Existing private Company source configuration required');
const active=await(await fetch('https://voyage.tidelinestrats.com/__release.json')).json();
const files=['scripts/ticket-operations-server.mjs','scripts/ticket-daily-sweep.mjs','scripts/ticket-mail.mjs','scripts/ticket-coding-plan.mjs','src/company-signing.js','src/ticket-digest-policy.js'];
execFileSync('git',['diff','--quiet',active.commit,'--',...files]);
try{for(const f of await fs.readdir(path.join(root,'state'))){if(!f.endsWith('.json'))continue;let j;try{j=JSON.parse(await fs.readFile(path.join(root,'state',f),'utf8'));}catch{continue;}if(j.pid)try{process.kill(j.pid,0);throw Object.assign(Error('A coding launcher is still active; preserve it before updating the helper'),{busy:true});}catch(e){if(e.busy)throw e;}}}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(root,{recursive:true,mode:0o700});for(const file of files){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true,mode:0o700});await fs.copyFile(file,path.join(root,file));await fs.chmod(path.join(root,file),0o600);}
const uid=process.getuid(),launchDir=path.join(os.homedir(),'Library/LaunchAgents');await fs.mkdir(launchDir,{recursive:true});
const base={RunAtLoad:true,WorkingDirectory:root,EnvironmentVariables:{PATH:path.join(os.homedir(),'.local/bin')+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',COMPANY_OPERATIONS_CONFIG:config,TICKET_OPERATIONS_HOME:root},StandardOutPath:path.join(root,'operations.log'),StandardErrorPath:path.join(root,'operations-error.log')};
for(const [label,script,extra]of [['com.tideline.ticket-operations','ticket-operations-server.mjs',{KeepAlive:true}],['com.tideline.muninn-ticket-sweep','ticket-daily-sweep.mjs',{StartInterval:900,StartCalendarInterval:{Hour:9,Minute:0}}]]){
 const plist=path.join(launchDir,label+'.plist'),data={...base,...extra,Label:label,ProgramArguments:[process.execPath,path.join(root,'scripts',script)]};
 execFileSync('/usr/bin/python3',['-c','import plistlib,json,sys; plistlib.dump(json.load(sys.stdin),open(sys.argv[1],"wb"))',plist],{input:JSON.stringify(data)});try{execFileSync('/bin/launchctl',['bootout','gui/'+uid+'/'+label],{stdio:'ignore'});}catch{}execFileSync('/bin/launchctl',['bootstrap','gui/'+uid,plist]);
}
await fs.writeFile(path.join(root,'release.json'),JSON.stringify({installedAt:Date.now(),activeWebCommit:active.commit,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()})+'\n',{mode:0o600});
console.log(JSON.stringify({installed:true,root,daily:'09:00 America/Chicago; catch-up while awake',activeWebCommit:active.commit}));
