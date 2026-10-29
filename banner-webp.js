/* Shared exact-lossless WebP export for every image tool. On-device only. */
'use strict';
let webpBackend,webpQueue=Promise.resolve();
function createWebPWorker(){
  const worker=new Worker('./webp-encoder-worker.mjs?v=20261029-lossless1',{type:'module'}),pending=new Map();
  let serial=0,failed=false,ready=false;
  function fail(error){
    if(failed)return;failed=true;worker.terminate();if(ready)webpBackend=null;
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(error)}pending.clear();
  }
  worker.onmessage=({data})=>{
    const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);
    if(data.error){const error=new Error(data.error);job.reject(error);fail(error);return}
    job.resolve(data.encoded?new Uint8Array(data.encoded):undefined);
  };
  worker.onerror=()=>fail(new Error('encoderError'));
  worker.onmessageerror=()=>fail(new Error('encoderError'));
  function request(type,fields={},transfer=[]){
    if(failed)return Promise.reject(new Error('encoderError'));
    return new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(()=>fail(new Error('encoderError')),type==='prepare'?20000:180000);
      pending.set(id,{resolve,reject,timer});
      try{worker.postMessage({id,type,...fields},transfer)}catch(error){fail(error)}
    });
  }
  return {prepare:async()=>{await request('prepare');ready=true},encode:(data,width,height)=>request('encode',{pixels:data.buffer,width,height},[data.buffer]),dispose:()=>fail(new Error('encoderError'))};
}
function prepareBannerWebP(){
  if(!webpBackend)webpBackend=(async()=>{
    if(typeof Worker==='function'){
      let backend;
      try{backend=createWebPWorker();await backend.prepare();return backend}
      catch(error){backend?.dispose()}
    }
    // Worker-unavailable browsers use the same lossless codec and settings.
    const module=await import('./webp-encode.mjs?v=20261029-lossless1');
    await module.prepareLosslessWebP();return {encode:module.encodeLosslessWebP};
  })().catch(error=>{webpBackend=null;throw new Error('encoderError',{cause:error})});
  return webpBackend;
}
async function canvasToLosslessWebP(canvas){
  const {width,height}=canvas;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16383||height>16383||width*height>40000000)throw new Error('exportError');
  const pixels=canvas.getContext('2d').getImageData(0,0,width,height).data;
  const job=webpQueue.then(async()=>{
    const backend=await prepareBannerWebP(),encoded=await backend.encode(pixels,width,height);
    if(!encoded?.byteLength)throw new Error('exportError');
    return new Blob([encoded],{type:'image/webp'});
  });
  webpQueue=job.catch(()=>{});return job;
}
