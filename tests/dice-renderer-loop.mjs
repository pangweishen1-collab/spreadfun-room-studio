// Orchestration checks against the real renderer. Canvas/codec/browser APIs are
// mocks; encoded quality, size and actual playback require browser/file QA.
import assert from 'node:assert/strict';
import {Blob as NodeBlob} from 'node:buffer';
import {GameRenderer} from '../dice/renderer.js';
import {VIDEO_SPEC} from '../dice/video-export.mjs';

const names = ['Blob','document','VideoEncoder','VideoFrame','MediaRecorder','requestAnimationFrame','setTimeout','clearTimeout'];
const originalGlobals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis,name)]));
const timers = new Map(), listeners = new Set();
let nextTimer = 0, scenario = 'native', encoders = [], frames = [], streams = [], recorders = [], maxQueue = 0;
const supportedConfigs = [];
const checks = [];

globalThis.Blob=NodeBlob;
globalThis.requestAnimationFrame=()=>{};
globalThis.setTimeout = (callback, milliseconds=0) => {
  const id = ++nextTimer;
  timers.set(id,{callback,milliseconds});
  // Yield timers and the fallback's requested six-second stop are simulated.
  // Watchdogs remain tracked so missing cleanup makes the assertions fail.
  if (milliseconds===0 || milliseconds===VIDEO_SPEC.duration*1000) {
    queueMicrotask(() => { if (timers.delete(id)) callback(); });
  }
  return id;
};
globalThis.clearTimeout = id => timers.delete(id);
globalThis.document = {
  hidden:false,
  addEventListener(type,listener) { assert.equal(type,'visibilitychange');listeners.add(listener); },
  removeEventListener(type,listener) { assert.equal(type,'visibilitychange');listeners.delete(listener); },
};
const hide = () => { document.hidden=true;for (const listener of [...listeners]) listener(); };
globalThis.VideoFrame = class {
  constructor(canvas,options) { this.options={...options};this.closed=false;frames.push(this); }
  close() { assert.equal(this.closed,false,'VideoFrame must be released exactly once');this.closed=true; }
};
class MockEncoder {
  static async isConfigSupported(config) {
    supportedConfigs.push(config);
    if (scenario.startsWith('reorder') && config.codec==='avc1.42002a' && encoders.length) {
      assert.equal(encoders[0].state,'closed','Release the first encoder before Baseline retry');
      assert.ok(frames.every(frame=>frame.closed),'Release first-attempt frames before retry');
      assert.equal(timers.size,1,'Only the new attempt watchdog may remain');
      assert.equal(listeners.size,1,'Only the new attempt visibility listener may remain');
    }
    return {supported:!scenario.startsWith('fallback'),config};
  }
  constructor(callbacks) {
    if(scenario.startsWith('reorder'))assert.ok(encoders.length<2,'A reordered Baseline attempt must never retry again');
    this.callbacks=callbacks;this.pending=[];this.inputs=[];this.encodeQueueSize=0;this.state='unconfigured';this.closes=0;
    encoders.push(this);
  }
  configure(config) { this.config=config;this.state='configured'; }
  encode(frame,options) {
    assert.equal(frame.closed,false,'Only open VideoFrames may be encoded');
    const entry={...frame.options,keyFrame:options.keyFrame};
    this.inputs.push(entry);this.pending.push(entry);
    this.encodeQueueSize++;maxQueue=Math.max(maxQueue,this.encodeQueueSize);
  }
  async flush() {
    if (scenario==='error') { this.callbacks.error(new Error('mock encoder error'));return; }
    let pending=this.pending.splice(0);
    if ((scenario==='reorder'&&this.config.codec!=='avc1.42002a')||scenario==='reorder-always') {
      pending=[pending[0],pending[0],...pending.slice(1)];
    }
    for (const entry of pending) this.callbacks.output({
      timestamp:entry.timestamp,type:entry.keyFrame?'key':'delta',
      byteLength:scenario==='oversize'&&this.config.bitrate===VIDEO_SPEC.bitrate?8500:5,
      copyTo(bytes) { bytes.set([0,0,0,1,65]); },
    });
    this.encodeQueueSize=0;
  }
  close() { this.state='closed';this.encodeQueueSize=0;this.closes++; }
}
globalThis.VideoEncoder=MockEncoder;
globalThis.MediaRecorder=class {
  static isTypeSupported(type) { return type==='video/webm;codecs=vp9'; }
  constructor(stream,options) { this.stream=stream;this.options=options;this.state='inactive';recorders.push(this); }
  start(interval) {
    assert.equal(interval,250);this.state='recording';
    if(scenario==='fallback-hidden')queueMicrotask(hide);
    if(scenario==='fallback') {
      const {renderer}=this.stream;
      for(const elapsed of [25,42,2025])renderer.tick(renderer.recordingStarted+elapsed);
    }
  }
  stop() {
    this.state='inactive';
    this.ondataavailable?.({data:new Blob(['mock fallback'],{type:this.options.mimeType})});
    this.onstop?.();
  }
};

const stateKeys=['mode','target','elapsed','sequence','playing','stopAfterRound','wasPlaying','autoLoop','loopSeconds'];
function makeRenderer(playing=true) {
  const renderer=Object.create(GameRenderer.prototype);
  Object.assign(renderer,{data:{},loadId:4,visible:true,mode:'continuous',target:6,elapsed:.8,sequence:4,
    playing,stopAfterRound:true,wasPlaying:playing,autoLoop:true,loopSeconds:2,drawCalls:[],onStatus(){},
    canvas:{captureStream(fps) {
      assert.equal(fps,VIDEO_SPEC.fps);
      const stream={renderer,stops:0,getTracks(){return [{stop(){stream.stops++;}}];}};
      streams.push(stream);return stream;
    }},
    draw(time=this.elapsed) {
      this.drawCalls.push({time,sequence:this.sequence});
      if(scenario==='hidden'&&this.recordingLoop&&this.drawCalls.length===3)hide();
    },
  });
  renderer.saved=Object.fromEntries(stateKeys.map(key=>[key,renderer[key]]));
  return renderer;
}
async function assertClean(renderer) {
  await Promise.resolve();
  for(const key of stateKeys)assert.equal(renderer[key],renderer.saved[key],`Restore ${key}`);
  for(const key of ['recording','recordingLoop','offlineEncoding'])assert.equal(renderer[key],false,`Clear ${key}`);
  assert.equal(renderer.recordingCheck,null);assert.equal(renderer.recordingAbort,null);
  assert.ok(renderer.cancelLoopRecording==null);
  assert.equal(timers.size,0,'No watchdog, yield or fallback stop timer may remain');
  assert.equal(listeners.size,0,'No visibility listener may remain');
  assert.ok(frames.every(frame=>frame.closed),'Every created VideoFrame must be closed');
  assert.ok(encoders.every(encoder=>encoder.state==='closed'&&encoder.closes===1),'Every created encoder must be closed once');
}
function reset(next) {
  assert.equal(timers.size,0);assert.equal(listeners.size,0);
  scenario=next;document.hidden=false;encoders=[];frames=[];streams=[];recorders=[];maxQueue=0;supportedConfigs.length=0;
}

try {
  assert.equal(VIDEO_SPEC.maxBytes,1_500_000,'Actual output size is capped at 1.5 MB');
  assert.equal(VIDEO_SPEC.bitrate,2_500_000,'Allocate more bits for motion detail');
  assert.equal(VIDEO_SPEC.fps,60);
  const probe=makeRenderer();
  const config=await probe.loopEncoderConfig();
  assert.equal(config.bitrate,VIDEO_SPEC.bitrate,'Native encoder must use the shared export bitrate');
  assert.equal(config.framerate,VIDEO_SPEC.fps);
  assert.equal(config.codec,'avc1.64002a','Prefer Level 4.2 High at 720×1600 and 60 fps');
  assert.equal((await probe.loopEncoderConfig(true)).codec,'avc1.42002a','Retry can request Baseline only');
  checks.push('real_loop_encoder_config_uses_shared_bitrate_high_priority_and_actual_size_gate');

  reset('native');
  const native=makeRenderer();
  const blob=await native.recordLoop(VIDEO_SPEC.duration);
  const encoder=encoders[0];
  assert.equal(blob.type,'video/h264');assert.ok(blob.size>0);
  assert.equal(encoder.config.bitrate,VIDEO_SPEC.bitrate,'The encoder uses the shared bitrate');
  assert.equal(encoder.config.avc.format,'annexb');assert.equal(encoder.config.codec,'avc1.64002a');
  assert.equal(encoder.inputs.length,360);assert.equal(frames.length,360);
  assert.deepEqual(encoder.inputs.flatMap((entry,index)=>entry.keyFrame?[index]:[]),[0,120,240]);
  assert.deepEqual(encoder.inputs.map(entry=>entry.timestamp),Array.from({length:360},(_,index)=>Math.round(index*1_000_000/60)));
  assert.ok(encoder.inputs.every(entry=>entry.duration===16666||entry.duration===16667));
  assert.equal(encoder.inputs.reduce((total,entry)=>total+entry.duration,0),6_000_000);
  assert.equal(maxQueue,4,'Exercise the queue bound, not only the empty-queue path');
  assert.deepEqual(native.drawCalls.slice(0,360),Array.from({length:360},(_,index)=>({
    time:(index%120)/60,sequence:Math.floor(index/120),
  })),'Sample fresh half-ticks in each two-second round rather than duplicating a 30 fps render');
  await assertClean(native);
  checks.push('360_fresh_draws_two_second_keyframes_exact_cadence_queue_bound_and_preview_restore');

  reset('oversize');
  const oversize=makeRenderer();
  assert.equal((await oversize.recordLoop(6)).size,360*5);
  assert.equal(encoders.length,2,'Overshoot must encode the source exactly one more time');
  assert.ok(encoders[1].config.bitrate<encoders[0].config.bitrate);
  assert.deepEqual(encoders[1].inputs,encoders[0].inputs);
  await assertClean(oversize);
  checks.push('native_overshoot_retries_from_original_frames_at_lower_bitrate');

  reset('error');
  const failed=makeRenderer();
  await assert.rejects(failed.recordLoop(6),/视频编码失败/);
  await assertClean(failed);
  checks.push('encoder_error_rejects_and_cleans_resources');

  reset('reorder');
  const retry=makeRenderer();
  assert.equal((await retry.recordLoop(6)).type,'video/h264');
  assert.equal(encoders.length,2,'Reordered High output retries Baseline exactly once');
  assert.deepEqual(encoders.map(value=>value.config.codec),['avc1.64002a','avc1.42002a']);
  assert.equal(encoders[1].inputs.length,360,'Baseline retry generates a complete fresh loop');
  assert.ok(encoders.every(value=>value.config.bitrate===VIDEO_SPEC.bitrate));
  await assertClean(retry);
  checks.push('reordered_high_output_cleans_up_then_retries_baseline_once');

  reset('reorder-always');
  const retryFailed=makeRenderer();
  await assert.rejects(retryFailed.recordLoop(6),/视频编码帧顺序异常/);
  assert.equal(encoders.length,2,'A failed Baseline retry must terminate');
  assert.deepEqual(encoders.map(value=>value.config.codec),['avc1.64002a','avc1.42002a']);
  await assertClean(retryFailed);
  checks.push('reordered_baseline_retry_rejects_without_an_infinite_retry');

  reset('hidden');
  const hidden=makeRenderer();
  await assert.rejects(hidden.recordLoop(6),/后台/);
  document.hidden=false;await assertClean(hidden);
  checks.push('mid_recording_hidden_page_rejects_and_restores_preview');

  reset('fallback');
  const fallback=makeRenderer(false);
  const fallbackBlob=await fallback.recordLoop(6);
  assert.equal(supportedConfigs.length,6,'Try High/Main/Baseline hardware variants before falling back');
  assert.deepEqual(supportedConfigs.map(value=>value.codec),['avc1.64002a','avc1.64002a','avc1.4d002a','avc1.4d002a','avc1.42002a','avc1.42002a']);
  assert.ok(supportedConfigs.every(value=>value.bitrate===VIDEO_SPEC.bitrate));
  assert.equal(encoders.length,0);
  assert.equal(recorders[0].options.videoBitsPerSecond,VIDEO_SPEC.bitrate,'Fallback recorder must share the export bitrate');
  assert.equal(fallbackBlob.type,'video/webm;codecs=vp9');
  assert.deepEqual(fallback.drawCalls.slice(0,4),[
    {time:0,sequence:0},{time:1/60,sequence:0},{time:2/60,sequence:0},{time:1/60,sequence:1},
  ],'Realtime ticks also sample the new 60 fps cadence across rounds');
  assert.equal(streams[0].stops,1,'Fallback capture tracks must stop');
  assert.equal(recorders[0].onstop,null);assert.equal(recorders[0].onerror,null);assert.equal(recorders[0].ondataavailable,null);
  await assertClean(fallback);
  checks.push('unsupported_native_encoder_uses_real_fallback_and_clears_both_watchdogs');

  reset('fallback-hidden');
  const fallbackHidden=makeRenderer();
  await assert.rejects(fallbackHidden.recordLoop(6),/后台/);
  document.hidden=false;
  assert.equal(streams[0].stops,1);
  await assertClean(fallbackHidden);
  checks.push('fallback_hidden_interruption_clears_stop_timer_and_stream');
} finally {
  for(const [name,descriptor] of originalGlobals) {
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
}

export const report={passed:true,bitrate:VIDEO_SPEC.bitrate,frames:VIDEO_SPEC.frameCount,checks,
  boundary:'Real imported renderer with mock browser codecs/canvas. Does not prove actual compressed size, quality or GPU rendering.'};
console.log(JSON.stringify(report));
