import {packageFingerprint} from './content-package.js';
// Signed completion receipts and editor actions are the only sources of movement.
// A model recommendation is never treated as a recording, approval or delivery.
const collection='content_pipeline_receipts';
async function read(env,c,id){const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(c,id).first();return r?{value:JSON.parse(r.data_json),revision:r.revision}:null;}
export async function recordTransition(env,{eventId,itemId,expectedRevision,from,to,patch={},step,source,reason,actor='Content operator',preserveApproval=false,guard=null}){
 const prior=await read(env,collection,eventId);if(prior)return {...prior.value,duplicate:true};
 const stored=await read(env,'content_editorial',itemId);const at=Date.now();
 const eligible=!!stored&&stored.revision===expectedRevision&&stored.value.stage===from;
 const receipt={eventId,itemId,step,source,at,from,to:eligible?to:from,status:eligible?'advanced':'held',reason:eligible?reason:!stored?'Item no longer exists':stored.revision!==expectedRevision?'Item changed after this work began':'Item is at another station'};
 if(!eligible){await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind(collection,eventId,JSON.stringify(receipt),at).run();return receipt;}
 const old=stored.value,next={...old,...patch,stage:to,approval:preserveApproval?old.approval:null,approvalStale:preserveApproval?old.approvalStale:!!old.approval,updatedAt:at,updatedBy:'content-pipeline',production:{...old.production,...patch.production,lastEvent:eventId},activity:[{at,by:'content-pipeline',name:actor,action:reason},...(old.activity||[])].slice(0,60)};
 const result=await env.DB.batch([
  env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=?)'+(guard?' AND EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND revision=?)':'')).bind(JSON.stringify(next),at,'content_editorial',itemId,expectedRevision,collection,eventId,...(guard?[guard.collection,guard.id,guard.revision]:[])),
  env.DB.prepare("INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM documents WHERE collection=? AND id=? AND json_extract(data_json,'$.production.lastEvent')=?)").bind(collection,eventId,JSON.stringify(receipt),at,'content_editorial',itemId,eventId)
 ]);
 return result[0].meta.changes===1?receipt:{...receipt,status:'held',reason:'Another edit or completion won the race'};
}
export function campaignMatches(item,campaign){
 const deliveries=campaign?.deliveries||[];
 return !!deliveries.length&&deliveries.every(d=>d.caption?.trim()===item.copy?.trim()&&(!item.mediaAssetId||(d.assets||[]).some(a=>a.sha256===item.mediaAssetId)));
}
async function hold(env,eventId,itemId,step,reason){
 const prior=await read(env,collection,eventId);if(prior)return {...prior.value,duplicate:true};
 const receipt={eventId,itemId,step,at:Date.now(),status:'held',reason};
 await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind(collection,eventId,JSON.stringify(receipt),receipt.at).run();return receipt;
}
export async function advanceDecision(env,run,decision,runId){
 const itemId=run.itemId||run.input?.item?.id,revision=run.itemRevision??run.input?.item?.revision;
 if(!itemId||!Number.isSafeInteger(revision)||decision?.verdict!=='proceed')return {status:'held',reason:!itemId?'Library-only decision':decision?.verdict||'Missing item revision'};
 if(!['research','scripting'].includes(run.step))return hold(env,'decision-'+runId,itemId,run.step,run.step==='approval'?'Named human approval required':run.step==='posting'?'Provider publication receipt required':run.step==='analytics'?'A review does not create platform metrics':'Completed media artifact required');
 if(run.step==='scripting'&&(!decision.draftCopy?.trim()||!decision.shotList?.length))return {status:'held',reason:'Script and proposed shots are both required'};
 const old=await read(env,'content_editorial',itemId);if(!old)return {status:'held',reason:'Item not found'};
 const facts=[...(run.input.research?.observations||[]),...(run.input.research?.complaints||[]),...(run.input.research?.features||[]),...(run.input.research?.creators||[])];
 const evidence=decision.evidenceIds.map(id=>facts.find(s=>s.id===id)?.url).filter(Boolean);
 const patch={sourceUrls:[...new Set([...(old.value.sourceUrls||[]),...evidence])].slice(0,12),production:{...old.value.production,steps:{...old.value.production?.steps,[run.step]:{runId,at:Date.now(),summary:decision.summary,evidenceIds:decision.evidenceIds,shotList:decision.shotList||[]}}},...(run.step==='scripting'?{copy:decision.draftCopy}:{})};
 return recordTransition(env,{eventId:'decision-'+runId,itemId,expectedRevision:revision,from:run.step,to:run.step==='research'?'scripting':'filming',patch,step:run.step,source:'signed-decision-completion',reason:run.step==='research'?'Evidence-backed research completed':'Unapproved script and shot list completed'});
}
export async function advanceMedia(env,asset,eventId,editorialId=asset.editorialId,expectedRevision,actor,guard=null){
 if(!editorialId)return {status:'held',reason:'Media is in the library; no editorial item attached'};
 const stored=await read(env,'content_editorial',editorialId);if(!stored)return {status:'held',reason:'Editorial item not found'};
 const item=stored.value;if(item.brand!==asset.brand||asset.mime!=='video/mp4'||!asset.ready)return {status:'held',reason:'A ready video for this brand is required'};
 let from,to,patch;
 if(item.stage==='filming'&&['original','capture'].includes(asset.kind)){from='filming';to='editing';patch={mediaAssetId:'',mediaRightsVerified:false,mediaProfileUrl:'',production:{...item.production,captureAssetId:asset.id}};}
 else if(item.stage==='editing'&&asset.kind==='branded'&&asset.rightsVerified===true&&(!item.production?.captureAssetId||item.production.captureAssetId===asset.originalId)){from='editing';to='approval';patch={mediaAssetId:asset.id,mediaRightsVerified:true,mediaProfileUrl:asset.profileUrl,production:{...item.production,finalAssetId:asset.id,captureAssetId:asset.originalId}};}
 else return {status:'held',reason:item.stage==='editing'?'A publisher-branded final with verified rights is required':'Media cannot skip the current station'};
 return recordTransition(env,{eventId,itemId:editorialId,expectedRevision:expectedRevision??stored.revision,from,to,patch,step:from,source:'verified-media',actor,guard,reason:to==='editing'?'Constructed footage verified':'Final cut and publisher identity verified; awaiting human approval'});
}
export async function pipelineState(env){const r=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 30').bind(collection).all();return r.results.map(x=>JSON.parse(x.data_json));}

export async function reconcilePublications(env,snapshot){
 const rows=await env.DB.prepare('SELECT id,data_json,revision FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 100').bind('content_editorial').all();
 for(const r of rows.results){const item=JSON.parse(r.data_json);if(item.brand!==snapshot.brand||item.stage!=='posting'||!item.production?.campaignId||!item.approval||item.approval.hash!==await packageFingerprint(item))continue;
  const c=snapshot.campaigns.find(c=>c.id===item.production.campaignId);if(!campaignMatches(item,c)||!c.deliveries.every(d=>d.state==='published'&&d.url))continue;
  await recordTransition(env,{eventId:'published-'+r.id+'-'+item.approval.hash,itemId:r.id,expectedRevision:r.revision,from:'posting',to:'published',patch:{production:{...item.production,publishedAt:Date.now(),deliveries:c.deliveries.map(d=>({platform:d.platform,url:d.url,observedAt:snapshot.checkedAt}))}},step:'posting',source:'signed-publisher-snapshot',reason:'All linked destination publication receipts observed',preserveApproval:true});
 }
}
