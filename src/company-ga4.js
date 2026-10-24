import {ga4Configured,ga4Connection,reportingAccessToken,GA4_OWNER} from './company-ga4-auth.js';
const runtimeFetch=(...args)=>globalThis.fetch(...args);
export const GA4_PROPERTY='560552440';
const link='https://analytics.google.com/analytics/web/?authuser=q.stewart%40tidelinestrats.com#/a413284100p560552440/reports/intelligenthome';
const base={accountEmail:GA4_OWNER,propertyId:GA4_PROPERTY,url:link,source:'Google Analytics 4',timezone:'America/Chicago',currency:'USD',window:'Last 30 reporting days, including partial today'};
const cacheCollection='company_tideline_ga4';
const number=v=>{if(typeof v!=='string'||!/^\d+$/.test(v))throw Error('Invalid report value');const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>1e12)throw Error('Invalid report value');return n;};
function rows(report,dimensions,metrics){
 // A new property's dimensionless period report can contain only metadata and kind.
 // Preserve that empty response as pending data, while rejecting malformed populated tables.
 if(report?.kind==='analyticsData#runReport'&&!report.metricHeaders&&!report.dimensionHeaders&&(!report.rows||Array.isArray(report.rows)&&report.rows.length===0)&&(report.rowCount??0)===0&&report.metadata&&typeof report.metadata==='object')return [];
if(!report||!Array.isArray(report.metricHeaders)||report.metricHeaders.map(h=>h.name).join('|')!==metrics.join('|')||(report.dimensionHeaders||[]).map(h=>h.name).join('|')!==dimensions.join('|'))throw Error('Unexpected report schema');if((report.rowCount||0)>200)throw Error('Report exceeds bounded coverage');return (report.rows||[]).slice(0,200).map(row=>{if((row.dimensionValues||[]).length!==dimensions.length||row.metricValues?.length!==metrics.length)throw Error('Invalid report row');return Object.fromEntries([...dimensions.map((key,i)=>[key,String(row.dimensionValues[i].value||'').slice(0,120)]),...metrics.map((key,i)=>[key,number(row.metricValues[i].value)])]);});}
export function parseGA4(data,now=Date.now()){
 if(!Array.isArray(data.reports)||data.reports.length!==4)throw Error('Incomplete report');
 const [dailyReport,totalReport,channelReport,conversionReport]=data.reports;
 const daily=rows(dailyReport,['date'],['sessions','screenPageViews']).map(row=>{if(!/^\d{8}$/.test(row.date))throw Error('Invalid report date');const date=row.date.slice(0,4)+'-'+row.date.slice(4,6)+'-'+row.date.slice(6);if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid report date');return {day:date,sessions:row.sessions,pageviews:row.screenPageViews};});
 const totals=rows(totalReport,[],['sessions','activeUsers','screenPageViews'])[0]||null;
 const channels=rows(channelReport,['sessionDefaultChannelGroup'],['sessions']);
 const conversions=rows(conversionReport,['eventName'],['eventCount']);if(conversions.some(r=>!['generate_lead','sign_up'].includes(r.eventName)))throw Error('Unexpected conversion scope');
 const metadata=data.reports.map(r=>r.metadata||{}),timezone=metadata.find(m=>m.timeZone)?.timeZone||base.timezone;
 if(metadata.some(m=>m.timeZone&&m.timeZone!==base.timezone)||timezone!==base.timezone)throw Error('Property timezone changed; reconcile reporting dates');
 return {...base,status:totals?'connected':'collecting',connected:true,asOf:now,daily,totals,channels,conversions,coverage:'GA4 property reporting dates in America/Chicago; not UTC buckets or CRM totals. A new property has no historical backfill. Browser privacy choices and processing delays affect coverage.',thresholded:metadata.some(m=>m.subjectToThresholding),sampling:metadata.some(m=>m.samplingMetadatas?.length),dataLoss:metadata.some(m=>m.dataLossFromOtherRow)};
}
export async function readGA4(env,{exchange=runtimeFetch,now=Date.now()}={}){
 const configured=ga4Configured(env);let connection;try{if(configured)connection=await ga4Connection(env);}catch{}
 if(!connection)return {...base,status:'not_connected',connected:false,canConnect:configured,accountEmail:'q.stewart@tidelinestrats.com',coverage:'Connect the verified TideLine Google account to read this property. First-party website counts remain separate.'};
 let cached;
 try{const row=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind(cacheCollection,'report').first();cached=row?JSON.parse(row.data_json):null;if(cached?.propertyId===GA4_PROPERTY&&now-cached.asOf<15*60000&&cached.asOf<=now)return {...cached,cached:true};}catch{}
 try{
  const accessToken=await reportingAccessToken(env,exchange);if(!accessToken)throw Error('Reporting connection unavailable');
  const report=(dimensions,metrics,extra={})=>({dateRanges:[{startDate:'29daysAgo',endDate:'today'}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),limit:'200',keepEmptyRows:false,...extra});
  const requests=[report(['date'],['sessions','screenPageViews'],{orderBys:[{dimension:{dimensionName:'date'}}]}),report([],['sessions','activeUsers','screenPageViews']),report(['sessionDefaultChannelGroup'],['sessions']),report(['eventName'],['eventCount'],{dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:['generate_lead','sign_up'],caseSensitive:true}}}})];
  const response=await exchange('https://analyticsdata.googleapis.com/v1beta/properties/'+GA4_PROPERTY+':batchRunReports',{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},body:JSON.stringify({requests}),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Reporting permission or API access is unavailable');const value=parseGA4(await response.json(),now);
  await env.DB.prepare('INSERT INTO documents(collection,id,data_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=revision+1,updated_at=excluded.updated_at').bind(cacheCollection,'report',JSON.stringify(value),now).run();return value;
 }catch{return cached?.propertyId===GA4_PROPERTY?{...cached,status:'stale',connected:false,coverage:cached.coverage+' Refresh failed; cached report retained with its original checked time.'}:{...base,status:'unavailable',connected:false,coverage:'Read-only GA4 reporting could not be read. Check property access and Data API configuration.'};}
}
