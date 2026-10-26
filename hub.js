/* Shared counts are served by the API. Browser storage is not a global counter. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const translations={
    zh:{vapTitle:'VAP工具',vapDescription:'本地去背景，转换透明视频。',heroLineOne:"专为乐趣运营",heroLineTwo:"而生。",homeLocalNote:"灵感即刻成图，素材留在本地。",eyebrow:'乐趣运营工作台',heroTitle:'专为乐趣运营而生',heroDescription:"房间背景、头像框、Banner，一站出图。",exploreTools:'选择工具',requestTool:"提出需求",generatedLabel:'累计生成',downloadsLabel:'累计下载',times:'次',viewStatistics:"使用统计",toolsTitle:"选个工具，开工。",toolsDescription:'常用素材工具，统一规范，直接交付。',toolsCount:'4 款工具',roomTitle:'房间背景',roomDescription:"批量裁切，双尺寸出图。",avatarTitle:'头像框',avatarDescription:"预览动效，定格好看的一帧。",avatarSpec:'默认 240 × 240 · 透明 WebP',bannerDescription:"一张原图，搞定两种 Banner。",useTool:'开始制作',workflowTitle:'更少重复，更快交付',standardTitle:'输出有规范',standardDescription:'常用业务尺寸内置，减少反复核对与手动调整。',localTitle:'素材留在本地',localDescription:'图片与 SVGA 在浏览器中处理，原始素材不会上传。',evolveTitle:'围绕真实任务迭代',evolveDescription:'从高频运营工作出发，持续补充实用工具。',requestEyebrow:'让下一个工具解决你的问题',requestTitle:"下个工具，你来定义。",requestDescription:'告诉我们你的使用场景、重复步骤和期望结果。我们会评估，把值得重复使用的方法做成工具。',requestPrivacy:'需求仅提供给作者，不会公开展示。',backHome:'← 工具首页',statisticsTitle:'全站使用统计',statisticsDescription:'记录每一次有效产出，让工具的使用价值清晰可见。',refresh:'刷新数据',refreshing:'刷新中…',generatedCaption:'成功生成的输出文件',downloadsCaption:'有效发起的下载操作',byTool:'按工具查看',sharedData:'所有用户共享统计',toolColumn:'工具',generatedColumn:'生成次数',downloadsColumn:'下载次数',countingTitle:'统计口径',countingGenerated:'每成功生成一个输出文件，累计生成计 1 次。一次生成两个尺寸，计 2 次。',countingDownloads:'每次有效发起单个文件或 ZIP 下载，累计下载计 1 次；不代表文件已保存完成。',countingScope:'统计由共享服务累计，覆盖服务启用后的记录，不追溯此前的使用次数。',countingPrivacy:'仅发送工具类型、行为及次数，不上传处理素材，也不统计或推算用户人数。',requestDialogTitle:'提出工具需求',close:'关闭',requestDialogDescription:'描述具体任务和期望的输出，有助于作者判断需求与实现方式。',requestNameLabel:'需求标题',requestDetailLabel:'任务说明',requestContactLabel:'联系方式',required:'必填',optional:'选填',requestNamePlaceholder:'例如：批量制作活动封面',requestDetailPlaceholder:'目前怎样完成？哪些步骤重复？希望输出什么格式和尺寸？',requestContactPlaceholder:'邮箱 / 微信，方便作者进一步了解',requestFormPrivacy:'提交内容仅向作者提供。请勿填写密码或其他敏感信息。',submitRequest:'提交需求',submitting:'提交中…',statsLoading:'正在读取全站统计…',statsUnavailable:'统计服务暂不可用，恢复连接后可刷新。',requestFailed:'暂时无法提交，请稍后重试。已保留填写内容。',requestSuccess:'需求已提交。回执：',requestEmpty:'请填写需求标题与任务说明。',updatedAt:'更新于 ',startedAt:'统计始于 '},
    en:{vapTitle:'VAP tools',vapDescription:'Remove backgrounds. Export transparent video.',heroLineOne:'Built for',heroLineTwo:'Spreadfun ops.',homeLocalNote:'Create freely. Keep your assets local.',eyebrow:'FUN TOOLKIT · OPERATIONS WORKSPACE',heroTitle:'Built for Spreadfun operations',heroDescription:"Room backgrounds, avatar frames and banners. One place to create.",exploreTools:'Explore tools',requestTool:"Suggest a tool",generatedLabel:'Files generated',downloadsLabel:'Downloads',times:'',viewStatistics:"Usage stats",toolsTitle:"Pick a tool. Make it happen.",toolsDescription:'Everyday tools. Consistent formats. Ready to deliver.',toolsCount:'4 tools',roomTitle:'Room backgrounds',roomDescription:"Batch crops. Two sizes. Ready to go.",avatarTitle:'Avatar frames',avatarDescription:"Preview the motion. Keep your frame.",avatarSpec:'Default 240 × 240 · Transparent WebP',bannerDescription:"One image. Two banners. Done.",useTool:'Open tool',workflowTitle:'Less repetition. Faster delivery.',standardTitle:'Consistent output',standardDescription:'Common asset sizes are built in, reducing manual checks and adjustments.',localTitle:'Your assets stay local',localDescription:'Images and SVGA files are processed in your browser. Source assets are never uploaded.',evolveTitle:'Built around real tasks',evolveDescription:'Practical tools that evolve with everyday operations work.',requestEyebrow:'HELP SHAPE THE NEXT TOOL',requestTitle:"You shape the next tool.",requestDescription:'Share your scenario, repetitive steps and expected result. We will review it and turn reusable workflows into practical tools.',requestPrivacy:'Suggestions are sent only to the author and are not published.',backHome:'← All tools',statisticsTitle:'Site usage statistics',statisticsDescription:'A clear view of the useful output created with these tools.',refresh:'Refresh data',refreshing:'Refreshing…',generatedCaption:'Successfully generated output files',downloadsCaption:'Valid download actions initiated',byTool:'Usage by tool',sharedData:'Shared counts across all users',toolColumn:'Tool',generatedColumn:'Generated',downloadsColumn:'Downloads',countingTitle:'How counting works',countingGenerated:'Each successfully generated output file counts once. Producing two sizes counts as two files.',countingDownloads:'Each valid download action for a file or ZIP counts once. This does not confirm the file was saved.',countingScope:'The shared service counts events recorded since it was enabled. Earlier usage is not included.',countingPrivacy:'Only the tool, action and count are sent. Source assets are never uploaded, and user numbers are not measured or inferred.',requestDialogTitle:'Suggest a tool',close:'Close',requestDialogDescription:'Describe the task and expected output so the author can assess the need and possible implementation.',requestNameLabel:'Request title',requestDetailLabel:'Task details',requestContactLabel:'Contact information',required:'Required',optional:'Optional',requestNamePlaceholder:'For example: batch event cover creation',requestDetailPlaceholder:'How do you do this now? Which steps repeat? What output formats and sizes do you need?',requestContactPlaceholder:'Email / WeChat, if you would like a follow-up',requestFormPrivacy:'Only the author receives this submission. Do not include passwords or other sensitive information.',submitRequest:'Submit suggestion',submitting:'Submitting…',statsLoading:'Loading shared statistics…',statsUnavailable:'Statistics are temporarily unavailable. Refresh when the connection is restored.',requestFailed:'Unable to submit right now. Please try again later. Your input has been kept.',requestSuccess:'Suggestion received. Receipt: ',requestEmpty:'Please enter a request title and task details.',updatedAt:'Updated ',startedAt:'Counting since '}
  };
  let stats=null,statsState='idle',statsPromise=null,requestState='idle',requestReceipt='',requestBusy=false;
  const queue=[];
  let draining=false,retryTimer=0;
  function locale(){return typeof language!=='undefined'&&language==='zh'?'zh':'en'}
  function t(key){return translations[locale()][key]??key}
  function number(value){return new Intl.NumberFormat(locale()==='zh'?'zh-CN':'en-US').format(value)}
  function date(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'—':parsed.toLocaleString(locale()==='zh'?'zh-CN':'en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
  async function api(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch(path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});if(!response.ok)throw new Error('apiError');return await response.json()}finally{clearTimeout(timer)}
  }
  function validStats(data){
    const valid=value=>Number.isSafeInteger(value)&&value>=0;
    return data&&data.totals&&['generated','downloads'].every(key=>valid(data.totals[key]))&&data.tools&&['room','avatar','banner'].every(tool=>data.tools[tool]&&['generated','downloads'].every(key=>valid(data.tools[tool][key])))&&typeof data.updatedAt==='string'&&!Number.isNaN(Date.parse(data.updatedAt))&&typeof data.startedAt==='string'&&!Number.isNaN(Date.parse(data.startedAt));
  }
  function renderStats(){
    document.querySelectorAll('[data-stat]').forEach(node=>node.textContent=stats?number(stats.totals[node.dataset.stat]):'—');
    document.querySelectorAll('[data-tool-stat]').forEach(node=>{const [tool,key]=node.dataset.toolStat.split('.');node.textContent=stats?number(stats.tools[tool][key]):'—'});
    document.querySelectorAll('[data-stats-status]').forEach(node=>{node.textContent=statsState==='loading'?t('statsLoading'):statsState==='error'?t('statsUnavailable'):'';node.dataset.state=statsState});
    if($('hubUpdatedAt'))$('hubUpdatedAt').textContent=stats?t('updatedAt')+date(stats.updatedAt):'—';
    if($('hubStartedAt'))$('hubStartedAt').textContent=stats?t('startedAt')+date(stats.startedAt):'—';
    if($('hubRefreshStats')){$('hubRefreshStats').disabled=statsState==='loading';$('hubRefreshStats').textContent=t(statsState==='loading'?'refreshing':'refresh')}
  }
  async function refreshStats(){
    if(statsPromise)return statsPromise;
    statsState='loading';renderStats();
    statsPromise=(async()=>{try{const data=await api('/api/stats',{cache:'no-store'});if(!validStats(data))throw new Error('invalidStats');stats=data;statsState='ready'}catch(error){stats=null;statsState='error'}finally{statsPromise=null;renderStats()}})();
    return statsPromise;
  }
  function renderRequest(){
    const node=$('hubRequestResult');if(!node)return;
    node.classList.toggle('hidden',requestState==='idle');node.dataset.state=requestState;
    node.textContent=requestState==='success'?t('requestSuccess')+requestReceipt:requestState==='empty'?t('requestEmpty'):requestState==='error'?t('requestFailed'):'';
    $('hubRequestSubmit').disabled=requestBusy;$('hubRequestSubmit').textContent=t(requestBusy?'submitting':'submitRequest');
  }
  function syncLanguage(){
    document.querySelectorAll('[data-hub-i18n]').forEach(node=>node.textContent=t(node.dataset.hubI18n));
    document.querySelectorAll('[data-hub-placeholder]').forEach(node=>node.placeholder=t(node.dataset.hubPlaceholder));
    renderStats();renderRequest();
  }
  function openRequest(){const dialog=$('hubRequestDialog');if(dialog&&!dialog.open){dialog.showModal();$('hubRequestTitle').focus()}}
  async function submitRequest(event){
    event.preventDefault();if(requestBusy)return;
    const form=$('hubRequestForm');if(!form.reportValidity())return;
    const payload={title:$('hubRequestTitle').value.trim(),description:$('hubRequestDescription').value.trim(),contact:$('hubRequestContact').value.trim()};
    if(!payload.title||!payload.description){requestState='empty';renderRequest();return}
    requestBusy=true;requestState='idle';renderRequest();
    try{
      const result=await api('/api/requests',{method:'POST',body:JSON.stringify(payload)});
      const receipt=result&&(result.receipt||result.id);
      if(typeof receipt!=='string'||!receipt.trim())throw new Error('invalidReceipt');
      requestReceipt=receipt;requestState='success';form.reset();
    }catch(error){requestState='error'}finally{requestBusy=false;renderRequest()}
  }
  async function drain(){
    if(draining||retryTimer||!queue.length)return;
    draining=true;
    let wrote=false;
    while(queue.length){
      const item=queue[0];
      try{
        await api('/api/events',{method:'POST',body:JSON.stringify(item.payload),keepalive:true});
        wrote=true;
        if(item.remaining){
          const chunk=Math.min(item.remaining,100);item.remaining-=chunk;item.attempts=0;
          item.payload={...item.payload,id:crypto.randomUUID(),count:chunk};
        }else queue.shift();
      }
      catch(error){item.attempts++;if(item.attempts>=3){queue.shift();continue}retryTimer=setTimeout(()=>{retryTimer=0;drain()},1500*item.attempts);break}
    }
    draining=false;
    if(wrote&&['','#home','#statistics'].includes(location.hash)){
      if(statsPromise)await statsPromise;
      if(['','#home','#statistics'].includes(location.hash))await refreshStats();
    }
  }
  function record(tool,type,count=1){
    // ponytail: best-effort telemetry is bounded to 100 in-memory batches and 3 attempts.
    if(!['room','avatar','banner'].includes(tool)||!['generated','download'].includes(type)||!Number.isSafeInteger(count)||count<1||queue.length>=100)return;
    if(!globalThis.crypto||typeof crypto.randomUUID!=='function')return;
    const chunk=Math.min(count,100);
    queue.push({payload:{id:crypto.randomUUID(),tool,type,count:chunk},remaining:count-chunk,attempts:0});drain();
  }
  function activate(tool){if(tool==='home'||tool==='statistics')refreshStats()}
  document.querySelectorAll('[data-request-open]').forEach(button=>button.addEventListener('click',openRequest));
  $('hubRequestClose')?.addEventListener('click',()=>$('hubRequestDialog').close());
  $('hubRequestForm')?.addEventListener('submit',submitRequest);
  $('hubRefreshStats')?.addEventListener('click',refreshStats);
  document.querySelectorAll('[data-hub-scroll]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();$('hubTools')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}));
  window.addEventListener('online',()=>{drain();if(['#home','#statistics'].includes(location.hash))refreshStats()});
  window.Hub={activate,syncLanguage,refreshStats,record};
  syncLanguage();
})();
