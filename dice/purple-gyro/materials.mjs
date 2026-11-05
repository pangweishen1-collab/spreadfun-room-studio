import {clamp,smooth} from './motion.mjs';

function blurRGB(source,w,h,radius,wrapX=false){
 const horizontal=new Float32Array(source.length),result=new Float32Array(source.length),diameter=radius*2+1;
 for(let y=0;y<h;y++)for(let c=0;c<3;c++){
  let sum=0;const at=x=>source[(y*w+(wrapX?(x%w+w)%w:clamp(x,0,w-1)))*3+c];
  for(let x=-radius;x<=radius;x++)sum+=at(x);
  for(let x=0;x<w;x++){horizontal[(y*w+x)*3+c]=sum/diameter;sum+=at(x+radius+1)-at(x-radius);}
 }
 for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  let sum=0;const at=y=>horizontal[(clamp(y,0,h-1)*w+x)*3+c];
  for(let y=-radius;y<=radius;y++)sum+=at(y);
  for(let y=0;y<h;y++){result[(y*w+x)*3+c]=sum/diameter;sum+=at(y+radius+1)-at(y-radius);}
 }
 return result;
}

// One static unfolded material, not an animation/frame atlas. Neighbouring
// wall quads share exact U boundaries instead of magnifying unrelated pixels.
export function buildSoftWallPixels(source,contour,{width=128,height=128}={}){
 const {width:w,height:h,data}=source||{};
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data?.length!==w*h*4||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!Array.isArray(contour)||contour.length<3||!contour.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('紫色侧壁材质数据无效');
 const n=w*h,dist=new Uint16Array(n),nearest=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0,brightest=0,best=-1,maxAlpha=0,mass=0,cx=0,cy=0;
 const luma=i=>(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])/255;
 for(let i=0;i<n;i++){const alpha=data[i*4+3];maxAlpha=Math.max(maxAlpha,alpha);dist[i]=alpha>=16?w+h:0;mass+=alpha;cx+=(i%w+.5)*alpha;cy+=(Math.floor(i/w)+.5)*alpha;if(alpha&&luma(i)>best){best=luma(i);brightest=i;}}
 if(!mass)throw Error('紫色侧壁缺少可见主体');cx/=mass*w;cy/=mass*h;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(dist[i])dist[i]=Math.min(dist[i],x?dist[i-1]+1:1,y?dist[i-w]+1:1);}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(dist[i])dist[i]=Math.min(dist[i],x+1<w?dist[i+1]+1:1,y+1<h?dist[i+w]+1:1);}
 const alphaThreshold=Math.min(180,Math.max(1,Math.ceil(maxAlpha*.85)));
 for(let i=0;i<n;i++)if(data[i*4+3]>=alphaThreshold&&dist[i]>=3&&luma(i)>=.25){nearest[i]=i;queue[tail++]=i;}
 const usedFallback=!tail;if(!tail){nearest[brightest]=brightest;queue[tail++]=brightest;}
 const seedCount=tail;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(j>=0&&nearest[j]<0){nearest[j]=nearest[i];queue[tail++]=j;}}
 let pigment=new Float32Array(n*3);const average=[0,0,0];
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const color=data[nearest[i]*4+c];pigment[i*3+c]=color;average[c]+=color/n;}
 const radius=Math.max(1,Math.round(Math.min(w,h)*.055));for(let pass=0;pass<3;pass++)pigment=blurRGB(pigment,w,h,radius);
 const sample=(u,v,c)=>{const x=clamp(u*w-.5,0,w-1),y=clamp(v*h-.5,0,h-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0;return (pigment[(y0*w+x0)*3+c]*(1-fx)+pigment[(y0*w+x1)*3+c]*fx)*(1-fy)+(pigment[(y1*w+x0)*3+c]*(1-fx)+pigment[(y1*w+x1)*3+c]*fx)*fy;};
 let unfolded=new Float32Array(width*height*3);
 for(let x=0;x<width;x++){
  const phase=x/Math.max(1,width-1)*contour.length,i=Math.floor(phase)%contour.length,f=phase-Math.floor(phase),a=contour[i],b=contour[(i+1)%contour.length],u=a[0]+(b[0]-a[0])*f,v=a[1]+(b[1]-a[1])*f;
  for(let y=0;y<height;y++){
   const depth=y/Math.max(1,height-1),blend=smooth(depth),shade=.94+.06*Math.sin(Math.PI*depth);
   for(let c=0;c<3;c++){const front=sample(cx+(u-cx)*.86,cy+(v-cy)*.86,c),back=sample(cx+(u-cx)*.5,cy+(v-cy)*.5,c);unfolded[(y*width+x)*3+c]=((front*(1-blend)+back*blend)*.85+average[c]*.15)*shade;}
  }
 }
 const circularRadius=Math.max(1,Math.round(width*.045));for(let pass=0;pass<3;pass++)unfolded=blurRGB(unfolded,width,height,circularRadius,true);
 const out=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++){for(let c=0;c<3;c++)out[i*4+c]=Math.round(clamp(unfolded[i*3+c],0,255));out[i*4+3]=255;}
 // Match the final seam exactly, including byte rounding.
 for(let y=0;y<height;y++)out.set(out.subarray(y*width*4,y*width*4+4),(y*width+width-1)*4);
 return {width,height,data:out,metadata:{kind:'single-static-continuous-unfolded-wall',seedCount,usedFallback,sourceBlurRadius:radius,circularBlurRadius:circularRadius,neutralMix:.15}};
}
