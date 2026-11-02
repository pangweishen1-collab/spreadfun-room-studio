/* Bounded, decoded-output quality checks. Never changes dimensions, FPS or alpha. */
const abort = signal => {if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{code:'cancelled'});};
const limits=Object.freeze({rgb:{mean:1.25,edge:2.5,tile:6},alpha:{mean:1,edge:1.5,tile:3}});
export function measurePlaneError(reference,decoded,width,height){
  const length=width*height*4;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||reference.length!==length||decoded.length!==length)throw new TypeError('Invalid quality plane');
  const cols=Math.ceil(width/8),rows=Math.ceil(height/8),tiles=new Float64Array(cols*rows),counts=new Uint16Array(tiles.length);
  let sum=0,edges=0,edgeCount=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,tile=Math.floor(y/8)*cols+Math.floor(x/8);
    for(let c=0;c<3;c++){
      const error=Math.abs(reference[p+c]-decoded[p+c]);sum+=error;tiles[tile]+=error;counts[tile]++;
      if(x){edges+=Math.abs((reference[p+c]-reference[p-4+c])-(decoded[p+c]-decoded[p-4+c]));edgeCount++;}
      if(y){edges+=Math.abs((reference[p+c]-reference[p-width*4+c])-(decoded[p+c]-decoded[p-width*4+c]));edgeCount++;}
    }
  }
  let tile=0;for(let i=0;i<tiles.length;i++)tile=Math.max(tile,tiles[i]/counts[i]);
  return {mean:sum/(width*height*3),edge:edgeCount?edges/edgeCount:0,tile};
}
export function passesQualityGate(planes){
  return Array.isArray(planes)&&planes.length>0&&planes.every(p=>{
    const bound=limits[p.kind];return bound&&['mean','edge','tile'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=bound[k]);
  });
}
function surface(width,height){
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height}),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx){canvas.width=canvas.height=1;throw new Error('Quality readback unavailable');}ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';return {canvas,ctx};
}
function readPlane(target,source,rect){target.ctx.drawImage(source,...rect,0,0,target.canvas.width,target.canvas.height);return target.ctx.getImageData(0,0,target.canvas.width,target.canvas.height).data;}
export function createQualitySampler(layout,frames,fps){
  const indices=new Set([.1,.3,.5,.7,.9].map(f=>Math.min(frames-1,Math.round((frames-1)*f))));
  const specs=[{name:'rgb',kind:'rgb',rect:layout.rgbFrame},{name:'alpha',kind:'alpha',rect:layout.aFrame},...Object.entries(layout.resourceMasks||{}).map(([id,rect])=>({name:'mask:'+id,kind:'alpha',rect}))],planes=[],samples=[];
  try{for(const p of specs){
    const scale=Math.min(1,(p.name.startsWith('mask:')?256:512)/Math.max(p.rect[2],p.rect[3]));planes.push({...p,...surface(Math.max(1,Math.round(p.rect[2]*scale)),Math.max(1,Math.round(p.rect[3]*scale)))});
  }}catch(error){for(const p of planes)p.canvas.width=p.canvas.height=1;throw error;}
  return {samples,capture(source,index){if(indices.has(index))samples.push({time:index/fps,planes:planes.map(p=>({name:p.name,kind:p.kind,rect:p.rect.slice(),width:p.canvas.width,height:p.canvas.height,data:readPlane(p,source,p.rect)}))});},dispose(){for(const p of planes)p.canvas.width=p.canvas.height=1;}};
}
export async function evaluateQualitySamples(M,blob,samples,{signal}={}){
  abort(signal);if(!samples.length)return {passed:false,reason:'no-reference'};
  const input=new M.Input({source:new M.BlobSource(blob),formats:[M.MP4]}),surfaces=new Map(),scores=[];
  try{
    const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error('Quality decoder unavailable');
    const sink=new M.CanvasSink(track,{poolSize:1});
    for(const sample of samples){
      abort(signal);const decoded=await sink.getCanvas(sample.time);if(!decoded)throw new Error('Quality sample unavailable');
      for(const plane of sample.planes){
        abort(signal);const key=plane.width+'x'+plane.height;let target=surfaces.get(key);if(!target){target=surface(plane.width,plane.height);surfaces.set(key,target);}
        scores.push({time:sample.time,name:plane.name,kind:plane.kind,...measurePlaneError(plane.data,readPlane(target,decoded.canvas,plane.rect),plane.width,plane.height)});
      }
    }
    return {passed:passesQualityGate(scores),samples:samples.length,planes:scores};
  }finally{input.dispose();for(const s of surfaces.values())s.canvas.width=s.canvas.height=1;}
}
