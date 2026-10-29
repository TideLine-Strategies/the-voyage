import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
export function launcherText(node,gate){return '#!/bin/sh\nexport PYTHONDONTWRITEBYTECODE=1\nexec '+quote(node)+' '+quote(gate)+' "$@"\n';}
export function allowedLauncher(current,{original,previousHash}){return current===original||!!previousHash&&hash(current)===previousHash;}
export async function installTicketContract({root,configPath,node=process.execPath,home=os.homedir(),now=Date.now()}){
 const launcher=path.join(home,'.local/bin/agent-workspace'),core=path.join(home,'.agent-workspaces/coordinator/coordinator.py'),gate=path.join(root,'scripts/agent-workspace-ticket-gate.mjs'),meta=path.join(root,'reporting-contract.json');
 const original='#!/bin/sh\nexport PYTHONDONTWRITEBYTECODE=1\nexec /usr/bin/python3 '+core+' "$@"\n';
 let previous=null;try{previous=JSON.parse(await fs.readFile(meta,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const current=await fs.readFile(launcher,'utf8');if(!allowedLauncher(current,{original,previousHash:previous?.launcherHash}))throw Error('Coordinator launcher changed outside this installer; preserve it and reconcile before replacing anything');
 await fs.access(core);await fs.access(gate);await fs.access(configPath);
 if(!previous)await fs.writeFile(path.join(root,'coordinator-launcher.original'),current,{flag:'wx',mode:0o600});
 const next=launcherText(node,gate),contract={version:1,enforcedAt:previous?.enforcedAt||now,installedAt:now,configPath,launcherHash:hash(next),corePath:core,coreHash:hash(await fs.readFile(core)),reportCommand:quote(node)+' '+quote(path.join(root,'scripts/ticket-task-progress.mjs')),scope:['github.com/quanbuilds/premieros','github.com/quanbuilds/the-voyage'],legacyTasksPreserved:true};
 const temp=meta+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(contract)+'\n',{mode:0o600});await fs.rename(temp,meta);
 const temporary=launcher+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,next,{mode:0o700});await fs.rename(temporary,launcher);
 if(hash(await fs.readFile(core))!==contract.coreHash)throw Error('Coordinator core changed during contract installation; reconcile without replacing it');
 if(hash(await fs.readFile(launcher))!==contract.launcherHash)throw Error('Installed coordinator launcher hash differs; reconcile before retry');return {enforced:true,enforcedAt:contract.enforcedAt,scope:contract.scope,coordinatorChanged:false};
}
