// Installs only the read-only exporter; existing signed company keys stay in place.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const config=process.env.COMPANY_OPERATIONS_CONFIG;if(!config||(await fs.stat(config)).mode&0o077)throw Error('Private company configuration required');
const root=path.join(os.homedir(),'Library/Application Support/TideLine/Voyage Content'),launch=path.join(os.homedir(),'Library/LaunchAgents/com.tideline.voyage-content-sync.plist');
for(const dir of ['src','scripts'])await fs.mkdir(path.join(root,dir),{recursive:true,mode:0o700});
for(const file of ['scripts/content-sync.mjs','src/content.js','src/company-ops.js','src/company-metrics.js','src/company-events.js'])await fs.copyFile(file,path.join(root,file));
await fs.writeFile(path.join(root,'package.json'),'{"type":"module"}',{mode:0o600});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await fs.writeFile(launch,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.tideline.voyage-content-sync</string><key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(path.join(root,'scripts/content-sync.mjs'))}</string><string>--send</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>EnvironmentVariables</key><dict><key>COMPANY_OPERATIONS_CONFIG</key><string>${escape(config)}</string></dict><key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer><key>StandardOutPath</key><string>${escape(path.join(root,'sync.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(root,'sync-error.log'))}</string></dict></plist>`,{mode:0o600});
const uid=process.getuid();try{execFileSync('launchctl',['bootout',`gui/${uid}`,launch],{stdio:'ignore'});}catch{}
execFileSync('launchctl',['bootstrap',`gui/${uid}`,launch]);console.log('Content snapshot sync installed (five minutes; no publishing authority).');
