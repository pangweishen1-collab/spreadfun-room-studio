// The real renderer owns timing and drawing. Browser codecs/Spine pixels are
// replaced only at their API boundaries; live UI/audio QA remains separate.
import assert from 'node:assert/strict';
import {GameRenderer} from '../dice/renderer.js';

const globals=['document','requestAnimationFrame','spine','VideoEncoder','VideoFrame','performance'];
const original=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const checks=[];
let clock=1000;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
globalThis.requestAnimationFrame=()=>{};
const noop=()=>{};
const context={clearRect:noop,drawImage:noop,strokeText:noop,fillText:noop,beginPath:noop,arc:noop,fill:noop,moveTo:noop,lineTo:noop,closePath:noop};
globalThis.spine={MixBlend:{replace:1},MixDirection:{mixIn:1},Physics:{update:1,pose:2}};
const rect={left:37,top:83,width:360,height:800};
const native=(x,y)=>[rect.left+x/720*rect.width,rect.top+y/1600*rect.height];
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);

function makeRenderer({grade='purple',variant='01R',paint=false}={}) {
  const renderer=Object.create(GameRenderer.prototype);
  const draws=[],statuses=[];
  Object.assign(renderer,{canvas:{getBoundingClientRect:()=>rect},ctx:context,context:null,
    candidate:{kind:grade==='green'?'six-face':'purple-reference',template:grade,previewGrade:grade,purpleVariant:variant,
      name:'test',png:{},geometry:{sourceSize:200,crop:[35,35,130,130],cropOffset:[0,0]}},
    background:{},icon:null,mode:'all',target:1,elapsed:.18,playing:true,autoLoop:true,loopSeconds:2,
    visible:true,sequence:0,last:performance.now(),loadId:1,presentationId:1,gridVertices:[],sizeScale:.95,
    recording:false,recordingLoop:false,offlineEncoding:false,wasPlaying:true,stopAfterRound:false,
    onStatus:status=>statuses.push(status),draws,statuses,
  });
  renderer.data={findAnimation(name){return {duration:name.startsWith('standby_')?0:.64,apply(skeleton,_last,time){
    skeleton.sampleTime=name.startsWith('standby_')?.64:time;
  }};}};
  renderer.skeletons=Array.from({length:6},(_,index)=>{
    const skeleton={sampleTime:0,setToSetupPose:noop,updateWorldTransform:noop};
    const attachment={region:{},color:{a:1},computeWorldVertices(_slot,vertices){
      // Only point 1's early rolling shape is wide. Idle neighbors fit at
      // nominal scale, exposing accidental whole-grid shrinkage on a tap.
      const halfWidth=(index===0&&skeleton.sampleTime<.4?120:60)*skeleton.scaleX;
      vertices[0]=vertices[2]=skeleton.x-halfWidth;vertices[4]=vertices[6]=skeleton.x+halfWidth;
      vertices[1]=vertices[3]=skeleton.y-55*skeleton.scaleY;
      vertices[5]=vertices[7]=skeleton.y+55*skeleton.scaleY;
    }};
    skeleton.drawOrder=[{bone:{active:true},color:{a:1},getAttachment:()=>attachment}];
    return skeleton;
  });
  renderer.software={dispose:noop,draw(_context,skeleton){draws.push({index:renderer.skeletons.indexOf(skeleton),time:skeleton.sampleTime,scale:skeleton.scaleX});}};
  if(!paint)renderer.draw=()=>draws.push({time:renderer.elapsed});
  return renderer;
}

const slots=renderer=>renderer.pointPlayback.slots;
function ticks(renderer,count=1,milliseconds=40){for(let i=0;i<count;i++){clock=renderer.last+milliseconds;renderer.tick(clock);}}
function manualSnapshot(renderer){return structuredClone(renderer.pointPlayback);}

try {
  const hit=makeRenderer();
  for(const variant of ['01R','02']) {
    hit.candidate.purpleVariant=variant;
    const xs=variant==='02'?[181,360,539]:[198,363,529];
    for(let point=1;point<=6;point++)assert.equal(hit.pointAt(...native(xs[(point-1)%3],point<=3?720:903)),point,'Scaled hit target '+variant+'/'+point);
  }
  for(const position of [[259,520],[360,468],[360,1160],[-1,720],[721,720]])assert.equal(hit.pointAt(...native(...position)),null);
  assert.equal(hit.pointAt(NaN,100),null);
  hit.candidate.template='green';hit.candidate.previewGrade='purple';
  assert.equal(hit.pointAt(...native(198,720)),null,'Backdrop color must not enable point interaction on green source');
  assert.equal(hit.playPoint(1),false);
  hit.candidate.template='purple';hit.candidate.previewGrade='green';
  assert.equal(hit.pointAt(...native(181,720)),1,'Purple source can retain point interaction on a green backdrop');
  checks.push('css_scaled_hit_targets_for_01r_and_02_and_source_grade_boundary');

  const renderer=makeRenderer();
  assert.equal(renderer.playPoint(1),true);
  assert.equal(renderer.statuses.at(-1).scope,'points');
  assert.equal(renderer.statuses.at(-1).playing,true,'Manual status must report active dice even after the global clock stops');
  assert.equal(slots(renderer).length,6);
  close(slots(renderer)[0].elapsed,0,'First point rewinds');
  for(const slot of slots(renderer).slice(1))close(slot.elapsed,.18,'Other current progress is retained');
  ticks(renderer);
  close(slots(renderer)[0].elapsed,.04,'Point 1 advances');
  for(const slot of slots(renderer).slice(1))close(slot.elapsed,.22,'Neighbors continue their in-flight round');
  assert.equal(renderer.playPoint(2),true);
  close(slots(renderer)[0].elapsed,.04,'Point 2 must not restart point 1');
  close(slots(renderer)[1].elapsed,0,'Point 2 rewinds');
  ticks(renderer,1,20);
  close(slots(renderer)[0].elapsed,.06,'Concurrent point 1 continues');
  close(slots(renderer)[1].elapsed,.02,'Concurrent point 2 continues');
  assert.equal(renderer.playPoint(1),true);
  close(slots(renderer)[0].elapsed,0,'Mid-roll repeat must immediately rewind');
  close(slots(renderer)[1].elapsed,.02,'Mid-roll repeat must not rewind a neighbor');
  assert.equal(slots(renderer)[0].overridden,true);assert.equal(slots(renderer)[1].overridden,true);
  ticks(renderer,30,100);
  assert(slots(renderer).every(slot=>!slot.playing),'Point rounds finish instead of auto-looping neighbors');
  assert.equal(renderer.statuses.at(-1).playing,false);
  const held=manualSnapshot(renderer);
  ticks(renderer,30,100);
  assert.deepEqual(renderer.pointPlayback,held,'Settled point results remain unchanged across later global loop periods');
  const beforeSix=slots(renderer).map(slot=>slot.elapsed);
  assert.equal(renderer.playPoint(6),true);
  ticks(renderer,1,50);
  for(let i=0;i<5;i++)close(slots(renderer)[i].elapsed,beforeSix[i],'Idle neighbor must remain settled');
  close(slots(renderer)[5].elapsed,.05,'Only the sixth point is restarted');
  checks.push('independent_points_concurrency_midroll_replay_and_held_results');

  const rapid=makeRenderer();
  rapid.playPoint(1);ticks(rapid,1,20);
  const previousFrame=rapid.last;
  for(const milliseconds of [2,4,6,8,10,12,14,16,18]) {
    clock=previousFrame+milliseconds;rapid.playPoint(2);
    assert.equal(rapid.last,previousFrame,'A tap must not reset the RAF clock used by its neighbors');
  }
  clock=previousFrame+20;rapid.tick(clock);
  close(slots(rapid)[0].elapsed,.04,'Rapid taps must not starve an already rolling neighbor');
  close(slots(rapid)[1].elapsed,.002,'Only time since the latest tap belongs to the replayed die');
  for(const slot of slots(rapid).slice(2))close(slot.elapsed,.22,'Rapid taps must not pause the other original dice');
  const slow=makeRenderer();slow.playPoint(1);
  clock=slow.last+190;slow.playPoint(2);slow.tick(clock);
  assert(slots(slow)[1].elapsed>=0,'A clamped slow frame must not create a negative point time');
  ticks(slow,1,20);
  close(slots(slow)[1].elapsed,.02,'A new click starts normally on the next frame after a slow RAF');
  checks.push('rapid_replays_do_not_reset_the_shared_raf_clock_or_starve_neighbors');

  for(const guard of ['recording','recordingLoop']) {
    const before=manualSnapshot(renderer);renderer[guard]=true;
    assert.equal(renderer.playPoint(3),false,'Point playback is unavailable during '+guard);
    assert.deepEqual(renderer.pointPlayback,before);
    renderer[guard]=false;
  }
  for(const point of [0,7,NaN,1.5])assert.equal(renderer.playPoint(point),false);
  renderer.pause();
  const paused=manualSnapshot(renderer);
  ticks(renderer,5,100);assert.deepEqual(renderer.pointPlayback,paused,'Pause freezes point clocks');
  if(renderer.pointPlayback)assert(slots(renderer).every(slot=>!slot.playing));
  renderer.play();
  assert(!renderer.pointPlayback,'Whole-UI replay clears independent overrides');
  assert.equal(renderer.statuses.at(-1).scope,undefined,'Whole-UI replay restores the original group status');
  assert.equal(renderer.elapsed,0);assert.equal(renderer.playing,true);assert.equal(renderer.autoLoop,true);
  ticks(renderer,21,100);
  assert(renderer.elapsed<.2&&renderer.sequence>0,'Whole-UI replay retains the original two-second global loop');
  renderer.playPoint(3);renderer.configure('all',1);assert(!renderer.pointPlayback);
  renderer.playPoint(3);renderer.clear();assert(!renderer.pointPlayback);assert.equal(renderer.data,null);
  checks.push('recording_guards_pause_whole_ui_reset_configure_and_clear');

  const painted=makeRenderer({paint:true});
  painted.elapsed=.9;
  painted.pointPlayback={groupElapsed:.9,groupPlaying:false,slots:Array.from({length:6},(_,index)=>({point:index+1,elapsed:index===0?.2:.9,playing:index===0,overridden:index===0,fit:1,shiftX:0,sampleTime:null}))};
  painted.draw();
  assert.equal(painted.draws.length,6);
  assert.equal(painted.draws[0].time,Math.fround(.2),'Clicked die uses its own binary pose');
  for(const draw of painted.draws.slice(1)) {
    close(draw.time,.64,'Idle neighbor retains its result pose');
    close(draw.scale,.86*1.2,'Idle neighbor retains nominal purple size');
  }
  assert(painted.draws[0].scale<painted.draws[1].scale,'Only the wide active point needs a fit reduction');
  const preview=manualSnapshot(painted);
  for(const flag of ['recording','recordingLoop']) {
    painted.draws.length=0;painted[flag]=true;painted.draw(.37);
    assert(painted.draws.every(draw=>draw.time===Math.fround(.37)),'Explicit video sample overrides every point clock during '+flag);
    assert.deepEqual(painted.pointPlayback,preview);painted[flag]=false;
  }
  const green=makeRenderer({grade:'green',paint:true});
  green.elapsed=.9;green.pointPlayback=structuredClone(preview);green.draw();
  assert(green.draws.every(draw=>Math.abs(draw.time-.64)<1e-9&&Math.abs(draw.scale-.86)<1e-9),'Frozen green rendering keeps the original global time and scale');
  checks.push('per_point_pose_and_fit_leave_neighbors_unchanged_and_do_not_enter_video_or_green');

  // Exercise the real offline-export orchestration with an active point round.
  // The six encoded samples must be synchronized and the preview must restore.
  globalThis.VideoFrame=class {constructor(_canvas,options){this.options=options;}close(){}};
  globalThis.VideoEncoder=class {
    static async isConfigSupported(config){return {supported:true,config};}
    constructor(callbacks){this.callbacks=callbacks;this.pending=[];this.encodeQueueSize=0;this.state='unconfigured';}
    configure(){this.state='configured';}
    encode(frame,options){this.pending.push({...frame.options,key:options.keyFrame});this.encodeQueueSize++;}
    async flush(){for(const frame of this.pending.splice(0))this.callbacks.output({timestamp:frame.timestamp,type:frame.key?'key':'delta',byteLength:5,copyTo(bytes){bytes.set([0,0,0,1,65]);}});this.encodeQueueSize=0;}
    close(){this.state='closed';}
  };
  painted.playing=false;painted.draws.length=0;
  const previewTime=painted.elapsed;
  assert((await painted.recordLoop(.1)).size>0);
  for(let frame=0;frame<6;frame++)for(const draw of painted.draws.slice(frame*6,frame*6+6))assert.equal(draw.time,Math.fround(frame/60),'Exported binary round remains synchronized');
  assert.deepEqual(painted.pointPlayback,preview,'Export does not advance or destroy manual point clocks');
  close(painted.elapsed,previewTime,'Export restores preview global time');
  checks.push('actual_record_loop_ignores_manual_clocks_and_restores_the_preview');
} finally {
  for(const [name,descriptor] of original)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
}

console.log(JSON.stringify({ok:true,checks,boundary:'Real renderer with mocked Spine/canvas/codecs; visual pixels, pointer events and decoded audio require browser QA.'}));
