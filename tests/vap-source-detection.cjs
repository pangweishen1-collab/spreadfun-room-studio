const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const sample=(paint,width=96,height=128)=>{
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(paint(x,y,width,height),(y*width+x)*4);
  return {width,height,data};
};
const green=(x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[210,145,105,255]:[18,208,32,255];
const blue=(x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[210,145,105,255]:[20,38,225,255];
const regular=(x,y,w,h)=>y<h*.48?[50+x*.4,120+y*.2,190-y*.5,255]:[45+x*.5,105+x*.2,32+y*.2,255];
(async()=>{
  const {detectVideoSource}=await import(pathToFileURL(path.join(__dirname,'../vap-source-detection.mjs')));
  const plain={sourceKind:'plain_mp4',screenColor:'auto',confidence:0};
  assert.deepEqual(detectVideoSource([]),plain);assert.deepEqual(detectVideoSource(null),plain);
  assert.deepEqual(detectVideoSource([{width:96,height:128,data:new Uint8Array(2)}]),plain);
  const g=sample(green),b=sample(blue),original=g.data.slice();
  for(const [frames,color] of [[[g],'green'],[[g,g,g],'green'],[[b,b,b],'blue']]){
    const result=detectVideoSource(frames);assert.equal(result.sourceKind,'chroma_mp4');assert.equal(result.screenColor,color);assert.ok(result.confidence>=.9);
  }
  assert.deepEqual(g.data,original,'classification must not mutate the source');
  const blank=sample(()=>[0,0,0,255]);
  assert.equal(detectVideoSource([blank,g,g]).screenColor,'green','black intros do not force a chroma asset to regular');
  assert.deepEqual(detectVideoSource([blank,blank,blank]),plain);
  assert.deepEqual(detectVideoSource([sample(regular),sample(regular),sample(regular)]),plain,'sky and foliage are not one coherent screen');
  const greenObject=sample((x,y,w,h)=>x>w*.15&&x<w*.85&&y>h*.1&&y<h*.9?[10,230,10,255]:[155,140,105,255]);
  assert.deepEqual(detectVideoSource([greenObject,greenObject,greenObject]),plain,'a large green subject does not imply green background');
  const blueRoom=sample((x,y,w,h)=>[25+x*1.2,55+y*.6,210-x*.6,255]);
  assert.deepEqual(detectVideoSource([blueRoom,blueRoom,blueRoom]),plain,'varied blue surroundings fail plate consistency');
  assert.deepEqual(detectVideoSource([g,b,g]),plain,'mixed green and blue screen evidence stays regular');
  assert.deepEqual(detectVideoSource([g,g,sample(regular)]),plain,'a contradictory regular frame prevents automatic keying');
  const split=sample((x,y,w,h)=>x<w/2?[0,220,0,255]:[0,0,220,255]);
  assert.deepEqual(detectVideoSource([split,split,split]),plain);
  const letterbox=sample((x,y,w,h)=>y<h*.18||y>h*.82?[0,0,0,255]:green(x,y-h*.18,w,h*.64));
  assert.equal(detectVideoSource([letterbox,letterbox,letterbox]).screenColor,'green','contiguous black letterbox bands are excluded');
  const clear=sample(()=>[0,255,0,0]);assert.deepEqual(detectVideoSource([clear,clear]),plain);
  const noisy=sample((x,y,w,h)=>{const rgb=green(x,y,w,h),noise=(x*7+y*11)%9-4;return rgb.map((v,i)=>i===3?v:v+noise);});
  assert.equal(detectVideoSource([noisy,noisy]).screenColor,'green','minor codec noise should keep uniform-screen detection');
  console.log('vap-source-detection: conservative perimeter/side/plate consistency, green/blue and multi-frame consensus, black intro/letterbox, regular scenery/colored subject/varied room rejection, malformed/transparent inputs and pixel preservation passed. Synthetic classification evidence only.');
})().catch(error=>{console.error(error);process.exitCode=1});
