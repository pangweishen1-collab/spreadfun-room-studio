/* Thin lifecycle adapter around the unmodified Tencent VAP Web player. */
(() => {
  'use strict';
  let player=null, active=location.hash==='#vap-tools', requested=false, version=0, sdkPromise, playerState='empty', currentResult=null;
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
  function resourceBindings(config,tags={}){
    const sources=config?.src||[],bindings=Object.create(null),missing=[];
    if(!Array.isArray(sources)||sources.length>8)throw new Error('Unsupported VAP resource list');
    const defaults=config?.funToolkit?.resourceDefaults||{},seen=new Set();
    for(const source of sources){
      const tag=source?.srcTag;
      if(typeof tag!=='string'||!tag||tag.length>128||!['img','txt'].includes(source.srcType))throw new Error('Invalid VAP resource tag');
      const short=tag.replace(/^\[(.*)\]$/,'$1');
      if(seen.has(short))throw new Error('Duplicate VAP resource tag');seen.add(short);
      const binding=[tag,short,'['+short+']'].find(key=>own(tags,key));
      let value=binding!==undefined?tags[binding]:source.srcType==='txt'&&(own(defaults,tag)||own(defaults,short))?(own(defaults,tag)?defaults[tag]:defaults[short]):undefined;
      if(source.srcType==='txt'&&typeof value==='string'&&value.length<=2000)bindings[tag]=value||'\u200b';
      else if(source.srcType==='img'&&typeof value==='string'&&/^(blob:|data:image\/(?:png|jpe?g|webp);base64,)/i.test(value))bindings[tag]=value;
      else if(value===undefined||value===null||value==='')missing.push(tag);
      else throw new Error('Invalid VAP resource binding: '+tag);
    }
    return {bindings,missing};
  }
  function sdkResourceOptions(config,tags){
    const {bindings,missing}=resourceBindings(config,tags);
    // SDK resources share the options object. Bracketed aliases keep even a tag
    // named src/container from replacing player control fields.
    const copy=JSON.parse(JSON.stringify(config)),options=Object.create(null);
    // The SDK only compiles textures for bound sources. Omit empty slots from
    // its mutable playback copy; the original downloadable Key metadata stays intact.
    const skipped=new Set(missing);copy.src=(copy.src||[]).filter(source=>!skipped.has(source.srcTag));
    const visibleIds=new Set(copy.src.map(source=>String(source.srcId)));
    for(const frame of copy.frame||[])frame.obj=(frame.obj||[]).filter(object=>visibleIds.has(String(object.srcId)));
    if(!copy.src.length)copy.info.isVapx=0;
    for(const source of copy.src||[]){const original=source.srcTag,alias='['+original.replace(/^\[(.*)\]$/,'$1')+']';source.srcTag=alias;options[alias]=bindings[original];}
    return {config:copy,options};
  }
  const host=()=>document.querySelector('#vapResultPlayer');
  const button=()=>document.querySelector('#vapResultPlay');
  const chinese=()=>document.documentElement.lang.startsWith('zh');
  function dispose(value){try{value?.destroy();}catch(ignored){}}
  function sync(){
    const canvas=host()?.querySelector('canvas');if(canvas){canvas.style.maxWidth='100%';canvas.style.objectFit='contain';canvas.setAttribute('aria-label',chinese()?'腾讯 VAP 播放器效果':'Tencent VAP playback');}
    const b=button();if(b){b.disabled=!player||playerState!=='ready';const label=chinese()?(requested?'暂停透明播放':'透明播放'):(requested?'Pause preview':'Play transparent');b.textContent='';b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed',String(requested));}
  }
  function setState(next,token=version){
    if(token!==version)return false;
    const el=host();if(el)el.dataset.state=next;
    const changed=playerState!==next;playerState=next;
    if(changed)document.dispatchEvent(new CustomEvent('vap:player-state',{detail:{state:next}}));
    // A state listener may synchronously replace or invalidate this result.
    return token===version;
  }
  function reset(token){
    requested=false;const previous=player;player=null;dispose(previous);
    if(token!==version)return false;
    const el=host();if(el){el.replaceChildren();el.dataset.frames='0';delete el.dataset.sdk;delete el.dataset.alphaMode;delete el.dataset.playerError;}
    if(!setState('empty',token))return false;sync();return true;
  }
  function destroy(){currentResult=null;reset(++version);}
  function loadSDK(){
    if(window.Vap?.default)return Promise.resolve(window.Vap.default);
    if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/tencent-vap/vap.min.js';const failed=()=>{script.remove();sdkPromise=null;reject(new Error('VAP player unavailable'));};script.onload=()=>window.Vap?.default?resolve(window.Vap.default):failed();script.onerror=failed;document.head.append(script);});
    return sdkPromise;
  }
  async function mount({url,config,tags={},autoplay=true}={}){
    currentResult={url,config,tags:{...tags}};
    const token=++version;if(!reset(token))return;const el=host();if(!el)return;
    requested=autoplay&&active&&!document.hidden;
    if(!setState('loading',token))return;sync();let candidate=null,failed=false;
    function fail(error){
      if(token!==version||failed)return;failed=true;
      el.dataset.playerError=String(error?.message||error?.target?.error?.message||error?.type||'VAP preview failed');
      requested=false;if(player===candidate)player=null;dispose(candidate);
      if(token!==version)return;el.replaceChildren();delete el.dataset.alphaMode;
      if(setState('error',token))sync();
    }
    try{
      const resources=(config.src||[]).length?sdkResourceOptions(config,tags):null;
      const Vap=await loadSDK();if(token!==version)return;
      // Native buffer dimensions preserve the output ratio; CSS fits it beside the editing canvas.
      const width=config.info.w,height=config.info.h;
      candidate=new Vap();
      // Tencent's original 4px layout premultiplies RGB even without a mode marker.
      const {aFrame,videoW,videoH}=config.info,mode=config.funToolkit?.rgbAlphaMode;
      const official=width===720&&height===1560&&videoW===1088&&videoH===1568&&
        aFrame?.[0]===724&&aFrame[1]===0&&aFrame[2]===360&&aFrame[3]===780;
      const premultiplied=mode===undefined?official:mode==='premultiplied';
      const canvas=document.createElement('canvas'),attributes={alpha:true,premultipliedAlpha:premultiplied};
      candidate.canvas=canvas;
      const gl=canvas.getContext('webgl',attributes)||canvas.getContext('experimental-webgl',attributes),actual=gl?.getContextAttributes?.();
      if(!actual||actual.alpha!==true||actual.premultipliedAlpha!==premultiplied)throw new Error('Transparent WebGL context unavailable');
      if(token!==version||failed){dispose(candidate);if(token===version&&failed){el.replaceChildren();sync();}return;}
      player=candidate;
      el.dataset.sdk='Tencent VAP Web 1.0.5';
      el.dataset.alphaMode=premultiplied?'premultiplied':'straight';
      // initVideo creates the native video and clears SDK listeners; shader/frame startup follows asynchronously.
      if(resources&&typeof candidate.drawFrame==='function'){
        const original=candidate.drawFrame,zeros=new Float32Array(resources.config.src.length*9);
        candidate.drawFrame=function(...args){
          // Tencent 1.0.5 retains the preceding image_pos when a sparse frame
          // has no objects. Clear it before rendering so timed slots disappear.
          const gl=this.gl;if(gl&&this.program){const loc=gl.getUniformLocation(this.program,'image_pos');if(loc!==null)gl.uniform1fv(loc,zeros);}
          return original.apply(this,args);
        };
      }
      candidate.play({...resources?.options,container:el,src:url,config:resources?.config||config,width,height,fps:config.info.fps,mute:true,loop:true,accurate:true,onLoadError:fail});
      if(token!==version||failed){canvas.remove();if(token===version&&failed){el.replaceChildren();sync();}return;}
      candidate.on('frame',()=>{
        if(token!==version||player!==candidate||playerState==='error')return;
        el.dataset.frames=String(Number(el.dataset.frames||0)+1);
        if(!setState('ready',token)||player!==candidate)return;
        if(!requested||!active||document.hidden)candidate.pause();sync();
      });
      candidate.on('pause',()=>{if(token===version&&player===candidate){requested=false;sync();}});
      sync();
    }catch(error){fail(error);}
  }
  function toggle(){if(!player||playerState!=='ready')return;requested=!requested;if(requested&&active&&!document.hidden)player.play();else player.pause();sync();}
  function updateTags(tags){
    if(!currentResult)return Promise.resolve();
    const result=currentResult,merged={...result.tags,...tags};
    for(const source of Array.isArray(result.config?.src)?result.config.src:[]){
      const tag=source?.srcTag;if(typeof tag!=='string')continue;
      const short=tag.replace(/^\[(.*)\]$/,'$1'),aliases=[...new Set([tag,short,'['+short+']'])],key=aliases.find(alias=>own(tags,alias));
      if(key===undefined)continue;
      // New values win across calls even when callers alternate tag1/[tag1].
      // Within one update the declared srcTag keeps the usual precedence.
      for(const alias of aliases)delete merged[alias];
      Object.defineProperty(merged,tag,{value:tags[key],enumerable:true,configurable:true,writable:true});
    }
    return mount({...result,tags:merged,autoplay:requested});
  }
  document.addEventListener('vap:result',event=>mount(event.detail));
  document.addEventListener('vap:result-invalidated',destroy);
  document.addEventListener('vap:active',event=>{active=event.detail.active;if(!active){requested=false;player?.pause();}sync();});
  document.addEventListener('click',event=>{if(event.target.closest?.('#vapResultPlay'))toggle();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){requested=false;player?.pause();sync();}});
  window.addEventListener('pagehide',destroy);
  window.VapResultPlayer={mount,destroy,setLanguage:sync,getMissingTags:(config,tags)=>resourceBindings(config,tags).missing,updateTags};
})();
