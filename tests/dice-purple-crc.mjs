import assert from 'node:assert/strict';
import {crc32Png} from '../dice/purple-01r/png-crc.mjs';
import {crc32 as reference} from '../dice/six-face/png-rgba.mjs';

assert.equal(crc32Png(new Uint8Array()),0);
assert.equal(crc32Png(new TextEncoder().encode('123456789')),0xcbf43926);

let seed=0x19831119,cases=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
function check(length,offset){
  const source=Uint8Array.from({length:length+offset+13},()=>random()>>>24);
  const before=source.slice(),view=source.subarray(offset,offset+length);
  const expected=reference(view);
  assert.equal(crc32Png(view),expected,'CRC differs for length='+length+', offset='+offset);
  assert.equal(crc32Png(new Uint8ClampedArray(source.buffer,offset,length)),expected);
  assert.equal(crc32Png(Buffer.from(source.buffer,offset,length)),expected);
  assert.deepEqual(source,before,'CRC calculation must not rewrite source or surrounding bytes');
  cases++;
}
for(let length=0;length<=129;length++)for(let offset=0;offset<16;offset++)check(length,offset);
for(const length of [255,256,257,511,512,513,1023,1024,1025,65535,65536,65537,1048575,1048576,1048577,10*1024*1024]){
  check(length,3);check(length,11);
}
for(let sample=0;sample<32;sample++)check(random()%131073,random()%32);
assert.throws(()=>crc32Png([1,2,3]),/byte typed array/);
assert.throws(()=>crc32Png(new Uint16Array(3)),/byte typed array/);
assert.throws(()=>crc32Png(new DataView(new ArrayBuffer(3))),/byte typed array/);
console.log(JSON.stringify({ok:true,format:'PNG IEEE CRC-32',strategy:'slicing-by-8',cases,
  maxBytes:10*1024*1024,byteViews:['Uint8Array','Uint8ClampedArray','Buffer'],unalignedOffsets:true,inputPreserved:true},null,2));
