import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const results=[];
for(const company of ['tideline','wonplace','voyage']){
 try{const receipt=JSON.parse(execFileSync(process.execPath,['scripts/company-sync.mjs',company,'--send'],{encoding:'utf8',timeout:150000,stdio:['ignore','pipe','pipe']}));results.push({company,ok:true,receipt:receipt.receipt});}
 catch{results.push({company,ok:false,error:'Provider synchronization did not complete; inspect source status before retrying'});}
}
const receipt={checkedAt:new Date().toISOString(),results};
await fs.writeFile('last-sync.json',JSON.stringify(receipt),{mode:0o600});
console.log(JSON.stringify(receipt));
if(results.some(r=>!r.ok))process.exitCode=1;
