import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
assert.equal((html.match(/class="rv-slot"/g)||[]).length,1,'Only the floating assistant owns a raven');
const script=await fs.readFile(new URL('../public/living-crm.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../public/living-crm.css',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://muninn.test/**',r=>r.fulfill({contentType:'text/html',body:`<style>${css} .rv-float{position:fixed;bottom:16px;left:18px}.rv-float svg{width:54px;height:44px}</style><nav>${['dash','accounts','content','company','vendors','activity','calendar','deals'].map(v=>`<button class="nav" data-view="${v}">${v}</button>`).join('')}</nav><section id="view-company"><button id="canvasSourceState">Source</button></section><button id="rvFloat" aria-label="Ask Muninn"><svg class="rv" viewBox="0 0 60 50"><path class="rv-wing" d="M0 40L40 0L55 40Z"/></svg></button><div id="chat" hidden>Conversation</div>`}));
 await page.goto('http://muninn.test/');
 await page.evaluate(()=>{window.VoyagePulseSnapshot=()=>({view:'company',guest:false,items:[],deals:[],accounts:[],vendors:0});window.fetch=async url=>new Response(JSON.stringify(String(url).includes('handoff')?{jobs:[],worker:{available:true}}:{items:[],nextOffset:null}),{headers:{'content-type':'application/json'}});document.querySelector('#rvFloat').onclick=()=>document.querySelector('#chat').hidden=false;});
 await page.addScriptTag({content:script});await page.waitForTimeout(2100);
 assert.equal(await page.locator('.life-panel').count(),1);assert.equal(await page.locator('svg.rv').count(),1);
 await page.getByRole('button',{name:'Show next action',exact:true}).click();
 assert.equal(await page.locator('#rvFloat.life-bird').count(),1);assert.equal(await page.locator('svg.rv').count(),1);
 await page.getByRole('button',{name:'Ask Muninn',exact:true}).click();assert.equal(await page.locator('#chat').isVisible(),true,'Moving bird retains assistant access');
 await page.getByRole('button',{name:'Bird on',exact:true}).click();assert.equal(await page.locator('#rvFloat.life-bird').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('voyage-bird-guide')),'off');
 await page.getByRole('button',{name:'Show next action',exact:true}).click();assert.equal(await page.locator('#rvFloat.life-bird').count(),0);
 await page.getByRole('button',{name:'Bird off',exact:true}).click();await page.getByRole('button',{name:'Show next action',exact:true}).click();
 await page.keyboard.press('Escape');assert.equal(await page.locator('#rvFloat.life-bird').count(),0);
 for(const v of ['dash','accounts','content','company','vendors','activity','calendar','deals']){await page.locator(`[data-view="${v}"]`).click();assert.equal(await page.locator('svg.rv').count(),1);}
 await page.addScriptTag({content:script});assert.equal(await page.locator('.life-panel').count(),1,'Repeated initialization must not add panels or wrap fetch twice');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#rvFloat').evaluate(n=>{n.classList.add('life-bird');return getComputedStyle(n).transitionDuration;}),'0s');
 assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/voyage-muninn-singleton.png'});console.log(JSON.stringify({oneRaven:true,guideReusesAssistant:true,chatWorks:true,birdGuideToggle:true,navigation:true,repeatedInitialization:true,reducedMotion:true}));
}finally{await browser.close();}
