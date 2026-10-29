import * as E from '../vap-engine.mjs?v=20261028-sequence1';
import * as M from '../vendor/mediabunny/mediabunny.mjs';
const $=id=>document.getElementById(id),urls=[];
const now=()=>performance.now();
const createCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function url(blob){const value=URL.createObjectURL(blob);urls.push(value);return value}
function patchMean(bytes,width,x,y,channel=3){let n=0,total=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){total+=bytes[(Math.round(y+dy)*width+Math.round(x+dx))*4+channel];n++}return total/n}
function decodeRect(packed,rect,w,h){const c=createCanvas(w,h);c.getContext('2d').drawImage(packed,...rect,0,0,w,h);return c}
async function verify(result,source,truth){
 const info=result.config.info,checks=[];const check=(label,pass,detail)=>checks.push({label,passed:!!pass,...detail});
 check('natural numeric input frame order',source.frames.every((frame,n)=>frame.name.split('/').at(-1)===`frame_${n+1}.png`));
 check('all source frames declared',info.f===truth.frameCount,{actual:info.f,expected:truth.frameCount});
 const input=new M.Input({source:new M.BlobSource(result.blob),formats:[M.MP4]});
 let comparison;
 try{
  const track=await input.getPrimaryVideoTrack(),stats=await track.computePacketStats();check('actual encoded frame count',stats.packetCount===truth.frameCount,{actual:stats.packetCount,expected:truth.frameCount});
  check('actual output duration',Math.abs(await track.computeDuration()-truth.frameCount/info.fps)<.01);
  check('actual packed frame geometry',await track.getDisplayWidth()===info.videoW&&await track.getDisplayHeight()===info.videoH);
  const sink=new M.CanvasSink(track,{poolSize:1}),scale=Math.min(info.w/truth.width,info.h/truth.height),ox=(info.w-truth.width*scale)/2,oy=(info.h-truth.height*scale)/2;
  for(const index of [8,9,36]){
   const decoded=await sink.getCanvas(index/info.fps);if(!decoded)throw Error('Encoded frame not decoded.');
   const rgbCanvas=decodeRect(decoded.canvas,info.rgbFrame,info.w,info.h),alphaCanvas=decodeRect(decoded.canvas,info.aFrame,info.w,info.h),rgb=rgbCanvas.getContext('2d').getImageData(0,0,info.w,info.h),alpha=alphaCanvas.getContext('2d').getImageData(0,0,info.w,info.h);
   const [mx,my]=truth.frames[index].marker,x=ox+mx*scale,y=oy+my*scale,markerAlpha=patchMean(alpha.data,info.w,x,y,0),markerColor=[0,1,2].map(c=>patchMean(rgb.data,info.w,x,y,c)),markerMaE=markerColor.reduce((s,v,c)=>s+Math.abs(v-[255,192,12][c]),0)/3;
   check(`frame ${index}: correct moving marker`,markerAlpha>=225&&markerMaE<=20,{alpha:markerAlpha,rgbMaE:markerMaE});
   if(index===36){
    const record=source.frames.find(frame=>frame.name.split('/').at(-1)==='frame_37.png');const bitmap=await createImageBitmap(record.file),expectedCanvas=createCanvas(info.w,info.h);expectedCanvas.getContext('2d').drawImage(bitmap,ox,oy,truth.width*scale,truth.height*scale);bitmap.close();const expected=expectedCanvas.getContext('2d').getImageData(0,0,info.w,info.h);
    let alphaError=0,rgbError=0;for(let p=0;p<expected.data.length;p+=4){const a=expected.data[p+3];alphaError+=Math.abs(alpha.data[p]-a);for(let c=0;c<3;c++)rgbError+=Math.abs(rgb.data[p+c]-expected.data[p+c]*a/255)}
    const pixels=info.w*info.h;alphaError/=pixels;rgbError/=pixels*3;check('native PNG alpha retained',alphaError<=8,{mae:alphaError});check('source RGB retained',rgbError<=10,{mae:rgbError});
    const [sx,sy]=truth.frames[index].offset,baseScale=Math.min(truth.width/240,truth.height/400);
    for(const [name,point,minimum] of [['dark core',[70,200],235],['white core',[100,210],235],['detached particle',[34,68],10],['weak particle',[187,48],5]]){
     const value=patchMean(alpha.data,info.w,ox+(sx+point[0]*baseScale)*scale,oy+(sy+point[1]*baseScale)*scale,0);check(name+(name.includes('particle')?' signal retained':' remains opaque'),value>=minimum,{alpha:value});
    }
    comparison=createCanvas(info.w,info.h);const image=comparison.getContext('2d').createImageData(info.w,info.h);for(let p=0;p<image.data.length;p+=4){const a=alpha.data[p];image.data[p+3]=a;for(let c=0;c<3;c++)image.data[p+c]=a?Math.min(255,Math.round(rgb.data[p+c]*255/a)):0}comparison.getContext('2d').putImageData(image,0,0);
   }
  }
 }finally{input.dispose()}
 return {checks,comparison,accepted:checks.every(c=>c.passed)};
}
$('run').addEventListener('click',async()=>{
 $('run').disabled=true;for(const value of urls)URL.revokeObjectURL(value);urls.length=0;$('results').replaceChildren();$('summary').textContent='';$('reportDownload').hidden=true;
 const report={accepted:false,input:null,results:[],boundary:'Independent local engine benchmark with technical fixtures. Does not certify main upload UI or iOS/Android SDK playback.'},started=now();
 try{
  $('progress').textContent='Loading local fixture…';const fetchStart=now(),[blob,truth]=await Promise.all([fetch('./fixtures/vap-sequence-bench.zip').then(r=>{if(!r.ok)throw Error('Fixture request failed');return r.blob()}),fetch('./fixtures/vap-sequence-bench-truth.json').then(r=>r.json())]);const fetchMs=now()-fetchStart;
  const importStart=now(),source=await E.inspectImageSequence([new File([blob],'medium-sequence.zip',{type:'application/zip'})],{fps:24,Zip:window.JSZip,onProgress:event=>{$('progress').textContent=`Importing frames: ${Math.round(event.progress*100)}%`}}),importMs=now()-importStart;
  report.input={width:source.width,height:source.height,frames:source.frameCount,compressedBytes:blob.size,frameBytes:source.size,fetchMs,importMs};
  for(const mb of [1,2,3]){
   $('progress').textContent=`Converting ${mb} MB limit…`;const t=now(),result=await E.convertVideo(source,{width:720,height:1560,fps:24,alphaScale:.5,rgbAlphaMode:'premultiplied',targetBytes:mb*1000000,quality:'ultra',verticalMask:{enabled:false},keepAudio:false},{onProgress:event=>{$('progress').textContent=`${mb} MB: ${event.phase} ${Math.round(event.progress*100)}%${event.frame?' · '+event.frame+'/'+event.totalFrames:' '}`}}),elapsedMs=now()-t;
   $('progress').textContent=`Independently decoding ${mb} MB result…`;const audit=await verify(result,source,truth),entry={targetMB:mb,bytes:result.blob.size,convertMs:elapsedMs,engineWallMs:result.report.timings.wallMs,importPlusConvertMs:importMs+elapsedMs,under5s:elapsedMs<5000,belowCap:result.blob.size<mb*1000000,frames:result.report.frames,width:result.report.width,height:result.report.height,fps:result.report.fps,alphaScale:result.report.alphaScale,processingPath:result.report.processingPath,attempts:result.report.attempts,checks:audit.checks,accepted:audit.accepted&&result.blob.size<mb*1000000};report.results.push(entry);
   const article=document.createElement('article'),h=document.createElement('h2'),meta=document.createElement('p'),a=document.createElement('a');h.textContent=`${mb} MB · ${entry.accepted?'PASS':'FAIL'} · ${(elapsedMs/1000).toFixed(2)} s`;h.className=entry.accepted?'pass':'fail';meta.textContent=`${result.blob.size.toLocaleString()} bytes · ${entry.frames} frames · ${entry.processingPath} · ${audit.checks.filter(c=>c.passed).length}/${audit.checks.length} independent checks`;a.href=url(result.blob);a.download=`sequence-medium-${mb}mb.mp4`;a.textContent=`Download ${mb} MB VAP`;article.append(h,meta,a);if(audit.comparison){audit.comparison.setAttribute('aria-label','Actual decoded transparent frame 36');article.append(audit.comparison)}$('results').append(article);
  }
  report.accepted=report.results.length===3&&report.results.every(r=>r.accepted);report.wallMs=now()-started;$('progress').textContent=report.accepted?'Completed: all three budgets and independent decoded-pixel checks passed.':'Completed with a failed independent check.';
 }catch(error){report.error={message:String(error?.message||error),code:error?.code||null,stack:String(error?.stack||'')};$('progress').textContent='Failed: '+report.error.message}
 finally{$('summary').textContent=JSON.stringify(report,null,2);const link=$('reportDownload');link.href=url(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));link.download='sequence-browser-benchmark.json';link.hidden=false;$('run').disabled=false;document.documentElement.dataset.status=report.accepted?'passed':'failed'}
});
