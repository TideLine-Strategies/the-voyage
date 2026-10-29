const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=message=>{throw Object.assign(Error(message),{status:400});};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail('Invalid completion report text');return value.trim();};
export function workReportFields(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['requestId','performer','summary','changes','checks','links'].includes(k)))fail('Invalid completion report');
 if(!uuid.test(value.requestId||'')||!['me','codex','claude'].includes(value.performer||'me'))fail('Invalid completion contributor');
 const links=value.links||[];if(!Array.isArray(links)||links.length>12)fail('Use up to 12 verification links');
 return {requestId:value.requestId,performer:value.performer||'me',summary:text(value.summary,4000,true),changes:text(value.changes||'',8000),checks:text(value.checks||'',6000),links:links.map(link=>{if(!link||Object.keys(link).some(k=>!['label','url'].includes(k)))fail('Invalid verification link');let u;try{u=new URL(link.url);}catch{fail('Use full HTTPS verification links');}if(u.protocol!=='https:'||u.username||u.password||u.href.length>2000)fail('Verification links must be HTTPS without credentials');return {label:text(link.label||'Check fix',120,true),url:u.href};})};
}
export function contributor(actor){return actor.agent?{kind:'agent',id:actor.agent,name:actor.agent==='claude'?'Claude':'Codex',requestedBy:{id:actor.id,name:actor.humanName||actor.id}}:{kind:'human',id:actor.id,name:String(actor.name||actor.id).slice(0,120)};}
export function invalidateHumanReviews(ticket,by,at,reason){
 ticket.reviewVersion=(ticket.reviewVersion||0)+1;
 if((ticket.humanReviews||[]).length){ticket.reviewLog=[...(ticket.reviewLog||[]),{id:crypto.randomUUID(),at,action:'invalidated',by,reason,previous:ticket.humanReviews}];ticket.humanReviews=[];}
}
export function appendWorkReport(ticket,value,actor,at){
 const fields=workReportFields(value),reports=ticket.workReports||[],existing=reports.find(r=>r.id===fields.requestId);
 const author=actor.agent?contributor(actor):fields.performer==='me'?contributor(actor):{kind:'agent',id:fields.performer,name:fields.performer==='claude'?'Claude':'Codex'};
 if(actor.agent&&fields.performer!==actor.agent)fail('Agent identity comes from the coding job');
 const content={via:actor.agent?'coding-job':'member-report',summary:fields.summary,changes:fields.changes,checks:fields.checks,links:fields.links,author,recordedBy:{id:actor.id,name:actor.humanName||actor.name||actor.id},jobId:actor.jobId||null};
 if(existing){if(JSON.stringify(content)!==JSON.stringify(existing.content))throw Object.assign(Error('Report request ID already has different content'),{status:409});return {entry:existing,duplicate:true};}
 if(reports.length>=200)fail('Maximum 200 work reports per ticket');
 const entry={id:fields.requestId,at,content};ticket.workReports=[...reports,entry];invalidateHumanReviews(ticket,actor.name||actor.id,at,'Completion report changed');return {entry,duplicate:false};
}
