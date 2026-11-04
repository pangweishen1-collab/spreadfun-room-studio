// A single, short-lived local worker keeps compression off the preview thread.
let worker=null,serial=0,idle=null,workerUnavailable=false;
const pending=new Map();
function stop(error){
  clearTimeout(idle);idle=null;
  if(worker)worker.terminate();worker=null;
  for(const job of pending.values()){clearTimeout(job.timer);job.reject(error)}pending.clear();
}
function idleSoon(){if(!pending.size){clearTimeout(idle);idle=setTimeout(()=>stop(),5000);idle?.unref?.()}}
function getWorker(){
  if(worker)return worker;
  const current=new Worker(new URL('./avatar-lossless-worker.mjs?v=20261104-lossless1',import.meta.url),{type:'module'});
  current.onmessage=event=>{
    const {id,bytes,error}=event.data||{},job=pending.get(id);if(!job)return;
    clearTimeout(job.timer);pending.delete(id);
    if(error)job.reject(Error(error));else if(bytes instanceof Uint8Array)job.resolve(bytes);else job.reject(Error('Invalid compression result.'));
    idleSoon();
  };
  current.onerror=()=>{workerUnavailable=true;stop(Error('Local compression worker failed.'))};
  worker=current;return current;
}
async function run(type,bytes){
  if(!workerUnavailable&&typeof Worker==='function'){
    const copy=new Uint8Array(bytes);
    try{
      const current=getWorker();clearTimeout(idle);
      return await new Promise((resolve,reject)=>{
        const id=++serial,timer=setTimeout(()=>{workerUnavailable=true;stop(Error('Local compression timed out.'))},60000);
        pending.set(id,{resolve,reject,timer});
        try{current.postMessage({id,type,bytes:copy},[copy.buffer])}catch(error){clearTimeout(timer);pending.delete(id);idleSoon();reject(error)}
      });
    }catch(error){
      // The engine keeps the original asset/native package if a worker fails.
      throw error;
    }
  }
  const codec=await import('./avatar-lossless-codec.mjs?v=20261104-lossless1');
  return codec[type](bytes);
}
export const compressDeflate=bytes=>run('compressDeflate',bytes);
export const optimizePngLossless=bytes=>run('optimizePngLossless',bytes);
