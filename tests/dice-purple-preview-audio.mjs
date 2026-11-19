import assert from 'node:assert/strict';
import {PurplePreviewAudio} from '../dice/purple-preview-audio.mjs';

class Context {
  constructor(){this.state='suspended';this.currentTime=10;this.destination={};this.sources=[];}
  async decodeAudioData(bytes){return {duration:new Uint8Array(bytes)[0]===1?.95:1.15};}
  createBufferSource(){const source={stopped:0,disconnects:0,connect(){},disconnect(){this.disconnects++;},stop(){this.stopped++;},start(time,offset){this.time=time;this.offset=offset;}};this.sources.push(source);return source;}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
}
const fetch=async url=>({ok:true,arrayBuffer:async()=>new Uint8Array([String(url).includes('dice6')?2:1]).buffer});
const audio=new PurplePreviewAudio({AudioContext:Context,fetch});
await audio.load();assert.equal(audio.playRound(),false);await audio.unlock();
const context=audio.context;
audio.playRound({channel:'point-1',six:false});const first=context.sources.at(-1);
audio.playRound({channel:'point-2',six:false});const second=context.sources.at(-1);
assert.equal(first.stopped,0);assert.equal(second.stopped,0);assert.equal(audio.nodes.size,2);
audio.playRound({channel:'point-1',six:false});const replay=context.sources.at(-1);
assert.equal(first.stopped,1);assert.equal(second.stopped,0);assert.equal(replay.stopped,0);
audio.playRound({channel:'point-6',six:true});const six=context.sources.slice(-2);
assert.deepEqual(six.map(source=>source.time),[10,10.6]);assert.deepEqual(six.map(source=>source.offset),[0,0]);
audio.stop('point-6');assert(six.every(source=>source.stopped===1));assert.equal(second.stopped,0);
audio.playRound({channel:'preview',six:true,elapsed:.4});const inherited=context.sources.slice(-2);
assert.deepEqual(inherited.map(source=>source.time),[10,10.2]);assert.deepEqual(inherited.map(source=>source.offset),[.4,0]);
audio.playRound({channel:'preview',six:false,elapsed:.65});const withoutSix=context.sources.at(-1);
assert(inherited.every(source=>source.stopped===1));assert.equal(withoutSix.offset,.65);assert.equal(second.stopped,0);
audio.playRound({channel:'point-6',six:true,elapsed:.8});const resumed=context.sources.slice(-2);
assert.deepEqual(resumed.map(source=>source.time),[10,10]);assert(Math.abs(resumed[1].offset-.2)<1e-9);
audio.setEnabled(false);assert.equal(audio.nodes.size,0);assert.equal(audio.playRound({channel:'point-3'}),false);
audio.setEnabled(true);audio.playRound({channel:'point-3',six:false});const beforeLoad=context.sources.at(-1);
await audio.load();assert.equal(beforeLoad.stopped,1);assert.equal(audio.nodes.size,0);
audio.playRound({channel:'point-4',six:false});const finishing=context.sources.at(-1);finishing.onended();assert(!audio.nodes.has(finishing));
assert.throws(()=>audio.playRound({channel:'invalid',elapsed:-1}),/起播位置/);
await audio.dispose();assert.equal(context.state,'closed');assert.equal(audio.playRound(),false);
console.log(JSON.stringify({ok:true,checks:['independent channels','replay cancels only its channel','six-only landing','inherited group resumes at original offset','six override removes old group cue','elapsed resume','mute/load/dispose cleanup','ended node cleanup'],boundary:'Web Audio scheduling mocks; actual browser sound and renderer timing are separate checks.'}));
