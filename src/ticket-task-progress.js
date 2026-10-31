import {taskPresence,taskColor} from './ticket-collaboration.js';
import {readTicket} from './ticket-handoffs.js';
import {handleCompanyTickets} from './company-tickets.js';
import {appendWorkReport,contributor} from './ticket-work-report.js';
import {verifySource} from './company-signing.js';
const collection='company_ticket_tasks';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identities={wonplace:'github.com/quanbuilds/premieros',voyage:'github.com/quanbuilds/the-voyage'};
const owners=['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'];
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
const read=async(env,c,id)=>{const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(c,id).first();return r?{...JSON.parse(r.data_json),revision:r.revision}:null;};
export async function ticketTasks(env,company,ticket){
 const {results}=await env.DB.prepare("SELECT data_json FROM documents WHERE collection=? AND id LIKE ? AND json_extract(data_json,'$.ticket')=? ORDER BY updated_at DESC LIMIT 100").bind(collection,company+':%',ticket).all();
 return results.map(r=>JSON.parse(r.data_json));
}
export function progressSnapshot(value){
 const states=['queued','admitting','working','submitted','releasing','awaiting_remote','retry_wait','repair_required','owner_lost','complete','cancelled'];
 if(!value||Object.keys(value).some(k=>!['state','stage','heartbeatAt','checkpoint','checkpointAt','commit','milestones','delivery','liveAcceptance'].includes(k))||!states.includes(value.state)||typeof value.stage!=='string'||value.stage.length>80)throw Error('Invalid task snapshot');
 for(const k of ['heartbeatAt','checkpointAt'])if(value[k]!=null&&(!Number.isSafeInteger(value[k])||value[k]<0||value[k]>Date.now()+300000))throw Error('Invalid progress time');
 if(value.checkpoint!=null&&(typeof value.checkpoint!=='string'||value.checkpoint.length>4000))throw Error('Invalid checkpoint');
 if(value.commit!=null&&!/^[0-9a-f]{40}$/.test(value.commit))throw Error('Invalid commit');
 const delivery=value.delivery||'merge',liveAcceptance=value.liveAcceptance||null;if(!['merge','deploy'].includes(delivery))throw Error('Invalid delivery level');if(liveAcceptance&&(Object.keys(liveAcceptance).some(k=>!['commit','deploymentId','at'].includes(k))||!/^[0-9a-f]{40}$/.test(liveAcceptance.commit||'')||typeof liveAcceptance.deploymentId!=='string'||!liveAcceptance.deploymentId.trim()||liveAcceptance.deploymentId.length>200||!Number.isSafeInteger(liveAcceptance.at)||liveAcceptance.at<0||liveAcceptance.at>Date.now()+300000))throw Error('Invalid live acceptance receipt');
 const milestones=value.milestones||[];if(!Array.isArray(milestones)||milestones.length>50||milestones.some((m,i)=>!m||Object.keys(m).some(k=>!['id','at','kind'].includes(k))||!Number.isSafeInteger(m.id)||m.id<1||i>0&&m.id<=milestones[i-1].id||!Number.isSafeInteger(m.at)||m.at<0||m.at>Date.now()+300000||typeof m.kind!=='string'||!/^[a-z_:-]{1,80}$/.test(m.kind)))throw Error('Invalid coordinator milestones');
 return {delivery,liveAcceptance,milestones,state:value.state,stage:value.stage,heartbeatAt:value.heartbeatAt||null,checkpoint:value.checkpoint||'',checkpointAt:value.checkpointAt||null,commit:value.commit||null,activity:'unverified',ticketAcceptance:'pending'};
}
export async function sourceTaskProgress(request,env,readJson,transport=fetch){
 const company=new URL(request.url).pathname.split('/')[3];
 if(request.method!=='POST'||new URL(request.url).pathname.split('/').length!==4||!identities[company])return reply({error:'Not found'},404);
 const value=await readJson(request);
 if(!await verifySource(request,env[company.toUpperCase()+'_OPERATIONS_SECRET'],JSON.stringify(value)))return reply({error:'Source authentication required'},401);
 if(!value||!['validate','link','progress','report'].includes(value.action)||!/^[0-9a-f]{12}$/.test(value.taskId||'')||!uuid.test(value.runtimeId||''))return reply({error:'Invalid task reference'},400);
 const key=company+':'+value.taskId,existing=await read(env,collection,key),now=Date.now();
 if(['validate','link'].includes(value.action)){
  if(Object.keys(value).some(k=>!['action','taskId','runtimeId','ticket','identity','agent','requestedBy','lead'].includes(k))||!uuid.test(value.ticket||'')||value.identity!==identities[company]||!['codex','claude'].includes(value.agent)||!(owners.includes(value.requestedBy)||/^[A-Za-z0-9_-]{1,64}$/.test(value.requestedBy||''))||typeof value.lead!=='boolean')return reply({error:'Explicit ticket, repository and requesting owner required'},400);
  const member=await env.DB.prepare('SELECT id,role,email FROM members WHERE (email=? OR id=?) AND active=1').bind(value.requestedBy,value.requestedBy).first();
  if(member?.role!=='edit'||!owners.includes(member.email?.toLowerCase()))return reply({error:'Requesting owner has no access'},403);
  let ticket=await read(env,'company_tickets',company+':'+value.ticket);
  if(!ticket&&company==='wonplace'&&value.action==='validate'){
   let original;try{original=await readTicket(env,company,value.ticket,'original',transport);}catch{return reply({error:'Choose an existing Company or original WonPlace ticket'},404);}
   const created=await handleCompanyTickets(new Request('https://voyage.tidelinestrats.com/api/company-tickets?company=wonplace',{method:'POST',body:JSON.stringify({id:value.ticket,sourceId:value.ticket,title:original.title,description:original.description||'',type:original.type==='feature'?'feature':'bug',labels:'agent-progress'})}),env,{id:member.id,name:'Agent ticket linkage',agent:value.agent,role:'edit'},['api','company-tickets']);if(!created.ok)return created;ticket=await read(env,'company_tickets',company+':'+value.ticket);
  }
  if(!ticket||ticket.deleted)return reply({error:'Choose an existing Company ticket'},404);
  if(value.action==='validate'){if(value.lead&&(await ticketTasks(env,company,value.ticket)).some(t=>t.lead))return reply({error:'This ticket already has an accountable lead; use a supporting link'},409);return reply({accepted:true,ticket:value.ticket,requestedBy:member.id});}
  if(existing){const same=existing.ticket===value.ticket&&existing.runtimeId===value.runtimeId&&existing.identity===value.identity&&existing.agent===value.agent&&existing.requestedBy===member.id&&existing.lead===value.lead;return same?reply({accepted:true,duplicate:true,task:existing}):reply({error:'Task already linked; do not reassign existing work'},409);}
  const task={reportContract:2,taskId:value.taskId,ticket:value.ticket,company,runtimeId:value.runtimeId,identity:value.identity,agent:value.agent,requestedBy:member.id,lead:value.lead,linkedAt:now,receivedAt:now,sequence:0,snapshot:null};
  // A ticket has one accountable lead; multiple supporting tasks are allowed.
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO documents(collection,id,data_json,updated_at) SELECT ?,?,?,? WHERE ?=0 OR NOT EXISTS (SELECT 1 FROM documents WHERE collection=? AND id LIKE ? AND json_extract(data_json,'$.ticket')=? AND json_extract(data_json,'$.lead')=1)").bind(collection,key,JSON.stringify(task),now,value.lead?1:0,collection,company+':%',value.ticket).run();
  return inserted.meta.changes?reply({accepted:true,task},201):reply({error:'Task or ticket lead changed; reconcile existing link'},409);
 }
 if(!existing||existing.runtimeId!==value.runtimeId)return reply({error:'Task link not found for this runtime'},409);
 const member=await env.DB.prepare('SELECT id,role,email FROM members WHERE id=? AND active=1').bind(existing.requestedBy).first();
 if(member?.role!=='edit'||!owners.includes(member.email?.toLowerCase()))return reply({error:'Requesting owner no longer has access'},403);
 const ticket=await read(env,'company_tickets',company+':'+existing.ticket);
 if(!ticket||ticket.deleted)return reply({error:'Ticket unavailable'},409);
 if(value.action==='report'){
  if(Object.keys(value).some(k=>!['action','taskId','runtimeId','commit','report'].includes(k))||!/^[0-9a-f]{40}$/.test(value.commit||'')||!value.report||Object.keys(value.report).some(k=>!['requestId','summary','changes','checks','links'].includes(k))||typeof value.report.checks!=='string'||!value.report.checks.trim())return reply({error:'Report requires exact commit and checks; identity is derived from the linked task'},400);
  const humanName=member.email.toLowerCase().startsWith('q.stewart@')?'Quan':'Cody',actor={id:member.id,name:(existing.agent==='claude'?'Claude':'Codex')+' for '+humanName,humanName,agent:existing.agent,taskId:existing.taskId,commit:value.commit,role:'edit'};
  let issue=ticket;
  for(let attempt=0;attempt<3;attempt++){
   if(!issue||issue.deleted)return reply({error:'Ticket unavailable'},409);
   const next={...issue};delete next.revision;let result;
   try{result=appendWorkReport(next,{...value.report,performer:existing.agent},actor,now);}catch(error){if(error.status)return reply({error:error.message},error.status);throw error;}
   const receipt={accepted:true,taskId:existing.taskId,commit:value.commit,reportId:result.entry.id};
   if(result.duplicate)return reply({...receipt,duplicate:true});
   next.updatedAt=now;next.history=[...(next.history||[]),{at:now,by:actor.name,author:contributor(actor),action:'Added coordinator task work report '+existing.taskId}].slice(-300);
   const saved=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),now,'company_tickets',company+':'+existing.ticket,issue.revision).run();
   if(saved.meta.changes)return reply(receipt,201);issue=await read(env,'company_tickets',company+':'+existing.ticket);
  }
  return reply({error:'Ticket changed; retry the identical report'},409);
 }
 if(Object.keys(value).some(k=>!['action','taskId','runtimeId','sequence','snapshot'].includes(k))||!Number.isSafeInteger(value.sequence)||value.sequence<1)return reply({error:'Invalid progress event'},400);
 let snapshot;try{snapshot=progressSnapshot(value.snapshot);}catch(error){return reply({error:error.message},400);}
 if(value.sequence===existing.sequence)return JSON.stringify(snapshot)===JSON.stringify(existing.snapshot)?reply({accepted:true,duplicate:true,sequence:value.sequence}):reply({error:'Sequence already has different content'},409);
 if(value.sequence!==existing.sequence+1)return reply({error:'Progress sequence changed; reconcile before retry'},409);
 const substantive=snapshot.milestones.length>0||JSON.stringify({...snapshot,heartbeatAt:null,milestones:[]})!==JSON.stringify({...existing.snapshot,heartbeatAt:null,milestones:[]});
 if(snapshot.milestones.length&&snapshot.milestones[0].id<=(existing.eventCursor||0))return reply({error:'Milestone cursor already accepted'},409);
 const next={...existing,eventCursor:snapshot.milestones.at(-1)?.id||existing.eventCursor||0,milestones:[...(existing.milestones||[]),...snapshot.milestones].slice(-200),sequence:value.sequence,snapshot,receivedAt:now,history:substantive?[...(existing.history||[]),{sequence:value.sequence,at:now,state:snapshot.state,stage:snapshot.stage,checkpoint:snapshot.checkpoint,checkpointAt:snapshot.checkpointAt,commit:snapshot.commit}].slice(-100):(existing.history||[])};delete next.revision;
 const saved=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),now,collection,key,existing.revision).run();
 if(saved.meta.changes)try{await taskPresence(env,next,ticket,snapshot);}catch{console.warn(JSON.stringify({event:'ticket_presence_failed',taskId:next.taskId}));}
 return saved.meta.changes?reply({accepted:true,sequence:value.sequence,label:ticket.title,color:taskColor(value.taskId)}):reply({error:'Progress changed; retry the same event'},409);
}
