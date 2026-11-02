// Read-only collection from the owner's exact Safari window. No cookie transfer.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {parseLinkedIn,PAGE} from './page-social-browser-source.mjs';
export const OWNER_PROFILE='https://www.linkedin.com/in/quan-stewart-b76181387/';
const analytics=`https://www.linkedin.com/company/${PAGE}/admin/analytics/updates/`,runtime=path.join(os.homedir(),'Library/Application Support/Loki/instant-runtime/bin');
const cli=(tool,args)=>JSON.parse(execFileSync(path.join(runtime,tool),args,{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}));
const canonical=value=>{const u=new URL(value);if(u.origin!=='https://www.linkedin.com')throw Error('Wrong browser origin');return u.origin+u.pathname.replace(/\/$/,'');};
export function linkedinBinding(value){if(!value||Object.keys(value).some(k=>!['windowId','profileUrl','pageId'].includes(k))||!Number.isSafeInteger(value.windowId)||value.windowId<=0||value.profileUrl!==OWNER_PROFILE||value.pageId!==PAGE)throw Error('Exact owner binding required');return value;}
export async function collectLinkedInSafari({binding,archiveDir,run=cli,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 linkedinBinding(binding);let lease,initial,visited=false;
 const wall=args=>run('agent-wall',args),unavailable=reason=>({company:'tideline',platform:'linkedin',status:'unavailable',reason});
 const granted=wall(['request','linkedin-analytics','voyage','safari-window',String(binding.windowId)]);
 if(granted.status==='queued'){wall(['cancel',granted.id]);return unavailable('browser_busy');}
 if(granted.status!=='granted'||granted.windowId!==binding.windowId||granted.resource!==`desktop:safari-window:${binding.windowId}`)return unavailable('browser_unavailable');
 lease=granted.id;
 const control=(command,args=[])=>{const turn=wall(['checkpoint',lease]);if(turn.yieldRequested||turn.status==='released')throw Error('Browser turn yielded');return run('safari-controller',[command,'--window-id',String(binding.windowId),'--lease',lease,...args]);};
 try{
  initial=control('inspect').url;if(canonical(initial)!==canonical(analytics))return unavailable('owner_tab_in_use');
  const elements=control('elements',['--limit','300']).elements||[];if(elements.some(e=>e.draftPresent===true||(e.contenteditable&&String(e.editableText||'').trim())))return unavailable('draft_present');
  control('navigate',['--expected-url',initial,'--url',OWNER_PROFILE]);visited=true;
  let owner=false;for(let i=0;i<40;i++){const current=control('read',['--limit','16000']);if(canonical(current.url)!==canonical(OWNER_PROFILE))throw Error('Account sign-in required');const text=current.text||'';if(text.includes('Quan Stewart')&&text.includes('Enhance profile')&&text.includes('Add section')){owner=true;break;}await sleep(500);}if(!owner)return unavailable('account_mismatch');
  const ownUrl=control('inspect').url;control('navigate',['--expected-url',ownUrl,'--url',analytics]);
  let value,text;for(let i=0;i<40;i++){const current=control('read',['--limit','30000']);if(canonical(current.url)!==canonical(analytics))throw Error('Page analytics unavailable');text=current.text||'';try{value=parseLinkedIn(text);break;}catch{}await sleep(500);}if(!value)return unavailable('read_failed');
  await fs.mkdir(archiveDir,{recursive:true,mode:0o700});await fs.writeFile(path.join(archiveDir,'linkedin-owner.txt'),text,{mode:0o600});
  return {company:'tideline',platform:'linkedin',status:'connected',value,ownerProfileVerified:OWNER_PROFILE};
 }catch{return unavailable('read_or_identity_check_failed');}
 finally{
  // Restore only our own navigation; never overwrite an owner's newly selected page.
  if(visited&&initial){try{const current=control('inspect').url;if([canonical(OWNER_PROFILE),canonical(analytics)].includes(canonical(current))&&current!==initial)control('navigate',['--expected-url',current,'--url',initial]);}catch{}}
  wall(['session-release',lease]);
 }
}
