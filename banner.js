/* Two fixed-size banners, rendered and compressed entirely on this device. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const copy={
    zh:{black:'黑色',transparent:'透明',previewBackground:'游戏 Banner 预览背景',help:'使用说明',helpTitle:'Banner 使用说明',close:'关闭',helpDescription:'在 GPT 生图时，请写明图片的宽高比为 3.3:1。',helpPrompt:'请生成一张 Banner 图片，宽高比为 3.3:1。',helpFollowup:'保存图片后上传到这里，工具会自动裁切，并导出房间 Banner 和游戏 Banner 两个 WebP 文件。',title:'Banner 生产工具',preview:'Banner 预览',drop:'点击或拖入 Banner 图片',hint:'支持 PNG、JPG、WebP，自动生成两种尺寸',upload:'上传图片',replace:'替换文件',room:'房间 Banner',game:'游戏 Banner',privacy:'文件仅在本地处理，不会上传至服务器。',output:'输出文件',compression:'无损 WebP · 保留画面细节',smallSource:'原图较小，放大后可能变模糊。建议上传至少 772 × 201 px 的原图。',encoderError:'无损压缩组件未能加载，请刷新后重试。',empty:'上传图片后自动生成两个 Banner',downloadAll:'下载全部 · ZIP',download:'下载',noFile:'尚未选择文件',loading:'正在生成…',ready:'已生成 2 个文件',typeError:'请选择 PNG、JPG 或 WebP 图片。',fileCount:'一次请选择一张图片。',sizeError:'请选择 30 MB 以内的图片。',loadError:'图片无法读取，请更换文件。',pixelError:'图片尺寸过大，请使用 4000 万像素以内的图片。',exportError:'生成失败，请重试。',frameError:'游戏外框未能加载，请刷新后重试。',zipError:'打包失败，请重试或分别下载。'},
    en:{black:'Black',transparent:'Transparent',previewBackground:'Game banner preview background',help:'Usage guide',helpTitle:'Banner usage guide',close:'Close',helpDescription:'When generating a banner in GPT, specify a 3.3:1 aspect ratio (width:height).',helpPrompt:'Generate a banner image with a 3.3:1 aspect ratio.',helpFollowup:'Save the image and upload it here. The tool automatically crops and exports a room banner and a game banner as WebP files.',title:'Banner maker',preview:'Banner preview',drop:'Click or drop a banner image',hint:'PNG, JPG or WebP · Create both sizes automatically',upload:'Upload image',replace:'Replace file',room:'Room banner',game:'Game banner',privacy:'Processed locally. Your files never leave this device.',output:'Output files',compression:'Lossless WebP · Original detail preserved',smallSource:'This image needs enlarging and may look soft. Use an original image of at least 772 × 201 px.',encoderError:'Could not load the lossless encoder. Refresh and try again.',empty:'Upload an image to create both banners',downloadAll:'Download both · ZIP',download:'Download',noFile:'No file selected',loading:'Creating banners…',ready:'2 files ready',typeError:'Choose a PNG, JPG or WebP image.',fileCount:'Choose one image at a time.',sizeError:'Choose an image under 30 MB.',loadError:'Could not read this image. Try another file.',pixelError:'Choose an image with no more than 40 million pixels.',exportError:'Could not create the banners. Please try again.',frameError:'Could not load the game frame. Refresh and try again.',zipError:'Could not create the ZIP. Retry or download each file.'}
  };
  const t=key=>(copy[language]||copy.en)[key];
  const state={image:null,file:null,outputs:[],busy:false,notice:null,previewBackground:'black'};
  let template=null;
  function cropRect(iw,ih,tw,th){
    const scale=Math.max(tw/iw,th/ih),sw=tw/scale,sh=th/scale;
    return {sx:(iw-sw)/2,sy:(ih-sh)/2,sw,sh};
  }
  function drawCover(ctx,image,x,y,width,height){
    const crop=cropRect(image.naturalWidth,image.naturalHeight,width,height);
    ctx.drawImage(image,crop.sx,crop.sy,crop.sw,crop.sh,x,y,width,height);
  }
  function readImage(src,errorKey){
    return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(errorKey));image.src=src});
  }
  function drawBanners(image,frame){
    const room=document.createElement('canvas');room.width=772;room.height=200;
    const rc=room.getContext('2d');rc.imageSmoothingEnabled=true;rc.imageSmoothingQuality='high';drawCover(rc,image,0,0,772,200);
    const game=document.createElement('canvas');game.width=684;game.height=240;
    const gc=game.getContext('2d');gc.imageSmoothingEnabled=true;gc.imageSmoothingQuality='high';gc.drawImage(frame,0,0,684,240);
    // The supplied frame has a solid placeholder. Replace only its interior,
    // leaving the original 3px rim over the edges of the 645×201 image crop.
    gc.save();gc.beginPath();gc.roundRect(22.5,21,639,195,27);gc.clip();drawCover(gc,image,19.5,18,645,201);gc.restore();
    return [{kind:'room',width:772,height:200,canvas:room},{kind:'game',width:684,height:240,canvas:game}];
  }
  function setNotice(key){state.notice=key;$('#bannerNotice').textContent=key?t(key):'';$('#bannerNotice').classList.toggle('hidden',!key)}
  function syncControls(){
    for(const id of ['#bannerUpload','#bannerReplace','#bannerInput'])$(id).disabled=state.busy;
    $('#bannerDownloadAll').disabled=state.busy||!state.outputs.length;
    $('#bannerDropzone').setAttribute('aria-busy',String(state.busy));
    $('#bannerStatus').textContent=t(state.busy?'loading':state.outputs.length?'ready':'noFile');
    $('#bannerOutputCount').textContent=String(state.outputs.length);
  }
  function renderOutputs(){
    const list=$('#bannerOutputList');list.replaceChildren();
    $('#bannerOutputEmpty').classList.toggle('hidden',!!state.outputs.length);
    for(const file of state.outputs){
      const row=document.createElement('div');row.className='banner-output';
      const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('span');
      title.textContent=t(file.kind);meta.textContent=`${file.width} × ${file.height} px · ${(file.blob.size/1024).toFixed(1)} KB`;
      info.append(title,meta);
      const link=document.createElement('a');link.className='download';link.href=file.url;link.download=file.name;link.textContent=t('download');link.setAttribute('aria-label',t('download')+' '+t(file.kind));
      link.addEventListener('click',()=>window.Hub?.record('banner','download'));
      row.append(info,link);list.append(row);
    }
  }
  function setPreviewBackground(value){
    if(value!=='black'&&value!=='transparent')return;
    state.previewBackground=value;
    $('#gameBannerPreview').dataset.background=value;
    $('#bannerPreviewBlack').setAttribute('aria-pressed',String(value==='black'));
    $('#bannerPreviewTransparent').setAttribute('aria-pressed',String(value==='transparent'));
  }
  function syncLanguage(){
    document.querySelectorAll('[data-banner-i18n]').forEach(el=>el.textContent=t(el.dataset.bannerI18n));
    $('#bannerDropzone').setAttribute('aria-label',t('drop'));
    $('#bannerPreviewBackground').setAttribute('aria-label',t('previewBackground'));setPreviewBackground(state.previewBackground);
    $('#roomBannerCanvas').setAttribute('aria-label',t('room'));$('#gameBannerCanvas').setAttribute('aria-label',t('game'));
    if(state.image)$('#bannerFileMeta').textContent=`${state.image.naturalWidth} × ${state.image.naturalHeight} px`;
    const small=!!state.image&&(state.image.naturalWidth<772||state.image.naturalHeight<201);
    $('#bannerResolutionNote').textContent=small?t('smallSource'):'';$('#bannerResolutionNote').classList.toggle('hidden',!small);
    setNotice(state.notice);renderOutputs();syncControls();
  }
  async function loadFiles(files){
    if(state.busy)return;
    const selected=Array.from(files);if(!selected.length)return;
    if(selected.length!==1){setNotice('fileCount');return}
    const file=selected[0];
    if(!/\.(png|jpe?g|webp)$/i.test(file.name)||!/^image\/(png|jpeg|webp)$/.test(file.type)){setNotice('typeError');return}
    if(file.size>30*1024*1024){setNotice('sizeError');return}
    state.busy=true;setNotice(null);syncControls();let sourceUrl;const fresh=[];
    try{
      sourceUrl=URL.createObjectURL(file);
      const image=await readImage(sourceUrl,'loadError');
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('loadError');
      if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('pixelError');
      if(!template)template=await readImage('assets/game-banner-frame.webp','frameError');
      const renders=drawBanners(image,template),base=file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'banner';
      for(const render of renders){
        const blob=await canvasToLosslessWebP(render.canvas);
        fresh.push({...render,blob,url:URL.createObjectURL(blob),name:`${base}-${render.kind}-banner-${render.width}x${render.height}.webp`});
      }
      for(const file of state.outputs)URL.revokeObjectURL(file.url);
      state.image=image;state.file=file;state.outputs=fresh;
      for(const file of fresh){const canvas=$(file.kind==='room'?'#roomBannerCanvas':'#gameBannerCanvas');const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(file.canvas,0,0)}
      $('#bannerEmpty').classList.add('hidden');$('#bannerPreviews').classList.remove('hidden');$('#bannerSourcebar').classList.remove('hidden');
      $('#bannerDropzone').classList.remove('upload-ready');$('#bannerDropzone').classList.add('has-banners');$('#bannerDropzone').removeAttribute('role');$('#bannerDropzone').removeAttribute('tabindex');
      $('#bannerFileName').textContent=file.name;$('#bannerFileName').title=file.name;syncLanguage();
      window.Hub?.record('banner','generated',fresh.length);
    }catch(error){
      for(const file of fresh)URL.revokeObjectURL(file.url);
      setNotice(copy.en[error.message]?error.message:'exportError');
    }finally{if(sourceUrl)URL.revokeObjectURL(sourceUrl);state.busy=false;syncControls()}
  }
  async function downloadAll(){
    if(state.busy||!state.outputs.length)return;
    state.busy=true;setNotice(null);syncControls();let url;
    try{
      const zip=new JSZip();for(const file of state.outputs)zip.file(file.name,file.blob);
      const blob=await zip.generateAsync({type:'blob'});url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='Fun-Toolkit-Banners.zip';link.hidden=true;document.body.append(link);link.click();window.Hub?.record('banner','download');link.remove();
      // Leave the browser time to start reading the downloadable Blob.
      const downloadUrl=url;setTimeout(()=>URL.revokeObjectURL(downloadUrl),60000);url=null;
    }catch(error){setNotice('zipError')}
    finally{if(url)URL.revokeObjectURL(url);state.busy=false;syncControls()}
  }
  $('#bannerPreviewBlack').addEventListener('click',()=>setPreviewBackground('black'));
  $('#bannerPreviewTransparent').addEventListener('click',()=>setPreviewBackground('transparent'));
  const helpDialog=$('#bannerHelpDialog');
  $('#bannerHelpButton').addEventListener('click',()=>helpDialog.showModal());
  $('#bannerHelpClose').addEventListener('click',()=>helpDialog.close());
  const input=$('#bannerInput'),dropzone=$('#bannerDropzone');
  for(const id of ['#bannerUpload','#bannerReplace'])$(id).addEventListener('click',event=>{event.stopPropagation();if(!state.busy)input.click()});
  input.addEventListener('change',event=>{loadFiles(event.target.files);event.target.value=''});
  dropzone.addEventListener('click',()=>{if(!state.image&&!state.busy)input.click()});
  dropzone.addEventListener('keydown',event=>{if(event.target===dropzone&&!state.image&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(!state.busy)input.click()}});
  const active=()=>location.hash==='#banners';
  document.addEventListener('dragover',event=>{if(active()&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();dropzone.classList.add('drag')}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)dropzone.classList.remove('drag')});
  document.addEventListener('drop',event=>{dropzone.classList.remove('drag');if(active()&&event.dataTransfer?.files.length){event.preventDefault();return loadFiles(event.dataTransfer.files)}});
  window.addEventListener('hashchange',()=>dropzone.classList.remove('drag'));
  $('#bannerDownloadAll').addEventListener('click',downloadAll);
  window.addEventListener('pagehide',event=>{if(!event.persisted)state.outputs.forEach(file=>URL.revokeObjectURL(file.url))});
  window.BannerTool={syncLanguage};
  syncLanguage();
})();
