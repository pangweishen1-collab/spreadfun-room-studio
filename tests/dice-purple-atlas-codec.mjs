import assert from 'node:assert/strict';
import {encodeAtlasPng} from '../dice/purple-reference/atlas-png.mjs';
import {quantizeAtlasPng} from '../dice/atlas-png-palette.mjs';
import {quantizeAtlasRgba} from '../dice/purple-01r/atlas-palette.mjs';
import {createAtlasCodec} from '../dice/purple-01r/atlas-codec.mjs';

const cases = [
  {width:17,height:13,alpha:i=>i%4===0?0:i%4===1?255:(i*19)%253+1},
  {width:23,height:11,alpha:()=>255},
  {width:19,height:9,alpha:i=>(i*29)%254+1},
  {width:13,height:7,alpha:()=>0},
];
function seeded(run) {
  const previous = Math.random;
  let state = 13611;
  Math.random = () => ((state = (Math.imul(state,1664525)+1013904223)>>>0) / 4294967296);
  try { return run(); } finally { Math.random = previous; }
}
let goldens = 0;
for (const {width,height,alpha} of cases) {
  const rgba = new Uint8Array(width*height*4);
  for (let i=0;i<width*height;i++) rgba.set([(i*31)%256,(i*67+7)%256,(i*17+53)%256,alpha(i)],i*4);
  const unchanged = new Uint8Array(rgba);
  const png = await encodeAtlasPng(width,height,rgba);
  const encoded = await png.arrayBuffer();
  for (const limit of [8,128,256]) {
    // The frozen UPNG PCA starts from Math.random. Equal test seeds compare
    // the algorithm itself without changing production randomness or Green.
    const original = seeded(() => quantizeAtlasPng(encoded,limit));
    const direct = seeded(() => quantizeAtlasRgba(width,height,rgba,limit));
    assert.deepEqual(new Uint8Array(direct),new Uint8Array(original),
      'Raw RGBA produces the identical PNG palette bytes as the frozen PNG path');
    assert.deepEqual(rgba,unchanged,'Raw palette generation does not modify the fallback pixels');
    const padded = new Uint8Array(rgba.length+12);padded.set(rgba,8);
    assert.deepEqual(new Uint8Array(seeded(() => quantizeAtlasRgba(width,height,padded.subarray(8,8+rgba.length),limit))),new Uint8Array(original));
    goldens++;
  }
}
assert.equal(quantizeAtlasRgba(2,2,new Uint8Array(3)),null);
assert.equal(quantizeAtlasRgba(1,1,new Uint8Array(4),257),null);

const originalWorker = globalThis.Worker;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
class FakeWorker {
  static instances = [];
  constructor(url,options) {
    assert.match(url.pathname,/purple-01r\/atlas-codec-worker\.mjs$/);
    assert.equal(options.type,'module');
    this.inputs=[];this.terminated=0;FakeWorker.instances.push(this);
  }
  postMessage(data,transfer) { this.inputs.push(structuredClone(data,{transfer})); }
  reply(index,png) { this.onmessage({data:{id:this.inputs[index].id,png}}); }
  terminate() { this.terminated++; }
}
const page={width:2,height:2,rgba:new Uint8Array(16).fill(73)};
const png=new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'});
let sessions = 0;
try {
  globalThis.Worker = FakeWorker;
  const codec=createAtlasCodec();
  const worker=FakeWorker.instances.at(-1);
  const first=codec.encode(page),second=codec.encode(page);
  assert.equal(FakeWorker.instances.length,1,'All budget candidates use one Worker');
  assert.deepEqual(page.rgba,new Uint8Array(16).fill(73),'Transferred data is a copy');
  assert.deepEqual(new Uint8Array(worker.inputs[0].rgba),page.rgba);
  worker.reply(1,png);worker.reply(0,png);
  assert.deepEqual(await Promise.all([first,second]),[png,png],'Worker responses match request IDs');
  codec.dispose();codec.dispose();assert.equal(worker.terminated,1);
  assert.equal(await codec.encode(page),null);sessions++;

  const early=new AbortController();early.abort();
  const before=FakeWorker.instances.length,aborted=createAtlasCodec({signal:early.signal});
  await assert.rejects(aborted.encode(page),{name:'AbortError'});
  assert.equal(FakeWorker.instances.length,before);aborted.dispose();sessions++;

  const controller=new AbortController(),pending=createAtlasCodec({signal:controller.signal});
  const abortWorker=FakeWorker.instances.at(-1);
  const a=assert.rejects(pending.encode(page),{name:'AbortError'});
  const b=assert.rejects(pending.encode(page),{name:'AbortError'});
  controller.abort();await Promise.all([a,b]);
  assert.equal(abortWorker.terminated,1);pending.dispose();sessions++;

  const failure=createAtlasCodec(),failed=failure.encode(page),failedWorker=FakeWorker.instances.at(-1);
  let prevented=false;failedWorker.onerror({preventDefault(){prevented=true;}});
  assert.equal(await failed,null);assert(prevented);assert.equal(failedWorker.terminated,1);
  assert.equal(await failure.encode(page),null);failure.dispose();sessions++;

  const invalid=createAtlasCodec(),invalidJob=invalid.encode(page),invalidWorker=FakeWorker.instances.at(-1);
  invalidWorker.reply(0,new Blob(['wrong'],{type:'text/plain'}));assert.equal(await invalidJob,null);
  const messageJob=invalid.encode(page);invalidWorker.onmessageerror();assert.equal(await messageJob,null);
  assert.equal(invalidWorker.terminated,1);invalid.dispose();sessions++;

  const disposed=createAtlasCodec(),disposedJob=disposed.encode(page),disposedWorker=FakeWorker.instances.at(-1);
  disposed.dispose();assert.equal(await disposedJob,null);assert.equal(disposedWorker.terminated,1);sessions++;

  const timers=new Map();let timerId=0;
  globalThis.setTimeout=(callback,ms)=>{assert.equal(ms,12000);timers.set(++timerId,callback);return timerId;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const timeout=createAtlasCodec(),timeoutJob=timeout.encode(page),timeoutWorker=FakeWorker.instances.at(-1);
  [...timers.values()][0]();assert.equal(await timeoutJob,null);assert.equal(timeoutWorker.terminated,1);assert.equal(timers.size,0);
  assert.equal(await timeout.encode(page),null);timeout.dispose();sessions++;
  globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout;

  globalThis.Worker=class { constructor(){throw Error('unavailable');} };
  const unavailable=createAtlasCodec();assert.equal(await unavailable.encode(page),null);unavailable.dispose();sessions++;
  globalThis.Worker=undefined;
  const unsupported=createAtlasCodec();assert.equal(await unsupported.encode(page),null);unsupported.dispose();sessions++;
} finally {
  globalThis.Worker=originalWorker;
  globalThis.setTimeout=originalSetTimeout;
  globalThis.clearTimeout=originalClearTimeout;
}
console.log(JSON.stringify({ok:true,paletteByteIdenticalGoldens:goldens,workerSessionCases:sessions,
  inputRgbaRetained:true,workerPerGeneration:1,abortRejectsAndCleansUp:true,timeoutAndFailureFallback:true},null,2));
