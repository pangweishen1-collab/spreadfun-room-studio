/* Project-specific banners, rendered and compressed entirely on this device. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const copy={
    "zh": {
      "black": "黑色",
      "transparent": "透明",
      "previewBackground": "游戏 Banner 预览背景",
      "help": "使用说明",
      "helpTitle": "Banner 使用说明",
      "close": "关闭",
      "helpDescription": "在 GPT 生图时，请写明图片的宽高比为 {ratio}:1。",
      "helpPrompt": "请生成一张 Banner 图片，宽高比为 {ratio}:1。",
      "helpFollowup": "选择项目并上传图片，工具会自动居中裁切，导出对应尺寸的WebP 文件。",
      "title": "Banner 生产工具",
      "preview": "Banner 预览",
      "drop": "点击、拖入或粘贴 Banner 图片",
      "hint": "支持 PNG、JPG、WebP，按项目自动生成对应尺寸",
      "pasteHint": "支持复制粘贴，按 ⌘V / Ctrl+V 上传",
      "upload": "上传图片",
      "replace": "替换文件",
      "room": "房间 Banner",
      "game": "游戏 Banner",
      "privacy": "文件仅在本地处理，不会上传至服务器。",
      "output": "输出文件",
      "compression": "高清压缩 WebP · 小体积优先",
      "smallSource": "原图较小，放大后可能变模糊。建议上传至少 {width} × {height} px 的原图。",
      "encoderError": "WebP 编码组件未能加载，请刷新后重试。",
      "empty": "上传图片后自动生成",
      "downloadAll": "下载全部 · ZIP",
      "download": "下载",
      "noFile": "尚未选择文件",
      "loading": "正在生成…",
      "importing": "正在读取图片…",
      "processing": "正在生成并压缩…",
      "packaging": "正在打包…",
      "ready": "已生成 {count} 个文件",
      "typeError": "请选择 PNG、JPG 或 WebP 图片。",
      "fileCount": "一次请选择一张图片。",
      "sizeError": "请选择 30 MB 以内的图片。",
      "loadError": "图片无法读取，请更换文件。",
      "pixelError": "图片尺寸过大，请使用 4000 万像素以内的图片。",
      "exportError": "生成失败，请重试。",
      "frameError": "游戏外框未能加载，请刷新后重试。",
      "zipError": "打包失败，请重试或分别下载。",
      "projects": "选择项目规范",
      "select": "选择",
      "banner": "Banner"
    },
    "en": {
      "black": "Black",
      "transparent": "Transparent",
      "previewBackground": "Game banner preview background",
      "help": "Usage guide",
      "helpTitle": "Banner usage guide",
      "close": "Close",
      "helpDescription": "When generating a banner in GPT, specify a {ratio}:1 aspect ratio (width:height).",
      "helpPrompt": "Generate a banner image with a {ratio}:1 aspect ratio.",
      "helpFollowup": "Choose a project and upload an image. The tool crops it centrally and exports the project’s sizes as WebP files.",
      "title": "Banner maker",
      "preview": "Banner preview",
      "drop": "Click, drop or paste a banner image",
      "hint": "PNG, JPG or WebP · Automatically create the selected project’s sizes",
      "pasteHint": "Paste with ⌘V / Ctrl+V to upload",
      "upload": "Upload image",
      "replace": "Replace file",
      "room": "Room banner",
      "game": "Game banner",
      "privacy": "Processed locally. Your files never leave this device.",
      "output": "Output files",
      "compression": "High-quality WebP · Smaller files",
      "smallSource": "This image needs enlarging and may look soft. Use an original image of at least {width} × {height} px.",
      "encoderError": "Could not load the WebP encoder. Refresh and try again.",
      "empty": "Upload an image to create banners",
      "downloadAll": "Download all · ZIP",
      "download": "Download",
      "noFile": "No file selected",
      "loading": "Creating banners…",
      "importing": "Reading image…",
      "processing": "Creating and compressing…",
      "packaging": "Creating ZIP…",
      "ready": "{count} file(s) ready",
      "typeError": "Choose a PNG, JPG or WebP image.",
      "fileCount": "Choose one image at a time.",
      "sizeError": "Choose an image under 30 MB.",
      "loadError": "Could not read this image. Try another file.",
      "pixelError": "Choose an image with no more than 40 million pixels.",
      "exportError": "Could not create the banners. Please try again.",
      "frameError": "Could not load the game frame. Refresh and try again.",
      "zipError": "Could not create the ZIP. Retry or download each file.",
      "projects": "Choose project specifications",
      "select": "Select",
      "banner": "Banner"
    }
  };
  const projects=[
    {id:'hapi-ludo',name:'Hapi Ludo',outputs:[{kind:'room',width:772,height:200},{kind:'game',width:684,height:240}]},
    {id:'hapi',name:'Hapi',outputs:[{kind:'room',width:772,height:200}]},
    {id:'yari',name:'Yari',outputs:[{kind:'room',width:772,height:200}]},
    {id:'4fun',name:'4Fun',outputs:[{kind:'room',width:680,height:200}]}
  ];
  const t=key=>(copy[language]||copy.en)[key];
  const readyText=()=>language==='zh'?t('ready').replace('{count}',state.outputs.length):`${state.outputs.length} ${state.outputs.length===1?'file':'files'} ready`;
  const outputTitle=kind=>t(kind==='room'&&state.project.id!=='hapi-ludo'?'banner':kind);
  const webpMode=()=>window.FunWebP?.getMode?.()||'high';
  const state={outputMode:null,modeRefresh:false,project:projects[0],image:null,file:null,outputs:[],busy:false,notice:null,phase:'empty',busyMessage:null,previewBackground:'black'};
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
  function drawBanners(image,frame,project){
    const spec=project.outputs[0],room=document.createElement('canvas');room.width=spec.width;room.height=spec.height;
    const rc=room.getContext('2d');rc.imageSmoothingEnabled=true;rc.imageSmoothingQuality='high';drawCover(rc,image,0,0,spec.width,spec.height);
    const renders=[{...spec,canvas:room}];
    if(project.outputs.length===1)return renders;
    const game=document.createElement('canvas');game.width=684;game.height=240;
    const gc=game.getContext('2d');gc.imageSmoothingEnabled=true;gc.imageSmoothingQuality='high';gc.drawImage(frame,0,0,684,240);
    // The supplied frame has a solid placeholder. Replace only its interior,
    // leaving the original 3px rim over the edges of the 645×201 image crop.
    gc.save();gc.beginPath();gc.roundRect(22.5,21,639,195,27);gc.clip();drawCover(gc,image,19.5,18,645,201);gc.restore();
    return [...renders,{kind:'game',width:684,height:240,canvas:game}];
  }
  function setNotice(key){
    state.notice=key;$('#bannerNotice').textContent=key?t(key):'';$('#bannerNotice').classList.toggle('hidden',!key);
    if(key){state.phase='error';syncControls()}
  }
  function syncControls(){
    for(const id of ['#bannerUpload','#bannerReplace','#bannerInput'])$(id).disabled=state.busy;
    $('#bannerProjectCatalog').querySelectorAll('[data-project]').forEach(button=>{button.disabled=state.busy;button.setAttribute('aria-pressed',String(button.dataset.project===state.project.id))});
    $('#bannerDownloadAll').disabled=state.busy||!state.outputs.length;
    $('#bannerDropzone').setAttribute('aria-busy',String(state.busy));
    for(const id of ['#bannerUpload','#bannerDownloadAll'])$(id).setAttribute('aria-busy',String(state.busy));
    $('#bannerStatus').textContent=state.busy?t(state.busyMessage||'loading'):state.outputs.length?readyText():t('noFile');
    $('#bannerOutputCount').textContent=String(state.outputs.length);
    const messageKey=state.notice||(state.busy?state.busyMessage:state.phase==='success'?'ready':null);
    window.FunToolkitUI?.setState('banner',{phase:state.phase,message:messageKey?(messageKey==='ready'?readyText():t(messageKey)):undefined});
  }
  function renderOutputs(){
    const list=$('#bannerOutputList');list.replaceChildren();
    $('#bannerOutputEmpty').classList.toggle('hidden',!!state.outputs.length);
    const specs=$('#bannerOutputSpecs');specs.replaceChildren();specs.classList.toggle('hidden',!!state.outputs.length);
    $('#bannerSelectedProject').textContent=state.project.name;
    for(const spec of state.project.outputs){
      const row=document.createElement('div');row.className='banner-output-spec';
      const title=document.createElement('strong'),dimensions=document.createElement('span');title.textContent=outputTitle(spec.kind);dimensions.textContent=`${spec.width} × ${spec.height} px`;row.append(title,dimensions);specs.append(row);
    }
    for(const file of state.outputs){
      const row=document.createElement('div');row.className='banner-output';
      const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('span');
      title.textContent=outputTitle(file.kind);meta.textContent=`${file.width} × ${file.height} px · ${(file.blob.size/1024).toFixed(1)} KB · ${file.mode==='lossless'?(language==='zh'?'严格无损':'Exact lossless'):(language==='zh'?'高清压缩':'High quality')}`;
      info.append(title,meta);
      const link=document.createElement('a');link.className='download';link.href=file.url;link.download=file.name;link.textContent=t('download');link.setAttribute('aria-label',t('download')+' '+outputTitle(file.kind));
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
    $('#bannerProjectCatalog').querySelectorAll('[data-project]').forEach(button=>{const project=projects.find(item=>item.id===button.dataset.project);button.setAttribute('aria-label',`${t('select')} ${project.name}`)});
    const compression=document.querySelector('[data-banner-i18n="compression"]');if(compression)compression.textContent=webpMode()==='lossless'?(language==='zh'?'严格无损 WebP · 像素完全保留':'Exact lossless WebP · Pixels preserved'):(language==='zh'?'高清压缩 WebP · 小体积优先':'High-quality WebP · Smaller files');
    const spec=state.project.outputs[0],ratio=state.project.id==='hapi-ludo'?'3.3':String(spec.width/spec.height);
    for(const key of ['helpDescription','helpPrompt'])document.querySelector(`[data-banner-i18n="${key}"]`).textContent=t(key).replace('{ratio}',ratio);
    $('#bannerRoomTitle').textContent=outputTitle('room');$('#bannerRoomSize').textContent=`${spec.width} × ${spec.height} px`;
    $('#bannerGamePreview').classList.toggle('hidden',state.project.outputs.length===1);
    $('#bannerDropzone').setAttribute('aria-label',t('drop'));
    $('#bannerPreviewBackground').setAttribute('aria-label',t('previewBackground'));setPreviewBackground(state.previewBackground);
    $('#roomBannerCanvas').setAttribute('aria-label',outputTitle('room'));$('#gameBannerCanvas').setAttribute('aria-label',t('game'));
    if(state.image)$('#bannerFileMeta').textContent=`${state.image.naturalWidth} × ${state.image.naturalHeight} px`;
    const minimumHeight=state.project.outputs.length===2?201:spec.height;
    const small=!!state.image&&(state.image.naturalWidth<spec.width||state.image.naturalHeight<minimumHeight);
    $('#bannerResolutionNote').textContent=small?t('smallSource').replace('{width}',spec.width).replace('{height}',minimumHeight):'';$('#bannerResolutionNote').classList.toggle('hidden',!small);
    setNotice(state.notice);renderOutputs();syncControls();
  }
  function prepareProject(project){
    return Promise.all([prepareBannerWebP(),project.outputs.length===2&&!template?readImage('assets/game-banner-frame.webp','frameError').then(frame=>{template=frame}):Promise.resolve()]);
  }
  async function createOutputs(image,file,project,mode=webpMode()){
    const fresh=[],base=file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'banner';
    try{
      for(const render of drawBanners(image,template,project)){
        const blob=await canvasToWebP(render.canvas,{mode});
        if(mode!==webpMode())throw new Error('modeChanged');
        fresh.push({...render,mode,blob,url:URL.createObjectURL(blob),name:`${base}-${project.id}-${render.kind}-banner-${render.width}x${render.height}.webp`});
      }
      return fresh;
    }catch(error){for(const output of fresh)URL.revokeObjectURL(output.url);throw error}
  }
  function commitOutputs(image,file,project,fresh){
    for(const output of state.outputs)URL.revokeObjectURL(output.url);
    state.project=project;state.image=image;state.file=file;state.outputs=fresh;state.outputMode=fresh[0]?.mode||webpMode();state.phase='success';
    for(const output of fresh){const canvas=$(output.kind==='room'?'#roomBannerCanvas':'#gameBannerCanvas');canvas.width=output.width;canvas.height=output.height;canvas.getContext('2d').drawImage(output.canvas,0,0)}
    $('#bannerEmpty').classList.add('hidden');$('#bannerPreviews').classList.remove('hidden');$('#bannerSourcebar').classList.remove('hidden');
    $('#bannerDropzone').classList.remove('upload-ready');$('#bannerDropzone').classList.add('has-banners');$('#bannerDropzone').removeAttribute('role');$('#bannerDropzone').removeAttribute('tabindex');
    $('#bannerFileName').textContent=file.name;$('#bannerFileName').title=file.name;syncLanguage();
    window.FunToolkitUI?.reveal($('#bannerPreviews'));window.FunToolkitUI?.reveal($('#bannerOutputList'));
    window.Hub?.record('banner','generated',fresh.length);
  }
  async function selectProject(project){
    if(state.busy||project===state.project&&state.outputs.length&&state.outputMode===webpMode())return;
    if(!state.image){state.project=project;state.phase='empty';setNotice(null);syncLanguage();return}
    // Commit the project and its outputs together; a failed switch retains the previous files.
    state.busy=true;state.phase='processing';state.busyMessage='processing';setNotice(null);syncControls();
    try{await prepareProject(project);const fresh=await createOutputs(state.image,state.file,project);commitOutputs(state.image,state.file,project,fresh)}
    catch(error){if(error.message!=='modeChanged')setNotice(copy.en[error.message]?error.message:'exportError')}
    finally{state.busy=false;state.busyMessage=null;syncControls();if(state.modeRefresh)refreshCompression()}
  }
  async function loadFiles(files){
    if(state.busy)return;
    const selected=Array.from(files);if(!selected.length)return;
    if(selected.length!==1){setNotice('fileCount');return}
    const file=selected[0];
    if(!/\.(png|jpe?g|webp)$/i.test(file.name)||!/^image\/(png|jpeg|webp)$/.test(file.type)){setNotice('typeError');return}
    if(file.size>30*1024*1024){setNotice('sizeError');return}
    state.busy=true;state.phase='loading';state.busyMessage='importing';setNotice(null);syncControls();let sourceUrl;
    try{
      sourceUrl=URL.createObjectURL(file);
      // Decode the source and prepare the local codec/frame together.
      const [image]=await Promise.all([readImage(sourceUrl,'loadError'),prepareProject(state.project)]);
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('loadError');
      if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('pixelError');
      state.phase='processing';state.busyMessage='processing';syncControls();
      const fresh=await createOutputs(image,file,state.project);commitOutputs(image,file,state.project,fresh);
    }catch(error){
      if(error.message!=='modeChanged')setNotice(copy.en[error.message]?error.message:'exportError');
    }finally{if(sourceUrl)URL.revokeObjectURL(sourceUrl);state.busy=false;state.busyMessage=null;syncControls();if(state.modeRefresh)refreshCompression()}
  }
  async function refreshCompression(){
    if(!state.image||state.busy||location.hash!=='#banners')return;
    state.modeRefresh=false;
    if(state.outputs.length&&state.outputMode===webpMode())return;
    state.busy=true;state.phase='processing';state.busyMessage='processing';setNotice(null);syncControls();
    try{await prepareProject(state.project);const fresh=await createOutputs(state.image,state.file,state.project);commitOutputs(state.image,state.file,state.project,fresh)}
    catch(error){if(error.message!=='modeChanged')setNotice(copy.en[error.message]?error.message:'exportError')}
    finally{state.busy=false;state.busyMessage=null;syncControls();if(state.modeRefresh)refreshCompression()}
  }
  document.addEventListener('webp:mode-change',()=>{
    state.modeRefresh=true;for(const file of state.outputs)URL.revokeObjectURL(file.url);state.outputs=[];state.outputMode=null;
    renderOutputs();syncLanguage();if(!state.busy)refreshCompression();
  });
  async function downloadAll(){
    if(state.busy||!state.outputs.length)return;const mode=webpMode();
    state.busy=true;state.phase='processing';state.busyMessage='packaging';setNotice(null);syncControls();let url;
    try{
      const zip=new JSZip();for(const file of state.outputs)zip.file(file.name,file.blob);
      const blob=await zip.generateAsync({type:'blob'});if(mode!==webpMode())return;url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download='Fun-Toolkit-Banners.zip';link.hidden=true;document.body.append(link);link.click();window.Hub?.record('banner','download');link.remove();
      state.phase='success';
      // Leave the browser time to start reading the downloadable Blob.
      const downloadUrl=url;setTimeout(()=>URL.revokeObjectURL(downloadUrl),60000);url=null;
    }catch(error){setNotice('zipError')}
    finally{if(url)URL.revokeObjectURL(url);state.busy=false;state.busyMessage=null;syncControls();if(state.modeRefresh)refreshCompression()}
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
  window.UploadPaste?.register({zone:dropzone,isActive:active,isBusy:()=>state.busy,onFiles:loadFiles});
  document.addEventListener('dragover',event=>{if(active()&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();dropzone.classList.add('drag')}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)dropzone.classList.remove('drag')});
  document.addEventListener('drop',event=>{dropzone.classList.remove('drag');if(active()&&event.dataTransfer?.files.length){event.preventDefault();return loadFiles(event.dataTransfer.files)}});
  window.addEventListener('hashchange',()=>{dropzone.classList.remove('drag');if(active()&&(state.modeRefresh||state.image&&state.outputMode!==webpMode()))refreshCompression()});
  $('#bannerDownloadAll').addEventListener('click',downloadAll);
  window.addEventListener('pagehide',event=>{if(!event.persisted)state.outputs.forEach(file=>URL.revokeObjectURL(file.url))});
  window.BannerTool={syncLanguage};
  window.ProjectSelector.render($('#bannerProjectCatalog'),projects,{getName:project=>project.name,selectLabel:t('select'),selectedId:state.project.id,onSelect:selectProject});
  syncLanguage();
})();
