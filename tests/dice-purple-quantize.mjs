import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import UPNG from '../dice/vendor/upng/upng.mjs';
import {createQuantizer} from '../dice/purple-01r/quantize.mjs';
import {loadQuantizeKernel} from '../dice/purple-01r/quantize-kernel.mjs';

const kernel=await loadQuantizeKernel({binary:readFileSync(new URL('../dice/purple-01r/quantize-kernel.wasm',import.meta.url))});
assert.ok(kernel,'The real shipped kernel must instantiate');
const quantizeRgba=createQuantizer(kernel);

// Green still imports this exact v1.24.3 codec; Purple's adapter must not edit it.
const vendorDigest=createHash('sha256').update(readFileSync(new URL('../dice/vendor/upng/upng.mjs',import.meta.url))).digest('hex');
assert.equal(vendorDigest,'706da338688d9bfe99e4016339d728aca8b827c5d979aadb7356f1230fa07958');

function seeded(seed){let state=seed;return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}
function input(length,mode){
  const bytes=new Uint8Array(length*4),random=seeded(735137);
  for(let i=0;i<length;i++){
    const alpha=mode==='opaque'?255:mode==='constant'?127:mode==='partial'?Math.floor(random()*254)+1:Math.floor(random()*256);
    for(let c=0;c<3;c++){const value=mode==='constant'?[11,37,103][c]:mode==='ties'?[0,1,2,127,128,254,255][(i+c)%7]:Math.floor(random()*256);bytes[i*4+c]=mode==='partial'?Math.round(value*alpha/255):value;}
    bytes[i*4+3]=alpha;
  }
  return bytes;
}
let comparisons=0;
function compare(bytes,colors,seed,forceKmeans){
  const original=bytes.slice(),random=Math.random;let expected,actual;
  try{Math.random=seeded(seed);expected=UPNG.quantize(bytes.buffer,colors,forceKmeans);Math.random=seeded(seed);actual=quantizeRgba(bytes.buffer,colors,forceKmeans);}
  finally{Math.random=random;}
  const label=JSON.stringify({pixels:bytes.length/4,colors,seed,forceKmeans});
  assert.deepEqual(bytes,original,'Original RGBA stays unchanged: '+label);
  assert.deepEqual(new Uint8Array(actual.abuf),new Uint8Array(expected.abuf),'Quantized RGBA bytes: '+label);
  assert.deepEqual(actual.inds,expected.inds,'Palette indices, including ties: '+label);
  assert.deepEqual(actual.plte.map(p=>[p.ind,p.est.rgba]),expected.plte.map(p=>[p.ind,p.est.rgba]),'Palette order and colors: '+label);
  comparisons++;
}
for(const colors of [1,2,8,32,60,61,63,64,192,256])for(const mode of ['opaque','partial','constant','ties'])for(const seed of [1,987654321])compare(input(257,mode),colors,seed);
// Small/large classes, both nearest branches and k-means refinement.
for(const [length,colors,mode]of [[16383,32,'partial'],[16384,31,'partial'],[16384,32,'partial'],[20000,63,'partial'],[16384,64,'opaque'],[65536,192,'opaque'],[16384,256,'noise']])for(const seed of [42,2024])compare(input(length,mode),colors,seed);
compare(new Uint8Array(),8,42);
compare(input(4096,'partial'),63,42,true);
for(const failed of [null,{prepare:()=>null},{prepare:()=>{throw new RangeError('memory pressure');}}]){
  const fallback=createQuantizer(failed),bytes=input(4096,'partial'),random=Math.random;
  let expected,actual,expectedCalls=0,actualCalls=0;
  try{
    let next=seeded(1611);Math.random=()=>{expectedCalls++;return next();};expected=UPNG.quantize(bytes.buffer,63,true);
    next=seeded(1611);Math.random=()=>{actualCalls++;return next();};actual=fallback(bytes.buffer,63,true);
  }finally{Math.random=random;}
  assert.equal(actualCalls,expectedCalls,'Allocation failure does not advance the palette random sequence');
  assert.deepEqual(new Uint8Array(actual.abuf),new Uint8Array(expected.abuf));
  assert.deepEqual(actual.inds,expected.inds);
}
console.log(JSON.stringify({ok:true,comparisons,exactRgbaIndicesAndPalette:true,originalBytesUnchanged:true,sharedVendorUnchanged:true}));
