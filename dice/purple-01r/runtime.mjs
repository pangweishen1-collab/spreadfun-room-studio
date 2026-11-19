import {decodeFaceFiles} from '../six-face/import-faces.mjs';
import {writeSpineBinary} from '../six-face/spine-binary.mjs';
import {encodeAtlasPng} from '../purple-reference/atlas-png.mjs';
import {trimRegion,PURPLE_PLAN_01R_MOTION_VERSION} from '../purple-reference/runtime.mjs';
import {optimizeAtlasPng} from '../atlas-png-optimizer.mjs';
import {Proxy3DRenderer} from './proxy-3d.mjs';
import {motionAt,renderSamples,PURPLE_01R} from './motion.mjs';
import {buildPurple01RSkeleton} from './spine-builder.mjs';
import {reuseRegions} from './region-reuse.mjs';
import {packPurple01RRegions} from './atlas-pack.mjs';
import {createAtlasCodec} from './atlas-codec.mjs';

const points=[1,2,3,4,5,6];
const sourceSize=200,captureSize=384,worldSize=384;
const targetBytes=300_000;
// Capture every display frame of the approved roll. A 60 Hz player cannot
// interpolate attachment swaps, so skipping odd poses visibly halves cadence.
const frameTimes=Array.from({length:PURPLE_01R.frontFrame},(_,frame)=>({id:'roll_'+frame,time:frame/PURPLE_01R.fps,frame}));
const surface=(w,h=w)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const smooth=t=>t*t*(3-2*t);
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

function pixels(image,size) {
  const canvas=surface(size),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,size,size);
  const data=ctx.getImageData(0,0,size,size);
  canvas.width=canvas.height=1;
  return data;
}

function footprint(image) {
  let area=0,x=0,y=0,left=image.width,top=image.height,right=0,bottom=0;
  for(let row=0;row<image.height;row++)for(let col=0;col<image.width;col++) {
    if(image.data[(row*image.width+col)*4+3]<96)continue;
    area++;x+=col+.5;y+=row+.5;
    left=Math.min(left,col);top=Math.min(top,row);right=Math.max(right,col+1);bottom=Math.max(bottom,row+1);
  }
  if(!area)throw Error('紫色骰子素材没有可见内容');
  return {area,x:x/area,y:y/area,width:right-left,height:bottom-top};
}

function normalize(image,owned) {
  const size=Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height);
  const width=(image.naturalWidth||image.width)/size*sourceSize;
  const height=(image.naturalHeight||image.height)/size*sourceSize;
  const out=surface(sourceSize);owned.push(out);
  out.getContext('2d').drawImage(image,(sourceSize-width)/2,(sourceSize-height)/2,width,height);
  return out;
}

function resample(region,factor,cache) {
  if(factor>=1)return region;
  let input=cache.sources.get(region),retained=Boolean(input);
  if(!input){
    input=surface(region.w,region.h);cache.owned.push(input);
    const context=input.getContext('2d'),image=context.createImageData(region.w,region.h);
    image.data.set(region.pixels);context.putImageData(image,0,0);
    const bytes=region.w*region.h*4;
    if(cache.bytes+bytes<=8*1024*1024){cache.sources.set(region,input);cache.bytes+=bytes;retained=true;}
  }
  const target=surface(Math.max(1,Math.round(region.w*factor)),Math.max(1,Math.round(region.h*factor)));
  // Attachment coordinates stay in the original world units. Only the already
  // blurred fast poses lose raster samples; result PNGs retain full resolution.
  try{
    const ctx=target.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';
    ctx.drawImage(input,0,0,target.width,target.height);
    return {...region,w:target.width,h:target.height,pixels:ctx.getImageData(0,0,target.width,target.height).data};
  }finally{
    if(!retained)input.width=input.height=1;
    target.width=target.height=1;
  }
}

export async function generatePurple01RRuntime(files,{name='自定义紫色骰子',composition='faces',anchorImage,signal}={}) {
  const check=()=>signal?.throwIfAborted();check();
  if(!anchorImage)throw Error('缺少有效的 anchor.png');
  if(!['auto','faces','digits'].includes(composition))throw Error('紫色骰子素材类型无效');
  const inputs=Array.from(files||[]).filter(file=>/^sz_[0-6]$/.test(file.slot))
    .map(file=>new File([file.blob],file.slot+'.png',{type:'image/png'}));
  const codec=createAtlasCodec({signal,targetBytes});
  const owned=[],angleImages=[];let renderer,decoded;
  const rasterCache={sources:new Map(),bytes:0,owned};
  try {
    decoded=await decodeFaceFiles(inputs,{signal});
    const warnings=[...decoded.warnings];
    const images=Object.fromEntries(points.map(point=>[point,normalize(decoded.images[point],owned)]));
    let zero=decoded.zero?normalize(decoded.zero,owned):null;
    if(zero&&!pixels(zero,sourceSize).data.some((value,index)=>index%4===3&&value))zero=null;
    let resolved=composition;
    if(resolved==='auto') {
      const area=zero?footprint(pixels(zero,sourceSize)).area:0;
      const ratios=area?points.map(point=>footprint(pixels(images[point],sourceSize)).area/area).sort((a,b)=>a-b):null;
      resolved=ratios&&(ratios[2]+ratios[3])/2<.6&&ratios[5]<.85?'digits':'faces';
    }
    if(resolved==='digits') {
      if(!zero)throw Error('分离点数素材需要可见的 sz_0.png 主题底图');
      for(const point of points) {
        const ctx=images[point].getContext('2d');
        ctx.globalCompositeOperation='destination-over';ctx.drawImage(zero,0,0);ctx.globalCompositeOperation='source-over';
      }
    }
    const rollFace=zero||images[1];
    if(!zero)warnings.push('未提供可见的 sz_0，翻滚主体使用第 1 点完整图');
    for(const slot of ['1','2']) {
      const file=Array.from(files||[]).find(file=>file.slot===slot);
      if(file)angleImages.push(await createImageBitmap(file.blob));
      else angleImages.push(null);
    }
    const front=angleImages[0]&&angleImages[1]?normalize(angleImages[0],owned):rollFace;
    const back=angleImages[0]&&angleImages[1]?normalize(angleImages[1],owned):null;
    const bounds=footprint(pixels(rollFace,sourceSize));
    const coverage=bounds.area/(bounds.width*bounds.height);
    const thinness=Math.max(0,Math.min(1,(.65-coverage)/.18));
    const roundBody=coverage>.71&&bounds.width/bounds.height>.85&&bounds.width/bounds.height<1.15;
    renderer=new Proxy3DRenderer(front,{size:captureSize,roundedSide:true,
      depthScale:roundBody?1.30:1-.20*thinness,backImage:back});

    const frame=surface(captureSize),ctx=frame.getContext('2d',{willReadFrequently:true});owned.push(frame);
    ctx.imageSmoothingQuality='high';
    const pixelScale=captureSize/worldSize;
    const baseWidth=sourceSize/motionAt(PURPLE_01R.settledFrame,thinness).zoom;
    const offsetScale=1/(renderer.contentScale*1.15);
    const layer=(context,image,width,x=0,y=0)=>context.drawImage(image,
      captureSize/2+(x-width/2)*pixelScale,captureSize/2+(y-width/2)*pixelScale,width*pixelScale,width*pixelScale);
    const read=()=>ctx.getImageData(0,0,captureSize,captureSize);
    const draw=(image,width,x=0,y=0)=>{ctx.clearRect(0,0,captureSize,captureSize);layer(ctx,image,width,x,y);};
    const regions=[],sourceAliases=[];
    // The two flat endpoints use the same original art at different scales.
    // Keep the full-resolution front once and reuse it for the opening.
    regions.push({...trimRegion('roll_31',pixels(front,sourceSize),sourceSize,sourceSize),time:31/60});
    for(const key of frameTimes) {
      check();
      const pose=motionAt(key.frame,thinness);
      const mix=smooth(Math.min(1,key.frame/5,(31-key.frame)/5));
      ctx.clearRect(0,0,captureSize,captureSize);
      ctx.globalAlpha=1-mix;layer(ctx,front,baseWidth*pose.zoom);
      if(mix>0) {
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=mix;
        layer(ctx,renderer.render(renderSamples(key.frame,thinness)),baseWidth*pose.zoom*renderer.displayScale,
          pose.offset[0]*offsetScale,pose.offset[1]*offsetScale);
      }
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      if(key.frame===0)sourceAliases.push({id:key.id,sourceId:'roll_31',scale:baseWidth*pose.zoom/sourceSize,dx:0,dy:0});
      else if(key.frame!==31)regions.push({...trimRegion(key.id,read(),worldSize,worldSize),time:key.time});
      if(key.frame%4===0)await pause();
    }
    const landing=footprint(read());
    const masks=[surface(captureSize),surface(captureSize)];owned.push(...masks);
    const rightEdge=context=>{
      const data=context.getImageData(0,0,captureSize,captureSize).data;
      let right=0;
      for(let y=0;y<captureSize;y++)for(let x=0;x<captureSize;x++)
        if(data[(y*captureSize+x)*4+3])right=Math.max(right,x+1);
      return right;
    };
    const reveal=(under,over,progress)=> {
      const boundary=-12+progress*(captureSize+24),feather=4;
      let overOnly=true;
      for(let index=0;index<2;index++) {
        const context=masks[index].getContext('2d');
        context.clearRect(0,0,captureSize,captureSize);context.globalCompositeOperation='source-over';
        layer(context,...(index?over:under));
        // If both complete silhouettes are left of the feather, the old art
        // has fully cleared and the result is just the original face with an
        // affine transform. Reuse its atlas image rather than rasterize again.
        overOnly=overOnly&&rightEdge(context)<=boundary-feather;
        const fade=context.createLinearGradient(boundary-feather,0,boundary+feather,0);
        fade.addColorStop(1-index,'#000');fade.addColorStop(index,'transparent');
        context.globalCompositeOperation='destination-in';context.fillStyle=fade;context.fillRect(0,0,captureSize,captureSize);
      }
      ctx.clearRect(0,0,captureSize,captureSize);ctx.globalCompositeOperation='lighter';
      for(const mask of masks)ctx.drawImage(mask,0,0);
      ctx.globalCompositeOperation='source-over';
      return overOnly;
    };
    for(const point of points) {
      check();
      draw(images[point],sourceSize);
      const authored=footprint(read());
      const match=Math.max(.86,Math.min(1.18,Math.sqrt(landing.area/authored.area)));
      draw(images[point],sourceSize*match);
      const scaled=footprint(read());
      const shift=[(landing.x-scaled.x)/pixelScale,(landing.y-scaled.y)/pixelScale];
      const clear=trimRegion('sz_'+point,pixels(images[point],sourceSize),sourceSize,sourceSize);
      for(let index=0;index<2;index++) {
        const remaining=1-smooth(index/2);
        const scale=1+(match-1)*remaining,dx=shift[0]*remaining,dy=shift[1]*remaining;
        const pureResult=reveal([front,sourceSize],[images[point],sourceSize*scale,dx,dy],smooth((index+1)/3));
        const id='reveal_'+point+'_'+index;
        if(pureResult)sourceAliases.push({id,sourceId:clear.id,scale,dx,dy});
        else regions.push(trimRegion(id,read(),worldSize,worldSize));
      }
      // These clear results never pass through the motion-raster reducer.
      regions.push(clear);
    }
    regions.push(trimRegion('anchor',pixels(anchorImage,30),30,30));

    // Deduplicate before reducing any motion raster. All timeline IDs keep
    // their own geometry while their path addresses the shared atlas pixels.
    const reuse=reuseRegions(regions);
    const allRegions=[...reuse.allRegions,...sourceAliases.map(({id,sourceId,scale,dx,dy})=>{
      const source=reuse.attachments[sourceId];
      return {id,attachment:{...source,x:source.x*scale+dx,y:source.y*scale-dy,
        width:source.width*scale,height:source.height*scale}};
    })];
    let selected;
    for(const factor of [1,.84,.70,.64,.60]) {
      check();
      const scales=reuse.packedRegions.map(region=>{
        if(region.id.startsWith('reveal_'))return factor;
        if(!region.id.startsWith('roll_'))return 1;
        // Keep the opening and final clear poses full size. The intermediate
        // motion-blurred captures can share the atlas budget with all 60 Hz
        // poses without reducing the authored result images.
        const fast=region.time>=3/60&&region.time<=28/60;
        return fast?factor:1;
      });
      const layout=reuse.packedRegions.map((region,index)=>({id:region.id,
        w:Math.max(1,Math.round(region.w*scales[index])),h:Math.max(1,Math.round(region.h*scales[index]))}));
      if(!packPurple01RRegions(layout,{layoutOnly:true}))continue;
      const compact=reuse.packedRegions.map((region,index)=>resample(region,scales[index],rasterCache));
      const page=packPurple01RRegions(compact);
      if(!page||Math.max(page.width,page.height)>1024)continue;
      let texture=await codec.encode(page);
      if(!texture){
        const png=await encodeAtlasPng(page.width,page.height,page.rgba,{signal});
        texture=await optimizeAtlasPng(png,2,256);
      }
      check();
      selected={page,texture,regions:allRegions,factor,packedRegions:compact};
      if(texture.size<=targetBytes)break;
    }
    if(!selected)throw Error('紫色骰子无法装入单张 1024 像素图集，请使用较小的素材');
    const {page,texture,factor}=selected;
    if(texture.size>targetBytes)warnings.push('图集已优先保留清晰骰面，当前 '+Math.round(texture.size/1024)+' KiB');
    const json=buildPurple01RSkeleton(selected.regions,{frameTimes});
    const skel=new Blob([writeSpineBinary(json)],{type:'application/octet-stream'});
    return {kind:'purple-reference',skel,atlasPage:'dice.png',atlasText:page.atlas,texture,
      geometry:{sourceSize:200,crop:[0,0,200,200],cropOffset:[0,0]},warnings:[...new Set(warnings)],
      metadata:{name,grade:'purple',variant:'01R',motionVersion:PURPLE_PLAN_01R_MOTION_VERSION,
        resolvedComposition:resolved,cycle:2,rollEnd:31/60,settleEnd:35/60,landAt:.6,
        captureSize,fps:30,motionFps:PURPLE_01R.fps,frameTimes:frameTimes.map(({time})=>time),staticImages:selected.packedRegions.length,
        imageAttachments:allRegions.length,reusedImages:reuse.reusedCount+sourceAliases.length,
        exactPixelReuses:reuse.reusedCount,sourceTransformReuses:sourceAliases.length,rotationReuses:reuse.rotationReusedCount,
        atlas:{width:page.width,height:page.height,pages:1,bytes:texture.size,targetBytes,palette:256},
        body:renderer.metadata,motionRasterFactor:factor,clearFaceSize:200,
        anchor:{slot:'anchor',bone:'root',attachment:'anchor',width:30,height:30,scaleX:6,scaleY:6,opacity:0},
      }};
  } finally {
    codec.dispose();renderer?.dispose();decoded?.dispose();
    for(const image of angleImages)image?.close();
    for(const canvas of owned)canvas.width=canvas.height=1;
  }
}
