'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
async function test(){
  const {resizeMatteInput,resizeMatteAlpha}=await import(pathToFileURL(path.join(__dirname,'../gift-matte-resample.mjs')));
  const source=new Uint8ClampedArray(7*5*4);
  for(let y=0;y<5;y++)for(let x=0;x<7;x++)source.set([(x*37+y*61)%256,(x+y)%2?255:0,x===3&&y===2?230:4,255],(y*7+x)*4);
  const resized=resizeMatteInput(source,7,5,3);
  // Independent Pillow BILINEAR reference: includes a checkerboard and a single
  // small light so that point sampling cannot silently replace antialiasing.
  const rgb=Buffer.from('3a7d04898104b17d048e7d048a80385d7d04847d044f8104987d04','hex');
  for(let i=0;i<9;i++)for(let c=0;c<3;c++)assert.ok(Math.abs(resized[i*4+c]-rgb[i*3+c])<=1);
  for(let i=0;i<9;i++)assert.equal(resized[i*4+3],255);
  assert.equal(resizeMatteInput(source,7,5,7).length,7*7*4);
  const same=new Uint8ClampedArray(4*4*4);assert.equal(resizeMatteInput(same,4,4,4),same);
  const alpha=Float32Array.from([0,.2,.6,0,1,.4,.9,.3,0,.8,.7,.1,.3,.2,1,0]);
  const expected=[0,.0124899642542,.168570667505,.441346168518,.572016298771,.183358371258,0,.828294754028,.627400159836,.321064949036,.58050775528,.818706691265,.430936515331,.182457178831,.535321474075,.570116043091,.640582382679,.767578125,.778581142426,.404407769442,.179387032986,0,.204226642847,.627438604832,.79999089241,.741080880165,.277018368244,.001181300846,.32400265336,.238981232047,.154553890228,.648407459259,.992706537247,.334985762835,0];
  const restored=resizeMatteAlpha(alpha,4,7,5);
  for(let i=0;i<expected.length;i++)assert.ok(Math.abs(restored[i]-expected[i])<1e-6,'native alpha matches the independent Pillow float32 bicubic reference');
  assert.throws(()=>resizeMatteInput(new Uint8Array(4),1,1,1));
  assert.throws(()=>resizeMatteInput(new Uint8ClampedArray(4),2049,1,1));
  assert.throws(()=>resizeMatteAlpha(Float32Array.of(NaN),1,2,2));
  assert.throws(()=>resizeMatteAlpha(Float32Array.of(1),1,0,1));
  console.log('gift-matte-resample: upstream antialiased input and float32 bicubic alpha references passed');
}
test().catch(error=>{console.error(error);process.exitCode=1});
