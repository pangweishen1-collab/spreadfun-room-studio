const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');

(async () => {
  const production = path.resolve(__dirname, '..');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'lucida-integration-'));
  const originalFetch = globalThis.fetch, originalCaches = globalThis.caches;
  try {
    await fs.copyFile(path.join(production, 'gift-lucida-ai.mjs'), path.join(temporary, 'gift-lucida-ai.mjs'));
    for (const file of ['gift-matte-resample.mjs']) await fs.copyFile(path.join(production, file), path.join(temporary, file));
    await fs.writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
    await fs.writeFile(path.join(temporary, 'gift-lucida-runtime.mjs'), `
      export const getExecutionProviders = async () => globalThis.__lucidaTest.gpu ? [{name:'webgpu'},'wasm'] : ['synthetic-test-provider'];
      export const ort = {
        Tensor: class {
          constructor(type,data,dims){Object.assign(this,{type,data,dims})}
          static fromGpuBuffer(){throw new Error('Ordinary execution must not preallocate GPU tensors')}
          dispose(){globalThis.__lucidaTest.inputsDisposed++}
        },
        InferenceSession: {async create(bytes,options){
          const state=globalThis.__lucidaTest;state.creates++;state.options=options;state.model=Array.from(bytes);
          if(state.creates===1)throw new Error('synthetic create failure');
          return {inputNames:state.badNames?['wrong_input']:['input_image'],outputNames:['output_image','aux'],async release(){state.releases=(state.releases||0)+1},async run(feeds,fetches){
            state.runs++;state.input=feeds.input_image;if(state.failRun)throw new Error('synthetic inference rejection');
            if(state.gpu){
              if(fetches)throw new Error('Ordinary execution must not use preallocated fetches');
              if(!feeds.input_image.data)throw new Error('Expected ordinary CPU input tensor');
              state.gpuFeedData.push(feeds.input_image.data[0]);
              const values=state.badLogitsType?new Uint8Array(1024*1024):new Float32Array(state.badLogitsLength?7:1024*1024).fill(feeds.input_image.data[0]);
              return {output_image:{type:'float32',location:'gpu-buffer',dims:[1,1,1024,1024],get data(){throw new Error('GPU .data must not be accessed')},async getData(){state.gpuReadbacks++;if(state.failReadback)throw new Error('synthetic GPU readback failure');return values},dispose(){state.outputsDisposed++}}};
            }
            const tensor={type:'float32',data:new Float32Array(1024*1024).fill(Math.log(3)),dims:state.badShape?[1,1,512,2048]:[1,1,1024,1024],async getData(){return this.data},dispose(){state.outputsDisposed++}};
            return {output_image:tensor,aux:tensor};
          }};
        }}
      };
    `);
    const ai = await import(pathToFileURL(path.join(temporary, 'gift-lucida-ai.mjs')));
    const fixture = JSON.parse(await fs.readFile(path.join(production, 'assets/lucida/manifest.json'), 'utf8'));
    assert.equal(ai.validateManifest(fixture), fixture);
    for (const mutate of [m => m.name = '../other', m => m.revision = 'wrong', m => m.weightsSha256 = 'a'.repeat(64), m => m.input.shape[2] = 512,
      m => m.output.activation = 'sigmoid already applied', m => m.input.mean[0] = .5, m => m.chunks[0].bytes = 20 * 1024 * 1024 + 1,
      m => m.chunks[0].file = '../escape.bin', m => m.chunks[0].sha256 = 'bad', m => m.chunks[1].file = m.chunks[0].file, m => m.bytes--, m => m.bytes = 2 ** 31 + 1, m => m.chunks = [], m => m.output.type = 'float16', m => m.input.std = [1,1,1]]) {
      const bad = structuredClone(fixture); mutate(bad); assert.throws(() => ai.validateManifest(bad));
    }
    const normalized = ai.preprocess(new Uint8ClampedArray([255, 128, 0, 0, 0, 255, 255, 255]), 2, 1);
    const expected = [(1 - .485) / .229, (0 - .485) / .229, (128 / 255 - .456) / .224, (1 - .456) / .224, (0 - .406) / .225, (1 - .406) / .225];
    normalized.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-6));
    assert.throws(() => ai.preprocess(new Uint8ClampedArray(4), 2049, 1));
    const alphas = ai.logitsToFloatAlpha(new Float32Array([-100, 0, Math.log(3), 100]));
    assert.ok(alphas instanceof Float32Array); assert.equal(alphas[1], .5); assert.equal(alphas[2], .75);
    assert.ok(alphas[0] < 1e-40); assert.equal(alphas[3], 1);
    assert.throws(() => ai.logitsToFloatAlpha(new Float32Array([NaN])));
    assert.throws(() => ai.logitsToFloatAlpha(new Float32Array([Infinity])));

    // Tiny synthetic model bytes exercise cache, full SHA, retry and session reuse;
    // the runtime fixture never loads ORT or performs neural inference.
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const manifest = {...fixture, bytes: payload.length, sha256: hash(payload), chunks: [
      {file: 'test-01.bin', bytes: 4, sha256: hash(payload.subarray(0, 4))},
      {file: 'test-02.bin', bytes: 4, sha256: hash(payload.subarray(4))}
    ]};
    let chunkFetches = 0, cacheDeletes = 0;
    const cached = new Map([['test-01.bin', new Uint8Array([9, 9, 9, 9])]]);
    globalThis.caches = {async open(){return {
      async match(url){const data=cached.get(path.basename(url.pathname));return data ? new Response(data) : undefined},
      async put(url,response){cached.set(path.basename(url.pathname),new Uint8Array(await response.arrayBuffer()))},
      async delete(url){cacheDeletes++;return cached.delete(path.basename(url.pathname))}
    }}};
    globalThis.fetch = async url => {
      const name = path.basename(new URL(url).pathname);
      if (name === 'manifest.json') return new Response(JSON.stringify(manifest));
      chunkFetches++;
      return new Response(name === 'test-01.bin' ? payload.subarray(0, 4) : payload.subarray(4));
    };
    globalThis.__lucidaTest = {creates: 0, runs: 0, inputsDisposed: 0, outputsDisposed: 0};
    const source = {data: new Uint8ClampedArray([20, 5, 1, 255]), width: 1, height: 1};
    await assert.rejects(ai.remove(source), /synthetic create failure/);
    assert.equal(cacheDeletes, 1); assert.equal(chunkFetches, 2);
    const progress = [], native = await ai.remove(source, (phase, value) => progress.push({phase, value}));
    assert.equal(native.width, 1); assert.equal(native.height, 1); assert.ok(native.data instanceof Float32Array);
    assert.ok(Math.abs(native.data[0] - .75) < 1e-6);
    assert.equal(globalThis.__lucidaTest.creates, 2); assert.equal(chunkFetches, 2);
    assert.deepEqual(globalThis.__lucidaTest.model, Array.from(payload));
    assert.deepEqual(globalThis.__lucidaTest.options.executionProviders, ['synthetic-test-provider']);
    await ai.remove(source);
    assert.equal(globalThis.__lucidaTest.creates, 2); assert.equal(globalThis.__lucidaTest.runs, 2);
    assert.equal(globalThis.__lucidaTest.inputsDisposed, 2); assert.equal(globalThis.__lucidaTest.outputsDisposed, 2);
    globalThis.__lucidaTest.badShape = true;
    await assert.rejects(ai.remove(source), /尺寸无效/);
    assert.equal(globalThis.__lucidaTest.inputsDisposed, 3); assert.equal(globalThis.__lucidaTest.outputsDisposed, 3);
    assert.ok(progress.some(item => item.phase === 'loading' && item.value === 1));
    assert.ok(progress.some(item => item.phase === 'processing' && item.value === 1));
    await ai.release();
    assert.equal(globalThis.__lucidaTest.releases, 1);

    // A fake GPU tensor deliberately throws on .data access. This checks ordinary
    // CPU feeds, public getData readback, no graph capture and retry-safe cleanup.
    const state = globalThis.__lucidaTest;
    Object.assign(state, {gpu: true, gpuFeedData: [], gpuReadbacks: 0});
    const gpuAI = await import(pathToFileURL(path.join(temporary, 'gift-lucida-ai.mjs')) + '?gpu');
    const firstGPU = await gpuAI.remove(source);
    const changedSource = {...source, data: new Uint8ClampedArray([200, 5, 1, 255])};
    const changedGPU = await gpuAI.remove(changedSource);
    const normalizedRed = byte => (byte / 255 - .485) / .229;
    assert.ok(Math.abs(firstGPU.data[0] - 1 / (1 + Math.exp(-normalizedRed(20)))) < 1e-6);
    assert.ok(Math.abs(changedGPU.data[0] - 1 / (1 + Math.exp(-normalizedRed(200)))) < 1e-6);
    assert.notEqual(firstGPU.data[0], changedGPU.data[0]);
    assert.notEqual(state.gpuFeedData[0], state.gpuFeedData[1]); assert.equal(state.gpuReadbacks, 2);
    assert.deepEqual(state.options.executionProviders, [{name: 'webgpu'}, 'wasm']);
    assert.equal(state.options.enableGraphCapture, false); assert.equal(state.options.preferredOutputLocation, 'gpu-buffer');
    assert.equal(state.options.extra, undefined);
    state.failReadback = true; await assert.rejects(gpuAI.remove(source), /synthetic GPU readback failure/);
    assert.equal(state.outputsDisposed, 6); assert.equal(state.inputsDisposed, 6);
    await gpuAI.release(); assert.equal(state.releases, 2);

    state.failReadback=false;

    // Malformed source pixels must fail before any model/runtime network work.
    let unexpectedFetches=0;const normalFetch=globalThis.fetch;
    globalThis.fetch=async()=>{unexpectedFetches++;throw new Error('must not download for invalid source')};
    for(const invalidSource of [
      {data:new Uint8ClampedArray(4),width:2049,height:1},
      {data:new Uint8Array(4),width:1,height:1},
      {data:new Uint8ClampedArray(4),width:2,height:1}
    ])await assert.rejects(gpuAI.remove(invalidSource),/尺寸/);
    assert.equal(unexpectedFetches,0);globalThis.fetch=normalFetch;

    // Model-download integrity failures reset the pending session and remain
    // retryable. Correct cached chunks cannot bypass the whole-model SHA check.
    const integrityAI=await import(pathToFileURL(path.join(temporary,'gift-lucida-ai.mjs'))+'?integrity');
    const correctHash=manifest.sha256,createsBeforeIntegrity=state.creates;
    manifest.sha256='f'.repeat(64);
    await assert.rejects(integrityAI.remove(source),/完整性校验失败/);
    assert.equal(state.creates,createsBeforeIntegrity);manifest.sha256=correctHash;
    await integrityAI.remove(source);assert.equal(state.creates,createsBeforeIntegrity+1);
    await integrityAI.release();

    const networkAI=await import(pathToFileURL(path.join(temporary,'gift-lucida-ai.mjs'))+'?network-retry');
    cached.clear();globalThis.fetch=async url=>path.basename(new URL(url).pathname)==='manifest.json'
      ?new Response(JSON.stringify(manifest)):new Response(new Uint8Array([9,9,9,9]));
    const createsBeforeNetwork=state.creates;
    await assert.rejects(networkAI.remove(source),/分块校验失败/);assert.equal(state.creates,createsBeforeNetwork);
    globalThis.fetch=normalFetch;await networkAI.remove(source);assert.equal(state.creates,createsBeforeNetwork+1);
    await networkAI.release();

    const namesAI=await import(pathToFileURL(path.join(temporary,'gift-lucida-ai.mjs'))+'?session-names');
    state.badNames=true;const releaseBeforeNames=state.releases;
    await assert.rejects(namesAI.remove(source),/输入输出名称无效/);assert.equal(state.releases,releaseBeforeNames+1,'invalid session metadata releases the rejected session');
    state.badNames=false;await namesAI.remove(source);
    const createsBeforeFailure=state.creates,inputBeforeFailure=state.inputsDisposed,outputBeforeFailure=state.outputsDisposed;
    state.failRun=true;await assert.rejects(namesAI.remove(source),/synthetic inference rejection/);
    assert.equal(state.inputsDisposed,inputBeforeFailure+1);assert.equal(state.outputsDisposed,outputBeforeFailure,'a run rejection has no output tensor to dispose');
    state.failRun=false;await namesAI.remove(source);assert.equal(state.creates,createsBeforeFailure,'a failed inference reuses its valid model session on retry');
    for(const malformed of ['badLogitsLength','badLogitsType']){
      state[malformed]=true;const inputs=state.inputsDisposed,outputs=state.outputsDisposed;
      await assert.rejects(namesAI.remove(source),/尺寸无效/);
      assert.equal(state.inputsDisposed,inputs+1);assert.equal(state.outputsDisposed,outputs+1);state[malformed]=false;
    }
    await namesAI.release();
    const createsBeforeConcurrent=state.creates;
    await Promise.all([namesAI.remove(source),namesAI.remove(changedSource)]);
    assert.equal(state.creates,createsBeforeConcurrent+1,'concurrent first uses share the one model-loading promise');
    await namesAI.release();

    // A gated, uneven seven-block fixture proves the real loader starts only
    // three transfers, assembles out of order at manifest offsets and advances
    // by completed bytes. No ORT/network/model inference is involved.
    state.gpu=false;state.badShape=false;
    const pieces=[1,3,2,4,2,1,3].map((length,index)=>Uint8Array.from({length},(_,byte)=>index*10+byte));
    const parallelPayload=Buffer.concat(pieces),parallelManifest={...fixture,bytes:parallelPayload.length,sha256:hash(parallelPayload),
      chunks:pieces.map((bytes,index)=>({file:'parallel-'+index+'.bin',bytes:bytes.length,sha256:hash(bytes)}))};
    let blockCache=new Map(),pending=new Map(),started=[],inFlight=0,peak=0,aborted=0;
    globalThis.caches={async open(){return {
      async match(url){const bytes=blockCache.get(path.basename(url.pathname));return bytes?new Response(bytes):undefined},
      async put(url,response){blockCache.set(path.basename(url.pathname),new Uint8Array(await response.arrayBuffer()))},
      async delete(url){return blockCache.delete(path.basename(url.pathname))}
    }}};
    const gatedFetch=async(url,options={})=>{
      const name=path.basename(new URL(url).pathname);
      if(name==='manifest.json')return new Response(JSON.stringify(parallelManifest));
      const index=Number(name.match(/^parallel-(\d+)\.bin$/)?.[1]);assert.ok(Number.isInteger(index));
      started.push(index);inFlight++;peak=Math.max(peak,inFlight);
      return new Promise((resolve,reject)=>{
        let done=false;
        const finish=(error,bytes)=>{if(done)return;done=true;inFlight--;pending.delete(index);options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(new Response(bytes))};
        const abort=()=>{aborted++;finish(new Error('synthetic aborted block'))};
        pending.set(index,bytes=>finish(null,bytes));
        assert.ok(options.signal instanceof AbortSignal,'in-flight downloads have one cancellable signal');
        options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted)abort();
      });
    };
    const until=async condition=>{for(let count=0;count<1000&&!condition();count++)await new Promise(setImmediate);assert.ok(condition(),'gated download reached the expected state')};
    globalThis.fetch=gatedFetch;
    const parallelAI=await import(pathToFileURL(path.join(temporary,'gift-lucida-ai.mjs'))+'?bounded-download');
    const loading=[],parallelRun=parallelAI.remove(source,(phase,value)=>{if(phase==='loading')loading.push(value)});
    await until(()=>pending.size===3);assert.deepEqual(started,[0,1,2]);
    const completionOrder=[2,0,1,5,3,4,6];
    for(let count=0;count<completionOrder.length;count++){
      const index=completionOrder[count];await until(()=>pending.has(index));pending.get(index)(pieces[index]);
      await until(()=>loading.filter(value=>value>0&&value<=.85).length===count+1);
    }
    await parallelRun;
    assert.equal(peak,3);assert.equal(started.length,pieces.length);assert.equal(inFlight,0);
    assert.deepEqual(state.model,Array.from(parallelPayload),'out-of-order blocks assemble the exact SHA-checked model');
    let completedBytes=0;
    assert.deepEqual(loading.filter(value=>value>0&&value<=.85),completionOrder.map(index=>.85*(completedBytes+=pieces[index].length)/parallelPayload.length));
    assert.ok(loading.every((value,index)=>!index||value>=loading[index-1]),'loading progress is monotonic');
    await parallelAI.release();

    // Rejecting a block aborts peers and settles the queue before retry. Already
    // verified cache entries survive and are not fetched again on that retry.
    blockCache=new Map([['parallel-0.bin',pieces[0]]]);pending=new Map();started=[];inFlight=peak=aborted=0;
    const failingAI=await import(pathToFileURL(path.join(temporary,'gift-lucida-ai.mjs'))+'?bounded-failure');
    const failedProgress=[],failedRun=assert.rejects(failingAI.remove(source,(phase,value)=>failedProgress.push({phase,value})),/分块校验失败/);
    await until(()=>pending.size===3);assert.deepEqual(started,[1,2,3]);
    pending.get(2)(pieces[2]);await until(()=>blockCache.has('parallel-2.bin')&&pending.has(4));
    pending.get(1)(new Uint8Array(pieces[1].length).fill(255));await failedRun;
    assert.equal(inFlight,0);assert.equal(pending.size,0);assert.equal(aborted,2);assert.equal(peak,3);
    assert.deepEqual(started,[1,2,3,4],'failed workers never schedule additional blocks');
    const failedCount=failedProgress.length;await new Promise(setImmediate);assert.equal(failedProgress.length,failedCount,'a failed queue never emits late progress');
    const retryFetches=[];
    globalThis.fetch=async url=>{
      const name=path.basename(new URL(url).pathname);if(name==='manifest.json')return new Response(JSON.stringify(parallelManifest));
      retryFetches.push(name);return new Response(pieces[Number(name.match(/(\d+)\.bin$/)[1])]);
    };
    await failingAI.remove(source);assert.deepEqual(state.model,Array.from(parallelPayload));
    assert.ok(!retryFetches.includes('parallel-0.bin')&&!retryFetches.includes('parallel-2.bin'),'retry reuses every previously verified block');
    assert.equal(retryFetches.length,5);await failingAI.release();

    await checkInstalledAssets(fixture);
    console.log('gift-lucida: bounded three-block downloads, out-of-order assembly/byte progress, abort/partial-cache retry, manifest/chunk integrity, float ImageNet/sigmoid math, session retry/reuse/release, ordinary GPU getData without capture and tensor cleanup passed. Synthetic inference only.');
  } finally {
    globalThis.fetch = originalFetch; globalThis.caches = originalCaches; delete globalThis.__lucidaTest;
    await fs.rm(temporary, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});

async function checkInstalledAssets(modelManifest) {
  const production=path.resolve(__dirname,'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const {threadCount}=await import(pathToFileURL(path.join(production,'gift-lucida-runtime.mjs')));
  for(const [isolated,shared,cores,expected] of [[true,true,16,4],[true,true,2,2],[true,true,2.9,2],[false,true,16,1],[undefined,true,16,1],[true,false,16,1],[true,true,0,1],[true,true,Infinity,1],[true,true,undefined,1]]){
    assert.equal(threadCount({crossOriginIsolated:isolated,SharedArrayBuffer:shared?function(){}:undefined,navigator:{hardwareConcurrency:cores}}),expected);
  }
  assert.equal(modelManifest.name,'egeorcun/lucida-grid19-native1024-folded-nbits8-f32');
  assert.equal(modelManifest.license,'MIT');assert.equal(modelManifest.chunks.length,21);
  assert.equal(modelManifest.bytes,422542645);assert.equal(modelManifest.sha256,'74df4d6f7e2ba5b92639567a06ee3e00dcb34e92b098db47c9d10060b0ab4ca1');
  const modelDirectory=path.join(production,'assets/lucida'),modelHash=createHash('sha256');let modelBytes=0;
  for(const chunk of modelManifest.chunks){
    const filename=path.join(modelDirectory,chunk.file),bytes=await fs.readFile(filename);
    assert.equal(bytes.length,chunk.bytes);assert.ok(bytes.length<=20*1024*1024);assert.equal(hash(bytes),chunk.sha256);assert.equal((await fs.lstat(filename)).isSymbolicLink(),false);
    modelHash.update(bytes);modelBytes+=bytes.length;
  }
  assert.equal(modelBytes,modelManifest.bytes);assert.equal(modelHash.digest('hex'),modelManifest.sha256);
  assert.deepEqual((await fs.readdir(modelDirectory)).sort(),[...modelManifest.chunks.map(chunk=>chunk.file),'manifest.json','LICENSE-LUCIDA','LICENSE-BIREFNET','NOTICE.txt'].sort(),'deployable model directory contains only inference assets and attribution');
  for(const license of ['LICENSE-LUCIDA','LICENSE-BIREFNET'])assert.match(await fs.readFile(path.join(modelDirectory,license),'utf8'),/MIT License/);
  assert.ok((await fs.readFile(path.join(modelDirectory,'NOTICE.txt'),'utf8')).length>100);
  assert.equal(modelManifest.referenceDirectory,undefined);assert.equal(modelManifest.quantization?.tinyActualBrowserProof,undefined,'deployment metadata does not expose local test paths');
  const runtimeDirectory=path.join(production,'vendor/ort-lucida'),runtime=JSON.parse(await fs.readFile(path.join(runtimeDirectory,'manifest.json'),'utf8'));
  assert.equal(runtime.version,'1.30.0');
  for(const file of runtime.files){const bytes=await fs.readFile(path.join(runtimeDirectory,file.file));assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.sha256);assert.ok(bytes.length<=20*1024*1024)}
  assert.deepEqual((await fs.readdir(runtimeDirectory)).sort(),[...runtime.files.map(file=>file.file),'manifest.json'].sort());
  assert.match(await fs.readFile(path.join(runtimeDirectory,'LICENSE'),'utf8'),/MIT License/);
  assert.ok((await fs.readFile(path.join(runtimeDirectory,'ThirdPartyNotices.txt'),'utf8')).length>100);
  const gpu=JSON.parse(await fs.readFile(path.join(runtimeDirectory,'asyncify-manifest.json'),'utf8')),gpuHash=createHash('sha256');let gpuBytes=0;
  for(const chunk of gpu.chunks){const bytes=await fs.readFile(path.join(runtimeDirectory,chunk.file));gpuHash.update(bytes);gpuBytes+=bytes.length}
  assert.equal(gpuBytes,26781914);assert.equal(gpuHash.digest('hex'),'39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da');
}
