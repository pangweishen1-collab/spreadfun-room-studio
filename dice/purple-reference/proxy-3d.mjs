// Plane reference geometry and nine-exposure compositor from the approved 05 study.
// Uploads use the same silhouette projection with tolerance for thin or dark artwork.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function triangle(a,b,c,uvs){
 const ab=b.map((x,k)=>x-a[k]),ac=c.map((x,k)=>x-a[k]);
 const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],len=Math.hypot(...n)||1;
 return [a,b,c].flatMap((p,i)=>[...p,...n.map(x=>x/len),...uvs[i]]);
}
// The supplied front silhouette is the boundary of a closed, bulging solid.
// Its thickness/back are intentionally proxy geometry, not recovered modeling.
// Each clipped grid triangle retains holes/concavities such as wings and spouts.
export function buildSilhouetteGeometry(source,{steps=80,cutoff=24}={}){
 const depth=.44;
 const {width:w,height:h,data}=source;if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data?.length!==w*h*4||!Number.isInteger(steps)||steps<16||steps>320)throw Error('异形轮廓数据无效');
 const dist=new Float32Array(w*h),large=w+h;let mass=0,mx=0,my=0,l=w,t=h,r=0,b=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=data[(y*w+x)*4+3]/255;dist[y*w+x]=a*255>=cutoff?large:0;mass+=a;mx+=(x+.5)*a;my+=(y+.5)*a;if(a*255>=8){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}}
 if(!mass)throw Error('异形轮廓完全透明');
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(dist[y*w+x])dist[y*w+x]=Math.min(dist[y*w+x],x?dist[y*w+x-1]+1:1,y?dist[(y-1)*w+x]+1:1);
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--)if(dist[y*w+x])dist[y*w+x]=Math.min(dist[y*w+x],x+1<w?dist[y*w+x+1]+1:1,y+1<h?dist[(y+1)*w+x]+1:1);
 const interpolate=(field,x,y,alpha=false)=>{
  if(x<=0||y<=0||x>=w||y>=h)return 0;
  const xx=clamp(x-.5,0,w-1),yy=clamp(y-.5,0,h-1),x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1),fx=xx-x0,fy=yy-y0;
  const at=(a,b)=>alpha?data[(b*w+a)*4+3]:field[b*w+a];
  return (at(x0,y0)*(1-fx)+at(x1,y0)*fx)*(1-fy)+(at(x0,y1)*(1-fx)+at(x1,y1)*fx)*fy;
 };
 const alpha=(x,y)=>interpolate(null,x,y,true),half=depth/2,edge=half*.55;
 const zAt=(x,y)=>{const q=clamp(interpolate(dist,x,y)/18);return edge+(half-edge)*q*q*(3-2*q);};
 // Invert the camera projection at the unrotated front so the full original
 // 200px registration, including transparent borders, matches the final PNG.
 const pos=(p,back=false)=>{const z=zAt(p.x,p.y)*(back?-1:1),s=(4-z)/4.725;return [(p.x/w*2-1)*s,(1-p.y/h*2)*s,z];};
 const uv=p=>[p.x/w,1-p.y/h],front=[],back=[],walls=[];
 const output=(array,a,b,c,uvs)=>array.push(...triangle(a,b,c,uvs));
 let boundarySegments=0;
 const clipped=(input)=>{const out=[];for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ain=a.a>=cutoff,bin=b.a>=cutoff;if(ain)out.push(a);if(ain!==bin){const q=(cutoff-a.a)/(b.a-a.a);out.push({x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,a:cutoff,edge:true});}}return out;};
 const add=(tri)=>{
  const polygon=clipped(tri);if(polygon.length<3)return;
  for(let i=1;i+1<polygon.length;i++){const a=polygon[0],b=polygon[i],c=polygon[i+1];output(front,pos(a),pos(c),pos(b),[uv(a),uv(c),uv(b)]);output(back,pos(a,true),pos(b,true),pos(c,true),[uv(a),uv(b),uv(c)]);}
  const crossing=polygon.filter(p=>p.edge);if(crossing.length!==2)return;
  const [a,b]=crossing,af=pos(a),bf=pos(b),ab=pos(a,true),bb=pos(b,true),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  let gx=alpha(mid.x+1,mid.y)-alpha(mid.x-1,mid.y),gy=alpha(mid.x,mid.y+1)-alpha(mid.x,mid.y-1);
  if(Math.hypot(gx,gy)<1e-5){gx=mx/mass-mid.x;gy=my/mass-mid.y;}
  const outside=[-gx,gy,0],normal=triangle(af,bf,bb,[uv(a),uv(b),uv(b)]).slice(3,6),reverse=normal.reduce((s,v,k)=>s+v*outside[k],0)<0;
  if(reverse){output(walls,af,bb,bf,[uv(a),uv(b),uv(b)]);output(walls,af,ab,bb,[uv(a),uv(a),uv(b)]);}
  else{output(walls,af,bf,bb,[uv(a),uv(b),uv(b)]);output(walls,af,bb,ab,[uv(a),uv(b),uv(a)]);}
  boundarySegments++;
 };
 for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){
  const v=(xx,yy)=>{const px=xx/steps*w,py=yy/steps*h;return {x:px,y:py,a:alpha(px,py)};};
  const a=v(x,y),b=v(x+1,y),c=v(x+1,y+1),d=v(x,y+1);add([a,b,c]);add([a,c,d]);
 }
 const meshes=[{key:'front',mask:true,ear:false,data:new Float32Array(front)},{key:6,mask:true,ear:false,data:new Float32Array(back)},{key:'front',mask:false,ear:false,data:new Float32Array(walls)}];
 if(!front.length||!walls.length)throw Error('异形轮廓无法生成封闭模型');
 let radius=0;for(const m of meshes)for(let i=0;i<m.data.length;i+=8)radius=Math.max(radius,Math.hypot(m.data[i],m.data[i+1],m.data[i+2]));
 // Conservative rotation-invariant sphere bound, including C's <=1.14 local
 // stretch, plus 8% padding. This is renderer padding, not an object zoom.
 const boundRadius=radius*1.14,displayScale=Math.max(1.2,4.725*boundRadius/Math.sqrt(16-boundRadius*boundRadius)*1.08);
 const contentScale=Math.min(1,.65/Math.max((r-l)/w,(b-t)/h));
 return {meshes,displayScale,contentScale,metadata:{kind:'source-alpha-bulging-extrusion',sourceSize:[w,h],sourceBounds:[l,t,r,b],contentScale,depth,vertices:meshes.reduce((n,m)=>n+m.data.length/8,0),boundarySegments,radius,paddingScale:displayScale,frontRegistration:'full-source-canvas',boundary:'Inferred depth/back, supplied silhouette retained; not original 3D reconstruction.'}};
}
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(gl,vs,fs){const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,vs),f=shader(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
function imagePixels(image){const w=image.naturalWidth??image.width,h=image.naturalHeight??image.height;if(!w||!h)throw Error('3D 素材尚未加载');const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return {width:w,height:h,data:ctx.getImageData(0,0,w,h).data};}
// Preserve alpha and complete-canvas registration. RGB is bled from opaque
// neighbours before raw texture upload, so invisible source RGB (e.g. old
// black guide lines) cannot become a dark material on the extrusion walls.
export function buildFullTexturePixels(source){
 const {width:w,height:h,data}=source,n=w*h,pixels=new Uint8ClampedArray(data),nearest=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0,max=0;
 for(let i=0;i<n;i++)max=Math.max(max,data[i*4+3]);if(!max)throw Error('主题图片完全透明');
 const seed=Math.max(1,Math.min(230,max*.9));
 for(let i=0;i<n;i++)if(data[i*4+3]>=seed){nearest[i]=i;queue[tail++]=i;}
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(j>=0&&nearest[j]<0){nearest[j]=nearest[i];queue[tail++]=j;}}
 for(let i=0;i<n;i++){const a=data[i*4+3]/255,k=nearest[i]*4;for(let c=0;c<3;c++)pixels[i*4+c]=Math.round(data[i*4+c]*a+data[k+c]*(1-a));}
 const size=256,out=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sx=clamp((x+.5)/size*w-.5,0,w-1),sy=clamp((1-(y+.5)/size)*h-.5,0,h-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0;
  for(let c=0;c<4;c++)out[(y*size+x)*4+c]=Math.round((pixels[(y0*w+x0)*4+c]*(1-fx)+pixels[(y0*w+x1)*4+c]*fx)*(1-fy)+(pixels[(y1*w+x0)*4+c]*(1-fx)+pixels[(y1*w+x1)*4+c]*fx)*fy);
 }
 return {width:size,height:size,data:out};
}

// Only inferred plane/lamp walls use this material. The supplied front/back
// art retains its actual dark outline, alpha, palette and original lighting.
// Extend nearby opaque interior pigment to the wall instead of stretching the
// 1px outline through the entire solid's depth. Four-neighbour propagation is
// deterministic and keeps local green/cream or gold/blue regions distinct.
export function buildSoftWallTexture(source){
 const floor=.32,neutral=[218,224,202];
 const {width:w,height:h,data}=source,n=w*h;if(data?.length!==n*4)throw Error('侧壁素材像素无效');
 const dist=new Uint16Array(n),nearest=new Int32Array(n).fill(-1),queue=new Int32Array(n);let head=0,tail=0;
 const luma=i=>(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2])/255;
 for(let i=0;i<n;i++)dist[i]=data[i*4+3]>=32?w+h:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(dist[i])dist[i]=Math.min(dist[i],x?dist[i-1]+1:1,y?dist[i-w]+1:1);}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(dist[i])dist[i]=Math.min(dist[i],x+1<w?dist[i+1]+1:1,y+1<h?dist[i+w]+1:1);}
 for(let i=0;i<n;i++)if(data[i*4+3]>=180&&dist[i]>=3&&luma(i)>=floor){nearest[i]=i;queue[tail++]=i;}
 // Narrow, dark, or translucent art may lack the bright interior used by
 // the plane. Use its own pigments in that case rather than tinting the wall black.
 let fallback=false;
 if(!tail){
  fallback=true;
  let maxAlpha=0;
  for(let i=3;i<data.length;i+=4)maxAlpha=Math.max(maxAlpha,data[i]);
  if(!maxAlpha)throw Error('异形轮廓完全透明');
  const cutoff=Math.max(1,Math.ceil(maxAlpha*.65));
  for(let i=0;i<n;i++)if(data[i*4+3]>=cutoff){nearest[i]=i;queue[tail++]=i;}
 }
 const seedCount=tail;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(j>=0&&nearest[j]<0){nearest[j]=nearest[i];queue[tail++]=j;}}
 const pixels=new Uint8ClampedArray(n*4);
 for(let i=0;i<n;i++){const k=nearest[i]*4;for(let c=0;c<3;c++)pixels[i*4+c]=Math.round(data[k+c]*.94+neutral[c]*.06);pixels[i*4+3]=255;}
 const texture=buildFullTexturePixels({width:w,height:h,data:pixels});
 return {...texture,metadata:{method:'nearest-visible-interior-pigment',seedCount,fallback,minInteriorDistance:3,minSeedLuma:floor,neutralMix:.06,frontAndBackModified:false,wallLightingFloor:.92}};
}
const MODEL_VS=`attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat3 rotation;uniform mat3 previousRotation;uniform vec3 stretch;uniform float smear;uniform float paddingScale;varying vec3 lightNormal;varying vec2 texUV;void main(){vec3 p0=position*stretch;float lag=smear*smoothstep(.25,.64,length(position));vec3 p=mix(rotation*p0,previousRotation*p0,lag);vec3 n=normalize(normal/stretch);lightNormal=normalize(mix(rotation*n,previousRotation*n,lag));float d=4.0-p.z;gl_Position=vec4(p.xy*4.725/paddingScale,1.020202*d-.2020202,d);texUV=uv;}`;
const MODEL_FS=`precision mediump float;uniform sampler2D faceImage;uniform float ear;uniform float wireframe;uniform float mask;uniform float softWall;uniform float alphaCutoff;varying vec3 lightNormal;varying vec2 texUV;void main(){vec3 n=normalize(lightNormal);vec4 tex=texture2D(faceImage,texUV);if(mask>.5&&tex.a<alphaCutoff)discard;vec3 col=tex.rgb;if(ear>.5){float inner=(1.0-smoothstep(.18,.43,abs(texUV.x-.5)))*smoothstep(.10,.35,texUV.y);inner*=1.0-smoothstep(.72,.98,texUV.y);col=mix(vec3(.72,.25,.09),vec3(.96,.83,.65),inner);if(n.z<.1)col=mix(col,vec3(.79,.31,.1),.7);}float diffuse=max(0.0,dot(n,normalize(vec3(-.35,.55,1.0))));float shade=.80+.20*diffuse;if(softWall>.5)shade=.92+.08*diffuse;float spec=pow(max(0.0,dot(n,normalize(vec3(-.2,.4,1.0)))),24.0)*.025;col=col*shade+spec;if(wireframe>.5)col=vec3(.21,.65,.84);gl_FragColor=vec4(col,mask>.5?tex.a:1.0);}`;
const QUAD_VS=`attribute vec2 position;varying vec2 texUV;void main(){texUV=position*.5+.5;gl_Position=vec4(position,0.0,1.0);}`;
const ACCUM_FS=`precision mediump float;varying vec2 texUV;uniform sampler2D source;uniform float weight;void main(){vec4 c=texture2D(source,texUV);gl_FragColor=vec4(c.rgb*c.a,c.a)*weight;}`;
const FINAL_FS=`precision mediump float;varying vec2 texUV;uniform sampler2D source;void main(){vec4 c=texture2D(source,texUV);gl_FragColor=c.a>.00001?vec4(c.rgb/c.a,c.a):vec4(0.0);}`;

export class Proxy3DRenderer{
 constructor(images,{size=320}={}){
  for(const key of ['front',1,2,3,4,5,6])if(!images[key])throw Error('缺少 3D 骰子贴图 '+key);
  const source=imagePixels(images.front);
  let maxAlpha=0;
  for(let i=3;i<source.data.length;i+=4)maxAlpha=Math.max(maxAlpha,source.data[i]);
  if(!maxAlpha)throw Error('异形轮廓完全透明');
  const cutoff=Math.max(1,Math.min(24,Math.ceil(maxAlpha*.65)));
  let built;
  try{built=buildSilhouetteGeometry(source,{cutoff});}
  catch(error){
   if(error.message!=='异形轮廓无法生成封闭模型')throw error;
   built=buildSilhouetteGeometry(source,{steps:Math.max(160,source.width,source.height),cutoff:Math.min(cutoff,8)});
  }
  const wall=buildSoftWallTexture(source);
  this.alphaCutoff=Math.min(.04,maxAlpha/510);
  if(!Number.isInteger(size)||size<64||size>1024)throw Error('3D 画布尺寸无效');
  this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=size;this.size=size;this.disposed=false;this.lost=false;
  const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('当前浏览器无法创建 3D 画布');
  this.canvas.addEventListener('webglcontextlost',event=>{if(!this.disposed){event.preventDefault();this.lost=true;}});
  try{
  this.modelProgram=program(gl,MODEL_VS,MODEL_FS);this.accumProgram=program(gl,QUAD_VS,ACCUM_FS);this.finalProgram=program(gl,QUAD_VS,FINAL_FS);
  this.uniforms=Object.fromEntries(['rotation','previousRotation','stretch','smear','ear','wireframe','mask','softWall','paddingScale','faceImage','alphaCutoff'].map(n=>[n,gl.getUniformLocation(this.modelProgram,n)]));
  this.attributes=[['position',3,0],['normal',3,12],['uv',2,24]].map(([name,count,offset])=>({location:gl.getAttribLocation(this.modelProgram,name),count,offset}));
  this.displayScale=built.displayScale;this.contentScale=built.contentScale;this.metadata={...built.metadata,wallMaterial:wall.metadata};
  this.meshes=built.meshes.map(mesh=>{const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.data,gl.STATIC_DRAW);return {...mesh,buffer,count:mesh.data.length/8};});
  this.textures={};
  for(const key of ['front',1,2,3,4,5,6])this.textures[key]=this.texture(buildFullTexturePixels(key==='front'?source:imagePixels(images[key])));
  this.textures.wall=this.texture(wall);
  this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  this.sample=this.target(true);this.accum=this.target(false);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }catch(error){this.dispose();throw error;}
 }
 texture({width,height,data}){
  const gl=this.gl,texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
 }
 target(depth){const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.size,this.size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);let renderbuffer;if(depth){renderbuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,this.size,this.size);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,renderbuffer);}if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('3D 曝光缓冲区不完整');return {texture,framebuffer,renderbuffer};}
 fullPass(p,texture){const gl=this.gl;gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);for(const a of this.attributes)gl.disableVertexAttribArray(a.location);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,8,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(p,'source'),0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
 render(samples,{wireframe=false,frontPoint=0,softShadows=true}={}){
  if(this.disposed||this.lost)throw Error('3D 画布已关闭，请重新载入');
  if(!Array.isArray(samples)||!samples.length||samples.length>33)throw Error('3D 曝光采样无效');let weightSum=0;
  for(const s of samples){if(!s.rotation||s.rotation.length!==9||!s.rotation.every(Number.isFinite)||!Number.isFinite(s.weight??1)||(s.weight??1)<0)throw Error('3D 曝光姿态无效');weightSum+=s.weight??1;}
  if(!(weightSum>0))throw Error('3D 曝光权重为空');
  const gl=this.gl;gl.viewport(0,0,this.size,this.size);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.bindFramebuffer(gl.FRAMEBUFFER,this.accum.framebuffer);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT);
  for(const sample of samples){
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.sample.framebuffer);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.modelProgram);
   gl.uniformMatrix3fv(this.uniforms.rotation,false,new Float32Array(sample.rotation));gl.uniformMatrix3fv(this.uniforms.previousRotation,false,new Float32Array(sample.previousRotation??sample.rotation));gl.uniform3fv(this.uniforms.stretch,new Float32Array(sample.stretch??[1,1,1]));gl.uniform1f(this.uniforms.smear,clamp(sample.smear??0));gl.uniform1f(this.uniforms.paddingScale,this.displayScale);gl.uniform1f(this.uniforms.wireframe,wireframe?1:0);gl.uniform1i(this.uniforms.faceImage,0);
   gl.uniform1f(this.uniforms.alphaCutoff,this.alphaCutoff);
   for(const mesh of this.meshes){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(const a of this.attributes){gl.enableVertexAttribArray(a.location);gl.vertexAttribPointer(a.location,a.count,gl.FLOAT,false,32,a.offset);}const soft=Boolean(softShadows&&!mesh.mask);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,soft?this.textures.wall:(this.textures[mesh.key==='front'&&frontPoint?frontPoint:mesh.key]??this.textures.front));gl.uniform1f(this.uniforms.ear,mesh.ear?1:0);gl.uniform1f(this.uniforms.mask,mesh.mask?1:0);gl.uniform1f(this.uniforms.softWall,soft?1:0);gl.drawArrays(wireframe?gl.LINES:gl.TRIANGLES,0,mesh.count);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.accum.framebuffer);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);gl.useProgram(this.accumProgram);gl.uniform1f(gl.getUniformLocation(this.accumProgram,'weight'),(sample.weight??1)/weightSum);this.fullPass(this.accumProgram,this.sample.texture);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clear(gl.COLOR_BUFFER_BIT);this.fullPass(this.finalProgram,this.accum.texture);gl.flush();return this.canvas;
 }
 dispose(){
  if(this.disposed)return;
  this.disposed=true;
  const gl=this.gl;
  for(const mesh of this.meshes||[])gl.deleteBuffer(mesh.buffer);
  if(this.quad)gl.deleteBuffer(this.quad);
  for(const texture of Object.values(this.textures||{}))gl.deleteTexture(texture);
  for(const target of [this.sample,this.accum])if(target){
   gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);
   if(target.renderbuffer)gl.deleteRenderbuffer(target.renderbuffer);
  }
  for(const program of [this.modelProgram,this.accumProgram,this.finalProgram])if(program)gl.deleteProgram(program);
  this.canvas.width=this.canvas.height=1;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
 }
}
