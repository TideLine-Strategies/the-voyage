const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
export async function handleWonPlaceTickets(request,env,actor,path,transport=fetch){
 if(actor.role!=='edit')return reply({error:'Company tickets are available to editors only.'},403);
 if(!['GET','PATCH'].includes(request.method))return reply({error:'Method not allowed'},405);
 const suffix=path.slice(2);
 if(suffix.length>3||(suffix[0]&&!/^[0-9a-f-]{36}$/i.test(suffix[0]))||(suffix.length>1&&(suffix[1]!=='attachments'||!/^\d$/.test(suffix[2]||'')))||(request.method==='PATCH'&&suffix.length!==1))return reply({error:'Unknown ticket operation'},404);
 if(!env.WONPLACE_TICKETS_ORIGIN||!env.WONPLACE_TICKETS_SECRET)return reply({error:'WonPlace ticket connection is not configured.',connected:false},503);
 let origin;try{origin=new URL(env.WONPLACE_TICKETS_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();}catch{return reply({error:'Ticket connection origin is invalid.'},503);}
 const target=new URL('/api/integrations/voyage/tickets'+(suffix.length?'/'+suffix.join('/'):''),origin);
 const offset=new URL(request.url).searchParams.get('offset');if(offset!==null)target.searchParams.set('offset',offset);
 let body='';if(request.method==='PATCH'){
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing ticket update'},400);
  const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return reply({error:'Ticket update is too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let index=0;for(const chunk of chunks){bytes.set(chunk,index);index+=chunk.byteLength;}
  try{body=JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)));}catch{return reply({error:'Invalid ticket update'},400);}
 }
 const time=String(Date.now()),identity=String(actor.id).replace(/[^a-zA-Z0-9 _.-]/g,'').slice(0,200);
 const text=[request.method,target.pathname+target.search,time,identity,body].join('\n');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WONPLACE_TICKETS_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 try{
  const upstream=await transport(target.toString(),{method:request.method,headers:{'content-type':'application/json','x-voyage-time':time,'x-voyage-actor':identity,'x-voyage-signature':signature},...(body?{body}:{}),redirect:'manual',...(typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(15000)}:{})});
  if(upstream.status>=300&&upstream.status<400)return reply({error:'WonPlace ticket source redirected unexpectedly. No save was confirmed.'},502);
  const headers=new Headers(JSON_HEADERS);
  if(suffix[1]==='attachments'&&upstream.ok){headers.set('content-type','application/octet-stream');headers.set('content-disposition',upstream.headers.get('content-disposition')||'attachment');return new Response(upstream.body,{status:upstream.status,headers});}
  if(!(upstream.headers.get('content-type')||'').includes('application/json'))return reply({error:'WonPlace tickets are temporarily unavailable.'},503);
  return new Response(upstream.body,{status:upstream.status,headers});
 }catch{return reply({error:'WonPlace ticket connection is unavailable. No save was confirmed.'},503);}
}
