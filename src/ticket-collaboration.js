import {taskLabel} from './task-blockers.js';
import {verifySource} from './company-signing.js';
import {handleCompanyTickets,readBody,ticketFields} from './company-tickets.js';
export const roomColors=['#83bcb0','#8faed5','#baa1d3','#c4b385','#87b9ca','#c599aa','#a2bb87','#aeabe0'];
export function taskColor(id){let hash=0;for(const c of id)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;return roomColors[hash%roomColors.length];}
export const collaborationFields=['title','description','steps','expected','actual','environment','links','labels','assignee','note'];
export function presenceInput(value){
 if(!value||Object.keys(value).some(k=>!['field','draft','caret','status'].includes(k)))throw Error('Invalid presence');
 const {field=null,draft='',caret=draft.length,status='working'}=value;
 if(field!==null&&!collaborationFields.includes(field)||typeof draft!=='string'||draft.length>12000||!Number.isInteger(caret)||caret<0||caret>draft.length||!['working','reading','typing','testing','waiting','saved','conflict'].includes(status)||!field&&draft)throw Error('Invalid task draft');
 return {field,draft,caret,status};
}
export const collaborationHub=(env,company)=>env.COMPANY_HUB?.get(env.COMPANY_HUB.idFromName('ticket-collaboration:'+company));
const reply=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
const read=async(env,collection,id)=>{const row=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(collection,id).first();return row?{...JSON.parse(row.data_json),revision:row.revision}:null;};
export async function taskPresence(env,task,ticket,snapshot){
 const hub=collaborationHub(env,task.company);if(!hub)return;
 if(['complete','cancelled'].includes(snapshot.state))return hub.removeTask(task.taskId);
 const blocked=snapshot.blocker&&Date.now()-snapshot.blocker.at<86400000;
 const fresh=snapshot.heartbeatAt&&Date.now()-snapshot.heartbeatAt<90000;
 if(!fresh&&!blocked)return hub.removeTask(task.taskId);
 return hub.publishTask({taskId:task.taskId,ticket:ticket.id,label:taskLabel(snapshot.taskTitle||ticket.title),color:taskColor(task.taskId),agent:task.agent,owner:task.requestedBy,blocker:blocked?snapshot.blocker:null,status:blocked?'blocked':['repair_required','awaiting_remote','retry_wait'].includes(snapshot.state)?'waiting':snapshot.stage==='test'?'testing':'working',field:null,draft:'',caret:0,origin:'coordinator',detail:snapshot.stage||snapshot.state,updatedAt:Date.now()});
}
export async function handleCollaboration(request,env,actor,path){
 if(actor.role!=='edit')return reply({error:'Editor access required'},403);
 const company=new URL(request.url).searchParams.get('company');if(!['tideline','wonplace','loki','voyage'].includes(company))return reply({error:'Choose a product'},400);
 const hub=collaborationHub(env,company);if(!hub)return reply({error:'Collaboration unavailable'},503);
 if(request.method!=='GET'||path.length>3)return reply({error:'Method not allowed'},405);
 if(path[2]==='live'){
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin not allowed'},403);
  return hub.fetch(new Request('https://hub/tickets',{headers:request.headers}));
 }
 if(path.length!==2)return reply({error:'Not found'},404);
 return reply(await hub.taskSnapshot());
}
export async function sourceCollaboration(request,env){
 const path=new URL(request.url).pathname.split('/'),company=path[3];
 if(request.method!=='POST'||path.length!==4||!['wonplace','voyage'].includes(company))return reply({error:'Not found'},404);
 let value;try{value=await readBody(request,40000);}catch(error){return reply({error:error.message},error.status||400);}
 if(!await verifySource(request,env[company.toUpperCase()+'_OPERATIONS_SECRET'],JSON.stringify(value)))return reply({error:'Source authentication required'},401);
 if(!value||Object.keys(value).some(k=>!['taskId','runtimeId','action','presence','expectedSequence','patch','expectedRevision','offset'].includes(k))||!/^[a-f0-9]{12}$/.test(value.taskId||'')||!['read','list','presence','save','leave'].includes(value.action))return reply({error:'Invalid task action'},400);
 const task=await read(env,'company_ticket_tasks',company+':'+value.taskId);
 if(!task||task.runtimeId!==value.runtimeId)return reply({error:'Linked task required'},403);
 const member=await env.DB.prepare('SELECT id,name,role,email FROM members WHERE id=? AND active=1').bind(task.requestedBy).first();
 if(member?.role!=='edit'||!['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com'].includes(member.email?.toLowerCase()))return reply({error:'Owner access revoked'},403);
 const completed=task.snapshot?.state==='complete';
 if(['cancelled','owner_lost'].includes(task.snapshot?.state))return reply({error:'Task is no longer active'},409);
 // Completed tasks retain a bounded final-status handoff, not an editing session.
 // The ticket endpoint still enforces revision, delivery and final-report gates.
 if(completed&&!['read','list','leave'].includes(value.action)&&!(value.action==='save'&&value.patch&&Object.keys(value.patch).length===1&&['in_review','resolved'].includes(value.patch.status)))return reply({error:'Completed tasks may only read or set a final ticket status'},409);
 const issue=await read(env,'company_tickets',company+':'+task.ticket);
 if(!issue||issue.deleted)return reply({error:'Ticket unavailable'},409);
 const hub=collaborationHub(env,company);if(!hub)return reply({error:'Collaboration unavailable'},503);
 if(value.action==='leave'){await hub.removeTask(task.taskId);return reply({accepted:true});}
 const identity={taskId:task.taskId,ticket:issue.id,label:taskLabel(task.snapshot?.taskTitle||issue.title),color:taskColor(task.taskId),agent:task.agent,owner:member.name||member.id,origin:'tools',blocker:task.snapshot?.blocker&&Date.now()-task.snapshot.blocker.at<86400000?task.snapshot.blocker:null,lastTool:value.action,lastToolAt:Date.now(),updatedAt:Date.now()};
 if(value.action==='list'){
  if(value.offset!==undefined&&(!Number.isInteger(value.offset)||value.offset<0||value.offset>100000))return reply({error:'Invalid offset'},400);
  const response=await handleCompanyTickets(new Request('https://voyage/api/company-tickets?company='+company+'&offset='+(value.offset||0)),env,member,['api','company-tickets']);if(response.ok&&!completed)await hub.touchTask(identity,'list');return response;
 }
 if(value.action==='read'){if(!completed)await hub.touchTask(identity,'read');return reply({accepted:true,issue,workspace:await hub.taskSnapshot()});}
 if(value.action==='presence'){
  let presence;try{presence=presenceInput(value.presence);}catch(error){return reply({error:error.message},400);}
  if(!Number.isInteger(value.expectedSequence)||value.expectedSequence<0)return reply({error:'Read the workspace sequence first'},400);
  const result=await hub.publishTask({...identity,...presence},value.expectedSequence);return reply(result,result.accepted?200:409);
 }
 // The existing ticket endpoint performs an atomic revision check and records agent attribution.
 let patch;try{patch=ticketFields(value.patch);if(!value.patch||Object.keys(value.patch).some(k=>!collaborationFields.includes(k)&&!['status','priority','type','dueDate'].includes(k)))throw Error('Unsupported ticket change');if('note'in value.patch){if(typeof value.patch.note!=='string'||!value.patch.note.trim()||value.patch.note.length>6000)throw Error('Invalid note');patch.note=value.patch.note;}}catch(error){return reply({error:error.message},400);}
 if(!Object.keys(patch).length||!Number.isInteger(value.expectedRevision))return reply({error:'Changes and expectedRevision required'},400);
 const actor={...member,agent:task.agent,taskId:task.taskId,humanName:member.name,name:(task.agent==='claude'?'Claude':'Codex')+' for '+member.name};
 const response=await handleCompanyTickets(new Request('https://voyage/api/company-tickets/'+issue.id+'?company='+company,{method:'PATCH',body:JSON.stringify({...patch,expectedRevision:value.expectedRevision})}),env,actor,['api','company-tickets',issue.id]);
 if(response.ok){const saved=await response.clone().json();if(!completed)await hub.publishTask({...identity,status:'saved',field:null,draft:'',caret:0,detail:'Saved revision '+saved.issue.revision});}
 else if(response.status===409&&!completed)await hub.markTaskConflict(task.taskId);
 return response;
}
