// Procedural rounded cube; only six flat face images enter this renderer.
const faces = [
  {point:1,n:[0,0,1],u:[1,0,0],v:[0,1,0]},
  {point:6,n:[0,0,-1],u:[-1,0,0],v:[0,1,0]},
  {point:3,n:[1,0,0],u:[0,0,-1],v:[0,1,0]},
  {point:4,n:[-1,0,0],u:[0,0,1],v:[0,1,0]},
  {point:2,n:[0,1,0],u:[1,0,0],v:[0,0,-1]},
  {point:5,n:[0,-1,0],u:[1,0,0],v:[0,0,1]},
];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const CUBE_MOTION=Object.freeze({rollEnd:.72,bounceEnd:.64,settleStart:.72,settleDuration:.10,turns:Object.freeze([3,2,0]),zoomEnd:.60,zoomPeak:1.45});
const multiply=(a,b)=>Array.from({length:9},(_,i)=>{const c=Math.floor(i/3),r=i%3;return a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];});
const rx=a=>[1,0,0,0,Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a)];
const ry=a=>[Math.cos(a),0,-Math.sin(a),0,1,0,Math.sin(a),0,Math.cos(a)];
const rz=a=>[Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a),0,0,0,1];

function roundedVertex(face,u,v) {
  const p=face.n.map((n,k)=>n*.5+face.u[k]*(u-.5)+face.v[k]*(v-.5));
  const core=p.map(value=>clamp(value,-.405,.405)),delta=p.map((value,k)=>value-core[k]);
  const length=Math.hypot(...delta),normal=delta.map(value=>value/length);
  return [...core.map((value,k)=>value+normal[k]*.095),...normal,u,v];
}
function shader(gl,type,source) {
  const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(value));return value;
}
export class CubeRoll {
  constructor(images, options={}) {
    this.sourceSize=options.sourceSize||200;
    this.crop=options.crop||[36,36,128,128];
    this.cropOffset=options.cropOffset||[0,0];
    this.motion={...CUBE_MOTION,...options.motion};
    this.normalizedViewport=Boolean(options.normalizedViewport);
    const bodyColor=options.bodyColor||[.40,.68,.12];
    this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=400;
    this.lost=false;this.disposed=false;
    this.canvas.addEventListener('webglcontextlost',event=>{if(this.disposed)return;event.preventDefault();this.lost=true;options.onContextLost?.();});
    const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    if(!gl)throw Error('当前浏览器无法创建三维画布');
    const p=this.program=gl.createProgram();
    const bodyFactor=this.normalizedViewport?1.28:2*this.crop[2]/this.sourceSize;
    gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat3 rotation;varying vec3 lightNormal;varying vec2 texUV;void main(){vec3 p=rotation*position;float perspective=3.5/(4.0-p.z);gl_Position=vec4(p.xy*perspective*${bodyFactor.toFixed(8)},-p.z*.12,1.0);lightNormal=rotation*normal;texUV=uv;}`));
    gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D faceImage;varying vec3 lightNormal;varying vec2 texUV;void main(){vec4 tex=texture2D(faceImage,texUV);vec3 body=mix(vec3(${bodyColor.map(x=>x.toFixed(8)).join(',')}),tex.rgb,tex.a);float diffuse=max(0.0,dot(normalize(lightNormal),normalize(vec3(-.35,.55,1.0))));float shade=.78+.22*diffuse;gl_FragColor=vec4(body*shade,1.0);}`));
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);this.rotation=gl.getUniformLocation(p,'rotation');gl.uniform1i(gl.getUniformLocation(p,'faceImage'),0);
    this.buffers=faces.map(face=>{
      const data=[],steps=18;
      for(let y=0;y<steps;y++)for(let x=0;x<steps;x++) {
        for(const [a,b] of [[x,y],[x+1,y],[x+1,y+1],[x,y],[x+1,y+1],[x,y+1]])data.push(...roundedVertex(face,a/steps,b/steps));
      }
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
      // Same crop on every face: the source's 36px transparent margin is not UV space.
      const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=256;
      if(options.textures)textureCanvas.getContext('2d').drawImage(options.textures[face.point],0,0,256,256);
      else textureCanvas.getContext('2d').drawImage(images[face.point],...this.crop,0,0,256,256);
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureCanvas);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
      return {buffer,texture,count:data.length/8};
    });
    this.attributes=[['position',3,0],['normal',3,12],['uv',2,24]].map(([name,size,offset])=>({location:gl.getAttribLocation(p,name),size,offset}));
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(0,0,0,0);
  }
  draw(ctx,images,{time,point=1,x=0,y=0,size=200}) {
    // Blend only after the cube is fully front-facing, avoiding double outlines.
    const motion=this.motion,t=((time%2)+2)%2,settle=smooth((t-motion.settleStart)/motion.settleDuration),progress=smooth(t/motion.rollEnd);
    const f=faces.find(face=>face.point===point);
    const base=[f.u[0],f.v[0],f.n[0],f.u[1],f.v[1],f.n[1],f.u[2],f.v[2],f.n[2]];
    const [turnX,turnY,turnZ]=motion.turns;
    const rotation=multiply(multiply(multiply(rz(turnZ*2*Math.PI*progress),ry(turnY*2*Math.PI*progress)),rx(turnX*2*Math.PI*progress)),base);
    const gl=this.gl;gl.viewport(0,0,400,400);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniformMatrix3fv(this.rotation,false,new Float32Array(rotation));
    for(const mesh of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      for(const a of this.attributes){gl.enableVertexAttribArray(a.location);gl.vertexAttribPointer(a.location,a.size,gl.FLOAT,false,32,a.offset);}
      gl.bindTexture(gl.TEXTURE_2D,mesh.texture);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    }
    // Match the reference's fast grow/shrink pulse; be back at 1 before landing.
    const zoomTime=clamp(t/motion.zoomEnd),zoom=1+(motion.zoomPeak-1)*(1-Math.abs(2*zoomTime-1));
    const drawSize=size*zoom,bounce=Math.sin(Math.min(t/motion.bounceEnd,1)*Math.PI)**2*drawSize*.065;
    const modelAlpha=smooth(t/.08)*(1-settle);
    ctx.save();ctx.globalAlpha=modelAlpha*.15;ctx.fillStyle='#214d23';ctx.beginPath();ctx.ellipse(x+this.cropOffset[0]*size/this.sourceSize,y+drawSize*.33+this.cropOffset[1]*size/this.sourceSize,drawSize*.27,drawSize*.045,0,0,Math.PI*2);ctx.fill();ctx.restore();
    const renderSize=this.normalizedViewport?drawSize*(this.crop[2]/this.sourceSize)/.64:drawSize;
    ctx.save();ctx.globalAlpha=modelAlpha;ctx.drawImage(this.canvas,x-renderSize/2+this.cropOffset[0]*size/this.sourceSize,y-renderSize/2-bounce+this.cropOffset[1]*size/this.sourceSize,renderSize,renderSize);ctx.restore();
    if(modelAlpha<1){ctx.save();ctx.globalAlpha=1-modelAlpha;ctx.drawImage(images[point],x-size/2,y-size/2,size,size);ctx.restore();}
  }
  dispose(){if(this.disposed)return;this.disposed=true;const gl=this.gl;for(const item of this.buffers){gl.deleteBuffer(item.buffer);gl.deleteTexture(item.texture);}gl.deleteProgram(this.program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
