const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const R=await import(pathToFileURL(path.join(root,'vap-resources.mjs')));
  const P=await import(pathToFileURL(path.join(root,'vap-protocol.mjs')));
  const E=await import(pathToFileURL(path.join(root,'vap-engine.mjs')));
  const text={id:'name',tag:'userName',type:'text',text:'你好',x:.25,y:.25,width:.5,height:.25,start:0,end:1,opacity:.5,fontSize:24,color:'#ffeedd'};
  assert.equal(R.normalizeResources([text],{duration:2})[0].tag,'userName');
  assert.equal(R.normalizeResources([text],{duration:2})[0].scaleX,1);assert.equal(R.normalizeResources([text],{duration:2})[0].scaleY,1,'old resource states retain their original native scale');
  for(const bad of [{...text,tag:'[bad]'},{...text,x:.9},{...text,text:''},{...text,opacity:2},{...text,end:0},{...text,start:2},{...text,fontSize:0}]){
    assert.throws(()=>R.normalizeResources([bad],{duration:2}));
  }
  assert.throws(()=>R.normalizeResources([text,text]),/唯一|重复/);
  assert.throws(()=>R.normalizeResources(Array(7).fill(text)),/6/);
  assert.throws(()=>R.normalizeResources([{...text,type:'image',file:new Blob(['x'],{type:'image/svg+xml'})}]),/PNG/);
  const framedAvatar={id:'avatar1',tag:'tag1',type:'image',file:new Blob(['portrait'],{type:'image/png'}),avatarFrame:true,x:.25,y:.25,width:.5,height:.5,shape:'circle',start:0,end:1};
  assert.equal(R.normalizeResources([framedAvatar],{duration:2})[0].avatarFrame,true);
  for(const avatarFrame of [null,0,1,'true'])assert.throws(()=>R.normalizeResources([{...framedAvatar,avatarFrame}],{duration:2}),/头像底图/);
  assert.throws(()=>R.normalizeResources([{...text,avatarFrame:true}],{duration:2}),/头像底图/);
  assert.deepEqual(R.avatarFrameRect([50,60,120,120]),[36,46,148,148]);
  assert.deepEqual(R.avatarFrameRect([100,120,240,240]),[72,92,296,296],'the fixed badge follows the avatar scale and centre');
  const movingAvatar={...framedAvatar,x:.4,y:.35,width:.2,height:144/1560,end:null,animation:'float-pop'};
  assert.equal(R.normalizeResources([movingAvatar],{duration:6})[0].animation,'float-pop');
  for(const animation of [true,null,'spin'])assert.throws(()=>R.normalizeResources([{...movingAvatar,animation}],{duration:6}),/动画/);
  assert.throws(()=>R.normalizeResources([{...text,animation:'float-pop'}],{duration:6}),/新增头像/);
  assert.equal(R.resourceMotion(movingAvatar,{duration:6,timestamp:0}).scale,0);
  assert.equal(R.resourceMotion(movingAvatar,{duration:6,timestamp:0}).opacity,0,'the entrance has no stray one-pixel gold/ID flash');
  assert(R.resourceMotion(movingAvatar,{duration:6,timestamp:.12}).scale>1,'the entrance gently overshoots before settling');
  assert.equal(R.resourceMotion(movingAvatar,{duration:6,timestamp:.65}).scale,1);
  assert(Math.abs(R.resourceMotion(movingAvatar,{duration:6,timestamp:3}).offsetY-10)<1e-9);
  assert(Math.abs(R.resourceMotion(movingAvatar,{duration:6,timestamp:4.2}).offsetY+10)<1e-9,'floating amplitude is ten output pixels in both directions');
  assert.equal(R.resourceMotion(movingAvatar,{duration:6,timestamp:6-1/24}).opacity,0,'the final encoded frame is fully faded');
  assert.equal(R.resourceMotion({...movingAvatar,start:2,end:5},{duration:8,timestamp:2}).scale,0,'a timed Key starts its own entrance when it first appears');
  assert(Math.abs(R.resourceMotion({...movingAvatar,start:2,end:5},{duration:8,timestamp:3.8}).offsetY+10)<1e-9,'floating uses the Key lifetime rather than wall-clock playback time');
  assert.equal(R.resourceMotion({...movingAvatar,start:2,end:5},{duration:8,timestamp:5-1/24}).opacity,0,'an explicit Key end owns its exit fade');
  for(const duration of [1/24,2/24])assert.deepEqual(R.resourceMotion(movingAvatar,{duration,timestamp:0,fps:24}),{scale:1,offsetY:0,opacity:1},'one/two-frame clips retain their avatar');
  assert.deepEqual(R.resourceFrame(movingAvatar,{width:720,height:1560,duration:6,timestamp:3}).rect,[288,556,144,144]);
  assert.deepEqual(R.resourceFrame(movingAvatar,{width:720,height:1560,duration:6,timestamp:4.2}).rect,[288,536,144,144]);
  assert.deepEqual(R.resourceFrame({...movingAvatar,animation:undefined},{width:720,height:1560,duration:6,timestamp:3}).rect,[288,546,144,144],'existing static keys do not acquire animation');
  for(const timestamp of [0,.08,.12,.3,.65,1.8,3,4.2,5.9])for(const corner of [{x:14/720,y:14/1560},{x:1-158/720,y:1-158/1560}]){
    const rect=R.resourceFrame({...movingAvatar,...corner},{width:720,height:1560,duration:6,timestamp}).rect,[x,y,w,h]=R.avatarFrameRect(rect);
    assert(x>=-1e-9&&y>=-1e-9&&x+w<=720+1e-9&&y+h<=1560+1e-9,'the complete gold reference stays inside the canvas during bounce/float');
  }
  const base=P.computeVapLayout({width:720,height:1560}),rs=R.normalizeResources([text],{duration:2});
  const layout=R.computeResourceLayout(base,rs);
  assert.equal(layout.videoW,base.videoW);assert.equal(layout.videoH,base.videoH,'small resource reuses alpha-column blank space');
  const c=P.makeVapc({width:720,height:1560,fps:24,frames:48,packedLayout:layout});
  R.addResourceConfig(c,{resources:rs,layout,fps:24,frames:48,duration:2});
  assert.equal(P.validateVapc(c),true);assert.equal(c.info.isVapx,1);assert.equal(c.src[0].srcTag,'[userName]');assert.equal(c.src[0].srcType,'txt');assert.equal(c.src[0].fontStyle.font,'bold 24px Arial');
  assert.equal(c.frame.length,48);assert.deepEqual(c.frame[0].obj[0].frame,[180,390,360,390]);assert.deepEqual(c.frame[24].obj[0].frame,[0,0,1,1],'inactive slots explicitly zero-mask instead of retaining stale SDK uniforms');
  assert.equal(c.funToolkit.resourceDefaults.userName,'你好');
  assert(!JSON.stringify(c).includes('blob:'));
  function box(type,payload=new Uint8Array()){const b=new Uint8Array(8+payload.length),v=new DataView(b.buffer);v.setUint32(0,b.length);b.set([...type].map(x=>x.charCodeAt(0)),4);b.set(payload,8);return b;}
  const scanned=[];class TrackedBlob extends Blob{slice(start,end,...args){scanned.push([start,end]);return super.slice(start,end,...args);}}
  const json=new TextEncoder().encode(JSON.stringify(c)),source=new TrackedBlob([box('ftyp'),box('mdat',new Uint8Array(4*1024*1024)),box('vapc',json)]);
  assert.deepEqual(await P.readSourceVapConfig(source),c);assert(scanned.every(([a,b])=>b-a<=Math.max(16,json.length)),'source inspection skips the multi-megabyte mdat payload');
  assert.equal(await P.readSourceVapConfig(new Blob([box('ftyp'),box('mdat')])),null);
  await assert.rejects(P.readSourceVapConfig(new Blob([box('vapc',json),box('vapc',json)])),/duplicate/);
  await assert.rejects(P.readSourceVapConfig(new Blob([box('vapc',json)]),{maxJsonBytes:16}),/exceeds/);
  await assert.rejects(P.readSourceVapConfig(new Blob([box('ftyp'),new Uint8Array([0,0,0,99,109,100,97,116])])),/invalid/);
  await assert.rejects(P.readSourceVapConfig(new Blob([box('ftyp'),new Uint8Array([0,0,0])])),/truncated/);
  const broken=structuredClone(c);broken.frame[0].obj[0].mFrame=[0,0,10,10];assert.throws(()=>P.validateVapc(broken),/overlap/);
  const duplicate=structuredClone(c);duplicate.src.push({...duplicate.src[0]});assert.throws(()=>P.validateVapc(duplicate),/unique/);
  const opts=E.normalizeOptions({width:720,height:1560,resources:[text],resourceMode:'dynamic',rgbAlphaMode:'straight'},{duration:2});assert.equal(opts.rgbAlphaMode,'premultiplied');
  assert.equal(E.normalizeOptions({resources:[text],resourceMode:'baked',rgbAlphaMode:'straight'},{duration:2}).rgbAlphaMode,'straight');
  const plan=E.planEncoding(opts,{duration:2,hasAudio:false});assert(plan.resourceConfigBytes>2000);assert(plan.budgetBitrate<E.planEncoding(E.normalizeOptions(),{duration:2,hasAudio:false}).budgetBitrate,'native metadata is included in bitrate budget');
  const reserved=E.planEncoding(E.normalizeOptions({...opts,packageReserveBytes:100000}),{duration:2,hasAudio:false});assert.equal(reserved.byteLimit,plan.byteLimit-100000);assert.equal(reserved.budgetBitrate,plan.budgetBitrate-400000,'external image/default package budget is reserved before encoding');
  assert.throws(()=>E.normalizeOptions({packageReserveBytes:2000001}),error=>error.code==='budget');assert.throws(()=>E.normalizeOptions({packageReserveBytes:-1}),error=>error.code==='invalid');
  const native=P.makeVapc({width:4,height:4,alphaScale:.5,fps:24,frames:2});
  native.info.isVapx=1;native.src=[{srcId:'old',srcType:'txt',srcTag:'text',loadType:'local',w:2,h:2,fitType:'fitXY'}];native.frame=[{i:0,obj:[{srcId:'old',z:0,frame:[1,1,2,2],mFrame:[8,4,2,2],mt:0}]}];assert(P.validateVapc(native));
  const bound=R.normalizeResources([{...text,sourceId:'old',end:null}],{width:4,height:4,duration:2,sourceVapConfig:native});
  assert.deepEqual(R.resourceFrame(bound[0],{width:8,height:8,sourceVapConfig:native,timestamp:0}).rect,[2,2,4,4]);assert.equal(R.resourceFrame(bound[0],{width:8,height:8,sourceVapConfig:native,timestamp:1/24}),null,'missing source frame is genuinely absent');
  assert.deepEqual(R.resourceFrame(bound[0],{width:8,height:16,sourceVapConfig:native,timestamp:0}).rect,[2,6,4,4],'different output ratio keeps source aspect and centers the animated slots with letterboxing');
  const moved=R.normalizeResources([{...text,sourceId:'old',end:null,offsetX:.25,offsetY:-.125}],{width:8,height:16,duration:2,sourceVapConfig:native});assert.deepEqual(R.resourceFrame(moved[0],{width:8,height:16,sourceVapConfig:native,timestamp:0}).rect,[4,4,4,4],'manual offsets move a native animated slot without changing its original size or mask');
  for(const value of [NaN,Infinity,1.01,-1.01,'0'])assert.throws(()=>R.normalizeResources([{...text,sourceId:'old',offsetX:value}],{duration:2,sourceVapConfig:native}),/偏移/);
  for(const value of [NaN,Infinity,0,.049,8.01,'1'])for(const key of ['scaleX','scaleY'])assert.throws(()=>R.normalizeResources([{...text,sourceId:'old',[key]:value}],{duration:2,sourceVapConfig:native}),/缩放/);
  const resized=R.normalizeResources([{...text,sourceId:'old',end:null,offsetX:.25,offsetY:-.125,scaleX:1.5,scaleY:.5}],{width:8,height:16,duration:2,sourceVapConfig:native});
  const resizedFrame=R.resourceFrame(resized[0],{width:8,height:16,sourceVapConfig:native,timestamp:0});assert.deepEqual(resizedFrame.rect,[4,4,6,2],'native resizing combines with manual offsets and contain scaling');assert.deepEqual(resizedFrame.sourceObject.mFrame,[8,4,2,2],'resizing retains the source mask crop rather than reading another packed region');
  const nativeCopies=R.normalizeResources([bound[0],{...bound[0],id:'copy',tag:'nameCopy',scaleX:.5,offsetX:.25,fontSize:12,opacity:.25}],{width:8,height:8,duration:2,sourceVapConfig:native});assert.equal(nativeCopies.length,2,'duplicating a native resource may independently reuse its original animation');assert.deepEqual(R.resourceFrame(nativeCopies[1],{width:8,height:8,sourceVapConfig:native,timestamp:0}).rect,[4,2,2,4]);
  const copiesLayout=R.computeResourceLayout(P.computeVapLayout({width:8,height:8}),nativeCopies,{sourceVapConfig:native}),copiesConfig=P.makeVapc({width:8,height:8,packedLayout:copiesLayout,frames:48});R.addResourceConfig(copiesConfig,{resources:nativeCopies,layout:copiesLayout,fps:24,frames:48,duration:2,sourceVapConfig:native});assert.notDeepEqual(copiesConfig.frame[0].obj[0].mFrame,copiesConfig.frame[0].obj[1].mFrame,'native copies have independent packed mask slots');assert.equal(copiesConfig.src[0].fontStyle.font,'bold 24px Arial');assert.equal(copiesConfig.src[1].fontStyle.font,'bold 12px Arial','resized copied text retains its chosen font size in native metadata');assert(P.validateVapc(copiesConfig));
  const resizedLayout=R.computeResourceLayout(P.computeVapLayout({width:8,height:16}),resized,{sourceVapConfig:native}),resizedConfig=P.makeVapc({width:8,height:16,packedLayout:resizedLayout,frames:48});R.addResourceConfig(resizedConfig,{resources:resized,layout:resizedLayout,fps:24,frames:48,duration:2,sourceVapConfig:native});assert.equal(resizedConfig.src[0].w,6);assert.equal(resizedConfig.src[0].h,2);assert.deepEqual(resizedConfig.frame[0].obj[0].frame,[4,4,6,2]);assert(P.validateVapc(resizedConfig),'resized native masks and configuration remain protocol-valid');
  const oversizedSource=structuredClone(native);oversizedSource.src[0].w=8192;assert.throws(()=>R.computeResourceLayout(base,R.normalizeResources([{...text,sourceId:'old',end:null,scaleX:8}],{sourceVapConfig:oversizedSource}),{sourceVapConfig:oversizedSource}),/尺寸/,'hostile or excessive source texture sizes fail before allocating a canvas');
  const oldGlobals=new Map();function install(k,v){oldGlobals.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
  class Data{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}}
  class Canvas{
    constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);}
    getContext(){const canvas=this;return {fillStyle:'#000',save(){},restore(){},beginPath(){},rect(){},clip(){},clearRect(){canvas.data.fill(0)},fillRect(x,y,w,h){const n=this.fillStyle==='#fff'?255:0;for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)canvas.data.set([n,n,n,255],(py*canvas.width+px)*4)},fillText(){for(let i=0;i<canvas.data.length;i+=4)canvas.data.set([240,180,100,255],i)},getImageData(){return new Data(canvas.data.slice(),canvas.width,canvas.height)},putImageData(image){canvas.data=image.data.slice()},drawImage(source,...args){let sx=0,sy=0,sw=source.width,sh=source.height,dx=0,dy=0,dw=sw,dh=sh;if(args.length===2)[dx,dy]=args;else if(args.length===4)[dx,dy,dw,dh]=args;else [sx,sy,sw,sh,dx,dy,dw,dh]=args;for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const tx=Math.floor(dx+x),ty=Math.floor(dy+y);if(tx<0||ty<0||tx>=canvas.width||ty>=canvas.height)continue;const p=(Math.min(source.height-1,Math.floor(sy+y*sh/dh))*source.width+Math.min(source.width-1,Math.floor(sx+x*sw/dw)))*4,t=(ty*canvas.width+tx)*4,a=source.data[p+3]/255,old=canvas.data[t+3]/255,out=a+old*(1-a);for(let q=0;q<3;q++)canvas.data[t+q]=out?(source.data[p+q]*a+canvas.data[t+q]*old*(1-a))/out:0;canvas.data[t+3]=out*255;}}};}
    convertToBlob(){return Promise.resolve(new Blob([this.data],{type:'image/png'}));}
  }
  try{
    install('OffscreenCanvas',Canvas);install('ImageData',Data);install('createImageBitmap',async()=>{const img=new Canvas(2,2);img.data.fill(255);return img;});
    const packed=new Canvas(16,16);for(let y=0;y<4;y++)for(let x=0;x<4;x++)packed.data.set([100,50,20,255],(y*16+x)*4);
    for(let y=0;y<2;y++)for(let x=0;x<2;x++)packed.data.set([128,128,128,255],(y*16+12+x)*4);
    for(let y=4;y<6;y++)for(let x=8;x<10;x++)packed.data.set([128,128,128,255],(y*16+x)*4);
    const visible=R.unpackVapFrame(packed,{width:4,height:4,sourceVapConfig:native});assert.deepEqual([...visible.data.slice(0,4)],[199,100,40,128],'unpacks alpha independently and removes original black premultiplication');
    const letterboxed=R.unpackVapFrame(packed,{width:8,height:16,sourceVapConfig:native});assert.equal(letterboxed.data[3],0);assert.equal(letterboxed.data[(4*8)*4+3],128);assert.equal(letterboxed.data[(15*8)*4+3],0,'native packed source keeps transparent contain padding rather than stretching');
    const offsetNative=R.unpackVapFrame(packed,{width:8,height:16,sourceVapConfig:native,videoOffsetY:.25});assert.equal(offsetNative.data[(4*8)*4+3],0);assert.equal(offsetNative.data[(8*8)*4+3],128,'native RGB and alpha translate together in output coordinates');for(const videoOffsetY of [NaN,Infinity,1.1,-1.1,null,'0'])assert.throws(()=>R.unpackVapFrame(packed,{width:4,height:4,sourceVapConfig:native,videoOffsetY}),/offset/);
    const straight=structuredClone(native);straight.funToolkit={rgbAlphaMode:'straight'};assert.equal(R.unpackVapFrame(packed,{width:4,height:4,sourceVapConfig:straight}).data[0],100);
    const videoOnlyMask={enabled:true,topStart:.8,topEnd:.9,bottomStart:.95,bottomEnd:1};
    const renderer=await R.createResourceRenderer(bound,{width:4,height:4,duration:2,sourceVapConfig:native,verticalMask:videoOnlyMask});
    const zero=new Data(new Uint8ClampedArray(4*4*4),4,4),result=renderer.apply(zero,0,{sourceCanvas:packed});assert.equal(result.data[(1*4+1)*4+3],64,'bound source mask x layer opacity are applied exactly once');assert.equal(result.data[3],0);
    for(const resourceOpacity of [0,.5,1]){
      const faded=renderer.apply(zero,0,{sourceCanvas:packed,resourceOpacity});
      assert.equal(faded.data[(1*4+1)*4+3],Math.round(64*resourceOpacity),'temporal fade multiplies native opacity once while the video spatial mask stays independent');
      assert.equal(faded.data[3],0);
      if(resourceOpacity)assert.deepEqual([...faded.data.slice((1*4+1)*4,(1*4+1)*4+3)],[240,180,100],'nonzero faded resources retain straight texture color');
    }
    const fadedDraw=new Canvas(4,4);renderer.draw(fadedDraw.getContext('2d'),0,{sourceCanvas:packed,resourceOpacity:0});assert.equal(fadedDraw.data[(1*4+1)*4+3],0,'draw follows the same temporal fade as its native resource mask');
    assert.equal(renderer.apply(zero,0,{sourceCanvas:packed}).data[(1*4+1)*4+3],64,'old video fade arguments do not persist into resource previews');
    const preservedMask=new Canvas(layout.videoW,layout.videoH);renderer.drawMasks(preservedMask.getContext('2d'),layout,0,packed);const [mx,my]=layout.resourceMasks.name;assert.equal(preservedMask.data[(my*preservedMask.width+mx)*4],64,'packed resource masks retain their existing default opacity for the engine to fade after drawing');
    const absent=renderer.apply(zero,1/24,{sourceCanvas:packed});assert(absent.data.every(v=>v===0),'no slot content leaks into inactive frames');assert.deepEqual(await renderer.getPlayerTags(),{userName:'你好'});renderer.dispose();
    const copiesRenderer=await R.createResourceRenderer(nativeCopies,{width:8,height:8,duration:2,sourceVapConfig:native}),copiesPacked=new Canvas(copiesLayout.videoW,copiesLayout.videoH);copiesRenderer.drawMasks(copiesPacked.getContext('2d'),copiesLayout,0,packed);const [cx,cy]=copiesLayout.resourceMasks[nativeCopies[0].id],[dx,dy]=copiesLayout.resourceMasks[nativeCopies[1].id];assert.equal(copiesPacked.data[(cy*copiesPacked.width+cx)*4],64);assert.equal(copiesPacked.data[(dy*copiesPacked.width+dx)*4],32,'duplicate native slots sample their source mask independently with their own opacity');copiesRenderer.dispose();
    const imageNative=structuredClone(native);imageNative.src[0].srcType='img';const scaledImage={...text,sourceId:'old',end:null,type:'image',file:new Blob(['fake'],{type:'image/png'}),shape:'square',scaleX:2,scaleY:1.5};
    const scaledRenderer=await R.createResourceRenderer([scaledImage],{width:4,height:4,duration:2,sourceVapConfig:imageNative}),scaledFiles=await scaledRenderer.getPackageFiles();assert.equal(scaledFiles[0].blob.size,4*3*4,'default avatar texture uses the resized source dimensions');
    const scaledImageResult=scaledRenderer.apply(zero,0,{sourceCanvas:packed});assert.equal(scaledImageResult.data[(3*4+3)*4+3],64,'original native occlusion mask stretches into the resized rectangle');assert.equal(scaledImageResult.data[3],0);scaledRenderer.dispose();
    const avatar={id:'avatar',tag:'avatar',type:'image',file:new Blob(['fake'],{type:'image/png'}),x:0,y:0,width:1,height:1,shape:'circle',opacity:1};
    const circle=await R.createResourceRenderer([avatar],{width:16,height:16,duration:2});const circleResult=circle.apply(new Data(new Uint8ClampedArray(16*16*4),16,16),0);assert.equal(circleResult.data[3],0);assert.equal(circleResult.data[(8*16+8)*4+3],255);const files=await circle.getPackageFiles();assert.equal(files[0].name,'resources/avatar.png');assert.equal(files[0].blob.type,'image/png');const tags=await circle.getPlayerTags();assert(tags.avatar.startsWith('blob:'));circle.dispose();
    const placeholder=await R.createResourceRenderer([{...avatar,defaultAvatar:true}],{width:16,height:16,duration:2}),placeholderFiles=await placeholder.getPackageFiles();assert.equal(placeholderFiles[0].blob.size,4);assert([...new Uint8Array(await placeholderFiles[0].blob.arrayBuffer())].every(value=>value===0),'default portrait package uses a transparent placeholder');const placeholderTags=await placeholder.getPlayerTags();assert([...new Uint8Array(await (await fetch(placeholderTags.avatar)).arrayBuffer())].every(value=>value===0),'default portrait player binding is transparent');const withoutReference=placeholder.apply(new Data(new Uint8ClampedArray(16*16*4),16,16),0,{includeDefaults:false,includeStatic:false});assert(withoutReference.data.every(value=>value===0),'encoding previews do not draw the default portrait');assert.equal(placeholder.apply(new Data(new Uint8ClampedArray(16*16*4),16,16),0).data[(8*16+8)*4+3],255,'editing preview still renders the human reference');placeholder.dispose();
    let badgeFetches=0,closedBitmaps=0;const bitmapDecoder=globalThis.createImageBitmap;
    install('fetch',async url=>{assert(String(url).endsWith('/assets/vap-avatar-base.webp'));badgeFetches++;return {ok:true,blob:async()=>new Blob(['gold'],{type:'image/webp'})}});
    globalThis.createImageBitmap=async file=>{const img=new Canvas(2,2),color=file.type==='image/webp'?[230,160,20,128]:[255,255,255,255];for(let p=0;p<img.data.length;p+=4)img.data.set(color,p);img.close=()=>closedBitmaps++;return img};
    const framed=await R.createResourceRenderer([framedAvatar,{...framedAvatar,id:'avatar2',tag:'tag2',x:.125,y:.125,width:.75,height:.75,start:1,end:null}],{width:240,height:240,duration:2,verticalMask:videoOnlyMask});
    const transparent=new Data(new Uint8ClampedArray(240*240*4),240,240),pixel=(data,x,y)=>[...data.data.slice((y*data.width+x)*4,(y*data.width+x)*4+4)];
    const fixed=framed.applyStatic(transparent,0);assert.deepEqual(pixel(fixed,120,120),[230,160,20,128],'editing reference-only badge draw remains separate from the portrait');assert.deepEqual(pixel(fixed,47,120),[230,160,20,128],'fixed badge extends 14 pixels beyond the 120px avatar');assert.equal(pixel(fixed,45,120)[3],0);
    const large=framed.applyStatic(transparent,1);assert.deepEqual(pixel(large,10,120),[230,160,20,128],'the next timed avatar carries a proportionally scaled and repositioned badge');assert.equal(pixel(large,8,120)[3],0);
    assert.deepEqual(pixel(framed.apply(transparent,0),120,120),[255,255,255,255],'preview places the replaceable avatar above its fixed badge');
    const faint=framed.applyStatic(transparent,0,{resourceOpacity:0});assert.equal(pixel(faint,120,120)[3],0,'the reference frame follows the full gift fade');
    framed.resources[0].opacity=.5;assert.equal(pixel(framed.applyStatic(transparent,0),120,120)[3],64,'fixed gold still honors its own resource opacity');framed.resources[0].opacity=1;
    const framedResources=framed.resources,framedLayout=R.computeResourceLayout(P.computeVapLayout({width:240,height:240}),framedResources),framedConfig=P.makeVapc({width:240,height:240,frames:48,packedLayout:framedLayout});
    R.addResourceConfig(framedConfig,{resources:framedResources,layout:framedLayout,fps:24,frames:48,duration:2});assert.equal(framedConfig.src[0].srcId,'avatar1');assert.equal(framedConfig.src[0].srcTag,'[tag1]');assert.deepEqual(framedConfig.frame[0].obj[0].frame,[60,60,120,120]);assert.deepEqual(framedConfig.frame[0].obj[0].mFrame,framedLayout.resourceMasks.avatar1);assert.deepEqual(framedLayout.resourceMasks.avatar1.slice(2),[60,60],'native resource masks cover only the replaceable 120px avatar, not the 148px badge');assert(P.validateVapc(framedConfig));
    const planes=new Canvas(framedLayout.videoW,framedLayout.videoH);for(let y=0;y<240;y++)for(let x=0;x<240;x++)planes.data.set([20,40,60,255],(y*planes.width+x)*4);const [fax,fay,faw,fah]=framedLayout.aFrame;for(let y=fay;y<fay+fah;y++)for(let x=fax;x<fax+faw;x++)planes.data.set([80,80,80,255],(y*planes.width+x)*4);
    framed.drawStaticPlanes(planes.getContext('2d'),framedLayout,0);assert.deepEqual([...planes.data.slice((120*planes.width+120)*4,(120*planes.width+120)*4+3)],[125,100,40],'fast Canvas RGB contains only the golden background');assert.equal(planes.data[((fay+60)*planes.width+fax+60)*4],168,'fast Canvas grayscale alpha unions the translucent badge and existing video alpha');
    assert.equal(badgeFetches,1,'one renderer fetches the shared badge once for all avatar layers');assert.equal(closedBitmaps,3,'badge and both portrait decode bitmaps are released');assert.equal((await framed.getPackageFiles()).length,2,'only replaceable portraits are external resources');framed.dispose();assert.throws(()=>framed.applyStatic(transparent,0),/disposed/);
    const motionAvatar={...framedAvatar,end:null,animation:'float-pop'},motionRenderer=await R.createResourceRenderer([motionAvatar],{width:240,height:240,duration:6,fps:24}),motionLayout=R.computeResourceLayout(P.computeVapLayout({width:240,height:240}),motionRenderer.resources),motionPlanes=new Canvas(motionLayout.videoW,motionLayout.videoH),tailTime=6-1/24-.5;
    assert(motionRenderer.applyStatic(transparent,0).data.every(v=>v===0),'default entrance is fully invisible before elastic growth');
    assert.equal(pixel(motionRenderer.applyStatic(transparent,tailTime,{resourceOpacity:.5}),120,120)[3],64,'gift fade and avatar exit use the smaller envelope instead of multiplying twice');
    motionRenderer.drawMasks(motionPlanes.getContext('2d'),motionLayout,tailTime,null,{resourceOpacity:.5});const [mmx,mmy]=motionLayout.resourceMasks.avatar1;assert.equal(motionPlanes.data[((mmy+30)*motionPlanes.width+mmx+30)*4],128,'replacement mask uses the same single exit fade as its gold frame');
    const motionConfig=P.makeVapc({width:240,height:240,fps:24,frames:144,packedLayout:motionLayout});R.addResourceConfig(motionConfig,{resources:motionRenderer.resources,layout:motionLayout,fps:24,frames:144,duration:6});assert(P.validateVapc(motionConfig));assert.equal(motionConfig.funToolkit.resourceManifest[0].animation,'float-pop');
    for(const index of [0,3,8,16,43,72,143])assert.deepEqual(motionConfig.frame[index].obj[0].frame,R.resourceFrame(motionRenderer.resources[0],{width:240,height:240,duration:6,fps:24,timestamp:index/24}).rect,'runtime replacement reads the exact animated editor/gold geometry');
    assert.notDeepEqual(motionConfig.frame[3].obj[0].frame,motionConfig.frame[16].obj[0].frame,'elastic motion is encoded into the VAP frame metadata');motionRenderer.dispose();globalThis.createImageBitmap=bitmapDecoder;
  }finally{for(const [k,d]of oldGlobals)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
  console.log('vap-resources: spatially independent resources with shared temporal gift fades and transparent default bindings, preserved native occlusion, fixed gold RGB/alpha composition and scaling, native src/frame/mask validation, tag uniqueness, timing/animated source binding, packed-plane unpack math, own resource opacity, circular avatar alpha, safe package defaults, metadata-aware size budget and premultiplied dynamic output passed. Browser codec and SDK playback are separate acceptance checks.');
})().catch(error=>{console.error(error);process.exitCode=1});
