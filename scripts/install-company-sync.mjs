// Installs a bounded, read-only provider collector. No new tokens or cloud billing.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const config=process.env.COMPANY_OPERATIONS_CONFIG;
if(!config||(await fs.stat(config)).mode&0o077)throw Error('Private existing company configuration required');
const data=JSON.parse(await fs.readFile(config,'utf8'));if(data.voyageOrigin!=='https://voyage.tidelinestrats.com')throw Error('Unexpected company origin');
for(const name of ['tideline','wonplace','voyage'])if(typeof data.secrets?.[name]!=='string'||data.secrets[name].length<32)throw Error('Missing scoped source key');
const root=path.join(os.homedir(),'Library/Application Support/TideLine/Company Analytics'),launch=path.join(os.homedir(),'Library/LaunchAgents/com.tideline.company-analytics.plist');
for(const dir of ['src','scripts'])await fs.mkdir(path.join(root,dir),{recursive:true,mode:0o700});
for(const file of ['scripts/company-sync.mjs','scripts/company-sync-all.mjs','src/company-signing.js'])await fs.copyFile(file,path.join(root,file));
// An independent runtime snapshot survives managed integration cleanup; never symlink mutable dependencies.
await fs.cp('node_modules',path.join(root,'node_modules'),{recursive:true});
await fs.writeFile(path.join(root,'package.json'),'{"type":"module"}',{mode:0o600});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const log=path.join(root,'sync.log'),err=path.join(root,'sync-error.log');
for(const file of [log,err])try{if((await fs.stat(file)).size>2e6)await fs.rename(file,file+'.previous');}catch{}
await fs.writeFile(launch,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.tideline.company-analytics</string><key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(path.join(root,'scripts/company-sync-all.mjs'))}</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>EnvironmentVariables</key><dict><key>COMPANY_OPERATIONS_CONFIG</key><string>${escape(config)}</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict><key>RunAtLoad</key><true/><key>StartInterval</key><integer>900</integer><key>StandardOutPath</key><string>${escape(log)}</string><key>StandardErrorPath</key><string>${escape(err)}</string></dict></plist>`,{mode:0o600});
try{execFileSync('launchctl',['bootout',`gui/${process.getuid()}`,launch],{stdio:'ignore'});}catch{}
execFileSync('launchctl',['bootstrap',`gui/${process.getuid()}`,launch]);console.log('Company provider collector installed: every 15 minutes while this Mac is awake.');
