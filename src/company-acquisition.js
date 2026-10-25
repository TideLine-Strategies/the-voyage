// Aggregate source receipts and CRM links; never join anonymous browsing to a person.
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
export function linkedPipeline(links,accounts,deals){
 const ids=new Set(links.map(l=>l.oppId).filter(Boolean));
 const linked=accounts.filter(a=>ids.has(a.id));
 const stages=Array.from({length:7},(_,stage)=>({stage,accounts:linked.filter(a=>a.stage===stage).length}));
 const won=deals.filter(d=>d.status==='won'&&ids.has(d.oppId));
 const currencyTotals=new Map();
 for(const d of won){const amount=d.totals?.tcv;if(Number.isFinite(amount)&&typeof d.currency==='string')currencyTotals.set(d.currency,(currencyTotals.get(d.currency)||0)+amount);}
 return {linkedAccounts:linked.length,missingLinkedAccounts:[...ids].filter(id=>!linked.some(a=>a.id===id)).length,stages,wonDeals:won.length,contractValueByCurrency:[...currencyTotals].map(([currency,value])=>({currency,value}))};
}
export async function acquisitionReport(env,now=Date.now()){
 const asOf=new Date(now).toISOString(),since=new Date(now-30*86400000).toISOString();
 if(!env.TIDELINE_DB)return {status:'unavailable',asOf,error:'Website source is not configured'};
 try{
  const db=env.TIDELINE_DB;
  const tables=new Set((await rows(db,"SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name));
  const has=table=>tables.has(table);
  const intake=async(kind,table,time)=>{
   if(!has(table))return {kind,status:'unavailable',submitted:null,sync:null};
   const count=await one(db,`SELECT COUNT(*) total FROM ${table} WHERE ${time}>=?`,since);
   let sync=null;
   if(has('crm_intake_receipts'))sync=await rows(db,`SELECT COALESCE(r.status,'pending') status,COUNT(*) total FROM ${table} s LEFT JOIN crm_intake_receipts r ON r.kind=? AND r.source_id=s.${kind==='contact'?'id':'phone'} WHERE s.${time}>=? GROUP BY COALESCE(r.status,'pending')`,kind,since);
   return {kind,status:'connected',submitted:count.total,sync};
  };
  const [contacts,waitlist,traffic,conversions,documents]=await Promise.all([
   intake('contact','contact_inquiries','submitted_at'),intake('waitlist','loki_waitlist','submitted_at'),
   has('site_events')?one(db,"SELECT COUNT(DISTINCT session_id) sessions,COALESCE(SUM(kind='page_view'),0) pageviews FROM site_events WHERE created_at>=?",since):null,
   has('conversion_events')?rows(db,'SELECT kind,COUNT(*) events,COUNT(DISTINCT session_id) sessions FROM conversion_events WHERE created_at>=? GROUP BY kind',since):null,
   rows(env.DB,"SELECT collection,id,data_json FROM documents WHERE collection IN ('tideline_links','opps','deals') LIMIT 10001")
  ]);
  if(documents.length>10000)throw Error('CRM report limit reached');
  const parsed=documents.map(d=>({collection:d.collection,id:d.id,...JSON.parse(d.data_json)}));
  const pipeline=linkedPipeline(parsed.filter(d=>d.collection==='tideline_links'),parsed.filter(d=>d.collection==='opps'),parsed.filter(d=>d.collection==='deals'));
  return {status:'connected',asOf,since,days:30,traffic,contacts,waitlist,conversions,pipeline,coverage:'Submissions and anonymous events cover the last 30 days. Contact and waitlist are alternative paths, not sequential funnel steps. Anonymous events are not linked to CRM identity. CRM stages and linked won deals are all-time current records. Contract value is not received cash. Consent stays inquiry-response or Loki launch only.'};
 }catch{return {status:'unavailable',asOf,error:'Acquisition source read failed; unknown is not zero'};}
}
