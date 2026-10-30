// Scheduler/lifecycle tests. Actual codec pixels are checked by lossless-webp.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
if(!process.execArgv.includes('--experimental-vm-modules')){
  const result=spawnSync(process.execPath,['--experimental-vm-modules',__filename],{stdio:'inherit'});process.exit(result.status??1);
}
const source=fs.readFileSync(path.join(__dirname,'../banner-webp.js'),'utf8');
const fallback='data:text/javascript,'+encodeURIComponent("export async function prepareLosslessWebP(){};export async function encodeWebP(data,w,h,{mode}){return new Uint8Array([data[0],w,h,mode==='lossless'?1:2])}");
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(options={}){
  const workers=[],messages=[],timers=new Map(),jobs=[],completed=[],events=[],storage=new Map();
  if(options.saved!==undefined)storage.set('fun-toolkit-webp-mode',options.saved);
  let serial=0,constructors=0,active=0,maxActive=0,failEncode=!!options.failEncode;
  function finish(job,{error=false,force=false}={}){
    if(job.settled)return;job.settled=true;active--;
    if(job.worker.terminated&&!force)return;
    completed.push(job.tag);
    if(error){job.worker.onmessage({data:{id:job.data.id,error:'encode failed'}});return;}
    const encoded=options.emptyTag===job.tag?new ArrayBuffer(0):new Uint8Array([job.tag,job.data.width,job.data.height,job.data.mode==='lossless'?1:2]).buffer;
    job.worker.onmessage({data:{id:job.data.id,encoded}});
  }
  class Worker{
    constructor(url,settings){
      this.number=++constructors;
      if(options.throwStart)throw Error('workers unavailable');
      assert.match(url,/webp-encoder-worker\.mjs\?v=/);assert.equal(settings.type,'module');workers.push(this);
    }
    terminate(){
      if(this.terminated)return;this.terminated=true;
      for(const job of jobs)if(job.worker===this&&!job.settled){job.settled=true;active--;}
    }
    postMessage(message,transfer=[]){
      const data=structuredClone(message,{transfer});messages.push({worker:this.number,...data});
      if(options.hangPrepare&&data.type==='prepare')return;
      queueMicrotask(()=>{
        if(this.terminated)return;
        if(data.type==='prepare'){
          if(options.brokenStart||options.brokenSecondary&&this.number===2)this.onerror({});else this.onmessage({data:{id:data.id}});
          return;
        }
        assert.equal(data.type,'encode');assert.ok(['high','lossless'].includes(data.mode));
        assert.ok(!jobs.some(job=>job.worker===this&&!job.settled),'one job at a time owns each worker');
        const job={worker:this,data,tag:new Uint8Array(data.pixels)[0],settled:false};jobs.push(job);active++;maxActive=Math.max(maxActive,active);
        if(options.manual)return;
        queueMicrotask(()=>{const error=failEncode;failEncode=false;finish(job,{error});});
      });
    }
  }
  const sandbox={Worker:options.noWorker?undefined:Worker,Blob,Uint8Array,Uint8ClampedArray,ArrayBuffer,Number,Map,Promise,Error,
    window:{},document:{dispatchEvent(event){events.push({type:event.type,...event.detail});}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
    localStorage:{getItem(key){if(options.storageError)throw Error('storage unavailable');return storage.get(key);},setItem(key,value){if(options.storageError)throw Error('storage unavailable');storage.set(key,value);}},
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}};
  if(options.hardware!==undefined||options.memory!==undefined)sandbox.navigator={hardwareConcurrency:options.hardware,deviceMemory:options.memory};
  vm.createContext(sandbox);
  new vm.Script(source+'\nthis.api={prepare:prepareBannerWebP,encode:canvasToWebP,exact:canvasToLosslessWebP,settings:webpSettings,createPool:createWebPPool};',{importModuleDynamically:()=>import(fallback)}).runInContext(sandbox);
  return {api:sandbox.api,workers,messages,timers,jobs,completed,events,storage,finish,maxActive:()=>maxActive,get active(){return active;}};
}
function canvas(tag=20){
  const pixels=new Uint8ClampedArray([tag,30,40,255]);
  return {width:1,height:1,pixels,getContext(){return {getImageData(){return {data:pixels.slice()};}};}};
}
const bytes=async blob=>Array.from(new Uint8Array(await blob.arrayBuffer()));
async function waitJobs(state,count){for(let i=0;i<40&&state.jobs.length<count;i++)await flush();assert.ok(state.jobs.length>=count,'expected native encode to start');}
(async()=>{
  const one=setup(),a=canvas(19),b=canvas(29);
  const result=await Promise.all([one.api.exact(a),one.api.exact(b)]);await flush();
  assert.equal(one.workers.length,1);assert.equal(one.messages.filter(x=>x.type==='prepare').length,1);assert.equal(one.maxActive(),1,'unknown hardware keeps one warmed codec');
  assert.equal(one.timers.size,0);assert.deepEqual(await bytes(result[0]),[19,1,1,1]);assert.equal(result[0].type,'image/webp');assert.equal(a.pixels.byteLength,4,'source canvas pixels are never transferred away');assert.equal(one.api.settings.getPending(),0);
  const backing=new Uint8ClampedArray([1,2,3,4,91,92,93,255]),view=backing.subarray(4),partial={width:1,height:1,getContext(){return {getImageData(){return {data:view};}};}};
  assert.deepEqual(await bytes(await one.api.encode(partial)),[91,1,1,2]);assert.equal(backing.buffer.byteLength,8);assert.deepEqual(Array.from(backing),[1,2,3,4,91,92,93,255],'a typed-array subview cannot transfer its unrelated backing bytes');

  const parallel=setup({hardware:8,memory:8,manual:true});
  const ordered=Promise.all([parallel.api.encode(canvas(11)),parallel.api.encode(canvas(22),{mode:'lossless'}),parallel.api.encode(canvas(33))]);
  assert.equal(parallel.api.settings.getPending(),3);assert.equal(parallel.api.settings.setMode('lossless'),false,'global settings lock across queued and active work');
  await waitJobs(parallel,2);assert.equal(parallel.workers.length,2);assert.equal(parallel.maxActive(),2);parallel.finish(parallel.jobs[1]);await waitJobs(parallel,3);parallel.finish(parallel.jobs[2]);parallel.finish(parallel.jobs[0]);
  const orderedBlobs=await ordered;await flush();assert.deepEqual(await Promise.all(orderedBlobs.map(bytes)),[[11,1,1,2],[22,1,1,1],[33,1,1,2]],'reverse completion retains request/pixel/mode ownership');assert.deepEqual(parallel.completed,[22,33,11]);assert.equal(parallel.api.settings.getPending(),0);assert.equal(parallel.timers.size,0);
  assert.equal(parallel.api.settings.setMode('lossless'),true);assert.equal(parallel.storage.get('fun-toolkit-webp-mode'),'lossless');assert.deepEqual(parallel.events.filter(e=>e.type==='webp:mode-change'),[{type:'webp:mode-change',mode:'lossless',previous:'high'}]);
  assert.equal(parallel.events.filter(e=>e.type==='webp:activity-change').at(-1).pending,0);const idleModeEvents=parallel.events.length;assert.equal(parallel.api.settings.setMode('lossless'),true);assert.equal(parallel.api.settings.setMode('jpeg'),false);assert.equal(parallel.api.settings.setMode(null),false);assert.equal(parallel.events.length,idleModeEvents,'same/invalid modes do not emit fake updates');
  for(const [hardware,memory] of [[3,8],[8,2]]){
    const low=setup({hardware,memory,manual:true}),jobs=Promise.all([low.api.encode(canvas(1)),low.api.encode(canvas(2))]);await waitJobs(low,1);await flush();assert.equal(low.workers.length,1);low.finish(low.jobs[0]);await waitJobs(low,2);low.finish(low.jobs[1]);await jobs;assert.equal(low.maxActive(),1,'low device budgets retain serialized encoding');
  }
  assert.equal(setup({saved:'lossless'}).api.settings.getMode(),'lossless');assert.equal(setup({saved:'bad'}).api.settings.getMode(),'high');assert.equal(setup({saved:'high '}).api.settings.getMode(),'high');const unavailableStorage=setup({storageError:true});assert.equal(unavailableStorage.api.settings.getMode(),'high');assert.equal(unavailableStorage.api.settings.setMode('lossless'),true);

  const retry=setup({failEncode:true});const rejected=retry.api.encode(canvas()),queued=retry.api.encode(canvas(80));await assert.rejects(rejected,/encode failed/);assert.equal((await queued).size,4);await flush();assert.equal(retry.workers.length,2);assert.equal(retry.workers[0].terminated,true);assert.equal(retry.api.settings.getPending(),0);assert.equal(retry.timers.size,0);
  for(const flags of [{brokenStart:true},{throwStart:true},{noWorker:true}]){
    const local=setup(flags);await local.api.prepare();assert.deepEqual(await bytes(await local.api.encode(canvas(67))),[67,1,1,2]);assert.deepEqual(await bytes(await local.api.exact(canvas(68))),[68,1,1,1]);assert.equal(local.workers.length,flags.throwStart||flags.noWorker?0:1,'a failed first worker uses a single shared mode-aware codec fallback');if(local.workers.length)assert.equal(local.workers[0].terminated,true);assert.equal(local.api.settings.getPending(),0);
  }
  const secondary=setup({hardware:8,memory:8,brokenSecondary:true,manual:true});const preserved=Promise.all([secondary.api.encode(canvas(1)),secondary.api.encode(canvas(2)),secondary.api.exact(canvas(3))]);await waitJobs(secondary,1);await flush();assert.equal(secondary.workers.length,2);assert.equal(secondary.workers[1].terminated,true);assert.equal(secondary.workers[0].terminated,undefined);secondary.finish(secondary.jobs[0]);await waitJobs(secondary,2);secondary.finish(secondary.jobs[1]);await waitJobs(secondary,3);secondary.finish(secondary.jobs[2]);assert.deepEqual(await Promise.all((await preserved).map(bytes)),[[1,1,1,2],[2,1,1,2],[3,1,1,1]]);assert.equal(secondary.maxActive(),1,'secondary startup failure preserves and reuses the functioning primary');assert.ok(secondary.jobs.every(job=>job.worker===secondary.workers[0]));
  const timeout=setup({hangPrepare:true}),waiting=timeout.api.prepare();assert.equal(timeout.timers.size,1);for(const timer of [...timeout.timers.values()])timer.fn();await waiting;assert.equal(timeout.workers[0].terminated,true);assert.deepEqual(await bytes(await timeout.api.encode(canvas(73))),[73,1,1,2]);
  const encodeTimeout=setup({manual:true}),stalled=encodeTimeout.api.encode(canvas(17)),stalledRejected=assert.rejects(stalled,/encoderError/);await waitJobs(encodeTimeout,1);for(const timer of [...encodeTimeout.timers.values()])timer.fn();await stalledRejected;await flush();assert.equal(encodeTimeout.api.settings.getPending(),0);assert.equal(encodeTimeout.workers[0].terminated,true);const afterTimeout=encodeTimeout.api.exact(canvas(18));await waitJobs(encodeTimeout,2);encodeTimeout.finish(encodeTimeout.jobs[1]);assert.deepEqual(await bytes(await afterTimeout),[18,1,1,1]);await flush();assert.equal(encodeTimeout.timers.size,0);

  // Isolate scheduler byte-budget arithmetic without allocating synthetic
  // hundred-megabyte canvases. Public API ownership/dimensions use real arrays above.
  const bounded=setup({hardware:8,memory:8,manual:true}),pool=bounded.api.createPool();await pool.prepare();
  const fakePixels=tag=>{const buffer=new Uint8Array([tag,0,0,255]).buffer;return {byteLength:33*1024*1024,buffer};};
  const largeA=pool.encode(fakePixels(41),1,1,'high'),largeB=pool.encode(fakePixels(42),1,1,'lossless');await waitJobs(bounded,1);await flush();assert.equal(bounded.jobs.length,1,'two 33 MiB jobs cannot exceed the 64 MiB parallel pixel budget despite an idle second worker');bounded.finish(bounded.jobs[0]);await waitJobs(bounded,2);bounded.finish(bounded.jobs[1]);await Promise.all([largeA,largeB]);await flush();assert.equal(bounded.maxActive(),1);assert.ok(bounded.workers.every(worker=>worker.terminated),'large-job WASM heaps retire after the job settles');
  const ordinary=pool.encode(new Uint8ClampedArray([43,0,0,255]),1,1,'high');await waitJobs(bounded,3);bounded.finish(bounded.jobs[2]);await ordinary;await flush();assert.equal(bounded.workers.length,3,'the queue creates a fresh worker after retiring all unusually large heaps');assert.equal(bounded.workers.at(-1).terminated,undefined,'ordinary jobs retain their warmed worker');
  const empty=setup({emptyTag:61});await assert.rejects(empty.api.encode(canvas(61)),/exportError/);assert.equal(empty.api.settings.getPending(),0);assert.equal((await empty.api.encode(canvas(62))).size,4);
  const invalid=setup();for(const [sample,options] of [[{...canvas(),width:0},{}],[canvas(),{mode:'png'}],[{...canvas(),height:16384},{}]])await assert.rejects(invalid.api.encode(sample,options),/exportError/);assert.equal(invalid.workers.length,0);assert.equal(invalid.api.settings.getPending(),0);
  console.log('PASS: bounded two-worker WebP scheduling/reverse completion, device and pixel-memory limits, large-heap retirement, exact/high mode ownership/storage/pending locks, source/view ownership, mode-aware fallback, startup/runtime failure recovery, timeout cleanup and invalid outputs. Real codec pixels are checked separately.');
})().catch(error=>{console.error(error);process.exitCode=1});
