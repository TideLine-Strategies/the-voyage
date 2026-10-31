// Narrow, reversible integration with the installed loopback-only Room widget.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
export function roomPython(source){
 if(source.includes('# voyage-task-colors-v1'))return source;
 const marker='    return dict(at=now,';if(!source.includes(marker))throw Error('Room Python changed; preserve it and reconcile');
 return source.replace(marker,`    # voyage-task-colors-v1: explicit, redacted task metadata only.\n    task_room = read_json(HOME / 'Library/Application Support/TideLine/Ticket Operations/task-room.json', {})\n    task_rows = task_room.get('tasks', []) if isinstance(task_room, dict) else []\n    task_colors = [dict(taskId=x['taskId'], label=str(x.get('label', x['taskId']))[:200], color=x['color'], state=str(x.get('state', 'working'))[:40]) for x in task_rows[:64] if isinstance(x, dict) and __import__('re').fullmatch(r'[a-f0-9]{12}', str(x.get('taskId', ''))) and __import__('re').fullmatch(r'#[0-9a-f]{6}', str(x.get('color', ''))) and isinstance(x.get('expiresAt'), (int, float)) and x['expiresAt'] > now * 1000]\n    return dict(crmTasks=task_colors, at=now,`);
}
export function roomHtml(source){
 if(source.includes('id="crm-task-colors"'))return source;
 if(!source.includes('<main>')||!source.includes('function draw(){'))throw Error('Room HTML changed; preserve it and reconcile');
 const banner='<aside id="crm-task-colors" aria-label="CRM task colors" style="display:flex;gap:5px;flex-wrap:wrap;max-height:62px;overflow:auto;flex:none"></aside>';
 source=source.replace('<main>','<main>'+banner);
 return source.replace('function draw(){',`function draw(){\nconst taskColors=document.getElementById('crm-task-colors');taskColors.replaceChildren();for(const task of (snapshot?.crmTasks||[])){if(!/^#[0-9a-f]{6}$/.test(task.color))continue;const chip=document.createElement('span');chip.textContent=task.label;chip.title=task.taskId+' · '+task.state;chip.style.cssText='font-size:10px;border-left:3px solid '+task.color+';padding:4px 6px;background:#17242b;border-radius:4px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:'+task.color;taskColors.append(chip);}\n`);
}
async function main(){
 const root=path.join(os.homedir(),'Library/Application Support/Loki/instant-runtime/scripts'),files=[['browser_room.py',roomPython],['browser_room.html',roomHtml]],updates=[];
 for(const [name,transform]of files){const file=path.join(root,name),before=await fs.readFile(file,'utf8'),after=transform(before);updates.push({file,before,after});}
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({ready:true,changed:updates.filter(x=>x.before!==x.after).map(x=>path.basename(x.file))}));return;}
 const backup=path.join(os.homedir(),'Library/Application Support/TideLine/Ticket Operations/room-color-backup');await fs.mkdir(backup,{recursive:true,mode:0o700});
 for(const item of updates){if(item.before===item.after)continue;try{await fs.writeFile(path.join(backup,path.basename(item.file)),item.before,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}if(await fs.readFile(item.file,'utf8')!==item.before)throw Error('Room changed during install; reconcile');await fs.writeFile(item.file,item.after);}
 console.log(JSON.stringify({installed:true,backup,roomRestartRequired:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
