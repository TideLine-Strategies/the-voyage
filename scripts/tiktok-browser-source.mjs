import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function exactCount(value){const clean=String(value||'').replaceAll(',','').trim();return /^\d+$/.test(clean)&&Number.isSafeInteger(Number(clean))?Number(clean):null;}
export function parseObjects(text){const out=[];let start=-1,depth=0,quoted=false,escaped=false;for(let i=0;i<text.length;i++){const c=text[i];if(start<0){if(c==='{'){start=i;depth=1;}continue;}if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){out.push(JSON.parse(text.slice(start,i+1)));start=-1;}}return out;}
const problem=code=>Object.assign(Error(code),{code});
export async function collectTikTok({controller,archiveDir,chromium,parser}){
 if(new URL(controller.endpoint).hostname!=='127.0.0.1')throw problem('read_failed');
 const browser=await chromium.connectOverCDP(controller.endpoint);let page;
 for(const context of browser.contexts())for(const candidate of context.pages()){const session=await context.newCDPSession(candidate);const {targetInfo}=await session.send('Target.getTargetInfo');await session.detach();if(targetInfo.targetId===controller.page_target_id)page=candidate;}
 if(!page)throw problem('browser_busy');
 const initial=page.url();if(new URL(initial).hostname!=='www.tiktok.com')throw problem('account_mismatch');
 const draft=await page.evaluate(()=>[...document.querySelectorAll('input[type=file]')].some(e=>e.files?.length)||[...document.querySelectorAll('textarea,[contenteditable=true]')].some(e=>(e.value||e.innerText||'').trim()));if(draft)throw problem('browser_busy');
 await fs.mkdir(archiveDir,{recursive:true,mode:0o700});
 try{
  await page.goto('https://www.tiktok.com/@wonplaceapp',{waitUntil:'domcontentloaded',timeout:25000});
  try{await page.getByRole('button',{name:'Edit profile',exact:true}).waitFor({timeout:20000});}catch{throw problem('login_required');}
  if(new URL(page.url()).pathname!=='/@wonplaceapp')throw problem('account_mismatch');
  const account={};for(const [key,selector]of [['followers','followers-count'],['following','following-count'],['likes','likes-count']])account[key]=exactCount(await page.locator(`[data-e2e="${selector}"]`).innerText());
  const upload=await page.locator('a[href*="tiktokstudio/upload"]').first().getAttribute('href');if(!upload)throw problem('read_failed');
  await page.goto(new URL(upload,page.url()).href,{waitUntil:'domcontentloaded',timeout:25000});
  await page.locator('button[data-tt="Sidebar_Sidebar_Clickable"]').filter({hasText:/^Analytics$/}).click({timeout:20000});await page.waitForURL('**/tiktokstudio/analytics**',{timeout:20000});
  const tab=async label=>{await page.getByText(label,{exact:true}).click();};
  await tab('Overview');await page.getByRole('button',{name:/^Video views/}).waitFor({timeout:20000});
  const windowButton=page.getByRole('button',{name:'Last 7 days',exact:true});if(await windowButton.count()!==1){const selector=page.getByRole('button',{name:/^Last (28|60|365) days$/});if(await selector.count()!==1)throw problem('read_failed');await selector.click();await page.getByText('Last 7 days',{exact:true}).click();await page.getByRole('button',{name:/^Video views/}).waitFor({timeout:15000});}
  const text=await page.locator('body').innerText(),trafficSources=[];for(const label of ['Search','Personal profile','For You','Following','Sound']){const match=text.match(new RegExp('(?:^|\\n)'+label+'\\s*\\n([0-9.]+)%'));if(match)trafficSources.push({label,percent:Number(match[1])});}
  const summary={};for(const [key,label]of [['videoViews','Video views'],['profileViews','Profile views'],['likes','Likes'],['comments','Comments'],['shares','Shares']]){const match=text.match(new RegExp('(?:^|\\n)'+label+'\\s*\\n([0-9,]+)(?:\\n|$)'));if(!match)throw problem('read_failed');summary[key]=exactCount(match[1]);}
  const download=async kind=>{
   await page.getByRole('button',{name:'Download data',exact:true}).click();await page.getByText('CSV',{exact:true}).click();const pending=page.waitForEvent('download',{timeout:25000});await page.getByRole('button',{name:'Download',exact:true}).click();const file=await pending;
   const destination=path.join(archiveDir,kind+'.zip');await file.saveAs(destination);await fs.chmod(destination,0o600);
   return JSON.parse(execFileSync('/usr/bin/python3',[parser,kind,file.suggestedFilename(),destination],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));
  };
  const overview=await download('overview');for(const key of Object.keys(summary))if(summary[key]!==overview.overview[key])throw problem('read_failed');
  await tab('Followers');await page.getByText('Net followers',{exact:true}).waitFor({timeout:20000});const followerText=await page.locator('body').innerText(),net=followerText.match(/(?:^|\n)Net followers\s*\n([+-]?[0-9,]+)(?:\n|$)/);const netFollowers=net?Number(net[1].replaceAll(',','')):null;
  await tab('Content');await page.locator('table tbody tr').first().waitFor({timeout:20000});const table=await page.locator('table tbody tr').evaluateAll(rows=>rows.map(r=>[...r.querySelectorAll('td')].map(c=>c.innerText)));
  const content=await download('content'),normalize=v=>String(v).replace(/^\d{2}:\d{2}\s+/,'').replace(/\s+/g,' ').trim();
  for(const post of content.topPosts){const row=table.find(row=>normalize(row[1])===normalize(post.title));if(row)post.periodViews=exactCount(row[2]);}
  return {platform:'tiktok',handle:'wonplaceapp',observedAt:Date.now(),account,overview:{...overview.overview,netFollowers},daily:overview.daily,trafficSources,topPosts:content.topPosts,evidence:{overviewFilename:overview.filename,overviewSha256:overview.sha256,contentFilename:content.filename,contentSha256:content.sha256}};
 }finally{
  // Keep the original authenticated workspace and view. Never close the browser.
  if(page.url()!==initial)try{await page.goto(initial,{waitUntil:'domcontentloaded',timeout:15000});}catch{}
 }
}
