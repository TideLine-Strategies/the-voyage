import {syncIntake} from './tideline-intake.js';
const json=(status,data)=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
export async function tidelineSummary(site,crm,days=30){
 days=[7,30,90].includes(Number(days))?Number(days):30;const since=new Date(Date.now()-days*86400000).toISOString();
 const tables=new Set((await rows(site,"SELECT name FROM sqlite_master WHERE type='table'")).map(row=>row.name));
 const receipts=tables.has('crm_intake_receipts'),waitlist=tables.has('loki_waitlist'),conversions=tables.has('conversion_events');
 const [traffic,daily,sections,referrers,audits,inquiries,waitlists,links,pipeline,events]=await Promise.all([
  one(site,"SELECT COUNT(*) events,COUNT(DISTINCT session_id) sessions,COALESCE(SUM(kind='page_view'),0) pageviews FROM site_events WHERE created_at>=?",since),
  rows(site,"SELECT substr(created_at,1,10) day,COUNT(DISTINCT session_id) sessions,COALESCE(SUM(kind='page_view'),0) pageviews FROM site_events WHERE created_at>=? GROUP BY day ORDER BY day",since),
  rows(site,"SELECT page,COUNT(*) events,COUNT(DISTINCT session_id) sessions FROM site_events WHERE created_at>=? AND kind!='page_view' GROUP BY page ORDER BY events DESC",since),
  rows(site,"SELECT referrer_host host,COUNT(*) events FROM site_events WHERE created_at>=? AND kind='page_view' GROUP BY referrer_host ORDER BY events DESC LIMIT 12",since),
  one(site,"SELECT COUNT(*) started,COALESCE(SUM(result_json!=''),0) completed FROM loki_audits WHERE created_at>=?",since),
  rows(site,"SELECT id,submitted_at,name,business,email,phone,message,notification_status FROM contact_inquiries WHERE submitted_at>=? ORDER BY submitted_at DESC LIMIT 200",since),
  waitlist?rows(site,"SELECT phone,submitted_at,consent_version FROM loki_waitlist WHERE submitted_at>=? ORDER BY submitted_at DESC LIMIT 200",since):[],
  rows(crm,"SELECT id,data_json FROM documents WHERE collection='tideline_links' ORDER BY updated_at DESC LIMIT 600"),
  one(crm,"SELECT COUNT(DISTINCT o.id) accounts,COUNT(DISTINCT CASE WHEN CAST(json_extract(o.data_json,'$.stage') AS INTEGER)>0 THEN o.id END) advanced FROM documents o WHERE o.collection='opps' AND EXISTS (SELECT 1 FROM documents l WHERE l.collection='tideline_links' AND json_extract(l.data_json,'$.oppId')=o.id)"),
  conversions?rows(site,"SELECT kind,COUNT(*) events,COUNT(DISTINCT session_id) sessions FROM conversion_events WHERE created_at>=? GROUP BY kind",since):null
 ]);
 const states=receipts?await rows(site,"SELECT * FROM crm_intake_receipts WHERE (kind='contact' AND source_id IN (SELECT id FROM contact_inquiries WHERE submitted_at>=? ORDER BY submitted_at DESC LIMIT 200))"+(waitlist?" OR (kind='waitlist' AND source_id IN (SELECT phone FROM loki_waitlist WHERE submitted_at>=? ORDER BY submitted_at DESC LIMIT 200))":''),...Array(waitlist?2:1).fill(since)):[];
 const linkMap=new Map(links.map(row=>[row.id,JSON.parse(row.data_json)]));
 const stateMap=new Map(states.map(row=>[row.kind+':'+row.source_id,row]));
 const withReceipt=(row,kind)=>{
  const state=stateMap.get(kind+':'+(kind==='contact'?row.id:row.phone));
  const link=kind==='contact'?linkMap.get(row.id):null;
  return {...row,kind,syncStatus:state?.status||(link?'linked':'pending'),oppId:state?.crm_account_id||link?.oppId||null,error:state?.error_code||''};
 };
 const deals=await one(crm,"SELECT COUNT(*) wonDeals,COALESCE(SUM(CAST(json_extract(d.data_json,'$.totals.tcv') AS REAL)),0) contractValue FROM documents d WHERE d.collection='deals' AND json_extract(d.data_json,'$.status')='won' AND EXISTS (SELECT 1 FROM documents l WHERE l.collection='tideline_links' AND json_extract(l.data_json,'$.oppId')=json_extract(d.data_json,'$.oppId'))");
 return {days,since,asOf:new Date().toISOString(),traffic,daily,sections,referrers,audits,conversions:events,inquiries:inquiries.map(row=>withReceipt(row,'contact')),waitlist:waitlists.map(row=>withReceipt(row,'waitlist')),pipeline:{...pipeline,...deals},coverage:{conversionTracking:conversions,crmReceipts:receipts,waitlist,limit:200,eventRetentionDays:90,notes:'Anonymous tab sessions, not unique people. Successful conversion events start at installation, exclude GPC/DNT opt-outs and are not linked to CRM identity. Contact and waitlist are alternative paths; this is not a linear funnel. Retained audit totals exclude deleted sessions. Linked pipeline is all time; contract value is not cash received.'}};
}
export async function handleTideline(request,env,actor,readJson){
 if(actor.role!=='edit')return json(403,{error:'Not available to guests'});
 if(!env.TIDELINE_DB)return json(503,{error:'TideLine analytics is not connected yet.'});
 const url=new URL(request.url);
 try{
  if(url.pathname==='/api/tideline/analytics'&&request.method==='GET')return json(200,await tidelineSummary(env.TIDELINE_DB,env.DB,url.searchParams.get('days')));
  if(url.pathname==='/api/tideline/import'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json(403,{error:'Origin not allowed'});
   const input=await readJson(request);
   if(!input||!['contact','waitlist'].includes(input.kind)||typeof input.id!=='string'||input.id.length>80)return json(400,{error:'Invalid intake source'});
   const result=await syncIntake({CONTACT_DB:env.TIDELINE_DB,CRM_DB:env.DB},input.kind,input.id,actor.id);
   return json(result.status==='linked'?200:result.status==='review'?409:503,{...result,ok:result.status==='linked'});
  }
  return json(405,{error:'Method not allowed'});
 }catch{return json(503,{error:'TideLine analytics unavailable. Check source configuration; saved inquiries remain intact.'});}
}
