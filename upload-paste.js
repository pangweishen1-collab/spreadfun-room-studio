/* Route clipboard files to the current tool's existing upload pipeline. */
(() => {
  'use strict';
  const targets=new Set();
  const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4'};

  function editable(node){
    return !!node&&(node.isContentEditable||node.matches?.('input,textarea,select')||node.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
  }
  function focusPath(){
    const path=[];
    for(let node=document.activeElement;node;node=node.shadowRoot?.activeElement)path.unshift(node);
    return path;
  }
  function visible(zone){
    return zone.isConnected!==false&&!zone.closest?.('[hidden],.hidden')&&(!zone.getClientRects||zone.getClientRects().length>0);
  }
  function namedFile(file,index,total){
    const name=typeof file.name==='string'?file.name:'';
    const extension=extensions[String(file.type||'').toLowerCase()];
    if(!extension||/\.[^./\\]+$/.test(name)||typeof File!=='function')return file;
    const options={type:file.type};
    if(Number.isFinite(file.lastModified))options.lastModified=file.lastModified;
    // Sequence imports sort filenames, so generated names need a stable order.
    const suffix=total>1?'-'+String(index+1).padStart(3,'0'):'';
    return new File([file],`pasted-${extension==='mp4'?'video':'image'}${suffix}.${extension}`,options);
  }
  function clipboardFiles(data){
    const files=Array.from(data?.files||[]);
    // Some browsers expose image clipboard items without populating FileList.
    if(!files.length)for(const item of Array.from(data?.items||[])){
      if(item.kind!=='file')continue;
      const file=item.getAsFile();if(file)files.push(file);
    }
    return files.map((file,index)=>namedFile(file,index,files.length));
  }
  function closestTarget(candidates,nodes){
    for(const node of nodes){
      if(!node?.nodeType)continue;
      let best=null;
      for(const candidate of candidates){
        if((candidate.zone===node||candidate.zone.contains(node))&&(!best||best.zone.contains(candidate.zone)))best=candidate;
      }
      if(best)return best;
    }
    return null;
  }
  document.addEventListener('paste',event=>{
    if(event.defaultPrevented||document.hidden||document.querySelector('dialog[open]'))return;
    const path=event.composedPath?.()||[event.target],focus=focusPath();
    if([...path,...focus].some(editable))return;
    const files=clipboardFiles(event.clipboardData);if(!files.length)return;
    const candidates=Array.from(targets).filter(target=>target.isActive(event)&&visible(target.zone));
    const target=closestTarget(candidates,path)||closestTarget(candidates,focus)||candidates[0];
    if(!target)return;
    event.preventDefault();
    if(target.isBusy())return;
    try{Promise.resolve(target.onFiles(files)).catch(error=>console.error('Pasted file upload failed:',error));}
    catch(error){console.error('Pasted file upload failed:',error);}
  });
  window.UploadPaste={register({zone,isActive=()=>true,isBusy=()=>false,onFiles}={}){
    if(!zone||typeof zone.contains!=='function'||typeof isActive!=='function'||typeof isBusy!=='function'||typeof onFiles!=='function')throw new TypeError('UploadPaste.register requires an upload zone and callbacks.');
    const target={zone,isActive,isBusy,onFiles};targets.add(target);
    return ()=>targets.delete(target);
  }};
})();
