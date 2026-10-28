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
  const {detectVideoSource,detectFrameScreen,classifyScreenColor,SCREEN_COLORS}=await import(pathToFileURL(path.join(__dirname,'../vap-source-detection.mjs')));
  const plain={sourceKind:'plain_mp4',screenColor:'auto',confidence:0};
  assert.deepEqual(detectVideoSource([]),plain);assert.deepEqual(detectVideoSource(null),plain);
  assert.deepEqual(detectVideoSource([{width:96,height:128,data:new Uint8Array(2)}]),plain);
  const g=sample(green),b=sample(blue),original=g.data.slice();
  for(const [frames,color] of [[[g],'green'],[[g,g,g],'green'],[[b,b,b],'blue']]){
    const result=detectVideoSource(frames);assert.equal(result.sourceKind,'chroma_mp4');assert.equal(result.screenColor,color);assert.ok(result.confidence>=.9);
  }
  assert.deepEqual(g.data,original,'classification must not mutate the source');
  assert.deepEqual(SCREEN_COLORS,['red','orange','yellow','green','cyan','blue','magenta','custom']);
  assert.equal(Object.isFrozen(SCREEN_COLORS),true);
  const plate=(background)=>(x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[54,64,72,255]:[...background,255];
  for(const [background,color] of [[[222,24,35],'red'],[[225,110,28],'orange'],[[210,200,21],'yellow'],[[22,199,210],'cyan'],[[198,20,189],'magenta'],[[142,70,108],'magenta'],[[72,105,148],'blue'],[[238,102,155],'magenta']]){
    const frame=sample(plate(background)),before=frame.data.slice(),result=detectVideoSource([frame,frame,frame]);
    assert.equal(result.sourceKind,'chroma_mp4','colored plate '+background);
    assert.equal(result.screenColor,color,'family names describe the measured RGB '+background);
    assert.deepEqual(result.background,background,'return the actual RGB, not the pure family preset');
    assert.ok(result.confidence>=.9);
    assert.deepEqual(frame.data,before,'new color detection never edits input pixels');
  }
  assert.equal(classifyScreenColor([130,130,130]),'custom');
  assert.equal(classifyScreenColor([270,0,0]),'custom');
  assert.equal(classifyScreenColor(null),'custom');
  const red1=sample(plate([222,24,35])),red2=sample(plate([160,33,40]));
  assert.deepEqual(detectVideoSource([red1,red1,red2]),plain,'different actual RGB plates are contradictory even within the same red family');
  const tanRoom=sample((x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[14,210,30,255]:[100,83,70,255]);
  assert.deepEqual(detectVideoSource([tanRoom,tanRoom,tanRoom]),plain,'a flat neutral brown room stays regular despite a colored subject');
  for(const neutral of [[0,0,0],[125,125,125],[255,255,255]]){
    const frame=sample(plate(neutral));
    assert.deepEqual(detectVideoSource([frame,frame,frame]),plain,'achromatic plates require explicit black/white modes');
  }
  const small=sample(plate([223,24,34]),5,5);
  assert.deepEqual(detectFrameScreen(small).background,[223,24,34],'shared frame estimator supports small matte tests');
  const padded=sample((x,y)=>y>=8&&y<12?[25,40,228,255]:[0,0,0,0],10,20);
  assert.deepEqual(detectFrameScreen(padded).background,[25,40,228],'large transparent contain padding does not contaminate plate RGB');
  assert.equal(detectFrameScreen(sample(()=>[0,0,0,0],5,5)),null);
  const redNoise=sample((x,y,w,h)=>{const rgb=plate([222,24,35])(x,y,w,h),noise=(x*7+y*11)%9-4;return rgb.map((v,i)=>i===3?v:v+noise);});
  const noisyRed=detectVideoSource([redNoise,redNoise]);
  assert.equal(noisyRed.screenColor,'red');
  assert.ok(noisyRed.background.every((v,i)=>Math.abs(v-[222,24,35][i])<=1),'codec noise returns a stable measured red');

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
  console.log('vap-source-detection: measured arbitrary-color RGB, red/orange/yellow/green/cyan/blue/magenta/muted plates, small-frame/transparent-padding fallback, conservative perimeter/side/plate consistency and multi-frame RGB consensus, black intro/letterbox, ordinary/brown/colored-subject/varied-room rejection, malformed/transparent inputs and pixel preservation passed. Synthetic classification evidence only.');
})().catch(error=>{console.error(error);process.exitCode=1});
