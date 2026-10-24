export async function releaseInfo(request,env){
 let commit=env.RELEASE_COMMIT||null;
 if(env.ASSETS){try{const r=await env.ASSETS.fetch(new Request(new URL('/__build.json',request.url),{method:'GET'}));if(r.ok&&Number(r.headers.get('content-length')||0)<1024){const value=await r.json();if(value.product==='voyage'&&/^[a-f0-9]{40}$/.test(value.commit||''))commit=value.commit;}}catch{}}
 return Response.json({commit,product:'voyage'},{headers:{'cache-control':'no-store'}});
}
