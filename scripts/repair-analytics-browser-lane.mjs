// Narrow host repair for legacy lane admission. Never changes profiles or overlap rules.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const before=`  const fits = (bounds) => {
    try { assertFreeformLayout([...others, { bounds }], "new task lane"); return true; }
    catch { return false; }
  };`;
const after=`  const fits = (bounds) => {
    try {
      // Existing native frames may include chrome outside this legacy grid.
      // Validate the new candidate's grid bounds without moving retained windows.
      assertFreeformLayout([{ bounds }], "new task lane");
      for (const entry of others) {
        const other = entry?.bounds;
        if (!other || ![other.x, other.y, other.width, other.height].every(Number.isFinite)
            || other.width <= 0 || other.height <= 0) return false;
        const overlap = Math.max(0, Math.min(bounds.x + bounds.width, other.x + other.width) - Math.max(bounds.x, other.x))
          * Math.max(0, Math.min(bounds.y + bounds.height, other.y + other.height) - Math.max(bounds.y, other.y));
        if (overlap > 0.5) return false;
      }
      return true;
    } catch { return false; }
  };`;
const predicate=new Function('bounds','others','assertFreeformLayout',after+' return fits(bounds);');
const grid=rows=>{for(const {bounds:b}of rows)if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<0||b.y<0||b.width<120||b.height<120||b.x+b.width>1000||b.y+b.height>1000)throw Error('outside');};
assert(predicate({x:500,y:0,width:500,height:1000},[{bounds:{x:0,y:-20,width:490,height:1040}}],grid));
assert(!predicate({x:400,y:0,width:500,height:1000},[{bounds:{x:0,y:-20,width:490,height:1040}}],grid));
assert(!predicate({x:500,y:0,width:501,height:1000},[],grid));
assert(!predicate({x:500,y:0,width:500,height:1000},[{bounds:{x:NaN,y:0,width:100,height:100}}],grid));
const oldSlot='    bounds = xs.map((x) => ({ x, y: LG_GRID.y, width, height: LG_GRID.height })).find(fits);';
const newSlot='    bounds = xs.map((x) => ({ x, y: LG_GRID.y, width: Math.min(width, LG_GRID.x + LG_GRID.width - x), height: LG_GRID.height })).filter((candidate) => candidate.width >= 500).find(fits);';
const choose=new Function('xs','LG_GRID','fits','width','let bounds;'+newSlot+' return bounds;');
const nativeArea={x:-440,y:-1042,width:2544,height:1034};
const retained=[{bounds:{x:-440,y:-1042,width:1267,height:512}},{bounds:{x:839,y:-1042,width:627,height:1034}}];
const checkNative=rows=>{for(const {bounds:b}of rows)if(b.x<nativeArea.x||b.y<nativeArea.y||b.x+b.width>nativeArea.x+nativeArea.width||b.y+b.height>nativeArea.y+nativeArea.height)throw Error('outside native area');};
assert.equal(choose([-440,839,1478],nativeArea,b=>predicate(b,retained,checkNative),627).width,626);
assert.equal(choose([1605],nativeArea,()=>true,627),undefined);
const targets=[path.join(os.homedir(),'Downloads/Loki/instant/agent-wall/agent_wall.mjs'),path.join(os.homedir(),'Library/Application Support/Loki/instant-runtime/agent-wall/agent_wall.mjs')];
const hash=text=>createHash('sha256').update(text).digest('hex');const planned=[];
for(const file of targets){const text=await fs.readFile(file,'utf8');let next=text;if(next.includes(before)){assert.equal(next.split(before).length,2);next=next.replace(before,after);}else assert(next.includes(after),'Unexpected candidate validation');if(next.includes(oldSlot)){assert.equal(next.split(oldSlot).length,2);next=next.replace(oldSlot,newSlot);}else assert(next.includes(newSlot),'Unexpected lane allocation');planned.push({file,changed:next!==text,beforeHash:hash(text),afterHash:hash(next),text,next});}
console.log(JSON.stringify({checks:6,passed:true,apply:process.argv.includes('--apply'),targets:planned.map(({text,next,...p})=>p)}));
if(process.argv.includes('--apply')){
 const state=await(await fetch('http://127.0.0.1:17771/api/state',{signal:AbortSignal.timeout(5000)})).json();assert(!Object.values(state.workers).some(w=>w.currentTaskId),'A browser worker is active; defer the host change');
 const folder=path.join(os.homedir(),'Library/Application Support/TideLine/Analytics Recovery',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(folder,{recursive:true,mode:0o700});
 for(const [i,p]of planned.entries())if(p.changed){await fs.writeFile(path.join(folder,i+'-before.mjs'),p.text,{mode:0o600});const staged=path.join(folder,i+'-after.mjs');await fs.writeFile(staged,p.next,{mode:0o600});execFileSync(process.execPath,['--check',staged],{stdio:'pipe'});}
 for(const p of planned)if(p.changed){assert.equal(hash(await fs.readFile(p.file,'utf8')),p.beforeHash,'Source changed during review');const mode=(await fs.stat(p.file)).mode&0o777;await fs.writeFile(p.file+'.lane-repair.tmp',p.next,{mode});await fs.rename(p.file+'.lane-repair.tmp',p.file);}
 await fs.writeFile(path.join(folder,'receipt.json'),JSON.stringify({at:Date.now(),targets:planned.map(({text,next,...p})=>p),checks:6}),{mode:0o600});console.log(JSON.stringify({applied:true,receipt:path.join(folder,'receipt.json'),serviceRestarted:false}));
}
