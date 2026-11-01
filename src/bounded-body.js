// Bound bytes while reading; Content-Length alone is not authoritative.
export async function readBoundedBytes(message,limit){
 if(!message.body)return new Uint8Array();
 const reader=message.body.getReader(),chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>limit){
    // A cloned Request is a tee: awaiting this cancellation can deadlock until
    // its other branch is consumed. Initiate cancellation without waiting on it.
    void reader.cancel().catch(()=>{});
    throw new RangeError('Body exceeds byte limit');
   }
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
 }finally{reader.releaseLock();}
}
