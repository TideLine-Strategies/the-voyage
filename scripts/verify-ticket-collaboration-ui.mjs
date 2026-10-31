import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));let stream;
await page.routeWebSocket(/ticket-collaboration\/live/,ws=>{stream=ws;});
const fixture={id:'11111111-1111-4111-8111-111111111111',code:'SYNTHETIC-1',title:'Synthetic collaboration ticket',description:'Acceptance example',status:'open',priority:'normal',type:'task',revision:1,notes:[],history:[],attachments:[]};
await page.route('**/api/company-tickets**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/company-tickets'?{items:[fixture],nextOffset:null}:{issue:fixture}}));
try{
 await page.goto('http://127.0.0.1:17928/?view=tickets&product=tideline');
 await page.locator('.ticket-row').first().waitFor();
 await page.locator('.ticket-row').first().click();
 await page.getByText('Edit ticket details',{exact:true}).click();
 await page.locator('[name="description"]').waitFor();
 const ticket=await page.locator('.company-tickets').getAttribute('data-collab-selected');
 const input=page.locator('[name="description"]');await input.fill('Human draft must stay');await input.focus();
 const before=await page.evaluate(()=>({url:location.href,active:document.activeElement.name}));
 const base={ticket,label:'Fix enrollment review',color:'#83bcb0',agent:'codex',owner:'Quan',origin:'tools',status:'typing',field:'description',expiresAt:Date.now()+60000,sequence:1,updatedAt:Date.now()};
 stream.send(JSON.stringify({type:'task-presence',tasks:[{...base,taskId:'123456abcdef',draft:'First task is typing',caret:7},{...base,taskId:'abcdef123456',color:'#8faed5',label:'Check payment evidence',draft:'Second independent draft',caret:5}]}));
 await page.locator('.collab-task').nth(1).waitFor();assert.equal(await input.inputValue(),'Human draft must stay');
 assert.deepEqual(await page.evaluate(()=>({url:location.href,active:document.activeElement.name})),before);
 await page.waitForFunction(()=>document.querySelectorAll('.collab-cursor:not([hidden])').length===2);assert.equal(await page.locator('.collab-cursor:not([hidden])').count(),2);assert.equal(await page.locator('.collab-draft').count(),2);
 assert(await page.locator('.collab-draft').first().innerText().then(t=>t.includes('│')));
 // Pointer overlays must not intercept the human's mouse or keyboard.
 assert.equal(await page.locator('.collab-cursors').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
 await page.screenshot({path:'/tmp/voyage-collaboration.png',fullPage:true});
 stream.send(JSON.stringify({type:'task-presence',tasks:[{...base,taskId:'123456abcdef',draft:'Expired',caret:0,expiresAt:Date.now()-1}]}));await page.waitForTimeout(50);assert.equal(await page.locator('.collab-task').count(),0);assert.equal(await input.inputValue(),'Human draft must stay');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({accepted:true,twoTaskCursors:true,independentDrafts:true,humanFocusPreserved:true,humanDraftPreserved:true,navigationPreserved:true,overlaysNonInteractive:true,expiredPresenceRemoved:true,screenshot:'/tmp/voyage-collaboration.png'}));
}finally{await browser.close();}
