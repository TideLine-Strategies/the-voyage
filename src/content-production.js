import {packageFingerprint} from './content-package.js';
import {advanceMedia,campaignMatches,recordTransition} from './content-pipeline.js';
const C='content_production_jobs';
const read=async(env,c,id)=>{const r=await env.DB.prepare('SELECT data_json,revision FROM documents WHERE collection=? AND id=?').bind(c,id).first();return r?{value:JSON.parse(r.data_json),revision:r.revision}:null;};
export async function productionState(env){const r=await env.DB.prepare('SELECT id,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 30').bind(C).all();return r.results.map(r=>{const {token,...value}=JSON.parse(r.data_json);return {id:r.id,...value,item:undefined,...(value.status==='running'&&value.leaseUntil<Date.now()?{status:'awaiting_recovery',reason:'Production lease expired; safe recovery pending'}:{})};});}
export async function productionAction(env,body){
 if(body.action==='production_verify'){
  const current=(await read(env,'content_editorial',body.itemId))?.value;
  return {authorized:!!current&&current.stage==='posting'&&!!current.approval&&current.approval.hash===body.approvalHash&&current.approval.hash===await packageFingerprint(current)&&current.mediaAssetId===body.mediaAssetId&&current.copy===body.copy};
 }
 if(body.action==='production_claim'){
  const pending=await env.DB.prepare("SELECT id,data_json,revision FROM documents WHERE collection=? AND json_extract(data_json,'$.status')='running' ORDER BY updated_at LIMIT 30").bind(C).all();
  for(const r of pending.results){const j=JSON.parse(r.data_json),receipt=await read(env,'content_pipeline_receipts',(j.mode==='dispatch'?'dispatch-':'production-')+r.id);if(receipt?.value.status==='advanced'){const done={...j,status:'complete',finishedAt:receipt.value.at,advancement:receipt.value};delete done.token;delete done.item;delete done.leaseUntil;await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(done),Date.now(),C,r.id,r.revision).run();}}

  const rows=await env.DB.prepare("SELECT id,data_json,revision FROM documents WHERE collection=? AND json_extract(data_json,'$.stage') IN ('filming','editing','posting') ORDER BY updated_at LIMIT 30").bind('content_editorial').all();
  for(const r of rows.results){const item=JSON.parse(r.data_json),mode={filming:'capture',editing:'editing',posting:'dispatch'}[item.stage];
   if(mode==='dispatch'&&(!item.approval||item.approval.hash!==await packageFingerprint(item)||item.production?.campaignId))continue;
   const id=r.id+'-'+r.revision+'-'+mode,old=await read(env,C,id);if(old&&!(old.value.status==='running'&&old.value.leaseUntil<Date.now()&&old.value.attempts<3))continue;
   const job={itemId:r.id,itemRevision:r.revision,item,mode,status:'running',token:crypto.randomUUID(),attempts:(old?.value.attempts||0)+1,startedAt:Date.now(),leaseUntil:Date.now()+300000};
   const result=old?await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(job),Date.now(),C,id,old.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?)').bind(C,id,JSON.stringify(job),Date.now()).run();
   if(result.meta.changes===1)return {job:{id,...job}};
  }return {job:null};
 }
 const stored=await read(env,C,body.id);if(!stored)throw Error('Production job not found');const job=stored.value;
 if(job.status==='complete')return {accepted:true,duplicate:true};
 if(job.status!=='running'||job.token!==body.token||job.leaseUntil<Date.now())throw Error('Production lease no longer valid');
 const current=await read(env,'content_editorial',job.itemId);const eventId=(job.mode==='dispatch'?'dispatch-':'production-')+body.id;const prior=await read(env,'content_pipeline_receipts',eventId);if(body.action==='production_complete'&&(!current||current.revision!==job.itemRevision)&&!prior)throw Error('Content changed during production');
 let advancement=null;
 if(body.action==='production_complete'){
  if(prior){advancement=prior.value;}else if(job.mode==='dispatch'){
   if(!current.value.approval||current.value.approval.hash!==await packageFingerprint(current.value))throw Error('Current human approval required');
   const snapshot=(await read(env,'content_snapshots',job.item.brand))?.value,campaign=snapshot?.campaigns.find(c=>c.id===body.campaignId);
   if(!campaignMatches(current.value,campaign))throw Error('Exact approved campaign must appear in signed publisher snapshot');
   advancement=await recordTransition(env,{eventId:'dispatch-'+body.id,itemId:job.itemId,expectedRevision:job.itemRevision,from:'posting',to:'posting',patch:{production:{...current.value.production,campaignId:body.campaignId,dispatchedAt:Date.now()}},step:'posting',source:'native-publisher-intake',reason:'Exact human-approved package handed to the native publisher',preserveApproval:true,guard:{collection:C,id:body.id,revision:stored.revision}});
  }else{
   const asset=(await read(env,'content_media',body.assetId))?.value;if(!asset?.ready)throw Error('Verified media receipt required');
   advancement=await advanceMedia(env,asset,'production-'+body.id,job.itemId,job.itemRevision,'Production operator',{collection:C,id:body.id,revision:stored.revision});
  }
  if(advancement.status!=='advanced')throw Error(advancement.reason);
 }else if(body.action!=='production_fail')throw Error('Unknown production action');
 const value={...job,status:body.action==='production_complete'?'complete':'held',finishedAt:Date.now(),assetId:body.assetId||null,campaignId:body.campaignId||null,reason:String(body.reason||'').slice(0,1000),advancement};delete value.token;delete value.item;delete value.leaseUntil;
 await env.DB.prepare('UPDATE documents SET data_json=?,revision=revision+1,updated_at=? WHERE collection=? AND id=? AND revision=?').bind(JSON.stringify(value),Date.now(),C,body.id,stored.revision).run();return {accepted:true,advancement};
}
