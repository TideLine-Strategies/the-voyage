// Isolated browser regression against our synthetic loopback fixture; zero provider calls.
import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import assert from 'node:assert/strict';import net from 'node:net';
import {chromium} from '../prototypes/content-factory/node_modules/playwright/index.mjs';
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const origin='http://127.0.0.1:'+port;
await fs.mkdir('docs/audits/2026-11-01-astra/screenshots',{recursive:true});
const server=spawn(process.execPath,['scripts/preview-company-cockpit.mjs'],{env:{...process.env,COMPANY_PREVIEW_PORT:String(port)},stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{const r=await fetch(origin);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin);await page.locator('#app:not([hidden])').waitFor();
 // Use the actual legacy UI and actual save handler with controlled synthetic rows.
 await page.evaluate(()=>{opps=[{id:'audit-account',name:'Synthetic audit gym',stage:0,locations:[]}];nOpp='audit-account';go('notes');nDrafts=[{id:'audit-draft',draft:true,oppId:nOpp,type:APPT_TYPES[0]}];renderNotes(true);});
 await page.route('**/api/document/notes/*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Synthetic failure'})}));
 await page.locator('#nBody textarea').fill('Keep this exact unsaved text after failure');await page.getByRole('button',{name:'Save note',exact:true}).click();await page.getByText("That didn't save. Try again.",{exact:true}).waitFor();assert.equal(await page.locator('#nBody textarea').inputValue(),'Keep this exact unsaved text after failure');assert.equal(await page.locator('#nBody .ncard.dirty').count(),1);await page.screenshot({path:'docs/audits/2026-11-01-astra/screenshots/failed-note-preserved.png'});
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Accounts',exact:true}).click();assert.equal(await page.locator('#view-notes').isVisible(),true);
 await page.evaluate(()=>{nDrafts=[];document.querySelector('#nBody .ncard')?.classList.remove('dirty');document.activeElement?.blur();go('deals');openDeal(null);});
 await page.getByRole('button',{name:'+ Custom line',exact:true}).click();
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(size);for(const label of ['Line name','Quantity','Unit price','Discount percent','Billing frequency'])assert(await page.getByLabel(label,{exact:true}).isVisible(),label+' should be editable at '+size.width);
  if(size.width===390){await page.getByLabel('Line name',{exact:true}).fill('Synthetic service');await page.getByLabel('Quantity',{exact:true}).fill('3');await page.getByLabel('Unit price',{exact:true}).fill('125');await page.getByLabel('Discount percent',{exact:true}).fill('10');await page.getByLabel('Billing frequency',{exact:true}).selectOption('annual');assert.equal(await page.getByLabel('Quantity',{exact:true}).inputValue(),'3');assert.equal(await page.getByLabel('Unit price',{exact:true}).inputValue(),'125');await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));await page.getByLabel('Line name',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'docs/audits/2026-11-01-astra/screenshots/mobile-line-editor.png'});}
 }
 await page.setViewportSize({width:1440,height:1000});
 const columns=await page.evaluate(()=>{const t=adTable('dtbl',['a','b','c','d','e','f'],[]);document.querySelector('#dlMain').append(t);return getComputedStyle(t.querySelector('.row')).gridTemplateColumns.split(' ').length;});assert.equal(columns,6,'Device table styles must not override six-column deal tables');
 await fs.mkdir('docs/audits/2026-11-01-astra/screenshots',{recursive:true});await page.screenshot({path:'docs/audits/2026-11-01-astra/screenshots/repair-ui.png'});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({accepted:true,syntheticOnly:true,failedNoteDraftPreserved:true,unsavedNavigationBlocked:true,desktopAndMobileLineEditing:true,dealColumnsUnaffectedByDeviceTable:true,externalRequests:0}));
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));}
