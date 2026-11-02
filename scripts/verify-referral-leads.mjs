import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base={source:'f100rd',sourceRecordId:'synthetic',gym:'Test Club',athlete:'',email:'adult@example.com',notes:'Synthetic fixture only',relationship:'prospect',correspondence:'none_verified',eligibility:'review_required',reviewStatus:'not_started',priority:5};
const docs=[{id:'a',data:{...base,name:'Parent A',relationship:'paid_verified',correspondence:'email_reply',eligibility:'adult_verified',reviewStatus:'awaiting_owner_approval',priority:0}},{id:'b',data:{...base,name:'Athlete B',correspondence:'dm_or_chat',eligibility:'guardian_required'}},{id:'c',data:{...base,name:'Other C',source:'other',relationship:'customer_owner_confirmed'}},{id:'d',data:{...base,name:'Test D',eligibility:'excluded',reviewStatus:'excluded'}}];
let requests=0;
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')){requests++;res.setHeader('content-type','application/json');res.end(JSON.stringify({docs}));return;}
 if(req.url.includes('.js')){const name=req.url.slice(1);if(!['referral-leads.js','referral-leads-model.js'].includes(name)){res.writeHead(404).end();return;}res.setHeader('content-type','text/javascript');res.end(await fs.readFile(new URL('../public/'+name,import.meta.url)));return;}
 res.setHeader('content-type','text/html');res.end(`<input id="unrelated-account-search" value="keep me"><details id="leads" hidden></details><script>window.addEventListener('voyage-referrals-ready',()=>window.VoyageReferralLeads.mount(document.querySelector('#leads'),{guest:location.search.includes('guest=1')}));</script><script type="module" src="/referral-leads.js"></script>`);
}catch(e){res.writeHead(500).end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
try{
 await page.goto(origin+'/?leads=f100rd');await page.getByText('3 of 4 referral records', {exact:false}).waitFor();
 await page.getByLabel('Any referral source',{exact:true}).selectOption('f100rd');assert.equal(await page.locator('.referral-lead-list > details').count(),2);
 await page.getByLabel('Any past relationship',{exact:true}).selectOption('customer');assert.equal(await page.locator('.referral-lead-list > details').count(),1);
 await page.getByLabel('Any correspondence',{exact:true}).selectOption('dm_or_chat');assert.equal(await page.locator('.referral-lead-list > details').count(),0);
 await page.getByRole('button',{name:'Reset referral filters'}).click();assert.equal(await page.locator('.referral-lead-list > details').count(),3);
 await page.getByLabel('Any contact status',{exact:true}).selectOption('guardian_required');assert.equal(await page.locator('.referral-lead-list > details').count(),1);
 await page.getByRole('button',{name:'Reset referral filters'}).click();await page.getByLabel('Any draft status',{exact:true}).selectOption('awaiting_owner_approval');assert.equal(await page.locator('.referral-lead-list > details').count(),1);
 await page.getByRole('button',{name:'Reset referral filters'}).click();await page.getByLabel('Search referral leads').fill('parent');assert.equal(await page.locator('.referral-lead-list > details').count(),1);
 await page.getByRole('button',{name:'Reset referral filters'}).click();await page.getByLabel('Any contact status',{exact:true}).selectOption('excluded');assert.equal(await page.locator('.referral-lead-list > details').count(),1);assert(await page.getByLabel('Include excluded / test records').isChecked());
 assert.equal(await page.locator('#unrelated-account-search').inputValue(),'keep me');assert.equal(requests,1,'local filter changes must not trigger polling or writes');
 await page.reload();await page.getByText('3 of 4 referral records',{exact:false}).waitFor();assert.equal(requests,2);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.referral-lead-list > details').count(),3);
 await page.goto(origin+'/?leads=f100rd&guest=1');assert(await page.locator('#leads').isHidden());assert.equal(requests,2);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({accepted:true,filtersIntersect:true,resetIsScoped:true,excludedOptIn:true,refetchAfterReload:true,guestHidden:true,noPollingOrWrites:true,mobile:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
