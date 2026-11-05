import {decodeFaceFiles} from '../six-face/import-faces.mjs';
import {prepareFaces} from '../six-face/prepare-faces.mjs';
import {buildSpineAssets} from '../six-face/spine-builder.mjs';
import {encodeRgbaPng} from '../six-face/png-rgba.mjs';
import {buildPurpleSpineJson,contourFromPixels,inferPurpleBodyModel,PURPLE_GYRO_MOTION_VERSION,PURPLE_GYRO_BODY_VERSION} from './spine-builder.mjs';
import {buildSoftWallPixels} from './materials.mjs';
export {PURPLE_GYRO_MOTION_VERSION,PURPLE_GYRO_BODY_VERSION};

function abort(signal){if(signal?.aborted)throw new DOMException('操作已取消','AbortError');}
function makeCanvas(width,height){
 const image=globalThis.document?.createElement?document.createElement('canvas'):new OffscreenCanvas(width,height);image.width=width;image.height=height;
 const context=image.getContext('2d',{willReadFrequently:true});if(!context)throw Error('无法创建紫色骰子画布');return {image,context};
}
async function drawable(blob,signal){
 abort(signal);
 if(typeof createImageBitmap==='function'){const image=await createImageBitmap(blob);try{abort(signal);return {image,close:()=>image.close?.()};}catch(error){image.close?.();throw error;}}
 const url=URL.createObjectURL(blob),image=new Image();
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('紫色PNG读取超时')),8000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('紫色PNG无法解码'));};image.src=url;});abort(signal);return {image,close:()=>{image.src='';}};}
 finally{URL.revokeObjectURL(url);}
}
function rgbaOf(image){const c=makeCanvas(image.naturalWidth??image.width,image.naturalHeight??image.height);try{c.context.drawImage(image,0,0);return {width:c.image.width,height:c.image.height,data:c.context.getImageData(0,0,c.image.width,c.image.height).data};}finally{c.image.width=c.image.height=1;}}
function area(image){const pixels=rgbaOf(image);let value=0;for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]>=16)value++;return value;}
function bounds(image){const {width:w,height:h,data}=rgbaOf(image);let l=w,t=h,r=0,b=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}return [l,t,r,b];}
function opaque(image){
 const {width:w,height:h,data}=rgbaOf(image),n=w*h,seed=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0,max=0;
 for(let i=3;i<data.length;i+=4)max=Math.max(max,data[i]);if(!max)throw Error('紫色骰子没有可见主体');
 const threshold=max>=240?240:Math.max(1,Math.ceil(max*.9));
 for(let i=0;i<n;i++)if(data[i*4+3]>=threshold){seed[i]=i;queue[tail++]=i;}
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(j>=0&&seed[j]<0){seed[j]=seed[i];queue[tail++]=j;}}
 const result=new Uint8ClampedArray(data);for(let i=0;i<n;i++){const a=data[i*4+3]/255,k=seed[i]*4;for(let c=0;c<3;c++)result[i*4+c]=Math.round(data[i*4+c]*a+data[k+c]*(1-a));result[i*4+3]=255;}
 const canvas=makeCanvas(w,h),pixels=canvas.context.getImageData(0,0,w,h);pixels.data.set(result);canvas.context.putImageData(pixels,0,0);return canvas.image;
}
function replaceRegion(page,source,r){
 const data=page.data,w=page.width,src=source.data;
 const copy=(sx,sy,x,y)=>data.set(src.subarray((sy*source.width+sx)*4,(sy*source.width+sx)*4+4),(y*w+x)*4);
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)copy(x,y,r.x+x,r.y+y);
 for(let y=0;y<r.height;y++){copy(0,y,r.x-1,r.y+y);copy(r.width-1,y,r.x+r.width,r.y+y);}
 for(let x=0;x<r.width;x++){copy(x,0,r.x+x,r.y-1);copy(x,r.height-1,r.x+x,r.y+r.height);}
 for(const [sx,sy,x,y] of [[0,0,r.x-1,r.y-1],[r.width-1,0,r.x+r.width,r.y-1],[0,r.height-1,r.x-1,r.y+r.height],[r.width-1,r.height-1,r.x+r.width,r.y+r.height]])copy(sx,sy,x,y);
}
function restoreTransparentColors(page,regions){
 // Canvas decoding discards hidden RGB. Recover the existing flat-image
 // colour bleed from its opaque paired region before changing roll_1.
 for(let point=1;point<=6;point++){
  const flat=regions.find(r=>r.name==='flat_'+point),roll=regions.find(r=>r.name==='roll_'+point);
  for(let y=-1;y<=flat.height;y++)for(let x=-1;x<=flat.width;x++){
   const a=((flat.y+y)*page.width+flat.x+x)*4,b=((roll.y+y)*page.width+roll.x+x)*4;
   if(page.data[a+3]===0)page.data.set(page.data.subarray(b,b+3),a);
  }
 }
 const white=regions.find(r=>r.name==='white');for(let y=-1;y<=white.height;y++)for(let x=-1;x<=white.width;x++){const i=((white.y+y)*page.width+white.x+x)*4;if(page.data[i+3]===0)page.data.set([255,255,255],i);}
}
function discardUnusedRollRegions(page,regions){
 const unused=regions.filter(r=>/^roll_[2-6]$/.test(r.name));
 for(const r of unused)for(let y=r.y-1;y<=r.y+r.height;y++){
  const start=(y*page.width+r.x-1)*4;page.data.fill(0,start,start+(r.width+2)*4);
 }
 return regions.filter(r=>!/^roll_[2-6]$/.test(r.name));
}
async function validZero(blob){
 if(!(blob instanceof Blob)||!blob.size||blob.size>8*1024*1024)throw Error('sz_0.png 文件无效或超过8MiB');
 const bytes=new Uint8Array(await blob.slice(0,33).arrayBuffer()),sig=[137,80,78,71,13,10,26,10];if(bytes.length<33||sig.some((v,i)=>bytes[i]!==v))throw Error('sz_0.png 不是有效PNG');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w>4096||h>4096||w*h>4*1024*1024)throw Error('sz_0.png 尺寸超过读取限制');
}

export async function generatePurpleGyroRuntime(files,{name='自定义紫色骰子',signal,anchorImage,composition='faces'}={}){
 abort(signal);if(!['auto','faces','digits'].includes(composition))throw Error('紫色骰子素材类型无效');
 const entries=Array.from(files||[]),inputs=entries.filter(f=>/^sz_[1-6]$/.test(f.slot)).map(f=>new File([f.blob],f.slot+'.png',{type:'image/png'}));
 const decoded=await decodeFaceFiles(inputs,{signal}),owned=[],preparedSets=[],warnings=[...decoded.warnings];let baseRead,atlasRead;
 const canvas=(w,h)=>{const c=makeCanvas(w,h);owned.push(c.image);return c;};
 try{
  let prepared=prepareFaces(decoded.images);preparedSets.push(prepared);
  const size=prepared.sourceSize,zero=entries.find(f=>f.slot==='sz_0');let base;
  if(zero){await validZero(zero.blob);baseRead=await drawable(zero.blob,signal);const im=baseRead.image,w=im.naturalWidth??im.width,h=im.naturalHeight??im.height,s=size/Math.max(w,h),dw=Math.max(1,Math.round(w*s)),dh=Math.max(1,Math.round(h*s));const target=canvas(size,size);target.context.drawImage(im,0,0,w,h,Math.floor((size-dw)/2),Math.floor((size-dh)/2),dw,dh);base=target.image;}
  else{base=prepared.landingImages[1];warnings.push('未提供sz_0，旋转主体使用第1点完整图；原始素材未改动');}
  let resolved=composition;
  if(resolved==='auto'){const baseArea=Math.max(1,area(base)),ratios=Object.values(prepared.landingImages).map(im=>area(im)/baseArea),sorted=[...ratios].sort((a,b)=>a-b);resolved=(sorted[2]+sorted[3])/2<.6&&Math.max(...ratios)<.85?'digits':'faces';}
  if(resolved==='digits'){
   if(!zero)throw Error('数字素材需要sz_0.png主题底图');
   const merged={};for(let p=1;p<=6;p++){const c=canvas(size,size);c.context.drawImage(base,0,0);c.context.drawImage(prepared.landingImages[p],0,0);merged[p]=c.image;}
   prepared=prepareFaces(merged);preparedSets.push(prepared);warnings.push('已将sz_0与点数图片组合为完整派生贴图；上传原PNG保持不变');
  }
  const bb=bounds(base);if(bb[2]<=bb[0]||bb[3]<=bb[1]){if(resolved==='digits')throw Error('sz_0.png没有可见主题底图');base=prepared.landingImages[1];warnings.push('sz_0为空，旋转主体使用第1点完整图');}
  const bodyBounds=bounds(base),old=prepared.crop,l=Math.min(old[0],bodyBounds[0]),t=Math.min(old[1],bodyBounds[1]),r=Math.max(old[0]+old[2],bodyBounds[2]),b=Math.max(old[1]+old[3],bodyBounds[3]);
  const span=Math.max(r-l,b-t),left=Math.max(0,Math.min(size-span,Math.floor((l+r-span)/2))),top=Math.max(0,Math.min(size-span,Math.floor((t+b-span)/2)));
  if(left!==old[0]||top!==old[1]||span!==old[2]){
   const textures={};for(let p=1;p<=6;p++){const crop=canvas(span,span);crop.context.drawImage(prepared.landingImages[p],left,top,span,span,0,0,span,span);textures[p]=opaque(crop.image);owned.push(textures[p]);}
   prepared={...prepared,textures,crop:[left,top,span,span],cropOffset:[left+span/2-size/2,top+span/2-size/2]};
  }
  const crop=prepared.crop,body=canvas(crop[2],crop[3]);body.context.drawImage(base,crop[0],crop[1],crop[2],crop[3],0,0,crop[2],crop[3]);const bodyPixels=rgbaOf(body.image),bodyModel=inferPurpleBodyModel(bodyPixels);
  const assets=await buildSpineAssets(prepared,{name,signal,anchorImage});abort(signal);
  // Reuse the existing packing/flat images/anchor. Only roll_1 becomes the
  // transparent purple body instead of the green opaque edge-fill texture.
  const region=assets.metadata.atlas.regions.find(r=>r.name==='roll_1'),bodyRaster=canvas(region.width,region.height);bodyRaster.context.drawImage(body.image,0,0,region.width,region.height);
  const raster=rgbaOf(bodyRaster.image),bodyFill=opaque(bodyRaster.image),filled=rgbaOf(bodyFill);owned.push(bodyFill);
  for(let i=0;i<raster.data.length;i+=4)if(raster.data[i+3]===0)raster.data.set(filled.data.subarray(i,i+3),i);
  atlasRead=await drawable(assets.textureBlob,signal);const page=rgbaOf(atlasRead.image);restoreTransparentColors(page,assets.metadata.atlas.regions);
  // Restore flat hidden RGB before clearing its paired opaque region. Reuse
  // roll_2's rectangle for one continuous, low-frequency side material.
  const contour=contourFromPixels(bodyPixels),wallRegion={...assets.metadata.atlas.regions.find(r=>r.name==='roll_2'),name:'soft_wall'},wall=buildSoftWallPixels(bodyPixels,contour,{width:wallRegion.width,height:wallRegion.height}),regions=[...discardUnusedRollRegions(page,assets.metadata.atlas.regions),wallRegion];
  replaceRegion(page,raster,region);replaceRegion(page,wall,wallRegion);
  const atlasText=assets.atlasText.replace(/^roll_[3-6]\n(?:[ \t].*(?:\n|$))+/gm,'').replace(/^roll_2$/m,'soft_wall');
  const encoded=await encodeRgbaPng(page.width,page.height,page.data,{signal}),json=buildPurpleSpineJson({...prepared,bodyPixels,contour,bodyModel},{name});
  const geometry=structuredClone(Object.fromEntries(['sourceSize','crop','cropOffset','bounds','loss','normalization'].map(key=>[key,prepared[key]])));
  const metadata={...assets.metadata,name:String(name).trim().slice(0,120)||'自定义紫色骰子',format:'Spine 4.2 JSON; native mesh/deform gyro05',motionVersion:PURPLE_GYRO_MOTION_VERSION,bodyVersion:PURPLE_GYRO_BODY_VERSION,grade:'purple',variant:'05',zoomPeak:1.5,faceMeshes:2,sideMeshes:32,blurMeshes:68,nativeExposures:3,faceMeshVertices:25,staticImages:regions.length,imageSequences:0,bodyModel,atlas:{...assets.metadata.atlas,regions},wallMaterial:wall.metadata,resolvedComposition:resolved,cycle:2,rollEnd:.54,settleEnd:.633333,landing:{start:.47,ready:.54,switch:.54,overlap:false},transparentRgb:'Flat alpha-zero RGB restored from paired opaque regions; front/back retain the original silhouette alpha at every coverage.',nativeAdaptation:'原生Spine05适配：紫色固定使用正反面与鼓起轮廓侧壁，数值投影和三组完整网格短曝光；不声称与WebGL九曝光逐像素相同',notes:['所有紫色素材固定使用异形正反面与五环鼓起侧壁；高覆盖方形主题也不切换为六面立方体','异形正反面保留PNG透明轮廓；单张soft_wall连续材质避免硬直线板与逐段色条','主网格先绘制，再叠加两组完整曝光形成面部与轮廓运动模糊；.535秒前清零，落定原图保持清晰','12个spin/standby动作；原PNG在.54秒原子落定，缩放继续到.591667秒归1',`仅${regions.length}张静态贴图与数值网格关键帧，不使用图片序列；原生.spine工程仍需Spine Editor`],pngEncoding:encoded.method};
  const retainedFiles=Object.fromEntries(Object.entries(assets.files).filter(([path])=>!/^images\/roll_[2-6]\.png$/.test(path)));
  const resultFiles={...retainedFiles,'dice.json':new Blob([JSON.stringify(json)],{type:'application/json'}),'dice.atlas':new Blob([atlasText],{type:'text/plain'}),'dice.png':encoded.blob,'build-info.json':new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'}),'images/roll_1.png':(await encodeRgbaPng(raster.width,raster.height,raster.data,{signal})).blob,'images/soft_wall.png':(await encodeRgbaPng(wall.width,wall.height,wall.data,{signal})).blob,'README.txt':new Blob([metadata.nativeAdaptation+'\n\n'+metadata.notes.join('\n')+'\n'],{type:'text/plain;charset=utf-8'})};
  resultFiles['manifest.json']=new Blob([JSON.stringify({name:metadata.name,spine:'4.2.43',motionVersion:PURPLE_GYRO_MOTION_VERSION,bodyVersion:PURPLE_GYRO_BODY_VERSION,animations:Object.keys(json.animations),staticImages:regions.length,imageSequences:0,files:Object.entries(resultFiles).filter(([path])=>path!=='manifest.json').map(([path,blob])=>({path,bytes:blob.size}))},null,2)],{type:'application/json'});
  return {kind:'purple-gyro',json,atlasText,texture:encoded.blob,atlasPage:assets.atlasPage,geometry,warnings:[...new Set([...warnings,...prepared.warnings])],files:resultFiles,metadata};
 }finally{
  decoded.dispose();baseRead?.close();atlasRead?.close();for(const p of preparedSets)for(const group of [p.landingImages,p.textures])for(const image of Object.values(group||{}))image.width=image.height=1;for(const image of owned)image.width=image.height=1;
 }
}
