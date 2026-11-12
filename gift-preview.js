/* Fixed-frame gift artwork editor. Source files and generated pixels stay local. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const root=$('#giftPreviewTool'),canvas=$('#giftPreviewCanvas'),stage=$('#giftPreviewStage');
  const sizePresets=Array.from(root.querySelectorAll('[data-gift-size]'));
  const defaults={zoom:1,offsetX:0,offsetY:0,saturation:100,brightness:100,contrast:100,feather:10,radius:22,rotation:0,flipX:false,flipY:false};
  const rangeFields=[['Zoom','zoom'],['Feather','feather'],['Radius','radius'],['Saturation','saturation'],['Brightness','brightness'],['Contrast','contrast'],['Rotation','rotation']];
  const copy={
    zh:{title:'礼物&座驾预览图生产工具',preview:'效果预览',modeLabel:'处理方式',modeFeather:'场景羽化',modeTransparent:'透明素材',uploadTitle:'点击、拖入或粘贴一张或多张图片',uploadHint:'支持 PNG、JPG、WebP',pasteHint:'支持复制粘贴，按 ⌘V / Ctrl+V 上传',upload:'上传图片',dragHint:'拖动图片调整位置，双击居中；方向键微调',previewBackground:'预览背景',backgroundBlack:'黑色',backgroundTransparent:'透明',replace:'替换图片',privacy:'图片仅在本地处理，不会上传至服务器。',adjustments:'调整与导出',outputSize:'输出尺寸',lockedRatio:'1:1 比例锁定',width:'宽度',height:'高度',sizeError:'请输入 16–2048 之间的整数。',composition:'画面位置',center:'居中',zoom:'缩放',edges:'边缘处理',feather:'羽化',radius:'圆角',color:'色彩调整',saturation:'饱和度',brightness:'亮度',contrast:'对比度',reset:'重置调整',download:'导出 WebP',reading:'正在读取图片…',encoding:'正在生成 WebP…',saved:'已发起下载',again:'再次下载',typeError:'请选择 PNG、JPG 或 WebP 图片。',fileSizeError:'请选择 30 MB 以内的图片。',loadError:'图片无法读取，请更换文件。',pixelError:'请使用 4000 万像素以内的图片。',exportError:'导出失败，请重试。',downloadError:'未能发起下载，请重试。',encoderError:'WebP 编码组件未能加载，请刷新后重试。',canvasLabel:'礼物预览图；可拖动或用方向键调整位置'},
    en:{title:'Gift & vehicle preview maker',preview:'Preview',modeLabel:'Treatment',modeFeather:'Feathered scene',modeTransparent:'Transparent artwork',uploadTitle:'Click, drop or paste one or more images',uploadHint:'PNG, JPG or WebP',pasteHint:'Paste with ⌘V / Ctrl+V to upload',upload:'Upload image',dragHint:'Drag to position. Double-click to center. Arrow keys to nudge.',previewBackground:'Preview background',backgroundBlack:'Black',backgroundTransparent:'Transparent',replace:'Replace image',privacy:'Processed locally. Your image never leaves this device.',adjustments:'Adjust and export',outputSize:'Output size',lockedRatio:'1:1 locked',width:'Width',height:'Height',sizeError:'Enter a whole number from 16 to 2048.',composition:'Position',center:'Center',zoom:'Zoom',edges:'Edges',feather:'Feather',radius:'Corners',color:'Color',saturation:'Saturation',brightness:'Brightness',contrast:'Contrast',reset:'Reset adjustments',download:'Export WebP',reading:'Reading image…',encoding:'Creating WebP…',saved:'Download requested',again:'Download again',typeError:'Choose a PNG, JPG or WebP image.',fileSizeError:'Choose an image under 30 MB.',loadError:'Could not read this image. Try another file.',pixelError:'Choose an image with no more than 40 million pixels.',exportError:'Could not export. Please retry.',downloadError:'Could not start the download. Please retry.',encoderError:'Could not load the WebP encoder. Refresh and try again.',canvasLabel:'Gift preview. Drag or use arrow keys to position the image'}
  };
  Object.assign(copy.zh,{alignment:'画布对齐',alignHorizontal:'水平对齐',alignVertical:'垂直对齐',contextTitle:'礼物栏实时预览',contextLabel:'礼物栏实时预览',live:'实时',sizePresets:'常用尺寸',dragHint:'拖动图片定位，滚轮缩放，双击居中；方向键微调'});
  Object.assign(copy.en,{alignment:'Canvas alignment',alignHorizontal:'Horizontal align',alignVertical:'Vertical align',contextTitle:'Live gift panel preview',contextLabel:'Live gift panel preview',live:'Live',sizePresets:'Common sizes',dragHint:'Drag to position, scroll to zoom, double-click to center. Arrow keys to nudge.'});
  Object.assign(copy.zh,{advanced:'高级调整',retouch:'局部修整',toolMove:'移动',toolErase:'擦除',toolRestore:'恢复',brushSize:'笔刷大小',brushHardness:'硬度',brushOpacity:'不透明度',clearErase:'清空擦除',history:'操作历史',undo:'撤销',redo:'重做',transform:'旋转与翻转',rotation:'旋转角度',rotateLeft:'左转 90°',rotateRight:'右转 90°',flipHorizontal:'水平翻转',flipVertical:'垂直翻转',safeArea:'安全区辅助线',safeToggle:'显示安全区与中心线',safeInset:'安全边距',brushHint:'拖动笔刷修整；[ / ] 调整大小，Esc 返回移动，⌘/Ctrl Z 撤销'});
  Object.assign(copy.en,{advanced:'Advanced adjustments',retouch:'Retouch',toolMove:'Move',toolErase:'Erase',toolRestore:'Restore',brushSize:'Brush size',brushHardness:'Hardness',brushOpacity:'Opacity',clearErase:'Clear erasing',history:'Edit history',undo:'Undo',redo:'Redo',transform:'Rotate and flip',rotation:'Rotation',rotateLeft:'Rotate left 90°',rotateRight:'Rotate right 90°',flipHorizontal:'Flip horizontally',flipVertical:'Flip vertically',safeArea:'Safe area guides',safeToggle:'Show safe area and center lines',safeInset:'Safe margin',brushHint:'Drag to retouch. [ / ] size, Esc to move, Cmd/Ctrl Z to undo.'});
  Object.assign(copy.zh,{removeBackground:'一键抠图',restoreBackground:'还原背景',removing:'正在抠图…',removeProgress:'抠图进度',modelLoading:'正在加载抠图组件',removeError:'抠图失败，请检查网络或稍后重试；原图已保留。',removeHint:'先识别主体，再精修黑底边缘并恢复光效与粒子。图片仅在本地处理。'});
  Object.assign(copy.en,{removeBackground:'Remove background',restoreBackground:'Restore background',removing:'Removing background…',removeProgress:'Background removal progress',modelLoading:'Loading background removal',removeError:'Background removal failed. Check your connection and retry. Your original image is preserved.',removeHint:'Detects the subject, refines dark-backed edges and recovers light effects. Your image stays on this device.'});
  Object.assign(copy.zh,{batchTitle:'已导入图片',batchAdd:'继续添加',batchRemove:'移除图片',batchMatting:'批量抠图',batchDownload:'批量下载 ZIP',batchProgress:'正在处理',batchDone:'已完成',batchSkipped:'未成功',batchImport:'未能导入',batchExport:'没有可导出的图片，请重试。'});
  Object.assign(copy.en,{batchTitle:'Imported images',batchAdd:'Add images',batchRemove:'Remove image',batchMatting:'Remove backgrounds',batchDownload:'Download batch ZIP',batchProgress:'Processing',batchDone:'Completed',batchSkipped:'Failed',batchImport:'Could not import',batchExport:'No images could be exported. Please retry.'});
  const state={image:null,file:null,settings:{...defaults},strokes:[],baseMask:null,removing:false,removeProgress:null,tool:'move',brush:{size:20,hardness:70,opacity:100},safe:{enabled:false,inset:10},mode:'feather',modeChosen:false,side:200,valid:true,loading:false,exporting:false,notice:null,background:'black',download:null,revision:0};
  const jobs=[];
  let activeJob=null,batchStatus=null,replaceOnPick=false;
  const t=key=>(copy[language]||copy.en)[key]||copy.en[key]||key;
  let renderRequest=0,drag=null,loadToken=0,editGroup=null,wheelTimer=0,hoverPoint=null,mattingTimer=0,mattingPresentation=0,mattingPercent=0,mattingVisible=false;
  const webpMode=()=>window.FunWebP?.getMode?.()||'high';
  const busy=()=>state.loading||state.exporting||state.removing;
  const snapshot=()=>({settings:{...state.settings},strokes:state.strokes,baseMask:state.baseMask,mode:state.mode,side:state.side});
  let history=window.GiftPreviewHistory.create(snapshot());
  function pendingEdit(){const saved=history.current();return saved.strokes!==state.strokes||saved.baseMask!==state.baseMask||saved.mode!==state.mode||(jobs.length<2&&saved.side!==state.side)||Object.keys(state.settings).some(key=>!Object.is(saved.settings[key],state.settings[key]))||!!drag?.stroke?.points.length}
  function syncHistory(){const locked=busy()||!state.image;$('#giftPreviewUndo').disabled=locked||!(history.canUndo()||pendingEdit());$('#giftPreviewRedo').disabled=locked||pendingEdit()||!history.canRedo()}
  function commitEdit(){if(editGroup){editGroup=null;history.push(snapshot())}if(wheelTimer){clearTimeout(wheelTimer);wheelTimer=0}syncHistory()}
  function beginEdit(group){if(editGroup!==group){commitEdit();editGroup=group}}
  function prepareEdit(){stopDrag();commitEdit()}
  function historyStep(direction){
    if(busy()||!state.image)return;
    prepareEdit();const saved=history[direction]();if(!saved)return;
    applyEdits(saved);
    if(jobs.length<2){state.side=saved.side;state.valid=true;for(const id of ['Width','Height'])$('#giftPreview'+id).value=state.side}
    syncRanges();invalidate();
  }
  const renderSettings=()=>({...state.settings,mode:state.mode,baseMask:state.baseMask,strokes:drag?.stroke?.points.length?[...state.strokes,drag.stroke]:state.strokes});
  function releaseDownload(){
    if(state.download){const url=state.download.url;setTimeout(()=>URL.revokeObjectURL(url),60000)}
    state.download=null;$('#giftPreviewReceipt').replaceChildren();$('#giftPreviewReceipt').hidden=true;
  }
  function syncReceipt(){
    if(!state.download)return;
    const receipt=$('#giftPreviewReceipt');receipt.replaceChildren();receipt.hidden=false;
    const text=document.createElement('span');text.textContent=`${t('saved')} · ${(state.download.blob.size/1024).toFixed(1)} KB`;
    const link=document.createElement('a');link.href=state.download.url;link.download=state.download.name;link.textContent=`${t('again')} · ${state.download.name}`;
    link.addEventListener('click',event=>{if(busy())event.preventDefault();else window.Hub?.record('gift','download')});link.setAttribute('aria-disabled',String(busy()));receipt.append(text,link);
  }
  function syncMattingProgress(){
    const progress=$('#giftPreviewMattingProgress');progress.hidden=!mattingVisible;
    progress.setAttribute('aria-label',t('removeProgress'));progress.setAttribute('aria-valuenow',String(mattingPercent));
    progress.style.setProperty('--gift-progress',String(mattingPercent/100));$('#giftPreviewMattingPercent').textContent=mattingPercent+'%';
  }
  function clearMattingProgress(){
    if(mattingTimer)clearTimeout(mattingTimer);mattingTimer=0;mattingPresentation++;mattingPercent=0;mattingVisible=false;syncMattingProgress();
  }
  function updateMattingProgress(progress){
    const fraction=Math.max(0,Math.min(1,Number(progress?.progress)||0));
    const percent=['analyzing','matting','loading','processing'].includes(progress?.phase)?100*fraction:NaN;
    if(Number.isFinite(percent))mattingPercent=Math.max(mattingPercent,Math.round(percent));
  }
  function syncControls(){
    const locked=busy(),ready=!!state.image;
    for(const id of ['Upload','Replace','Input','ModeFeather','ModeTransparent','Width','Height'])$('#giftPreview'+id).disabled=locked;
    for(const id of ['Zoom','Saturation','Brightness','Contrast','Feather','Radius','Center','Reset','AlignHorizontal','AlignVertical'])$('#giftPreview'+id).disabled=locked||!ready;
    for(const button of sizePresets){button.disabled=locked;button.setAttribute('aria-pressed',String(state.valid&&state.side===Number(button.dataset.giftSize)))}
    for(const id of ['ToolMove','ToolErase','ToolRestore','BrushSize','BrushHardness','BrushOpacity','Rotation','RotateLeft','RotateRight','FlipHorizontal','FlipVertical','SafeToggle'])$('#giftPreview'+id).disabled=locked||!ready;
    $('#giftPreviewClearErase').disabled=locked||!ready||!state.strokes.length;
    $('#giftPreviewSafeInset').disabled=locked||!ready||!state.safe.enabled;
    const exportingSingle=state.exporting&&batchStatus?.phase!=='export';
    $('#giftPreviewDownload').disabled=locked||!ready||!state.valid;$('#giftPreviewDownload').textContent=t(exportingSingle?'encoding':'download');
    const removeButton=$('#giftPreviewRemoveBackground'),removeLabel=removeButton.querySelector?.('[data-gift-matting-label]')||removeButton;removeButton.disabled=locked||!ready;removeLabel.textContent=t(state.removing?'removing':state.baseMask?'restoreBackground':'removeBackground');removeButton.setAttribute('aria-busy',String(state.removing));removeButton.title=t('removeHint');
    removeButton.dataset.method=state.baseMask?.method||'';removeButton.dataset.processingMs=String(state.baseMask?.elapsedMs??'');
    for(const id of ['Upload','Replace'])$('#giftPreview'+id).setAttribute('aria-busy',String(state.loading));
    $('#giftPreviewDownload').setAttribute('aria-busy',String(exportingSingle));stage.setAttribute('aria-busy',String(locked));
    stage.classList.toggle('upload-ready',!ready);stage.classList.toggle('has-image',ready);
    stage.setAttribute('role','group');stage.removeAttribute('tabindex');stage.setAttribute('aria-label',t(ready?'preview':'uploadTitle'));
    canvas.hidden=!ready;$('#giftPreviewEmpty').hidden=ready;$('#giftPreviewSourcebar').hidden=!ready;
    $('#giftPreviewSurface').hidden=!ready;$('#giftPreviewSurface').dataset.tool=state.tool;
    canvas.setAttribute('aria-label',t('canvasLabel'));canvas.setAttribute('aria-disabled',String(locked));
    $('#giftPreviewContext').hidden=!ready;$('#giftPreviewContext').setAttribute('aria-label',t('contextLabel'));
    $('#giftPreviewPresets').setAttribute('aria-label',t('sizePresets'));
    $('#giftPreviewAlignment').setAttribute('aria-label',t('alignment'));
    for(const [id,key] of [['AlignHorizontal','alignHorizontal'],['AlignVertical','alignVertical']]){
      const button=$('#giftPreview'+id);button.textContent=t(key);button.setAttribute('aria-label',t(key));button.title=t(key);
    }
    $('#giftPreviewDragHint').textContent=t(state.tool==='move'?'dragHint':'brushHint');
    for(const id of ['BackgroundBlack','BackgroundTransparent'])$('#giftPreview'+id).disabled=locked;
    $('#giftPreviewModeFeather').setAttribute('aria-pressed',String(state.mode==='feather'));
    $('#giftPreviewModeTransparent').setAttribute('aria-pressed',String(state.mode==='transparent'));
    $('#giftPreviewFeatherField').hidden=state.mode!=='feather';
    for(const id of ['Width','Height'])$('#giftPreview'+id).setAttribute('aria-invalid',String(!state.valid));
    $('#giftPreviewSizeError').hidden=state.valid;
    $('#giftPreviewNotice').hidden=!state.notice;$('#giftPreviewNotice').textContent=state.notice?t(state.notice):'';
    $('#giftPreviewOutputMeta').textContent=`${state.side} × ${state.side} px`;
    if(ready){$('#giftPreviewName').textContent=state.file.name;$('#giftPreviewName').title=state.file.name;$('#giftPreviewSourceSize').textContent=`${state.image.naturalWidth} × ${state.image.naturalHeight} px`}
    for(const [name,key] of rangeFields){
      const value=key==='zoom'?Math.round(state.settings[key]*100):state.settings[key];$('#giftPreview'+name+'Value').textContent=value+(key==='rotation'?'°':'%');
    }
    for(const tool of ['Move','Erase','Restore'])$('#giftPreviewTool'+tool).setAttribute('aria-pressed',String(state.tool===tool.toLowerCase()));
    for(const [id,key] of [['FlipHorizontal','flipX'],['FlipVertical','flipY']])$('#giftPreview'+id).setAttribute('aria-pressed',String(state.settings[key]));
    for(const [id,key] of [['BrushSize','size'],['BrushHardness','hardness'],['BrushOpacity','opacity']])$('#giftPreview'+id+'Value').textContent=state.brush[key]+(key==='size'?'px':'%');
    $('#giftPreviewSafeToggle').checked=state.safe.enabled;$('#giftPreviewSafeInsetValue').textContent=state.safe.inset+'%';
    $('#giftPreviewSafeArea').hidden=!ready||!state.safe.enabled;$('#giftPreviewSafeArea').style.setProperty('--gift-safe-inset',state.safe.inset+'%');
    syncHistory();syncCursor();syncMattingProgress();syncBatchControls();
    const phase=state.loading?'loading':state.exporting||state.removing?'processing':state.notice||!state.valid?'error':state.download?'success':ready?'ready':'empty';
    const removalMessage=state.removeProgress?.phase==='loading'?`${t('modelLoading')} · ${Math.round((state.removeProgress.progress||0)*100)}%`:t('removing');
    window.FunToolkitUI?.setState('gift-preview',{phase,message:state.loading?t('reading'):state.exporting?t('encoding'):state.removing?removalMessage:undefined});syncReceipt();
  }
  function render(){
    if(!state.image)return;
    window.GiftPreviewRenderer.render(canvas,state.image,renderSettings());
    syncContextPreview();
  }
  function syncContextPreview(){
    if(!state.image)return;
    const target=$('#giftPreviewContextCanvas'),ctx=target.getContext('2d');
    ctx.clearRect(0,0,target.width,target.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,target.width,target.height);
  }
  function scheduleRender(){
    if(renderRequest)return;
    renderRequest=requestAnimationFrame(()=>{renderRequest=0;try{render()}catch(error){state.notice='exportError';syncControls()}});
  }
  function invalidate(){state.revision++;state.notice=null;releaseDownload();scheduleRender();syncControls()}
  function changed(){if(!editGroup)history.push(snapshot());invalidate()}
  function setBackground(value){
    if(!['black','transparent'].includes(value))return;
    state.background=value;stage.dataset.background=value;
    $('#giftPreviewBackgroundBlack').setAttribute('aria-pressed',String(value==='black'));
    $('#giftPreviewBackgroundTransparent').setAttribute('aria-pressed',String(value==='transparent'));
  }
  function chooseMode(mode){if(busy()||!['feather','transparent'].includes(mode))return;prepareEdit();state.modeChosen=true;if(state.mode!==mode){state.mode=mode;changed()}}
  function guessMode(image){
    const sample=document.createElement('canvas');sample.width=sample.height=32;const ctx=sample.getContext('2d');ctx.drawImage(image,0,0,32,32);
    const pixels=ctx.getImageData(0,0,32,32).data;let clear=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]<250)clear++;
    return clear/(32*32)>.45?'transparent':'feather';
  }
  function readImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>image.naturalWidth&&image.naturalHeight?resolve(image):reject(new Error('loadError'));image.onerror=()=>reject(new Error('loadError'));image.src=url})}
  async function readSource(file){
    if(!/\.(png|jpe?g|webp)$/i.test(file.name)||file.type&&!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('typeError');
    if(file.size>30*1024*1024)throw new Error('fileSizeError');
    const url=URL.createObjectURL(file);
    try{
      const image=await readImage(url);
      if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('pixelError');
      return image;
    }finally{URL.revokeObjectURL(url)}
  }
  function applyEdits(edits){
    state.settings={...edits.settings};state.strokes=edits.strokes;state.baseMask=edits.baseMask;state.mode=edits.mode;
  }
  function showJob(job,image){
    const edits=job.history.current();
    window.GiftPreviewRenderer.render(canvas,image,{...edits.settings,mode:edits.mode,baseMask:edits.baseMask,strokes:edits.strokes});
    if(activeJob)activeJob.modeChosen=state.modeChosen;
    activeJob=job;history=job.history;applyEdits(edits);
    state.image=image;state.file=job.file;state.modeChosen=job.modeChosen;state.tool='move';hoverPoint=null;
    state.revision++;releaseDownload();syncRanges();syncContextPreview();
  }
  function makeJob(file,image,modeChosen){
    const mode=modeChosen?state.mode:guessMode(image);
    const job={file,modeChosen,history:window.GiftPreviewHistory.create({settings:{...defaults},strokes:[],baseMask:null,mode,side:state.side})};
    const row=document.createElement('li'),select=document.createElement('button'),remove=document.createElement('button');
    const thumb=document.createElement('canvas'),name=document.createElement('span');
    row.className='gift-batch-item';select.className='gift-batch-select';remove.className='gift-batch-remove';
    select.type=remove.type='button';select.title=file.name;name.className='gift-batch-name';name.textContent=file.name;
    thumb.width=thumb.height=64;thumb.className='gift-batch-thumb';thumb.setAttribute('aria-hidden','true');
    const scale=64/Math.max(image.naturalWidth,image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    thumb.getContext('2d').drawImage(image,(64-w)/2,(64-h)/2,w,h);
    select.append(thumb,name);remove.textContent='×';row.append(select,remove);
    select.addEventListener('click',()=>selectJob(job));remove.addEventListener('click',()=>removeJob(job));
    return Object.assign(job,{row,select,remove});
  }
  function syncBatchControls(){
    const multiple=jobs.length>1,locked=busy();
    $('#giftBatchPanel').hidden=!jobs.length;
    $('#giftBatchAdd').disabled=locked;
    const matting=$('#giftBatchRemoveBackground'),exportZip=$('#giftBatchDownload');
    matting.hidden=exportZip.hidden=!multiple;
    matting.disabled=locked||jobs.every(job=>job.history.current().baseMask);
    exportZip.disabled=locked||!state.valid;
    matting.setAttribute('aria-busy',String(batchStatus?.phase==='matting'));
    exportZip.setAttribute('aria-busy',String(batchStatus?.phase==='export'));
    for(const job of jobs){
      job.select.disabled=job.remove.disabled=locked;job.select.setAttribute('aria-pressed',String(job===activeJob));
      job.remove.setAttribute('aria-label',t('batchRemove')+' · '+job.file.name);
    }
    const status=$('#giftBatchStatus');status.hidden=!batchStatus;
    const {done,total,failed,phase}=batchStatus||{};
    let message='';
    if(phase==='import')message=t('batchImport')+' '+failed;
    else if(phase)message=t(phase==='done'?'batchDone':'batchProgress')+' '+(phase==='done'?done-failed:done)+'/'+total+(failed?' · '+t('batchSkipped')+' '+failed:'');
    if(status.textContent!==message)status.textContent=message;
    status.dataset.tone=failed?'error':'';
  }
  function renderJobList(){
    $('#giftBatchList').replaceChildren(...jobs.map(job=>job.row));
  }
  async function loadFiles(files,{replace=true}={}){
    if(busy())return;
    const selected=Array.from(files);if(!selected.length)return;
    const replaced=replace&&selected.length===1?activeJob:null;
    const modeChosen=state.modeChosen&&(!!replaced||!activeJob);
    const uploadHadFocus=document.activeElement===$('#giftPreviewUpload')||document.activeElement===stage;
    clearMattingProgress();prepareEdit();state.loading=true;state.notice=null;batchStatus=null;syncControls();
    const progress=window.UploadProgress?.begin(selected.length);
    const token=++loadToken;let loaded=false,failed=0,problem;
    try{
      for(const file of selected){
        try{
          const image=await readSource(file);if(token!==loadToken)return;
          const job=makeJob(file,image,modeChosen);
          if(replaced||!activeJob){showJob(job,image);loaded=true}
          if(replaced)jobs.splice(jobs.indexOf(replaced),1,job);else jobs.push(job);
        }catch(error){failed++;problem=copy.en[error.message]?error.message:'loadError'}
        finally{progress?.advance()}
      }
      if(failed===selected.length){state.notice=problem;if(state.image)try{render()}catch(ignored){}}
      else if(failed)batchStatus={phase:'import',failed};
    }finally{
      progress?.finish();
      if(token===loadToken){
        state.loading=false;renderJobList();syncControls();
        if(loaded){
          window.FunToolkitUI?.reveal(canvas);if(uploadHadFocus)canvas.focus({preventScroll:true});
          const prewarm=()=>{if(token===loadToken&&active()&&!busy())window.GiftBackground?.prewarm?.(state.image)};
          if(typeof requestIdleCallback==='function')requestIdleCallback(prewarm,{timeout:500});else setTimeout(prewarm,0);
        }
      }
    }
  }
  async function selectJob(job){
    if(busy()||job===activeJob)return false;
    clearMattingProgress();prepareEdit();state.loading=true;state.notice=null;syncControls();
    const token=++loadToken;let loaded=false;
    try{
      const image=await readSource(job.file);if(token!==loadToken)return false;
      showJob(job,image);loaded=true;return true;
    }catch(error){state.notice='loadError';if(state.image)try{render()}catch(ignored){}return false}
    finally{if(token===loadToken){state.loading=false;syncControls();if(loaded)job.select.focus({preventScroll:true})}}
  }
  async function removeJob(job){
    if(busy())return;
    const index=jobs.indexOf(job);if(index===-1)return;
    const next=jobs[index+1]||jobs[index-1];
    if(job===activeJob){
      if(next&&!await selectJob(next))return;
      if(!next){
        clearMattingProgress();prepareEdit();releaseDownload();
        activeJob=null;state.file=null;state.image=null;state.baseMask=null;state.strokes=[];state.tool='move';hoverPoint=null;
        history=window.GiftPreviewHistory.create(snapshot());
      }
    }
    jobs.splice(index,1);batchStatus=null;state.notice=null;renderJobList();syncControls();
    (next?.select||$('#giftPreviewUpload')).focus({preventScroll:true});
  }
  function syncRanges(){
    for(const [name,key] of rangeFields)$('#giftPreview'+name).value=key==='zoom'?Math.round(state.settings[key]*100):state.settings[key];
  }
  function changeSize(input){
    if(busy())return;
    if(jobs.length<2)beginEdit('size');
    const side=Number(input.value);state.valid=input.value.trim()!==''&&Number.isInteger(side)&&side>=16&&side<=2048;
    if(state.valid){state.side=side;$('#giftPreviewWidth').value=side;$('#giftPreviewHeight').value=side}
    state.notice=null;releaseDownload();syncControls();
  }
  function center(){if(busy()||!state.image)return;prepareEdit();state.settings.offsetX=state.settings.offsetY=0;changed()}
  function align(axis){if(busy()||!state.image)return;prepareEdit();state.settings[axis==='horizontal'?'offsetX':'offsetY']=0;changed()}
  function zoomWheel(event){
    if(busy()||!state.image||event.ctrlKey||event.metaKey||!Number.isFinite(event.deltaY)||!event.deltaY)return;
    event.preventDefault();stopDrag();
    const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.getBoundingClientRect().height:1;
    const zoom=Math.round(Math.max(.25,Math.min(3,state.settings.zoom*Math.exp(-event.deltaY*unit*.0015)))*100)/100;
    if(zoom===state.settings.zoom)return;
    beginEdit('wheel');state.settings.zoom=zoom;syncRanges();changed();if(wheelTimer)clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{if(editGroup==='wheel')commitEdit()},220);
  }
  function stopDrag(){
    if(drag){const previous=drag;drag=null;if(previous.stroke?.points.length)state.strokes=[...state.strokes,previous.stroke];if(canvas.hasPointerCapture?.(previous.id))canvas.releasePointerCapture(previous.id);commitEdit();syncControls()}
    canvas.classList.remove('is-dragging');
  }
  function setTool(tool){if(busy()||!state.image||!['move','erase','restore'].includes(tool))return;prepareEdit();state.tool=tool;hoverPoint=null;syncControls()}
  function syncCursor(){
    const cursor=$('#giftPreviewBrushCursor');cursor.hidden=!hoverPoint||!state.image||state.tool==='move'||busy();if(cursor.hidden)return;
    const box=canvas.getBoundingClientRect(),diameter=state.brush.size/state.side*box.width;
    cursor.style.left=(hoverPoint.x-box.left)+'px';cursor.style.top=(hoverPoint.y-box.top)+'px';cursor.style.width=cursor.style.height=diameter+'px';
  }
  function addBrushPoint(event,force=false){
    if(!drag?.stroke)return;
    const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
    const x=(event.clientX-box.left)/box.width,y=(event.clientY-box.top)/box.height;
    if(x<0||x>1||y<0||y>1){drag.break=true;hoverPoint=null;syncCursor();return}
    const last=drag.lastPoint,spacing=Math.max(.8,state.brush.size/state.side*box.width*.12);
    if(!force&&!drag.break&&last&&Math.hypot(event.clientX-last.x,event.clientY-last.y)<spacing)return;
    const point=window.GiftPreviewRenderer.toSourcePoint(state.image.naturalWidth,state.image.naturalHeight,canvas.width,{...state.settings,mode:state.mode},{x,y});
    if(drag.break)point.break=true;
    drag.stroke.points.push(point);drag.lastPoint={x:event.clientX,y:event.clientY};drag.break=false;changed();
  }
  function pointerDown(event){
    if(busy()||!state.image||event.isPrimary===false||event.button!==undefined&&event.button!==0)return;
    prepareEdit();beginEdit('pointer');
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,offsetX:state.settings.offsetX,offsetY:state.settings.offsetY};
    if(state.tool!=='move'){
      const placement=window.GiftPreviewRenderer.getPlacement(state.image.naturalWidth,state.image.naturalHeight,canvas.width,{...state.settings,mode:state.mode});
      drag.stroke={mode:state.tool,size:state.brush.size/state.side*canvas.width/(placement.scale*Math.max(state.image.naturalWidth,state.image.naturalHeight)),hardness:state.brush.hardness/100,opacity:state.brush.opacity/100,points:[]};
      addBrushPoint(event,true);
    }
    canvas.setPointerCapture?.(event.pointerId);canvas.classList.add('is-dragging');canvas.focus({preventScroll:true});event.preventDefault();
  }
  function pointerMove(event){
    const box=canvas.getBoundingClientRect();hoverPoint=event.clientX>=box.left&&event.clientX<=box.left+box.width&&event.clientY>=box.top&&event.clientY<=box.top+box.height?{x:event.clientX,y:event.clientY}:null;syncCursor();
    if(!drag||drag.id!==event.pointerId||busy())return;
    if(drag.stroke){addBrushPoint(event);event.preventDefault();return}
    if(!box.width||!box.height)return;
    state.settings.offsetX=Math.max(-1,Math.min(1,drag.offsetX+(event.clientX-drag.x)/box.width));
    state.settings.offsetY=Math.max(-1,Math.min(1,drag.offsetY+(event.clientY-drag.y)/box.height));changed();event.preventDefault();
  }
  function safeStem(name,extension){
    return name.replace(extension,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'gift';
  }
  function webpName(file,side){
    return safeStem(file.name,/\.[^.]+$/)+'-gift-preview-'+side+'x'+side+'.webp';
  }
  function batchWebpNames(sourceNames){
    const stems=sourceNames.map(name=>safeStem(name,/\.(?:png|jpe?g|webp)$/i));
    const key=name=>name.normalize('NFC').toLowerCase();
    const reserved=new Set(stems.map(key)),used=new Set();
    return stems.map(stem=>{
      let name=stem;
      if(used.has(key(name))){
        let suffix=2;
        do {name=stem+' ('+(suffix++)+')'} while(reserved.has(key(name))||used.has(key(name)));
      }
      used.add(key(name));
      return name+'.webp';
    });
  }
  async function encodeImage(image,settings,side,mode,file){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const output=document.createElement('canvas');output.width=output.height=side;
    try{
      window.GiftPreviewRenderer.render(output,image,settings);
      const original=image.naturalWidth===side&&image.naturalHeight===side?file:undefined;
      const blob=await canvasToWebP(output,{mode,original});
      if(!blob||blob.type!=='image/webp')throw new Error('exportError');
      return blob;
    }finally{output.width=output.height=1}
  }
  async function downloadBatch(){
    if(busy()||jobs.length<2||!state.valid)return;
    prepareEdit();
    const side=state.side,mode=webpMode(),names=batchWebpNames(jobs.map(job=>job.file.name));
    let packed=0;
    const progress={phase:'export',done:0,total:jobs.length,failed:0};
    state.exporting=true;state.notice=null;batchStatus=progress;syncControls();
    let url;
    try{
      const zip=new JSZip();
      for(const [index,job] of jobs.entries()){
        if(mode!==webpMode())return;
        try{
          const edits=job.history.current(),image=job===activeJob?state.image:await readSource(job.file);
          const blob=await encodeImage(image,{...edits.settings,mode:edits.mode,baseMask:edits.baseMask,strokes:edits.strokes},side,mode,job.file);
          if(mode!==webpMode())return;
          const bytes=new Uint8Array(await blob.arrayBuffer());
          zip.file(names[index],bytes);packed++;
        }catch(error){progress.failed++}
        progress.done++;syncBatchControls();
      }
      if(!packed){state.notice='batchExport';return}
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'});
      if(mode!==webpMode())return;
      url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='gift-previews-'+side+'x'+side+'.zip';link.hidden=true;document.body.append(link);
      try{link.click()}catch(error){throw new Error('downloadError')}finally{link.remove()}
      window.Hub?.record('gift','generated',packed);window.Hub?.record('gift','download');
    }catch(error){state.notice=error.message==='downloadError'?'downloadError':'exportError'}
    finally{
      if(url){const downloadUrl=url;setTimeout(()=>URL.revokeObjectURL(downloadUrl),60000)}
      state.exporting=false;progress.phase='done';
      if(mode!==webpMode()||state.notice)batchStatus=null;
      syncControls();
    }
  }
  async function removeBatchBackgrounds(){
    if(busy()||jobs.length<2||jobs.every(job=>job.history.current().baseMask))return;
    clearMattingProgress();prepareEdit();
    const progress={phase:'matting',done:0,total:jobs.length,failed:0};
    state.removing=true;state.notice=null;batchStatus=progress;syncControls();
    try{
      for(const job of jobs){
        const edits=job.history.current();
        if(!edits.baseMask){
          try{
            const image=job===activeJob?state.image:await readSource(job.file),startedAt=Date.now();
            const mask=await window.GiftBackground.remove(image);
            mask.elapsedMs=Date.now()-startedAt;
            job.history.push({...edits,mode:'transparent',baseMask:mask});
            job.modeChosen=true;
            if(job===activeJob){applyEdits(job.history.current());state.modeChosen=true;invalidate()}
          }catch(error){progress.failed++}
        }
        progress.done++;syncBatchControls();
      }
      if(progress.failed===progress.total)state.notice='removeError';
    }finally{state.removing=false;progress.phase='done';syncControls()}
  }
  async function download(){
    if(busy()||!state.image||!state.valid)return;
    prepareEdit();state.exporting=true;state.notice=null;syncControls();let freshUrl;
    const mode=webpMode(),key=state.revision+':'+state.side+':'+mode;
    try{
      const cached=state.download?.key===key;let blob=cached?state.download.blob:null;
      if(!blob)blob=await encodeImage(state.image,renderSettings(),state.side,mode,state.file);
      if(mode!==webpMode())return;
      const name=webpName(state.file,state.side);
      freshUrl=URL.createObjectURL(blob);const link=document.createElement('a');link.href=freshUrl;link.download=name;link.hidden=true;document.body.append(link);
      try{link.click()}catch(error){throw new Error('downloadError')}finally{link.remove()}
      releaseDownload();state.download={key,blob,name,url:freshUrl};freshUrl=null;if(!cached)window.Hub?.record('gift','generated');window.Hub?.record('gift','download');syncReceipt();window.FunToolkitUI?.reveal($('#giftPreviewReceipt'));
    }catch(error){state.notice=copy.en[error.message]?error.message:'exportError'}
    finally{if(freshUrl)URL.revokeObjectURL(freshUrl);state.exporting=false;syncControls()}
  }
  async function removeBackground(){
    if(busy()||!state.image)return;
    clearMattingProgress();prepareEdit();
    if(state.baseMask){state.baseMask=null;changed();return}
    const presentation=mattingPresentation;mattingVisible=true;state.removing=true;state.removeProgress={phase:'analyzing',progress:0};state.notice=null;syncControls();const startedAt=Date.now();
    try{
      const mask=await window.GiftBackground.remove(state.image,{onProgress:progress=>{if(!state.removing||presentation!==mattingPresentation)return;state.removeProgress=progress;updateMattingProgress(progress);syncControls()}});
      mask.elapsedMs=Date.now()-startedAt;state.baseMask=mask;state.mode='transparent';state.modeChosen=true;changed();
      if(presentation===mattingPresentation){mattingPercent=100;mattingTimer=setTimeout(()=>{if(presentation===mattingPresentation){mattingTimer=0;mattingVisible=false;syncMattingProgress()}},450)}
    }catch(error){state.notice='removeError';clearMattingProgress()}
    finally{state.removing=false;state.removeProgress=null;syncControls()}
  }
  function syncLanguage(){
    root.querySelectorAll('[data-gift-i18n]').forEach(node=>node.textContent=t(node.dataset.giftI18n));syncControls();setBackground(state.background);
  }
  function activate(){if(state.download&&!state.download.key.endsWith(':'+webpMode()))releaseDownload();syncControls();if(state.image)scheduleRender()}
  document.addEventListener('webp:mode-change',()=>{releaseDownload();syncControls()});
  const input=$('#giftPreviewInput');
  function pickFiles(replace=false){
    if(busy())return;
    replaceOnPick=replace;input.multiple=!replace;input.click();
  }
  for(const [id,replace] of [['#giftPreviewUpload',false],['#giftPreviewReplace',true],['#giftBatchAdd',false]]){
    $(id).addEventListener('click',event=>{event.stopPropagation();pickFiles(replace)});
  }
  input.addEventListener('change',event=>{
    const selected=Array.from(event.target.files),replace=replaceOnPick;
    replaceOnPick=false;input.multiple=true;event.target.value='';loadFiles(selected,{replace});
  });
  stage.addEventListener('click',()=>{if(!state.image)pickFiles()});
  stage.addEventListener('keydown',event=>{if(event.target===stage&&!state.image&&!busy()&&['Enter',' '].includes(event.key)){event.preventDefault();pickFiles()}});
  const profileProduction=$('#profileProduction');
  const active=()=>location.hash==='#gift-previews'&&!profileProduction?.hidden;
  const appendFiles=files=>loadFiles(files,{replace:false});
  window.UploadPaste?.register({zone:stage,isActive:active,isBusy:busy,onFiles:appendFiles});
  document.addEventListener('dragover',event=>{if(active()&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();stage.classList.add('drag')}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)stage.classList.remove('drag')});
  document.addEventListener('drop',event=>{stage.classList.remove('drag');if(active()&&event.dataTransfer?.files.length){event.preventDefault();appendFiles(event.dataTransfer.files)}});
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',event=>{if(drag?.id!==event.pointerId)return;if(drag.stroke)addBrushPoint(event,true);stopDrag()});
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,event=>{if(drag?.id===event.pointerId)stopDrag()});
  canvas.addEventListener('pointerleave',()=>{if(drag?.stroke)drag.break=true;hoverPoint=null;syncCursor()});
  canvas.addEventListener('dblclick',event=>{if(state.tool==='move')center();else event.preventDefault()});
  canvas.addEventListener('wheel',zoomWheel,{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(busy()||!state.image)return;
    if(event.key==='Home'){event.preventDefault();center();return}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},move=directions[event.key];if(!move)return;
    prepareEdit();event.preventDefault();const step=(event.shiftKey?10:1)/state.side;
    state.settings.offsetX=Math.max(-1,Math.min(1,state.settings.offsetX+move[0]*step));state.settings.offsetY=Math.max(-1,Math.min(1,state.settings.offsetY+move[1]*step));changed();
  });
  for(const id of ['Width','Height']){const field=$('#giftPreview'+id);field.addEventListener('input',event=>changeSize(event.target));field.addEventListener('change',commitEdit);field.addEventListener('blur',commitEdit)}
  for(const button of sizePresets)button.addEventListener('click',()=>{if(busy())return;prepareEdit();changeSize({value:button.dataset.giftSize});commitEdit()});
  for(const [name,key] of rangeFields){const field=$('#giftPreview'+name);field.addEventListener('input',event=>{
    if(busy()||!state.image)return;
    const value=Number(event.target.value),min=Number(event.target.min),max=Number(event.target.max);if(!Number.isFinite(value)||value<min||value>max)return;
    beginEdit('range:'+key);state.settings[key]=key==='zoom'?value/100:value;changed();
  });field.addEventListener('change',commitEdit);field.addEventListener('blur',commitEdit)}
  for(const [id,key] of [['BrushSize','size'],['BrushHardness','hardness'],['BrushOpacity','opacity']])$('#giftPreview'+id).addEventListener('input',event=>{
    if(busy()||!state.image)return;const value=Number(event.target.value);if(!Number.isFinite(value)||value<Number(event.target.min)||value>Number(event.target.max))return;state.brush[key]=value;syncControls();
  });
  for(const tool of ['Move','Erase','Restore'])$('#giftPreviewTool'+tool).addEventListener('click',()=>setTool(tool.toLowerCase()));
  $('#giftPreviewClearErase').addEventListener('click',()=>{if(busy()||!state.image||!state.strokes.length)return;prepareEdit();state.strokes=[];changed()});
  $('#giftPreviewUndo').addEventListener('click',()=>historyStep('undo'));$('#giftPreviewRedo').addEventListener('click',()=>historyStep('redo'));
  function rotate(degrees){if(busy()||!state.image)return;prepareEdit();let angle=state.settings.rotation+degrees;if(angle>180)angle-=360;if(angle< -180)angle+=360;state.settings.rotation=angle;syncRanges();changed()}
  $('#giftPreviewRotateLeft').addEventListener('click',()=>rotate(-90));$('#giftPreviewRotateRight').addEventListener('click',()=>rotate(90));
  for(const [id,key] of [['FlipHorizontal','flipX'],['FlipVertical','flipY']])$('#giftPreview'+id).addEventListener('click',()=>{if(busy()||!state.image)return;prepareEdit();state.settings[key]=!state.settings[key];changed()});
  $('#giftPreviewSafeToggle').addEventListener('change',event=>{if(busy()||!state.image)return;state.safe.enabled=event.target.checked;syncControls()});
  $('#giftPreviewSafeInset').addEventListener('input',event=>{if(busy()||!state.image)return;const value=Number(event.target.value);if(value>=5&&value<=25){state.safe.inset=value;syncControls()}});
  $('#giftPreviewAdvanced').addEventListener('toggle',()=>{if(!$('#giftPreviewAdvanced').open&&state.tool!=='move'){stopDrag();state.tool='move';hoverPoint=null;syncControls()}});
  $('#giftPreviewModeFeather').addEventListener('click',()=>chooseMode('feather'));$('#giftPreviewModeTransparent').addEventListener('click',()=>chooseMode('transparent'));
  $('#giftPreviewCenter').addEventListener('click',center);
  $('#giftPreviewAlignHorizontal').addEventListener('click',()=>align('horizontal'));
  $('#giftPreviewAlignVertical').addEventListener('click',()=>align('vertical'));
  $('#giftPreviewRemoveBackground').addEventListener('click',removeBackground);
  root.addEventListener('keydown',event=>{
    if(profileProduction?.hidden)return;
    const editable=event.target?.closest?.('input:not([type="range"]),textarea,[contenteditable="true"]');
    if(!editable&&!busy()&&state.image&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();historyStep(event.shiftKey?'redo':'undo');return}
    if(!editable&&!busy()&&state.image&&state.tool!=='move'&&['[',']'].includes(event.key)){event.preventDefault();state.brush.size=Math.max(1,Math.min(100,state.brush.size+(event.key===']'?1:-1)*(event.shiftKey?10:1)));$('#giftPreviewBrushSize').value=state.brush.size;syncControls();return}
    if(event.key==='Escape'&&state.tool!=='move'){setTool('move');canvas.focus({preventScroll:true});event.preventDefault()}
  });
  $('#giftPreviewReset').addEventListener('click',()=>{if(busy()||!state.image)return;clearMattingProgress();prepareEdit();state.settings={...defaults};if(state.strokes.length)state.strokes=[];state.baseMask=null;state.tool='move';syncRanges();changed()});
  $('#giftPreviewBackgroundBlack').addEventListener('click',()=>setBackground('black'));$('#giftPreviewBackgroundTransparent').addEventListener('click',()=>setBackground('transparent'));
  $('#giftPreviewDownload').addEventListener('click',download);
  $('#giftBatchDownload').addEventListener('click',downloadBatch);
  $('#giftBatchRemoveBackground').addEventListener('click',removeBatchBackgrounds);
  window.addEventListener('hashchange',()=>{if(!active()){clearMattingProgress();prepareEdit();hoverPoint=null;syncControls()}stage.classList.remove('drag')});
  window.addEventListener('blur',()=>{prepareEdit();hoverPoint=null;syncCursor()});
  window.addEventListener('pagehide',event=>{clearMattingProgress();prepareEdit();if(!event.persisted){loadToken++;if(renderRequest)cancelAnimationFrame(renderRequest);if(state.download)URL.revokeObjectURL(state.download.url)}});
  window.GiftPreviewTool={activate,syncLanguage,batchWebpNames};syncLanguage();
})();
