// Audited upgrade of the existing native runtime, never the personal-brand pipeline.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
if(!process.env.AGENT_RELEASE_TASK||!process.env.AGENT_RELEASE_COMMIT)throw Error('Managed release required');
let root=path.join(os.homedir(),'.stewartos/automations/wonplace-social');if(process.argv.includes('--check')){const original=root;root=await fs.mkdtemp(path.join(os.tmpdir(),'factory-native-check-'));for(const name of ['social.py','native_operator.py','native_browser.py','config.json','OPERATIONS.md','tests'])await fs.cp(path.join(original,name),path.join(root,name),{recursive:true});}
const file=path.join(root,'social.py');let source=await fs.readFile(file,'utf8');
await fs.copyFile('scripts/voyage_authority.py',path.join(root,'voyage_authority.py'));
const backup=path.join(root,'state','factory-upgrade-backup-'+process.env.AGENT_RELEASE_TASK);await fs.mkdir(backup,{recursive:true,mode:0o700});
for(const name of ['social.py','native_browser.py','config.json','OPERATIONS.md']){try{await fs.copyFile(path.join(root,name),path.join(backup,name),fs.constants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e;}}
if(!source.includes('from voyage_authority import factory_authorized')){
 const approve="state='held' if self.config['brands'][r['brand']].get('require_linkedin_source') and json.loads(r['payload']).get('source_platform')!='linkedin' else 'ready'";
 const reasons="if self.config['brands'][r['brand']].get('require_linkedin_source') and p.get('source_platform')!='linkedin':issues.append";
 if(!source.includes(approve)||!source.includes(reasons))throw Error('Native runtime changed; inspect before patching');
 source=source.replace('import argparse,','from voyage_authority import factory_authorized\nimport argparse,');
 // Keep the shebang/docstring intact enough for Python CLI execution (explicit interpreter).
 source=source.replace(approve,approve.replace(" else 'ready'"," and not factory_authorized(self,r,True) else 'ready'"));
 source=source.replace(reasons,reasons.replace(':issues.append',' and not factory_authorized(self,r,for_publish):issues.append'));
 await fs.writeFile(file+'.factory-tmp',source);await fs.rename(file+'.factory-tmp',file);
}
// Route verification is performed before reserve; readiness flags must not deadlock selection.
source=await fs.readFile(file,'utf8');
source=source.replace("if dest.get('scheduled_browser_ready') is False:issues.append", "if for_publish and dest.get('scheduled_browser_ready') is False:issues.append");
const routeEvent="self.event('route_verified',None,brand=brand,platform=platform)";
if(!source.includes("dest['scheduled_browser_ready']=True"))source=source.replace(routeEvent,routeEvent+";dest['scheduled_browser_ready']=True;atomic(self.root/'config.json',self.config)");
await fs.writeFile(file+'.factory-tmp',source);await fs.rename(file+'.factory-tmp',file);
await fs.copyFile('scripts/voyage_authority.py',path.join(root,'voyage_authority.py'));
await fs.copyFile('scripts/content-native-browser.py',path.join(root,'native_browser.py'));
const cfgPath=path.join(root,'config.json'),cfg=JSON.parse(await fs.readFile(cfgPath,'utf8'));
for(const brand of ['tideline','wonplace']){const dest=cfg.brands[brand].destinations.linkedin;if(dest.account_id!=='company:tideline-strategies-llc')throw Error('Unexpected company identity');dest.enabled=true;dest.source_only=false;dest.scheduled_browser_ready=false;dest.browser_lane=dest.browser_lane||cfg.observer.browser_lane||'atlas';}
await fs.writeFile(cfgPath+'.factory-tmp',JSON.stringify(cfg,null,2),{mode:0o600});await fs.rename(cfgPath+'.factory-tmp',cfgPath);
const instructions=path.join(root,'OPERATIONS.md');let text=await fs.readFile(instructions,'utf8');text=text.replace('- LinkedIn: source-only here; already published company source counts as delivery. Never repost its 10 AM schedule.','- LinkedIn: existing observed company sources count once and are never reposted. Only a voyage:ITEM:HASH master with fresh server-verified Factory human approval may create its selected new company post; follow the Voyage-approved master section below.');if(!text.includes('## Voyage-approved master publication')){text+='\n## Voyage-approved master publication\n\nA source key voyage:ITEM:HASH may dispatch from the Factory only when voyage_authority.py freshly verifies the exact named human approval, caption and media against the signed Voyage endpoint. Other master sources retain the existing published-LinkedIn-source gate. Never reuse a Factory approval on another payload.\n\nFor an explicitly selected LinkedIn delivery, publish only on the existing TideLine Strategies company Page, exact company:tideline-strategies-llc profile. Inspect actual admin compose controls and author before any upload. Never switch to the personal profile or create a duplicate of an observed existing source. Missing Page-admin authentication is a hold. Verify the route, reserve the exact delivery, and reconcile its actual native permalink using the same normal controls and receipts as the other platforms. For Factory jobs use the exact packet file on every selected platform; do not substitute Cody’s historical landscape/vertical variants. A Factory approval permits that exact package; it does not grant account access.\n';await fs.writeFile(instructions,text);}
console.log(JSON.stringify({installed:true,nativeRuntime:root,backup}));
