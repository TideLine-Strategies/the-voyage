import {listMedia} from './content-media.js';
import {packageFingerprint} from './content-package.js';
import {advanceMedia,campaignMatches,pipelineState} from './content-pipeline.js';
import {readContent} from './content.js';
import {CONTENT_RESEARCH} from './content-research.js';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(v,s=200)=>Response.json(v,{status:s,headers});
const stages=new Set(['research','scripting','filming','editing','approval','posting']);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';

export function editorial(input){
 const item={title:clean(input.title,180),brand:input.brand,product:clean(input.product,100),audience:clean(input.audience,300),pain:clean(input.pain,1000),value:clean(input.value,2000),brief:clean(input.brief,6000),copy:clean(input.copy,12000),format:clean(input.format,100),stage:input.stage,sourceUrls:(Array.isArray(input.sourceUrls)?input.sourceUrls:[]).slice(0,12).map(url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use public HTTPS evidence links');return u.toString();}),mediaUrl:clean(input.mediaUrl,1000),mediaAssetId:clean(input.mediaAssetId,64),cta:clean(input.cta,1000),accountId:clean(input.accountId,100)};
 if(!item.title||!['tideline','wonplace'].includes(item.brand)||!stages.has(item.stage))throw Error('A title, brand and valid stage are required');
 if(item.mediaUrl){const u=new URL(item.mediaUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use HTTPS media links');}
 return item;
}
export const fingerprint=packageFingerprint;
export function approvalProblems(item){return [!item.copy&&'Add the final post copy.',!item.value&&'Describe the immediate takeaway.',!item.sourceUrls.length&&'Attach source evidence.',!item.cta&&'Add the next step or call to action.',!item.product&&'Identify the product or service.',item.mediaAssetId&&item.mediaRightsVerified!==true&&'Verify rights for this footage before approval.',/video|recording|clip/i.test(item.format||'')&&!item.mediaAssetId&&'Choose verified footage and publisher branding for this video.'].filter(Boolean);}
async function row(env,id){return env.DB.prepare('SELECT data_json, revision FROM documents WHERE collection=? AND id=?').bind('content_editorial',id).first();}
export async function handleFactory(request,env,actor,readJson){
 if(actor.role!=='edit')return reply({error:'Not available to guests'},403);
 const url=new URL(request.url);
 if(url.pathname!=='/api/content-factory')return reply({error:'Not found'},404);
 if(request.method==='GET'){
  const results=await env.DB.prepare('SELECT id,data_json,revision FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 100').bind('content_editorial').all();
  const baseline=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('content_baseline','linkedin').first();
  return reply({actor:{id:actor.id,name:actor.name},items:results.results.map(r=>({...JSON.parse(r.data_json),id:r.id,revision:r.revision})),baseline:baseline?JSON.parse(baseline.data_json):null,research:CONTENT_RESEARCH,brands:await Promise.all(['tideline','wonplace'].map(b=>readContent(env,b))),publishing:{enabled:false,reason:'Review and preparation are live. Dispatch stays in the existing publishing workflow; this page does not send posts.'},metrics:null});
 }
 if(request.method!=='POST')return reply({error:'Not found'},404);
 if(request.headers.get('origin')!==url.origin)return reply({error:'Same-origin request required'},403);
 let body;try{body=await readJson(request);}catch{return reply({error:'Invalid request'},400);}
 const id=body.id||crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return reply({error:'Invalid item'},400);
 const existing=await row(env,id);const old=existing?JSON.parse(existing.data_json):null;
 if(existing&&body.revision!==existing.revision)return reply({error:'This item changed. Refresh before saving.'},409);
 if(!existing&&body.action!=='save')return reply({error:'Save the item first'},404);
 try{
  let item;
  if(body.action==='save'){
   item=editorial(body.item||{});
   if(item.accountId&&!await env.DB.prepare('SELECT id FROM documents WHERE collection=? AND id=?').bind('opps',item.accountId).first())throw Error('The linked account was not found');
   if(item.mediaAssetId){const media=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('content_media',item.mediaAssetId).first();const asset=media?JSON.parse(media.data_json):null;if(!asset?.ready||asset.kind!=='branded'||asset.brand!==item.brand)throw Error('Choose a verified derivative for this publisher');item.mediaRightsVerified=asset.rightsVerified===true;item.mediaProfileUrl=asset.profileUrl;}
   const hash=await fingerprint(item),changed=old&&hash!==await fingerprint(old);
   item={...item,approval:changed?null:old?.approval||null,approvalStale:!!(changed&&old?.approval),production:old?.production||{},createdAt:old?.createdAt||Date.now()};
   if(changed&&old?.approval)item.stage='approval';
   if(item.stage==='posting'&&!item.approval)throw Error('Human approval is required before posting preparation');
  }else if(body.action==='attach_media'){
   const found=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('content_media',body.assetId||'').first();
   if(!found)throw Error('Media not found');
   const advancement=await advanceMedia(env,{...JSON.parse(found.data_json),id:body.assetId},'editor-'+crypto.randomUUID(),id,body.revision,actor.name);
   if(advancement.status!=='advanced')throw Error(advancement.reason);
   const saved=await row(env,id);return reply({...JSON.parse(saved.data_json),id,revision:saved.revision});
  }else if(body.action==='link_campaign'){
   const source=await readContent(env,old.brand),campaign=source.snapshot?.campaigns.find(c=>c.id===body.campaignId);if(!campaign)throw Error('Select an existing publisher campaign for this brand');if(!campaignMatches(old,campaign))throw Error('Campaign captions and media must match this saved package on every destination');
   item={...old,production:{...old.production,campaignId:body.campaignId}};
  }else if(body.action==='approve'){
   if(!old||old.stage!=='approval')throw Error('Send the saved package to human review first');
   const problems=approvalProblems(old);if(problems.length)throw Error(problems.join(' '));
   item={...old,stage:'posting',approval:{by:actor.id,name:actor.name,at:Date.now(),hash:await fingerprint(old)},approvalStale:false};
  }else if(body.action==='request_changes'){
   const note=clean(body.note,2000);if(!note)throw Error('Describe the changes needed');
   item={...old,stage:'editing',approval:null,changeRequest:note};
  }else return reply({error:'Unknown action'},400);
  item.updatedAt=Date.now();item.updatedBy=actor.id;
  item.activity=[{at:item.updatedAt,by:actor.id,name:actor.name,action:body.action},...(old?.activity||[])].slice(0,60);
  const result=existing?await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(item),item.updatedAt,'content_editorial',id,body.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind('content_editorial',id,JSON.stringify(item),item.updatedAt).run();
  if(result.meta.changes!==1)return reply({error:'This item changed. Refresh before saving.'},409);
  return reply({...item,id,revision:existing?existing.revision+1:1});
 }catch(error){return reply({error:error.message||'Could not save the item'},400);}
}
export function baselineSnapshot(input){
 if(!input||!Array.isArray(input.posts)||input.posts.length>20||!Number.isFinite(Date.parse(input.checkedAt)))throw Error('Invalid source baseline');
 const posts=input.posts.map(p=>{const url=new URL(p.url);if(!['www.linkedin.com','linkedin.com'].includes(url.hostname)||url.protocol!=='https:'||url.username||url.password||!url.pathname.startsWith('/feed/update/urn:li:activity:'))throw Error('LinkedIn post permalink required');if(!p.id||!p.title||!p.text||!Number.isFinite(Date.parse(p.observedAt)))throw Error('Source text and observation are required');return {id:clean(p.id,100),title:clean(p.title,180),text:clean(p.text,15000),url:url.toString(),publishedAt:p.publishedAt&&Number.isFinite(Date.parse(p.publishedAt))?p.publishedAt:null,observedAt:p.observedAt,reactions:Number.isSafeInteger(p.reactions)&&p.reactions>=0?p.reactions:null,reposts:Number.isSafeInteger(p.reposts)&&p.reposts>=0?p.reposts:null,note:clean(p.note,1000)};});
 if(new Set(posts.map(p=>p.id)).size!==posts.length)throw Error('Duplicate source posts');return {checkedAt:new Date(input.checkedAt).toISOString(),posts};
}
export async function factoryContext(env){
 const result=await env.DB.prepare('SELECT id,data_json,revision FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 30').bind('content_editorial').all();
 const baseline=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('content_baseline','linkedin').first();
 const liveResearch=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind('content_research','current').first();
 const media=(await listMedia(env)).filter(a=>a.kind!=='poster'&&a.kind!=='avatar').map(a=>({id:a.id,title:a.title,brand:a.brand,kind:a.kind,postId:a.postId,originalId:a.originalId,rightsVerified:a.rightsVerified,provenance:a.provenance,techniques:a.techniques,promptStatus:a.promptStatus}));
 const pipeline=await pipelineState(env);
 return '\nLIVE CONTENT FACTORY: Source posts are immutable observations. Research briefs are not post drafts or customer claims. Approval is for the exact saved package; it does not publish. No social dispatch is granted by this context. Governed decision runs may produce evidence-linked drafts; those remain subject to named human review. Missing analytics remain unavailable. Prioritize gym owners and admin staff, immediate useful takeaways and real WonPlace proof. Never invent footage, customer quotes, savings, retention or revenue results.\n'+JSON.stringify({media,pipeline:pipeline.slice(0,12),researchObservedAt:liveResearch?JSON.parse(liveResearch.data_json).checkedAt:null,baseline:baseline?JSON.parse(baseline.data_json):null,editorial:result.results.map(r=>({id:r.id,revision:r.revision,...JSON.parse(r.data_json)})),research:CONTENT_RESEARCH}).slice(0,28000);
}
