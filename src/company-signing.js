// Shared signing contract for private source reads and bounded collectors.
export async function signedHeaders(secret,method,url,actor,body='') {
  const time=String(Date.now()),path=new URL(url).pathname+new URL(url).search;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode([method,path,time,actor,body].join('\n')));
  return {'content-type':'application/json','x-voyage-time':time,'x-voyage-actor':actor,'x-voyage-signature':[...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
export async function verifySource(request,secret,body) {
  if(typeof secret!=='string'||secret.length<32)return false;
  const time=request.headers.get('x-voyage-time'),actor=request.headers.get('x-voyage-actor'),sig=request.headers.get('x-voyage-signature')||'';
  if(!time||!Number.isFinite(Number(time))||Math.abs(Date.now()-Number(time))>60000||!actor||!/^[a-zA-Z0-9 _.-]{1,200}$/.test(actor)||!/^[a-f0-9]{64}$/.test(sig))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode([request.method,new URL(request.url).pathname+new URL(request.url).search,time,actor,body].join('\n')));
}
