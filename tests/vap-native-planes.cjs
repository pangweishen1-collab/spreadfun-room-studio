const assert=require('node:assert/strict');

(async()=>{
  const {createNativeVapPlanes}=await import('../vap-native-planes.mjs');
  // Cover all possible source RGB/alpha bytes. Both rounded division and an
  // approximate float32 reciprocal must preserve the established tie rule.
  for(let alpha=1;alpha<256;alpha++)for(let rgb=0;rgb<256;rgb++){
    const expected=Math.min(255,Math.round(rgb*255/alpha));
    for(const divided of [Math.fround(Math.fround(rgb*255)/alpha),Math.fround(Math.fround(rgb*255)*Math.fround(1/alpha))])assert.equal(Math.min(255,Math.floor(divided+.5001)),expected);
    const twice=rgb*510,remainder=twice%alpha;
    if(remainder!==0)assert(Math.min(remainder,alpha-remainder)/(2*alpha)>.0001,'the correction cannot move a non-tie over a half-byte boundary');
  }
  const originalCanvas=global.OffscreenCanvas;
  const events=[],canvases=[],uniforms=new Map();let behavior={};
  function fakeGl(canvas){
    const gl={},keys=['MAX_TEXTURE_SIZE','MAX_RENDERBUFFER_SIZE','MAX_VIEWPORT_DIMS','FRAGMENT_SHADER','HIGH_FLOAT','VERTEX_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','FLOAT','BLEND','DITHER','DEPTH_TEST','SCISSOR_TEST','UNPACK_ALIGNMENT','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','UNPACK_COLORSPACE_CONVERSION_WEBGL','TEXTURE_2D','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','NEAREST','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','RGBA','UNSIGNED_BYTE','LUMINANCE','TRIANGLE_STRIP'];
    keys.forEach((k,i)=>gl[k]=i+1);gl.TEXTURE0=100;gl.RENDERER=0x9246;gl.NONE=gl.NO_ERROR=0;
    gl.drawingBufferWidth=canvas.width;gl.drawingBufferHeight=canvas.height;
    gl.getParameter=k=>k===gl.RENDERER?'ANGLE (Google, SwiftShader Device)':k===gl.MAX_VIEWPORT_DIMS?[behavior.limit||4096,behavior.limit||4096]:behavior.limit||4096;
    gl.getShaderPrecisionFormat=()=>({precision:behavior.precision??23});
    for(const method of ['createShader','createProgram','createBuffer','createTexture'])gl[method]=()=>({type:method,id:events.length});
    gl.getShaderParameter=()=>behavior.compile!==false;gl.getProgramParameter=()=>behavior.link!==false;gl.getAttribLocation=()=>0;gl.getUniformLocation=(_,name)=>name;
    for(const method of ['uniform1i','uniform1f','uniform2f'])gl[method]=(name,...values)=>uniforms.set(name,values);
    gl.getError=()=>behavior.error||0;gl.isContextLost=()=>!!behavior.lost;
    gl.getExtension=name=>{
      if(name==='WEBGL_lose_context')return {loseContext:()=>events.push({method:'loseContext'})};
      if(name==='WEBGL_debug_renderer_info'&&behavior.software)return {UNMASKED_RENDERER_WEBGL:gl.RENDERER};
      return null;
    };
    for(const method of ['deleteTexture','deleteBuffer','deleteProgram','deleteShader','shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','disable','viewport','pixelStorei','activeTexture','bindTexture','texParameteri','texImage2D','drawArrays'])gl[method]=(...args)=>events.push({method,args});
    gl.texSubImage2D=(...args)=>{if(behavior.uploadError)throw Error('upload failed');events.push({method:'texSubImage2D',args});};
    return gl;
  }
  class Canvas{
    constructor(width,height){this.width=width;this.height=height;this.calls=[];this.listeners=new Map();canvases.push(this);}
    getContext(type,options){
      this.calls.push({type,options});
      if(type==='webgl')return behavior.unsupported?null:(this.gl=fakeGl(this));
      return this.ctx={clearRect:(...args)=>this.calls.push({method:'clearRect',args}),drawImage:(...args)=>this.calls.push({method:'drawImage',args})};
    }
    addEventListener(name,fn){this.listeners.set(name,fn);}
    removeEventListener(name){this.listeners.delete(name);}
  }
  const options={width:8,height:12,sourceVapConfig:{info:{w:4,h:4,rgbFrame:[0,0,4,4],aFrame:[4,0,2,2]}},verticalMask:{enabled:true,topStart:0,topEnd:.3,bottomStart:.7,bottomEnd:1},videoOffsetY:.25,rgbAlphaMode:'premultiplied'};
  const layout={rgbFrame:[0,0,8,12],aFrame:[8,0,4,6]};
  function reset(next={}){behavior=next;events.length=canvases.length=0;uniforms.clear();}
  try{
    global.OffscreenCanvas=Canvas;
    for(const change of [{width:0},{width:2049},{height:1.2},{videoOffsetY:2},{rgbAlphaMode:'other'},{sourceVapConfig:{}},{verticalMask:{enabled:true,topStart:.5,topEnd:.2,bottomStart:.8,bottomEnd:1}}]){
      reset();assert.equal(createNativeVapPlanes({...options,...change}),null);assert.equal(canvases.length,0);
    }
    for(const unsupported of [{unsupported:true},{software:true},{precision:16},{limit:8},{compile:false},{link:false},{error:1280}]){
      reset(unsupported);assert.equal(createNativeVapPlanes(options),null);assert(canvases.every(c=>c.width===1&&c.height===1),'failed initialization releases every partially allocated canvas');
      assert(canvases.every(c=>c.listeners.size===0));
    }
    reset();const renderer=createNativeVapPlanes(options);assert(renderer);
    assert.deepEqual(canvases.map(c=>[c.width,c.height]),[[8,12],[8,12],[16,12]]);
    assert(canvases.slice(0,2).every(c=>c.calls[0].options.willReadFrequently===true),'source resampling retains the established CPU Canvas backing');
    assert.equal(canvases[2].calls[0].options.failIfMajorPerformanceCaveat,true,'software WebGL is eligible for the CPU fallback');
    assert.equal(uniforms.get('sourcePremultiplied')[0],1);assert.equal(uniforms.get('outputPremultiplied')[0],1);
    const lut=events.find(e=>e.method==='texImage2D'&&e.args.at(-1) instanceof Uint8Array).args.at(-1);assert.equal(lut.length,256*12);
    for(let y=0;y<12;y++)for(let a=0;a<256;a++){
      const clamp=v=>Math.max(0,Math.min(1,v)),smooth=(lo,hi,p)=>{let t=clamp((p-lo)/(hi-lo));return t*t*(3-2*t);},p=y/11,w=smooth(0,.3,p)*(1-smooth(.7,1,p));
      assert.equal(lut[y*256+a],Math.round(a*w),'lookup preserves double-precision alpha rounding for every byte at every row');
    }
    const packedCalls=[],packed={save:()=>packedCalls.push('save'),restore:()=>packedCalls.push('restore'),drawImage:(...args)=>packedCalls.push(args)};
    const source={width:6,height:4};renderer.draw(source,packed,layout);
    assert.deepEqual(canvases[0].calls.find(c=>c.method==='drawImage').args,[source,0,0,4,4,0,5,8,8]);
    assert.deepEqual(canvases[1].calls.find(c=>c.method==='drawImage').args,[source,4,0,2,2,0,5,8,8]);
    assert.deepEqual(packedCalls,['save',[canvases[2],0,0,8,12,0,0,8,12],[canvases[2],8,0,8,12,8,0,4,6],'restore'],'both full-resolution planes retain the existing final Canvas scaling');
    assert.equal(events.filter(e=>e.method==='texSubImage2D').length,2);
    behavior.error=1280;assert.throws(()=>renderer.draw(source,packed,layout),/GPU frame/);behavior.error=0;
    behavior.uploadError=true;assert.throws(()=>renderer.draw(source,packed,layout),/upload failed/);behavior.uploadError=false;
    const before=packedCalls.length;canvases[2].listeners.get('webglcontextlost')();assert.throws(()=>renderer.draw(source,packed,layout),/context unavailable/);assert.equal(packedCalls.length,before,'a lost context cannot commit partial packed planes');
    renderer.dispose();renderer.dispose();assert(canvases.every(c=>c.width===1&&c.height===1));assert.equal(events.filter(e=>e.method==='deleteTexture').length,3);assert.equal(events.filter(e=>e.method==='loseContext').length,1,'only the private pass context is released, once');assert.throws(()=>renderer.draw(source,packed,layout),/unavailable/);
    reset();const straight=createNativeVapPlanes({...options,rgbAlphaMode:'straight',sourceVapConfig:{...options.sourceVapConfig,funToolkit:{rgbAlphaMode:'straight'}},verticalMask:{enabled:false}});assert(straight);assert.equal(uniforms.get('sourcePremultiplied')[0],0);assert.equal(uniforms.get('outputPremultiplied')[0],0);
    const unmasked=events.find(e=>e.method==='texImage2D'&&e.args.at(-1) instanceof Uint8Array).args.at(-1);for(let y=0;y<12;y++)for(let a=0;a<256;a++)assert.equal(unmasked[y*256+a],a);
    const failingPacked={save(){},restore(){this.restored=true;},drawImage(){throw Error('packing failed');}};assert.throws(()=>straight.draw(source,failingPacked,layout),/packing failed/);assert.equal(failingPacked.restored,true);straight.dispose();
    console.log('vap-native-planes: eligibility, bounded full-resolution planes/lookup alpha, Canvas geometry/downsample ownership, both alpha conventions, partial startup cleanup, context-loss/upload failure and idempotent disposal passed. Real GPU pixels require browser parity checks.');
  }finally{if(originalCanvas===undefined)delete global.OffscreenCanvas;else global.OffscreenCanvas=originalCanvas;}
})().catch(error=>{console.error(error);process.exitCode=1;});
