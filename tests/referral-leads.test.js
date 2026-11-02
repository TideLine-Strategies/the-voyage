import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocument} from '../src/worker.js';
import {filterReferralLeads,sanitizeReferralLead} from '../public/referral-leads-model.js';
const lead={source:'f100rd',sourceRecordId:'legacy-8',name:'Parent A',email:'parent@example.com',gym:'Example Club',athlete:'Athlete A',relationship:'paid_verified',correspondence:'email_reply',eligibility:'adult_verified',reviewStatus:'awaiting_owner_approval',purchaseAmount:150,priority:0,purchaseEvidence:['Archived receipt'],conversationEvidence:['Reply confirmed']};
const rows=[lead,{...lead,name:'Enquiry B',relationship:'prospect',correspondence:'none_verified',eligibility:'review_required',reviewStatus:'not_started',priority:10},{...lead,name:'Athlete C',relationship:'prospect',correspondence:'dm_or_chat',eligibility:'guardian_required',reviewStatus:'not_started',priority:20},{...lead,name:'Test D',eligibility:'excluded',reviewStatus:'excluded',priority:30}];
test('referral filters intersect rather than treating a chat, buyer or approval as consent',()=>{
 assert.equal(filterReferralLeads(rows).length,3);
 assert.deepEqual(filterReferralLeads(rows,{relationship:'customer',correspondence:'email_reply'}).map(r=>r.name),['Parent A']);
 assert.equal(filterReferralLeads(rows,{relationship:'paid_verified',eligibility:'guardian_required'}).length,0);
 assert.deepEqual(filterReferralLeads(rows,{search:'athlete a',review:'awaiting_owner_approval'}).map(r=>r.name),['Parent A']);
 assert.equal(filterReferralLeads(rows,{source:'other'}).length,0);
 assert.equal(filterReferralLeads(rows,{includeExcluded:true,eligibility:'excluded'}).length,1);
 assert.equal(filterReferralLeads(rows,{correspondence:'none_verified',eligibility:'review_required',relationship:'prospect'}).length,1);
});
test('historical lead writes validate amounts, enums, identities and evidence',()=>{
 assert.equal(sanitizeReferralLead(lead).purchaseAmount,150);
 for(const patch of [{send:true},{purchaseAmount:-1},{relationship:'customer'},{email:'bad'},{purchaseEvidence:['x'.repeat(501)]}])assert.throws(()=>sanitizeReferralLead({...lead,...patch}));
 assert.throws(()=>sanitizeReferralLead({name:'Missing classifications'}));
 assert.throws(()=>validateDocument('referral_leads','example',{id:'override',...lead},{role:'edit'},'PUT'));
 assert.deepEqual(sanitizeReferralLead({reviewStatus:'approved_draft'},'PATCH'),{reviewStatus:'approved_draft'});
});
