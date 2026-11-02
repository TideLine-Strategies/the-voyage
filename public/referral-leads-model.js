// Historical relationships are not sales, consent, or permission to send.
export const RELATIONSHIPS = {paid_verified:'Verified buyer',customer_owner_confirmed:'Customer (owner confirmed)',prospect:'Prospect'};
export const CORRESPONDENCE = {email_reply:'Email conversation',dm_or_chat:'Recorded DM / chat',none_verified:'No reply verified'};
export const ELIGIBILITY = {adult_verified:'Adult contact verified',guardian_required:'Parent / guardian needed',review_required:'Contact review needed',excluded:'Excluded / test'};
export function filterReferralLeads(rows, filters = {}) {
  const q=String(filters.search||'').trim().toLowerCase();
  return rows.filter(r=>(!filters.includeExcluded?r.eligibility!=='excluded':true)
    &&(!filters.source||r.source===filters.source)
    &&(!filters.relationship||(filters.relationship==='customer'?r.relationship!=='prospect':r.relationship===filters.relationship))
    &&(!filters.correspondence||r.correspondence===filters.correspondence)
    &&(!filters.eligibility||r.eligibility===filters.eligibility)
    &&(!filters.review||r.reviewStatus===filters.review)
    &&(!q||[r.name,r.email,r.gym,r.athlete,r.notes].some(v=>String(v||'').toLowerCase().includes(q))))
    .sort((a,b)=>(a.priority??99)-(b.priority??99)||String(a.name).localeCompare(String(b.name)));
}
export function sanitizeReferralLead(data, method='PUT') {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid referral lead');
  const strings={source:40,sourceRecordId:120,name:160,email:200,gym:200,athlete:120,contactRole:80,originalStatus:160,notes:3000,lastConversation:40};
  const enums={relationship:Object.keys(RELATIONSHIPS),correspondence:Object.keys(CORRESPONDENCE),eligibility:Object.keys(ELIGIBILITY),reviewStatus:['not_started','awaiting_owner_approval','approved_draft','excluded']};
  const out={};
  for(const [key,value] of Object.entries(data)){
    if(key in strings){if(typeof value!=='string'||value.length>strings[key])throw Error('Invalid referral lead '+key);out[key]=value.trim();}
    else if(key in enums){if(!enums[key].includes(value))throw Error('Invalid referral lead '+key);out[key]=value;}
    else if(['purchaseEvidence','conversationEvidence'].includes(key)){if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||v.length>500))throw Error('Invalid referral evidence');out[key]=value;}
    else if(['purchaseAmount','priority','importedAt'].includes(key)){if(!Number.isFinite(value)||value<0||value>1e15)throw Error('Invalid referral amount or order');out[key]=value;}
    else throw Error('Invalid referral lead field: '+key);
  }
  if(method!=='PATCH'&&(!out.name||!out.source||!out.sourceRecordId||!out.relationship||!out.correspondence||!out.eligibility||!out.reviewStatus))throw Error('Invalid referral lead: identity and classification required');
  if(out.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email))throw Error('Invalid referral email');
  return out;
}
