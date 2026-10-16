import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {signedHeaders} from '../src/company-ops.js';
const result=await build({entryPoints:['src/entry.js'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],target:'es2022'});
const secret='local-integration-only-00000000000000000',origin='http://localhost';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-09-29',compatibilityFlags:['nodejs_compat'],durableObjects:{COMPANY_HUB:{className:'CompanyHub',useSQLite:true}},d1Databases:{DB:'test'},bindings:{WONPLACE_OPERATIONS_SECRET:secret,TIDELINE_OPERATIONS_SECRET:secret+'tideline'}}));
try{
 const db=await mf.getD1Database('DB');
 await db.exec('CREATE TABLE documents(collection TEXT,id TEXT,data_json TEXT,updated_at INTEGER,revision INTEGER DEFAULT 1,PRIMARY KEY(collection,id)); CREATE TABLE members(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,member_id TEXT,expires_at INTEGER);');
 const token='a'.repeat(64),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 await db.prepare('INSERT INTO members VALUES(?,?,?,?)').bind('QS','Test Owner','edit',1).run();await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(hash,'QS',Date.now()+60000).run();
 assert.equal((await mf.dispatchFetch(origin+'/api/companies/wonplace')).status,403);
 const headers={cookie:'voyage_session='+token,origin};
 const upgrade=await mf.dispatchFetch(origin+'/api/companies/wonplace/live',{headers:{...headers,upgrade:'websocket'}});assert.equal(upgrade.status,101);const socket=upgrade.webSocket;
 const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No pushed update')),5000);socket.addEventListener('message',event=>{clearTimeout(timer);resolve(JSON.parse(event.data));},{once:true});});
 const first=next();socket.accept();await first;
 const path='/api/company-events/wonplace',body=JSON.stringify({events:[{id:'push-1',kind:'presence',userId:'staff',userName:'Test Staff',sessionId:'test-session',page:'calendar',action:'active'}],measurements:[{metric:'customers.paying',value:3,at:Date.now()}],providers:[{provider:'cloudflare',resource:'test-only',status:'ok',metrics:{requests:100,errors:10}}]});
 const pushed=next();const response=await mf.dispatchFetch(origin+path,{method:'POST',headers:await signedHeaders(secret,'POST',origin+path,'wonplace',body),body});assert.equal(response.status,200);const live=await pushed;assert.equal(live.activeUsers[0].userName,'Test Staff');
 const measured=await(await mf.dispatchFetch(origin+'/api/companies/wonplace/metrics',{headers})).json();assert.equal(measured.metrics.find(m=>m.id==='customers.paying').current,3);assert.equal(measured.metrics.find(m=>m.id==='api.errorRate').current,10);assert.equal(live.measurements.length,4);
 const replayBody=JSON.stringify({events:[],measurements:[{metric:'customers.paying',value:4,at:measured.metrics.find(m=>m.id==='customers.paying').points[0].at}]});await mf.dispatchFetch(origin+path,{method:'POST',headers:await signedHeaders(secret,'POST',origin+path,'wonplace',replayBody),body:replayBody});
 const measuredAgain=await(await mf.dispatchFetch(origin+'/api/companies/wonplace/metrics',{headers})).json();assert.equal(measuredAgain.metrics.find(m=>m.id==='customers.paying').points.length,1);assert.equal(measuredAgain.metrics.find(m=>m.id==='customers.paying').current,4);
 const other=await(await mf.dispatchFetch(origin+'/api/companies/tideline',{headers})).json();assert.equal(other.live.activeUsers.length,0);assert.equal(other.live.measurements.length,0);assert.equal((await mf.dispatchFetch(origin+'/api/companies/wonplace/metrics')).status,403);
 await db.prepare('UPDATE members SET active=0 WHERE id=?').bind('QS').run();assert.equal((await mf.dispatchFetch(origin+'/api/companies/wonplace/live',{headers:{...headers,upgrade:'websocket'}})).status,403);
 socket.close();console.log(JSON.stringify({accepted:true,realDurableObject:true,pushedWebSocketUpdate:true,independentProductScopes:true,anonymousDenied:true,revokedMembershipDenied:true}));
}finally{await mf.dispose();}
