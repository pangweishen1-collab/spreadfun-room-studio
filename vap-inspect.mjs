import {extractVapcBox} from './vap-protocol.mjs';

// A VAP resource stays packed H.264. Playback must reconstruct its embedded alpha.
export async function readVapFile(file){
  if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>200*1024*1024)throw new Error('file');
  let config;try{config=extractVapcBox(new Uint8Array(await file.arrayBuffer()))}catch{throw new Error('format')}
  return {blob:file,config};
}

if(typeof document!=='undefined'){
  const $=id=>document.getElementById(id),frame=$('vapResultFrame'),input=$('fileInput');
  const copy={zh:{title:'VAP 透明验收',back:'返回 VAP 工具',explanation:'VAP 需要专用播放器合成透明效果。普通视频播放器会显示原画面与黑白遮罩。',preview:'成品透明效果',open:'打开 VAP MP4',empty:'点击、拖入或粘贴已导出的 VAP MP4',pasteHint:'支持复制粘贴，按 ⌘V / Ctrl+V 上传',idle:'读取内嵌 Alpha，在本机播放，不会重新编码或上传文件。',loading:'正在读取 VAP 成品…',rendering:'正在合成透明效果…',ready:'已按内嵌 Alpha 合成；可切换透明、黑、白背景检查边缘。',file:'请选择 200 MB 以内的非空 MP4 文件。',format:'未找到有效的 VAP v2 配置。这可能是普通 MP4，请先用 VAP 工具转换。',error:'透明播放失败，请重试或使用最新版 Chrome／Edge。',checker:'透明',black:'黑',white:'白',background:'预览背景'},en:{title:'VAP transparency check',back:'Back to VAP tool',explanation:'VAP requires an alpha-aware player. Regular video players display RGB and the grayscale mask.',preview:'Composited output',open:'Open VAP MP4',empty:'Click, drop or paste an exported VAP MP4',pasteHint:'Paste with ⌘V / Ctrl+V to upload',idle:'Read embedded alpha locally. No re-encoding or upload.',loading:'Reading VAP file…',rendering:'Compositing transparency…',ready:'Embedded alpha applied. Check edges against transparent, black and white backgrounds.',file:'Choose a non-empty MP4 up to 200 MB.',format:'No valid VAP v2 configuration found. Convert ordinary MP4 with the VAP tool first.',error:'Transparent playback failed. Retry or use current Chrome / Edge.',checker:'Transparent',black:'Black',white:'White',background:'Preview background'}};
  let lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'zh',phase='idle',version=0,url=null,file=null,config=null,reading=false;
  const t=key=>copy[lang][key];
  function sync(){
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.title=t('title')+' · Fun Toolkit';
    for(const [id,key] of [['title','title'],['backLink','back'],['explanation','explanation'],['previewTitle','preview'],['openFile','open'],['emptyTitle','empty'],['pasteHint','pasteHint'],['status',phase]])$(id).textContent=t(key);
    $('language').textContent=lang==='zh'?'EN':'中文';$('backLink').href='index.html#vap-tools';$('backgrounds').setAttribute('aria-label',t('background'));frame.setAttribute('aria-label',t('preview'));
    $('openFile').disabled=reading;frame.setAttribute('aria-busy',String(reading));
    for(const button of $('backgrounds').querySelectorAll('button'))button.textContent=t(button.dataset.background);
    $('fileMeta').hidden=!file;if(file)$('fileMeta').textContent=`${file.name} · ${config.info.w} × ${config.info.h} px · ${config.info.fps} fps · ${(file.size/1000000).toFixed(2)} MB`;
    window.VapResultPlayer?.setLanguage();
  }
  async function load(candidate){
    const token=++version;reading=true;phase='loading';sync();
    try{
      const result=await readVapFile(candidate);if(token!==version)return;
      const next=URL.createObjectURL(result.blob),old=url;
      window.VapResultPlayer.destroy();url=next;file=candidate;config=result.config;
      if(old)URL.revokeObjectURL(old);
      frame.classList.remove('upload-ready','is-dragging');$('empty').hidden=true;$('vapResultPlayer').hidden=false;
      document.dispatchEvent(new CustomEvent('vap:active',{detail:{active:true}}));
      phase='rendering';document.dispatchEvent(new CustomEvent('vap:result',{detail:{url,config}}));
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
  window.addEventListener('pagehide',()=>{version++;if(url)URL.revokeObjectURL(url);url=null});
  sync();
}
