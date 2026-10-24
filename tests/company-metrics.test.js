import test from 'node:test';import assert from 'node:assert/strict';import {buildCockpit,cockpitSettings,measurement,providerMeasurements,statusFor} from '../src/company-metrics.js';
const now=Date.parse('2026-10-16T12:00:00Z'),day=86400000;
const summary=(extra={})=>({company:'wonplace',asOf:now,financials:[],providers:[],live:{events:[],activeUsers:[]},...extra});
const metric=(model,id)=>model.metrics.find(m=>m.id===id);
test('missing data stays unknown and a single rolling sample is not a synthetic trend',()=>{
 const model=buildCockpit(summary({providers:[{provider:'cloudflare',resource:'exact-worker',status:'ok',checkedAt:now,metrics:{requests:100,errors:10,subrequests:250},coverage:'24h'}]}),{},[],now);
 assert.equal(metric(model,'revenue.received').status,'unknown');assert.equal(metric(model,'customers.paying').current,null);
 const m=metric(model,'api.errorRate');assert.equal(m.points.length,1);assert.equal(m.current,10);assert.equal(m.status,'critical');assert.equal(m.window,'rolling24h');assert(model.signals.some(s=>s.id==='api.errorRate'));
 assert.equal(metric(model,'api.requests').status,'unrated');
});
test('money never combines currencies or expected revenue with received revenue',()=>{
 const rows=[{status:'received',amountCents:10000,currency:'USD',date:'2026-10-15'},{status:'expected',amountCents:90000,currency:'USD',date:'2026-10-20'},{status:'paid',amountCents:3000,currency:'USD',date:'2026-10-14'}];
 let m=buildCockpit(summary({financials:rows}),{},[],now);assert.equal(metric(m,'revenue.received').current,100);assert.equal(metric(m,'revenue.expected').total,900);assert.equal(metric(m,'expenses.paid').current,30);
 m=buildCockpit(summary({financials:[...rows,{status:'received',amountCents:8000,currency:'EUR',date:'2026-10-15'}]}),{},[],now);assert.equal(metric(m,'revenue.received').status,'unknown');assert.equal(metric(m,'revenue.received').current,null);
});
test('stale evidence cannot look healthy; thresholds work in either direction',()=>{
 const m={points:[{at:now-day,value:0}],current:0,freshAt:now-day,freshFor:90000};assert.equal(statusFor(m,{direction:'above',warning:1,critical:5},now),'stale');assert.equal(statusFor({...m,freshAt:now},{direction:'above',warning:1,critical:5},now),'healthy');assert.equal(statusFor({...m,freshAt:now},{direction:'below',warning:10,critical:2},now),'critical');
});
test('focus is at most three valid metrics and threshold order cannot invert severity',()=>{
 assert.throws(()=>cockpitSettings({focus:['api.errors','api.errors']}));assert.throws(()=>cockpitSettings({focus:['personal.balance']}));assert.throws(()=>cockpitSettings({rules:{'api.errors':{direction:'above',warning:10,critical:1}}}));assert.throws(()=>cockpitSettings({rules:{'api.errors':{direction:'below',warning:1,critical:10}}}));assert.equal(cockpitSettings({rules:{'api.errors':{direction:'above',warning:1,critical:10}}}).focus.length,3);
});
test('daily imported spend is currency scoped, bounded in time, and keyed by UTC day',()=>{
 assert.throws(()=>measurement({metric:'ad.spend',value:2,at:now},now));assert.throws(()=>measurement({metric:'ad.spend',value:2,at:now,currency:'USD'},now));assert.throws(()=>measurement({metric:'api.errors',value:2,at:now},now));assert.throws(()=>measurement({metric:'customers.paying',value:-1,at:now},now));assert.equal(measurement({metric:'ad.spend',value:2,at:now-12*3600000,currency:'USD'},now).currency,'USD');
 assert.equal(providerMeasurements({provider:'cloudflare',status:'ok',checkedAt:now,metrics:{requests:0,errors:0}}).some(p=>p.metric==='api.errorRate'),false);
});
test('website and CRM daily series are actual source buckets; no zero-filled missing days',()=>{
 const m=buildCockpit(summary({company:'tideline'}),{connected:true,asOf:now,coverage:'retained',daily:[{day:'2026-10-12',events:5,sessions:3,pageviews:4},{day:'2026-10-15',events:7,sessions:2,pageviews:6}]},[],now);assert.equal(metric(m,'site.visits').points.length,2);assert.equal(metric(m,'content.views').current,6);assert.equal(metric(m,'voyage.events').current,null);
});
test('staff identities are deduplicated and error reports retain original references',()=>{
 const e={id:'e',kind:'incident',severity:'error',at:now,source:'spring',ticketId:'original-report'};
 const m=buildCockpit(summary({live:{asOf:now,events:[e],activeUsers:[{userId:'u',sessionId:'s1',at:now},{userId:'u',sessionId:'s2',at:now}]}}),{},[],now);assert.equal(metric(m,'staff.active').current,1);assert.equal(m.signals.find(s=>s.id==='event:e').ticketId,'original-report');assert.equal(metric(m,'incidents.errors').status,'warning');
});
test('WonPlace marketing remains measurable when app diagnostics are unavailable and cannot leak into TideLine',()=>{
 const source={connected:false,error:'App unavailable',marketing:{connected:true,asOf:now,coverage:'Marketing only',daily:[{day:'2026-10-15',sessions:7,pageviews:11}],pages:[{page:'home',events:11}]}};
 const wonplace=buildCockpit(summary(),source,[],now);
 assert.equal(metric(wonplace,'site.visits').current,7);assert.equal(metric(wonplace,'content.views').current,11);assert.equal(metric(wonplace,'staff.active').current,null);
 assert.equal(metric(buildCockpit(summary({company:'tideline'}),source,[],now),'site.visits').current,null);
});

test('website defaults focus on acquisition without overwriting saved product settings',()=>{
 const website=buildCockpit(summary({company:'tideline'}),{},[],now);
 assert.deepEqual(website.settings.focus,['site.visits','content.views','revenue.received']);
 assert.match(metric(website,'content.views').label,/Website page views/);
 assert.match(metric(website,'content.views').description,/not video/);
 const saved={aim:'Retain our explicit aim',focus:['api.errors'],rules:{}};
 assert.deepEqual(buildCockpit(summary({company:'tideline',cockpit:saved}),{},[],now).settings,saved);
 assert.deepEqual(buildCockpit(summary(),{},[],now).settings.focus,['customers.paying','api.errorRate','revenue.received']);
});
