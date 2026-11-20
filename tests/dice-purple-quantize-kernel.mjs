import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import UPNG from '../dice/vendor/upng/upng.mjs';
import {loadQuantizeKernel} from '../dice/purple-01r/quantize-kernel.mjs';

const binary=await fs.readFile(new URL('../dice/purple-01r/quantize-kernel.wasm',import.meta.url));
const kernel=await loadQuantizeKernel({binary});
assert.ok(kernel);
let state=123456789,cases=0;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
function checkNearest(source,colors,initial,label){
  const sourceBefore=source.slice(),colorsBefore=colors.slice(),old=initial.slice(),next=initial.slice(),job=kernel.prepare(source);
  const expected=UPNG.quantize.findNearest(source,old,colors);
  assert.ok(job);
  assert.ok(Object.is(job.nearest(next,colors),expected),label+' exact error');
  assert.deepEqual(next,old,label+' indices');
  assert.deepEqual(source,sourceBefore,label+' source immutable');
  assert.deepEqual(colors,colorsBefore,label+' palette immutable');
  cases++;
}

for(const k of [1,2,3,8,31,32,60,63,192,255,256]){
  for(const count of [1,3,32,257,16385]){
    const colors=Uint8Array.from({length:k*4},()=>random()*256),source=Uint8Array.from({length:count*4},()=>random()*256);
    for(const mode of ['zero','random','exact']){
      const initial=Uint8Array.from({length:count},()=>mode==='random'?random()*k:0);
      if(mode==='exact')for(let i=0;i<count;i++)source.set(colors.subarray((i%k)*4,(i%k)*4+4),i*4);
      checkNearest(source,colors,initial,k+'/'+count+'/'+mode);
    }
  }
}
for(let i=0;i<256;i++)checkNearest(new Uint8Array([1,0,0,0,255,255,255,255,0,0,0,0]),new Uint8Array([0,0,0,0,2,0,0,0,2,0,0,0,255,255,255,255]),new Uint8Array([i%3,i%4,i%4]),'tie/'+i);
for(let i=0;i<500;i++){
  const k=1+(random()*256|0),n=1+(random()*128|0),source=Uint8Array.from({length:n*4+8},()=>random()*256),colors=Uint8Array.from({length:k*4+8},()=>random()*256);
  checkNearest(source.subarray(4,-4),colors.subarray(4,-4),Uint8Array.from({length:n},()=>random()*k),'random/'+i);
}

// The PCA path must preserve the pinned tree's branch and local tie behavior.
for(const k of [1,2,3,8,31,60,63,192,256]){
  const source=Uint8Array.from({length:1024*4},()=>random()*256),before=source.slice(),[root]=UPNG.quantize.getKDtree(source.slice(),k);
  const expectedIndices=new Uint8Array(1024),expectedMapped=new Uint32Array(1024),indices=new Uint8Array(1024),mapped=new Uint32Array(1024);
  for(let p=0;p<1024;p++){
    const i=p*4,node=UPNG.quantize.getNearest(root,source[i]*(1/255),source[i+1]*(1/255),source[i+2]*(1/255),source[i+3]*(1/255));
    expectedIndices[p]=node.ind;expectedMapped[p]=node.est.rgba;
  }
  const job=kernel.prepare(source);job.pca(root,indices,mapped);
  assert.deepEqual(indices,expectedIndices,'PCA indices K'+k);
  assert.deepEqual(mapped,expectedMapped,'PCA packed RGBA K'+k);
  assert.deepEqual(source,before,'PCA source immutable');
  cases++;
}
// Equidistant leaves preserve the first visited branch, including pd == 0.
for(const pd of [0,Number.EPSILON,-Number.EPSILON]){
  const source=new Uint8Array([128,128,128,255]),q=[128/255,128/255,128/255,1];
  const root={est:{e:[0,0,0,0],eMq:-pd},left:{ind:7,est:{q,rgba:0xff112233}},right:{ind:3,est:{q,rgba:0xff445566}}};
  const old=UPNG.quantize.getNearest(root,...q),indices=new Uint8Array(1),mapped=new Uint32Array(1);
  kernel.prepare(source).pca(root,indices,mapped);
  assert.equal(indices[0],old.ind);assert.equal(mapped[0],old.est.rgba);cases++;
}

// Reserve the largest supported source before palette discovery. This must not
// consume RNG; unsupported sizes/empty input safely retain the original codec.
const rng=Math.random;let randomCalls=0;Math.random=()=>{randomCalls++;return .5;};
try{
  assert.ok(kernel.prepare(new Uint8Array(4*1024*1024)));
  assert.equal(kernel.prepare(new Uint8Array(4*1024*1024+4)),null);
  assert.equal(kernel.prepare(new Uint8Array(0)),null);
  assert.equal(kernel.prepare(new Uint8Array(3)),null);
  assert.equal(kernel.prepare(null),null);
  assert.equal(randomCalls,0);
}finally{Math.random=rng;}
assert.equal(await loadQuantizeKernel({binary:new Uint8Array([1,2,3])}),null);
const boundedMemory=(await WebAssembly.instantiate(binary)).instance.exports.memory;
boundedMemory.grow(255);
assert.equal(boundedMemory.buffer.byteLength,16*1024*1024);
assert.throws(()=>boundedMemory.grow(1),RangeError);
const nativeWebAssembly=globalThis.WebAssembly;
try{
  globalThis.WebAssembly=undefined;
  assert.equal(await loadQuantizeKernel({binary}),null);
  globalThis.WebAssembly={instantiate:async()=>({instance:{exports:{memory:{buffer:new ArrayBuffer(65536),grow(){throw new RangeError('Simulated capacity failure');}},findNearest(){},initialPca(){}}}})};
  assert.equal((await loadQuantizeKernel({binary})).prepare(new Uint8Array(65536)),null);
}finally{globalThis.WebAssembly=nativeWebAssembly;}
console.log(`Purple exact WASM kernel: ${cases} nearest/PCA cases and allocation/load fallbacks passed (${binary.length} byte binary).`);
