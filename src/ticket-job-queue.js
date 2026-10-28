import {handoffPackage,ticketSweep} from './ticket-handoffs.js';
import {portableClaudeTask} from './ticket-portable.js';
import {verifySource} from './company-signing.js';
const products=['wonplace','voyage','tideline','loki'],repos=['wonplace','voyage'],collection='company_ticket_jobs',runtimeCollection='company_ticket_runtime';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const stored=async(env,c,id)=>{const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(c,id).first();return r?{...JSON.parse(r.data_json),revision:r.revision}:null;};
const put=(env,c,id,v)=>env.DB.prepare('INSERT INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=revision+1,updated_at=excluded.updated_at').bind(c,id,JSON.stringify(v),Date.now()).run();
export async function codingJobs(env,company,ticket){const sql='SELECT data_json FROM documents WHERE collection=? AND id LIKE ?'+(ticket?" AND json_extract(data_json,'$.ticket')=?":'')+' ORDER BY updated_at DESC LIMIT 20';const args=[collection,company+':%'];if(ticket)args.push(ticket);const {results}=await env.DB.prepare(sql).bind(...args).all();return results.map(r=>publicJob(JSON.parse(r.data_json)));}
const approvedOwners=new Set(['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com']);
const owner=async(env,id)=>{const m=await env.DB.prepare('SELECT id,role,email FROM members WHERE id=? AND active=1').bind(id).first();return m?.role==='edit'&&approvedOwners.has(m.email?.toLowerCase())?m:null;};
const publicJob=j=>({id:j.id,company:j.company,ticket:j.ticket,agent:j.agent,state:j.state,task:j.task||null,error:j.error||null,createdAt:j.createdAt,updatedAt:j.updatedAt,mode:j.mode||'worker',transcript:j.transcript||'',sessionStatus:j.sessionStatus||null,threadId:j.threadId||null,commands:(j.commands||[]).map(c=>({id:c.id,state:c.state,error:c.error||null}))});
export async function handleTicketQueue(request,env,actor,path,readJson){
 if(actor.role!=='edit')return reply({error:'Editors only'},403);
 const url=new URL(request.url),company=url.searchParams.get('company');
 if(path[2]==='portable'&&request.method==='GET')return portableClaudeTask(env,actor,{company,id:url.searchParams.get('id'),source:url.searchParams.get('source')});
 if(path.length===2&&request.method==='GET'&&products.includes(company)&&uuid.test(url.searchParams.get('ticket')||''))return reply({jobs:await codingJobs(env,company,url.searchParams.get('ticket'))});
 if(path[2]==='status'&&request.method==='GET'){
  const workers=await Promise.all(repos.map(c=>stored(env,runtimeCollection,c))),worker=workers.filter(Boolean).sort((a,b)=>b.lastSeen-a.lastSeen)[0],digest=await stored(env,runtimeCollection,'digest');return reply({worker:worker&&{lastSeen:worker.lastSeen,available:Date.now()-worker.lastSeen<90000,agents:worker.agents||[],products:repos},dailyReview:{hour:9,timezone:'America/Chicago',last:digest&&{day:digest.day,status:digest.status,messageId:digest.messageId||null}}});
 }
 if(path[2]&&uuid.test(path[2])&&request.method==='GET'&&products.includes(company)){const job=await stored(env,collection,company+':'+path[2]);return job?reply({job:publicJob(job)}):reply({error:'Job not found'},404);}
 if(request.method!=='POST'||path.length!==2)return reply({error:'Not found'},404);
 const body=await readJson(request);
 if((['queue','cancel','control'].includes(body.action))&&!await owner(env,actor.id))return reply({error:'Only Quan and Cody can launch or cancel coding workers. Copy prompt is available to editors.'},403);
 if(body.action==='control'){
  if(!repos.includes(body.company)||!uuid.test(body.jobId||'')||!uuid.test(body.commandId||'')||!['message','interrupt'].includes(body.command))return reply({error:'Invalid Codex command'},400);
  const key=body.company+':'+body.jobId,job=await stored(env,collection,key);
  if(!job||job.mode!=='interactive'||!['admitted','running'].includes(job.state))return reply({error:'No active ticket Codex session'},409);
  if(body.command==='message'&&(typeof body.text!=='string'||!body.text.trim()||body.text.length>12000))return reply({error:'Enter a message under 12000 characters'},400);
  const commands=job.commands||[];if(commands.some(c=>c.id===body.commandId))return reply({job:publicJob(job)});
  if(commands.filter(c=>c.state==='queued').length>=5)return reply({error:'Wait for pending messages'},409);
  const next={...job,commandSequence:(job.commandSequence||0)+1,commands:[...commands.slice(-19),{id:body.commandId,sequence:(job.commandSequence||0)+1,action:body.command,text:body.command==='message'?body.text:'',state:'queued',actor:actor.id}],updatedAt:Date.now()};
  const r=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),next.updatedAt,collection,key,job.revision).run();return r.meta.changes?reply({job:publicJob(next)}):reply({error:'Session changed; retry with the same command ID'},409);
 }
 if(body.action==='cancel'&&repos.includes(body.company)&&uuid.test(body.jobId||'')){const key=body.company+':'+body.jobId,job=await stored(env,collection,key);if(!job||job.state!=='queued')return reply({error:'Only queued work can be cancelled here'},409);const next={...job,state:'cancelled',cancelledBy:actor.id,updatedAt:Date.now()};const r=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),Date.now(),collection,key,job.revision).run();return r.meta.changes?reply({job:publicJob(next)}):reply({error:'Job changed; refresh'},409);}
 if(body.action!=='queue')return handoffPackage(env,actor,body);
 if(!repos.includes(body.company)||!uuid.test(body.requestId||'')||!['codex','claude'].includes(body.agent))return reply({error:'Repository not configured; use Copy prompt'},400);
 const prepared=await handoffPackage(env,actor,body);if(!prepared.ok)return prepared;const {payload}=await prepared.json();
 const job={id:body.requestId,company:body.company,ticket:body.id,source:body.source,agent:body.agent,mode:body.mode||'worker',actor:actor.id,title:payload.title,code:payload.code,state:'queued',createdAt:Date.now(),updatedAt:Date.now()};
 await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?)').bind(collection,body.company+':'+job.id,JSON.stringify(job),job.updatedAt).run();const actual=await stored(env,collection,body.company+':'+job.id);if(actual.actor!==actor.id||actual.ticket!==body.id||actual.agent!==body.agent||actual.source!==body.source||(actual.mode||'worker')!==(body.mode||'worker'))return reply({error:'Request ID already belongs to another handoff'},409);return reply({job:publicJob(actual)},202);
}
export async function sourceTicketQueue(request,env,readJson){
 const company=new URL(request.url).pathname.split('/')[3];if(request.method!=='POST'||!products.includes(company))return reply({error:'Not found'},404);
 const value=await readJson(request),secret=env[company.toUpperCase()+'_OPERATIONS_SECRET'];if(!await verifySource(request,secret,JSON.stringify(value)))return reply({error:'Source authentication required'},401);
 if(value.action==='digest'&&company==='tideline'){const d=value.digest;if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.day)||!['sent','preview','review_failed','send_intent','delivery_uncertain','review_ready'].includes(d.status))return reply({error:'Invalid digest status'},400);await put(env,runtimeCollection,'digest',{day:d.day,status:d.status,messageId:d.status==='sent'?String(d.messageId||'').slice(0,300):null,reportedAt:Date.now()});return reply({accepted:true});}
 if(!repos.includes(company)||!uuid.test(value.runtimeId||''))return reply({error:'Invalid worker'},400);
 if(value.action==='poll'){
  await put(env,runtimeCollection,company,{runtimeId:value.runtimeId,lastSeen:Date.now(),agents:['codex','claude'].filter(a=>value.agents?.includes(a))});
  const {results}=await env.DB.prepare("SELECT data_json,revision FROM documents WHERE collection=? AND id LIKE ? AND json_extract(data_json,'$.state') IN ('queued','claimed','admitted','running') ORDER BY updated_at ASC LIMIT 100").bind(collection,company+':%').all();const jobs=results.map(r=>({...JSON.parse(r.data_json),revision:r.revision}));
  return reply({queued:jobs.filter(j=>j.state==='queued'&&value.agents?.includes(j.agent)).slice(0,10).map(publicJob),active:jobs.filter(j=>j.runtimeId===value.runtimeId&&['claimed','admitted','running'].includes(j.state)).slice(0,20).map(j=>({...publicJob(j),localJobId:j.localJobId||null,commands:(j.commands||[]).filter(c=>c.state==='queued')}))});
 }
 if(!uuid.test(value.jobId||''))return reply({error:'Invalid job'},400);const key=company+':'+value.jobId,job=await stored(env,collection,key);if(!job)return reply({error:'Job not found'},404);
 if(value.action==='claim'){
  if(job.state!=='queued')return reply({error:'Job is no longer queued'},409);
  const member=await owner(env,job.actor);if(!member||member.role!=='edit'||Date.now()-job.createdAt>86400000){await put(env,collection,key,{...job,state:'blocked',error:'Request expired or editor access changed',updatedAt:Date.now()});return reply({error:'Request expired or editor access changed'},409);}
  const prepared=await handoffPackage(env,member,{company,id:job.ticket,source:job.source,agent:job.agent,mode:job.mode||'worker'});if(!prepared.ok)return prepared;
  const envelope=await prepared.json(),next={...job,state:'claimed',runtimeId:value.runtimeId,localJobId:envelope.payload.nonce,updatedAt:Date.now()};
  const r=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),Date.now(),collection,key,job.revision).run();if(!r.meta.changes)return reply({error:'Another worker claimed this job'},409);return reply({job:publicJob(next),envelope});
 }
 if(value.action==='ack'&&job.runtimeId===value.runtimeId&&['claimed','admitted','running'].includes(job.state)){
  if(!['admitted','running','completed','blocked','failed','delivery_uncertain','draft_opened'].includes(value.state))return reply({error:'Invalid job state'},400);
  const task=value.task&&/^[0-9a-f]{12}$/.test(value.task.id||'')?{id:value.task.id,state:String(value.task.state||'').slice(0,50),stage:String(value.task.stage||'').slice(0,50)}:job.task||null;
  const commandResults=Array.isArray(value.commandResults)?value.commandResults:[];
  const next={...job,state:value.state,task,error:value.error?String(value.error).slice(0,300):null,transcript:typeof value.transcript==='string'?value.transcript.slice(-24000):job.transcript||'',threadId:uuid.test(value.threadId||'')?value.threadId:job.threadId||null,sessionStatus:typeof value.sessionStatus==='string'?value.sessionStatus.slice(0,60):job.sessionStatus||null,commands:(job.commands||[]).map(c=>{const result=commandResults.find(r=>r.id===c.id);return result?{...c,state:result.accepted?'accepted':'failed',error:String(result.error||'').slice(0,300)}:c;}),updatedAt:Date.now()};
  const changed=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),next.updatedAt,collection,key,job.revision).run();if(!changed.meta.changes)return reply({error:'Job changed; retry status update'},409);return reply({job:publicJob(next)});
 }
 return reply({error:'Job changed; reconcile before another launch'},409);
}

export async function sourceTicketSweep(request,env){const company=new URL(request.url).pathname.split('/')[3];if(request.method!=='GET'||!products.includes(company)||!await verifySource(request,env[company.toUpperCase()+'_OPERATIONS_SECRET'],''))return reply({error:'Source authentication required'},401);return reply({...await ticketSweep(env,company),codingJobs:await codingJobs(env,company)});}
