// Keep native VAP unpacking on the GPU. Source scaling and the final alpha
// downsample still use the same Canvas operations as the pixel-based path.
const vertexSource=`attribute vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}`;
const fragmentSource=`precision highp float;
uniform sampler2D rgbTexture;
uniform sampler2D alphaTexture;
uniform sampler2D alphaLookup;
uniform vec2 size;
uniform float sourcePremultiplied;
uniform float outputPremultiplied;
void main(){
  vec2 pixel=vec2(mod(floor(gl_FragCoord.x),size.x),size.y-1.0-floor(gl_FragCoord.y));
  vec2 uv=(pixel+0.5)/size;
  float original=floor(texture2D(alphaTexture,uv).r*255.0+0.5);
  float alpha=floor(texture2D(alphaLookup,vec2((original+0.5)/256.0,uv.y)).r*255.0+0.5);
  if(gl_FragCoord.x>=size.x){gl_FragColor=vec4(vec3(alpha)/255.0,1.0);return;}
  vec3 rgb=floor(texture2D(rgbTexture,uv).rgb*255.0+0.5);
  if(sourcePremultiplied>0.5){
    // Division may compile to an approximate reciprocal and put exact .5
    // byte ties slightly below the tie. Non-ties are at least 1/(2*255)
    // away, so this smaller correction retains the CPU Math.round result.
    rgb=original>0.0?min(vec3(255.0),floor(rgb*255.0/original+0.5001)):vec3(0.0);
  }
  if(alpha==0.0){rgb=vec3(0.0);}
  else if(outputPremultiplied>0.5&&alpha<255.0){rgb=floor(rgb*alpha/255.0+0.5);}
  gl_FragColor=vec4(rgb/255.0,1.0);
}`;

function maskRows(height,mask){
  const data=new Uint8Array(256*height),clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=(low,high,value)=>{const t=clamp((value-low)/(high-low));return t*t*(3-2*t);};
  for(let y=0;y<height;y++){
    const p=height===1?.5:y/(height-1),weight=mask?.enabled?smooth(mask.topStart,mask.topEnd,p)*(1-smooth(mask.bottomStart,mask.bottomEnd,p)):1;
    for(let a=0;a<256;a++)data[y*256+a]=Math.round(a*weight);
  }
  return data;
}

/** Null means unsupported; draw failures are recoverable with the CPU path. */
export function createNativeVapPlanes({width,height,sourceVapConfig,verticalMask,videoOffsetY=0,rgbAlphaMode='straight'}={}){
  const info=sourceVapConfig?.info;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>2048||height>2048||!info||!Number.isFinite(info.w)||!Number.isFinite(info.h)||info.w<=0||info.h<=0)return null;
  if(!Number.isFinite(videoOffsetY)||Math.abs(videoOffsetY)>1||!['straight','premultiplied'].includes(rgbAlphaMode))return null;
  const frames=[info.rgbFrame,info.aFrame];
  if(frames.some(rect=>!Array.isArray(rect)||rect.length!==4||rect.some(v=>!Number.isFinite(v))||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0))return null;
  if(verticalMask?.enabled&&(![verticalMask.topStart,verticalMask.topEnd,verticalMask.bottomStart,verticalMask.bottomEnd].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!(verticalMask.topStart<verticalMask.topEnd&&verticalMask.topEnd<=verticalMask.bottomStart&&verticalMask.bottomStart<verticalMask.bottomEnd)))return null;
  let rgb,alpha,target,gl,program,buffer,disposed=false,lost=false;
  const canvases=[],textures=[],shaders=[];
  const onLost=()=>{lost=true;};
  function dispose(){
    if(disposed)return;disposed=true;
    target?.removeEventListener?.('webglcontextlost',onLost);
    if(gl){
      try{for(const texture of textures)gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);}catch(ignored){}
      // This context belongs only to this pass, never to the editor/player.
      // Explicit release prevents abandoned hardware contexts accumulating
      // during bitrate retries while the browser waits for garbage collection.
      try{gl.getExtension?.('WEBGL_lose_context')?.loseContext();}catch(ignored){}
    }
    for(const canvas of canvases)canvas.width=canvas.height=1;
    textures.length=shaders.length=canvases.length=0;rgb=alpha=target=gl=program=buffer=null;
  }
  function canvas(w,h){
    const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
    canvases.push(c);return c;
  }
  function surface(){
    // Match the established unpacker's CPU Canvas resampler. GPU-backed 2D
    // scaling changes fractional edge coverage before the alpha math, even
    // when both contexts request high-quality image smoothing.
    const c=canvas(width,height),ctx=c.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('Native VAP Canvas unavailable');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';return {canvas:c,ctx};
  }
  try{
    rgb=surface();alpha=surface();target=canvas(width*2,height);
    gl=target.getContext('webgl',{alpha:false,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('Native VAP WebGL unavailable');
    target.addEventListener?.('webglcontextlost',onLost);
    const textureSide=gl.getParameter(gl.MAX_TEXTURE_SIZE),renderSide=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS),precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);
    if(!precision||precision.precision<23||Math.max(width*2,height)>Math.min(textureSide,renderSide)||viewport[0]<width*2||viewport[1]<height||gl.drawingBufferWidth!==width*2||gl.drawingBufferHeight!==height)throw new Error('Native VAP WebGL limits');
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
      const shader=gl.createShader(kind);if(!shader)throw new Error('Native VAP shader unavailable');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Native VAP shader compilation failed');
    }
    program=gl.createProgram();if(!program)throw new Error('Native VAP program unavailable');
    for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Native VAP shader link failed');
    gl.useProgram(program);buffer=gl.createBuffer();if(!buffer)throw new Error('Native VAP buffer unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');if(position<0)throw new Error('Native VAP position unavailable');
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.DEPTH_TEST);gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0,0,width*2,height);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    for(let unit=0;unit<3;unit++){
      const texture=gl.createTexture();if(!texture)throw new Error('Native VAP texture unavailable');textures.push(texture);gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);
      for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
      if(unit<2)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,256,height,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,maskRows(height,verticalMask));
    }
    gl.uniform1i(gl.getUniformLocation(program,'rgbTexture'),0);gl.uniform1i(gl.getUniformLocation(program,'alphaTexture'),1);gl.uniform1i(gl.getUniformLocation(program,'alphaLookup'),2);
    gl.uniform2f(gl.getUniformLocation(program,'size'),width,height);gl.uniform1f(gl.getUniformLocation(program,'sourcePremultiplied'),sourceVapConfig.funToolkit?.rgbAlphaMode!=='straight'?1:0);gl.uniform1f(gl.getUniformLocation(program,'outputPremultiplied'),rgbAlphaMode==='premultiplied'?1:0);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Native VAP WebGL initialization failed');
    const scale=Math.min(width/info.w,height/info.h),w=info.w*scale,h=info.h*scale,content=[(width-w)/2,(height-h)/2+videoOffsetY*height,w,h];
    return {
      draw(source,packedCtx,layout){
        if(disposed||lost||gl.isContextLost())throw new Error('Native VAP GPU context unavailable');
        rgb.ctx.clearRect(0,0,width,height);alpha.ctx.clearRect(0,0,width,height);
        rgb.ctx.drawImage(source,...info.rgbFrame,...content);alpha.ctx.drawImage(source,...info.aFrame,...content);
        for(const [unit,canvas] of [[0,rgb.canvas],[1,alpha.canvas]]){
          gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures[unit]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        if(lost||gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw new Error('Native VAP GPU frame failed');
        // Alpha stays full resolution until this existing Canvas downsample.
        packedCtx.save();
        try{packedCtx.globalAlpha=1;packedCtx.globalCompositeOperation='source-over';packedCtx.drawImage(target,0,0,width,height,...layout.rgbFrame);packedCtx.drawImage(target,width,0,width,height,...layout.aFrame);}
        finally{packedCtx.restore();}
      },
      dispose
    };
  }catch(ignored){dispose();return null;}
}
