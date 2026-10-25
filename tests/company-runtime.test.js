import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {copyCompanyDependencies} from '../scripts/company-runtime.mjs';
test('installed CLI survives removal of its original build dependency directory',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'company-runtime-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'build/node_modules'),destination=path.join(dir,'runtime/node_modules');
 await fs.mkdir(path.join(source,'.bin'),{recursive:true});await fs.mkdir(path.join(source,'wrangler/bin'),{recursive:true});await fs.writeFile(path.join(source,'wrangler/bin/wrangler.js'),"console.log('independent runtime')");await fs.symlink('../wrangler/bin/wrangler.js',path.join(source,'.bin/wrangler'));
 await fs.mkdir(path.join(destination,'.bin'),{recursive:true});await fs.symlink(path.join(source,'wrangler/bin/wrangler.js'),path.join(destination,'.bin/wrangler'));
 await copyCompanyDependencies(source,destination);await fs.rm(path.join(dir,'build'),{recursive:true});
 assert.equal(await fs.readlink(path.join(destination,'.bin/wrangler')),'../wrangler/bin/wrangler.js');assert.equal(execFileSync(process.execPath,[path.join(destination,'.bin/wrangler')],{encoding:'utf8'}).trim(),'independent runtime');
});
