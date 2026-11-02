import {filterReferralLeads,RELATIONSHIPS,CORRESPONDENCE,ELIGIBILITY} from './referral-leads-model.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let host,rows=[],loaded=false,busy=false,controls={},list,count,status;
function draw(){
  const filters=Object.fromEntries(Object.entries(controls).map(([k,n])=>[k,n.type==='checkbox'?n.checked:n.value]));
  const found=filterReferralLeads(rows,filters);count.textContent=`${found.length} of ${rows.length} referral records · No automatic outreach`;
  list.replaceChildren();
  if(!found.length){list.append(node('p','No referral leads match these filters.'));return;}
  for(const r of found){
    const detail=node('details'),summary=node('summary',`${r.name} · ${RELATIONSHIPS[r.relationship]} · ${CORRESPONDENCE[r.correspondence]}`);
    detail.append(summary,node('p',[r.gym,r.athlete&&'Athlete: '+r.athlete,r.email].filter(Boolean).join(' · ')),node('p',`${ELIGIBILITY[r.eligibility]} · Review: ${r.reviewStatus.replaceAll('_',' ')} · Source: ${r.source}`));
    if(r.purchaseAmount)detail.append(node('p',`Verified historical purchases: $${r.purchaseAmount.toFixed(2)} (F10.0RD, not WonPlace revenue)`));
    detail.append(node('p',r.notes||'No personal conversation summary recorded.'));
    for(const [label,values]of [['Purchase evidence',r.purchaseEvidence],['Conversation evidence',r.conversationEvidence]])if(values?.length){detail.append(node('strong',label));const ul=node('ul');for(const text of values)ul.append(node('li',text));detail.append(ul);}
    list.append(detail);
  }
}
async function load(){
  if(busy)return;busy=true;status.textContent='Loading referral leads…';
  try{const response=await fetch('/api/collection/referral_leads?limit=2000',{credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Referral leads unavailable');if(!Array.isArray(data.docs))throw Error('Invalid referral response');rows=data.docs.map(d=>({id:d.id,...d.data}));loaded=true;draw();status.textContent='Historical evidence; eligibility is not marketing consent.';}
  catch(e){status.textContent=e.message;}
  finally{busy=false;}
}
window.VoyageReferralLeads={mount(container,{guest=false}={}){
  container.hidden=guest;if(guest||host)return;host=container;
  const summary=node('summary','F10.0RD referral leads'),description=node('p','Past music customers and enquiries, kept separate from gym accounts. Review each draft with Quan; no campaign is enrolled or sent.');
  const filters=node('div');filters.className='bhead';
  const search=node('input');search.type='search';search.placeholder='Find a person, gym or athlete';search.setAttribute('aria-label','Search referral leads');controls.search=search;filters.append(search);
  const add=(key,label,options)=>{const s=node('select');s.setAttribute('aria-label',label);s.append(new Option(label,''));for(const [v,t] of Object.entries(options))s.append(new Option(t,v));controls[key]=s;filters.append(s);};
  add('source','Any referral source',{f100rd:'F10.0RD / JIM'});
  add('relationship','Any past relationship',{customer:'All past customers',...RELATIONSHIPS});
  add('correspondence','Any correspondence',CORRESPONDENCE);
  add('eligibility','Any contact status',ELIGIBILITY);
  add('review','Any draft status',{awaiting_owner_approval:'Awaiting Quan approval',not_started:'Not drafted yet',approved_draft:'Approved draft',excluded:'Excluded'});
  const label=node('label'),check=node('input');check.type='checkbox';controls.includeExcluded=check;label.append(check,document.createTextNode(' Include excluded / test records'));filters.append(label);
  const clear=node('button','Reset referral filters');clear.type='button';clear.className='btn';clear.onclick=()=>{for(const n of Object.values(controls)){if(n.type==='checkbox')n.checked=false;else n.value='';}draw();};
  const refresh=node('button','Refresh referral leads');refresh.type='button';refresh.className='btn';refresh.onclick=load;filters.append(clear,refresh);
  count=node('p');count.setAttribute('aria-live','polite');status=node('p');status.setAttribute('role','status');list=node('div');list.className='referral-lead-list';
  host.append(summary,description,filters,count,status,list);for(const [k,n]of Object.entries(controls))n.addEventListener(k==='search'?'input':'change',draw);
  controls.eligibility.addEventListener('change',()=>{if(controls.eligibility.value==='excluded'){controls.includeExcluded.checked=true;draw();}});
  host.addEventListener('toggle',()=>{if(host.open&&!loaded)load();});
  if(new URLSearchParams(location.search).get('leads')==='f100rd')host.open=true;
  if(host.open)load();
}};
window.dispatchEvent(new Event('voyage-referrals-ready'));
