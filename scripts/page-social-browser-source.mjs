// Owner-visible reporting only. No cookies, browser storage or private platform APIs.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
export const CHANNEL='UCSwOxf0QZOXpfrSjN46pm7A',PAGE='109054255';
const fail=()=>{throw Error('Native report could not be verified');};
const number=v=>{if(!/^[\d,]+$/.test(v))return fail();const n=Number(v.replaceAll(',',''));if(!Number.isSafeInteger(n)||n<0)return fail();return n;};
const date=(month,d,y)=>{const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],m=months.indexOf(month);if(m<0)return fail();const out=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(new Date(out+'T00:00:00Z').toISOString().slice(0,10)!==out)return fail();return out;};
export function parseYouTube(text,observedAt=Date.now()){
 const t=text.replaceAll('\u00a0',' ').replace(/[\u2009\u202f]/g,' '),range=t.match(/\n([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?\s*[–−-]\s*(?:([A-Z][a-z]{2}) )?(\d{1,2}), (\d{4})\nLast 28 days/),views=t.match(/Your channel got ([\d,]+) views in the last 28 days/),subs=t.match(/\nRealtime\nUpdating live\n([\d,]+)\nSubscribers\n/);
 if(!/\nYour channel\nWonPlace\n/.test(t)||!range||!views||!subs)return fail();const start=date(range[1],range[2],range[3]||(Number(range[6])-(range[4]&&['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(range[1])>['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(range[4])?1:0))),end=date(range[4]||range[1],range[5],range[6]);if(Date.parse(end)-Date.parse(start)!==27*86400000)return fail();
 return {platform:'youtube',accountId:CHANNEL,label:'WonPlace · @wonplaceapp',status:'connected',observedAt,counts:{subscribers_count:number(subs[1])},report:{start,end,metrics:{views:number(views[1])}},evidenceSha256:createHash('sha256').update(text).digest('hex')};
}
export function parseLinkedIn(text,observedAt=Date.now()){
 const t=text.replaceAll('\u00a0',' '),f=t.match(/\nTideLine Strategies LLC\n(?:Verify with Premium\n)?([\d,]+) followers\n/),range=t.match(/Highlights\nData for (\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2})\/(\d{1,2})\/(\d{4})/);if(!f||!range||!t.includes('Content engagement'))return fail();
 const start=date(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(range[1])-1],range[2],range[3]),end=date(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(range[4])-1],range[5],range[6]);
 const highlight=t.slice(t.indexOf('Highlights'),t.indexOf('\nMetrics\n')),metrics={};for(const [key,label]of [['impressions','Impressions'],['reactions','Reactions'],['comments','Comments'],['reposts','Reposts']]){const m=highlight.match(new RegExp('\\n([\\d,]+)\\n+'+label+'(?:\\n|$)'));if(!m)return fail();metrics[key]=number(m[1]);}
 return {platform:'linkedin',accountId:PAGE,label:'TideLine Strategies LLC',status:'connected',observedAt,counts:{followers_count:number(f[1])},report:{start,end,metrics},evidenceSha256:createHash('sha256').update(text).digest('hex')};
}
export async function collectPageSocial({controller,chromium,archiveDir}){
 const endpoint=new URL(controller.endpoint);if(endpoint.hostname!=='127.0.0.1'||!endpoint.pathname.startsWith('/cdp/'))throw Error('Governed controller required');
 const version=await(await fetch(controller.endpoint+'/json/version',{signal:AbortSignal.timeout(10000)})).json();const ws=new URL(version.webSocketDebuggerUrl);if(ws.host!==endpoint.host||!ws.pathname.startsWith(endpoint.pathname+'/devtools/browser/'))throw Error('Wrong controller gateway');
 const browser=await chromium.connectOverCDP(ws.href);let page;for(const context of browser.contexts())for(const p of context.pages()){const s=await context.newCDPSession(p),{targetInfo}=await s.send('Target.getTargetInfo');await s.detach();if(targetInfo.targetId===controller.page_target_id)page=p;}if(!page)throw Error('Exact admitted target missing');
 const url=new URL(page.url());if(url.hostname!=='studio.youtube.com'||!url.pathname.startsWith('/channel/'+CHANNEL))throw Error('Wrong channel target');
 const output=[];await fs.mkdir(archiveDir,{recursive:true,mode:0o700});
 for(const [company,platform,target,parse]of [['wonplace','youtube',`https://studio.youtube.com/channel/${CHANNEL}/analytics/tab-overview/period-default`,parseYouTube],['tideline','linkedin',`https://www.linkedin.com/company/${PAGE}/admin/analytics/updates`,parseLinkedIn]]){
  try{await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});let value,text;for(let i=0;i<40;i++){text=await page.locator('body').innerText().catch(()=>'');try{value=parse(text);break;}catch{}await page.waitForTimeout(750);}if(!value)throw Error('Reporting unavailable');await fs.writeFile(path.join(archiveDir,platform+'.txt'),text,{mode:0o600});output.push({company,platform,status:'connected',value});}
  catch{output.push({company,platform,status:'unavailable'});}
 }
 // Leave the admitted tab on its original product; preserve all pre-existing tabs.
 await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:15000}).catch(()=>{});return output;
}
