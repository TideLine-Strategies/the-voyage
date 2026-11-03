import {BRAND_ACCOUNTS} from './company-social.js';
// Explicit units and windows prevent rolling provider totals being sold as per-minute traffic.
export const AIM='Grow paying WonPlace customers while keeping service reliable and costs controlled.';
export const METRICS=[
 ['social.youtube.subscribers','YouTube subscribers','Social','subscribers','gauge','Native current channel subscribers, including inherited audience; not gym-owner leads.','youtube'],
 ['social.youtube.views','YouTube views','Social','views','platform28d','Views during the exact native YouTube reporting dates. Includes inherited content; not unique viewers or website visits.','youtube'],
 ['social.linkedin.followers','LinkedIn followers','Social','followers','gauge','Native current TideLine Page followers.','linkedin'],
 ...['impressions','clicks','reactions','comments','reposts'].map(key=>['social.linkedin.'+key,'LinkedIn '+key,'Social',key,'platformPeriod','Native LinkedIn Page reporting in the displayed calendar window; not unique people, CRM leads or sales.','linkedin']),
 ['social.instagram.reach','Instagram accounts reached','Social','accounts','platform30d','Native total-value reach over the exact 30-day source window; includes legacy content and inherited audience.','instagram'],
 ['social.instagram.views','Instagram views','Social','views','platform30d','Native total-value views over the exact 30-day source window; not unique people.','instagram'],
 ['social.instagram.profile_links_taps','Instagram profile-link taps','Acquisition','taps','platform30d','Native profile-link tap events over the exact 30-day source window; not website sessions or CRM inquiries.','instagram'],
 ['social.instagram.followers','Instagram followers','Social','followers','gauge','Native current account followers, including inherited audience; not unique gym owners or reach.','instagram'],
 ['social.facebook.followers','Facebook followers','Social','followers','gauge','Native current Page followers, including inherited audience; not impressions or leads.','facebook'],
 ['app.accounts.active','Enabled staff accounts','Usage','accounts','instant','Current enabled staff accounts in the configured WonPlace organization; separate from recent activity and family/parent portal access.','app'],
 ['app.accounts.invited','Invited staff accounts','Usage','accounts','instant','Current invited account statuses, not sent invitation receipts or activated users.','app'],
 ['social.tiktok.followers','TikTok followers','Social','followers','gauge','Observed account followers. Baseline includes the former floordstudios audience; change is account growth, not customer attribution.','tiktok'],
 ['social.tiktok.views','TikTok video views','Social','views','platform7d','Views in the latest available seven native TikTok reporting days. Includes legacy content; separate from website page views.','tiktok'],
 ['customers.paying','Paying customers','Growth','customers','gauge','A billing-provider count of active paying WonPlace organizations.','billing'],
 ['revenue.received','Revenue received','Money','money','daily','Recorded received revenue by receipt date; expected revenue is excluded.','ledger'],
 ['revenue.expected','Revenue expected','Money','money','daily','Recorded expected revenue; this is not cash received.','ledger'],
 ['expenses.paid','Expenses paid','Money','money','daily','Recorded paid bills and expenses; not a complete bank reconciliation.','ledger'],
 ['bills.due','Bills due','Money','money','daily','Unpaid recorded bills by due date.','ledger'],
 ['ad.spend','Ad spend','Acquisition','money','daily','Daily spend from a connected advertising measurement source.','ads'],
 ['site.visits','Site visits','Acquisition','sessions','daily','Distinct collected sessions per UTC day. Daily counts are not unique people across days.','site'],
 ['content.views','Website page views','Acquisition','views','daily','Collected website page_view events per UTC day; not video plays.','site'],
 ['api.requests','API / Worker requests','Reliability','requests','rolling24h','Exact Worker request total over the preceding 24 hours, sampled at checked time; includes static assets.','cloudflare'],
 ['api.errors','Worker errors','Reliability','errors','rolling24h','Provider-reported Worker errors over the preceding 24 hours. Does not include every caught application error.','cloudflare'],
 ['api.errorRate','Worker error rate','Reliability','percent','rolling24h','Provider errors divided by requests in the same 24-hour snapshot.','cloudflare'],
 ['api.upstream','Upstream calls','Cost','calls','rolling24h','Worker subrequests over the preceding 24 hours, not billable units or remaining quota.','cloudflare'],
 ['crm.unlinked','Overdue CRM handoffs','Reliability','submissions','rolling30d','Contact and waitlist submissions from the last 30 days still without a linked CRM receipt after ten minutes. Target: zero. Inspect Sales for source receipts; these are not qualified leads.','crm'],
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
export const DEFAULT_RULES={'crm.unlinked':{direction:'above',warning:1,critical:3},'api.errorRate':{direction:'above',warning:1,critical:5},'api.errors':{direction:'above',warning:1,critical:10},'ci.failures':{direction:'above',warning:1,critical:3},'incidents.errors':{direction:'above',warning:1,critical:5}};
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
 // An empty Actions history is missing evidence, not a passing check.
 if(p.provider==='github'&&(!Number.isInteger(p.metrics.recentRuns)||p.metrics.recentRuns<=0))return [];
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
 const defaults={tideline:{aim:'Grow qualified gym-owner conversations and received TideLine revenue.',focus:['site.visits','content.views','revenue.received']},loki:{aim:'Turn useful Loki experiences into qualified customer conversations.',focus:['loki.completed','api.errorRate','ai.spend']},voyage:{aim:'Keep customer follow-through visible and the business reliable.',focus:['voyage.events','staff.active','api.errorRate']}};
 const settings={aim:AIM,focus:['customers.paying','api.errorRate','revenue.received'],rules:{},...(defaults[summary.company]||{}),...(summary.cockpit||{})};
 const metrics=METRICS.map(meta=>({...meta,points:[],current:null,currency:null,freshAt:null,freshFor:15*60000,coverage:meta.description,levers:[]}));
 const byId=Object.fromEntries(metrics.map(m=>[m.id,m]));
 const add=(id,points,options={})=>{const m=byId[id];m.points=points.filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.value)).sort((a,b)=>a.at-b.at);Object.assign(m,options);m.current=m.points.at(-1)?.value??null;};
 const providers=summary.providers||[];
 for(const meta of metrics){const rows=history.filter(p=>p.metric===meta.id),provider=providers.find(p=>p.provider===meta.source);if(rows.length)add(meta.id,rows,{freshAt:rows.at(-1).at});if(provider){meta.freshAt=meta.points.at(-1)?.at||provider.checkedAt;meta.coverage=provider.coverage+' '+meta.description;if(provider.status!=='ok'){meta.points=[];meta.current=null;}if(provider.url)meta.levers.push({label:'Open '+provider.provider,url:provider.url});}}
 for(const provider of providers)for(const p of providerMeasurements(provider)){const m=byId[p.metric];if(!m.points.some(q=>q.at===p.at))m.points.push(p);m.points.sort((a,b)=>a.at-b.at);m.current=m.points.at(-1)?.value??null;m.freshAt=Math.max(m.freshAt||0,p.at);}
 if(providers.some(p=>p.provider==='cloudflare'&&p.status==='ok'&&p.metrics.requests===0))byId['api.errorRate'].current=null;
 if(providers.some(p=>p.provider==='github'&&p.status==='ok'&&(!Number.isInteger(p.metrics.recentRuns)||p.metrics.recentRuns<=0))){byId['ci.failures'].current=null;byId['ci.failures'].coverage+=' No recent Actions runs are available; historical samples do not establish current CI health.';}
 for(const meta of metrics){if(meta.unit==='money'&&['ad.spend','ai.spend'].includes(meta.id)){const currencies=[...new Set(meta.points.map(p=>p.currency))];if(currencies.length===1)meta.currency=currencies[0];else if(currencies.length>1){meta.points=[];meta.current=null;meta.coverage+=' Multiple currencies cannot be combined.';}}}
 const acquisition=summary.acquisition;
 if(summary.company==='tideline'&&acquisition?.status==='connected'){
  const inputs=[acquisition.contacts,acquisition.waitlist];
  if(inputs.every(row=>row?.status==='connected'&&Number.isSafeInteger(row.unlinkedOver10Minutes)&&row.unlinkedOver10Minutes>=0)){
   const at=Date.parse(acquisition.asOf);if(Number.isFinite(at))add('crm.unlinked',[{at,value:inputs.reduce((n,row)=>n+row.unlinkedOver10Minutes,0)}],{freshAt:at,coverage:'Last 30 days. Ten-minute delivery target; contact and waitlist are alternative intake paths. Counts are source-to-CRM handoffs, not qualified leads or received revenue.'});
  }
 }
 byId['crm.unlinked'].levers.push({label:'Open CRM accounts',url:'/?view=accounts'});
 const social=summary.social;
 if(summary.company==='wonplace'&&social?.latest){
  const latest=social.latest,coverage=latest.coverage+' Native report: '+latest.overview.start+' through '+latest.overview.end+'.';
  add('social.tiktok.followers',(social.history||[]).filter(r=>Number.isSafeInteger(r.followers)).map(r=>({at:r.at,value:r.followers})),{freshAt:latest.observedAt,freshFor:36*3600000,coverage});
  add('social.tiktok.views',[{at:latest.observedAt,value:latest.overview.videoViews}],{freshAt:latest.observedAt,freshFor:36*3600000,coverage});
  if(latest.account.followers===null)byId['social.tiktok.followers'].current=null;
  if(social.status==='refresh_failed')for(const id of ['social.tiktok.followers','social.tiktok.views']){byId[id].freshFor=0;byId[id].coverage+=' Most recent native refresh failed; earlier evidence retained.';}
  for(const id of ['social.tiktok.followers','social.tiktok.views'])byId[id].levers.push({label:'Open TikTok Studio',url:social.analyticsUrl});
 }
 const ledger=summary.financials||[];
 for(const [id,status]of [['revenue.received','received'],['revenue.expected','expected'],['expenses.paid','paid'],['bills.due','due']]){
  const rows=ledger.filter(r=>r.status===status&&r.date>=new Date(now-30*86400000).toISOString().slice(0,10)),currencies=[...new Set(rows.map(r=>r.currency))];
  if(currencies.length===1){const days=new Map();for(const r of rows){const at=Date.parse(r.date+'T00:00:00Z');days.set(at,(days.get(at)||0)+r.amountCents/100);}add(id,[...days].map(([at,value])=>({at,value})),{currency:currencies[0],freshAt:summary.asOf,total:rows.reduce((s,r)=>s+r.amountCents/100,0)});}else if(currencies.length>1)byId[id].coverage+=' Multiple currencies exist; use the ledger by currency.';
  byId[id].levers.push({label:'Open TideLine ledger',action:'ledger'});
 }
 const live=summary.live||{},events=live.events||[],active=new Set((live.activeUsers||[]).filter(e=>now-e.at<90000).map(e=>e.userId));
 if(events.length){add('staff.active',[{at:live.asOf||now,value:active.size}],{freshAt:Math.max(...events.map(e=>e.at)),freshFor:90000});for(const [id,predicate]of [['staff.actions',e=>e.kind==='activity'],['incidents.errors',e=>e.kind==='incident'&&e.severity==='error']]){const hours=new Map();for(const e of events.filter(predicate)){const at=Math.floor(e.at/3600000)*3600000;hours.set(at,(hours.get(at)||0)+1);}if(!hours.size)hours.set(Math.floor(now/3600000)*3600000,0);add(id,[...hours].map(([at,value])=>({at,value})),{freshAt:Math.max(...events.map(e=>e.at)),freshFor:90000});}}
 for(const account of (summary.social?.accounts||[]).filter(a=>Object.hasOwn(BRAND_ACCOUNTS[summary.company]||{},a.platform))){
  const observations=[...(account.history||[]).filter(v=>v.observedAt!==account.latest?.observedAt),...(account.latest?[account.latest]:[])],id='social.'+account.platform+(account.platform==='youtube'?'.subscribers':'.followers'),counter=account.latest?.counts?.[account.platform==='youtube'?'subscribers_count':'followers_count'];if(byId[id]&&Number.isSafeInteger(counter))add(id,observations.map(v=>({at:v.observedAt,value:v.counts?.[account.platform==='youtube'?'subscribers_count':'followers_count']})),{freshAt:account.latest.observedAt,freshFor:36*3600000,coverage:account.latest.coverage});
  for(const [key,value]of Object.entries(account.latest?.report?.metrics||{})){const id='social.'+account.platform+'.'+key;if(byId[id])add(id,observations.map(v=>({at:v.observedAt,value:v.report?.metrics?.[key]})),{freshAt:account.latest.observedAt,freshFor:36*3600000,coverage:account.latest.coverage+' Native calendar report: '+account.latest.report.start+' — '+account.latest.report.end+'.'});}
  const nativeUrl={youtube:'https://studio.youtube.com/channel/UCSwOxf0QZOXpfrSjN46pm7A/analytics/tab-overview/period-default',linkedin:'https://www.linkedin.com/company/109054255/admin/analytics/updates'}[account.platform];if(nativeUrl)for(const m of metrics.filter(m=>m.source===account.platform))m.levers.push({label:'Open native '+account.platform+' analytics',url:nativeUrl});
  for(const row of account.latest?.insights||[]){const key='social.'+account.platform+'.'+row.metric;if(byId[key]&&Number.isFinite(row.value))add(key,[{at:row.to,value:row.value}],{freshAt:account.latest.observedAt,freshFor:36*3600000,coverage:account.latest.coverage+' Native report: '+new Date(row.from).toISOString()+' — '+new Date(row.to).toISOString()+'.'});}
 }

 const access=summary.company==='wonplace'?source.access:null;
 if(source.connected===true&&access?.status==='connected'&&Number.isFinite(access.asOf))for(const [id,key]of [['app.accounts.active','active'],['app.accounts.invited','invited']])if(Number.isSafeInteger(access[key])&&access[key]>=0)add(id,[{at:access.asOf,value:access[key]}],{freshAt:access.asOf,coverage:access.coverage});
 const marketing=summary.company==='wonplace'?source.marketing:null;
 if(marketing?.connected)for(const [id,key]of [['site.visits','sessions'],['content.views','pageviews']])add(id,(marketing.daily||[]).map(d=>({at:Date.parse(d.day+'T00:00:00Z'),value:Number(d[key]||0)})),{freshAt:marketing.asOf,coverage:marketing.coverage});
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
 let acquisitionDecision=null;
 if(summary.company==='tideline'&&acquisition?.status==='connected'&&[acquisition.traffic?.sessions,acquisition.contacts?.submitted,acquisition.waitlist?.submitted].every(v=>Number.isSafeInteger(v)&&v>=0)&&acquisition.contacts.status==='connected'&&acquisition.waitlist.status==='connected'&&Number.isFinite(Date.parse(acquisition.asOf))&&Number.isFinite(Date.parse(acquisition.since))&&acquisition.days===30&&Date.parse(acquisition.asOf)-Date.parse(acquisition.since)===30*86400000){acquisitionDecision={asOf:Date.parse(acquisition.asOf),from:acquisition.since,to:acquisition.asOf,sessions:acquisition.traffic.sessions,contacts:acquisition.contacts.submitted,waitlist:acquisition.waitlist.submitted};}
 return {company:summary.company,asOf:now,settings,metrics,decisionContext:{acquisition:acquisitionDecision},signals:signals.sort((a,b)=>rank[a.status]-rank[b.status]),coverage:{live:live.coverage,finance:summary.financialCoverage,source:source.coverage||source.error||'Source is not connected.'},pages:marketing?.connected?marketing.pages:(source.pages||[]),diagnostics:source.diagnostics||null};
}
