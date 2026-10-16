import {spawnSync} from 'node:child_process';
const cli='node_modules/.bin/wrangler';
const checked=spawnSync(cli,['secret','list','--name','the-voyage','--profile','tideline','--format','json'],{encoding:'utf8'});
if(checked.status!==0)throw Error('Could not verify sign-in credential configuration.');
const names=new Set(JSON.parse(checked.stdout).map(item=>item.name));
if(!names.has('GOOGLE_CLIENT_ID')||!names.has('GOOGLE_CLIENT_SECRET'))throw Error('Google sign-in credentials must be configured before this release.');
for(const args of [['d1','migrations','apply','the-voyage','--remote','--profile','tideline'],['deploy','--profile','tideline']]){
 const result=spawnSync(cli,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
