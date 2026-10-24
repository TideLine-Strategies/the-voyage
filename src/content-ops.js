import {analyticsTargets,platformObservations,ingestPlatformObservations} from './content-platforms.js';
import {productionAction,productionState} from './content-production.js';
import {ownAnalytics} from './content-analytics.js';
import {advanceDecision,pipelineState} from './content-pipeline.js';
import {AGENT_DOCS} from './content-agent-docs.js';
import {listMedia} from './content-media.js';
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'private, no-store'}});
export async function readOpsDoc(env,c,id){const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(c,id).first();return r?{value:JSON.parse(r.data_json),revision:r.revision}:null;}
async function put(env,c,id,d){return env.DB.prepare('INSERT INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=documents.revision+1,updated_at=excluded.updated_at').bind(c,id,JSON.stringify(d),Date.now()).run();}
const text=(s,n=2000)=>typeof s==='string'?s.slice(0,n):'';
const validDate=d=>typeof d==='string'&&Number.isFinite(Date.parse(d));
const publicUrl=s=>{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||/^\d+\.\d+/.test(u.hostname))throw Error('Public HTTPS source required');return u.toString();};
export function researchSnapshot(d){
 if(!validDate(d.checkedAt)||!Array.isArray(d.observations)||d.observations.length>100)throw Error('Bounded dated observations required');
 const metrics=m=>Object.fromEntries(['views','reactions','comments','reposts','impressions','clicks','watchSeconds','qualifiedConversations'].map(k=>[k,Number.isFinite(m?.[k])&&m[k]>=0?m[k]:null]));
 const observations=d.observations.map(o=>({id:text(o.id,100),creator:text(o.creator,150),title:text(o.title,250),url:publicUrl(o.url),publishedAt:validDate(o.publishedAt)?o.publishedAt:null,observedAt:validDate(o.observedAt)?o.observedAt:d.checkedAt,kind:text(o.kind,40),brand:['tideline','wonplace'].includes(o.brand)?o.brand:null,metrics:metrics(o.metrics),scope:text(o.scope,500)}));
 if(new Set(observations.map(o=>o.id)).size!==observations.length)throw Error('Duplicate observations');
 const facts=(rows,max=40)=>(Array.isArray(rows)?rows:[]).slice(0,max).map(o=>({id:text(o.id,100),title:text(o.title,250),url:publicUrl(o.url),summary:text(o.summary,1500),observedAt:validDate(o.observedAt)?o.observedAt:d.checkedAt,sourceDate:validDate(o.sourceDate)?o.sourceDate:null,status:text(o.status,40),limitation:text(o.limitation,1000)}));
 return {checkedAt:d.checkedAt,observations,creators:facts(d.creators,20),complaints:facts(d.complaints),features:facts(d.features),coverage:text(d.coverage,2000),metricsAccess:text(d.metricsAccess,1000)};
}
export function deriveResearch(d,now=Date.now()){
 const cutoff=now-7*86400000,weekly=d.observations.filter(o=>o.publishedAt&&Date.parse(o.publishedAt)>=cutoff&&Date.parse(o.publishedAt)<=now&&!['own-post'].includes(o.kind));
 const own=d.observations.filter(o=>o.kind==='own-post');
 return {gymWeekly:weekly.filter(o=>/Two-Brain|Gym Launch/.test(o.creator)),adjacentWeekly:weekly.filter(o=>!/Two-Brain|Gym Launch/.test(o.creator)),windowStart:new Date(cutoff).toISOString(),windowEnd:new Date(now).toISOString(),weekly:weekly.sort((a,b)=>(b.metrics.views??-1)-(a.metrics.views??-1)),excludedUndated:d.observations.filter(o=>!o.publishedAt&&o.kind!=='own-post').length,own,limitations:['Cumulative counts are not age-matched; a newer post has had less time to accumulate views.','Views across different creators and audiences are not directly comparable.','No causal explanation follows from these snapshots; creative explanations are hypotheses.',...(own.some(o=>o.metrics.impressions===null)?['Own-post impression data is unavailable; engagement and click-through rates cannot be calculated.']:[]),...(own.length<10?['The own-post sample is too small to infer a reliable winning format.']:[])]};
}
export async function opsState(env){
 const research=(await readOpsDoc(env,'content_research','current'))?.value||null;
 const runs=await env.DB.prepare('SELECT id,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 30').bind('content_agent_runs').all();
 const docs=await Promise.all(AGENT_DOCS.map(async d=>({...d,living:(await readOpsDoc(env,'content_agent_docs',d.step))?.value||{passes:0,lessons:[]}})));
 const operator=(await readOpsDoc(env,'content_operator','current'))?.value||null;
 const baseline=(await readOpsDoc(env,'content_baseline','linkedin'))?.value;
 const own=[...new Map([...(await platformObservations(env)),...(research?.observations||[])].filter(o=>o.kind==='own-post').sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)).map(o=>[o.url,{...o,brand:o.brand||((baseline?.posts||[]).some(p=>p.url===o.url)?'tideline':null)}])).values()];
 const analytics=Object.fromEntries(['all','tideline','wonplace'].map(b=>[b,ownAnalytics(own,b)]));
 return {analyticsStatus:(await readOpsDoc(env,'content_analytics_status','current'))?.value||null,production:await productionState(env),analytics,pipeline:await pipelineState(env),research,insights:research?deriveResearch({...research,observations:[...research.observations.filter(o=>o.kind!=='own-post'),...own]}):null,media:await listMedia(env),docs,runs:runs.results.map(r=>({id:r.id,...JSON.parse(r.data_json),claimToken:undefined,input:undefined})),operator:{lastSeenAt:operator?.lastSeenAt||null,available:!!operator&&Date.now()-operator.lastSeenAt<600000}};
}
export async function handleOps(request,env,actor,readJson){
 if(actor.role!=='edit')return json({error:'Not available to guests'},403);const url=new URL(request.url);
 if(url.pathname!=='/api/content-ops')return json({error:'Not found'},404);
 if(request.method==='GET')return json(await opsState(env));
 if(request.method!=='POST'||request.headers.get('origin')!==url.origin)return json({error:'Same-origin editor action required'},403);
 let body;try{body=await readJson(request);}catch{return json({error:'Invalid request'},400);}
 if(body.action==='cancel_production'){
  const stored=await readOpsDoc(env,'content_production_jobs',text(body.id,200));if(!stored||stored.value.status!=='running')return json({error:'Production job is no longer running'},409);
  const value={...stored.value,status:'cancelled',cancelledBy:actor.id,cancelledAt:Date.now()};delete value.token;delete value.item;
  const eventId=(stored.value.mode==='dispatch'?'dispatch-':'production-')+body.id;const r=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=?)').bind(JSON.stringify(value),Date.now(),'content_production_jobs',body.id,stored.revision,'content_pipeline_receipts',eventId).run();return json(r.meta.changes===1?{accepted:true}:{error:'Production completed before cancellation'},r.meta.changes===1?200:409);
 }
 if(body.action==='cancel'){
  const stored=await readOpsDoc(env,'content_agent_runs',text(body.id,100));if(!stored)return json({error:'Run not found'},404);
  if(!['pending','running'].includes(stored.value.status))return json({error:'Run already finished'},409);
  const value={...stored.value,status:'cancelled',cancelledAt:Date.now(),cancelledBy:actor.id};delete value.claimToken;delete value.leaseUntil;
  const result=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(value),Date.now(),'content_agent_runs',body.id,stored.revision).run();return json(result.meta.changes===1?{accepted:true}:{error:'Run changed before cancellation'},result.meta.changes===1?200:409);
 }
 if(body.action!=='run'||!AGENT_DOCS.some(d=>d.step===body.step))return json({error:'Choose a valid workflow step'},400);
 const pending=await env.DB.prepare("SELECT id FROM documents WHERE collection=? AND json_extract(data_json,'$.status') IN ('pending','running') LIMIT 5").bind('content_agent_runs').all();if(pending.results.length>=5)return json({error:'Decision queue is full; let current runs finish.'},429);
 const doc=AGENT_DOCS.find(d=>d.step===body.step),state=await opsState(env);if(!state.research)return json({error:'Import current evidence before running an agent.'},409);
 const itemId=text(body.itemId,100),storedItem=itemId?await readOpsDoc(env,'content_editorial',itemId):null,item=storedItem?{...storedItem.value,id:itemId,revision:storedItem.revision}:null;if(itemId&&!item)return json({error:'Saved item not found'},404);
 const id=crypto.randomUUID();const run={itemId,itemRevision:storedItem?.revision??null,step:doc.step,status:'pending',requestedBy:actor.id,requestedName:actor.name,requestedAt:Date.now(),instructionSha:doc.sha256,input:{instructions:doc.instructions,living:state.docs.find(d=>d.step===doc.step).living,research:state.research,insights:state.insights,item,media:state.media.map(a=>({id:a.id,title:a.title,kind:a.kind,brand:a.brand,provenance:a.provenance,profileUrl:a.profileUrl})),direction:text(body.direction,1500)}};
 await put(env,'content_agent_runs',id,run);return json({id,status:'pending'});
}
export function validateDecision(decision,input){
 if(!decision||!['proceed','needs_evidence','blocked'].includes(decision.verdict)||typeof decision.summary!=='string'||decision.summary.length>1800||!Array.isArray(decision.evidenceIds)||!Array.isArray(decision.nextActions)||decision.nextActions.length>6||!Array.isArray(decision.cautions))throw Error('Invalid decision shape');
 if(!decision.summary.trim()||typeof decision.learning!=='string'||!decision.learning.trim()||decision.learning.length>1200||decision.evidenceIds.length>15||decision.cautions.length>8||[...decision.nextActions,...decision.cautions].some(x=>typeof x!=='string'||!x.trim()||x.length>600))throw Error('Bounded, nonempty decision text required');
 const ids=new Set([...input.research.observations,...input.research.complaints,...input.research.features,...input.research.creators].map(x=>x.id));
 if(decision.evidenceIds.some(id=>!ids.has(id))||!decision.evidenceIds.length)throw Error('Decision must cite supplied evidence');
 return {verdict:decision.verdict,summary:text(decision.summary,1800),evidenceIds:decision.evidenceIds.slice(0,15),nextActions:decision.nextActions.map(x=>text(x,600)),cautions:decision.cautions.slice(0,8).map(x=>text(x,600)),learning:text(decision.learning,1200),draftCopy:text(decision.draftCopy,6000),cta:text(decision.cta,1000),shotList:(Array.isArray(decision.shotList)?decision.shotList:[]).slice(0,8).map(x=>text(x,600))};
}
export async function ingestOps(env,body){
 if(body.action==='analytics_targets')return json({targets:await analyticsTargets(env)});
 if(body.action==='analytics_observations'){try{return json(await ingestPlatformObservations(env,body));}catch(e){return json({error:e.message},400);}}
 if(['production_claim','production_complete','production_fail','production_verify'].includes(body.action)){try{return json(await productionAction(env,body));}catch(e){return json({error:e.message},409);}}
 if(body.action==='research'){try{const d=researchSnapshot(body.snapshot),old=await readOpsDoc(env,'content_research','current');if(old&&Date.parse(old.value.checkedAt)>Date.parse(d.checkedAt))return json({accepted:false});await put(env,'content_research','current',d);return json({accepted:true,observations:d.observations.length});}catch(e){return json({error:e.message},400);}}
 if(body.action==='bootstrap'){
  // Recover the narrow completion-to-editorial handoff after an interrupted request.
  const completed=await env.DB.prepare("SELECT id,data_json FROM documents WHERE collection=? AND json_extract(data_json,'$.status')='complete' AND json_extract(data_json,'$.itemId') IS NOT NULL ORDER BY updated_at DESC LIMIT 30").bind('content_agent_runs').all();
  for(const r of completed.results){const run=JSON.parse(r.data_json);if(run.itemId)await advanceDecision(env,run,run.decision,r.id);}

  const state=await opsState(env);if(!state.research)return json({accepted:false,reason:'No research'});
  // Retry only transient failures; semantic evidence holds and user cancellations remain holds.
  let retrySlots=5-state.runs.filter(r=>['pending','running'].includes(r.status)).length;
  for(const failed of state.runs){
   if(retrySlots<=0)break;if(failed.status!=='failed'||!failed.itemId||(failed.attempts||1)>=3||Date.now()-(failed.completedAt||0)<60000||!/timed out|status null|unavailable|network|rate limited/i.test(failed.error||''))continue;
   const item=await readOpsDoc(env,'content_editorial',failed.itemId);if(!item||item.revision!==failed.itemRevision||item.value.stage!==failed.step)continue;
   const blocked=await env.DB.prepare("SELECT id FROM documents WHERE collection=? AND json_extract(data_json,'$.itemId')=? AND json_extract(data_json,'$.itemRevision')=? AND json_extract(data_json,'$.step')=? AND json_extract(data_json,'$.status') IN ('pending','running','complete','cancelled') LIMIT 1").bind('content_agent_runs',failed.itemId,item.revision,failed.step).first();if(blocked)continue;
   const old=await readOpsDoc(env,'content_agent_runs',failed.id),attempt=(failed.attempts||1)+1,id=failed.id+'-retry-'+attempt,run={...old.value,status:'pending',attempts:attempt-1,retryOf:failed.id,requestedAt:Date.now(),requestedBy:'content-operator',requestedName:'Automatic retry '+attempt,input:{...old.value.input,research:state.research,insights:state.insights}};delete run.completedAt;delete run.error;delete run.decision;delete run.claimToken;delete run.leaseUntil;
   const queued=await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind('content_agent_runs',id,JSON.stringify(run),Date.now()).run();retrySlots-=queued.meta.changes;
  }

  // Advance saved research and writing autonomously, bounded by the existing queue.
  // Each item revision gets one attempt. Evidence blockers wait for owner steering.
  const candidates=await env.DB.prepare("SELECT e.id,e.data_json,e.revision FROM documents e WHERE e.collection=? AND json_extract(e.data_json,'$.stage') IN ('research','scripting') AND NOT EXISTS (SELECT 1 FROM documents r WHERE r.collection='content_agent_runs' AND json_extract(r.data_json,'$.itemId')=e.id AND json_extract(r.data_json,'$.itemRevision')=e.revision) ORDER BY e.updated_at LIMIT 5").bind('content_editorial').all();
  const pending=await env.DB.prepare("SELECT id FROM documents WHERE collection=? AND json_extract(data_json,'$.status') IN ('pending','running') LIMIT 5").bind('content_agent_runs').all();
  let available=5-pending.results.length;
  for(const candidate of candidates.results){if(available<=0)break;const item={...JSON.parse(candidate.data_json),id:candidate.id,revision:candidate.revision},doc=AGENT_DOCS.find(d=>d.step===item.stage),id='auto-'+candidate.id+'-'+candidate.revision;
   const run={itemId:candidate.id,itemRevision:candidate.revision,step:doc.step,status:'pending',requestedBy:'content-operator',requestedName:'Content assembly line',requestedAt:Date.now(),instructionSha:doc.sha256,input:{instructions:doc.instructions,living:state.docs.find(d=>d.step===doc.step).living,research:state.research,insights:state.insights,item,media:state.media.map(a=>({id:a.id,title:a.title,kind:a.kind,brand:a.brand,provenance:a.provenance,profileUrl:a.profileUrl})),direction:'Continue this saved brief using supplied evidence. Produce unapproved copy and proposed shots for writing. Hold if evidence is insufficient. Never claim footage, editing, approval or publication happened.'}};
   const queued=await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind('content_agent_runs',id,JSON.stringify(run),Date.now()).run();available-=queued.meta.changes;
  }
  if(available<=0)return json({accepted:false,reason:'Decision queue is full'});
  const day=new Date().toISOString().slice(0,10),id='auto-analytics-'+day,doc=AGENT_DOCS.find(d=>d.step==='analytics');
  const run={step:'analytics',status:'pending',requestedBy:'content-operator',requestedName:'Scheduled content review',requestedAt:Date.now(),instructionSha:doc.sha256,input:{instructions:doc.instructions,living:state.docs.find(d=>d.step==='analytics').living,research:state.research,insights:state.insights,item:null,media:state.media.map(a=>({id:a.id,title:a.title,kind:a.kind,brand:a.brand,provenance:a.provenance,profileUrl:a.profileUrl})),direction:'Review this week’s dated niche evidence and our actual post observations. State measurement limits and propose one useful, falsifiable gym-owner content experiment.'}};
  const r=await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind('content_agent_runs',id,JSON.stringify(run),Date.now()).run();return json({accepted:r.meta.changes===1,id});
 }
 if(body.action==='claim'){
  await put(env,'content_operator','current',{lastSeenAt:Date.now(),engine:'codex',permissions:'tool-free decision only'});
  const rows=await env.DB.prepare("SELECT id,data_json,revision FROM documents WHERE collection=? AND (json_extract(data_json,'$.status')='pending' OR (json_extract(data_json,'$.status')='running' AND json_extract(data_json,'$.leaseUntil') < ? AND coalesce(json_extract(data_json,'$.attempts'),0)<3)) ORDER BY updated_at LIMIT 1").bind('content_agent_runs',Date.now()).all();const row=rows.results[0];if(!row)return json({job:null});const run=JSON.parse(row.data_json),claimed={...run,status:'running',claimToken:crypto.randomUUID(),leaseUntil:Date.now()+300000,attempts:(run.attempts||0)+1};
  const r=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(claimed),Date.now(),'content_agent_runs',row.id,row.revision).run();return json({job:r.meta.changes===1?{id:row.id,...claimed}:null});
 }
 if(body.action==='complete'||body.action==='fail'){
  const stored=await readOpsDoc(env,'content_agent_runs',body.id);if(!stored)return json({error:'Run not found'},404);const run=stored.value;if(run.status==='complete'||run.status==='failed')return json({accepted:true,alreadyFinished:true,advancement:run.status==='complete'?await advanceDecision(env,run,run.decision,body.id):null});if(run.claimToken!==body.claimToken||run.status!=='running'||run.leaseUntil<Date.now())return json({error:'Run lease expired'},409);
  let decision;try{decision=body.action==='complete'?validateDecision(body.decision,run.input):null;}catch(e){return json({error:e.message},400);}
  const passNonce=crypto.randomUUID();const done={...run,passNonce,status:decision?'complete':'failed',completedAt:Date.now(),decision,engine:decision?'codex':null,model:decision?text(body.model,100):null,error:decision?null:text(body.error,500)};delete done.claimToken;delete done.leaseUntil;
  const old=await readOpsDoc(env,'content_agent_docs',run.step),living=old?.value||{passes:0,lessons:[]};const updated={passNonce,version:run.instructionSha,passes:living.passes+1,lastRunId:body.id,lastOutcome:done.status,updatedAt:done.completedAt,lessons:[{runId:body.id,at:done.completedAt,outcome:done.status,text:decision?.learning||done.error,evidenceIds:decision?.evidenceIds||[]} ,...living.lessons].slice(0,30)};
  // Both the durable run and its living document advance together.
  const docStatement=env.DB.prepare("INSERT INTO documents(collection,id,data_json,revision,updated_at) SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND revision=? AND json_extract(data_json,'$.status')='running') ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=documents.revision+1,updated_at=excluded.updated_at WHERE documents.revision=?").bind('content_agent_docs',run.step,JSON.stringify(updated),Date.now(),'content_agent_runs',body.id,stored.revision,old?.revision||0);
  const runStatement=env.DB.prepare("UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=? AND EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND json_extract(data_json,'$.passNonce')=?)").bind(JSON.stringify(done),Date.now(),'content_agent_runs',body.id,stored.revision,'content_agent_docs',run.step,passNonce);
  const result=await env.DB.batch([docStatement,runStatement]);if(result[1].meta.changes!==1)return json({error:'Concurrent pass finished first; retry this completion'},409);const advancement=decision?await advanceDecision(env,run,decision,body.id):{status:'held',reason:'Decision failed'};return json({accepted:true,advancement});
 }
 return json({error:'Unknown operation'},400);
}
