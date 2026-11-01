// Synthetic local UI acceptance. No production writes or external requests.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../prototypes/content-factory/node_modules/playwright/index.mjs');
const port=17926,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['scripts/preview-company-cockpit.mjs'],{env:{...process.env,COMPANY_PREVIEW_PORT:String(port)},stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.endsWith('/ga4'))return route.fulfill({json:{status:'connected',asOf:Date.now(),window:'Synthetic 30 days',totals:{activeUsers:11,sessions:14,screenPageViews:20},channels:[{sessionDefaultChannelGroup:'Direct',sessions:12}],coverage:'Synthetic GA4'}});if(url.pathname.endsWith('/acquisition'))return route.fulfill({json:{days:30,asOf:new Date().toISOString(),contacts:{submitted:0},waitlist:{submitted:0},coverage:'Synthetic receipts'}});return route.continue();});
 await page.goto(origin);await page.locator('#app:not([hidden])').waitFor();await page.getByRole('button',{name:'Company',exact:true}).click();await page.locator('[data-canvas-open="audience"]').click();await page.getByText('11 active users · 14 sessions · 20 page views',{exact:true}).waitFor();assert.equal(await page.locator('.audience-node').count(),6);assert(await page.getByText('Contact inquiries · 0',{exact:true}).isVisible());await page.screenshot({path:'/tmp/voyage-audience-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert(await page.locator('.audience-node').first().isVisible());assert.equal(await page.locator('.audience-nodes').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),1);await page.screenshot({path:'/tmp/voyage-audience-mobile.png'});assert.deepEqual(errors,[]);console.log(JSON.stringify({accepted:true,nodes:6,realZeroPreserved:true,ga4TotalsVisible:true,mobileSingleColumn:true,externalCalls:0}));
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));}
