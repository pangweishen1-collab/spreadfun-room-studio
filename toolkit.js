/* Fun Toolkit — page navigation, shared language and local SVGA workflow. */
(() => {
  'use strict';
  // Track navigation modality because editable fields can match :focus-visible after a mouse click.
  const focusRoot = document.documentElement;
  if (focusRoot) {
    focusRoot.dataset.inputModality = 'keyboard';
    document.addEventListener('pointerdown', () => { focusRoot.dataset.inputModality = 'pointer'; }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Tab') focusRoot.dataset.inputModality = 'keyboard'; }, true);
  }
  const $ = selector => document.querySelector(selector);
  const strings = {
    en: {
      resourcesNav:'Assets',navResourcesTitle:'Asset library',
      roomNav:'Room backgrounds',roomNavShort:'Room BG',avatarNav:'Avatar frames',avatarNavShort:'Avatar',examplesNav:'Examples',bannerNav:'Banner',navBannerTitle:'Banner maker',homeTitle:'Operations workspace',statisticsTitle:'Usage statistics',homeLink:'Fun Toolkit home',statisticsLink:'Statistics',designGuidelines:'Design guidelines',designGuidelinesLabel:'Design guidelines (opens in a new tab)',footerResources:'Footer resources',navLabel:'Tools',roomSubtitle:'Create room backgrounds in two sizes, ready to use.',
      avatarTitle:'Avatar frame maker',avatarSubtitle:'Drop an SVGA, find your frame, export a transparent WebP.',animationPreview:'Animation preview',
      noFile:'No file selected',loading:'Loading animation…',playing:'Playing',paused:'Paused',dropSvga:'Click or drop an SVGA file',svgaHint:'Preview the animation and export the exact frame you want.',uploadSvga:'Upload SVGA',replaceSvga:'Replace file',
      play:'Play',pause:'Pause',previousFrame:'Previous frame',nextFrame:'Next frame',frameTimeline:'Frame timeline',scrubHint:'Drag to pause at a frame',currentFrame:'Current frame',localPrivacy:'Processed locally. Your files never leave this device.',
      exportTitle:'Export current frame',exportEmpty:'Your frame will appear here',outputDimensions:'Output dimensions',lockedRatio:'1:1 locked',width:'Width',height:'Height',dimensionError:'Enter a whole number from 16 to 2048.',
      downloadFrame:'Export WebP',exporting:'Exporting…',
      typeError:'Choose one .svga file.',sizeError:'This file is too large. Choose an SVGA under 50 MB.',loadError:'Could not read this SVGA. The file may be damaged or unsupported. Try another file.',loadTimeout:'This SVGA took too long to load. Try another file.',unavailable:'The animation player could not load. Refresh the page and try again.',invalidAnimation:'This SVGA has invalid dimensions or no frames.',exportError:'Could not export this frame. Please try again.',saved:'Download requested. Check your browser downloads.',retry:'Download again',frame:'Frame',original:'Original',seconds:'s',fileCount:'Choose one file at a time.',footerAuthor:'Winsome',footerContact:'Contact author: Winsome',navRoomTitle:'Room backgrounds',navAvatarTitle:'Avatar frames'
    },
    zh: {
      resourcesNav:'资源库',navResourcesTitle:'资源库',
      roomNav:'房间背景',roomNavShort:'房间背景',avatarNav:'头像框',avatarNavShort:'头像框',examplesNav:'案例图片',bannerNav:'Banner',navBannerTitle:'Banner 生产工具',homeTitle:'乐趣运营工作台',statisticsTitle:'使用统计',homeLink:'Fun Toolkit 首页',statisticsLink:'使用统计',designGuidelines:'设计规范',designGuidelinesLabel:'设计规范（在新标签页打开）',footerResources:'页脚资源',navLabel:'工具导航',roomSubtitle:'一次上传，生成两种尺寸的房间背景。',
      avatarTitle:'头像框生产工具',avatarSubtitle:'拖入 SVGA，停在喜欢的一帧，导出透明 WebP。',animationPreview:'动态预览',
      noFile:'尚未选择文件',loading:'正在读取动画…',playing:'播放中',paused:'已暂停',dropSvga:'点击或拖入 SVGA 文件',svgaHint:'预览动态效果，选中需要的那一帧。',uploadSvga:'上传 SVGA',replaceSvga:'替换文件',
      play:'播放',pause:'暂停',previousFrame:'上一帧',nextFrame:'下一帧',frameTimeline:'帧时间轴',scrubHint:'拖动即可停在指定帧',currentFrame:'当前帧',localPrivacy:'文件仅在本地处理，不会上传至服务器。',
      exportTitle:'导出当前帧',exportEmpty:'选择文件后显示当前帧',outputDimensions:'输出尺寸',lockedRatio:'1:1 比例锁定',width:'宽度',height:'高度',dimensionError:'请输入 16–2048 之间的整数。',
      downloadFrame:'导出 WebP',exporting:'正在导出…',
      typeError:'请选择一个 .svga 文件。',sizeError:'文件过大，请选择 50 MB 以内的 SVGA。',loadError:'无法读取该 SVGA，文件可能损坏或格式不受支持，请更换文件。',loadTimeout:'动画读取超时，请尝试其他文件。',unavailable:'动画播放器未能加载，请刷新页面后重试。',invalidAnimation:'该 SVGA 的尺寸无效或没有可播放的帧。',exportError:'导出失败，请重试。',saved:'已发起下载，请查看浏览器的下载列表。',retry:'再次下载',frame:'第',original:'原始尺寸',seconds:'秒',fileCount:'一次请选择一个文件。',footerAuthor:'庞伟深',footerContact:'联系作者：庞伟深',navRoomTitle:'房间背景工具',navAvatarTitle:'头像框生产工具'
    }
  };
  const state={video:null,file:null,frame:0,playing:false,loading:false,exporting:false,dimension:240,dimensionValid:true,active:'room',notice:null,download:null,downloadUrl:null,lastPreview:0};
  const playerHost=$('#svgaPlayer'),output=$('#frameOutputCanvas'),input=$('#svgaInput');
  let player=null,exportPlayer=null;
  // Pausing and exporting reuse the selected frame; replacement/size changes
  // invalidate the hidden render independently of the fixed 240px preview.
  let renderedVideo=null,renderedFrame=-1,renderedSize=0,previewVideo=null,previewFrame=-1;
  function invalidateFrameRender(){renderedVideo=previewVideo=null;renderedFrame=previewFrame=-1;renderedSize=0}
  // SVGA 2.3.2's local File path also needs this optional namespace present.
  window.JSZipUtils=window.JSZipUtils||{};
  const exportHost=document.createElement('div');exportHost.setAttribute('aria-hidden','true');exportHost.style.cssText='position:fixed;left:-20000px;top:0;pointer-events:none;visibility:hidden';document.body.append(exportHost);
  const t=key=>(strings[language]||strings.en)[key]||key;
  const currentTool=()=>({'#banners':'banner','#avatar-frames':'avatar','#room-backgrounds':'room','#statistics':'statistics','#resources':'resources'}[location.hash]||'home');
  function syncFeedback(){
    const phase=state.loading?'loading':state.exporting?'processing':state.notice||!state.dimensionValid?'error':state.download?'success':state.video?'ready':'empty';
    const message=state.loading?t('loading'):state.exporting?t('exporting'):state.notice?t(state.notice):!state.dimensionValid?t('dimensionError'):state.download?t('saved'):'';
    window.FunToolkitUI?.setState('avatar',{phase,message});
  }
  function setNotice(key){state.notice=key;$('#svgaNotice').textContent=key?t(key):'';$('#svgaNotice').classList.toggle('hidden',!key);syncFeedback()}
  function releaseDownload(){if(state.downloadUrl)URL.revokeObjectURL(state.downloadUrl);state.downloadUrl=null;state.download=null;$('#frameDownloadResult').replaceChildren();$('#frameDownloadResult').classList.add('hidden')}
  function syncDownloadResult(){
    if(!state.download)return;
    const box=$('#frameDownloadResult');box.replaceChildren();box.classList.remove('hidden');
    const text=document.createElement('span');text.textContent=t('saved');const link=document.createElement('a');link.href=state.downloadUrl;link.download=state.download;link.textContent=t('retry')+' · '+state.download;link.addEventListener('click',()=>window.Hub?.record('avatar','download'));box.append(text,link);
  }
  function syncControls(){
    const busy=state.loading||state.exporting,ready=!!state.video;
    for(const id of ['#svgaUpload','#svgaReplace'])$(id).setAttribute('aria-busy',String(state.loading));
    $('#frameDownload').setAttribute('aria-busy',String(state.exporting));
    for(const id of ['#svgaPrevious','#svgaNext','#svgaPlay','#svgaTimeline','#svgaFrameNumber'])$(id).disabled=!ready||busy;
    for(const id of ['#svgaUpload','#svgaReplace'])$(id).disabled=busy;
    for(const id of ['#frameWidth','#frameHeight'])$(id).disabled=state.exporting;
    $('#frameDownload').disabled=!ready||busy||!state.dimensionValid;
    $('#svgaDropzone').setAttribute('aria-busy',String(state.loading));
    $('#svgaDropzone').classList.toggle('upload-ready',!ready);
    const mode=state.loading?'loading':ready?(state.playing?'playing':'paused'):'noFile';
    $('#svgaPlaybackStatus').textContent=t(mode);$('#svgaPlaybackStatus').dataset.state=mode;
    $('#svgaPlayText').textContent=t(state.playing?'pause':'play');$('#svgaPlaySymbol').textContent=state.playing?'Ⅱ':'▶';
    $('#svgaPlay').setAttribute('aria-pressed',String(state.playing));$('#frameDownload').textContent=t(state.exporting?'exporting':'downloadFrame');
    syncFeedback();
  }
  function syncFrame(){
    const video=state.video,total=video?video.frames:0,frame=video?state.frame+1:0,fps=video?video.FPS:1;
    for(const id of ['#svgaTimeline','#svgaFrameNumber']){$(id).min=video?1:0;$(id).max=total;$(id).value=frame}
    $('#svgaFrameTotal').textContent='/ '+total;$('#svgaFps').textContent=video?fps+' FPS':'— FPS';
    $('#svgaTime').textContent=(video?state.frame/fps:0).toFixed(2)+' / '+(video?total/fps:0).toFixed(2)+' '+t('seconds');
    $('#svgaTimeline').setAttribute('aria-valuetext',video?(language==='zh'?`第 ${frame} 帧，共 ${total} 帧`:`Frame ${frame} of ${total}`):t('noFile'));
  }
  function syncLanguage(){
    document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
    document.querySelectorAll('[data-i18n-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nLabel)));
    $('#toolsNavigation').setAttribute('aria-label',t('navLabel'));$('#svgaDropzone').setAttribute('aria-label',t('dropSvga'));$('#svgaPlayer').setAttribute('aria-label',t('animationPreview'));$('#frameOutputCanvas').setAttribute('aria-label',t('exportTitle'));
    $('#frameSizeError').classList.toggle('hidden',state.dimensionValid);
    if(state.notice)setNotice(state.notice);
    if(state.video)$('#svgaFileMeta').textContent=`${t('original')} ${state.video.videoSize.width} × ${state.video.videoSize.height} · ${state.video.frames} ${language==='zh'?'帧':'frames'} · ${state.video.FPS} FPS`;
    syncControls();syncFrame();syncDownloadResult();if(window.BannerTool)window.BannerTool.syncLanguage();if(window.Hub)window.Hub.syncLanguage();window.ResourceLibrary?.syncLanguage();updateDocumentTitle();
  }
  function updateDocumentTitle(){document.title=t(({banner:'navBannerTitle',avatar:'navAvatarTitle',room:'navRoomTitle',home:'homeTitle',statistics:'statisticsTitle',resources:'navResourcesTitle'})[state.active])+' · Fun Toolkit'}
  function activateTool(){
    const next=currentTool(),changed=next!==state.active;if(next!=='avatar')pause();state.active=next;
    $('#roomTool').classList.toggle('hidden',next!=='room');$('#avatarTool').classList.toggle('hidden',next!=='avatar');$('#bannerTool').classList.toggle('hidden',next!=='banner');
    $('#resourceTool').classList.toggle('hidden',next!=='resources');
    $('#homeTool').classList.toggle('hidden',next!=='home');$('#statisticsTool').classList.toggle('hidden',next!=='statistics');
    window.FunToolkitUI?.activate(next);
    document.querySelectorAll('[data-tool-link]').forEach(link=>{if(link.dataset.toolLink===next)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
    for(const [selector,page] of [['#brandHome','home'],['#footerStatistics','statistics']]){const link=$(selector);if(next===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')}
    $('#examplesButton').classList.toggle('hidden',next!=='room');updateDocumentTitle();
    if(window.Hub)window.Hub.activate(next);
    if(next==='resources')window.ResourceLibrary?.activate();
    if(changed)window.scrollTo?.({top:0,behavior:'auto'});
    if(next==='avatar'&&state.video)seek(state.frame);
  }
  function ensurePlayers(){
    if(player)return;
    if(!window.SVGA||!window.JSZip)throw new Error('unavailable');
    player=new SVGA.Player(playerHost);player.clearsAfterStop=false;player.loops=0;player.setContentMode('AspectFit');
    exportPlayer=new SVGA.Player(exportHost);exportPlayer.clearsAfterStop=false;exportPlayer.setContentMode('AspectFit');
    player.onFrame(frame=>{state.frame=Math.max(0,Math.min(state.video.frames-1,Math.round(frame)));syncFrame();const now=performance.now();if(now-state.lastPreview>=90){drawOutputPreview();state.lastPreview=now}});
  }
  // The pinned SDK exposes readiness on its renderer, but no public ready event.
  // Wait for decoded assets rather than exporting a temporarily empty canvas.
  function waitForRenderer(target){
    return new Promise((resolve,reject)=>{const start=performance.now();function check(){if(target._renderer&&target._renderer._prepared){resolve();return}if(performance.now()-start>15000){reject(new Error('loadTimeout'));return}setTimeout(check,20)}check()});
  }
  function sizeExportRenderer(side){const size=Math.ceil(Math.max(side,state.video.videoSize.width,state.video.videoSize.height));exportHost.style.width=size+'px';exportHost.style.height=size+'px';return size}
  function renderExportFrame(side){
    const size=sizeExportRenderer(side);
    if(renderedVideo!==state.video||renderedFrame!==state.frame||renderedSize!==size){
      exportPlayer.stepToFrame(state.frame,false);renderedVideo=state.video;renderedFrame=state.frame;renderedSize=size;
    }
    return exportHost.querySelector('canvas');
  }
  function drawOutputPreview(){
    if(!state.video||!exportPlayer||previewVideo===state.video&&previewFrame===state.frame)return;
    const source=renderExportFrame(240);if(!source)return;
    const ctx=output.getContext('2d');ctx.clearRect(0,0,240,240);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,240,240);previewVideo=state.video;previewFrame=state.frame;
  }
  function pause(){if(player&&state.video)player.pauseAnimation();state.playing=false;syncControls();if(state.video){syncFrame();drawOutputPreview()}}
  function seek(frame){if(!state.video||state.loading||state.exporting)return;pause();state.frame=Math.max(0,Math.min(state.video.frames-1,Math.round(Number(frame)||0)));player.stepToFrame(state.frame,false);syncFrame();drawOutputPreview()}
  function togglePlayback(){
    if(!state.video||state.loading||state.exporting)return;
    if(state.playing){pause();return}
    if(state.active!=='avatar'||document.hidden)return;
    state.playing=true;player.stepToFrame(state.frame,true);syncControls();
  }
  async function validateFile(file){
    if(!file||!file.name.toLowerCase().endsWith('.svga'))throw new Error('typeError');
    if(file.size>50*1024*1024)throw new Error('sizeError');
    if(file.size<4)throw new Error('loadError');
    const header=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(header[0]===80&&header[1]===75){
      const zip=await JSZip.loadAsync(await file.arrayBuffer());
      const spec=zip.file('movie.spec');if(!spec)throw new Error('loadError');
      const movie=JSON.parse(await spec.async('string'));
      if(!movie.movie)throw new Error('loadError');
      for(const image of Object.values(movie.images||{}))if(typeof image==='string'&&!zip.file(image+'.png'))throw new Error('loadError');
    }else if(header[0]!==0x78)throw new Error('loadError');
  }
  function parseFile(file){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('loadTimeout')),15000);new SVGA.Parser().load(file,video=>{clearTimeout(timer);resolve(video)},()=>{clearTimeout(timer);reject(new Error('loadError'))})})}
  function validateVideo(video){
    const {width,height}=video.videoSize||{};
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>4096||height>4096||!Number.isInteger(video.frames)||video.frames<1||video.frames>20000||!Number.isFinite(video.FPS)||video.FPS<=0)throw new Error('invalidAnimation');
  }
  async function loadSvga(files){
    if(state.loading||state.exporting)return;
    const selected=Array.from(files);if(!selected.length)return;if(selected.length!==1){setNotice('fileCount');return}
    const file=selected[0],previous=state.video;pause();state.loading=true;setNotice(null);syncControls();
    try{
      ensurePlayers();await validateFile(file);const video=await parseFile(file);validateVideo(video);
      // Mount while visible so the SDK can calculate its preview transform.
      playerHost.classList.remove('hidden');$('#svgaEmpty').classList.add('hidden');
      invalidateFrameRender();player.setVideoItem(video);
      const renderSize=Math.ceil(Math.max(240,video.videoSize.width,video.videoSize.height));exportHost.style.width=renderSize+'px';exportHost.style.height=renderSize+'px';exportPlayer.setVideoItem(video);
      await Promise.all([waitForRenderer(player),waitForRenderer(exportPlayer)]);
      state.video=video;state.file=file;state.frame=0;releaseDownload();
      $('#svgaFileName').textContent=file.name;$('#svgaFileName').title=file.name;$('#svgaSourcebar').classList.remove('hidden');$('#frameOutputEmpty').classList.add('hidden');
      $('#svgaDropzone').removeAttribute('role');$('#svgaDropzone').removeAttribute('tabindex');
      state.loading=false;player.stepToFrame(0,false);drawOutputPreview();syncLanguage();
      window.FunToolkitUI?.reveal(playerHost);window.FunToolkitUI?.reveal(output);
    }catch(error){
      state.video=previous;
      if(previous){invalidateFrameRender();player.setVideoItem(previous);sizeExportRenderer(240);exportPlayer.setVideoItem(previous);await Promise.all([waitForRenderer(player),waitForRenderer(exportPlayer)]).catch(()=>{});player.stepToFrame(state.frame,false);drawOutputPreview()}
      else{playerHost.classList.add('hidden');$('#svgaEmpty').classList.remove('hidden')}
      setNotice(strings.en[error.message]?error.message:'loadError');
    }finally{state.loading=false;syncControls();syncFrame()}
  }
  function changeDimension(changed){
    const value=Number(changed.value),valid=changed.value.trim()!==''&&Number.isInteger(value)&&value>=16&&value<=2048;
    state.dimensionValid=valid;$('#frameSizeError').classList.toggle('hidden',valid);
    for(const id of ['#frameWidth','#frameHeight'])$(id).setAttribute('aria-invalid',String(!valid));
    if(valid){state.dimension=value;$('#frameWidth').value=value;$('#frameHeight').value=value;releaseDownload()}
    syncControls();
  }
  async function exportFrame(){
    if(!state.video||state.loading||state.exporting||!state.dimensionValid)return;
    pause();state.exporting=true;setNotice(null);syncControls();
    try{
      const side=state.dimension;let canvas=output;
      if(side!==240){
        const source=renderExportFrame(side);canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,side,side);
      }
      // Encode once at a balanced quality while retaining alpha and the selected size.
      const blob=await canvasToWebP(canvas,.85);
      releaseDownload();const base=state.file.name.replace(/\.svga$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'avatar-frame';
      state.download=`${base}-frame-${String(state.frame+1).padStart(3,'0')}-${side}x${side}.webp`;state.downloadUrl=URL.createObjectURL(blob);
      window.Hub?.record('avatar','generated');
      const link=document.createElement('a');link.href=state.downloadUrl;link.download=state.download;link.hidden=true;document.body.append(link);link.click();window.Hub?.record('avatar','download');link.remove();syncDownloadResult();window.FunToolkitUI?.reveal($('#frameDownloadResult'));
    }catch(error){setNotice('exportError')}
    finally{if(renderedSize>Math.max(240,state.video.videoSize.width,state.video.videoSize.height))renderExportFrame(240);state.exporting=false;syncControls()}
  }
  for(const id of ['#svgaUpload','#svgaReplace'])$(id).addEventListener('click',event=>{event.stopPropagation();input.click()});
  input.addEventListener('change',event=>{loadSvga(event.target.files);event.target.value=''});
  $('#svgaDropzone').addEventListener('click',()=>{if(!state.video&&!state.loading)input.click()});
  $('#svgaDropzone').addEventListener('keydown',event=>{if(event.target===$('#svgaDropzone')&&!state.video&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(!state.loading)input.click()}});
  let dragDepth=0;
  $('#svgaDropzone').addEventListener('dragenter',event=>{event.preventDefault();dragDepth++;$('#svgaDropzone').classList.add('drag')});
  $('#svgaDropzone').addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy'});
  $('#svgaDropzone').addEventListener('dragleave',event=>{event.preventDefault();if(--dragDepth<=0){dragDepth=0;$('#svgaDropzone').classList.remove('drag')}});
  $('#svgaDropzone').addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('#svgaDropzone').classList.remove('drag');return loadSvga(event.dataTransfer.files)});
  // Accept a file dropped anywhere on the active avatar tool, including its sidebar.
  document.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();if(state.active==='avatar')$('#svgaDropzone').classList.add('drag')}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget){dragDepth=0;$('#svgaDropzone').classList.remove('drag')}});
  document.addEventListener('drop',event=>{if(!event.dataTransfer?.files.length)return;event.preventDefault();dragDepth=0;$('#svgaDropzone').classList.remove('drag');if(state.active==='avatar'&&!$('#svgaDropzone').contains(event.target))return loadSvga(event.dataTransfer.files)});
  $('#svgaPlay').addEventListener('click',togglePlayback);$('#svgaPrevious').addEventListener('click',()=>seek(state.frame-1));$('#svgaNext').addEventListener('click',()=>seek(state.frame+1));
  $('#svgaTimeline').addEventListener('pointerdown',pause);$('#svgaFrameNumber').addEventListener('focus',pause);
  $('#svgaTimeline').addEventListener('input',event=>seek(Number(event.target.value)-1));$('#svgaFrameNumber').addEventListener('change',event=>seek(Number(event.target.value)-1));$('#svgaFrameNumber').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();seek(Number(event.target.value)-1)}});
  for(const id of ['#frameWidth','#frameHeight'])$(id).addEventListener('input',event=>changeDimension(event.target));
  $('#frameDownload').addEventListener('click',exportFrame);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)pause()});
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting&&state.playing)pause()}).observe($('#svgaDropzone'));
  document.querySelectorAll('[data-tool-link]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();const hash=link.getAttribute('href');if(location.hash!==hash)location.hash=hash;activateTool();
  }));
  window.addEventListener('hashchange',activateTool);
  window.addEventListener('pagehide',()=>{pause();releaseDownload()});
  new ResizeObserver(()=>{if(state.video&&!state.loading&&!state.playing)player.stepToFrame(state.frame,false)}).observe(playerHost);
  window.Toolkit={syncLanguage};
  let savedLanguage;try{savedLanguage=localStorage.getItem('spreadfun-toolkit-language')}catch(error){}
  if(savedLanguage==='zh'||savedLanguage==='en')setLanguage(savedLanguage);
  activateTool();syncLanguage();
})();
