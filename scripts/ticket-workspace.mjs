// Task-scoped tools. Credentials stay in the existing local operations configuration.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {signedHeaders} from '../src/company-signing.js';
export async function workspaceCall({root=path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations'),taskId,action,...data},transport=fetch){
 if(!/^[a-f0-9]{12}$/.test(taskId||''))throw Error('Exact managed task ID required');
 const record=JSON.parse(await fs.readFile(path.join(root,'task-progress',taskId+'.json'),'utf8'));
 if(record.link.taskId!==taskId||!['wonplace','voyage'].includes(record.company))throw Error('Explicit CRM task link required');
 const contract=JSON.parse(await fs.readFile(path.join(root,'reporting-contract.json'),'utf8')),config=JSON.parse(await fs.readFile(contract.configPath,'utf8')),runtimeId=(await fs.readFile(path.join(root,'worker-id'),'utf8')).trim();
 const url='https://voyage.tidelinestrats.com/api/company-ticket-collaboration/'+record.company,body=JSON.stringify({taskId,runtimeId,action,...data});
 const response=await transport(url,{method:'POST',headers:await signedHeaders(config.secrets[record.company],'POST',url,'Task workspace tools',body),body,redirect:'manual',signal:AbortSignal.timeout(15000)}),result=await response.json();
 if(!response.ok)throw Object.assign(Error(result.error||'Workspace request failed'),{status:response.status});return result;
}
async function main(){
 const args=process.argv.slice(2),command=args[0],get=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined,taskId=get('--task')||process.env.AGENT_COORDINATOR_TASK;
 const send=(action,data={})=>workspaceCall({taskId,action,...data});
 if(command==='read'||command==='list'||command==='leave'){console.log(JSON.stringify(await send(command,command==='list'?{offset:Number(get('--offset')||0)}:{}),null,2));return;}
 if(command==='focus'||command==='type'){
  const current=await send('read'),prior=current.workspace.tasks.find(t=>t.taskId===taskId),field=get('--field')||null,draft=command==='type'?await fs.readFile(get('--file'),'utf8'):'';
  const result=await send('presence',{expectedSequence:prior?.sequence||0,presence:{field,draft,caret:get('--caret')?Number(get('--caret')):draft.length,status:command==='type'?'typing':get('--status')||'reading'}});console.log(JSON.stringify(result));return;
 }
 if(command==='save'){const value=JSON.parse(await fs.readFile(get('--file'),'utf8'));if(!Number.isInteger(value.expectedRevision)||!value.patch)throw Error('File requires expectedRevision and patch; read the ticket first.');console.log(JSON.stringify(await send('save',value),null,2));return;}
 throw Error('Use read | list | focus [--field NAME] [--status reading|working|testing|waiting] | type --field NAME --file DRAFT [--caret N] | save --file PATCH.json | leave; all with --task ID.');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
