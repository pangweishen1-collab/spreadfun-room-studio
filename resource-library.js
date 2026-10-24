/* Company logos: local resizing and format export. No uploads or production events. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const projects=[
    {id:'yari',name:'Yari',width:8192,height:8192,sizes:[512,1024,2048,4096]},
    {id:'hapi',name:'Hapi',width:512,height:512,sizes:[512]},
    {id:'hapi-middle-east',name:'Hapi',width:512,height:512,sizes:[512],regional:true},
    {id:'4fun',name:'4Fun',width:1024,height:1024,sizes:[512,1024]},
    {id:'maza',name:'Maza',width:512,height:512,sizes:[512]},
    {id:'hapi-ludo',name:'Hapi Ludo',width:4000,height:4000,sizes:[512,1024,2048,4000]}
  ];
  const markets={ios:{side:1024,slug:'app-store'},android:{side:512,slug:'google-play'}};
  const strings={
    zh:{corners:'圆角',cornerHint:'0% 直角 · 50% 圆形',cornerMarket:'商店预设固定为直角',cornerError:'请输入 0–50 之间的整数。',square:'直角',circle:'圆形',target:'输出用途',custom:'自定义尺寸',ios:'iOS · App Store',android:'Android · Google Play',iosHint:'1024 × 1024 · RGB PNG · 无透明通道，透明区域填白。',androidHint:'512 × 512 · RGBA PNG · sRGB · 不超过 1024 KB。',marketGuide:'商店图标规范',marketScope:'商店主图预设；不裁圆角、不加外部阴影。',marketEngineering:'仅导出平面商店图标，不包含 Adaptive 分层或 Icon Composer 工程。',iosSpec:'App Store：1024 × 1024，PNG，不透明。',androidSpec:'Google Play：512 × 512，32 位 PNG，≤ 1024 KB。',official:'官方规范',marketUnsupported:'浏览器暂不支持商店 PNG 编码，请更新浏览器后重试。',marketSizeError:'Google Play 图标超过 1024 KB，未发起下载。',marketExportError:'商店图标未能生成，请重试。',title:'资源库',projects:'选择项目',export:'导出 Logo',preview:'Logo 预览',original:'原图',size:'输出尺寸',width:'宽度',height:'高度',locked:'1:1 比例锁定',presets:'常用尺寸',format:'文件格式',reading:'正在读取 Logo…',encoding:'正在生成文件…',download:'下载',downloading:'正在导出…',dimensionError:'请输入 16–4096 之间的整数。',upscale:'所选尺寸超过原图，放大后可能变模糊。',jpgNote:'JPG 不支持透明背景，透明区域会填充为白色。',loadError:'Logo 读取失败，请重试。',retry:'重新加载',encodeError:'文件生成失败，请重试。',formatError:'浏览器未能生成所选格式，请更换格式后重试。',downloadError:'未能发起下载，请重试。',receipt:'已发起下载',downloadAgain:'再次下载',middleEast:'中东 Hapi',select:'选择'},
    en:{corners:'Corner radius',cornerHint:'0% square · 50% circle',cornerMarket:'Store presets stay square.',cornerError:'Enter a whole number from 0 to 50.',square:'Square',circle:'Circle',target:'Export for',custom:'Custom size',ios:'iOS · App Store',android:'Android · Google Play',iosHint:'1024 × 1024 · RGB PNG · No alpha; transparent areas become white.',androidHint:'512 × 512 · RGBA PNG · sRGB · Up to 1024 KB.',marketGuide:'Store icon guidelines',marketScope:'Flat store icons. No added rounded corners or outer shadows.',marketEngineering:'Flat store artwork only; no Adaptive layers or Icon Composer project.',iosSpec:'App Store: 1024 × 1024, opaque PNG.',androidSpec:'Google Play: 512 × 512, 32-bit PNG, ≤ 1024 KB.',official:'Official guidelines',marketUnsupported:'Store PNG encoding is unavailable. Update your browser and retry.',marketSizeError:'The Google Play icon exceeds 1024 KB. No download started.',marketExportError:'Could not create the store icons. Please retry.',title:'Asset library',projects:'Choose a project',export:'Export logo',preview:'Logo preview',original:'Original',size:'Output size',width:'Width',height:'Height',locked:'1:1 locked',presets:'Quick sizes',format:'File format',reading:'Loading logo…',encoding:'Creating file…',download:'Download',downloading:'Exporting…',dimensionError:'Enter a whole number from 16 to 4096.',upscale:'This size exceeds the original and may look softer.',jpgNote:'JPG uses white for transparent areas.',loadError:'Could not load this logo. Please retry.',retry:'Reload logo',encodeError:'Could not create the file. Please retry.',formatError:'This browser could not create the selected format. Try another format.',downloadError:'Could not start the download. Please retry.',receipt:'Download requested',downloadAgain:'Download again',middleEast:'Middle East Hapi',select:'Select'}
  };
  const state={radius:0,radiusValid:true,target:'custom',custom:{side:512,format:'png'},project:projects[0],side:512,format:'png',ready:false,busy:false,valid:true,phase:'empty',notice:null,download:null};
  const t=key=>(strings[language]||strings.en)[key];
  const projectName=project=>project.regional?t('middleEast'):project.name;
  const assetPath=(project,size)=>`assets/resources/${project.id}-${size}.webp`;
  const sourceFor=(project,side)=>assetPath(project,project.sizes.find(size=>size>=side)||project.sizes.at(-1));
  let initialized=false,previewTask=0,sourceCache=null;
  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>image.naturalWidth?resolve(image):reject(new Error('loadError'));image.onerror=()=>reject(new Error('loadError'));image.src=src})}
  function exportImage(project,side){
    const src=sourceFor(project,side);
    if(!sourceCache||sourceCache.src!==src){
      const record={src,promise:loadImage(src)};sourceCache=record;
      record.promise.catch(()=>{if(sourceCache===record)sourceCache=null});
    }
    return sourceCache.promise;
  }
  function releaseDownload(){
    if(state.download){const url=state.download.url;setTimeout(()=>URL.revokeObjectURL(url),60000)}
    state.download=null;$('#resourceReceipt').replaceChildren();$('#resourceReceipt').classList.add('hidden');
  }
  function syncReceipt(){
    if(!state.download)return;
    const receipt=$('#resourceReceipt');receipt.replaceChildren();receipt.classList.remove('hidden');
    const text=document.createElement('span');text.textContent=`${t('receipt')} · ${(state.download.blob.size/1024).toFixed(1)} KB`;
    const link=document.createElement('a');link.href=state.download.url;link.download=state.download.name;link.textContent=`${t('downloadAgain')} · ${state.download.name}`;
    link.addEventListener('click',event=>{if(state.busy)event.preventDefault()});link.setAttribute('aria-disabled',String(state.busy));
    receipt.append(text,link);
  }
  function syncControls(){
    const root=$('#resourceTool'),button=$('#resourceDownload');
    const market=markets[state.target];
    const guide=$('#resourceMarketGuide');guide.classList.toggle('hidden',!market);if(!market)guide.open=false;
    root.querySelectorAll('[data-project],#resourceWidth,#resourceHeight,[data-resource-size],input[name="resourceFormat"]').forEach(node=>node.disabled=state.busy);
    for(const id of ['#resourceWidth','#resourceHeight']){$(id).readOnly=!!market;$(id).setAttribute('aria-readonly',String(!!market))}
    root.querySelectorAll('input[name="resourceFormat"]').forEach(node=>{node.disabled=state.busy||!!market;node.checked=node.value===state.format});
    $('#resourceTarget').disabled=state.busy;$('#resourceTarget').value=state.target;
    $('#resourceTargetNote').textContent=market?t(state.target+'Hint'):'';$('#resourceTargetNote').classList.toggle('hidden',!market);
    $('#resourceTarget').setAttribute('aria-describedby',market?'resourceTargetNote':'');
    $('#resourcePresets').classList.toggle('hidden',!!market);$('#resourceFormatField').classList.toggle('hidden',!!market);
    const radius=market?0:state.radius;
    for(const id of ['#resourceCornerRange','#resourceCornerNumber']){$(id).disabled=state.busy||!!market;$(id).setAttribute('aria-invalid',String(!state.radiusValid));$(id).setAttribute('aria-describedby',state.radiusValid?'resourceCornerNote':'resourceCornerError')}
    $('#resourceCornerRange').setAttribute('aria-valuetext',`${radius}%${radius===0?' · '+t('square'):radius===50?' · '+t('circle'):''}`);
    $('#resourceCornerNote').textContent=t(market?'cornerMarket':'cornerHint');
    $('#resourceCornerError').textContent=t('cornerError');$('#resourceCornerError').classList.toggle('hidden',state.radiusValid);
    const surface=$('#resourcePreviewSurface');surface.hidden=!state.ready;surface.classList.toggle('is-opaque',state.format==='jpg'||state.target==='ios');
    $('#resourcePreview').style.borderRadius=radius+'%';
    root.querySelectorAll('[data-project]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.project===state.project.id)));
    root.querySelectorAll('[data-resource-size]').forEach(node=>node.setAttribute('aria-pressed',String(state.valid&&Number(node.dataset.resourceSize)===state.side)));
    button.disabled=state.busy||!state.ready||!state.valid||!state.radiusValid;button.setAttribute('aria-busy',String(state.busy));
    button.textContent=state.busy?t('downloading'):`${t('download')} ${market?t(state.target):{png:'PNG',jpg:'JPG',webp:'WebP'}[state.format]}`;
    $('#resourceDimensionError').textContent=t('dimensionError');$('#resourceDimensionError').classList.toggle('hidden',state.valid);
    const description=!state.valid?'resourceDimensionError':state.side>state.project.width?'resourceUpscale':'';
    for(const id of ['#resourceWidth','#resourceHeight']){$(id).setAttribute('aria-invalid',String(!state.valid));$(id).setAttribute('aria-describedby',description)}
    $('#resourceUpscale').textContent=t('upscale');$('#resourceUpscale').classList.toggle('hidden',!state.valid||state.side<=state.project.width);
    $('#resourceJpgNote').textContent=t('jpgNote');$('#resourceJpgNote').classList.toggle('hidden',state.format!=='jpg');
    $('#resourceNotice').textContent=state.notice?t(state.notice):'';$('#resourceNotice').classList.toggle('hidden',!state.notice);
    $('#resourceSelectedName').textContent=projectName(state.project);
    $('#resourceOriginalSize').textContent=`${t('original')} ${state.project.width} × ${state.project.height} px`;
    $('#resourcePreview').alt=projectName(state.project)+' Logo';
    const phase=state.busy?'processing':!state.valid||!state.radiusValid?'error':state.phase;
    window.FunToolkitUI?.setState('resources',{phase,message:state.busy?t('encoding'):phase==='loading'?t('reading'):undefined});
    syncReceipt();
  }
  function renderCatalog(){
    const catalog=$('#resourceCatalog');catalog.replaceChildren();
    for(const project of projects){
      const button=document.createElement('button');button.type='button';button.className='resource-project';button.dataset.project=project.id;button.setAttribute('aria-label',`${t('select')} ${projectName(project)}`);
      const thumb=document.createElement('span');thumb.className='resource-project-art';
      const image=document.createElement('img');image.src=assetPath(project,256);image.alt='';image.width=256;image.height=256;image.decoding='async';image.loading='lazy';thumb.append(image);
      const name=document.createElement('span');name.className='resource-project-name';name.textContent=projectName(project);
      const check=document.createElement('span');check.className='resource-project-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
      button.append(thumb,name,check);button.addEventListener('click',()=>selectProject(project));catalog.append(button);
    }
  }
  async function selectProject(project){
    if(state.busy||project===state.project&&state.ready&&state.phase!=='error')return;
    state.project=project;state.ready=false;state.phase='loading';state.notice=null;releaseDownload();
    const task=++previewTask;$('#resourcePreview').hidden=true;$('#resourcePreviewSkeleton').hidden=false;$('#resourcePreviewError').hidden=true;syncControls();
    try{
      await loadImage(assetPath(project,512));if(task!==previewTask)return;
      const image=$('#resourcePreview');image.src=assetPath(project,512);image.hidden=false;
      state.ready=true;state.phase='ready';$('#resourcePreviewSkeleton').hidden=true;syncControls();window.FunToolkitUI?.reveal(image);
    }catch(error){
      if(task!==previewTask)return;
      state.phase='error';state.notice='loadError';$('#resourcePreviewSkeleton').hidden=true;$('#resourcePreviewError').hidden=false;syncControls();
    }
  }
  function chooseTarget(target){
    if(state.busy||target!=='custom'&&!markets[target])return;
    if(state.target==='custom')state.custom={side:state.side,format:state.format};
    state.target=target;state.side=markets[target]?.side||state.custom.side;state.format=markets[target]?'png':state.custom.format;state.valid=true;
    state.radiusValid=true;$('#resourceCornerRange').value=markets[target]?0:state.radius;$('#resourceCornerNumber').value=markets[target]?0:state.radius;
    $('#resourceWidth').value=state.side;$('#resourceHeight').value=state.side;state.notice=null;releaseDownload();if(state.ready)state.phase='ready';syncControls();
  }
  function changeDimension(input){
    if(state.busy||state.target!=='custom')return;
    const value=Number(input.value);state.valid=input.value.trim()!==''&&Number.isInteger(value)&&value>=16&&value<=4096;
    if(state.valid){state.side=value;$('#resourceWidth').value=value;$('#resourceHeight').value=value}
    state.notice=null;releaseDownload();if(state.ready)state.phase='ready';syncControls();
  }
  function changeCorner(input){
    if(state.busy||state.target!=='custom')return;
    const value=Number(input.value);state.radiusValid=input.value.trim()!==''&&Number.isInteger(value)&&value>=0&&value<=50;
    if(state.radiusValid){state.radius=value;$('#resourceCornerRange').value=value;$('#resourceCornerNumber').value=value}
    state.notice=null;releaseDownload();if(state.ready)state.phase='ready';syncControls();
  }
  function chooseFormat(format){
    if(state.busy||state.target!=='custom'||!['png','jpg','webp'].includes(format))return;
    state.format=format;state.notice=null;releaseDownload();if(state.ready)state.phase='ready';syncControls();
  }
  async function encodeLogo(image,side,format,target='custom',radius=0){
    if(!Number.isInteger(side)||side<16||side>4096||!['png','jpg','webp'].includes(format))throw new Error('dimensionError');
    radius=markets[target]?0:radius;
    if(!Number.isInteger(radius)||radius<0||radius>50)throw new Error('cornerError');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=side;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('encodeError');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(format==='jpg'||target==='ios'){ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side)}
    if(radius){ctx.save();ctx.beginPath();ctx.roundRect(0,0,side,side,side*radius/100);ctx.clip()}
    ctx.drawImage(image,0,0,side,side);
    if(radius)ctx.restore();
    if(markets[target]){
      const blob=await window.MarketIconPNG.encode(canvas,{alpha:target==='android'});
      if(blob.type!=='image/png')throw new Error('formatError');
      if(target==='android'&&blob.size>1024*1024)throw new Error('marketSizeError');
      return blob;
    }
    const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[format];
    // Reuse the asynchronous native encoder so large logo exports do not
    // run the Banner WASM compressor on the main thread. WebP uses max quality.
    const blob=format==='webp'?await canvasToWebP(canvas,1):await new Promise((resolve,reject)=>{try{canvas.toBlob(value=>value?resolve(value):reject(new Error('encodeError')),mime,.96)}catch(error){reject(new Error('encodeError'))}});
    if(!blob||blob.type!==mime)throw new Error('formatError');
    return blob;
  }
  async function downloadLogo(){
    if(state.busy||!state.ready||!state.valid||!state.radiusValid)return;
    const project=state.project,side=state.side,format=state.format,target=state.target,radius=state.radius;
    const cacheKey=[project.id,side,format,target,markets[target]?0:radius].join(':');
    state.busy=true;state.notice=null;syncControls();let freshUrl;
    try{
      // Keep only the current receipt's Blob. Repeated downloads need no new
      // canvas or compression; any export setting change clears the receipt.
      const blob=state.download?.cacheKey===cacheKey?state.download.blob:
        await encodeLogo(await exportImage(project,side),side,format,target,radius);
      const name=markets[target]?`${project.id}-${markets[target].slug}-${side}x${side}.png`:`${project.id}-logo-${side}x${side}${radius?'-r'+radius+'pct':''}.${format}`;
      freshUrl=URL.createObjectURL(blob);const link=document.createElement('a');link.href=freshUrl;link.download=name;link.hidden=true;document.body.append(link);
      try{link.click()}catch(error){throw new Error('downloadError')}finally{link.remove()}
      releaseDownload();state.download={name,url:freshUrl,blob,cacheKey};freshUrl=null;state.phase='success';syncReceipt();window.FunToolkitUI?.reveal($('#resourceReceipt'));
    }catch(error){state.notice=strings.en[error.message]?error.message:'encodeError';state.phase='error'}
    finally{if(freshUrl)URL.revokeObjectURL(freshUrl);state.busy=false;syncControls()}
  }
  function syncLanguage(){
    document.querySelectorAll('[data-resource-i18n]').forEach(node=>node.textContent=t(node.dataset.resourceI18n));
    if(initialized){
      $('#resourceCatalog').querySelectorAll('[data-project]').forEach(node=>{const project=projects.find(item=>item.id===node.dataset.project);node.querySelector('.resource-project-name').textContent=projectName(project);node.setAttribute('aria-label',`${t('select')} ${projectName(project)}`)});
    }
    $('#resourcePresets').setAttribute('aria-label',t('presets'));$('#resourcePreviewStage').setAttribute('aria-label',t('preview'));
    syncControls();
  }
  function activate(){if(!initialized){initialized=true;renderCatalog();selectProject(state.project)}else syncControls()}
  for(const id of ['#resourceWidth','#resourceHeight'])$(id).addEventListener('input',event=>{if(!state.busy)changeDimension(event.target)});
  document.querySelectorAll('[data-resource-size]').forEach(button=>button.addEventListener('click',()=>{if(state.busy)return;$('#resourceWidth').value=button.dataset.resourceSize;changeDimension($('#resourceWidth'))}));
  document.querySelectorAll('input[name="resourceFormat"]').forEach(input=>input.addEventListener('change',()=>chooseFormat(input.value)));
  $('#resourceExportForm').addEventListener('submit',event=>{event.preventDefault();downloadLogo()});
  for(const id of ['#resourceCornerRange','#resourceCornerNumber'])$(id).addEventListener('input',event=>changeCorner(event.target));
  $('#resourceTarget').addEventListener('change',event=>chooseTarget(event.target.value));
  $('#resourceRetry').addEventListener('click',()=>selectProject(state.project));
  window.addEventListener('pagehide',event=>{if(!event.persisted){if(state.download)URL.revokeObjectURL(state.download.url);sourceCache=null}});
  window.ResourceLibrary={activate,syncLanguage};
  syncLanguage();
})();
