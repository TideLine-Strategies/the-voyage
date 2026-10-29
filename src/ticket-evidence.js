import {appendWorkReport,contributor,invalidateHumanReviews} from './ticket-work-report.js';
import {readBody,decodeScreenshot,handleCompanyTickets} from './company-tickets.js';
import {readTicket} from './ticket-handoffs.js';
import {verifySource} from './company-signing.js';
const origin='https://voyage.tidelinestrats.com',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store'}});
const owners=new Set(['q.stewart@tidelinestrats.com','c.knudsen@tidelinestrats.com']);
export async function sourceTicketEvidence(request,env,transport=fetch){
 const parts=new URL(request.url).pathname.split('/').filter(Boolean),company=parts[2];
 if(request.method!=='POST'||parts.length!==3||!['wonplace','voyage'].includes(company))return reply({error:'Not found'},404);
 try{
  const value=await readBody(request,1450000);
  if(!await verifySource(request,env[company.toUpperCase()+'_OPERATIONS_SECRET'],JSON.stringify(value)))return reply({error:'Evidence source authentication required'},401);
  const isReport=value.kind==='work-report';if(value.kind&&!['work-report','screenshot'].includes(value.kind))return reply({error:'Invalid evidence kind'},400);
  if(!uuid.test(value.localJobId||'')||!uuid.test(value.requestId||'')||!isReport&&(typeof value.caption!=='string'||value.caption.length>1000))return reply({error:'Invalid evidence request'},400);
  const rows=await env.DB.prepare("SELECT data_json FROM documents WHERE collection='company_ticket_jobs' AND id LIKE ? AND json_extract(data_json,'$.localJobId')=? LIMIT 2").bind(company+':%',value.localJobId).all();
  if(rows.results.length!==1)return reply({error:'Claimed coding job not found'},404);
  const job=JSON.parse(rows.results[0].data_json);
  if(job.company!==company||!uuid.test(job.ticket||'')||!['company','original'].includes(job.source)||!['codex','claude'].includes(job.agent)||job.state==='cancelled'||!job.runtimeId)return reply({error:'Job is not eligible for evidence'},409);
  const member=await env.DB.prepare('SELECT id,role,email FROM members WHERE id=? AND active=1').bind(job.actor).first();
  if(member?.role!=='edit'||!owners.has(member.email?.toLowerCase()))return reply({error:'Requesting owner no longer has access'},403);
  if(isReport&&Object.keys(value).some(k=>!['localJobId','requestId','kind','summary','changes','checks','links'].includes(k)))return reply({error:'Job reports cannot set contributor or human review identity'},400);
  const image=isReport?null:decodeScreenshot(value),digest=isReport?null:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({data:image.data,name:image.name,caption:value.caption}))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const humanName=member.email.toLowerCase().startsWith('q.stewart@')?'Quan':'Cody';const actor={id:member.id,name:(job.agent==='claude'?'Claude':'Codex')+' for '+humanName,humanName,agent:job.agent,jobId:job.id,role:'edit'},key=company+':'+job.ticket;
  const read=async()=>{const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind('company_tickets',key).first();return r?{...JSON.parse(r.data_json),revision:r.revision}:null;};
  let issue=await read();
  if(!issue&&job.source==='original'&&company==='wonplace'){
   const report=await readTicket(env,company,job.ticket,'original',transport);
   const r=await handleCompanyTickets(new Request(origin+'/api/company-tickets?company='+company,{method:'POST',body:JSON.stringify({id:job.ticket,sourceId:job.ticket,title:report.title,description:report.description||'',type:report.type==='feature'?'feature':'bug',labels:'codex-completion-evidence'})}),env,actor,['api','company-tickets']);if(!r.ok)return r;issue=await read();
  }
  if(!issue)return reply({error:'Ticket not found'},404);
  for(let attempt=0;attempt<3;attempt++){
   if(issue.deleted)return reply({error:'Restore the ticket before attaching evidence'},409);
   if(isReport){const now=Date.now(),next={...issue};delete next.revision;const result=appendWorkReport(next,{requestId:value.requestId,performer:job.agent,summary:value.summary,changes:value.changes||'',checks:value.checks||'',links:value.links||[]},actor,now);const response={accepted:true,ticket:job.ticket,company,report:{id:result.entry.id,author:result.entry.content.author},url:origin+'/?view=tickets&product='+company+'&ticket='+job.ticket+'&source=company'};if(result.duplicate)return reply({...response,duplicate:true});next.updatedAt=now;next.history=[...(next.history||[]),{at:now,by:actor.name,author:contributor(actor),action:'Added '+result.entry.content.author.name+' completion report'}].slice(-300);const saved=await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),now,'company_tickets',key,issue.revision).run();if(saved.meta.changes===1)return reply(response,201);issue=await read();continue;}
   const existing=(issue.attachments||[]).find(a=>a.id===value.requestId);
   if(existing)return existing.evidenceHash===digest&&existing.jobId===job.id?reply({accepted:true,duplicate:true,ticket:job.ticket,company,attachment:existing,url:origin+'/?view=tickets&product='+company+'&ticket='+job.ticket+'&source=company'}):reply({error:'Evidence request ID has different content'},409);
   if(issue.attachments.length>=10)return reply({error:'Maximum 10 screenshots per ticket'},409);
   const now=Date.now(),attachment={id:value.requestId,name:image.name,type:image.type,size:image.size,at:now,by:actor.name,source:job.agent,author:contributor(actor),jobId:job.id,caption:value.caption,evidenceHash:digest};
   const next={...issue,updatedAt:now,attachments:[...issue.attachments,attachment],history:[...(issue.history||[]),{at:now,by:actor.name,author:contributor(actor),action:'Attached '+(job.agent==='claude'?'Claude':'Codex')+' completion screenshot '+image.name}].slice(-300)};delete next.revision;
   invalidateHumanReviews(next,actor.name,now,'Screenshot evidence changed');
   const statements=[env.DB.prepare('INSERT INTO documents(collection,id,data_json,updated_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND revision=?)').bind('company_ticket_images',key+':'+attachment.id,JSON.stringify({...image,id:attachment.id}),now,'company_tickets',key,issue.revision),env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),now,'company_tickets',key,issue.revision)];
   const saved=await env.DB.batch(statements);if(saved.at(-1).meta.changes===1)return reply({accepted:true,ticket:job.ticket,company,attachment,url:origin+'/?view=tickets&product='+company+'&ticket='+job.ticket+'&source=company'},201);
   issue=await read();if(!issue)return reply({error:'Ticket no longer exists'},409);
  }
  return reply({error:'Ticket changed while attaching evidence; retry the same request'},409);
 }catch(error){if(error.status)return reply({error:error.message},error.status);throw error;}
}
