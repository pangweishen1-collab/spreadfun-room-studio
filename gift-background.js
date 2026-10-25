/* Optional on-device matting. The worker and model are loaded only after remove() is called. */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript?.src||location.href);
  const MAX_SIDE=2048;
  let worker=null,active=null,serial=0;
  function report(job,event){for(const listener of job.listeners)try{listener(event)}catch(ignored){}}
  function finish(error,mask){
    if(!active)return;
    const job=active;active=null;clearTimeout(job.timer);
    if(error)job.reject(error);else job.resolve(mask);
  }
  function dispose(message='背景移除已取消，请重试。'){
    if(worker){worker.terminate();worker=null}
    finish(new Error(message));
  }
  function getWorker(){
    if(worker)return worker;
    if(typeof Worker==='undefined')throw new Error('此浏览器不支持本地抠图，请使用较新的浏览器。');
    worker=new Worker(new URL('gift-background-worker.js',base),{type:'module',name:'gift-background'});
    worker.addEventListener('message',event=>{
      const message=event.data;if(!active||message.id!==active.id)return;
      if(message.type==='progress')report(active,{phase:message.phase,progress:message.progress});
      else if(message.type==='result'){
        const {width,height,data,recoverBlack,method}=message;
        if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE
          ||!(data instanceof Uint8ClampedArray)||data.length!==width*height||typeof recoverBlack!=='boolean'
          ||!((method==='dark-matte'&&recoverBlack)||(method==='ai'&&!recoverBlack))){finish(new Error('抠图结果无效，请重试。'));return}
        finish(null,{width,height,data,recoverBlack,method});
      }else if(message.type==='error')finish(new Error(message.message||'背景移除失败，请重试。'));
    });
    worker.addEventListener('error',()=>dispose('抠图组件未能加载，请检查网络后重试。'));
    worker.addEventListener('messageerror',()=>dispose('抠图结果无法读取，请重试。'));
    return worker;
  }
  function remove(image,{onProgress}={}){
    if(active){
      if(active.image!==image)return Promise.reject(new Error('背景移除正在处理中，请稍后重试。'));
      if(typeof onProgress==='function')active.listeners.add(onProgress);
      return active.promise;
    }
    if(!Number.isInteger(image?.naturalWidth)||!Number.isInteger(image.naturalHeight)||image.naturalWidth<1||image.naturalHeight<1||image.complete===false)return Promise.reject(new Error('请先载入一张可读取的图片。'));
    const scale=Math.min(1,MAX_SIDE/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
    let pixels,target;
    try{
      target=getWorker();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('此浏览器无法读取图片像素。');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,width,height);
      pixels=context.getImageData(0,0,width,height).data;canvas.width=canvas.height=1;
    }catch(error){return Promise.reject(new Error(error.message||'图片无法读取，请重试。'))}
    let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
    const job={id:++serial,image,promise,resolve,reject,listeners:new Set(typeof onProgress==='function'?[onProgress]:[])};
    active=job;job.timer=setTimeout(()=>dispose('本地抠图耗时过长，请关闭其他占用内存的页面后重试。'),300000);
    report(job,{phase:'analyzing',progress:0});
    try{target.postMessage({type:'remove',id:job.id,width,height,data:pixels},[pixels.buffer])}
    catch(error){finish(new Error('无法启动本地抠图，请重试。'))}
    return promise;
  }
  window.addEventListener('pagehide',()=>dispose());
  window.GiftBackground={remove};
})();
