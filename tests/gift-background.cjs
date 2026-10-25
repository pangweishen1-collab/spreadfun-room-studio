'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function tests(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gift-background-lazy-'));
  try{
    fs.copyFileSync(path.join(root,'gift-background-worker.js'),path.join(temporary,'worker.mjs'));
    fs.copyFileSync(path.join(root,'gift-background-matte.mjs'),path.join(temporary,'gift-background-matte.mjs'));
    const messages=[],handlers=new Map();
    global.self={addEventListener(type,handler){handlers.set(type,handler)},postMessage(message,transfer){messages.push({message,transfer})}};
    const {routeBackground}=await import(pathToFileURL(path.join(temporary,'worker.mjs')));
    const native=new Uint8ClampedArray(96*48*4);for(let pixel=0;pixel<96*48;pixel++)native[pixel*4+3]=255;
    native.set([22,7,0,255],(20*96+40)*4);
    const fastProgress=[],fastInput={type:'remove',id:1,width:96,height:48,data:native},beforeFast=native.slice();
    const fast=await routeBackground(fastInput,{onProgress:(phase,progress)=>fastProgress.push({phase,progress})});
    assert.equal(fast.method,'dark-matte');assert.equal(fast.recoverBlack,true);assert.equal(fast.width,96);assert.equal(fast.height,48);assert.equal(fast.data[20*96+40],22);
    assert.deepEqual(native,beforeFast);assert.ok(fastProgress.every(event=>event.phase!=='loading'),'a black bitmap never reports a model download');
    assert.equal(fs.existsSync(path.join(temporary,'gift-background-ai.mjs')),false,'the real fast route works without any AI or ORT module present');
    let aiLoads=0;await routeBackground(fastInput,{loadAI:async()=>{aiLoads++;throw new Error('unexpected AI load')}});assert.equal(aiLoads,0,'black matting returns before evaluating the AI loader');
    const white=new Uint8ClampedArray(32*16*4).fill(255),fallbackInput={type:'remove',id:2,width:32,height:16,data:white};
    await assert.rejects(routeBackground(fallbackInput),/gift-background-ai/,'other backgrounds attempt the lazy AI import');
    fs.writeFileSync(path.join(temporary,'gift-background-ai.mjs'),`globalThis.__giftAITestLoads=(globalThis.__giftAITestLoads||0)+1;
      export async function remove(message,progress){
        globalThis.__giftAITestInput=message;
        progress('processing',1);
        return {width:512,height:512,data:new Uint8ClampedArray(512*512).fill(127),recoverBlack:false,method:'ai'};
      }`);
    const fallbackProgress=[],fallback=await routeBackground(fallbackInput,{onProgress:(phase,progress)=>fallbackProgress.push({phase,progress})});
    assert.equal(fallback.method,'ai');assert.equal(fallback.recoverBlack,false);assert.equal(fallback.data.length,512*512);assert.equal(global.__giftAITestInput,fallbackInput,'AI gets the unchanged native bitmap after detection');
    assert.ok(fallbackProgress.some(event=>event.phase==='loading'),'an actual AI module load reports loading');assert.equal(global.__giftAITestLoads,1,'a failed AI import can be retried');
    const reusedProgress=[];await routeBackground(fallbackInput,{onProgress:phase=>reusedProgress.push(phase)});assert.equal(global.__giftAITestLoads,1);assert.ok(!reusedProgress.includes('loading'),'a reused AI module does not report another module download');
    await assert.rejects(routeBackground({...fastInput,width:2049}),/尺寸/);await assert.rejects(routeBackground({...fastInput,data:new Uint8Array(native)}),/尺寸/);
    handlers.get('message')({data:fastInput});handlers.get('message')({data:{...fastInput,id:3}});await new Promise(resolve=>setImmediate(resolve));
    assert.ok(messages.some(({message})=>message.id===3&&message.type==='error'&&/处理中/.test(message.message)),'the worker rejects simultaneous jobs');
    const transferred=messages.find(({message})=>message.id===1&&message.type==='result');assert.equal(transferred.message.method,'dark-matte');assert.equal(transferred.transfer[0],transferred.message.data.buffer);
  }finally{delete global.self;delete global.__giftAITestLoads;delete global.__giftAITestInput;fs.rmSync(temporary,{recursive:true,force:true})}

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
  assert.equal(workers.length,1);assert.equal(String(workers[0].url),'http://127.0.0.1:8792/gift-background-worker.js');assert.equal(workers[0].options.type,'module');assert.equal(progress[0].phase,'analyzing');
  assert.equal(remove(image,{onProgress:event=>also.push(event)}),first,'repeated calls for the same source share the active job');
  await assert.rejects(remove({...image}),/处理中/,'a different source cannot race the current job');
  const worker=workers[0],message=worker.messages[0].message;
  assert.deepEqual(canvasCalls[0],[image,0,0,1200,800]);assert.equal(message.width,1200);assert.equal(message.height,800);assert.equal(message.data.length,1200*800*4);assert.equal(worker.messages[0].transfer[0],message.data.buffer,'only local pixels are transferred to the worker');
  worker.emit({type:'progress',id:message.id,phase:'processing',progress:.5});assert.equal(progress.at(-1).phase,'processing');assert.equal(also[0].progress,.5);
  const mask=new Uint8ClampedArray(1200*800).fill(123);worker.emit({type:'result',id:message.id,width:1200,height:800,data:mask,recoverBlack:true,method:'dark-matte'});
  const result=await first;assert.equal(result.data,mask);assert.equal(result.width,1200);assert.equal(result.height,800);assert.equal(result.method,'dark-matte');assert.equal(result.recoverBlack,true);assert.equal(timers.size,0);
  const retry=remove(image);assert.equal(workers.length,1,'successful jobs reuse one worker and its model session');const retryId=worker.messages.at(-1).message.id;
  worker.emit({type:'result',id:message.id,width:512,height:512,data:mask});assert.equal(timers.size,1,'stale results cannot finish a newer job');
  worker.emit({type:'error',id:retryId,message:'下载失败，请重试。'});await assert.rejects(retry,/下载失败/);assert.equal(timers.size,0);
  const afterFailure=remove(image),failureId=worker.messages.at(-1).message.id;worker.emit({type:'result',id:failureId,width:2,height:2,data:new Uint8ClampedArray(4)});await assert.rejects(afterFailure,/结果无效/);
  for(const invalid of [
    {width:2049,height:1,data:new Uint8ClampedArray(2049),recoverBlack:true,method:'dark-matte'},
    {width:1.5,height:2,data:new Uint8ClampedArray(3),recoverBlack:true,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(3),recoverBlack:true,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:'true',method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:false,method:'dark-matte'},
    {width:2,height:2,data:new Uint8ClampedArray(4),recoverBlack:true,method:'unknown'}
  ]){
    const invalidJob=remove(image),id=worker.messages.at(-1).message.id;
    worker.emit({type:'result',id,...invalid});await assert.rejects(invalidJob,/结果无效/);
  }
  for(const [sourceWidth,sourceHeight,width,height] of [[4096,1024,2048,512],[300,450,300,450],[800,3200,512,2048],[1,1,1,1]]){
    const source={naturalWidth:sourceWidth,naturalHeight:sourceHeight,complete:true},job=remove(source),sent=worker.messages.at(-1).message;
    assert.deepEqual(canvasCalls.at(-1),[source,0,0,width,height],'native sampling preserves proportions and never upscales a small image');
    assert.equal(sent.width,width);assert.equal(sent.height,height);assert.equal(sent.data.length,width*height*4);
    worker.emit({type:'result',id:sent.id,width:1,height:1,data:Uint8ClampedArray.of(255),recoverBlack:false,method:'ai'});
    const tiny=await job;assert.equal(tiny.width,1);assert.equal(tiny.height,1);assert.equal(tiny.recoverBlack,false);assert.equal(tiny.method,'ai');
  }
  const aiRetry=remove(image),aiId=worker.messages.at(-1).message.id;worker.emit({type:'result',id:aiId,width:512,height:512,data:new Uint8ClampedArray(512*512),recoverBlack:false,method:'ai'});assert.equal((await aiRetry).width,512,'the fallback keeps the established model dimensions');
  const crash=remove(image);worker.listeners.get('error')();await assert.rejects(crash,/组件未能加载/);assert.equal(worker.terminated,true);
  const afterCrash=remove(image);assert.equal(workers.length,2,'a worker crash is retryable with a fresh worker');listeners.get('pagehide')();await assert.rejects(afterCrash,/取消/);assert.equal(workers[1].terminated,true);assert.equal(timers.size,0);
  readError=true;await assert.rejects(remove(image),/cannot read/);readError=false;
  const timed=remove(image);assert.equal(timers.size,1);[...timers.values()][0]();await assert.rejects(timed,/耗时过长/);assert.equal(timers.size,0);
  console.log('gift-background: AI-free dark routing, native proportions and resolution bounds, lazy AI fallback/retry/reuse, bilinear preprocessing, sigmoid alpha, official asset hashes/licenses, result metadata, worker busy/deduplication and cleanup passed');
}
tests().catch(error=>{console.error(error);process.exitCode=1});
