// Website-owned lead intake. Keep this module identical to Voyage's tideline-intake.js.
// Original source rows are the durable queue; receipts never replace the original inquiry.
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const phone=value=>{const raw=String(value||'').trim();if(!/^[+\d\s().-]+$/.test(raw)||raw.length>40)return '';let d=raw.replace(/\D/g,'');if(!raw.startsWith('+')&&d.length===10)d='1'+d;if(!raw.startsWith('+')&&!(d.length===11&&d.startsWith('1')))return '';if(!/^[1-9]\d{7,14}$/.test(d))return '';return '+'+d;};
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const data=row=>row?JSON.parse(row.data_json):null;
async function receipt(db,kind,id,status,contactId=null,oppId=null,error=''){
 await db.prepare('INSERT INTO crm_intake_receipts (kind,source_id,status,crm_contact_id,crm_account_id,last_attempt_at,error_code) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kind,source_id) DO UPDATE SET status=excluded.status,crm_contact_id=excluded.crm_contact_id,crm_account_id=excluded.crm_account_id,last_attempt_at=excluded.last_attempt_at,error_code=excluded.error_code').bind(kind,id,status,contactId,oppId,new Date().toISOString(),error).run();
 return {status,contactId,oppId,error};
}
export async function syncIntake(env,kind,id,owner='CK'){
 const db=env.CONTACT_DB,crm=env.CRM_DB;
 if(!db||!crm)return {status:'pending',error:'crm_unavailable'};
 if(!['contact','waitlist'].includes(kind))return {status:'review',error:'invalid_source'};
 try {
  const lead=await one(db,kind==='contact'?'SELECT * FROM contact_inquiries WHERE id=?':'SELECT * FROM loki_waitlist WHERE phone=?',id);
  if(!lead)return {status:'review',error:'source_not_found'};
  const linkId=kind==='contact'?id:'waitlist:'+ (await digest(id)).slice(0,32);
  const linked=data(await one(crm,"SELECT data_json FROM documents WHERE collection='tideline_links' AND id=?",linkId));
  if(linked?.oppId){
   if(!await one(crm,"SELECT id FROM documents WHERE collection='opps' AND id=?",linked.oppId))return receipt(db,kind,id,'review',null,null,'linked_account_missing');
   return receipt(db,kind,id,'linked',linked.contactId||null,linked.oppId);
  }
  const email=kind==='contact'?String(lead.email).trim().toLowerCase():'';
  const normalized=phone(lead.phone);
  if((kind==='contact'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(kind==='waitlist'&&!normalized))return receipt(db,kind,id,'review',null,null,'invalid_identity');
  const matches=email?await rows(crm,"SELECT id,data_json FROM documents WHERE collection='contacts' AND lower(trim(json_extract(data_json,'$.email')))=? LIMIT 4",email):[];
  // Phone-only matching is deliberately exact and accepts only a normalized stored number.
  const byPhone=normalized?await rows(crm,"SELECT id,data_json FROM documents WHERE collection='contacts' AND json_extract(data_json,'$.phone')=? LIMIT 4",normalized):[];
  const all=[...new Map([...matches,...byPhone].map(row=>[row.id,row])).values()];
  const accounts=[...new Set(all.map(row=>data(row).oppId).filter(Boolean))];
  if(all.length>=4||accounts.length>1||all.some(row=>!data(row).oppId))return receipt(db,kind,id,'review',null,null,'ambiguous_identity');
  const key=(await digest(email||'phone:'+normalized)).slice(0,32);
  const oppId=accounts[0]||(email?'loki-account-':'inbound-')+key;
  const old=await one(crm,"SELECT id,data_json FROM documents WHERE collection='opps' AND id=?",oppId);
  if(accounts.length&&!old)return receipt(db,kind,id,'review',null,null,'account_missing');
  const contactId=(matches[0]||byPhone[0])?.id||(email?'loki-contact-':'inbound-')+key;
  const now=Date.now(),date=new Date(now).toISOString().slice(0,10);
  const source=kind==='contact'?'TideLine contact form':'Loki launch waitlist';
  const consent=kind==='contact'?'Requested a response to this inquiry; not general marketing consent.':'Launch-notification consent only. No signup text sent; not general outreach consent.';
  const name=old?data(old).name:kind==='contact'?lead.business:'Loki waitlist signup';
  const account={name,stage:0,owner,next:{label:kind==='contact'?'Follow up on website inquiry':'Notify when Loki launches',date:kind==='contact'?date:''},verification:'Unverified',source:'Website or inbound',sourceNote:source,createdTs:now,stageTs:now,notes:consent};
  const contact={oppId,name:kind==='contact'?lead.name:'Loki waitlist signup',email,phone:normalized||lead.phone||'',role:'Other',title:'',primary:true,source,sourceNote:consent,consent:kind==='waitlist'?{purpose:'loki-launch',version:lead.consent_version,at:lead.submitted_at}:{purpose:'inquiry-response',at:lead.submitted_at},createdTs:now};
  const note={oppId,oppName:name,contactId,type:'Website inquiry',title:source,date:lead.submitted_at.slice(0,10),text:[source,consent,kind==='contact'?lead.name+' · '+lead.email+' · '+lead.phone:'Phone: '+lead.phone,kind==='contact'?lead.message:'Notify this number when Loki launches.'].join('\n'),by:'Website intake',createdTs:now,ts:now};
  const link={kind,sourceId:linkId,oppId,contactId,submittedAt:lead.submitted_at,importedAt:now,importedBy:'Website intake'};
  const insert=(collection,id,value)=>crm.prepare('INSERT OR IGNORE INTO documents (collection,id,data_json,updated_at) VALUES (?,?,?,?)').bind(collection,id,JSON.stringify(value),now);
  const statements=[];
  if(!old)statements.push(insert('opps',oppId,account));
  if(!all.length)statements.push(insert('contacts',contactId,contact));
  statements.push(insert('notes','tideline-'+linkId,note),insert('tideline_links',linkId,link));
  await crm.batch(statements);
  // Read back the winning immutable link after concurrent requests; never overwrite staff edits.
  const winner=data(await one(crm,"SELECT data_json FROM documents WHERE collection='tideline_links' AND id=?",linkId));
  return receipt(db,kind,id,'linked',winner.contactId||null,winner.oppId);
 }catch{
  try{return await receipt(db,kind,id,'pending',null,null,'crm_sync_failed');}catch{return {status:'pending',error:'crm_sync_failed'};}
 }
}
export async function reconcileIntakes(env){
 const pending=await rows(env.CONTACT_DB,"SELECT 'contact' kind,c.id source_id FROM contact_inquiries c LEFT JOIN crm_intake_receipts r ON r.kind='contact' AND r.source_id=c.id WHERE r.status IS NULL OR r.status='pending' UNION ALL SELECT 'waitlist',w.phone FROM loki_waitlist w LEFT JOIN crm_intake_receipts r ON r.kind='waitlist' AND r.source_id=w.phone WHERE r.status IS NULL OR r.status='pending' LIMIT 20");
 for(const row of pending)await syncIntake(env,row.kind,row.source_id);
 return {checked:pending.length};
}
export async function recordConversion(env,request,context,kind,source){
 if(!['audit_started','audit_saved','contact_submitted','waitlist_joined'].includes(kind))return;
 if(request.headers.get('sec-gpc')==='1'||request.headers.get('dnt')==='1')return;
 if(!context||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.session)||!['phone','tablet','desktop'].includes(context.device))return;
 try{await env.CONTACT_DB.prepare('INSERT OR IGNORE INTO conversion_events (id,created_at,kind,session_id,device) VALUES (?,?,?,?,?)').bind(await digest(kind+':'+source),new Date().toISOString(),kind,context.session,context.device).run();}catch{/* Intake succeeds even when anonymous measurement is unavailable. */}
}
