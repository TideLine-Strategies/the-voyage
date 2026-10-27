// Product engineering workspace. Original staff reports remain in WonPlace.
const collection='company_tickets', images='company_ticket_images';
const companies=new Set(['tideline','wonplace','loki','voyage']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(v,status=200)=>Response.json(v,{status,headers});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)fail('Invalid or oversized text');return v.trim();};
export function ticketFields(v){
 if(!v||typeof v!=='object'||Array.isArray(v))fail('Invalid ticket');
 const out={};
 for(const [key,max]of Object.entries({title:200,description:12000,assignee:120,steps:8000,expected:4000,actual:4000,environment:1000,labels:300,dueDate:10,links:2000}))if(key in v)out[key]=text(v[key],max);
 if('title'in out&&!out.title)fail('Title is required');
 for(const [key,values]of Object.entries({status:['backlog','open','in_progress','blocked','in_review','resolved'],priority:['urgent','high','normal','low'],type:['bug','feature','task','incident']}))if(key in v){if(!values.includes(v[key]))fail('Invalid '+key);out[key]=v[key];}
 if(out.dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(out.dueDate))fail('Invalid due date');
 if(out.links)for(const link of out.links.split('\n').filter(Boolean)){let u;try{u=new URL(link);}catch{fail('Links must be full HTTPS URLs');}if(u.protocol!=='https:'||u.username||u.password)fail('Links must be HTTPS without credentials');}
 return out;
}
async function readBody(request,max=40000){const reader=request.body?.getReader();if(!reader)fail('Request body required');const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('Request too large',413);}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const v of chunks){bytes.set(v,at);at+=v.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid JSON');}}
export function decodeScreenshot(value){
 const data=text(value.data,1400000),name=text(value.name,150).replace(/[\\/\x00-\x1f]/g,'_');let bytes;try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{fail('Invalid screenshot');}if(!bytes.length||bytes.length>1048576)fail('Screenshots must be 1 MB or smaller',413);
 const start=[...bytes.slice(0,12)],str=String.fromCharCode(...start);let type;
 if(start.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')type='image/png';
 else if(start[0]===255&&start[1]===216&&start[2]===255)type='image/jpeg';
 else if(str.startsWith('RIFF')&&str.slice(8)==='WEBP')type='image/webp';
 else fail('Use PNG, JPEG or WebP screenshots',415);
 return {data,name:name||'screenshot',type,size:bytes.length};
}
export async function handleCompanyTickets(request,env,actor,path){
 if(actor.role!=='edit')return reply({error:'Company tickets are available to editors only.'},403);
 const company=new URL(request.url).searchParams.get('company');if(!companies.has(company))return reply({error:'Choose a valid product'},400);
 const id=path[2],operation=path[3],file=path[4];if((id&&!uuid.test(id))||path.length>5||(operation&&operation!=='attachments')||(file&&!uuid.test(file)))return reply({error:'Not found'},404);
 const stored=company+':',db=env.DB,now=Date.now(),who=String(actor.name||actor.id).slice(0,120);
 const get=async()=>{const row=await db.prepare('SELECT data_json, revision FROM documents WHERE collection=? AND id=?').bind(collection,stored+id).first();return row?{...JSON.parse(row.data_json),revision:row.revision}:null;};
 try{
  if(!id){
   if(request.method==='GET'){const offset=Math.max(0,Math.min(100000,Number(new URL(request.url).searchParams.get('offset'))||0));const {results}=await db.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id LIKE ? ORDER BY updated_at DESC LIMIT 101 OFFSET ?').bind(collection,stored+'%',offset).all();return reply({items:results.slice(0,100).map(r=>({...JSON.parse(r.data_json),revision:r.revision})),nextOffset:results.length>100?offset+100:null});}
   if(request.method!=='POST')return reply({error:'Method not allowed'},405);
   const v=await readBody(request),fields=ticketFields(v);if(!fields.title)fail('Title is required');if(v.sourceId&&(company!=='wonplace'||!uuid.test(v.sourceId)))fail('Invalid source report');
   // Stable workspace ID for an original report prevents duplicate triage tickets.
   const newId=v.sourceId||v.id;if(!uuid.test(newId||''))fail('A valid request ID is required');
   const issue={id:newId,company,code:'ENG-'+newId.slice(0,8).toUpperCase(),status:'open',priority:'normal',type:'bug',...fields,sourceId:v.sourceId||null,createdAt:now,createdBy:who,updatedAt:now,attachments:[],notes:[],history:[{at:now,by:who,action:'Created ticket'}],deleted:false};
   await db.prepare('INSERT OR IGNORE INTO documents (collection,id,data_json,updated_at) VALUES (?,?,?,?)').bind(collection,stored+newId,JSON.stringify(issue),now).run();
   const row=await db.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(collection,stored+newId).first();return reply({issue:{...JSON.parse(row.data_json),revision:row.revision}},201);
  }
  const issue=await get();if(!issue)return reply({error:'Ticket not found'},404);
  if(request.method==='GET'){
   if(!operation)return reply({issue});
   if(!file||issue.deleted||!issue.attachments.some(a=>a.id===file))return reply({error:'Screenshot not found'},404);
   const row=await db.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind(images,stored+id+':'+file).first();if(!row)return reply({error:'Screenshot not found'},404);const image=JSON.parse(row.data_json),bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'content-type':image.type,'cache-control':'private, no-store','content-disposition':'inline; filename="screenshot"','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
  }
  if(!['PATCH','DELETE','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
  const v=await readBody(request,operation?1450000:40000);if(v.expectedRevision!==issue.revision)return reply({error:'This ticket changed. Reload it before saving; your draft has been kept.'},409);
  const next={...issue};delete next.revision;let action,attachment=null;
  if(operation){
   if(issue.deleted)fail('Restore the ticket first',409);
   if(request.method==='POST'&&!file){if(issue.attachments.length>=10)fail('Maximum 10 screenshots per ticket');attachment=decodeScreenshot(v);attachment.id=crypto.randomUUID();next.attachments=[...issue.attachments,{id:attachment.id,name:attachment.name,type:attachment.type,size:attachment.size,at:now,by:who}];action='Attached '+attachment.name;}
   else if(request.method==='DELETE'&&file){if(!issue.attachments.some(a=>a.id===file))fail('Screenshot not found',404);next.attachments=issue.attachments.filter(a=>a.id!==file);action='Removed screenshot';}
   else return reply({error:'Method not allowed'},405);
  }else if(request.method==='DELETE'){next.deleted=true;action='Moved to trash';}
  else if(request.method==='PATCH'){
   if(issue.deleted&&v.restore!==true)fail('Restore the ticket first',409);
   const fields=ticketFields(v);Object.assign(next,fields);const changed=Object.keys(fields).filter(k=>issue[k]!==fields[k]);action=changed.length?'Updated '+changed.join(', '):'Updated ticket';
   if(v.restore===true){next.deleted=false;action='Restored ticket';}
   if(v.note!==undefined){const body=text(v.note,6000);if(!body)fail('Note is empty');if(issue.notes.length>=200)fail('Maximum 200 notes; use a linked document for more');next.notes=[...issue.notes,{id:crypto.randomUUID(),at:now,by:who,body}];action='Added note';}
  }else return reply({error:'Method not allowed'},405);
  next.updatedAt=now;next.history=[...issue.history,{at:now,by:who,action}].slice(-300);
  const statements=[];
  // Conditional child writes and parent revision update share one atomic D1 batch.
  if(attachment)statements.push(db.prepare('INSERT INTO documents (collection,id,data_json,updated_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND revision=?)').bind(images,stored+id+':'+attachment.id,JSON.stringify(attachment),now,collection,stored+id,issue.revision));
  if(operation&&request.method==='DELETE')statements.push(db.prepare('DELETE FROM documents WHERE collection=? AND id=? AND EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND revision=?)').bind(images,stored+id+':'+file,collection,stored+id,issue.revision));
  statements.push(db.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(next),now,collection,stored+id,issue.revision));
  const results=await db.batch(statements);if(results.at(-1).meta.changes!==1)return reply({error:'This ticket changed. Reload before saving; your draft has been kept.'},409);
  return reply({issue:{...next,revision:issue.revision+1}});
 }catch(error){if(error.status)return reply({error:error.message},error.status);throw error;}
}
