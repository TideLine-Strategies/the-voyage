// Read-only artifact validation. Does not exercise production services.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='docs/audits/2026-11-01-astra/';
const inventory=JSON.parse(fs.readFileSync(root+'inventory.json','utf8'));
assert.match(inventory.baseline,/^[a-f0-9]{40}$/);
assert.equal(inventory.files.length,343);
assert.equal(inventory.files.reduce((n,f)=>n+f.lines,0),37870);
for(const file of inventory.files){
 const bytes=execFileSync('git',['show',inventory.baseline+':'+file.path],{maxBuffer:20000000});
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
}
const findings=JSON.parse(fs.readFileSync(root+'findings.json','utf8'));
assert.equal(findings.baseline,inventory.baseline);
assert.equal(new Set(findings.findings.map(f=>f.id)).size,20);
const report=fs.readFileSync(root+'REPORT.md','utf8');
for(const f of findings.findings){assert(report.includes('### '+f.id));for(const key of ['evidence','repair','acceptance'])assert(f[key]?.length>40);for(const ref of f.source){if(ref.startsWith('docs/audits/'))assert(fs.existsSync(ref));else assert(inventory.files.some(p=>p.path===ref.replace(/:\d.*$/,'')),ref);}}
const worker=JSON.parse(fs.readFileSync(root+'worker-results.json','utf8'));
assert.equal(worker.baseline,inventory.baseline);
for(const [key,value] of Object.entries(worker))if(key!=='baseline')assert.equal(value,true,key);
for(const line of fs.readFileSync(root+'client-results.jsonl','utf8').trim().split('\n'))JSON.parse(line);
assert(fs.readFileSync(root+'VALIDATION.md','utf8').includes('230'));
console.log(JSON.stringify({accepted:true,baseline:inventory.baseline,hashedFiles:343,findings:20,artifactIntegrity:true}));
