// Register whole canvases together. Never fit/stretch individual alpha bounds.
export function prepareFaces(images){
 const warnings=[],sizes={},normalization={method:'contain-full-canvas-centered',canvasSize:null,faces:{},resampled:false};
 let size=0,totalPixels=0;
 for(let p=1;p<=6;p++){
  const im=images?.[p],w=im?.naturalWidth??im?.width,h=im?.naturalHeight??im?.height;
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1)throw Error('第 '+p+' 面图片尺寸无效');
  if(w>4096||h>4096||w*h>4*1024*1024)throw Error('第 '+p+' 面尺寸过大（单边最多4096、单张最多4MP）');
  totalPixels+=w*h;sizes[p]=[w,h];size=Math.max(size,w,h);
 }
 if(totalPixels>16*1024*1024)throw Error('六张骰面合计不能超过16MP');
 size=Math.min(512,size);normalization.canvasSize=[size,size];
 const source=[],bounds=[],landingImages={},cropSources={};let left=size,top=size,right=0,bottom=0;
 const originalSizes=new Set(Object.values(sizes).map(v=>v.join('×')));
 if(originalSizes.size>1)warnings.push('六张画布尺寸不同，已按完整画布等比缩放并居中对齐；请检查原始注册位置是否一致');
 if(Object.values(sizes).some(([w,h])=>w!==h))warnings.push('含非正方形画布，已等比缩放并居中补透明留白，未拉伸主体');
 for(let p=1;p<=6;p++){
  const image=images[p],[w,h]=sizes[p],scale=size/Math.max(w,h),dw=Math.max(1,Math.round(w*scale)),dh=Math.max(1,Math.round(h*scale)),dx=Math.floor((size-dw)/2),dy=Math.floor((size-dh)/2);
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('当前浏览器无法读取骰面画布');
  if(w===size&&h===size){ctx.drawImage(image,0,0);cropSources[p]=image;}else{ctx.drawImage(image,0,0,w,h,dx,dy,dw,dh);cropSources[p]=c;normalization.resampled ||= scale!==1;}
  landingImages[p]=c;normalization.faces[p]={sourceSize:[w,h],scale,drawRect:[dx,dy,dw,dh]};
  const pixels=ctx.getImageData(0,0,size,size);let l=size,t=size,r=0,b=0,maxAlpha=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const a=pixels.data[(y*size+x)*4+3];if(a){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);maxAlpha=Math.max(maxAlpha,a);}}
  if(r<=l||b<=t)throw Error('第 '+p+' 面为空图或完全透明');
  if(maxAlpha<240)warnings.push('第 '+p+' 面整体透明度较低，已用可见像素扩展边缘；立体贴面会变为不透明，请核对材质');
  source.push(pixels);bounds.push([l,t,r,b]);left=Math.min(left,l);top=Math.min(top,t);right=Math.max(right,r);bottom=Math.max(bottom,b);
 }
 if(normalization.resampled)warnings.push('已将完整画布等比归一化到 '+size+'×'+size+'；原始文件不变');
 const extents=bounds.map(([l,t,r,b])=>Math.max(r-l,b-t)),median=[...extents].sort((a,b)=>a-b)[2];
 for(let p=1;p<=6;p++)if(extents[p-1]<median*.5||extents[p-1]>median*1.5)warnings.push('第 '+p+' 面主体尺寸与其他面差异较大，未单独放大或缩小，请检查素材');
 const span=Math.max(right-left,bottom-top),cx=(left+right)/2,cy=(top+bottom)/2;
 left=Math.max(0,Math.min(size-span,Math.floor(cx-span/2)));top=Math.max(0,Math.min(size-span,Math.floor(cy-span/2)));right=left+span;bottom=top+span;
 const textures={},loss=[];
 for(let p=1;p<=6;p++){
  const c=document.createElement('canvas');c.width=c.height=span;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(cropSources[p],left,top,span,span,0,0,span,span);
  const rgba=ctx.getImageData(0,0,span,span),d=rgba.data,n=span*span,nearest=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0,maxAlpha=0;
  for(let i=0;i<n;i++)maxAlpha=Math.max(maxAlpha,d[i*4+3]);
  if(!maxAlpha)throw Error('第 '+p+' 面没有可见像素');
  const seedAlpha=maxAlpha>=240?240:Math.max(1,Math.ceil(maxAlpha*.9));
  for(let i=0;i<n;i++)if(d[i*4+3]>=seedAlpha){nearest[i]=i;queue[tail++]=i;}
  while(head<tail){const i=queue[head++],x=i%span,y=Math.floor(i/span);
   for(const j of [x?i-1:-1,x<span-1?i+1:-1,y?i-span:-1,y<span-1?i+span:-1])if(j>=0&&nearest[j]<0){nearest[j]=nearest[i];queue[tail++]=j;}
  }
  const original=new Uint8ClampedArray(d);
  for(let i=0;i<n;i++){const a=original[i*4+3]/255,k=nearest[i]*4;for(let ch=0;ch<3;ch++)d[i*4+ch]=Math.round(original[i*4+ch]*a+original[k+ch]*(1-a));d[i*4+3]=255;}
  ctx.putImageData(rgba,0,0);textures[p]=c;
  let core=0,legacyLost=0,lost=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(source[p-1].data[(y*size+x)*4+3]>=128){core++;if(x<size*.18||x>=size*.82||y<size*.18||y>=size*.82)legacyLost++;if(x<left||x>=right||y<top||y>=bottom)lost++;}
  loss.push({point:p,corePixels:core,legacyLost,legacyLostPercent:core?100*legacyLost/core:0,correctedLost:lost,seedAlpha});
 }
 return {landingImages,textures,crop:[left,top,span,span],sourceSize:size,cropOffset:[(left+right-size)/2,(top+bottom-size)/2],bounds,loss,warnings,normalization};
}
