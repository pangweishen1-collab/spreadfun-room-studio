/* Thin lifecycle adapter around the unmodified Tencent VAP Web player. */
(() => {
  'use strict';
  let player=null, active=location.hash==='#vap-tools', requested=false, version=0, sdkPromise, playerState='empty';
  const host=()=>document.querySelector('#vapResultPlayer');
  const button=()=>document.querySelector('#vapResultPlay');
  const chinese=()=>document.documentElement.lang.startsWith('zh');
  function dispose(value){try{value?.destroy();}catch(ignored){}}
  function sync(){
    const canvas=host()?.querySelector('canvas');if(canvas){canvas.style.maxWidth='100%';canvas.style.objectFit='contain';canvas.setAttribute('aria-label',chinese()?'腾讯 VAP 播放器效果':'Tencent VAP playback');}
    const b=button();if(b){b.disabled=!player||playerState!=='ready';b.textContent=chinese()?(requested?'暂停透明播放':'透明播放'):(requested?'Pause preview':'Play transparent');b.setAttribute('aria-pressed',String(requested));}
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
  function destroy(){reset(++version);}
  function loadSDK(){
    if(window.Vap?.default)return Promise.resolve(window.Vap.default);
    if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/tencent-vap/vap.min.js';const failed=()=>{script.remove();sdkPromise=null;reject(new Error('VAP player unavailable'));};script.onload=()=>window.Vap?.default?resolve(window.Vap.default):failed();script.onerror=failed;document.head.append(script);});
    return sdkPromise;
  }
  async function mount({url,config}={}){
    const token=++version;if(!reset(token))return;const el=host();if(!el)return;
    if(!setState('loading',token))return;sync();let candidate=null,failed=false;
    function fail(error){
      if(token!==version||failed)return;failed=true;
      el.dataset.playerError=String(error?.message||error?.target?.error?.message||error?.type||'VAP preview failed');
      requested=false;if(player===candidate)player=null;dispose(candidate);
      if(token!==version)return;el.replaceChildren();delete el.dataset.alphaMode;
      if(setState('error',token))sync();
    }
    try{
      const Vap=await loadSDK();if(token!==version)return;
      // Native buffer dimensions preserve the output ratio; CSS fits it beside the editing canvas.
      const width=config.info.w,height=config.info.h;
      candidate=new Vap();
      // New feather exports declare their RGB convention. Unmarked legacy files
      // remain straight; choose the first WebGL context before the SDK reuses it.
      const premultiplied=config.funToolkit?.rgbAlphaMode==='premultiplied';
      const canvas=document.createElement('canvas'),attributes={alpha:true,premultipliedAlpha:premultiplied};
      candidate.canvas=canvas;
      const gl=canvas.getContext('webgl',attributes)||canvas.getContext('experimental-webgl',attributes),actual=gl?.getContextAttributes?.();
      if(!actual||actual.alpha!==true||actual.premultipliedAlpha!==premultiplied)throw new Error('Transparent WebGL context unavailable');
      if(token!==version||failed){dispose(candidate);if(token===version&&failed){el.replaceChildren();sync();}return;}
      player=candidate;
      el.dataset.sdk='Tencent VAP Web 1.0.5';
      el.dataset.alphaMode=premultiplied?'premultiplied':'straight';
      // initVideo creates the native video and clears SDK listeners; shader/frame startup follows asynchronously.
      candidate.play({container:el,src:url,config,width,height,fps:config.info.fps,mute:true,loop:true,accurate:true,onLoadError:fail});
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
  document.addEventListener('vap:result',event=>mount(event.detail));
  document.addEventListener('vap:result-invalidated',destroy);
  document.addEventListener('vap:active',event=>{active=event.detail.active;if(!active&&player){requested=false;player.pause();}sync();});
  document.addEventListener('click',event=>{if(event.target.closest?.('#vapResultPlay'))toggle();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&player){requested=false;player.pause();sync();}});
  window.addEventListener('pagehide',destroy);
  window.VapResultPlayer={mount,destroy,setLanguage:sync};
})();
