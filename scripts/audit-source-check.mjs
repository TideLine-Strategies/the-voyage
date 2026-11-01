// Non-executing whole-tree syntax review. Never imports deployment/install scripts.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {transform} from 'esbuild';
const baseline=JSON.parse(fs.readFileSync('docs/audits/2026-11-01-astra/inventory.json','utf8'));
const files=[...new Set([...baseline.files.map(f=>f.path),...execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)])];
const results=[];
for(const file of files){
 if(file==='docs/audits/2026-11-01-astra/current-source-check.json')continue;
 if(!fs.existsSync(file)){results.push({path:file,check:'removed from current source; baseline retained in inventory.json',accepted:true,lineCount:0,warnings:[]});continue;}
 const bytes=fs.readFileSync(file),ext=path.extname(file),lines=bytes.toString('utf8').split('\n');
 const result={path:file,sha256:createHash('sha256').update(bytes).digest('hex'),lineCount:bytes.length?lines.length-(lines.at(-1)===''?1:0):0,check:'inventory',warnings:[]};
 try{
  if(['.woff2','.png','.jpg','.ico'].includes(ext)){result.check='binary identity';result.lineCount=0;}
  else if(['.js','.mjs','.ts','.tsx'].includes(ext)){
   const r=await transform(bytes.toString('utf8'),{loader:ext==='.tsx'?'tsx':ext==='.ts'?'ts':'js',sourcefile:file,target:'es2022',jsx:'automatic',logLevel:'silent'});result.check='full-file JavaScript/TypeScript/JSX syntax';result.warnings=r.warnings.map(w=>({text:w.text,line:w.location?.line}));
  }else if(ext==='.html'){
   const text=bytes.toString('utf8');let n=0;for(const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=|application\/(?:ld\+)?json/.test(m[1]))continue;n++;await transform(m[2],{loader:'js',sourcefile:file+':inline-'+n,logLevel:'silent'});}result.check='all inline script syntax; markup inventory';
  }else if(ext==='.css'){const r=await transform(bytes.toString('utf8'),{loader:'css',sourcefile:file,logLevel:'silent'});result.check='full-file CSS syntax';result.warnings=r.warnings.map(w=>({text:w.text,line:w.location?.line}));}
  else if(ext==='.py'){execFileSync('/usr/bin/python3',['-c','import ast,sys; ast.parse(open(sys.argv[1]).read(),filename=sys.argv[1])',file],{stdio:'pipe'});result.check='full-file Python AST syntax';}
  else if(ext==='.sh'){execFileSync('/bin/sh',['-n',file],{stdio:'pipe'});result.check='full-file shell syntax (not executed)';}
  else if(ext==='.json'){JSON.parse(bytes.toString('utf8'));result.check='JSON structure';}
  else if(ext==='.jsonc'){await transform(bytes.toString('utf8'),{loader:'json',sourcefile:file,logLevel:'silent'});result.check='JSONC structure';}
  result.accepted=true;
 }catch(e){result.accepted=false;result.error=e.message;}
 results.push(result);
}
const report={baseline:baseline.baseline,sourceHead:process.env.AUDIT_SOURCE_COMMIT||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:!process.env.AUDIT_SOURCE_COMMIT,scope:'Syntax/structure is automated coverage, not a substitute for semantic manual review or live acceptance.',files:results};
fs.writeFileSync('docs/audits/2026-11-01-astra/current-source-check.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({files:results.length,failures:results.filter(r=>!r.accepted),warnings:results.filter(r=>r.warnings.length).map(({path,warnings})=>({path,warnings}))}));
if(results.some(r=>!r.accepted))process.exitCode=1;
