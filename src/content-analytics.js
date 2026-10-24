const names=['linkedin','facebook','instagram','youtube','tiktok','x'];const metrics=['views','reactions','comments','reposts','impressions','clicks','watchSeconds','qualifiedConversations'];
function platform(url){try{const host=new URL(url).hostname.replace(/^www\./,'');return names.find(p=>host===(p==='youtube'?'youtube.com':p==='x'?'x.com':p+'.com'))||null}catch{return null}}
export function ownAnalytics(observations,brand='all'){
 const latest=new Map();for(const o of observations){if(brand!=='all'&&o.brand!==brand)continue;const key=o.url,prior=latest.get(key);if(!prior||Date.parse(o.observedAt)>Date.parse(prior.observedAt))latest.set(key,o);}
 const rows=[...latest.values()].filter(o=>platform(o.url));
 const sum=items=>Object.fromEntries(metrics.map(key=>{const known=items.map(o=>o.metrics?.[key]).filter(v=>Number.isFinite(v)&&v>=0);return [key,{sum:known.length?known.reduce((a,b)=>a+b,0):null,reported:known.length,posts:items.length}]}));
 return {brand,observedPosts:rows.length,observedPlatforms:new Set(rows.map(o=>platform(o.url))).size,expectedPlatforms:names.length,definition:'Sum of latest observations per exact post URL. These are cumulative counts, not unique people or causal results.',metrics:sum(rows),platforms:names.map(name=>{const items=rows.filter(o=>platform(o.url)===name);return {platform:name,posts:items.length,observedAt:items.map(o=>o.observedAt).sort().at(-1)||null,metrics:sum(items)}})};
}
