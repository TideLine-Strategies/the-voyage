import {execFileSync} from 'node:child_process';import os from 'node:os';import path from 'node:path';
export function tileTerminalDisplay(run=(args)=>JSON.parse(execFileSync(path.join(os.homedir(),'.local/bin/macarchy'),args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}))){
 try{const status=run(['status']),display=status.display?.find(d=>d.builtin)?.id;if(!display)return {ok:false,message:'Built-in display is unavailable'};const result=run(['room-layout','mode=grid','display='+display]);return {ok:result.ok===true,display,receipt:result.receipt||null,message:result.message||result.receipt?.message||''};}catch(error){return {ok:false,message:'Terminal layout could not be verified; see private helper diagnostics'};}
}
