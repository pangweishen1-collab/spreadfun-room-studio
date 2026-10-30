/** VAP image/text resources. Native src/frame schema follows Tencent/vap.
 * Coordinates in the editor are fractions of the visible output, never packed pixels.
 */
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (lo, hi, value) => { const t = clamp((value-lo)/(hi-lo)); return t*t*(3-2*t); };
const align16 = value => Math.ceil(value/16)*16;
const abort = signal => { if(signal?.aborted) throw Object.assign(new Error('Resource preparation cancelled'), {code:'cancelled'}); };

export const RESOURCE_LIMITS = Object.freeze({count:6, fileBytes:12*1024*1024, textLength:80, textureSide:4096, texturePixels:16*1024*1024});
const avatarFrameUrl=new URL('./assets/vap-avatar-base.webp',import.meta.url);
/** The gold badge follows the replaceable avatar slot; only the badge is baked. */
export function avatarFrameRect([x,y,w,h]){return [x-w*14/120,y-h*14/120,w*148/120,h*148/120];}
export function normalizeResources(resources = [], {width=720, height=1560, duration=120, sourceVapConfig} = {}) {
  if(!Array.isArray(resources) || resources.length>RESOURCE_LIMITS.count) throw new TypeError('最多添加 6 个头像或文字资源。');
  const ids=new Set(), tags=new Set();
  return resources.map((input,index) => {
    if(!input || typeof input!=='object') throw new TypeError('资源参数无效。');
    const r={id:String(index+1),tag:`resource${index+1}`,type:'image',x:.35,y:.4,width:.3,height:.15,offsetX:0,offsetY:0,scaleX:1,scaleY:1,start:0,end:null,opacity:1,shape:'square',fit:'cover',fontSize:36,color:'#ffffff',text:'',...input};
    if(typeof r.id!=='string'||!r.id||r.id.length>64||ids.has(r.id)) throw new TypeError('资源 ID 必须唯一。');
    if(typeof r.tag!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(r.tag)||tags.has(r.tag)) throw new TypeError('资源标签需以字母开头，且不能重复。');
    ids.add(r.id);tags.add(r.tag);
    if(!['image','text'].includes(r.type)||!['circle','square'].includes(r.shape)||!['cover','contain'].includes(r.fit)) throw new TypeError('资源类型或适配方式无效。');
    if(r.defaultAvatar!==undefined&&typeof r.defaultAvatar!=='boolean')throw new TypeError('默认头像标记无效。');
    if(r.avatarFrame!==undefined&&(typeof r.avatarFrame!=='boolean'||r.type!=='image'))throw new TypeError('头像底图仅适用于头像资源。');
    if(r.animation!==undefined&&r.animation!=='none'&&r.animation!=='float-pop')throw new TypeError('资源动画无效。');
    if(r.animation==='float-pop'&&(r.type!=='image'||r.sourceId!==undefined&&r.sourceId!==null))throw new TypeError('默认动画仅适用于新增头像 Key。');
    if(![r.x,r.y,r.width,r.height,r.opacity].every(finite)||r.width<=0||r.height<=0||r.width>1||r.height>1||r.opacity<0||r.opacity>1) throw new TypeError('请检查资源位置、尺寸和透明度。');
    if(![r.offsetX,r.offsetY].every(value=>finite(value)&&value>=-1&&value<=1))throw new TypeError('资源位置偏移须为 -100%–100%。');
    if(![r.scaleX,r.scaleY].every(value=>finite(value)&&value>=.05&&value<=8))throw new TypeError('资源缩放须为 5%–800%。');
    if(r.sourceId!==undefined&&r.sourceId!==null){
      r.sourceId=String(r.sourceId);
      const source=sourceVapConfig?.src?.find(item=>String(item.srcId)===r.sourceId);
      if(!source||source.srcType!==(r.type==='image'?'img':'txt')) throw new TypeError('原视频资源槽不存在或类型不符。');
    }else{
      delete r.sourceId;
      if(r.x<0||r.y<0||r.x+r.width>1.000001||r.y+r.height>1.000001) throw new TypeError('资源需放在输出画布范围内。');
    }
    if(!finite(r.start)||r.start<0||r.start>=duration||(r.end!==null&&(!finite(r.end)||r.end<=r.start||r.end>duration+.05))) throw new TypeError('资源出现时间必须位于视频时长内。');
    if(!finite(r.fontSize)||r.fontSize<8||r.fontSize>256||typeof r.color!=='string'||!/^#[0-9a-f]{6}$/i.test(r.color)) throw new TypeError('文字字号或颜色无效。');
    if(r.type==='image'){
      if(!(r.file instanceof Blob)||!r.file.size||r.file.size>RESOURCE_LIMITS.fileBytes||!/^image\/(png|jpeg|webp)$/i.test(r.file.type)) throw new TypeError('请选择 12 MB 以内的 PNG、JPG 或 WebP 头像。');
    }else if(typeof r.text!=='string'||!r.text.trim()||Array.from(r.text).length>RESOURCE_LIMITS.textLength) throw new TypeError('请输入 1–80 个字符的文字。');
    return r;
  });
}

function surface(width,height){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>RESOURCE_LIMITS.textureSide||height>RESOURCE_LIMITS.textureSide||width*height>RESOURCE_LIMITS.texturePixels)throw new RangeError('资源尺寸过大，请缩小后重试。');
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) throw new Error('Cannot create resource canvas');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  return {canvas,ctx};
}
function sourceGeometry(sourceVapConfig,width,height){
  const scale=Math.min(width/sourceVapConfig.info.w,height/sourceVapConfig.info.h),w=sourceVapConfig.info.w*scale,h=sourceVapConfig.info.h*scale;
  return {scale,rect:[(width-w)/2,(height-h)/2,w,h]};
}
function dimensions(r,width,height,sourceVapConfig){
  const source=r.sourceId!==undefined?sourceVapConfig?.src?.find(item=>String(item.srcId)===r.sourceId):null;
  const scale=source?sourceGeometry(sourceVapConfig,width,height).scale:1;
  const result=source?[Math.max(1,Math.round(source.w*scale*(r.scaleX??1))),Math.max(1,Math.round(source.h*scale*(r.scaleY??1)))]:[Math.max(1,Math.round(r.width*width)),Math.max(1,Math.round(r.height*height))];
  if(result.some(value=>!Number.isSafeInteger(value)||value>RESOURCE_LIMITS.textureSide)||result[0]*result[1]>RESOURCE_LIMITS.texturePixels)throw new RangeError('资源尺寸过大，请缩小后重试。');
  return result;
}
const sourceFrameIndexes=new WeakMap();
function getSourceObject(resource,sourceVapConfig,timestamp){
  if(resource.sourceId===undefined)return null;
  const frame=Math.min(sourceVapConfig.info.f-1,Math.floor(timestamp*sourceVapConfig.info.fps+1e-5));
  let index=sourceFrameIndexes.get(sourceVapConfig);
  if(!index){index=new Map((sourceVapConfig.frame||[]).map(item=>[item.i,item.obj]));sourceFrameIndexes.set(sourceVapConfig,index);}
  return index.get(frame)?.find(item=>String(item.srcId)===resource.sourceId)||null;
}
/** One timeline drives editor geometry, baked gold and the native VAP slot. */
export function resourceMotion(resource,{timestamp=0,duration=120,fps=24}={}){
  if(resource.animation!=='float-pop'||resource.type!=='image'||resource.sourceId!==undefined)return {scale:1,offsetY:0,opacity:1};
  const start=resource.start||0,end=resource.end??duration,rate=finite(fps)&&fps>0?fps:24;
  // Preserve one/two-frame resources instead of making every available frame invisible.
  if(!finite(end)||(end-start)*rate<=2.000001)return {scale:1,offsetY:0,opacity:1};
  const stop=Math.max(start,end-1/rate),span=stop-start,local=Math.max(0,timestamp-start);
  const enter=Math.min(.65,span*.45),exit=Math.min(1,span*.45),p=clamp(local/enter);
  const scale=p<=0?0:p>=1?1:1-Math.exp(-8*p)*Math.cos(12*p);
  return {scale,offsetY:10*Math.sin(local*2*Math.PI/2.4),opacity:scale<=0?0:clamp((stop-timestamp)/exit)};
}
export function resourceFrame(resource,{width,height,sourceVapConfig,timestamp=0,duration=120,fps=24}={}){
  if(timestamp<resource.start||(resource.end!==null&&timestamp>=resource.end))return null;
  if(resource.sourceId!==undefined){
    const obj=getSourceObject(resource,sourceVapConfig,timestamp);if(!obj)return null;
    const {scale,rect:[x,y]}=sourceGeometry(sourceVapConfig,width,height);
    return {rect:[Math.round(x+obj.frame[0]*scale+(resource.offsetX||0)*width),Math.round(y+obj.frame[1]*scale+(resource.offsetY||0)*height),Math.max(1,Math.round(obj.frame[2]*scale*(resource.scaleX??1))),Math.max(1,Math.round(obj.frame[3]*scale*(resource.scaleY??1)))],sourceObject:obj,motionOpacity:1};
  }
  let rect=[Math.round(resource.x*width),Math.round(resource.y*height),Math.max(1,Math.round(resource.width*width)),Math.max(1,Math.round(resource.height*height))];
  const motion=resourceMotion(resource,{timestamp,duration,fps});
  if(resource.animation==='float-pop'){
    const [x,y,w,h]=rect,frameScale=resource.avatarFrame?148/120:1,pad=resource.avatarFrame?14/120:0;
    const scale=Math.min(motion.scale,width/(w*frameScale),height/(h*frameScale));
    const fw=Math.max(1,Math.min(Math.floor(width/frameScale),Math.round(w*scale))),fh=Math.max(1,Math.min(Math.floor(height/frameScale),Math.round(h*scale)));
    const px=fw*pad,py=fh*pad,cx=x+w/2,cy=y+h/2+motion.offsetY;
    rect=[Math.max(Math.ceil(px),Math.min(Math.floor(width-fw-px),Math.round(cx-fw/2))),Math.max(Math.ceil(py),Math.min(Math.floor(height-fh-py),Math.round(cy-fh/2))),fw,fh];
  }
  return {rect,sourceObject:null,motionOpacity:motion.opacity};
}
function fade(y,height,mask){return mask?.enabled?smooth(mask.topStart,mask.topEnd,height===1?.5:y/(height-1))*(1-smooth(mask.bottomStart,mask.bottomEnd,height===1?.5:y/(height-1))):1;}

/** Place independent masks below the base alpha, using its otherwise unused column first. */
export function computeResourceLayout(base,resources,{sourceVapConfig}={}){
  if(!resources.length)return base;
  const gap=base.gap||8,scale=base.alphaScale||.5;
  let x=base.w+gap,y=base.aFrame[1]+base.aFrame[3]+gap,rowHeight=0,bottom=base.videoH;
  let inColumn=base.orientation==='horizontal',limit=inColumn?base.videoW:base.videoW;
  if(!inColumn){x=0;y=base.videoH+gap;}
  const resourceMasks={};
  for(const r of resources){
    const [rw,rh]=dimensions(r,base.w,base.h,sourceVapConfig),w=Math.max(2,Math.ceil(rw*scale)),h=Math.max(2,Math.ceil(rh*scale));
    if(inColumn&&(x+w>limit||y+h>base.videoH)){
      if(x!==base.w+gap&&base.w+gap+w<=limit){x=base.w+gap;y+=rowHeight+gap;rowHeight=0;}
      if(x+w>limit||y+h>base.videoH){inColumn=false;x=0;y=bottom+gap;rowHeight=0;}
    }
    if(!inColumn&&x+w>limit){x=0;y+=rowHeight+gap;rowHeight=0;}
    if(w>limit)throw new RangeError('Resource mask exceeds packed width');
    resourceMasks[r.id]=[x,y,w,h];x+=w+gap;rowHeight=Math.max(rowHeight,h);bottom=Math.max(bottom,y+h);
  }
  const videoH=align16(bottom);
  if(videoH>4096)throw new RangeError('资源遮罩过大，请减小尺寸或减少资源。');
  return {...base,videoH,resourceMasks,legacyDimensionWarning:Math.max(base.videoW,videoH)>1504};
}

export function addResourceConfig(config,{resources,layout,fps,frames,duration,sourceVapConfig}={}){
  if(!resources?.length)return config;
  config.info.videoW=layout.videoW;config.info.videoH=layout.videoH;config.info.isVapx=1;
  config.src=resources.map(r=>{
    const [w,h]=dimensions(r,config.info.w,config.info.h,sourceVapConfig);
    return {srcId:r.id,srcType:r.type==='image'?'img':'txt',loadType:r.type==='image'?'net':'local',srcTag:`[${r.tag}]`,w,h,fitType:'fitXY',...(r.type==='text'?{color:r.color,style:'b',fontStyle:{font:`bold ${r.fontSize}px Arial`,color:r.color}}:{})};
  });
  // Every frame explicitly lists every slot. Inactive slots sample a black mask,
  // preventing older web SDKs from retaining the preceding frame's uniform data.
  config.frame=Array.from({length:frames},(_,i)=>({i,obj:resources.map((r,z)=>{
    const frame=resourceFrame(r,{width:config.info.w,height:config.info.h,sourceVapConfig,timestamp:i/fps,duration,fps});
    return {srcId:r.id,z,frame:frame?.rect||[0,0,1,1],mFrame:layout.resourceMasks[r.id],mt:0};
  })}));
  config.funToolkit={...config.funToolkit,resourceMode:'dynamic',resourceDefaults:Object.fromEntries(resources.filter(r=>r.type==='text').map(r=>[r.tag,r.text])),resourceManifest:resources.map(r=>({tag:r.tag,type:r.type,...(r.type==='image'?{file:`resources/${r.tag}.png`,...(r.defaultAvatar===true?{placeholder:true}:{})}:{text:r.text}),...(r.animation==='float-pop'?{animation:r.animation}:{}),...(r.sourceId!==undefined?{sourceId:r.sourceId}:{})}))};
  return config;
}

async function image(file){
  if(typeof createImageBitmap==='function')return createImageBitmap(file);
  const url=URL.createObjectURL(file);
  try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Avatar could not be decoded'));img.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
function fitted(ctx,img,w,h,fit){const iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight,scale=Math[fit==='cover'?'max':'min'](w/iw,h/ih);ctx.drawImage(img,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);}
function toBlob(canvas){return typeof canvas.convertToBlob==='function'?canvas.convertToBlob({type:'image/png'}):new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Resource export failed')),'image/png'));}

/** Return a straight-alpha visible image from a packed native VAP source. */
export function createVapUnpacker({width,height,sourceVapConfig,verticalMask,videoOffsetY=0}={}){
  if(!finite(videoOffsetY)||Math.abs(videoOffsetY)>1)throw new TypeError('Invalid video offset');
  const rgb=surface(width,height),alpha=surface(width,height),i=sourceVapConfig.info,content=sourceGeometry(sourceVapConfig,width,height).rect;
  content[1]+=videoOffsetY*height;
  // Native Tencent exporter composites RGB over black. Explicit straight exports
  // carry our marker and must not be unpremultiplied a second time.
  const premultiplied=sourceVapConfig.funToolkit?.rgbAlphaMode!=='straight';
  return {
    process(source){
      rgb.ctx.clearRect(0,0,width,height);alpha.ctx.clearRect(0,0,width,height);
      rgb.ctx.drawImage(source,...i.rgbFrame,...content);alpha.ctx.drawImage(source,...i.aFrame,...content);
      const out=rgb.ctx.getImageData(0,0,width,height),a=alpha.ctx.getImageData(0,0,width,height).data;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const p=(y*width+x)*4,original=a[p];
        if(premultiplied)for(let c=0;c<3;c++)out.data[p+c]=original?Math.min(255,Math.round(out.data[p+c]*255/original)):0;
        out.data[p+3]=Math.round(original*fade(y,height,verticalMask));
      }
      return out;
    },
    dispose(){rgb.canvas.width=rgb.canvas.height=alpha.canvas.width=alpha.canvas.height=1;}
  };
}
export function unpackVapFrame(source,options){const unpacker=createVapUnpacker(options);try{return unpacker.process(source);}finally{unpacker.dispose();}}

export async function createResourceRenderer(input,{width=720,height=1560,duration=120,fps=24,verticalMask={enabled:false},sourceVapConfig,signal,includeDefaultAvatars=true}={}){
  const resources=normalizeResources(input,{width,height,duration,sourceVapConfig}),entries=[],urls=[];
  const composition=surface(width,height);
  let avatarFrameBitmap;
  try{
    if(resources.some(r=>r.avatarFrame)){
      const response=await fetch(avatarFrameUrl,{signal});if(!response.ok)throw new Error('头像底图未能加载，请重试。');
      avatarFrameBitmap=await image(await response.blob());abort(signal);
    }
    for(const r of resources){
      abort(signal);const [w,h]=dimensions(r,width,height,sourceVapConfig),texture=surface(w,h),mask=surface(w,h),layer=surface(w,h);
      const entry={r,w,h,texture,mask,layer};entries.push(entry);
      if(r.avatarFrame){
        const bw=Math.ceil(w*148/120),bh=Math.ceil(h*148/120),background=surface(bw,bh),alpha=surface(bw,bh);
        background.ctx.drawImage(avatarFrameBitmap,0,0,bw,bh);
        entry.background={...background,alpha,w:bw,h:bh,pixels:background.ctx.getImageData(0,0,bw,bh),cacheKey:null};
      }
      let bitmap;
      try{
        if(r.type==='image'){if(!includeDefaultAvatars&&r.defaultAvatar===true)continue;bitmap=await image(r.file);abort(signal);if(Math.max(bitmap.width,bitmap.height)>8192||bitmap.width*bitmap.height>32e6)throw new TypeError('头像尺寸不能超过 8192 px 或 3200 万像素。');fitted(texture.ctx,bitmap,w,h,r.fit);}
        else{texture.ctx.font=`bold ${r.fontSize}px Arial`;texture.ctx.fillStyle=r.color;texture.ctx.textAlign='center';texture.ctx.textBaseline='middle';texture.ctx.fillText(r.text,w/2,h/2);}
      }finally{bitmap?.close?.();}
    }
    avatarFrameBitmap?.close?.();avatarFrameBitmap=null;
    let disposed=false,tagsPromise,filesPromise,placeholder;
    function emptyTexture(){return (placeholder ||= surface(1,1)).canvas;}
    function valid(resourceOpacity=1){
      if(disposed)throw new Error('Resource renderer was disposed');
      if(!finite(resourceOpacity)||resourceOpacity<0||resourceOpacity>1)throw new TypeError('Invalid resource opacity');
    }
    function backgroundFrame(entry,timestamp,resourceOpacity=1){
      const geometry=resourceFrame(entry.r,{width,height,sourceVapConfig,timestamp,duration,fps});if(!geometry)return null;
      const rect=avatarFrameRect(geometry.rect),b=entry.background,key=entry.r.opacity*Math.min(resourceOpacity,geometry.motionOpacity??1);
      if(key!==b.cacheKey){
        const rgba=new Uint8ClampedArray(b.pixels.data),alpha=new Uint8ClampedArray(rgba.length);
        for(let py=0;py<b.h;py++){
          const weight=key;
          for(let px=0;px<b.w;px++){const p=(py*b.w+px)*4;rgba[p+3]=Math.round(rgba[p+3]*weight);alpha[p]=alpha[p+1]=alpha[p+2]=255;alpha[p+3]=rgba[p+3];}
        }
        b.ctx.putImageData(new ImageData(rgba,b.w,b.h),0,0);b.alpha.ctx.putImageData(new ImageData(alpha,b.w,b.h),0,0);b.cacheKey=key;
      }
      return rect;
    }
    function drawStatic(ctx,timestamp,{resourceOpacity=1}={}){
      valid(resourceOpacity);
      for(const e of entries){if(!e.background)continue;const rect=backgroundFrame(e,timestamp,resourceOpacity);if(rect)ctx.drawImage(e.background.canvas,...rect);}
    }
    function active(entry,timestamp,sourceCanvas,resourceOpacity=1){
      const {r,w,h,mask}=entry,geometry=resourceFrame(r,{width,height,sourceVapConfig,timestamp,duration,fps});
      mask.ctx.fillStyle='#000';mask.ctx.fillRect(0,0,w,h);
      if(!geometry)return null;
      if(geometry.sourceObject){
        if(!sourceCanvas)return null;
        const obj=geometry.sourceObject;
        mask.ctx.save();
        if(obj.mt===90){mask.ctx.translate(w,0);mask.ctx.rotate(Math.PI/2);mask.ctx.drawImage(sourceCanvas,...obj.mFrame,0,0,h,w);}
        else mask.ctx.drawImage(sourceCanvas,...obj.mFrame,0,0,w,h);
        mask.ctx.restore();
      }else{mask.ctx.fillStyle='#fff';mask.ctx.fillRect(0,0,w,h);}
      const pixels=mask.ctx.getImageData(0,0,w,h);
      for(let py=0;py<h;py++)for(let px=0;px<w;px++){
        const p=(py*w+px)*4;
        const shape=r.shape==='circle'?clamp((.5-Math.hypot((px+.5)/w-.5,(py+.5)/h-.5))*Math.min(w,h)+.5):1;
        const weight=shape*r.opacity*Math.min(resourceOpacity,geometry.motionOpacity??1);
        const value=Math.round(pixels.data[p]*weight);pixels.data[p]=pixels.data[p+1]=pixels.data[p+2]=value;pixels.data[p+3]=255;
      }
      mask.ctx.putImageData(pixels,0,0);return geometry;
    }
    // Spatial video masks stay independent; the temporal gift envelope fades
    // every slot once while preserving its own opacity and native occlusion.
    function draw(ctx,timestamp,{sourceCanvas,includeStatic=true,includeDefaults=true,resourceOpacity=1}={}){
      valid(resourceOpacity);if(includeStatic)drawStatic(ctx,timestamp,{resourceOpacity});
      for(const e of entries){
        if(!includeDefaults&&e.r.defaultAvatar===true)continue;
        const geometry=active(e,timestamp,sourceCanvas,resourceOpacity);if(!geometry)continue;
        e.layer.ctx.clearRect(0,0,e.w,e.h);e.layer.ctx.drawImage(e.texture.canvas,0,0);
        const data=e.layer.ctx.getImageData(0,0,e.w,e.h),mask=e.mask.ctx.getImageData(0,0,e.w,e.h).data;
        for(let p=0;p<data.data.length;p+=4)data.data[p+3]=Math.round(data.data[p+3]*mask[p]/255);
        e.layer.ctx.putImageData(data,0,0);ctx.drawImage(e.layer.canvas,...geometry.rect);
      }
    }
    return {
      resources,draw,drawStatic,hasStaticLayers:entries.some(e=>e.background),
      apply(imageData,timestamp,options){composition.ctx.putImageData(imageData,0,0);draw(composition.ctx,timestamp,options);return composition.ctx.getImageData(0,0,width,height);},
      applyStatic(imageData,timestamp,options){composition.ctx.putImageData(imageData,0,0);drawStatic(composition.ctx,timestamp,options);return composition.ctx.getImageData(0,0,width,height);},
      // White pixels carrying the badge alpha compose with the existing grayscale
      // base alpha using source-over: Aout = Abadge + Abase * (1 - Abadge).
      drawStaticPlanes(ctx,layout,timestamp,{resourceOpacity=1}={}){
        valid(resourceOpacity);const [ax,ay,aw,ah]=layout.aFrame;
        for(const e of entries){
          if(!e.background)continue;const rect=backgroundFrame(e,timestamp,resourceOpacity);if(!rect)continue;
          const [x,y,w,h]=rect;
          ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.drawImage(e.background.canvas,...rect);ctx.restore();
          ctx.save();ctx.beginPath();ctx.rect(ax,ay,aw,ah);ctx.clip();ctx.drawImage(e.background.alpha.canvas,ax+x*aw/width,ay+y*ah/height,w*aw/width,h*ah/height);ctx.restore();
        }
      },
      drawMasks(ctx,layout,timestamp,sourceCanvas,{resourceOpacity=1}={}){valid(resourceOpacity);for(const e of entries){active(e,timestamp,sourceCanvas,resourceOpacity);ctx.drawImage(e.mask.canvas,...layout.resourceMasks[e.r.id]);}},
      getPlayerTags(){return tagsPromise ||= Promise.all(entries.map(async e=>{if(e.r.type==='text')return [e.r.tag,e.r.text];const url=URL.createObjectURL(await toBlob(e.r.defaultAvatar===true?emptyTexture():e.texture.canvas));urls.push(url);return [e.r.tag,url];})).then(Object.fromEntries);},
      getPackageFiles(){return filesPromise ||= Promise.all(entries.filter(e=>e.r.type==='image').map(async e=>({name:`resources/${e.r.tag}.png`,blob:await toBlob(e.r.defaultAvatar===true?emptyTexture():e.texture.canvas)})));},
      dispose(){if(disposed)return;disposed=true;for(const url of urls)URL.revokeObjectURL(url);for(const e of entries)for(const s of [e.texture,e.mask,e.layer,e.background,e.background?.alpha].filter(Boolean))s.canvas.width=s.canvas.height=1;composition.canvas.width=composition.canvas.height=1;if(placeholder)placeholder.canvas.width=placeholder.canvas.height=1;}
    };
  }catch(error){avatarFrameBitmap?.close?.();for(const e of entries)for(const s of [e.texture,e.mask,e.layer,e.background,e.background?.alpha].filter(Boolean))s.canvas.width=s.canvas.height=1;composition.canvas.width=composition.canvas.height=1;throw error;}
}
