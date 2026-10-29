// Run with Node; real Worker/WebCodecs/browser timing remains browser QA.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');

(async()=>{
  const {keyPixels,applyVerticalMask}=await import('../vap-matte.mjs');
  const {createChromaWorkerPool}=await import('../vap-matte-workers.mjs');
  const saved={};for(const key of ['Worker','ImageData','navigator','self'])saved[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  const originalTimeout=global.setTimeout,originalClearTimeout=global.clearTimeout,timers=new Map(),unhandled=[];
  let fastTimeout=false;
  global.setTimeout=(fn,delay,...args)=>{const handle=originalTimeout(()=>{timers.delete(handle);fn(...args)},fastTimeout?Math.min(delay,8):delay);timers.set(handle,delay);return handle;};
  global.clearTimeout=handle=>{timers.delete(handle);originalClearTimeout(handle);};
  const onUnhandled=error=>unhandled.push(error);process.on('unhandledRejection',onUnhandled);
  class TestImageData{constructor(data,width,height){if(!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw Error('invalid ImageData');this.data=data;this.width=width;this.height=height;}}
  const put=(key,value)=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  put('ImageData',TestImageData);
  const flush=()=>new Promise(setImmediate);
  const mask={enabled:true,topStart:0,topEnd:.25,bottomStart:.75,bottomEnd:1};
  const baseOptions={width:5,height:5,screenColor:'green',background:[0,220,0],keyTolerance:.25,edgeSoftness:.08,spill:.7,verticalMask:mask};
  const pixels=(width=5,height=5)=>{const values=new Uint8ClampedArray(width*height*4);for(let i=0;i<values.length;i+=4)values.set([0,220,0,255],i);values.set([240,25,30,255],Math.floor(width*height/2)*4);return new TestImageData(values,width,height)};
  function control(){const c=new AbortController(),listeners=new Set();return {abort:()=>c.abort(),listeners,signal:{get aborted(){return c.signal.aborted},addEventListener(type,fn,options){listeners.add(fn);c.signal.addEventListener(type,fn,options)},removeEventListener(type,fn){listeners.delete(fn);c.signal.removeEventListener(type,fn)}}};}

  class FakeWorker{
    static instances=[];static next=[];static failConstructorAt=0;static constructors=0;
    constructor(url,options){
      if(++FakeWorker.constructors===FakeWorker.failConstructorAt)throw Error('constructor failed');
      this.url=url;this.options=options;this.plan=FakeWorker.next.shift()||{};this.events=new Map();this.messages=[];this.frames=[];this.workspace={};this.terminated=0;FakeWorker.instances.push(this);
    }
    addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
    removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
    emit(type,value){for(const fn of [...(this.events.get(type)||[])])fn(value);}
    postMessage(message,transfer=[]){
      if(message.type==='init'&&this.plan.postInitThrows)throw Error('init post failed');
      if(message.type==='frame'&&this.plan.postFrameThrows)throw Error('frame post failed');
      const copy=structuredClone(message,{transfer});this.messages.push({value:copy,transferCount:transfer.length});
      if(copy.type==='init'){
        this.config=copy.options;
        if(this.plan.silent)return;
        queueMicrotask(()=>this.plan.startError?this.emit('error',{message:'startup error',preventDefault(){}}):this.emit('message',{data:{type:'ready'}}));
      }else if(copy.type==='frame'){
        assert.equal(this.frames.length,0,'one worker must never process two frames concurrently');this.frames.push(copy);
      }
    }
    complete(){
      const frame=this.frames.shift();assert.ok(frame,'worker has a pending frame');
      const input=new Uint8ClampedArray(frame.buffer,frame.byteOffset,frame.width*frame.height*4);
      const output=applyVerticalMask(keyPixels(input,frame.width,frame.height,this.config,this.workspace),frame.width,frame.height,this.config.verticalMask);
      const value=structuredClone({type:'result',id:frame.id,width:frame.width,height:frame.height,buffer:output.buffer,workerMs:.75},{transfer:[output.buffer]});
      this.emit('message',{data:value});
    }
    terminate(){this.terminated++;}
    get listenerCount(){return [...this.events.values()].reduce((sum,entries)=>sum+entries.size,0);}
  }
  function reset({hardware=2,memory=16,plans=[]}={}){FakeWorker.instances=[];FakeWorker.next=plans;FakeWorker.failConstructorAt=0;FakeWorker.constructors=0;put('Worker',FakeWorker);put('navigator',{hardwareConcurrency:hardware,deviceMemory:memory});}
  function clean(){assert.equal(timers.size,0,'startup timers must be cleared');for(const worker of FakeWorker.instances){assert.equal(worker.terminated,1,'workers terminate exactly once');assert.equal(worker.listenerCount,0,'all worker listeners must be removed');}}
  try{
    put('Worker',undefined);
    assert.equal(await createChromaWorkerPool(baseOptions),null,'unsupported Worker falls back to the CPU');
    for(const [width,height]of [[0,1],[4097,1],[4096,2049],[NaN,1],[1.5,2]])await assert.rejects(createChromaWorkerPool({...baseOptions,width,height}),RangeError);
    const beforeAbort=control();beforeAbort.abort();await assert.rejects(createChromaWorkerPool(baseOptions,{signal:beforeAbort.signal}),{name:'AbortError',code:'cancelled'});

    reset({hardware:8});
    const background=[0,220,0],vertical={...mask};
    const starting=createChromaWorkerPool({...baseOptions,background,verticalMask:vertical,resources:[()=>{}],signal:()=>{},unwanted:'ignored'});
    background[0]=99;vertical.topEnd=.4;
    const pool=await starting;assert.equal(pool.size,4);assert.equal(FakeWorker.instances.length,4);
    for(const worker of FakeWorker.instances){
      assert.equal(worker.options.type,'module');assert.match(worker.url.href,/vap-matte-worker\.mjs\?v=\d{8}-[a-z0-9]+$/);
      assert.deepEqual(Object.keys(worker.config).sort(),['width','height','matteMethod','verticalMask','screenColor','background','keyTolerance','edgeSoftness','spill'].sort());
      assert.deepEqual(worker.config.background,[0,220,0]);assert.equal(worker.config.verticalMask.topEnd,.25);
    }
    const image=pixels(),expected=applyVerticalMask(keyPixels(image.data,5,5,{...baseOptions,matteMethod:'chroma_key'}),5,5,mask);
    const first=pool.process(image);assert.equal(image.data.buffer.byteLength,0,'idle-worker input ownership transfers synchronously');
    FakeWorker.instances[0].complete();const result=await first;assert.ok(result.image instanceof TestImageData);assert.equal(result.workerMs,.75);assert.deepEqual(result.image.data,expected);
    const retained=result.image.data.slice(),second=pool.process(pixels());FakeWorker.instances[0].complete();await second;assert.deepEqual(result.image.data,retained,'later worker reuse cannot overwrite a previous result');
    await assert.rejects(pool.process(pixels(3,3)),/dimensions/);await assert.rejects(pool.process({width:5,height:5,data:new Uint8Array(100)}),/RGBA/);await assert.rejects(pool.process({width:5,height:5,data:new Uint8ClampedArray(99)}),/RGBA/);
    pool.dispose();pool.dispose();await assert.rejects(pool.process(pixels()),{name:'AbortError',code:'cancelled'});clean();

    for(const lightRecovery of [false,true]){
      reset();const recoveryPool=await createChromaWorkerPool({...baseOptions,lightRecovery,unwanted:'ignored'});
      assert.equal(FakeWorker.instances[0].config.lightRecovery,lightRecovery,'the pool whitelist retains either explicit boolean value');assert.deepEqual(Object.keys(FakeWorker.instances[0].config).sort(),['width','height','matteMethod','verticalMask','screenColor','background','keyTolerance','edgeSoftness','spill','lightRecovery'].sort());
      const source=pixels(),expected=applyVerticalMask(keyPixels(source.data,5,5,{...baseOptions,lightRecovery,matteMethod:'chroma_key'}),5,5,mask),job=recoveryPool.process(source);FakeWorker.instances[0].complete();assert.deepEqual((await job).image.data,expected);recoveryPool.dispose();clean();
    }
    reset();for(const lightRecovery of [null,0,1,'true','false',{},[]])await assert.rejects(createChromaWorkerPool({...baseOptions,lightRecovery}),{name:'TypeError',message:'Invalid light recovery mode'});assert.equal(FakeWorker.instances.length,0,'invalid recovery values fail before starting workers');clean();

    reset();const queuedPool=await createChromaWorkerPool(baseOptions),activeImage=pixels(),waitingImage=pixels(),overflowImage=pixels();
    const active=queuedPool.process(activeImage),waiting=queuedPool.process(waitingImage);
    assert.equal(waitingImage.data.buffer.byteLength,100,'waiting frames are not transferred until a worker is idle');
    await assert.rejects(queuedPool.process(waitingImage),/already in flight/);
    await assert.rejects(queuedPool.process(overflowImage),{code:'busy'});assert.equal(overflowImage.data.buffer.byteLength,100,'overflow rejection retains caller pixels');
    FakeWorker.instances[0].complete();assert.equal(waitingImage.data.buffer.byteLength,0,'the bounded FIFO dispatches as soon as the worker is free');await active;FakeWorker.instances[0].complete();await waiting;queuedPool.dispose();clean();

    reset();const disposePool=await createChromaWorkerPool(baseOptions),disposeA=disposePool.process(pixels()),disposeB=disposePool.process(pixels());disposePool.dispose();disposePool.dispose();
    assert.ok((await Promise.allSettled([disposeA,disposeB])).every(value=>value.status==='rejected'&&value.reason.code==='cancelled'));clean();

    reset();const errorPool=await createChromaWorkerPool(baseOptions),errorA=errorPool.process(pixels()),errorB=errorPool.process(pixels());
    FakeWorker.instances[0].emit('error',{message:'processing crash',preventDefault(){}});
    for(const value of await Promise.allSettled([errorA,errorB])){assert.equal(value.status,'rejected');assert.match(value.reason.message,/processing crash/);}
    await assert.rejects(errorPool.process(pixels()),/processing crash/);errorPool.dispose();clean();

    reset({hardware:3});const invalidPool=await createChromaWorkerPool(baseOptions),invalidA=invalidPool.process(pixels()),invalidB=invalidPool.process(pixels());
    FakeWorker.instances[0].emit('message',{data:{type:'result',id:999,width:5,height:5,buffer:new ArrayBuffer(100),workerMs:1}});
    assert.ok((await Promise.allSettled([invalidA,invalidB])).every(value=>value.status==='rejected'));clean();

    reset({plans:[{postFrameThrows:true}]});const postPool=await createChromaWorkerPool(baseOptions);await assert.rejects(postPool.process(pixels()),/frame post failed/);clean();
    reset();const messagePool=await createChromaWorkerPool(baseOptions),messageTask=messagePool.process(pixels());FakeWorker.instances[0].emit('messageerror',{});await assert.rejects(messageTask,/could not be decoded/);clean();

    reset({plans:[{silent:true}]});const initAbort=control(),abortedStart=createChromaWorkerPool(baseOptions,{signal:initAbort.signal});initAbort.abort();await assert.rejects(abortedStart,{name:'AbortError',code:'cancelled'});assert.equal(initAbort.listeners.size,0);clean();
    reset();const runningAbort=control(),abortPool=await createChromaWorkerPool(baseOptions,{signal:runningAbort.signal}),abortA=abortPool.process(pixels()),abortB=abortPool.process(pixels());runningAbort.abort();
    assert.ok((await Promise.allSettled([abortA,abortB])).every(value=>value.status==='rejected'&&value.reason.name==='AbortError'));assert.equal(runningAbort.listeners.size,0);abortPool.dispose();clean();

    reset({hardware:3});FakeWorker.failConstructorAt=2;assert.equal(await createChromaWorkerPool(baseOptions),null,'partial startup failure terminates already-created workers');clean();
    reset({plans:[{postInitThrows:true}]});assert.equal(await createChromaWorkerPool(baseOptions),null);clean();
    reset({plans:[{startError:true}]});assert.equal(await createChromaWorkerPool(baseOptions),null);clean();
    reset({hardware:3,plans:[{}, {silent:true}]});fastTimeout=true;const timed=await createChromaWorkerPool(baseOptions);fastTimeout=false;assert.equal(timed,null,'one missing handshake falls back after the bounded init timeout');clean();

    for(const [{hardware,memory},width,height,expectedSize]of [[{hardware:8,memory:16},720,1560,3],[{hardware:8,memory:4},720,1560,2],[{hardware:16,memory:16},2048,2048,1],[{hardware:1,memory:16},5,5,1]]){
      reset({hardware,memory});const bounded=await createChromaWorkerPool({...baseOptions,width,height});assert.equal(bounded.size,expectedSize,'CPU/device/work-pixel memory bounds');bounded.dispose();clean();
    }

    // Exercise the actual worker handler with the real shared pixel functions.
    const replies=[],scope={addEventListener(type,fn){assert.equal(type,'message');this.receive=fn;},postMessage(value,transfer=[]){replies.push(structuredClone(value,{transfer}));}};
    put('self',scope);await import(pathToFileURL(path.join(__dirname,'../vap-matte-worker.mjs')).href+'?unit='+Date.now());
    const workerOptions={...baseOptions,verticalMask:{enabled:true,topStart:0,topEnd:.5,bottomStart:.5,bottomEnd:1}};
    scope.receive({data:{type:'init',options:{...workerOptions,resources:[()=>{}]}}});assert.equal(replies.pop().type,'ready');
    for(let index=0;index<3;index++){
      const source=pixels();if(index===1)for(let i=0;i<source.data.length;i+=4)source.data.set([0,220,0,255],i);
      if(index===0)source.data.set([240,25,30,255],(1*5+2)*4);
      if(index===2)source.data.set([240,25,30,128],(3*5+1)*4);
      const expected=applyVerticalMask(keyPixels(source.data,5,5,{...workerOptions,matteMethod:'chroma_key'}),5,5,workerOptions.verticalMask);
      const input=structuredClone({type:'frame',id:index,width:5,height:5,byteOffset:0,buffer:source.data.buffer},{transfer:[source.data.buffer]});scope.receive({data:input});
      const output=replies.pop();assert.equal(output.type,'result');assert.equal(output.id,index);assert.ok(output.workerMs>=0);assert.deepEqual(new Uint8ClampedArray(output.buffer),expected,'actual worker uses the identical chroma and mask algorithm after workspace reuse');
      if(index===0)assert.equal(new Uint8ClampedArray(output.buffer)[(1*5+2)*4+3],128,'the worker applies a half-opacity vertical fade once');
      if(index===2)assert.equal(new Uint8ClampedArray(output.buffer)[(3*5+1)*4+3],64,'the mask multiplies original partial alpha once');
    }
    scope.receive({data:{type:'frame',id:9,width:6,height:5,byteOffset:0,buffer:new ArrayBuffer(120)}});assert.equal(replies.pop().type,'error','worker validates RGBA geometry before processing');
    let recoveryImport=0;
    async function actualWorker(options){
      const replies=[],scope={addEventListener(type,fn){assert.equal(type,'message');this.receive=fn},postMessage(value,transfer=[]){replies.push(structuredClone(value,{transfer}))}};
      put('self',scope);await import(pathToFileURL(path.join(__dirname,'../vap-matte-worker.mjs')).href+'?recovery-unit='+(++recoveryImport)+'-'+Date.now());scope.receive({data:{type:'init',options}});return {scope,replies};
    }
    for(const lightRecovery of [false,true]){
      const options={...baseOptions,lightRecovery,background:[60,194,61]},worker=await actualWorker(options);assert.equal(worker.replies.pop().type,'ready','the real worker accepts the boolean recovery mode');
      for(let frame=0;frame<2;frame++){
        const source=pixels(),palette=[[60,194,61,255],[195,224,55,255],[211,253,188,255],[18,18,18,255],[248,244,227,255],[146,47,209,128]];
        for(let offset=0;offset<source.data.length;offset+=4)source.data.set(frame===0?[170,220,0,255]:palette[(offset/4+frame)%palette.length],offset);
        const expected=applyVerticalMask(keyPixels(source.data,5,5,{...options,matteMethod:'chroma_key'}),5,5,options.verticalMask);
        if(lightRecovery&&frame===0){const legacy=applyVerticalMask(keyPixels(source.data,5,5,{...options,lightRecovery:false,matteMethod:'chroma_key'}),5,5,options.verticalMask);assert.notDeepEqual(expected,legacy,'the enabled-worker fixture exercises real recovery changes rather than an identical legacy result');}
        const input=structuredClone({type:'frame',id:frame,width:5,height:5,byteOffset:0,buffer:source.data.buffer},{transfer:[source.data.buffer]});worker.scope.receive({data:input});const output=worker.replies.pop();assert.equal(output.type,'result');assert.deepEqual(new Uint8ClampedArray(output.buffer),expected,'the actual worker matches the shared CPU with recovery '+lightRecovery+', including scratch reuse');
      }
    }
    for(const lightRecovery of [null,0,1,'true','false',{},[]]){const worker=await actualWorker({...baseOptions,lightRecovery});assert.equal(worker.replies.length,1);assert.equal(worker.replies[0].type,'error','the actual worker rejects non-boolean recovery settings');assert.equal(worker.replies[0].message,'Invalid light recovery mode');}
    await flush();assert.deepEqual(unhandled,[],'dispose/abort/startup rejection must not create internal unhandled rejections');assert.equal(timers.size,0);
    console.log('PASS: chroma workers handshake/fallback, synchronous transfer, bounded FIFO/overflow, copied settings, explicit true/false light recovery forwarding and non-boolean rejection, fresh exact shared-algorithm output with enabled recovery and scratch reuse, size/resource bounds, worker/protocol failures, cancellation, timeout and idempotent cleanup.');
  }finally{
    for(const handle of timers.keys())originalClearTimeout(handle);global.setTimeout=originalTimeout;global.clearTimeout=originalClearTimeout;process.removeListener('unhandledRejection',onUnhandled);
    for(const [key,descriptor]of Object.entries(saved))descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
  }
})().catch(error=>{console.error(error);process.exitCode=1});
