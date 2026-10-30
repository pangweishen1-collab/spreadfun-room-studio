/* Local avatar/text editor. Media is retained in memory and never uploaded. */
(() => {
  'use strict';
  const MAX_RESOURCES=6,MAX_IMAGE_BYTES=12*1024*1024,AVATAR_FRAME_PAD=14/120,AVATAR_FRAME_SCALE=148/120;
  const copy={
    zh:{title:'创建文字/头像Key',dynamic:'按标签替换',baked:'固定合成',addImage:'添加头像',addText:'添加文字',empty:'添加头像或文字，在画面中拖动定位。',remove:'删除资源',bound:'原视频资源位 · 保留动画，可拖动调整位置',tag:'资源标签',pickImage:'选择头像图片',replaceImage:'替换头像图片',circle:'圆形',square:'方形',cover:'填满裁剪',contain:'完整显示',paste:'PNG、JPG、WebP · 可在此粘贴',text:'文字内容',fontSize:'字号 px',color:'文字颜色',x:'水平位置 %',y:'垂直位置 %',width:'宽度 %',height:'高度 %',alignX:'水平居中',alignY:'垂直居中',start:'开始时间 s',end:'结束时间 s',opacity:'不透明度',untilEnd:'全程',image:'头像',textType:'文字',defaultText:'请输入文字',missingImage:'请为头像资源选择图片。',invalidImage:'请选择 12 MB 以内、可读取的 PNG、JPG 或 WebP 图片。',invalidTag:'标签请使用 1–40 位英文字母、数字或下划线，并以字母或下划线开头，且不能重复。',invalidTiming:'结束时间需晚于开始时间，且位于视频时长内。',invalidText:'请填写 1–80 个字符的文字。',invalidNumber:'请填写有效的尺寸、位置、字号和不透明度。',limit:'最多添加 6 个资源。',loading:'正在读取图片…',resourceList:'资源列表',mode:'资源合成方式',shape:'头像形状',fit:'图片适配',move:'拖动或用方向键移动',sourceMove:'拖动或用方向键调整原动画位置',removeName:'删除',imagePending:'尚未选择图片'},
    en:{title:'Create text/avatar keys',dynamic:'Replace by tag',baked:'Bake into video',addImage:'Add avatar',addText:'Add text',empty:'Add an avatar or text, then drag it into place.',remove:'Remove resource',bound:'Original slot · drag to offset its animation',tag:'Resource tag',pickImage:'Choose avatar image',replaceImage:'Replace avatar image',circle:'Circle',square:'Square',cover:'Fill and crop',contain:'Fit whole image',paste:'PNG, JPG, WebP · paste here',text:'Text',fontSize:'Font size px',color:'Text color',x:'Horizontal position %',y:'Vertical position %',width:'Width %',height:'Height %',alignX:'Center horizontally',alignY:'Center vertically',start:'Start time s',end:'End time s',opacity:'Opacity',untilEnd:'Until end',image:'Avatar',textType:'Text',defaultText:'Your name',missingImage:'Choose an image for every avatar resource.',invalidImage:'Choose a readable PNG, JPG or WebP image under 12 MB.',invalidTag:'Use unique tags of 1–40 letters, numbers or underscores, starting with a letter or underscore.',invalidTiming:'End time must follow start time and stay within the video duration.',invalidText:'Enter 1–80 characters for every text resource.',invalidNumber:'Enter valid dimensions, position, font size and opacity.',limit:'Up to 6 resources.',loading:'Reading image…',resourceList:'Resources',mode:'Resource composition mode',shape:'Avatar shape',fit:'Image fit',move:'Drag or use arrow keys to move',sourceMove:'Drag or use arrow keys to offset its animation',removeName:'Remove',imagePending:'No image selected'}
  };
  Object.assign(copy.zh,{defaultAvatar:'头像Key已创建',retryAvatar:'重试默认头像',defaultAvatarError:'默认头像加载失败，请点击重试。',resize:'拖动缩放，按住 Shift 自由拉伸',previewHelp:'点击选中，拖动移动，拉角缩放；双击改文字或换头像。',editText:'改文字',editImage:'换头像',duplicate:'复制',undo:'撤销',redo:'重做',done:'完成',cancel:'取消',inlineHelp:'Enter 保存 · Esc 取消',resizeNW:'左上角缩放',resizeNE:'右上角缩放',resizeSW:'左下角缩放',resizeSE:'右下角缩放'});
  Object.assign(copy.en,{defaultAvatar:'Avatar key created',retryAvatar:'Retry default avatar',defaultAvatarError:'The default avatar could not load. Choose Retry.',resize:'Drag to resize. Hold Shift to stretch freely.',previewHelp:'Select, drag to move, pull a corner to resize. Double-click to edit.',editText:'Edit text',editImage:'Replace image',duplicate:'Duplicate',undo:'Undo',redo:'Redo',done:'Done',cancel:'Cancel',inlineHelp:'Enter saves · Esc cancels',resizeNW:'Resize from top left',resizeNE:'Resize from top right',resizeSW:'Resize from bottom left',resizeSE:'Resize from bottom right'});
  const DEFAULT_AVATAR_URL='assets/vap-avatar-placeholder.webp?v=20261030-key-placeholder1';
  let defaultAvatarPromise;
  function defaultAvatarFile(){
    if(defaultAvatarPromise)return defaultAvatarPromise;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    defaultAvatarPromise=fetch(DEFAULT_AVATAR_URL,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('default avatar unavailable');
      const file=new Blob([await response.arrayBuffer()],{type:'image/webp'});
      if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('invalid default avatar');
      Object.defineProperty(file,'name',{value:'default-avatar.webp'});return file;
    }).catch(error=>{defaultAvatarPromise=null;throw error;}).finally(()=>clearTimeout(timer));
    return defaultAvatarPromise;
  }
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const percent=value=>String(Math.round(value*1000)/10);
  const cleanTag=value=>String(value||'').replace(/^\[|\]$/g,'');
  function create({root,stage,canvas,onChange=()=>{}}={}){
    const $=suffix=>root.querySelector('#vapResource'+suffix),panel=$('Panel');if(!panel)return null;
    let resources=[],selectedId=null,nextId=1,sourceConfig=null,loading=false,version=0,disposed=false,notice='';
    let context={ready:false,busy:false,width:720,height:1560,duration:0,time:0,fps:24,resourceOpacity:1,view:'transparent',language:'zh'},drag=null,inlineId=null,pendingMotionFocus=null;
    const t=key=>(copy[context.language]||copy.zh)[key]||key;
    const selected=()=>resources.find(item=>item.id===selectedId);
    const overlay=document.createElement('div');overlay.className='vap-resource-overlay';overlay.hidden=true;stage.append(overlay);
    const toolbar=document.createElement('div');toolbar.className='vap-resource-quickbar';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');stage.append(toolbar);
    const previewHelp=document.createElement('p');previewHelp.className='vap-resource-preview-help';previewHelp.hidden=true;stage.append(previewHelp);
    const inline=document.createElement('div');inline.className='vap-resource-inline';inline.hidden=true;const inlineInput=document.createElement('input');inlineInput.type='text';inlineInput.maxLength=80;inlineInput.autocomplete='off';const inlineDone=document.createElement('button');inlineDone.type='button';const inlineCancel=document.createElement('button');inlineCancel.type='button';inline.append(inlineInput,inlineDone,inlineCancel);stage.append(inline);
    const boxes=new Map(),listeners=[],handles=new Map(),quick=new Map(),urlPool=new Set();
    let history=[],historyIndex=-1,restoring=false;
    const listen=(element,type,listener)=>{element.addEventListener(type,listener);listeners.push(()=>element.removeEventListener(type,listener));};
    const capture=()=>({resources:resources.map(r=>({...r})),selectedId});
    const signature=s=>JSON.stringify({resources:s.resources.map(({file,...r})=>r)});
    function collectUrls(){const used=new Set([...resources,...history.flatMap(s=>s.resources)].map(r=>r.url).filter(Boolean));for(const url of urlPool)if(!used.has(url)){URL.revokeObjectURL(url);urlPool.delete(url);}}
    function recordHistory(){if(restoring||drag)return;const next=capture();if(historyIndex>=0&&signature(history[historyIndex])===signature(next))return;history=history.slice(0,historyIndex+1);history.push(next);if(history.length>30)history.shift();historyIndex=history.length-1;collectUrls();}
    function resetHistory(){history=[capture()];historyIndex=0;collectUrls();}
    const emit=reason=>{if(disposed)return;if(!['loading','image-error','interaction-start','history','default-image'].includes(reason))recordHistory();onChange({reason,resources:resources.length,loading});syncQuickbar();};
    function restoreHistory(direction){if(context.busy||loading)return;const next=historyIndex+direction;if(next<0||next>=history.length)return;cancelInline();drag=null;historyIndex=next;const saved=history[next];resources=saved.resources.map(r=>({...r}));selectedId=saved.selectedId;notice='';restoring=true;syncList();syncFields();syncOverlay();emit('history');restoring=false;}
    function selectResource(id,{seek=false}={}){
      cancelInline();selectedId=id;const item=selected();syncList();syncFields();syncOverlay();if(seek)onChange({reason:'focus-resource',resources:resources.length,loading});
      const visible=item&&frameFor(item);
      if(seek&&item&&(!visible||visible.motionOpacity<=.05||visible.width*context.width<4||visible.height*context.height<4)){
        let time=((item.start||0)+(item.end??context.duration??item.start??0))/2;
        if(item.animation==='float-pop')time=(item.start||0)+Math.min(.75,Math.max(0,((item.end??context.duration)-(item.start||0))/2));
        if(item.sourceId!==undefined){const frames=(sourceConfig?.frame||[]).filter(f=>f.obj.some(o=>String(o.srcId)===item.sourceId)).sort((a,b)=>a.i-b.i),middle=frames[Math.floor(frames.length/2)];if(middle)time=middle.i/sourceConfig.info.fps;}
        onChange({reason:'seek-resource',time:Math.min(context.duration||time,time+.001),resources:resources.length,loading});
      }
    }
    function focusPendingMotion(){if(pendingMotionFocus&&!context.busy&&!loading&&typeof context.frameResolver==='function'){const id=pendingMotionFocus;pendingMotionFocus=null;if(id===selectedId&&resources.some(r=>r.id===id))selectResource(id,{seek:true});}}
    function errorKey(){
      const tags=new Set();
      for(const r of resources){
        if(!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(r.tag)||tags.has(r.tag))return 'invalidTag';tags.add(r.tag);
        if(r.type==='image'&&!r.file)return 'missingImage';
        if(r.type==='text'&&(typeof r.text!=='string'||!r.text.trim()||Array.from(r.text).length>80))return 'invalidText';
        if(![r.x,r.y,r.width,r.height,r.opacity,r.fontSize].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.sourceId===undefined&&(r.x+r.width>1.00001||r.y+r.height>1.00001)||r.opacity<0||r.opacity>1||r.fontSize<8||r.fontSize>256)return 'invalidNumber';
        if(r.sourceId!==undefined&&(!Number.isFinite(r.offsetX)||!Number.isFinite(r.offsetY)||Math.abs(r.offsetX)>1||Math.abs(r.offsetY)>1||![r.scaleX??1,r.scaleY??1].every(value=>Number.isFinite(value)&&value>=.05&&value<=8)))return 'invalidNumber';
        if(r.sourceId===undefined&&(!Number.isFinite(r.start)||r.start<0||context.duration>0&&r.start>=context.duration||r.end!==null&&(!Number.isFinite(r.end)||r.end<=r.start||context.duration>0&&r.end>context.duration+.001)))return 'invalidTiming';
      }
      return '';
    }
    function updateError(){const key=notice||errorKey();$('Error').hidden=!key;$('Error').textContent=key?t(key):'';$('Tag').setAttribute('aria-invalid',String(errorKey()==='invalidTag'));}
    function setText(element,text){if(element.textContent!==text)element.textContent=text;}
    function syncList(){
      const fragment=document.createDocumentFragment();
      for(const r of resources){
        const button=document.createElement('button');button.type='button';button.className='vap-resource-item';button.setAttribute('aria-pressed',String(r.id===selectedId));button.dataset.resourceId=r.id;
        const thumb=document.createElement('span');thumb.className='vap-resource-thumb';
        if(r.type==='image'&&r.url){const image=document.createElement('img');image.src=r.url;image.alt='';thumb.append(image);thumb.dataset.shape=r.shape;}
        else thumb.textContent=r.type==='text'?'T':'+';
        const label=document.createElement('span'),tag=document.createElement('strong'),type=document.createElement('span');tag.textContent=r.tag||t('tag');type.textContent=t(r.type==='image'?'image':'textType');label.append(tag,type);button.append(thumb,label);
        button.addEventListener('click',()=>selectResource(r.id,{seek:true}));fragment.append(button);
      }
      $('List').replaceChildren(fragment);$('Empty').hidden=resources.length>0;$('Count').textContent=resources.length+' / '+MAX_RESOURCES;
    }
    function setValue(id,value){const element=$(id);if(document.activeElement!==element)element.value=value;}
    function syncFields(){
      const r=selected();$('Fields').hidden=!r;if(!r){updateError();return;}
      setText($('Selected'),t(r.type==='image'?'image':'textType')+' · '+r.tag);$('Bound').hidden=r.sourceId===undefined;
      $('ImageFields').hidden=r.type!=='image';$('TextFields').hidden=r.type!=='text';
      setValue('Tag',r.tag);setValue('Text',r.text);setValue('Font',r.fontSize);setValue('Color',r.color);setValue('Fit',r.fit);
      const positioned=r.sourceId!==undefined?editFrameFor(r):r;for(const [id,key] of [['X','x'],['Y','y'],['Width','width'],['Height','height']])setValue(id,percent(positioned[key]));
      setValue('Start',r.start);setValue('End',r.end===null?'':r.end);setValue('Opacity',Math.round(r.opacity*100));setText($('OpacityValue'),Math.round(r.opacity*100)+'%');
      $('Circle').setAttribute('aria-pressed',String(r.shape==='circle'));$('Square').setAttribute('aria-pressed',String(r.shape==='square'));
      setText($('Replace'),t(r.defaultAvatarError&&!r.file?'retryAvatar':r.file?'replaceImage':'pickImage'));setText($('FileName'),r.defaultAvatar?t('defaultAvatar'):r.file?.name||t('imagePending'));
      updateError();syncDisabled();
    }
    function syncDisabled(){
      const locked=context.busy||loading||!context.ready,r=selected();
      for(const element of panel.querySelectorAll('button,input,select'))element.disabled=locked;
      $('AddImage').disabled=locked||resources.length>=MAX_RESOURCES;$('AddText').disabled=locked||resources.length>=MAX_RESOURCES;
      if(r?.sourceId!==undefined)for(const id of ['Start','End'])$(id).disabled=true;
      $('Dynamic').setAttribute('aria-pressed','true');$('Baked').setAttribute('aria-pressed','false');$('Baked').disabled=true;
      panel.setAttribute('aria-busy',String(loading));
    }
    function syncLanguage(){
      for(const element of panel.querySelectorAll('[data-vap-resource-i18n]'))setText(element,t(element.dataset.vapResourceI18n));
      $('List').setAttribute('aria-label',t('resourceList'));panel.querySelector('.vap-resource-mode').setAttribute('aria-label',t('mode'));$('Fit').setAttribute('aria-label',t('fit'));$('ImageFields').setAttribute('aria-label',t('image'));$('Circle').parentNode.setAttribute('aria-label',t('shape'));$('End').placeholder=t('untilEnd');
      syncList();syncFields();
    }
    function nativeBaseFrame(r,fallback=false){
      const frameIndex=Math.min((sourceConfig?.info?.f||1)-1,Math.floor(context.time*(sourceConfig?.info?.fps||24)+.00001)),frame=sourceConfig?.frame?.find(entry=>entry.i===frameIndex);
      let object=frame?.obj?.find(entry=>String(entry.srcId)===r.sourceId);
      if(!object&&fallback){const frames=(sourceConfig?.frame||[]).filter(entry=>entry.obj?.some(item=>String(item.srcId)===r.sourceId)).sort((a,b)=>a.i-b.i);object=frames[0]?.obj?.find(entry=>String(entry.srcId)===r.sourceId);}
      if(!object?.frame)return null;
      const [x,y,width,height]=object.frame,w=sourceConfig.info.w,h=sourceConfig.info.h,scale=Math.min(context.width/w,context.height/h),ox=(context.width-w*scale)/2,oy=(context.height-h*scale)/2;return {x:(ox+x*scale)/context.width,y:(oy+y*scale)/context.height,width:width*scale/context.width,height:height*scale/context.height};
    }
    function offsetFrame(frame,r){return frame?{...frame,x:frame.x+(r.offsetX||0),y:frame.y+(r.offsetY||0),width:frame.width*(r.scaleX??1),height:frame.height*(r.scaleY??1)}:null;}
    function baseFrameFor(r){
      if(r.sourceId===undefined)return context.time>=r.start&&(r.end===null||context.time<r.end)?r:null;
      return offsetFrame(nativeBaseFrame(r),r);
    }
    function editFrameFor(r){return baseFrameFor(r)||offsetFrame(nativeBaseFrame(r,true),r)||r;}
    function frameFor(r){
      if(r.animation!=='float-pop'||typeof context.frameResolver!=='function')return baseFrameFor(r);
      try{const frame=context.frameResolver(r,{width:context.width,height:context.height,duration:context.duration,fps:context.fps,timestamp:context.time,sourceVapConfig:sourceConfig});if(!frame?.rect?.every(Number.isFinite))return null;const [x,y,width,height]=frame.rect;return {x:x/context.width,y:y/context.height,width:width/context.width,height:height/context.height,motionOpacity:frame.motionOpacity??1};}catch(ignored){return null;}
    }
    function place(r,x,y,frame=editFrameFor(r)){
      const pad=r.type==='image'&&r.avatarFrame===true?AVATAR_FRAME_PAD:0,px=frame.width*pad,py=frame.height*pad;
      x=clamp(x,px,Math.max(px,1-frame.width-px));y=clamp(y,py,Math.max(py,1-frame.height-py));
      if(r.sourceId!==undefined){const base=nativeBaseFrame(r,true);if(base){r.offsetX=clamp(x-base.x,-1,1);r.offsetY=clamp(y-base.y,-1,1);}}
      else{r.x=x;r.y=y;}
    }
    function setGeometry(r,frame,fontSize=r.fontSize){
      if(r.sourceId!==undefined){const base=nativeBaseFrame(r,true);if(!base)return;r.scaleX=clamp(frame.width/base.width,.05,8);r.scaleY=clamp(frame.height/base.height,.05,8);r.offsetX=clamp(frame.x-base.x,-1,1);r.offsetY=clamp(frame.y-base.y,-1,1);}
      else Object.assign(r,{x:frame.x,y:frame.y,width:frame.width,height:frame.height});
      if(r.type==='text')r.fontSize=clamp(fontSize,8,256);
    }
    function resizeTo(r,start,corner,dx,dy,free=false,fontSize=r.fontSize){
      const east=corner.includes('e'),south=corner.includes('s'),anchorX=east?start.x:start.x+start.width,anchorY=south?start.y:start.y+start.height;
      const pad=r.type==='image'&&r.avatarFrame===true?AVATAR_FRAME_PAD:0;
      const room=(anchor,forward)=>pad?Math.min((forward?1-anchor:anchor)/(1+pad),(forward?anchor:1-anchor)/pad):forward?1-anchor:anchor;
      const maxW=Math.max(0,room(anchorX,east)),maxH=Math.max(0,room(anchorY,south)),base=r.sourceId!==undefined?nativeBaseFrame(r,true):null;
      const minW=Math.max(12/context.width,base?base.width*.05:0),minH=Math.max(12/context.height,base?base.height*.05:0),capW=Math.min(maxW,base?base.width*8:1),capH=Math.min(maxH,base?base.height*8:1);
      let width=start.width+(east?dx:-dx),height=start.height+(south?dy:-dy);
      if(!free){const fx=(width-start.width)/start.width,fy=(height-start.height)/start.height;let factor=1+(Math.abs(fx)>=Math.abs(fy)?fx:fy);const min=Math.max(minW/start.width,minH/start.height,r.type==='text'?8/fontSize:0),max=Math.min(capW/start.width,capH/start.height,r.type==='text'?256/fontSize:Infinity);factor=clamp(factor,Math.min(min,max),max);width=start.width*factor;height=start.height*factor;}
      else{width=clamp(width,Math.min(minW,capW),capW);height=clamp(height,Math.min(minH,capH),capH);if(r.type==='text')height=clamp(height,start.height*8/fontSize,Math.min(capH,start.height*256/fontSize));}
      if(!(width>0&&height>0))return;
      const next={x:east?anchorX:anchorX-width,y:south?anchorY:anchorY-height,width,height};setGeometry(r,next,fontSize*height/start.height);
    }
    function cancelInline(){inlineId=null;inline.hidden=true;inlineInput.setAttribute('aria-invalid','false');}
    function startEdit(){
      if(context.busy||loading)return;const r=selected();if(!r)return;emit('interaction-start');
      if(r.type==='image'){$('Input').value='';$('Input').click();return;}
      inlineId=r.id;inlineInput.value=r.text;inlineInput.setAttribute('aria-invalid','false');inlineInput.setAttribute('aria-label',t('text'));inlineInput.title=t('inlineHelp');inline.hidden=false;syncInline();inlineInput.focus();inlineInput.select?.();
    }
    function commitInline({focus=true}={}){const r=resources.find(item=>item.id===inlineId);if(!r){cancelInline();return true;}const value=inlineInput.value;if(!value.trim()||Array.from(value).length>80){inlineInput.setAttribute('aria-invalid','true');return false;}const changed=value!==r.text;r.text=value;cancelInline();syncList();syncFields();syncOverlay();if(focus)boxes.get(r.id)?.focus?.({preventScroll:true});if(changed)emit('inline-commit');return true;}
    function finishEditing(){return inlineId===null||commitInline({focus:false});}
    function syncInline(){if(inlineId===null)return;const r=resources.find(item=>item.id===inlineId),frame=r&&(editFrameFor(r));if(!frame||context.busy){cancelInline();return;}const s=stage.getBoundingClientRect(),o=overlay.getBoundingClientRect(),w=Math.max(120,Math.min(s.width-16,Math.max(260,frame.width*o.width)));Object.assign(inline.style,{width:w+'px',left:clamp(o.left-s.left+frame.x*o.width,8,Math.max(8,s.width-w-8))+'px',top:clamp(o.top-s.top+frame.y*o.height,8,Math.max(8,s.height-60))+'px'});inlineDone.textContent=t('done');inlineCancel.textContent=t('cancel');}
    function removeSelected(){if(context.busy||loading||!selected())return;cancelInline();const id=selectedId;resources=resources.filter(r=>r.id!==id);selectedId=resources.at(-1)?.id||null;notice='';syncList();syncFields();syncOverlay();emit('remove');}
    function duplicateSelected(){
      if(context.busy||loading||!selected()||resources.length>=MAX_RESOURCES)return;const source=selected(),frame=editFrameFor(source);
      const r={...source,id:'resource-'+nextId++,tag:nextTag()};resources.push(r);place(r,frame.x+12/context.width,frame.y+12/context.height,frame);selectResource(r.id);emit('duplicate');
    }
    function alignSelected(axis){if(context.busy||loading)return;const r=selected();if(!r)return;emit('interaction-start');const frame=editFrameFor(r);place(r,axis==='x'?(1-frame.width)/2:frame.x,axis==='y'?(1-frame.height)/2:frame.y,frame);syncFields();syncOverlay();emit('position');}
    function makeQuick(action,label,handler){const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=label;listen(button,'click',handler);quick.set(action,button);toolbar.append(button);return button;}
    makeQuick('undo',t('undo'),()=>restoreHistory(-1));makeQuick('redo',t('redo'),()=>restoreHistory(1));makeQuick('edit',t('editText'),startEdit);makeQuick('center-x',t('alignX'),()=>alignSelected('x'));makeQuick('center-y',t('alignY'),()=>alignSelected('y'));makeQuick('duplicate',t('duplicate'),duplicateSelected);makeQuick('delete',t('removeName'),removeSelected);
    function syncQuickbar(){
      const r=selected(),s=stage.getBoundingClientRect();
      // Keep floating actions and helper copy hidden during direct canvas editing.
      toolbar.hidden=true;previewHelp.hidden=true;previewHelp.textContent=t('previewHelp');
      const compact=context.language==='en'&&s.width<330,shortLabels={'center-x':'Center X','center-y':'Center Y',duplicate:'Copy'};
      for(const [action,key] of [['undo','undo'],['redo','redo'],['center-x','alignX'],['center-y','alignY'],['duplicate','duplicate'],['delete','removeName']]){const full=t(key);quick.get(action).textContent=compact&&shortLabels[action]||full;quick.get(action).title=full;quick.get(action).setAttribute('aria-label',full);}
      const editLabel=t(r?.type==='image'?'editImage':'editText');quick.get('edit').textContent=compact?(r?.type==='image'?'Replace':'Edit'):editLabel;quick.get('edit').title=editLabel;quick.get('edit').setAttribute('aria-label',editLabel);
      const locked=context.busy||loading;quick.get('undo').disabled=locked||historyIndex<=0;quick.get('redo').disabled=locked||historyIndex>=history.length-1;
      for(const action of ['edit','center-x','center-y','duplicate','delete']){quick.get(action).hidden=!r;quick.get(action).disabled=locked||!r||action==='duplicate'&&resources.length>=MAX_RESOURCES;}
      // Keep quick actions stable while dragging and clear of adjacent lower gift slots.
      const width=Math.min(460,Math.max(120,s.width-16));Object.assign(toolbar.style,{width:width+'px',left:Math.max(8,(s.width-width)/2)+'px',top:'8px'});
      syncInline();
    }
    function syncOverlay(){
      const media=!canvas.hidden?canvas:root.querySelector('#vapSourceVideo'),r=media?.getBoundingClientRect(),s=stage.getBoundingClientRect();
      overlay.hidden=!context.ready||context.busy||loading||context.view!=='transparent'||!r?.width||!r?.height;
      if(overlay.hidden){cancelInline();for(const handle of handles.values())handle.hidden=true;syncQuickbar();return;}
      Object.assign(overlay.style,{left:(r.left-s.left-stage.clientLeft)+'px',top:(r.top-s.top-stage.clientTop)+'px',width:r.width+'px',height:r.height+'px'});
      const keep=new Set();
      for(const item of resources){
        keep.add(item.id);let button=boxes.get(item.id);
        if(!button){button=document.createElement('button');button.type='button';button.className='vap-resource-box';button.dataset.resourceId=item.id;const hit=document.createElement('span');hit.className='vap-avatar-frame-hit';hit.setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='vap-resource-tag';label.setAttribute('aria-hidden','true');button.append(hit,label);button.addEventListener('pointerdown',event=>beginDrag(event,item.id));button.addEventListener('keydown',event=>moveKey(event,item.id));button.addEventListener('click',()=>{if(selectedId!==item.id)selectResource(item.id);});button.addEventListener('dblclick',()=>{selectResource(item.id);startEdit();});boxes.set(item.id,button);overlay.append(button);}
        const frame=frameFor(item);button.hidden=!frame;button.setAttribute('aria-label',item.tag+' · '+t(item.sourceId===undefined?'move':'sourceMove'));button.setAttribute('aria-pressed',String(item.id===selectedId));button.dataset.bound=String(item.sourceId!==undefined);button.dataset.shape=item.shape;
        const framed=item.type==='image'&&item.avatarFrame===true,motionScale=framed&&item.animation==='float-pop'&&frame?frame.width/Math.max(1/context.width,editFrameFor(item).width):1;button.dataset.avatarFrame=String(framed);button.children[0].hidden=!framed;button.children[1].hidden=!framed;button.children[1].textContent=item.tag;button.children[1].style.transform='translateX(-50%) scale('+motionScale+')';button.children[1].style.opacity=String(item.animation==='float-pop'?Math.min(frame?.motionOpacity??1,context.resourceOpacity??1):1);button.children[1].dataset.inside=String(!!frame&&frame.y*r.height-frame.height*r.height*AVATAR_FRAME_PAD<34*Math.max(1,motionScale));
        if(frame)Object.assign(button.style,{left:frame.x*100+'%',top:frame.y*100+'%',width:frame.width*100+'%',height:frame.height*100+'%'});
      }
      for(const [id,button] of boxes)if(!keep.has(id)){button.remove();boxes.delete(id);}
      const item=selected(),frame=item&&frameFor(item),small=frame&&(frame.width*r.width<80||frame.height*r.height<64);
      for(const corner of ['nw','ne','sw','se']){
        let handle=handles.get(corner);if(!handle){handle=document.createElement('button');handle.type='button';handle.className='vap-resource-resize';handle.dataset.corner=corner;listen(handle,'pointerdown',event=>beginResize(event,corner));listen(handle,'keydown',event=>resizeKey(event,corner));handles.set(corner,handle);stage.append(handle);}
        handle.hidden=!frame||small&&corner!=='se';handle.setAttribute('aria-label',t('resize'+corner.toUpperCase()));handle.title=t('resize');
        if(frame){const px=r.left-s.left+(frame.x+(corner.includes('e')?frame.width:0))*r.width,py=r.top-s.top+(frame.y+(corner.includes('s')?frame.height:0))*r.height,cx=clamp(px,22,Math.max(22,s.width-22)),cy=clamp(py,22,Math.max(22,s.height-22));Object.assign(handle.style,{left:cx+'px',top:cy+'px','--pin-x':(px-cx)+'px','--pin-y':(py-cy)+'px'});}
      }
      syncQuickbar();
    }
    function beginDrag(event,id){
      if(event.button!==0||context.busy||loading)return;const item=resources.find(r=>r.id===id);if(!item)return;
      emit('interaction-start');selectResource(id);const frame=editFrameFor(item);
      drag={kind:'move',id,pointer:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,startX:frame.x,startY:frame.y};event.currentTarget.focus?.({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation?.();
    }
    function beginResize(event,corner){if(event.button!==0||context.busy||loading||!selected())return;emit('interaction-start');cancelInline();const item=selected(),frame=editFrameFor(item);drag={kind:'resize',id:item.id,pointer:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY,frame:{...frame},scaleX:(frameFor(item)?.width||frame.width)/frame.width,scaleY:(frameFor(item)?.height||frame.height)/frame.height,corner,fontSize:item.fontSize};event.currentTarget.focus?.({preventScroll:true});event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopPropagation?.();}
    function moveDrag(event){
      if(!drag||drag.pointer!==event.pointerId)return;const r=resources.find(item=>item.id===drag.id),rect=overlay.getBoundingClientRect();if(!r||!rect.width||!rect.height)return;
      const before=JSON.stringify(r);
      if(drag.kind==='resize')resizeTo(r,drag.frame,drag.corner,(event.clientX-drag.x)/rect.width/(drag.scaleX||1),(event.clientY-drag.y)/rect.height/(drag.scaleY||1),!!event.shiftKey,drag.fontSize);
      else place(r,drag.startX+(event.clientX-drag.x)/rect.width,drag.startY+(event.clientY-drag.y)/rect.height);
      if(before!==JSON.stringify(r)){syncFields();syncOverlay();emit(drag.kind==='resize'?'resize':'position');}event.preventDefault();
    }
    function endDrag(){if(!drag)return;const previous=drag;drag=null;try{previous.target.releasePointerCapture?.(previous.pointer);}catch(ignored){}recordHistory();syncQuickbar();}
    function resizeKey(event,corner){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||context.busy||loading||!selected())return;emit('interaction-start');const item=selected(),frame=editFrameFor(item),step=event.shiftKey?10:1;resizeTo(item,frame,corner,event.key==='ArrowRight'?step/context.width:event.key==='ArrowLeft'?-step/context.width:0,event.key==='ArrowDown'?step/context.height:event.key==='ArrowUp'?-step/context.height:0,false,item.fontSize);syncFields();syncOverlay();emit('resize');event.preventDefault();event.stopPropagation?.();}
    function moveKey(event,id){
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||context.busy||loading)return;const r=resources.find(item=>item.id===id);if(!r)return;selectedId=id;
      emit('interaction-start');const frame=editFrameFor(r),dx=(event.shiftKey?10:1)/context.width,dy=(event.shiftKey?10:1)/context.height;
      let x=frame.x,y=frame.y;if(event.key==='ArrowLeft')x-=dx;if(event.key==='ArrowRight')x+=dx;if(event.key==='ArrowUp')y-=dy;if(event.key==='ArrowDown')y+=dy;place(r,x,y,frame);
      syncList();syncFields();syncOverlay();emit('position');event.preventDefault();
    }
    function nextTag(reserved=[]){let n=1;while(resources.some(r=>r.tag==='tag'+n)||reserved.includes('tag'+n))n++;return 'tag'+n;}
    function add(type){
      if(context.busy||loading||!context.ready)return;if(resources.length>=MAX_RESOURCES){notice='limit';updateError();return;}
      const side=Math.min(144,context.width/AVATAR_FRAME_SCALE,context.height/AVATAR_FRAME_SCALE),width=type==='image'?side/context.width:.64,height=type==='image'?side/context.height:Math.min(.2,72/context.height);
      const r={id:'resource-'+nextId++,tag:nextTag(),type,file:null,text:type==='text'?t('defaultText'):'',x:(1-width)/2,y:type==='image'?.35:.56,width,height,start:0,end:null,opacity:1,shape:type==='image'?'circle':'square',fit:'cover',fontSize:48,color:'#ffffff'};
      if(type==='image'){r.avatarFrame=true;r.animation='float-pop';place(r,r.x,r.y,r);}
      resources.push(r);selectedId=r.id;notice='';panel.open=true;syncList();syncFields();syncOverlay();emit('add');
      if(type==='image')ensureDefaultAvatars();else $('Text').focus();
    }
    function ensureDefaultAvatars(){
      if(disposed||context.busy||loading||!context.ready)return;
      const resource=resources.find(r=>r.type==='image'&&!r.file&&!r.defaultAvatarError);
      if(resource)void readImage(null,resource);
    }
    async function readImage(file,defaultResource=null){
      if(context.busy||loading||!context.ready)return;const r=defaultResource||selected();if(!r||r.type!=='image'||!resources.includes(r))return;
      if(!defaultResource&&(!(file instanceof Blob)||!file.size||file.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg','image/webp'].includes(file.type))){notice='invalidImage';updateError();return;}
      if(defaultResource)delete r.defaultAvatarError;
      loading=true;notice='loading';const token=++version,id=r.id;syncDisabled();updateError();emit('loading');let url,changed=false;
      try{
        if(defaultResource)file=await defaultAvatarFile();
        if(disposed||token!==version||!resources.includes(r))return;
        url=URL.createObjectURL(file);const image=new Image();
        await new Promise((resolve,reject)=>{image.onload=()=>image.naturalWidth>0&&image.naturalHeight>0&&Math.max(image.naturalWidth,image.naturalHeight)<=8192&&image.naturalWidth*image.naturalHeight<=32000000?resolve():reject(Error('image size'));image.onerror=reject;image.src=url;});
        if(disposed||token!==version||!resources.includes(r)){URL.revokeObjectURL(url);return;}
        urlPool.add(url);r.file=file;r.url=url;r.defaultAvatar=!!defaultResource;delete r.defaultAvatarError;notice='';changed=true;if(defaultResource&&r.animation==='float-pop'&&selectedId===r.id)pendingMotionFocus=r.id;
        // Hydration belongs to the existing add/import history entry, not a second user edit.
        if(defaultResource)for(const snapshot of history)for(const entry of snapshot.resources)if(entry.id===r.id&&!entry.file){entry.file=file;entry.url=url;entry.defaultAvatar=true;}
      }catch(error){
        if(url)URL.revokeObjectURL(url);
        if(!disposed&&token===version&&resources.includes(r)){
          if(defaultResource){r.defaultAvatarError=true;defaultAvatarPromise=null;}
          notice=defaultResource?'defaultAvatarError':'invalidImage';
        }
      }
      finally{if(!disposed&&token===version){loading=false;if(!defaultResource&&resources.includes(r))selectedId=id;if(notice==='loading')notice='';syncList();syncFields();syncOverlay();emit(changed?(defaultResource?'default-image':'image'):'image-error');ensureDefaultAvatars();focusPendingMotion();}}
    }
    function updateField(id,key,read){listen($(id),'input',()=>{const r=selected();if(!r||context.busy||loading)return;const value=read($(id).value,r);r[key]=value;notice='';syncFields();syncOverlay();if(key==='tag'||key==='text')syncList();emit('edit');});}
    for(const [id,key] of [['Tag','tag'],['Text','text'],['Fit','fit'],['Color','color']])updateField(id,key,value=>value);
    updateField('Font','fontSize',value=>Number(value));updateField('Opacity','opacity',value=>Number(value)/100);updateField('Start','start',value=>value===''?NaN:Number(value));updateField('End','end',value=>value===''?null:Number(value));
    for(const [id,key] of [['X','x'],['Y','y'],['Width','width'],['Height','height']])listen($(id),'input',()=>{
      const r=selected();if(!r||context.busy||loading)return;const value=$(id).value,n=value===''?NaN:Number(value)/100;
      if(r.sourceId!==undefined&&(key==='x'||key==='y')){const frame=editFrameFor(r);place(r,key==='x'?n:frame.x,key==='y'?n:frame.y,frame);}
      else if(r.sourceId!==undefined){const frame=editFrameFor(r),base=nativeBaseFrame(r,true);if(base&&Number.isFinite(n)){const size=clamp(n,Math.max(.01,base[key]*.05),Math.min(1-frame[key==='width'?'x':'y'],base[key]*8)),next={...frame,[key]:size};setGeometry(r,next,key==='height'?r.fontSize*size/frame.height:r.fontSize);}}
      else if(r.type==='image'&&r.avatarFrame===true){if(key==='x'||key==='y')place(r,key==='x'?n:r.x,key==='y'?n:r.y,r);else{r[key]=clamp(n,.01,1/AVATAR_FRAME_SCALE);place(r,r.x,r.y,r);}}
      else r[key]=key==='x'?clamp(n,0,1-r.width):key==='y'?clamp(n,0,1-r.height):clamp(n,.01,1-r[key==='width'?'x':'y']);
      notice='';syncFields();syncOverlay();emit('position');
    });
    for(const [id,shape] of [['Circle','circle'],['Square','square']])listen($(id),'click',()=>{const r=selected();if(!r)return;r.shape=shape;syncFields();syncOverlay();emit('shape');});
    for(const [id,key] of [['AlignX','x'],['AlignY','y']])listen($(id),'click',()=>alignSelected(key));
    listen($('AddImage'),'click',()=>add('image'));listen($('AddText'),'click',()=>add('text'));
    listen($('Replace'),'click',()=>{const r=selected();if(r&&!r.file){void readImage(null,r);return;}$('Input').value='';$('Input').click();});listen($('Input'),'change',()=>{const file=$('Input').files?.[0];if(file)void readImage(file);});
    listen($('Delete'),'click',removeSelected);
    listen(panel,'toggle',syncOverlay);listen(overlay,'pointermove',moveDrag);listen(overlay,'pointerup',endDrag);listen(overlay,'pointercancel',endDrag);
    listen(stage,'pointermove',event=>{if(drag?.kind==='resize')moveDrag(event);});listen(stage,'pointerup',endDrag);listen(stage,'pointercancel',endDrag);
    listen(window,'blur',endDrag);
    listen(stage,'pointerdown',event=>{if(event.target===stage||event.target===canvas||event.target===overlay){cancelInline();selectedId=null;syncList();syncFields();syncOverlay();}});
    listen(stage,'keydown',event=>{const target=event.target,editable=target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName);if(editable)return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){restoreHistory(event.shiftKey?1:-1);event.preventDefault();}else if(['Delete','Backspace'].includes(event.key)&&selectedId){removeSelected();event.preventDefault();}else if(event.key==='Escape'){cancelInline();selectedId=null;syncList();syncFields();syncOverlay();event.preventDefault();}});
    listen(inline,'pointerdown',event=>event.stopPropagation());listen(inlineInput,'keydown',event=>{event.stopPropagation();if(event.isComposing)return;if(event.key==='Enter'){commitInline();event.preventDefault();}else if(event.key==='Escape'){cancelInline();syncOverlay();event.preventDefault();}});listen(inlineInput,'blur',event=>{if(inlineId!==null&&!inline.contains(event.relatedTarget))finishEditing();});listen(inlineDone,'click',commitInline);listen(inlineCancel,'click',()=>{cancelInline();syncOverlay();});
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(syncOverlay):null;resize?.observe(stage);resize?.observe(canvas);listen(window,'resize',syncOverlay);
    const unregisterPaste=window.UploadPaste?.register({zone:$('ImageFields'),isActive:event=>context.ready&&selected()?.type==='image'&&panel.open&&!root.classList.contains('hidden')&&($('ImageFields').contains(event?.target)||$('ImageFields').contains(document.activeElement)),isBusy:()=>context.busy||loading,onFiles:files=>{if(files[0])void readImage(files[0]);}});
    listen($('ImageFields'),'pointerdown',event=>{if(event.target===$('ImageFields'))$('ImageFields').focus();});
    listen($('ImageFields'),'dragover',event=>{if(event.dataTransfer?.types?.includes('Files')){event.preventDefault();event.stopPropagation();}});
    listen($('ImageFields'),'drop',event=>{if(event.dataTransfer?.files?.length){event.preventDefault();event.stopPropagation();void readImage(event.dataTransfer.files[0]);}});
    function setSource(config){
      if(config===sourceConfig)return;sourceConfig=config||null;const previous=resources,manual=previous.filter(r=>r.sourceId===undefined),bound=[];
      for(const src of (config?.src||[]).slice(0,MAX_RESOURCES)){
        if(!['img','txt'].includes(src.srcType))continue;const sourceId=String(src.srcId),type=src.srcType==='img'?'image':'text',tag=cleanTag(src.srcTag)||nextTag([...bound.map(item=>item.tag),...(config.src||[]).map(item=>cleanTag(item.srcTag))]),old=previous.find(r=>r.sourceId!==undefined&&r.tag===tag&&r.type===type),frames=(config.frame||[]).flatMap(f=>(f.obj||[]).filter(o=>String(o.srcId)===sourceId).map(o=>({i:f.i,rect:o.frame}))).sort((a,b)=>a.i-b.i),rect=frames[0]?.rect||[0,0,src.w,src.h],fps=config.info?.fps||24,w=config.info?.w||context.width,h=config.info?.h||context.height;
        const [x,y,width,height]=rect,storedText=config.funToolkit?.resourceDefaults?.[tag],defaultText=typeof storedText==='string'?storedText:t('defaultText');
        bound.push({...old,id:old?.id||'resource-'+nextId++,tag,type,sourceId,offsetX:old?.offsetX||0,offsetY:old?.offsetY||0,scaleX:old?.scaleX??1,scaleY:old?.scaleY??1,file:old?.file||null,url:old?.url,text:typeof old?.text==='string'&&old.text?old.text:type==='text'?defaultText:'',x:clamp(x/w,0,1),y:clamp(y/h,0,1),width:clamp(width/w,.001,1),height:clamp(height/h,.001,1),start:frames[0]?.i/fps||0,end:frames.length?(frames.at(-1).i+1)/fps:null,opacity:old?.opacity??1,shape:old?.shape||'square',fit:old?.fit||'cover',fontSize:old?.fontSize||clamp(Math.round((src.h||49)*.75),8,256),color:old?.color||(/^#[0-9a-f]{6}$/i.test(src.color||'')?src.color:'#ffffff')});
      }
      const tags=new Set(bound.map(r=>r.tag));for(const r of manual){const base=r.tag.slice(0,36);let tag=r.tag,n=2;while(tags.has(tag))tag=base+'_'+n++;r.tag=tag;tags.add(tag);}
      resources=[...bound,...manual].slice(0,MAX_RESOURCES);cancelInline();drag=null;selectedId=resources[0]?.id||null;notice='';if(bound.length)panel.open=true;resetHistory();syncList();syncFields();syncOverlay();ensureDefaultAvatars();
    }
    function getOptions(){return {resourceMode:'dynamic',resources:resources.map(({url,...r})=>({...r}))};}
    function setContext(value={}){
      if(disposed)return;const languageChanged=value.language&&value.language!==context.language,geometryChanged=value.width&&value.width!==context.width||value.height&&value.height!==context.height,timeChanged=value.time!==undefined&&value.time!==context.time&&selected()?.sourceId!==undefined;context={...context,...value};
      if(Object.hasOwn(value,'sourceConfig'))setSource(value.sourceConfig);
      if(languageChanged)syncLanguage();else if(geometryChanged||timeChanged)syncFields();else{syncDisabled();updateError();}syncOverlay();ensureDefaultAvatars();
      focusPendingMotion();
    }
    resetHistory();syncLanguage();syncDisabled();
    return {setContext,setSource,getOptions,finishEditing,getResources:()=>getOptions().resources,getAssets:()=>resources.filter(r=>r.type==='image'&&r.file).map(r=>({tag:r.tag,file:r.file})),getPlayerTags:()=>Object.fromEntries(resources.map(r=>[r.tag,r.type==='image'?r.url||'':r.text])),hasErrors:()=>loading||!!errorKey(),isLoading:()=>loading,dispose(){disposed=true;version++;resize?.disconnect();unregisterPaste?.();for(const off of listeners)off();for(const url of urlPool)URL.revokeObjectURL(url);urlPool.clear();overlay.remove();toolbar.remove();previewHelp.remove();inline.remove();for(const handle of handles.values())handle.remove();}};
  }
  window.VapResourceEditor={create,MAX_RESOURCES};
})();
