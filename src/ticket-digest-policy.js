export const DIGEST_ZONE='America/Chicago';
export function digestClock(now=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:DIGEST_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));return {day:parts.year+'-'+parts.month+'-'+parts.day,hour:Number(parts.hour)};}
const redact=v=>String(v||'').replace(/(?:password|api[_ -]?key|secret|access[_ -]?token)\s*[:=]\s*\S+/gi,'[credential redacted]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]{12,}/g,'[key redacted]');
export function digestContext(reports){
 const context={asOf:Date.now(),coverage:[],products:[]};let remaining=56000;
 for(const r of reports){if(r.error){context.coverage.push(r.company+': '+r.error);continue;}const product={company:r.company,counts:r.counts,coverage:r.coverage,tickets:[],omitted:0};for(const t of r.tickets){const safe={...t,title:redact(t.title),description:redact(t.description).slice(0,1000),notes:(t.notes||[]).map(n=>({by:n.by,at:n.at,body:redact(n.body).slice(0,600)}))},size=JSON.stringify(safe).length;if(size>remaining){product.omitted++;continue;}remaining-=size;product.tickets.push(safe);}context.products.push(product);}return JSON.stringify(context);
}
