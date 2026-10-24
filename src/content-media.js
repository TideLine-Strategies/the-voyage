import {advanceMedia} from './content-pipeline.js';
import {Buffer} from 'node:buffer';
const C='content_media',CH='content_media_chunks',CHUNK=262144,MAX=32*1024*1024;
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'private, no-store'}});
const idOK=id=>/^[a-f0-9]{64}$/.test(id||'');
export const mediaHash=async b=>Buffer.from(await crypto.subtle.digest('SHA-256',b)).toString('hex');
async function get(env,c,id){const row=await env.DB.prepare('SELECT data_json FROM documents WHERE collection=? AND id=?').bind(c,id).first();return row?JSON.parse(row.data_json):null;}
async function put(env,c,id,d){return env.DB.prepare('INSERT INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=documents.revision+1,updated_at=excluded.updated_at').bind(c,id,JSON.stringify(d),Date.now()).run();}
export async function listMedia(env){const notes=await env.DB.prepare('SELECT id,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 80').bind('content_media_notes').all();const byId=new Map(notes.results.map(r=>[r.id,JSON.parse(r.data_json)]));const r=await env.DB.prepare('SELECT id,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 80').bind(C).all();return r.results.map(r=>({...JSON.parse(r.data_json),...byId.get(r.id),id:r.id})).filter(a=>a.ready);}
export function mediaDeclaration(d){
 if(!idOK(d.id)||!Number.isSafeInteger(d.size)||d.size<1||d.size>MAX||!['video/mp4','image/png','image/jpeg','image/webp'].includes(d.mime)||!['tideline','wonplace'].includes(d.brand)||!['avatar','original','branded','capture','poster'].includes(d.kind))throw Error('Invalid media declaration');
 if(d.editorialId&&!Number.isSafeInteger(d.editorialRevision))throw Error('Editorial revision required');
 if(d.kind==='poster'&&!idOK(d.originalId))throw Error('Poster source required');
 if(d.kind==='branded'&&(!idOK(d.avatarId)||!idOK(d.originalId)))throw Error('Original and avatar identities required');
 const url=new URL(d.profileUrl);if(url.protocol!=='https:'||url.username||url.password||!['www.linkedin.com','linkedin.com','x.com','www.facebook.com','www.instagram.com'].includes(url.hostname))throw Error('Verified destination profile required');
 if(d.editorialId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(d.editorialId))throw Error('Invalid editorial identity');
 return {editorialId:d.editorialId||null,editorialRevision:d.editorialRevision??null,techniques:(Array.isArray(d.techniques)?d.techniques:[]).slice(0,12).map(v=>String(v).slice(0,1000)),promptStatus:String(d.promptStatus||'Not supplied').slice(0,300),id:d.id,title:String(d.title||'').slice(0,180),size:d.size,mime:d.mime,brand:d.brand,kind:d.kind,profileUrl:url.toString(),originalId:d.originalId||null,avatarId:d.avatarId||null,postId:String(d.postId||'').slice(0,100),provenance:String(d.provenance||'').slice(0,2000),rights:String(d.rights||'').slice(0,1000),rightsVerified:d.rightsVerified===true,capturedAt:d.capturedAt||null,chunkCount:Math.ceil(d.size/CHUNK),ready:false};
}
export async function ingestMedia(env,body){
 const {action,id}=body;if(!idOK(id))return json({error:'Invalid media identity'},400);
 try{
  if(action==='annotate'){
   const item=await get(env,C,id);if(!item?.ready)throw Error('Verified media required');
   const notes=body.notes||{};const safe={techniques:(Array.isArray(notes.techniques)?notes.techniques:[]).slice(0,12).map(v=>String(v).slice(0,1200)),promptStatus:String(notes.promptStatus||'Not supplied').slice(0,300),updatedAt:Date.now()};
   await put(env,'content_media_notes',id,safe);return json({id,annotated:true});
  }
  if(action==='declare'){const item=mediaDeclaration(body.asset),old=await get(env,C,id);if(item.id!==id)throw Error('Identity mismatch');if(old&&(old.size!==item.size||old.mime!==item.mime))throw Error('Immutable media mismatch');if(!old)await put(env,C,id,item);return json({id,ready:old?.ready||false});}
  const item=await get(env,C,id);if(!item)return json({error:'Declare the media first'},404);
  if(item.ready)return json({id,ready:true,advancement:action==='commit'?await advanceMedia(env,item,'media-'+id,item.editorialId,item.editorialRevision):null});
  if(action==='chunks'){
   if(!Array.isArray(body.chunks)||body.chunks.length>4)throw Error('Bounded chunks required');
   for(const c of body.chunks){if(!Number.isSafeInteger(c.index)||c.index<0||c.index>=item.chunkCount||typeof c.data!=='string'||c.data.length>350000||!/^[A-Za-z0-9+/]*={0,2}$/.test(c.data))throw Error('Invalid chunk');const bytes=Buffer.from(c.data,'base64');const expected=Math.min(CHUNK,item.size-c.index*CHUNK);if(bytes.length!==expected||await mediaHash(bytes)!==c.sha256)throw Error('Chunk integrity failed');await put(env,CH,id+'_'+c.index,{data:c.data,sha256:c.sha256});}
   return json({id,accepted:true});
  }
  if(action==='commit'){
   const bytes=new Uint8Array(item.size);for(let i=0;i<item.chunkCount;i++){const chunk=await get(env,CH,id+'_'+i);if(!chunk)throw Error('Missing media chunk');bytes.set(Buffer.from(chunk.data,'base64'),i*CHUNK);}
   if(await mediaHash(bytes)!==id)throw Error('Whole-file integrity failed');
   if(item.kind==='branded'){const original=await get(env,C,item.originalId),avatar=await get(env,C,item.avatarId);if(!original?.ready||!avatar?.ready||avatar.kind!=='avatar'||avatar.brand!==item.brand||avatar.profileUrl!==item.profileUrl)throw Error('Brand identity is not verified');}
   if(item.kind==='poster'){const original=await get(env,C,item.originalId);if(!original?.ready||original.brand!==item.brand||original.profileUrl!==item.profileUrl)throw Error('Poster source identity is not verified');}
   if(item.kind==='branded'){const original=await get(env,C,item.originalId);item.rightsVerified=original.rightsVerified===true;}
   const ready={...item,id,ready:true,verifiedAt:new Date().toISOString()};await put(env,C,id,ready);const advancement=await advanceMedia(env,ready,'media-'+id,ready.editorialId,ready.editorialRevision);return json({id,ready:true,advancement});
  }
  return json({error:'Unknown media operation'},400);
 }catch(e){return json({error:e.message},400);}
}
export function byteRange(header,size){if(!header)return {start:0,end:size-1,partial:false};const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))return null;let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Math.min(size-1,Number(m[2])):size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;return {start,end,partial:true};}
export async function serveMedia(request,env,actor,id){
 if(actor.role!=='edit')return json({error:'Not available to guests'},403);if(!['GET','HEAD'].includes(request.method)||!idOK(id))return json({error:'Not found'},404);
 const item=await get(env,C,id);if(!item?.ready)return json({error:'Not found'},404);const range=byteRange(request.headers.get('range'),item.size);
 if(!range)return new Response(null,{status:416,headers:{'content-range':`bytes */${item.size}`,'cache-control':'private, no-store'}});
 const h={'content-type':item.mime,'content-length':String(range.end-range.start+1),'accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline','cross-origin-resource-policy':'same-origin'};if(range.partial)h['content-range']=`bytes ${range.start}-${range.end}/${item.size}`;
 let index=Math.floor(range.start/CHUNK),last=Math.floor(range.end/CHUNK);
 const stream=request.method==='HEAD'?null:new ReadableStream({async pull(controller){try{if(index>last){controller.close();return;}const c=await get(env,CH,id+'_'+index);if(!c)throw Error('Stored media unavailable');const bytes=Buffer.from(c.data,'base64'),offset=index*CHUNK;controller.enqueue(bytes.subarray(Math.max(0,range.start-offset),Math.min(bytes.length,range.end-offset+1)));index++;}catch(e){controller.error(e);}}});
 return new Response(stream,{status:range.partial?206:200,headers:h});
}
