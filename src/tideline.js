const json=(status,data)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const text=(x,n=300)=>String(x??'').trim().slice(0,n);
export async function tidelineSummary(site,crm,days=30){
  days=[7,30,90].includes(Number(days))?Number(days):30;
  const since=new Date(Date.now()-days*86400000).toISOString();
  const [traffic,daily,sections,referrers,audits,operators,moves,inquiries,links,pipeline]=await Promise.all([
    one(site,"SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, SUM(kind='page_view') AS pageviews, MIN(created_at) AS first_event FROM site_events WHERE created_at>=?",since),
    rows(site,"SELECT substr(created_at,1,10) AS day, COUNT(DISTINCT session_id) AS sessions, SUM(kind='page_view') AS pageviews FROM site_events WHERE created_at>=? GROUP BY day ORDER BY day",since),
    rows(site,"SELECT page, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions FROM site_events WHERE created_at>=? AND kind!='page_view' GROUP BY page ORDER BY events DESC",since),
    rows(site,"SELECT referrer_host AS host,COUNT(*) AS events FROM site_events WHERE created_at>=? AND kind='page_view' GROUP BY referrer_host ORDER BY events DESC LIMIT 12",since),
    one(site,"SELECT COUNT(*) AS started,SUM(result_json!='') AS completed FROM loki_audits WHERE created_at>=?",since),
    one(site,"SELECT COUNT(*) AS started FROM loki_operators WHERE created_at>=?",since),
    one(site,"SELECT COUNT(*) AS total,SUM(status='done') AS done,SUM(status='skipped') AS skipped,SUM(status='open') AS open FROM loki_moves WHERE created_at>=?",since),
    rows(site,"SELECT id,submitted_at,name,business,email,phone,message,notification_status FROM contact_inquiries WHERE submitted_at>=? ORDER BY submitted_at DESC LIMIT 200",since),
    rows(crm,"SELECT id,json_extract(data_json,'$.oppId') AS oppId FROM documents WHERE collection='tideline_links'"),
    one(crm,"SELECT COUNT(DISTINCT o.id) AS accounts,COUNT(DISTINCT CASE WHEN CAST(json_extract(o.data_json,'$.stage') AS INTEGER)>0 THEN o.id END) AS advanced FROM documents o WHERE o.collection='opps' AND EXISTS (SELECT 1 FROM documents l WHERE l.collection='tideline_links' AND json_extract(l.data_json,'$.oppId')=o.id)")
  ]);
  const linked=new Map(links.map(l=>[l.id,l.oppId]));
  const deals=await one(crm,"SELECT COUNT(*) AS wonDeals,COALESCE(SUM(CAST(json_extract(d.data_json,'$.totals.tcv') AS REAL)),0) AS contractValue FROM documents d WHERE d.collection='deals' AND json_extract(d.data_json,'$.status')='won' AND EXISTS (SELECT 1 FROM documents l WHERE l.collection='tideline_links' AND json_extract(l.data_json,'$.oppId')=json_extract(d.data_json,'$.oppId'))");
  return {days,since,asOf:new Date().toISOString(),traffic,daily,sections,referrers,audits,operators,moves,pipeline:{...pipeline,...deals},inquiries:inquiries.map(i=>({...i,oppId:linked.get(i.id)||null})),coverage:{eventRetentionDays:90,auditRetentionDays:30,inquiriesLimitedTo:200,notes:'Visits are anonymous tab sessions, not unique people. Traffic starts at installation and excludes privacy opt-outs. Audit/app totals count retained records; deleted sessions are excluded. Pipeline totals cover all linked accounts, independent of the period.'}};
}
export async function importInquiry(site,crm,id,actor){
  if(!/^[0-9a-f-]{36}$/i.test(id))return {status:400,error:'Invalid inquiry'};
  const lead=await one(site,'SELECT id,submitted_at,name,business,email,phone,message FROM contact_inquiries WHERE id=?',id);
  if(!lead)return {status:404,error:'Inquiry not found'};
  const linked=await one(crm,"SELECT data_json FROM documents WHERE collection='tideline_links' AND id=?",id);
  if(linked)return {status:200,...JSON.parse(linked.data_json),created:false};
  const email=text(lead.email,180).toLowerCase();
  const matches=await rows(crm,"SELECT id,data_json FROM documents WHERE collection='contacts' AND lower(trim(json_extract(data_json,'$.email')))=? LIMIT 3",email);
  const accounts=[...new Set(matches.map(c=>JSON.parse(c.data_json).oppId).filter(Boolean))];
  if(accounts.length>1)return {status:409,error:'This email belongs to multiple CRM accounts. Resolve that duplicate before importing.'};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));
  const key=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
  const oppId=accounts[0]||'tideline-'+key;
  const old=await one(crm,"SELECT data_json FROM documents WHERE collection='opps' AND id=?",oppId);
  if(accounts.length&&!old)return {status:409,error:'The matching contact has a missing CRM account. Repair that record first.'};
  const stamp=Date.now(),date=new Date(stamp).toISOString().slice(0,10);
  const name=old?JSON.parse(old.data_json).name:text(lead.business,180);
  const account={name,city:'',stage:0,rank:null,owner:actor.id,next:{label:'Follow up on website inquiry',date},verification:'Unverified',website:'',linkedin:'',employees:'',needs:'',cms:'',source:'Website or inbound',sourceNote:'TideLine contact form',notes:'',bio:'',address:'',address2:'',state:'',zip:'',locations:[],lastTouch:date,stageTs:stamp};
  const contact={oppId,name:text(lead.name,180),email,phone:text(lead.phone,80),title:'',primary:!matches.length,createdTs:stamp,updatedTs:stamp};
  const note={oppId,oppName:name,text:text(lead.message,2000),type:'Website inquiry',date:text(lead.submitted_at,10),by:actor.id,ts:stamp};
  const link={oppId,submittedAt:lead.submitted_at,importedBy:actor.id,importedAt:stamp};
  const insert=(collection,key,value)=>crm.prepare('INSERT OR IGNORE INTO documents (collection,id,data_json,updated_at) VALUES (?,?,?,?)').bind(collection,key,JSON.stringify(value),stamp);
  const batch=[];if(!old)batch.push(insert('opps',oppId,account));
  if(!matches.length)batch.push(insert('contacts','tideline-'+key,contact));
  batch.push(insert('notes','tideline-'+id,note),insert('tideline_links',id,link));
  const results=await crm.batch(batch);
  return {status:200,...link,created:results.at(-1).meta?.changes===1};
}
export async function handleTideline(request,env,actor,readJson){
  if(actor.role!=='edit')return json(403,{error:'Not available to guests'});
  if(!env.TIDELINE_DB)return json(503,{error:'TideLine analytics is not connected yet.'});
  const path=new URL(request.url).pathname;
  try{
    if(path==='/api/tideline/analytics'&&request.method==='GET')return json(200,await tidelineSummary(env.TIDELINE_DB,env.DB,new URL(request.url).searchParams.get('days')));
    if(path==='/api/tideline/import'&&request.method==='POST'){
      const data=await readJson(request);const result=await importInquiry(env.TIDELINE_DB,env.DB,text(data.id,36),actor);const {status,...body}=result;return json(status,body);
    }
    return json(405,{error:'Method not allowed'});
  }catch(error){console.error('TideLine analytics failed',error.message);return json(503,{error:'TideLine analytics could not load. Check the database binding and migration; retry without changing CRM records.'});}
}
