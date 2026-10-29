const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs'),{inflateSync}=require('node:zlib');
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
  for(const neutral of [[12,12,12],[125,125,125],[244,244,244],[255,253,250]]){
    const frame=sample(plate(neutral));
    assert.deepEqual(detectVideoSource([frame,frame,frame]),plain,'gray, off-white and tinted walls remain ordinary MP4');
  }
  const blackPlate=sample(plate([0,0,0])),whitePlate=sample(plate([255,255,255]));
  for(const [frame,method,background] of [[blackPlate,'black_luma',[0,0,0]],[whitePlate,'white_luma',[255,255,255]]]){
    const before=frame.data.slice(),result=detectVideoSource([frame,frame,frame]);
    assert.equal(result.sourceKind,'plain_mp4');assert.equal(result.screenColor,'auto');
    assert.equal(result.matteMethod,method);assert.deepEqual(result.background,background);assert.ok(result.confidence>=.965);
    assert.deepEqual(frame.data,before,'neutral classification cannot change source pixels');
    assert.deepEqual(detectVideoSource([frame]),plain,'neutral auto removal requires at least two nonblank samples');
  }
  for(const [base,method] of [[2,'black_luma'],[253,'white_luma']]){
    const frame=sample((x,y,w,h)=>{
      if(x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89)return [45,70,100,255];
      const noise=(x*7+y*11)%5-2;return [base+noise,base+noise,base+noise,255];
    }),before=frame.data.slice(),result=detectVideoSource([frame,frame,frame]);
    assert.equal(result.matteMethod,method,'minor codec noise on a near-pure neutral plate');
    assert.deepEqual(result.background,[base,base,base]);assert.deepEqual(frame.data,before);
  }
  const particles=sample((x,y,w,h)=>{
    if(x>w*.27&&x<w*.73&&y>h*.14&&y<h*.86)return [55+x,32+y,12,255];
    if((x===3&&y===18)||(x===w-3&&y===h-17))return [255,185,60,255];
    const glow=Math.max(0,18-Math.hypot((x-w/2)*.7,(y-h/2)*.55));
    return [glow,glow*.6,glow*.2,255];
  });
  assert.equal(detectVideoSource([particles,particles,particles]).matteMethod,'black_luma','use original perimeter before cropping a black gift with glow and isolated particles');
  assert.deepEqual(detectVideoSource([blackPlate,whitePlate,blackPlate]),plain,'mixed black and white removal methods are contradictory');
  assert.deepEqual(detectVideoSource([blackPlate,g,blackPlate]),plain,'mixed neutral and chroma methods are contradictory');
  assert.deepEqual(detectVideoSource([blackPlate,blackPlate,sample(regular)]),plain,'ordinary frame evidence prevents automatic neutral removal');
  const elevatedBlack=sample(plate([4,4,4]));
  assert.deepEqual(detectVideoSource([blackPlate,elevatedBlack,elevatedBlack]),plain,'changing neutral RGB is not a stable shared plate');
  const whiteObject=sample((x,y,w,h)=>x>w*.15&&x<w*.85&&y>h*.1&&y<h*.9?[255,255,255,255]:[148,140,126,255]);
  const blackObject=sample((x,y,w,h)=>x>w*.15&&x<w*.85&&y>h*.1&&y<h*.9?[0,0,0,255]:[148,140,126,255]);
  for(const frame of [whiteObject,blackObject])assert.deepEqual(detectVideoSource([frame,frame,frame]),plain,'a neutral foreground object is not a neutral backdrop');
  const grayGradient=sample((x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[190,120,80,255]:[Math.min(24,x/3),Math.min(24,x/3),Math.min(24,x/3),255]);
  const whiteGradient=sample((x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[190,120,80,255]:[255-x/4,255-x/4,255-x/4,255]);
  for(const frame of [grayGradient,whiteGradient])assert.deepEqual(detectVideoSource([frame,frame,frame]),plain,'varied dark and white surroundings are not uniform plates');
  const sparse=sample((x,y)=>x===48&&y===64?[255,255,255,255]:[0,0,0,255]);
  assert.deepEqual(detectVideoSource([sparse,sparse,sparse]),plain,'a few bright pixels do not establish a foreground subject');
  const alphaPlate=sample((x,y,w,h)=>x>w*.28&&x<w*.72&&y>h*.12&&y<h*.89?[64,64,64,255]:[0,0,0,0]);
  assert.deepEqual(detectVideoSource([alphaPlate,alphaPlate,alphaPlate]),plain,'existing transparent RGB padding does not imply a new black removal operation');
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
  const whiteBlank=sample(()=>[255,255,255,255]);
  assert.equal(detectVideoSource([blank,g,g]).screenColor,'green','black intros do not force a chroma asset to regular');
  assert.deepEqual(detectVideoSource([blank,blank,blank]),plain);
  assert.deepEqual(detectVideoSource([whiteBlank,whiteBlank,whiteBlank]),plain);
  assert.deepEqual(detectVideoSource([blank,whiteBlank,blank]),plain,'blank frames never establish a removal method');
  assert.equal(detectVideoSource([blank,blackPlate,blackPlate]).matteMethod,'black_luma');
  assert.equal(detectVideoSource([whiteBlank,whitePlate,whitePlate]).matteMethod,'white_luma');
  assert.deepEqual(detectVideoSource([blank,whiteBlank,blackPlate]),plain,'blank intros do not count toward the two-foreground-frame requirement');
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
  const regularLetterbox=sample((x,y,w,h)=>y<h*.18||y>h*.82?[0,0,0,255]:regular(x,y-h*.18,w,h*.64));
  assert.deepEqual(detectVideoSource([regularLetterbox,regularLetterbox,regularLetterbox]),plain,'black bars around a nonuniform ordinary scene are not a black plate');
  const clear=sample(()=>[0,255,0,0]);assert.deepEqual(detectVideoSource([clear,clear]),plain);
  const noisy=sample((x,y,w,h)=>{const rgb=green(x,y,w,h),noise=(x*7+y*11)%9-4;return rgb.map((v,i)=>i===3?v:v+noise);});
  assert.equal(detectVideoSource([noisy,noisy]).screenColor,'green','minor codec noise should keep uniform-screen detection');
  // Real 720x1280 green gift video: the first sampled frame contains a yellow
  // light burst whose downsampled edge pixels narrowly miss the old consistency
  // gate. Two later frames retain the same RGB plate. Use frame-at-or-before
  // sampling (11/48/82), not seek-to-next-frame (12/49/83), which hid the bug.
  // This optional, ignored fixture contains pixels derived from a private user
  // clip. Public checkouts retain the synthetic assertions above without it.
  const fixturePath=path.join(__dirname,'fixtures/green-glow-lowres.json');
  if(fs.existsSync(fixturePath)){
    const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
    assert.equal(fixture.encoding,'zlib-base64-rgba');assert.deepEqual(fixture.samples.map(frame=>frame.frameIndex),[11,48,82]);
    const captured=fixture.samples.map(({pixels})=>{const data=new Uint8ClampedArray(inflateSync(Buffer.from(pixels,'base64')));assert.equal(data.length,fixture.width*fixture.height*4);return {width:fixture.width,height:fixture.height,data};}),capturedBefore=captured.map(frame=>frame.data.slice());
    assert.equal(detectFrameScreen(captured[0])?.color,'green','low-resolution glow-contaminated perimeter still provides strong green-plate evidence');
    const detectedGift=detectVideoSource(captured);assert.equal(detectedGift.sourceKind,'chroma_mp4','the actual low-resolution sampled gift must not fall back to ordinary MP4');assert.equal(detectedGift.screenColor,'green');assert.ok(detectedGift.background.every((value,index)=>Math.abs(value-[60,193,60][index])<=3),'retain the measured green rather than replacing it with a pure green preset');assert.ok(detectedGift.confidence>=.85);
    for(let index=0;index<captured.length;index++)assert.deepEqual(captured[index].data,capturedBefore[index],'real-sample classification cannot mutate source pixels');
    console.log('vap-source-detection: optional real-clip probe passed: real72x128 green gift frames11/48/82 retain stable plate detection under downsampled yellow glow.');
  }else console.log('vap-source-detection: optional real-clip probe skipped (private fixture is not available).');
  console.log('vap-source-detection: measured arbitrary-color RGB; near-pure black/white and noisy plates with two-foreground-frame consensus; original-perimeter glow/particle sampling; blank intro, contradictory method/RGB, letterbox, varied wall, neutral foreground, sparse/transparent/malformed input rejection and pixel preservation passed. Detector evidence only; encoded/playback quality is separate.');
})().catch(error=>{console.error(error);process.exitCode=1});
