// Loopback-only review. Real publishing snapshot; synthetic empty CRM records.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {exportContent} from './content-sync.mjs';
import {CONTENT_BRANDS} from '../src/content.js';
http.createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('cache-control','no-store');
 if(p==='/api/content'){const r=await fetch('http://127.0.0.1:17889/api/queue',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Local publishing queue is unavailable');const queue=await r.json();res.setHeader('content-type','application/json');res.end(JSON.stringify({brands:Object.keys(CONTENT_BRANDS).map(brand=>({brand,strategy:CONTENT_BRANDS[brand],snapshot:exportContent(queue,brand),stale:false}))}));return;}
 const file=path.resolve('public','.'+(p==='/'?'/index.html':p));if(!file.startsWith(path.resolve('public')+'/'))throw Error('Not found');let content=await fs.readFile(file);res.setHeader('content-type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');
 if(p==='/'){content=content.toString();content=content.slice(0,content.indexOf('<script src="/voyage-db.js">'));content=content.replace('id="app" hidden','id="app"').replace('id="boot"','id="boot" hidden').replace('id="view-dash"','id="view-dash" hidden').replace('id="view-content" hidden','id="view-content"');content+='<script src="/content.js"></script><script>window.addEventListener("voyage-company-investigate",event=>{window.reviewQuestion=event.detail});document.querySelectorAll(".nav").forEach(n=>n.classList.remove("on"));document.querySelector("[data-view=content]").classList.add("on");window.VoyageContent.open()</script></body></html>';}
 res.end(content);
 }catch{res.writeHead(503);res.end('Local review source unavailable');}}).listen(17890,'127.0.0.1',()=>console.log('Content review: http://127.0.0.1:17890 (local review; no publication controls)'));
