import {socialSnapshot,saveSocial,readSocial,socialAttempt,saveSocialAttempt} from './company-social.js';
import {startTrakrConnection,disconnectTrakr} from './company-trakr.js';
import {acquisitionReport} from './company-acquisition.js';
import {buildCockpit,cockpitSettings,measurement,providerMeasurements} from './company-metrics.js';
import {startGA4Connection} from './company-ga4-auth.js';
import {readGA4} from './company-ga4.js';
import {COMPANIES} from './company-events.js';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const identifier=/^[a-zA-Z0-9_.:-]{1,100}$/;
export function companyStub(env,company) {return env.COMPANY_HUB?.get(env.COMPANY_HUB.idFromName(company));}
export {signedHeaders,verifySource} from './company-signing.js';
import {signedHeaders,verifySource} from './company-signing.js';
export function safeLink(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Use an HTTPS source link without credentials or query parameters');
  return url.toString();
}
export function financialRecord(data) {
  if(![...Object.keys(COMPANIES),'tideline-other'].includes(data.product)||(data.brand!==undefined&&data.brand!=='tideline'))throw Error('Only TideLine brand financial records are allowed');
  const kinds=['bill','expense','revenue'],statuses=['due','paid','received','expected'];
  if(!kinds.includes(data.kind)||!statuses.includes(data.status)||!Number.isSafeInteger(data.amountCents)||data.amountCents<=0||data.amountCents>100000000000||!/^[A-Z]{3}$/.test(data.currency||'')||!/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||new Date(data.date+'T00:00:00Z').toISOString().slice(0,10)!==data.date)throw Error('Invalid financial record');
  if(data.kind==='revenue'?!['received','expected'].includes(data.status):!['due','paid'].includes(data.status))throw Error('Invalid financial status');
  if(!['once','monthly','quarterly','yearly'].includes(data.recurrence||'once'))throw Error('Invalid recurrence');
  const label=String(data.label||'').trim();if(!label||label.length>160)throw Error('A label is required');
  return {brand:'tideline',product:data.product,kind:data.kind,status:data.status,amountCents:data.amountCents,currency:data.currency,date:data.date,label,recurrence:data.recurrence||'once',source:'manual',reference:data.reference?safeLink(data.reference):null};
}
async function records(db,company,type) {return (await db.prepare('SELECT id,revision,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 500').bind(`company_${company}_${type}`).all()).results.map(row=>({id:row.id,revision:row.revision,...JSON.parse(row.data_json)}));}
async function store(env,company,type,id,value,actor,expectedRevision) {
  const collection=`company_${company}_${type}`;
  const prior=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(collection,id).first();
  if(type==='financials'&&prior){
    const old=JSON.parse(prior.data_json),normalized=Object.fromEntries(Object.entries(old).filter(([key])=>!['updatedAt','updatedBy','id'].includes(key)));
    if(JSON.stringify(normalized)===JSON.stringify(value))return prior.revision;
    if(actor.id==='signed-source'&&old.updatedBy!=='signed-source')throw Error('Imported record was manually edited; reconcile it before replacing');
    if(actor.id!=='signed-source'&&Number(expectedRevision)!==prior.revision)throw Error('Financial record changed; refresh before editing');
    if(old.product!==value.product)throw Error('Keep the original product when editing a financial record');
  }
  const serialized=JSON.stringify({...value,updatedBy:actor.id,updatedAt:Date.now()});
  const result=prior?await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(serialized,Date.now(),collection,id,prior.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?)').bind(collection,id,serialized,Date.now()).run();
  if(!result.meta.changes)throw Error('Record changed; refresh before saving');
  return (prior?.revision||0)+1;
}
export async function companySummary(env,company,includeHistory=false) {
  const [connections,financials,providers,live,settings,social]=await Promise.all([records(env.DB,company,'connections'),records(env.DB,'tideline','financials'),records(env.DB,company,'providers'),companyStub(env,company)?.snapshot(includeHistory)||null,records(env.DB,company,'cockpit'),readSocial(env,company)]);
  return {social,cockpit:settings.find(s=>s.id==='settings')||null,company,name:COMPANIES[company],brand:'tideline',connections,financials:financials.filter(row=>row.product===company),brandFinancials:financials,providers,live,asOf:Date.now(),financialCoverage:'TideLine brand only: WonPlace, TideLine, Loki and Voyage. Records are tagged by product; personal projects and other entities are excluded. Business records entered here only. No bank or payment-provider reconciliation is connected. Expected revenue is not received revenue. Gym tuition and family balances are excluded.'};
}
export async function companyContext(env,actor) {
  const summaries=await Promise.all(Object.keys(COMPANIES).map(async company=>{
    try{const data=await companySummary(env,company);return {company,chiefAim:data.cockpit?.aim,focus:data.cockpit?.focus,thresholds:data.cockpit?.rules,asOf:data.asOf,social:data.social?.latest?{status:data.social.status,baseline:data.social.baseline,account:data.social.latest.account,overview:data.social.latest.overview,growth:data.social.growth,coverage:data.social.latest.coverage}:data.social,providers:data.providers,financials:data.financials.slice(0,30),live:data.live?{asOf:data.live.asOf,activeUsers:data.live.activeUsers,events:data.live.events.slice(0,15),coverage:data.live.coverage}:null,financialCoverage:data.financialCoverage};}catch{return {company,status:'unavailable'};}
  }));
  const sections=summaries.map(data=>JSON.stringify(data).slice(0,5000));
  if(actor){for(const [label,read]of [['WONPLACE SOURCE DIAGNOSTICS',()=>wonplaceDiagnostics(env,actor)],['TIDELINE WEBSITE ANALYTICS',()=>tidelineAnalytics(env)],['LOKI ANALYTICS',()=>lokiAnalytics(env)]]){try{const response=await read();sections.push(label+' '+JSON.stringify(await response.json()).slice(0,5000));}catch{sections.push(label+' unavailable');}}}
  return '\n\nTIDELINE COMPANY OPERATIONS (separate product scopes; check asOf and checkedAt; links are not API connections; expected revenue is not received; personal projects and other entities excluded):\n'+sections.join('\n');
}
export async function handleCompany(request,env,actor,path,readJson) {
  if(actor.role!=='edit')return reply({error:'Company operations are available to editors only'},403);
  const company=path[2],operation=path[3];if(!Object.hasOwn(COMPANIES,company))return reply({error:'Company not found'},404);
  if(path.length>4)return reply({error:'Not found'},404);
  if(request.method==='GET'&&!operation)return reply(await companySummary(env,company));
  if(request.method==='GET'&&operation==='metrics'){const [summary,source,finance,acquisition]=await Promise.all([companySummary(env,company,true),companySource(env,company,actor),env.COMPANY_HUB?companyStub(env,'tideline-finance').trakrReport():null,company==='tideline'?acquisitionReport(env):null]);summary.acquisition=acquisition;if(finance?.status==='connected')summary.financials=finance.financials.filter(r=>r.product===company);return reply(buildCockpit(summary,await source.json(),summary.live?.measurements||[]));}
  if(request.method==='PUT'&&operation==='cockpit'){try{const value=cockpitSettings(await readJson(request));await store(env,company,'cockpit','settings',value,actor);return reply(value);}catch(error){return reply({error:error.message},400);}}
  if(request.method==='GET'&&operation==='live') {
    if(!env.COMPANY_HUB)return reply({error:'Live stream is not configured'},503);
    if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin not allowed'},403);
    return companyStub(env,company).fetch(request);
  }
  if(request.method==='POST'&&operation==='trakr-connect')return company==='tideline'?startTrakrConnection(request,env,actor):reply({error:'Not found'},404);
  if(request.method==='POST'&&operation==='trakr-disconnect')return company==='tideline'?disconnectTrakr(request,env,actor):reply({error:'Not found'},404);
  if(request.method==='GET'&&operation==='trakr')return company==='tideline'&&env.COMPANY_HUB?reply(await companyStub(env,'tideline-finance').trakrReport()):reply({error:'Not found'},404);
  if(request.method==='POST'&&operation==='ga4-connect')return company==='tideline'?startGA4Connection(request,env,actor):reply({error:'Not found'},404);
  if(request.method==='GET'&&operation==='social')return company==='wonplace'?reply(await readSocial(env,company)):reply({error:'TikTok account belongs to WonPlace'},404);
  if(request.method==='GET'&&operation==='ga4')return company==='tideline'?reply(await readGA4(env)):reply({error:'GA4 reports belong to the TideLine website'},404);
  if(request.method==='GET'&&operation==='acquisition')return company==='tideline'?reply(await acquisitionReport(env)):reply({error:'Acquisition belongs to TideLine'},404);
  if(request.method==='GET'&&operation==='source')return companySource(env,company,actor);
  if(request.method==='PUT'&&['connections','financials'].includes(operation)) {
    const data=await readJson(request);if(!identifier.test(data.id||''))return reply({error:'A stable record ID is required'},400);
    try {
      let value;
      if(operation==='connections') {
        if(!['github','cloudflare','ai','billing','revenue','other'].includes(data.provider))throw Error('Choose a supported source');
        if(!String(data.label||'').trim()||String(data.label).length>100)throw Error('A source label is required');
        value={provider:data.provider,label:data.label,url:safeLink(data.url),status:'linked',coverage:'Navigation link only; no API synchronization or provider billing access is configured.'};
      } else value=financialRecord(data);
      const revision=await store(env,operation==='financials'?'tideline':company,operation,data.id,value,actor,data.expectedRevision);return reply({id:data.id,revision,...value});
    }catch(error){return reply({error:error.message},400);}
  }
  return reply({error:'Method not allowed'},405);
}
async function companySource(env,company,actor){return company==='tideline'?tidelineAnalytics(env):company==='wonplace'?wonplaceSource(env,actor):company==='loki'?lokiAnalytics(env):voyageAnalytics(env);}
export function providerSnapshot(value) {
  if(!value||!['github','cloudflare','ai','billing','revenue'].includes(value.provider)||!['ok','unavailable'].includes(value.status))throw Error('Invalid provider snapshot');
  if(typeof value.resource!=='string'||value.resource.length>200||!value.resource.trim())throw Error('Provider resource is required');
  const metrics={};for(const [key,amount]of Object.entries(value.metrics||{})){
    if(!/^[a-zA-Z][a-zA-Z0-9_]{0,50}$/.test(key)||!Number.isFinite(amount)||amount<0)throw Error('Invalid provider metric');metrics[key]=amount;
  }
  if(Object.keys(metrics).length>30)throw Error('Too many metrics');
  return {provider:value.provider,resource:value.resource,status:value.status,metrics,url:value.url?safeLink(value.url):null,checkedAt:Date.now(),coverage:String(value.coverage||'').slice(0,500)};
}
export async function ingestCompany(request,env,readJson) {
  const company=new URL(request.url).pathname.split('/')[3];
  if(!['GET','POST'].includes(request.method)||!Object.hasOwn(COMPANIES,company))return reply({error:'Not found'},404);
  if(request.method==='GET'){
    const secret=({wonplace:env.WONPLACE_OPERATIONS_SECRET,tideline:env.TIDELINE_OPERATIONS_SECRET,loki:env.LOKI_OPERATIONS_SECRET,voyage:env.VOYAGE_OPERATIONS_SECRET})[company];
    if(!await verifySource(request,secret,''))return reply({error:'Source authentication required'},401);
    if(!env.COMPANY_HUB)return reply({error:'Live stream is not configured'},503);
    return reply({company,live:await companyStub(env,company).snapshot(),providers:await records(env.DB,company,'providers'),social:await readSocial(env,company)});
  }
  let data;try{data=await readJson(request);}catch{return reply({error:'Invalid event batch'},400);}
  const secret=({wonplace:env.WONPLACE_OPERATIONS_SECRET,tideline:env.TIDELINE_OPERATIONS_SECRET,loki:env.LOKI_OPERATIONS_SECRET,voyage:env.VOYAGE_OPERATIONS_SECRET})[company];
  if(!await verifySource(request,secret,JSON.stringify(data)))return reply({error:'Source authentication required'},401);
  if(!Array.isArray(data.events)||data.events.length>20||!Array.isArray(data.providers||[])||(data.providers||[]).length>10||!Array.isArray(data.financials||[])||(data.financials||[]).length>50||!Array.isArray(data.measurements||[])||(data.measurements||[]).length>100)return reply({error:'Invalid source batch'},400);
  if(!env.COMPANY_HUB)return reply({error:'Live stream is not configured'},503);
  try {
    const social=data.social?socialSnapshot(data.social):null,attempt=data.socialAttempt?socialAttempt(data.socialAttempt):null;if(social&&attempt)throw Error('Ambiguous social input');if((social||attempt)&&company!=='wonplace')throw Error('Wrong social company');
    const providers=(data.providers||[]).map(providerSnapshot);
    const measurements=[...(data.measurements||[]).map(value=>measurement(value)),...providers.flatMap(providerMeasurements)];
    const financials=(data.financials||[]).map(value=>{if(!identifier.test(value.id||''))throw Error('Invalid financial ID');return {id:value.id,...financialRecord(value),source:'signed-import'};});
    const accepted=await companyStub(env,company).ingest(data.events,measurements);
    if(social)await saveSocial(env,company,data.social);if(attempt)await saveSocialAttempt(env,company,attempt);
    for(const provider of providers)await store(env,company,'providers',provider.provider,provider,{id:'signed-source'});
    for(const financial of financials){const {id,...value}=financial;await store(env,'tideline','financials',id,value,{id:'signed-source'});}
    return reply({...accepted,providers:providers.length,financials:financials.length,social:social?{handle:social.handle,observedAt:social.observedAt}:null});
  }catch{return reply({error:'Invalid company source batch or storage unavailable'},400);}
}
async function wonplaceDiagnostics(env,actor) {
  if(!env.WONPLACE_TICKETS_ORIGIN||!env.WONPLACE_TICKETS_SECRET)return reply({connected:false,error:'WonPlace source credentials are not configured'},503);
  try {
    const origin=new URL(safeLink(env.WONPLACE_TICKETS_ORIGIN));if(origin.pathname!=='/')throw Error();
    const url=new URL('/api/integrations/voyage/operations',origin).toString();
    const response=await fetch(url,{headers:await signedHeaders(env.WONPLACE_TICKETS_SECRET,'GET',url,actor.id),redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return reply({connected:false,error:'WonPlace source access is unavailable'},503);
    return reply({company:'wonplace',connected:true,...await response.json()});
  }catch{return reply({connected:false,error:'WonPlace source is unavailable'},503);}
}
async function websiteAnalytics(env,company='tideline') {
  if(!env.TIDELINE_DB)return reply({connected:false,error:'TideLine analytics database is not connected'},503);
  try {
    const since=new Date(Date.now()-30*86400000).toISOString();
    const table=company==='wonplace'?'wonplace_site_events':'site_events';
    const query=async(sql)=>(await env.TIDELINE_DB.prepare(sql.replaceAll('site_events',table)).bind(since).all()).results;
    const [traffic,pages,daily]=await Promise.all([query("SELECT COUNT(*) events,COUNT(DISTINCT session_id) sessions,SUM(kind='page_view') pageviews FROM site_events WHERE created_at>=?"),query('SELECT page,COUNT(*) events FROM site_events WHERE created_at>=? GROUP BY page ORDER BY events DESC LIMIT 30'),query("SELECT substr(created_at,1,10) day,COUNT(*) events,COUNT(DISTINCT session_id) sessions,SUM(kind='page_view') pageviews FROM site_events WHERE created_at>=? GROUP BY day ORDER BY day")]);
    return reply({company,connected:true,asOf:Date.now(),since,traffic:traffic[0],pages,daily,coverage:`Anonymous ${company} marketing website sessions over 30 days; not identified app users. Collected page events only; privacy opt-outs excluded.`});
  }catch{return reply({connected:false,error:'TideLine analytics is unavailable'},503);}
}

async function tidelineAnalytics(env){return websiteAnalytics(env,'tideline');}
async function wonplaceSource(env,actor){
 const [appResponse,marketingResponse]=await Promise.all([wonplaceDiagnostics(env,actor),websiteAnalytics(env,'wonplace')]);
 const [app,marketing]=await Promise.all([appResponse.json(),marketingResponse.json()]);
 return reply({...app,company:'wonplace',marketing});
}

async function lokiAnalytics(env) {
  if(!env.TIDELINE_DB)return reply({connected:false,error:'Loki database is not connected'},503);
  try {
    const since=new Date(Date.now()-30*86400000).toISOString();
    const one=(sql)=>env.TIDELINE_DB.prepare(sql).bind(since).first();
    const [audits,operators,moves]=await Promise.all([one("SELECT COUNT(*) started,SUM(result_json!='') completed FROM loki_audits WHERE created_at>=?"),one('SELECT COUNT(*) started FROM loki_operators WHERE created_at>=?'),one("SELECT COUNT(*) total,SUM(status='done') done,SUM(status='skipped') skipped,SUM(status='open') open FROM loki_moves WHERE created_at>=?")]);
    return reply({company:'loki',connected:true,asOf:Date.now(),since,audits,operators,moves,coverage:'Retained anonymous Loki audit/operator sessions and moves over 30 days. Deleted sessions are excluded. These are not unique identified people or WonPlace activity.'});
  }catch{return reply({connected:false,error:'Loki analytics is unavailable'},503);}
}
async function voyageAnalytics(env) {
  try {
    const since=Date.now()-30*86400000;
    const [usage,members,daily]=(await Promise.all([env.DB.prepare('SELECT COUNT(*) events,COUNT(DISTINCT member_id) people FROM usage_events WHERE ts>=?').bind(since).first(),env.DB.prepare('SELECT u.member_id,m.name,COUNT(*) events,MAX(u.ts) lastSeen FROM usage_events u JOIN members m ON m.id=u.member_id WHERE u.ts>=? GROUP BY u.member_id,m.name ORDER BY events DESC').bind(since).all(),env.DB.prepare("SELECT strftime('%Y-%m-%d',ts/1000,'unixepoch') day,COUNT(*) events FROM usage_events WHERE ts>=? GROUP BY day ORDER BY day").bind(since).all()]));
    return reply({company:'voyage',connected:true,asOf:Date.now(),since,usage,daily:daily.results,members:members.results,coverage:'Voyage CRM usage events over 30 days. This is separate from TideLine website traffic and WonPlace staff activity. Recent history is not a live presence signal.'});
  }catch{return reply({connected:false,error:'Voyage usage source is unavailable'},503);}
}
