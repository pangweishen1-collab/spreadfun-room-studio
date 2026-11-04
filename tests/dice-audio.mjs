// Deterministic Web Audio mocks test event scheduling/mixing and lifecycle.
// They do not certify a real AAC encoder or browser playback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DICE_SOUND_EVENTS,DiceAudio,mixReviewAudio} from '../dice/audio.mjs';

class Buffer{
  constructor(channels,length,rate,value=0){this.numberOfChannels=channels;this.length=length;this.sampleRate=rate;this.duration=length/rate;this.data=Array.from({length:channels},()=>new Float32Array(length).fill(value));}
  getChannelData(channel){return this.data[channel];}
}
class Context{
  static instances=[];
  constructor(channels=1,length=288000,rate=48000){this.channels=channels;this.length=length;this.sampleRate=rate;this.destination={};this.sources=[];this.currentTime=10;this.state='suspended';this.rendered=false;Context.instances.push(this);}
  async decodeAudioData(bytes){const marker=new Uint8Array(bytes)[0];if(marker===9)throw Error('corrupt');return new Buffer(1,Math.round(this.sampleRate*(marker===1?.95:1.15)),this.sampleRate,marker===1?.2:.4);}
  createBufferSource(){const node={buffer:null,disconnected:false,stopped:0,connect(){},disconnect(){this.disconnected=true;},start(time){this.time=time;},stop(){this.stopped++;}};this.sources.push(node);return node;}
  async startRendering(){this.rendered=true;const output=new Buffer(this.channels,this.length,this.sampleRate),pcm=output.getChannelData(0);for(const node of this.sources){const start=Math.round(node.time*this.sampleRate),samples=node.buffer.getChannelData(0);for(let i=0;i<samples.length&&start+i<pcm.length;i++)pcm[start+i]+=samples[i];}return output;}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
}
const calls=[];
const read=async url=>{calls.push(url);return {ok:true,arrayBuffer:async()=>new Uint8Array([String(url).includes('dice6')?2:1]).buffer};};
const options={OfflineAudioContext:Context,fetch:read};
const checks=[];
assert.deepEqual(DICE_SOUND_EVENTS.map(e=>[e.name,e.time]),[['dice_roll',0],['sound_ui_dice6',.6]]);
assert.ok(Object.isFrozen(DICE_SOUND_EVENTS)&&DICE_SOUND_EVENTS.every(Object.isFrozen));checks.push('agreed website events, not claimed original editor timings');

for(const sampleRate of [48000,44100]){
  calls.length=0;const mixed=await mixReviewAudio(undefined,{...options,sampleRate}),context=Context.instances.at(-1);
  assert.deepEqual(context.sources.map(s=>s.time),[0,.6,2,2.6,4,4.6]);assert.equal(mixed.numberOfChannels,1);assert.equal(mixed.length,6*sampleRate);assert.equal(mixed.duration,6);
  const pcm=mixed.getChannelData(0),at=t=>pcm[Math.round(t*sampleRate)];
  for(const start of [0,2,4]){assert.ok(Math.abs(at(start+.1)-.2)<1e-6);assert.ok(Math.abs(at(start+.8)-.6)<1e-6);assert.ok(Math.abs(at(start+1.5)-.4)<1e-6);assert.equal(at(start+1.9),0);}
  assert.equal(calls.length,2);assert.ok(context.sources.every(s=>s.disconnected));checks.push(`real mixed sample placement in mono ${sampleRate} Hz mock`);
}
{
  calls.length=0;const count=Context.instances.length;assert.equal(await mixReviewAudio(undefined,{...options,soundEnabled:false}),null);assert.equal(calls.length,0);assert.equal(Context.instances.length,count);checks.push('muted export never fetches/decodes/mixes');
}
{
  calls.length=0;await mixReviewAudio({sound_ui_dice6:'bad-unused'},{...options,six:false});assert.equal(calls.length,1);assert.deepEqual(Context.instances.at(-1).sources.map(s=>s.time),[0,2,4]);checks.push('non-six result omits enhancement and unused audio fetch');
}
{
  await assert.rejects(mixReviewAudio(undefined,{...options,fetch:async()=>({ok:false})}),/音效加载失败/);assert.equal(Context.instances.at(-1).rendered,false);
  await assert.rejects(mixReviewAudio(undefined,{...options,fetch:async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([9]).buffer})}),/音效加载失败/);assert.equal(Context.instances.at(-1).rendered,false);checks.push('HTTP and corrupt decoded audio reject without claiming a mix');
}
{
  await assert.rejects(mixReviewAudio(undefined,{OfflineAudioContext:null}),/关闭音效/);checks.push('missing audio capability explicitly offers muted export');
}
{
  const player=new DiceAudio({AudioContext:Context,fetch:read});await player.load();const context=player.context;
  assert.equal(player.playRound(),false);await player.unlock();assert.equal(player.playRound({six:false}),true);const first=context.sources.at(-1);assert.equal(first.time,10);
  assert.equal(player.playRound({six:true}),true);assert.equal(first.stopped,1);assert.deepEqual(context.sources.slice(-2).map(s=>s.time),[10,10.6]);
  player.setEnabled(false);assert.equal(player.nodes.size,0);assert.equal(player.playRound(),false);player.setEnabled(true);assert.equal(player.playRound(),true);
  player.stop();assert.equal(player.nodes.size,0);await player.dispose();assert.equal(context.state,'closed');assert.equal(player.playRound(),false);checks.push('gesture unlock, one-round replacement, six-only cue, mute/stop/dispose');
}
{
  const player=new DiceAudio({AudioContext:Context,fetch:async()=>({ok:false})});await assert.rejects(player.load(),/音效加载失败/);assert.equal(player.ready,false);assert.equal(player.playRound(),false);await player.dispose();checks.push('failed live load cannot masquerade as a ready player');
}
const assetNames=['audio/dice_roll.mp3','audio/sound_ui_dice6.mp3','anchor.png'];
const expected=['6007c9edac12dc42b6903b67b378108064208f3848bd6868711fc25eed7a02e3','a3d2974ca58eb1851675908461a27e9a1adbb03899e5db48af6888b47e786357','156538f99933d659c3a0c873e38ce78a3dfc6e9f154e162c457e532517f0ea8e'];
for(let i=0;i<assetNames.length;i++)assert.equal(createHash('sha256').update(await readFile(new URL('../dice/assets/'+assetNames[i],import.meta.url))).digest('hex'),expected[i]);
checks.push('bundled two MP3s and anchor are exact copies');
console.log(JSON.stringify({ok:true,checks:checks.length,details:checks,boundary:'Web Audio mocks; actual browser AAC, audible result and final size are verified separately.'}));
