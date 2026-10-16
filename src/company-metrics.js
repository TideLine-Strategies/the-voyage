// Explicit units and windows prevent rolling provider totals being sold as per-minute traffic.
export const AIM='Grow paying WonPlace customers while keeping service reliable and costs controlled.';
export const METRICS=[
 ['customers.paying','Paying customers','Growth','customers','gauge','A billing-provider count of active paying WonPlace organizations.','billing'],
 ['revenue.received','Revenue received','Money','money','daily','Recorded received revenue by receipt date; expected revenue is excluded.','ledger'],
 ['revenue.expected','Revenue expected','Money','money','daily','Recorded expected revenue; this is not cash received.','ledger'],
 ['expenses.paid','Expenses paid','Money','money','daily','Recorded paid bills and expenses; not a complete bank reconciliation.','ledger'],
 ['bills.due','Bills due','Money','money','daily','Unpaid recorded bills by due date.','ledger'],
 ['ad.spend','Ad spend','Acquisition','money','daily','Daily spend from a connected advertising measurement source.','ads'],
 ['site.visits','Site visits','Acquisition','sessions','daily','Distinct collected sessions per UTC day. Daily counts are not unique people across days.','site'],
 ['content.views','Content views','Acquisition','views','daily','Collected website page_view events per UTC day; not video plays.','site'],
 ['api.requests','API / Worker requests','Reliability','requests','rolling24h','Exact Worker request total over the preceding 24 hours, sampled at checked time; includes static assets.','cloudflare'],
 ['api.errors','Worker errors','Reliability','errors','rolling24h','Provider-reported Worker errors over the preceding 24 hours. Does not include every caught application error.','cloudflare'],
 ['api.errorRate','Worker error rate','Reliability','percent','rolling24h','Provider errors divided by requests in the same 24-hour snapshot.','cloudflare'],
 ['api.upstream','Upstream calls','Cost','calls','rolling24h','Worker subrequests over the preceding 24 hours, not billable units or remaining quota.','cloudflare'],
 ['ci.failures','Failed checks','Reliability','checks','recent10','Failures among the most recent ten CI runs. Old failures may already have a passing successor.','github'],
 ['ai.requests','AI requests','Cost','requests','rolling30d','Recorded provider execution receipts over the last 30 days.','ai'],
 ['ai.tokens','AI tokens','Cost','tokens','rolling30d','Input plus output tokens present in execution receipts. Missing token counts are not measured spend.','ai'],
 ['ai.spend','AI spend','Cost','money','daily','Actual recorded provider charges; tokens alone do not establish price.','billing'],
 ['staff.active','Active staff','Usage','people','instant','Distinct staff identities with visible, active sessions in the last 90 seconds.','live'],
 ['staff.actions','Staff actions','Usage','actions','hourly','Semantic activity events in the retained feed, bucketed by UTC hour. Retention is capped.','live'],
 ['incidents.errors','Error reports','Reliability','reports','hourly','Retained error-severity incident events, not a complete platform log.','live'],
 ['loki.completed','Loki audits completed','Usage','audits','rolling30d','Retained completed audits over the last 30 days.','loki'],
 ['voyage.events','CRM activity','Usage','events','daily','Recorded Voyage usage events per UTC day.','voyage']
].map(([id,label,group,unit,window,description,source])=>({id,label,group,unit,window,description,source}));
export const DEFAULT_RULES={'api.errorRate':{direction:'above',warning:1,critical:5},'api.errors':{direction:'above',warning:1,critical:10},'ci.failures':{direction:'above',warning:1,critical:3},'incidents.errors':{direction:'above',warning:1,critical:5}};
export function cockpitSettings(data){
 const aim=String(data.aim||AIM).trim();if(!aim||aim.length>240)throw Error('Chief aim must be 1–240 characters');
 const focus=data.focus||['customers.paying','api.errorRate','revenue.received'];if(!Array.isArray(focus)||focus.length<1||focus.length>3||new Set(focus).size!==focus.length||focus.some(id=>!METRICS.some(m=>m.id===id)))throw Error('Choose one to three distinct focus metrics');
 const rules={};for(const [id,r]of Object.entries(data.rules||{})){if(!METRICS.some(m=>m.id===id)||!r||!['above','below'].includes(r.direction)||![r.warning,r.critical].every(v=>Number.isFinite(v)&&v>=0)||(r.direction==='above'?r.critical<r.warning:r.critical>r.warning))throw Error('Invalid warning or critical threshold');rules[id]={direction:r.direction,warning:r.warning,critical:r.critical};}
 return {aim,focus,rules};
}
export function measurement(value,now=Date.now()){
 const meta=METRICS.find(m=>m.id===value.metric);if(!meta||!['customers.paying','ad.spend','ai.spend'].includes(meta.id)||!Number.isFinite(value.value)||value.value<0||!Number.isSafeInteger(value.at)||value.at>now+60000||value.at<now-30*86400000)throw Error('Invalid measurement');
 if(meta.id==='customers.paying'&&!Number.isSafeInteger(value.value))throw Error('Customer count must be an integer');
 if(meta.unit==='money'&&!/^[A-Z]{3}$/.test(value.currency||''))throw Error('Currency is required');
 if(meta.unit==='money'&&new Date(value.at).toISOString().slice(11)!=='00:00:00.000Z')throw Error('Daily measurements must use UTC midnight');
 return {metric:meta.id,value:value.value,at:value.at,...(meta.unit==='money'?{currency:value.currency}:{})};
}
export function providerMeasurements(p){
 if(p.status!=='ok')return [];
 const keys=p.provider==='cloudflare'?{'api.requests':'requests','api.errors':'errors','api.upstream':'subrequests'}:p.provider==='github'?{'ci.failures':'failedRecentRuns'}:{};
 const rows=Object.entries(keys).filter(([,key])=>Number.isFinite(p.metrics[key])).map(([metric,key])=>({metric,value:p.metrics[key],at:p.checkedAt}));
 if(p.provider==='cloudflare'&&p.metrics.requests>0&&Number.isFinite(p.metrics.errors))rows.push({metric:'api.errorRate',value:100*p.metrics.errors/p.metrics.requests,at:p.checkedAt});return rows;
}
export function statusFor(metric,rule,now=Date.now()){
 if(!metric.points.length||!Number.isFinite(metric.current))return 'unknown';
 if(metric.freshAt&&now-metric.freshAt>metric.freshFor)return 'stale';
 if(!rule)return 'unrated';
 const value=metric.current,hit=limit=>rule.direction==='above'?value>=limit:value<=limit;
 return hit(rule.critical)?'critical':hit(rule.warning)?'warning':'healthy';
}
export function buildCockpit(summary,source={},history=[],now=Date.now()){
 const settings={aim:AIM,focus:['customers.paying','api.errorRate','revenue.received'],rules:{},...(summary.cockpit||{})};
 const metrics=METRICS.map(meta=>({...meta,points:[],current:null,currency:null,freshAt:null,freshFor:15*60000,coverage:meta.description,levers:[]}));
 const byId=Object.fromEntries(metrics.map(m=>[m.id,m]));
 const add=(id,points,options={})=>{const m=byId[id];m.points=points.filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.value)).sort((a,b)=>a.at-b.at);Object.assign(m,options);m.current=m.points.at(-1)?.value??null;};
 const providers=summary.providers||[];
 for(const meta of metrics){const rows=history.filter(p=>p.metric===meta.id),provider=providers.find(p=>p.provider===meta.source);if(rows.length)add(meta.id,rows,{freshAt:rows.at(-1).at});if(provider){meta.freshAt=meta.points.at(-1)?.at||provider.checkedAt;meta.coverage=provider.coverage+' '+meta.description;if(provider.status!=='ok'){meta.points=[];meta.current=null;}if(provider.url)meta.levers.push({label:'Open '+provider.provider,url:provider.url});}}
 for(const provider of providers)for(const p of providerMeasurements(provider)){const m=byId[p.metric];if(!m.points.some(q=>q.at===p.at))m.points.push(p);m.points.sort((a,b)=>a.at-b.at);m.current=m.points.at(-1)?.value??null;}
 if(providers.some(p=>p.provider==='cloudflare'&&p.status==='ok'&&p.metrics.requests===0))byId['api.errorRate'].current=null;
 for(const meta of metrics){if(meta.unit==='money'&&['ad.spend','ai.spend'].includes(meta.id)){const currencies=[...new Set(meta.points.map(p=>p.currency))];if(currencies.length===1)meta.currency=currencies[0];else if(currencies.length>1){meta.points=[];meta.current=null;meta.coverage+=' Multiple currencies cannot be combined.';}}}
 const ledger=summary.financials||[];
 for(const [id,status]of [['revenue.received','received'],['revenue.expected','expected'],['expenses.paid','paid'],['bills.due','due']]){
  const rows=ledger.filter(r=>r.status===status&&r.date>=new Date(now-30*86400000).toISOString().slice(0,10)),currencies=[...new Set(rows.map(r=>r.currency))];
  if(currencies.length===1){const days=new Map();for(const r of rows){const at=Date.parse(r.date+'T00:00:00Z');days.set(at,(days.get(at)||0)+r.amountCents/100);}add(id,[...days].map(([at,value])=>({at,value})),{currency:currencies[0],freshAt:summary.asOf,total:rows.reduce((s,r)=>s+r.amountCents/100,0)});}else if(currencies.length>1)byId[id].coverage+=' Multiple currencies exist; use the ledger by currency.';
  byId[id].levers.push({label:'Open TideLine ledger',action:'ledger'});
 }
 const live=summary.live||{},events=live.events||[],active=new Set((live.activeUsers||[]).filter(e=>now-e.at<90000).map(e=>e.userId));
 if(events.length){add('staff.active',[{at:live.asOf||now,value:active.size}],{freshAt:Math.max(...events.map(e=>e.at)),freshFor:90000});for(const [id,predicate]of [['staff.actions',e=>e.kind==='activity'],['incidents.errors',e=>e.kind==='incident'&&e.severity==='error']]){const hours=new Map();for(const e of events.filter(predicate)){const at=Math.floor(e.at/3600000)*3600000;hours.set(at,(hours.get(at)||0)+1);}if(!hours.size)hours.set(Math.floor(now/3600000)*3600000,0);add(id,[...hours].map(([at,value])=>({at,value})),{freshAt:Math.max(...events.map(e=>e.at)),freshFor:90000});}}
 if(source.connected){
  const freshAt=source.asOf||now;
  for(const [id,key]of [['site.visits','sessions'],['content.views','pageviews'],['voyage.events','events']])if((id.startsWith('voyage')&&summary.company==='voyage')||(!id.startsWith('voyage')&&summary.company==='tideline'))add(id,(source.daily||[]).map(d=>({at:Date.parse(d.day+'T00:00:00Z'),value:Number(d[key]||0)})),{freshAt,coverage:source.coverage});
  if(summary.company==='wonplace'&&Array.isArray(source.aiUsage))for(const [id,keys]of [['ai.requests',['requests']],['ai.tokens',['input_tokens','output_tokens']]]){const value=source.aiUsage.reduce((n,row)=>n+keys.reduce((s,k)=>s+Number(row[k]||0),0),0);add(id,[{at:freshAt,value}],{freshAt,coverage:source.coverage+' '+byId[id].description});}
  if(source.audits)add('loki.completed',[{at:freshAt,value:Number(source.audits.completed||0)}],{freshAt,coverage:source.coverage});
 }
 for(const m of metrics){m.rule=settings.rules[m.id]||DEFAULT_RULES[m.id]||null;m.status=statusFor(m,m.rule,now);m.focus=settings.focus.includes(m.id);m.levers.push(...(summary.connections||[]).filter(c=>c.provider===m.source||(m.source==='site'&&c.provider==='other')).map(c=>({label:c.label,url:c.url})));}
 const rank={critical:0,warning:1,stale:2,unknown:3,unrated:4,healthy:5};
 const signals=metrics.filter(m=>['critical','warning','stale'].includes(m.status)&&(m.focus||m.group==='Reliability')).map(m=>({id:m.id,title:m.label,status:m.status,value:m.current,detail:m.status==='stale'?'Source is stale. Check the source before acting on the last measurement.':`${m.current} ${m.unit}; ${m.rule.direction} ${m.status==='critical'?m.rule.critical:m.rule.warning} crosses your ${m.status} threshold.`,next:m.status==='stale'?'Refresh or reconnect the source.':'Inspect the time window and original evidence, ask Muninn for causes, then open the source control.'}));
 for(const id of settings.focus){const m=byId[id];if(m?.status==='unknown')signals.push({id:m.id,title:m.label+' is not measured',status:'warning',detail:'A focus metric has no connected evidence. This is a visibility gap, not a zero.',next:'Connect the authoritative source or record the relevant business data before judging progress.'});}
 for(const e of events.filter(e=>e.kind==='incident'&&e.severity==='error').slice(0,8))signals.push({id:'event:'+e.id,metric:'incidents.errors',title:e.code||'Application error',status:'critical',detail:`${e.source} · ${e.page||'unknown page'} · ${new Date(e.at).toISOString()}`,next:'Open the original report and investigate with Muninn.',ticketId:e.ticketId});
 for(const incident of (source.diagnostics?.incidents||[]).filter(i=>!['closed','resolved'].includes(i.status)).slice(0,8))signals.push({id:'report:'+incident.ticket_id,metric:'incidents.errors',title:'Reported incident · '+incident.ticket_id,status:incident.severity==='error'?'critical':'warning',detail:`${incident.status||'Reported'} · ${incident.occurrences||1} occurrences · last seen ${incident.last_seen?new Date(incident.last_seen).toISOString():'not recorded'}`,next:'Read the original report, confirm current impact, and investigate with Muninn.',ticketId:incident.ticket_id});
 if(source.connected===false)signals.push({id:'source',title:'Analytics source unavailable',status:'warning',detail:source.error||'Source read did not succeed.',next:'Check source access before diagnosing the product.'});
 return {company:summary.company,asOf:now,settings,metrics,signals:signals.sort((a,b)=>rank[a.status]-rank[b.status]),coverage:{live:live.coverage,finance:summary.financialCoverage,source:source.coverage||source.error||'Source is not connected.'},pages:source.pages||[],diagnostics:source.diagnostics||null};
}
