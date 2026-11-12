// Bounded public catalog bridge. This endpoint never enqueues coding jobs,
// signs human review, changes permission scope or approves a release.
import {verifySource} from './company-signing.js';
import {handleCompanyTickets,readBody} from './company-tickets.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const system=/^(?:Spring incident|Office recovery|Premier recovery|Premier workflow needs manual review|Build an automation draft only|Verify your recovery access|Report a bug: Spring previously discarded startup errors)/i;
const response=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export function registryPublicTicket(issue,tasks=[]){
 if(issue.deleted||issue.company!=='wonplace'||issue.staffVisible===false||system.test(issue.title||''))return null;
 const linked=tasks.filter(task=>task.ticket===issue.id&&task.company==='wonplace'&&task.snapshot&&!['cancelled'].includes(task.snapshot.state)).sort((a,b)=>(b.receivedAt||0)-(a.receivedAt||0)),task=linked[0];let status=issue.status,sourceRevision=String(issue.revision),completedEvidence='';
 if(task){const snapshot=task.snapshot,heartbeat=Number(snapshot.heartbeatAt||0),fresh=heartbeat>0&&Date.now()-heartbeat<90000,manuallyReopened=issue.status==='open'&&(issue.history||[]).some(event=>event.at>task.receivedAt&&/\bstatus\b/i.test(event.action||''));
  if(status!=='resolved'&&!manuallyReopened){if(['working','submitted','releasing','awaiting_remote'].includes(snapshot.state))status=fresh?'in_progress':'blocked';else if(['repair_required','owner_lost','retry_wait'].includes(snapshot.state))status='blocked';else if(snapshot.state==='complete')status='in_review';sourceRevision=issue.revision+':'+task.taskId+':'+status;}
  if(status==='resolved'&&snapshot.state==='complete'&&snapshot.delivery==='deploy'&&/^[a-f0-9]{40}$/.test(snapshot.commit||'')&&snapshot.liveAcceptance?.commit===snapshot.commit&&snapshot.liveAcceptance?.deploymentId&&(issue.humanReviews||[]).some(review=>review.reviewVersion===(issue.reviewVersion||0)))completedEvidence='Verified deployment '+snapshot.commit+' with current recorded human review.';
 }
 return {id:issue.id,title:String(issue.staffTitle||issue.title).slice(0,160),body:String(issue.publicUpdate||issue.staffTitle||issue.title).slice(0,2000),status,priority:({urgent:'P0',high:'P1',normal:'P2',low:'P3'})[issue.priority]||null,urgency:issue.urgency??null,origin:'team',assignee:String(issue.assignee||'').slice(0,100),sourceId:issue.id,sourceRevision,ticketRevision:issue.revision,completedEvidence};
}
export async function handleWonPlaceRegistry(request,env){
 if(env.WONPLACE_REGISTRY_ENABLED!=='true')return response({error:'Registry bridge is not activated'},503);
 if(request.method!=='POST')return response({error:'Use a signed catalog request'},405);
 let value;try{value=await readBody(request,40000);}catch(e){return response({error:e.message},e.status||422);}
 const serialized=JSON.stringify(value);
 if(!await verifySource(request,env.WONPLACE_TICKETS_SECRET,serialized))return response({error:'Source authentication required'},401);
 const owner=await env.DB.prepare("SELECT id,name,email,role FROM members WHERE active=1 AND role='edit' AND lower(email)='q.stewart@tidelinestrats.com'").first();if(!owner)return response({error:'The configured owner is unavailable'},403);
 if(value.operation==='list'){
  if(Object.keys(value).some(k=>!['operation','offset'].includes(k))||!Number.isSafeInteger(value.offset)||value.offset<0||value.offset>10000)return response({error:'Use a bounded page'},422);
  const r=await handleCompanyTickets(new Request('https://voyage.tidelinestrats.com/api/company-tickets?company=wonplace&offset='+value.offset),env,owner,['api','company-tickets']);if(!r.ok)return r;const data=await r.json();const taskRows=await env.DB.prepare("SELECT data_json FROM documents WHERE collection='company_ticket_tasks' AND json_extract(data_json,'$.company')='wonplace' ORDER BY updated_at DESC LIMIT 2000").bind().all(),tasks=taskRows.results.map(row=>JSON.parse(row.data_json));return response({items:data.items.map(item=>registryPublicTicket(item,tasks)).filter(Boolean),nextOffset:data.nextOffset,complete:data.nextOffset===null});
 }
 if(!['create','save'].includes(value.operation)||Object.keys(value).some(k=>!['operation','eventId','id','expectedRevision','title','body','status','priority','urgency','checklist'].includes(k))||value.checklist!==undefined&&typeof value.checklist!=='boolean'||!uuid.test(value.eventId||'')||!uuid.test(value.id||'')||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||typeof value.body!=='string'||!value.body.trim()||value.body.length>8000||!['open','planned','in_progress','needs_info','resolved'].includes(value.status)||value.priority!==null&&!/^P[0-3]$/.test(value.priority||'')||value.urgency!==null&&(!Number.isInteger(value.urgency)||value.urgency<0||value.urgency>100))return response({error:'Use exact, bounded shared ticket fields'},422);
 const stored=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind('company_tickets','wonplace:'+value.id).first();
 const issue=stored?{...JSON.parse(stored.data_json),revision:stored.revision}:null;
 const marker='Spring notes update '+value.eventId;
 const previous=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('wonplace_registry_receipts',value.eventId).first();
 if(previous){const receipt=JSON.parse(previous.data_json);return receipt.request===serialized?response({...receipt.result,replayed:true}):response({error:'Event identity conflict'},409);}
 if(value.operation==='save'&&!issue)return response({error:'Ticket not found'},404);
 if(issue&&(issue.deleted||issue.company!=='wonplace'||system.test(issue.title||'')))return response({error:'Ticket is not shared product work'},403);
 let result;
 if(value.operation==='create'&&issue&&!(issue.createdBy==='Spring notes sync'&&issue.title===value.title&&issue.description===value.body))return response({error:'The stable source identity is already in use'},409);
 if(value.operation==='create'&&issue&&issue.createdBy==='Spring notes sync'&&issue.title===value.title&&issue.description===value.body||issue?.notes?.some(note=>note.body.includes(marker)))result={accepted:true,id:issue.id,revision:issue.revision,reconciled:true};
 else{
  if(issue&&value.expectedRevision!==issue.revision)return response({error:'The engineering ticket changed. Reconcile the source revision.'},409);
  const actor={...owner,name:'Spring notes sync',agent:'spring',humanName:owner.name};
  const note=marker+'\nQuan Notes status: '+value.status+'\n'+value.body.slice(0,5600);
  const patch={note,...(!value.checklist?{urgency:value.urgency,...(value.priority?{priority:({P0:'urgent',P1:'high',P2:'normal',P3:'low'})[value.priority]}:{})}:{}),publicUpdate:('Quan Notes: '+value.status+'. '+value.body).slice(0,2000)};
  // A notes edit cannot silently overwrite engineering status, assignee or approval evidence.
  let saved;
  if(!issue){saved=await handleCompanyTickets(new Request('https://voyage.tidelinestrats.com/api/company-tickets?company=wonplace',{method:'POST',body:JSON.stringify({id:value.id,title:value.title,description:value.body,type:'task',priority:({P0:'urgent',P1:'high',P2:'normal',P3:'low'})[value.priority]||'normal',staffVisible:true,staffTitle:value.title})}),env,actor,['api','company-tickets']);}
  else saved=await handleCompanyTickets(new Request('https://voyage.tidelinestrats.com/api/company-tickets/'+issue.id+'?company=wonplace',{method:'PATCH',body:JSON.stringify({...patch,expectedRevision:issue.revision})}),env,actor,['api','company-tickets',issue.id]);
  if(!saved.ok)return saved;const data=await saved.json();result={accepted:true,id:data.issue.id,revision:data.issue.revision};
 }
 await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?)').bind('wonplace_registry_receipts',value.eventId,JSON.stringify({request:serialized,result}),Date.now()).run();
 return response(result);
}

export async function handleLinkedSupportNotes(request,env,actor,id){
 if(env.WONPLACE_REGISTRY_ENABLED!=='true')return response({error:'Shared notes are awaiting activation'},503);
 if(request.method!=='GET'||actor.role!=='edit'||!uuid.test(id||''))return response({error:'Shared notes are unavailable'},403);
 const {supportCall}=await import('./wonplace-support.js');
 try{return response(await supportCall(env,{operation:'registry_read',ticketId:id}));}catch{return response({error:'Shared notes could not refresh. Original records are retained.'},503);}
}
