/* One shared WebP preference, presented beside each image tool's outputs. */
(() => {
  'use strict';
  const api=window.FunWebP;if(!api)return;
  const definitions=[
    ['room','#roomTool','#exportsPanel .output-title-row'],
    ['avatar','#avatarTool','.frame-export .output-title-row'],
    ['banner','#bannerTool','.banner-export .output-title-row'],
    ['gift','#giftPreviewTool','#giftPreviewAdjustTitle'],
    ['resources','#resourceTool','#resourceExportTitle']
  ];
  const groups=[],toolBusy=new Map();
  for(const [tool,ownerSelector,anchorSelector] of definitions){
    const owner=document.querySelector(ownerSelector),anchor=owner?.querySelector(anchorSelector);if(!anchor)continue;
    const group=document.createElement('fieldset');group.className='webp-settings';group.dataset.webpTool=tool;
    const legend=document.createElement('legend');group.append(legend);
    const options=document.createElement('div');options.className='webp-settings-options';
    const buttons=['high','lossless'].map(mode=>{
      const button=document.createElement('button');button.type='button';button.dataset.webpMode=mode;
      button.addEventListener('click',()=>{if(!button.disabled)api.setMode(mode);sync()});options.append(button);return button;
    });
    group.append(options);(tool==='gift'?anchor.parentElement:anchor).after(group);groups.push({tool,owner,group,legend,buttons});
  }
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value};
  function sync(){
    const zh=document.documentElement.lang.startsWith('zh'),mode=api.getMode(),pending=api.getPending()>0;
    for(const {tool,owner,group,legend,buttons} of groups){
      const isWebP=tool!=='resources'||document.querySelector('#resourceTarget')?.value==='custom'&&!!document.querySelector('input[name="resourceFormat"][value="webp"]')?.checked;
      if(group.hidden===isWebP)group.hidden=!isWebP;
      setText(legend,zh?'WebP 压缩':'WebP compression');
      const locked=pending||!!toolBusy.get(tool)||tool==='room'&&!!window.RoomWebP?.isBusy?.()||!!owner.querySelector('[aria-busy="true"]');
      for(const button of buttons){
        setText(button,button.dataset.webpMode==='high'?(zh?'高清压缩':'High quality'):(zh?'严格无损':'Exact lossless'));
        const pressed=String(button.dataset.webpMode===mode);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
        if(button.disabled!==locked)button.disabled=locked;
      }
    }
  }
  document.addEventListener('webp:mode-change',sync);document.addEventListener('webp:activity-change',sync);
  document.addEventListener('webp:tool-state',event=>{if(typeof event.detail?.tool==='string')toolBusy.set(event.detail.tool,!!event.detail.busy);sync()});
  document.addEventListener('change',sync);window.addEventListener('hashchange',sync);
  if(typeof MutationObserver==='function'){
    new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    for(const {owner} of groups)new MutationObserver(sync).observe(owner,{subtree:true,attributes:true,attributeFilter:['aria-busy','class']});
  }
  window.WebPSettings={sync};sync();
})();
