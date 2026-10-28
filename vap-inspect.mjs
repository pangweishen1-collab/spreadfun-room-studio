import {extractVapcBox} from './vap-protocol.mjs?v=20261028-resources1';

// A VAP resource stays packed H.264. Playback must reconstruct its embedded alpha.
export async function readVapFile(file){
  if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>200*1024*1024)throw new Error('file');
  let config;try{config=extractVapcBox(new Uint8Array(await file.arrayBuffer()))}catch{throw new Error('format')}
  return {blob:file,config};
}

if(typeof document!=='undefined'){
  const $=id=>document.getElementById(id),frame=$('vapResultFrame'),input=$('fileInput');
  const copy={zh:{title:'VAP 透明验收',back:'返回 VAP 工具',explanation:'VAP 需要专用播放器合成透明效果。普通视频播放器会显示原画面与黑白遮罩。',preview:'成品透明效果',open:'打开 VAP MP4',empty:'点击、拖入或粘贴已导出的 VAP MP4',pasteHint:'支持复制粘贴，按 ⌘V / Ctrl+V 上传',idle:'读取内嵌 Alpha，在本机播放，不会重新编码或上传文件。',loading:'正在读取 VAP 成品…',rendering:'正在合成透明效果…',ready:'已按内嵌 Alpha 合成；可切换透明、黑、白背景检查边缘。',file:'请选择 200 MB 以内的非空 MP4 文件。',format:'未找到有效的 VAP v2 配置。这可能是普通 MP4，请先用 VAP 工具转换。',error:'透明播放失败，请重试或使用最新版 Chrome／Edge。',checker:'透明',black:'黑',white:'白',background:'预览背景',resources:'替换播放资源',applyResources:'应用资源',resourceHint:'头像与文字通过标签替换，直接更新播放效果，无需重新编码。',missingResources:'请为图片标签选择资源后播放。',resourceImage:'选择图片',resourceText:'文字',resourceFile:'请选择 10 MB 以内的 PNG、JPG 或 WebP 图片。',resourceReady:'资源已就绪，可点击应用资源。'},en:{title:'VAP transparency check',back:'Back to VAP tool',explanation:'VAP requires an alpha-aware player. Regular video players display RGB and the grayscale mask.',preview:'Composited output',open:'Open VAP MP4',empty:'Click, drop or paste an exported VAP MP4',pasteHint:'Paste with ⌘V / Ctrl+V to upload',idle:'Read embedded alpha locally. No re-encoding or upload.',loading:'Reading VAP file…',rendering:'Compositing transparency…',ready:'Embedded alpha applied. Check edges against transparent, black and white backgrounds.',file:'Choose a non-empty MP4 up to 200 MB.',format:'No valid VAP v2 configuration found. Convert ordinary MP4 with the VAP tool first.',error:'Transparent playback failed. Retry or use current Chrome / Edge.',checker:'Transparent',black:'Black',white:'White',background:'Preview background',resources:'Playback resources',applyResources:'Apply resources',resourceHint:'Replace avatars and text by tag. Playback updates without re-encoding.',missingResources:'Bind each image tag before playback.',resourceImage:'Choose image',resourceText:'Text',resourceFile:'Choose a PNG, JPEG or WebP image up to 10 MB.',resourceReady:'Resources ready. Choose Apply resources.'}};
  let lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh',phase='idle',version=0,url=null,file=null,config=null,reading=false,tags=Object.create(null),resourceImages=new Map(),resourceRows=[];
  const t=key=>copy[lang][key];
  function sync(){
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=t('title')+' · Fun Toolkit';
    for(const [id,key] of [['title','title'],['backLink','back'],['explanation','explanation'],['previewTitle','preview'],['openFile','open'],['emptyTitle','empty'],['pasteHint','pasteHint'],['status',phase]])$(id).textContent=t(key);
    $('language').textContent=lang==='zh'?'EN':'中文';$('backLink').href='index.html#vap-tools';$('backgrounds').setAttribute('aria-label',t('background'));frame.setAttribute('aria-label',t('preview'));
    $('openFile').disabled=reading;frame.setAttribute('aria-busy',String(reading));
    for(const button of $('backgrounds').querySelectorAll('button'))button.textContent=t(button.dataset.background);
    $('fileMeta').hidden=!file;if(file)$('fileMeta').textContent=`${file.name} · ${config.info.w} × ${config.info.h} px · ${config.info.fps} fps · ${(file.size/1000000).toFixed(2)} MB`;
    $('resourceTitle').textContent=t('resources');$('applyResources').textContent=t('applyResources');$('resourceHint').textContent=t('resourceHint');
    for(const row of resourceRows){row.pick&&(row.pick.textContent=t('resourceImage'));row.label.textContent=(row.source.srcType==='txt'?t('resourceText')+' · ':'')+row.source.srcTag;}
    $('applyResources').disabled=reading||!config||missingResources().length>0;
    window.VapResultPlayer?.setLanguage();
  }
  function missingResources(){try{return config?window.VapResultPlayer.getMissingTags(config,tags):[]}catch{return ['invalid']}}
  function releaseImages(){for(const value of resourceImages.values())URL.revokeObjectURL(value);resourceImages.clear()}
  function mountResources(){
    if(!file||!config)return;
    if(missingResources().length){window.VapResultPlayer.destroy();phase='missingResources';sync();return;}
    phase='rendering';document.dispatchEvent(new CustomEvent('vap:active',{detail:{active:true}}));document.dispatchEvent(new CustomEvent('vap:result',{detail:{url,config,tags:{...tags}}}));sync();
  }
  function buildResources(){
    releaseImages();tags=Object.create(null);resourceRows=[];$('resourceFields').replaceChildren();
    const sources=config.src||[];$('resourceBindings').hidden=!sources.length;
    for(const source of sources){
      const wrap=document.createElement('div'),label=document.createElement('label'),row={source,label};wrap.className='resource-row';
      label.id='resourceLabel'+resourceRows.length;wrap.append(label);
      if(source.srcType==='txt'){
        const input=document.createElement('input'),tag=source.srcTag,short=tag.replace(/^\[(.*)\]$/,'$1'),defaults=config.funToolkit?.resourceDefaults||{};
        input.type='text';input.maxLength=200;input.value=defaults[tag]??defaults[short]??'';input.setAttribute('aria-labelledby',label.id);tags[tag]=input.value;
        input.addEventListener('input',()=>{tags[tag]=input.value;phase='resourceReady';sync()});wrap.append(input);
      }else{
        const pick=document.createElement('button'),input=document.createElement('input'),name=document.createElement('span');pick.type='button';input.type='file';input.accept='image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';input.hidden=true;pick.setAttribute('aria-labelledby',label.id);row.pick=pick;name.className='resource-filename';
        pick.addEventListener('click',()=>input.click());input.addEventListener('change',async()=>{
          const candidate=input.files?.[0];input.value='';if(!candidate)return;const token=version;pick.disabled=true;let bitmap;
          try{
            if(candidate.size<=0||candidate.size>10*1024*1024||!/^image\/(png|jpeg|webp)$/i.test(candidate.type))throw Error('resourceFile');
            bitmap=await createImageBitmap(candidate);if(Math.max(bitmap.width,bitmap.height)>8192||bitmap.width*bitmap.height>32e6)throw Error('resourceFile');
            if(token!==version)return;const next=URL.createObjectURL(candidate),old=resourceImages.get(source.srcTag);resourceImages.set(source.srcTag,next);tags[source.srcTag]=next;if(old)URL.revokeObjectURL(old);name.textContent=candidate.name;phase='resourceReady';
          }catch{if(token===version)phase='resourceFile'}finally{bitmap?.close();if(token===version){pick.disabled=false;sync()}}
        });wrap.append(pick,input,name);
      }
      resourceRows.push(row);$('resourceFields').append(wrap);
    }
  }
  $('applyResources').addEventListener('click',mountResources);
  async function load(candidate){
    const token=++version;reading=true;phase='loading';sync();
    try{
      const result=await readVapFile(candidate);if(token!==version)return;
      window.VapResultPlayer.getMissingTags(result.config,{});
      const next=URL.createObjectURL(result.blob),old=url;
      window.VapResultPlayer.destroy();url=next;file=candidate;config=result.config;
      if(old)URL.revokeObjectURL(old);
      frame.classList.remove('upload-ready','is-dragging');$('empty').hidden=true;$('vapResultPlayer').hidden=false;
      buildResources();mountResources();
    }catch(error){if(token===version)phase=['file','format'].includes(error.message)?error.message:'error'}
    finally{if(token===version){reading=false;sync()}}
  }
  window.UploadPaste?.register({zone:frame,isActive:()=>true,isBusy:()=>reading,onFiles:files=>{if(files.length===1)void load(files[0]);else{phase='file';sync()}}});
  $('openFile').addEventListener('click',()=>{if(!reading)input.click()});
  frame.addEventListener('click',()=>{if(!file&&!reading)input.click()});
  input.addEventListener('change',()=>{const candidate=input.files?.[0];input.value='';if(candidate)void load(candidate)});
  for(const event of ['dragenter','dragover'])frame.addEventListener(event,e=>{e.preventDefault();if(!file&&!reading)frame.classList.add('is-dragging')});
  frame.addEventListener('dragleave',()=>frame.classList.remove('is-dragging'));
  frame.addEventListener('drop',e=>{e.preventDefault();frame.classList.remove('is-dragging');const candidate=e.dataTransfer?.files?.[0];if(candidate&&!reading)void load(candidate)});
  for(const button of $('backgrounds').querySelectorAll('button'))button.addEventListener('click',()=>{frame.dataset.background=button.dataset.background;for(const peer of $('backgrounds').querySelectorAll('button'))peer.setAttribute('aria-pressed',String(peer===button))});
  document.addEventListener('vap:player-state',e=>{if(!file)return;if(e.detail.state==='ready')phase='ready';else if(e.detail.state==='error')phase='error';else return;sync()});
  $('language').addEventListener('click',()=>{lang=lang==='zh'?'en':'zh';sync()});
  window.addEventListener('pagehide',()=>{version++;releaseImages();if(url)URL.revokeObjectURL(url);url=null});
  sync();
}
