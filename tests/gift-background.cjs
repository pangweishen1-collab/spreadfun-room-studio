'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function tests(){
  // Exercise the runtime configuration without loading a model or allocating a
  // WASM session. The models must share this one environment and never reset
  // the selected thread count from their own modules.
  const runtimeSource=fs.readFileSync(path.join(root,'gift-matting-runtime.mjs'),'utf8');
  const runtimeScript=runtimeSource.replace(/^import .*;$/m,'const ort=globalThis.__ort;')
    .replace(/^export \{ort\};$/m,'').replace(/^export function /m,'function ')
    .replace('import.meta.url',JSON.stringify(pathToFileURL(path.join(root,'gift-matting-runtime.mjs')).href));
  for(const [isolated,shared,cores,expected] of [[true,true,16,4],[true,true,2,2],[true,true,1,1],[false,true,16,1],[undefined,true,16,1],[true,false,16,1],[true,true,undefined,1],[true,true,0,1]]){
    const scope={__ort:{env:{wasm:{}}},URL,navigator:{hardwareConcurrency:cores},crossOriginIsolated:isolated};
    scope.SharedArrayBuffer=shared?function SharedArrayBuffer(){}:undefined;
    vm.runInNewContext(runtimeScript,scope);
    assert.equal(scope.__ort.env.wasm.numThreads,expected,`threads isolated=${isolated}, shared=${shared}, cores=${cores}`);
    assert.equal(scope.__ort.env.wasm.proxy,false);assert.equal(scope.__ort.env.logLevel,'error');
  }
  for(const filename of ['gift-background-ai.mjs','gift-matting-refine.mjs']){
    const source=fs.readFileSync(path.join(root,filename),'utf8');
    assert.match(source,/import \{ort\} from '\.\/gift-matting-runtime\.mjs\?v=20261025-speed1'/);
    assert.doesNotMatch(source,/ort\.env\.wasm\./,'model modules never override the shared runtime configuration');
  }
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gift-background-lazy-'));
  try{
    fs.copyFileSync(path.join(root,'gift-background-worker.js'),path.join(temporary,'worker.mjs'));
    fs.copyFileSync(path.join(root,'gift-background-matte.mjs'),path.join(temporary,'gift-background-matte.mjs'));
    fs.copyFileSync(path.join(root,'gift-quality-matte.mjs'),path.join(temporary,'gift-quality-matte.mjs'));
    const messages=[],handlers=new Map();
    let resolveWorker;
    global.self={addEventListener(type,handler){handlers.set(type,handler)},postMessage(message,transfer){messages.push({message,transfer});if(message.id===11&&(message.type==='result'||message.type==='error'))resolveWorker?.(message)}};
    const {routeBackground}=await import(pathToFileURL(path.join(temporary,'worker.mjs')));
    const native=new Uint8ClampedArray(96*48*4);for(let pixel=0;pixel<96*48;pixel++)native[pixel*4+3]=255;
    const prior={width:96,height:48,data:new Uint8ClampedArray(96*48),recoverBlack:false,method:'ai'};
    for(let y=10;y<38;y++)for(let x=24;x<72;x++){native.set([60,20,5,255],(y*96+x)*4);prior.data[y*96+x]=255}
    const shadow=24*96+48;native.set([3,2,1,255],shadow*4);
    native.set([22,7,0,255],(20*96+40)*4);
    const particle=5*96+12;native.set([22,7,0,255],particle*4);
    const order=[],qualityProgress=[],darkInput={type:'remove',id:1,width:96,height:48,data:native},beforeDark=native.slice();
    const mockedAI={async remove(message,progress){order.push('semantic');assert.equal(message,darkInput);progress('processing',.5);return prior}};
    const mockedRefiner={async refine(message,trimap,progress){
      order.push('refine');assert.equal(message,darkInput,'the refiner receives the original native bitmap');
      assert.ok(trimap instanceof Uint8ClampedArray);assert.equal(trimap.length,96*48);
      assert.deepEqual([...new Set(trimap)].sort((a,b)=>a-b),[0,128,255],'the real trimap has definite background, unknown edges and a subject core');
      assert.equal(trimap[0],0);assert.equal(trimap[shadow],255,'the closed dark subject shadow is protected by the semantic core');
      progress('processing',1);
      // A deliberately imperfect model output tests that composition enforces
      // hard trimap labels, rather than allowing learned alpha to fill black.
      return {width:96,height:48,data:new Uint8ClampedArray(96*48).fill(64)};
    }};
    const quality=await routeBackground(darkInput,{
      onProgress:(phase,progress)=>qualityProgress.push({phase,progress}),
      loadAI:async()=>{order.push('loadAI');return mockedAI},
      loadRefiner:async()=>{order.push('loadRefiner');return mockedRefiner}
    });
    assert.deepEqual(order,['loadAI','semantic','loadRefiner','refine'],'dark images run semantic prior before learned edge refinement');
    assert.equal(quality.method,'quality-matte');assert.equal(quality.recoverBlack,false);assert.equal(quality.width,96);assert.equal(quality.height,48);
    assert.equal(quality.data[0],0,'known black background stays transparent despite a nonzero model prediction');
    assert.equal(quality.data[shadow],255);assert.deepEqual(quality.foreground.slice(shadow*4,shadow*4+4),Uint8ClampedArray.of(3,2,1,255),'the solid subject shadow keeps its original colour');
    assert.equal(quality.data[particle],22);assert.deepEqual(quality.foreground.slice(particle*4,particle*4+4),Uint8ClampedArray.of(255,81,0,22),'a separate light layer retains and unmattes the disconnected particle');
    assert.deepEqual(quality.background,[0,0,0]);assert.equal(quality.foreground.length,native.length);assert.deepEqual(native,beforeDark,'routing does not mutate native RGBA');
    assert.ok(qualityProgress.some(event=>event.phase==='matting'));assert.deepEqual(qualityProgress.at(-1),{phase:'processing',progress:1});

    const white=new Uint8ClampedArray(32*16*4).fill(255),fallbackInput={type:'remove',id:2,width:32,height:16,data:white};
    const nonblack=await routeBackground(fallbackInput,{loadAI:async()=>({async remove(message){assert.equal(message,fallbackInput);return prior}}),loadRefiner:async()=>{throw new Error('a nonblack bitmap must not import the refiner')}});
    assert.equal(nonblack,prior,'nonblack images keep the existing semantic AI result protocol');
    await assert.rejects(routeBackground(darkInput,{loadAI:async()=>{throw new Error('semantic unavailable')},loadRefiner:async()=>{throw new Error('must not refine without a prior')}}),/semantic unavailable/,'semantic failure never falls back to the old fill-black route');
    await assert.rejects(routeBackground(darkInput,{loadAI:async()=>mockedAI,loadRefiner:async()=>({async refine(){throw new Error('edge refinement unavailable')}})}),/edge refinement unavailable/,'refinement failure never returns a misleading old dark mask');

    global.__giftBackgroundTestState={aiImports:0,refinerImports:0,calls:[],prior,failAI:false,failRefiner:false,gate:null};
    await assert.rejects(routeBackground(fallbackInput),/gift-background-ai/,'other backgrounds attempt the lazy AI import');
    fs.writeFileSync(path.join(temporary,'gift-background-ai.mjs'),`globalThis.__giftBackgroundTestState.aiImports++;
      export async function remove(message,progress){
        const state=globalThis.__giftBackgroundTestState;state.calls.push('semantic');state.input=message;
        if(state.gate)await state.gate;if(state.failAI)throw new Error('semantic failed');
        progress('processing',1);
        return state.prior;
      }`);
    const fallbackProgress=[],fallback=await routeBackground(fallbackInput,{onProgress:(phase,progress)=>fallbackProgress.push({phase,progress})});
    const state=global.__giftBackgroundTestState;
    assert.equal(fallback,prior);assert.equal(state.input,fallbackInput,'AI gets the unchanged native bitmap after detection');
    assert.ok(fallbackProgress.some(event=>event.phase==='loading'),'an actual AI module import reports loading');assert.equal(state.aiImports,1,'a failed AI import can be retried');
    assert.equal(fs.existsSync(path.join(temporary,'gift-matting-refine.mjs')),false,'the nonblack route succeeds without a refiner or its model present');
    await assert.rejects(routeBackground(darkInput),/gift-matting-refine/,'the dark quality route lazily imports refinement after semantic inference');
    fs.writeFileSync(path.join(temporary,'gift-matting-refine.mjs'),`globalThis.__giftBackgroundTestState.refinerImports++;
      export async function refine(message,trimap,progress){
        const state=globalThis.__giftBackgroundTestState;state.calls.push('refine');state.refineInput=message;state.trimap=trimap;
        if(state.failRefiner)throw new Error('refinement failed');progress('processing',1);
        return {width:message.width,height:message.height,data:new Uint8ClampedArray(message.width*message.height).fill(64)};
      }`);
    const retried=await routeBackground(darkInput);assert.equal(retried.method,'quality-matte');assert.equal(state.refinerImports,1,'a failed refiner import can be retried');assert.equal(state.refineInput,darkInput);
    const reusedProgress=[];await routeBackground(fallbackInput,{onProgress:phase=>reusedProgress.push(phase)});await routeBackground(darkInput);
    assert.equal(state.aiImports,1);assert.equal(state.refinerImports,1,'successful jobs reuse both lazy modules');assert.ok(!reusedProgress.includes('loading'),'the reused AI module does not report another module import');
    state.failRefiner=true;await assert.rejects(routeBackground(darkInput),/refinement failed/);state.failRefiner=false;
    assert.equal((await routeBackground(darkInput)).method,'quality-matte','a failed inference can be retried using the loaded module');assert.equal(state.refinerImports,1);
    state.failAI=true;await assert.rejects(routeBackground(darkInput),/semantic failed/);state.failAI=false;
    assert.equal((await routeBackground(darkInput)).method,'quality-matte');assert.equal(state.aiImports,1);
    await assert.rejects(routeBackground({...darkInput,width:2049}),/尺寸/);await assert.rejects(routeBackground({...darkInput,data:new Uint8Array(native)}),/尺寸/);
    let releaseAI;state.gate=new Promise(resolve=>{releaseAI=resolve});const workerDone=new Promise(resolve=>{resolveWorker=resolve});
    handlers.get('message')({data:{...darkInput,id:11}});handlers.get('message')({data:{...darkInput,id:12}});await new Promise(resolve=>setImmediate(resolve));
    assert.ok(messages.some(({message})=>message.id===12&&message.type==='error'&&/处理中/.test(message.message)),'the worker rejects simultaneous jobs while semantic inference is pending');
    assert.ok(!messages.some(({message})=>message.id===11&&message.type==='result'));releaseAI();await workerDone;state.gate=null;
    const transferred=messages.find(({message})=>message.id===11&&message.type==='result');assert.equal(transferred.message.method,'quality-matte');
    assert.equal(transferred.transfer.length,2);assert.equal(transferred.transfer[0],transferred.message.data.buffer);assert.equal(transferred.transfer[1],transferred.message.foreground.buffer,'native RGBA foreground and alpha transfer separately');
    assert.equal(transferred.message.foreground.length,96*48*4);assert.equal(transferred.message.width,96);assert.equal(transferred.message.height,48);assert.deepEqual(transferred.message.background,[0,0,0]);
  }finally{delete global.self;delete global.__giftBackgroundTestState;fs.rmSync(temporary,{recursive:true,force:true})}

  const {preprocess,logitsToAlpha,resizeRGBA}=await import(pathToFileURL(path.join(root,'gift-background-ai.mjs')));
  const rgba=Uint8ClampedArray.from([255,0,128,0,0,255,64,255]);
  const before=rgba.slice(),tensor=preprocess(rgba,2,1);
  const expected=[(1-.485)/.229,(0-.485)/.229,(0-.456)/.224,(1-.456)/.224,(128/255-.406)/.225,(64/255-.406)/.225];
  assert.equal(tensor.length,6);for(let index=0;index<tensor.length;index++)assert.ok(Math.abs(tensor[index]-expected[index])<1e-6,'RGB is normalized as NCHW ImageNet channels');
  assert.deepEqual(rgba,before,'preprocessing does not mutate source pixels');
  assert.throws(()=>preprocess(rgba,2,2),/尺寸/);assert.throws(()=>preprocess(rgba,0,1),/尺寸/);
  assert.deepEqual(Array.from(logitsToAlpha(Float32Array.from([-Infinity,-10,0,10,Infinity]))),[0,0,128,255,255],'logits become alpha with sigmoid, not min/max contrast stretching');
  assert.throws(()=>logitsToAlpha(Float32Array.from([NaN])),/无效/);
  const corners=Uint8ClampedArray.from([0,10,20,255,100,110,120,255,200,210,220,255,240,250,255,255]);
  assert.deepEqual(Array.from(resizeRGBA(corners,2,2,1)),[135,145,154,255],'bilinear resizing averages the four centre samples');
  assert.equal(resizeRGBA(corners,2,2,2),corners,'a bitmap at model size is reused');
  const horizontal=resizeRGBA(Uint8ClampedArray.from([0,0,0,255,200,100,50,255]),2,1,4);
  assert.deepEqual(Array.from(horizontal.slice(0,16)),[0,0,0,255,50,25,12,255,150,75,38,255,200,100,50,255]);
  assert.deepEqual(horizontal.slice(0,16),horizontal.slice(16,32),'one-row images clamp safely in the vertical direction');
  assert.equal(resizeRGBA(rgba,2,1).length,512*512*4,'native aspect-ratio pixels are converted to the established AI input grid');
  assert.throws(()=>resizeRGBA(rgba,2049,1),/尺寸/);assert.deepEqual(rgba,before);

  const modelManifest=JSON.parse(fs.readFileSync(path.join(root,'assets/matting/manifest.json'))),modelParts=[];
  assert.equal(modelManifest.license,'MIT');assert.equal(modelManifest.chunks.length,5);assert.deepEqual(modelManifest.input.shape,[1,3,512,512]);
  for(const entry of modelManifest.chunks){const bytes=fs.readFileSync(path.join(root,'assets/matting',entry.file));assert.equal(bytes.length,entry.bytes);assert.ok(bytes.length<=20*1024*1024,'every model chunk stays under Pages limits');assert.equal(sha(bytes),entry.sha256);modelParts.push(bytes)}
  const model=Buffer.concat(modelParts);assert.equal(model.length,98484532);assert.equal(sha(model),'eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516');
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'vendor/ort/manifest.json')));assert.equal(runtime.version,'1.30.0');assert.equal(runtime.license,'MIT');
  for(const entry of runtime.files){const bytes=fs.readFileSync(path.join(root,'vendor/ort',entry.file));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);assert.ok(bytes.length<25*1024*1024)}
  for(const directory of ['vendor/ort','assets/matting']){assert.match(fs.readFileSync(path.join(root,directory,'LICENSE'),'utf8'),/MIT License/);assert.ok(fs.readFileSync(path.join(root,directory,'NOTICE.txt'),'utf8').length>100)}

  const workers=[],timers=new Map(),listeners=new Map(),canvasCalls=[],progress=[];let serial=0,readError=false;
  class MockWorker{
    constructor(url,options){this.url=url;this.options=options;this.listeners=new Map();this.messages=[];workers.push(this)}
    addEventListener(name,handler){this.listeners.set(name,handler)}
    postMessage(message,transfer){this.messages.push({message,transfer})}
    emit(message){this.listeners.get('message')({data:message})}
    terminate(){this.terminated=true}
  }

  const sandbox={URL,Worker:MockWorker,Uint8ClampedArray,location:{href:'http://127.0.0.1:8792/#gift-previews'},
    document:{
      currentScript:{src:'http://127.0.0.1:8792/gift-background.js'},
      createElement(tag){
        assert.equal(tag,'canvas');
        return {width:0,height:0,getContext(){return {
          drawImage(...args){canvasCalls.push(args)},
          getImageData(x,y,width,height){if(readError)throw new Error('cannot read');return {data:new Uint8ClampedArray(width*height*4)}}
        }}};
      }
    },
    setTimeout(callback){const id=++serial;timers.set(id,callback);return id},clearTimeout(id){timers.delete(id)},
    window:{addEventListener(name,callback){listeners.set(name,callback)}}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'gift-background.js'),'utf8'),sandbox);
  const {remove}=sandbox.window.GiftBackground,image={naturalWidth:1200,naturalHeight:800,complete:true};
  assert.equal(workers.length,0,'loading the tool never eagerly loads the worker or model');await assert.rejects(remove({naturalWidth:0,naturalHeight:0}),/载入/);assert.equal(workers.length,0);
  const first=remove(image,{onProgress:event=>progress.push(event)}),also=[];
  assert.equal(workers.length,1);assert.equal(String(workers[0].url),'http://127.0.0.1:8792/gift-background-worker.js?v=20261025-speed1');assert.equal(workers[0].options.type,'module');assert.equal(progress[0].phase,'analyzing');
  assert.equal(remove(image,{onProgress:event=>also.push(event)}),first,'repeated calls for the same source share the active job');
  await assert.rejects(remove({...image}),/处理中/,'a different source cannot race the current job');
  const worker=workers[0],message=worker.messages[0].message;
  assert.deepEqual(canvasCalls[0],[image,0,0,1200,800]);assert.equal(message.width,1200);assert.equal(message.height,800);assert.equal(message.data.length,1200*800*4);assert.equal(worker.messages[0].transfer[0],message.data.buffer,'only local pixels are transferred to the worker');
  worker.emit({type:'progress',id:message.id,phase:'processing',progress:.5});assert.equal(progress.at(-1).phase,'processing');assert.equal(also[0].progress,.5);
  const mask=new Uint8ClampedArray(1200*800).fill(123);worker.emit({type:'result',id:message.id,width:1200,height:800,data:mask,recoverBlack:true,method:'dark-matte'});
  const result=await first;assert.equal(result.data,mask);assert.equal(result.width,1200);assert.equal(result.height,800);assert.equal(result.method,'dark-matte');assert.equal(result.recoverBlack,true);assert.equal(timers.size,0);
  const callsBeforeCache=worker.messages.length,readsBeforeCache=canvasCalls.length;
  result.data[0]=42;
  const cachedProgress=[],cachedResult=await remove(image,{onProgress:event=>cachedProgress.push(event)});
  assert.equal(worker.messages.length,callsBeforeCache,'completed source reuse skips model inference');
  assert.equal(canvasCalls.length,readsBeforeCache,'completed source reuse skips native bitmap readback');
  assert.equal(cachedResult.cacheHit,true);assert.equal(cachedResult.data[0],123,'the original result cannot corrupt the stored mask');
  cachedResult.data[0]=17;assert.equal((await remove(image)).data[0],123,'each cached return has independent writable buffers');
  assert.equal(cachedProgress.at(-1).progress,1);
  let sourceRevision=0;
  function freshRemove(source,options){source.src='test-source-'+(++sourceRevision);return remove(source,options)}
  const refinedJob=freshRemove(image),refinedId=worker.messages.at(-1).message.id,foreground=new Uint8ClampedArray(1200*800*4),background=[1,2,3];
  worker.emit({type:'result',id:refinedId,width:1200,height:800,data:mask,foreground,background,recoverBlack:false,method:'quality-matte'});
  const refined=await refinedJob;assert.equal(refined.method,'quality-matte');assert.equal(refined.data,mask);assert.equal(refined.foreground,foreground);assert.equal(refined.background,background);assert.equal(refined.recoverBlack,false);assert.equal(timers.size,0,'the quality result preserves its native foreground and background metadata');
  const qualityCached=await remove(image);
  assert.equal(qualityCached.method,'quality-matte');assert.equal(qualityCached.cacheHit,true);
  assert.notEqual(qualityCached.foreground,foreground);assert.deepEqual(qualityCached.background,background);
  qualityCached.foreground[0]=77;qualityCached.background[0]=99;
  const qualityAgain=await remove(image);assert.equal(qualityAgain.foreground[0],0);assert.equal(qualityAgain.background[0],1);
  const retry=freshRemove(image);assert.equal(workers.length,1,'successful jobs reuse one worker and its model session');const retryId=worker.messages.at(-1).message.id;
  worker.emit({type:'result',id:message.id,width:512,height:512,data:mask});assert.equal(timers.size,1,'stale results cannot finish a newer job');
  worker.emit({type:'error',id:retryId,message:'下载失败，请重试。'});await assert.rejects(retry,/下载失败/);assert.equal(timers.size,0);
  const afterFailure=freshRemove(image),failureId=worker.messages.at(-1).message.id;worker.emit({type:'result',id:failureId,width:2,height:2,data:new Uint8ClampedArray(4)});await assert.rejects(afterFailure,/结果无效/);
  for(const invalid of [
    {width:2049,height:1,data:new Uint8ClampedArray(2049),recoverBlack:true,method:'dark-matte'},
    {width:1.5,height:2,data:new Uint8ClampedArray(3),recoverBlack:true,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(3),recoverBlack:true,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:'true',method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:false,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:true,method:'unknown'},
    ...[
      {},
      {foreground:new Uint8ClampedArray(15),background:[0,0,0]},
      {foreground:new Uint8Array(16),background:[0,0,0]},
      {foreground:new Uint8ClampedArray(16)},
      {foreground:new Uint8ClampedArray(16),background:null},
      {foreground:new Uint8ClampedArray(16),background:new Float32Array([0,0,0])},
      {foreground:new Uint8ClampedArray(16),background:[0,0]},
      {foreground:new Uint8ClampedArray(16),background:[NaN,0,0]},
      {foreground:new Uint8ClampedArray(16),background:[Infinity,0,0]},
      {foreground:new Uint8ClampedArray(16),background:[-1,0,0]},
      {foreground:new Uint8ClampedArray(16),background:[256,0,0]},
      {foreground:new Uint8ClampedArray(16),background:['0',0,0]},
      {foreground:new Uint8ClampedArray(16),background:[0,0,0],recoverBlack:true}
    ].map(extra=>({width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:false,method:'quality-matte',...extra}))
  ]){
    const invalidJob=freshRemove(image),id=worker.messages.at(-1).message.id;
    worker.emit({type:'result',id,...invalid});await assert.rejects(invalidJob,/结果无效/);
  }
  for(const [sourceWidth,sourceHeight,width,height] of [[4096,1024,2048,512],[300,450,300,450],[800,3200,512,2048],[1,1,1,1]]){
    const source={naturalWidth:sourceWidth,naturalHeight:sourceHeight,complete:true},job=remove(source),sent=worker.messages.at(-1).message;
    assert.deepEqual(canvasCalls.at(-1),[source,0,0,width,height],'native sampling preserves proportions and never upscales a small image');
    assert.equal(sent.width,width);assert.equal(sent.height,height);assert.equal(sent.data.length,width*height*4);
    worker.emit({type:'result',id:sent.id,width:1,height:1,data:Uint8ClampedArray.of(255),recoverBlack:false,method:'ai'});
    const tiny=await job;assert.equal(tiny.width,1);assert.equal(tiny.height,1);assert.equal(tiny.recoverBlack,false);assert.equal(tiny.method,'ai');
  }
  const aiRetry=freshRemove(image),aiId=worker.messages.at(-1).message.id;worker.emit({type:'result',id:aiId,width:512,height:512,data:new Uint8ClampedArray(512*512),recoverBlack:false,method:'ai'});assert.equal((await aiRetry).width,512,'the fallback keeps the established model dimensions');
  const crash=freshRemove(image);worker.listeners.get('error')();await assert.rejects(crash,/组件未能加载/);assert.equal(worker.terminated,true);
  const afterCrash=freshRemove(image);assert.equal(workers.length,2,'a worker crash is retryable with a fresh worker');listeners.get('pagehide')();await assert.rejects(afterCrash,/取消/);assert.equal(workers[1].terminated,true);assert.equal(timers.size,0);
  readError=true;await assert.rejects(freshRemove(image),/cannot read/);readError=false;
  const timed=freshRemove(image);assert.equal(timers.size,1);[...timers.values()][0]();await assert.rejects(timed,/耗时过长/);assert.equal(timers.size,0);
  console.log('gift-background: semantic-to-trimap-to-refinement routing, preserved shadow/light foreground, lazy nonblack route, failures without old black-fill fallback, retry/reuse and native foreground transfer, bilinear preprocessing, sigmoid alpha, official asset hashes/licenses, quality/legacy result protocols, worker busy/deduplication and cleanup passed');
}
tests().catch(error=>{console.error(error);process.exitCode=1});
