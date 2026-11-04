// These are the agreed website timings, not recovered event frames from .spine.
export const DICE_SOUND_EVENTS=Object.freeze([
  Object.freeze({name:'dice_roll',time:0,url:'/dice/assets/audio/dice_roll.mp3'}),
  Object.freeze({name:'sound_ui_dice6',time:.6,url:'/dice/assets/audio/sound_ui_dice6.mp3'}),
]);
const safe=fn=>{try{fn?.();}catch{}};
const audioError=name=>new Error(`${name==='dice_roll'?'滚动':'六点'}音效加载失败，请检查音频或关闭音效后导出`);
const selected=six=>DICE_SOUND_EVENTS.filter(event=>six||event.name!=='sound_ui_dice6');
const urls=audio=>Object.fromEntries(DICE_SOUND_EVENTS.map(event=>[event.name,audio?.[event.name]||event.url]));
const cancelled=signal=>{if(signal?.aborted)throw Object.assign(new Error('音效处理已取消'),{name:'AbortError'});};

async function decodeSounds(context,audio,{fetch:read=globalThis.fetch,signal,six=true}={}){
  const locations=urls(audio),pairs=await Promise.all(selected(six).map(async event=>{
    try{
      cancelled(signal);const response=await read(locations[event.name],{signal});
      if(!response.ok)throw Error('HTTP');const bytes=await response.arrayBuffer();
      if(!bytes.byteLength||bytes.byteLength>8*1024*1024)throw Error('size');
      const buffer=await context.decodeAudioData(bytes.slice(0));cancelled(signal);
      if(!(buffer.duration>0&&buffer.duration<=30)||!Number.isFinite(buffer.duration))throw Error('duration');
      return [event.name,buffer];
    }catch(error){cancelled(signal);if(error?.name==='AbortError')throw error;throw audioError(event.name);}
  }));
  return Object.fromEntries(pairs);
}

/** Six seconds, mono. Muted output returns null without fetching or decoding. */
export async function mixReviewAudio(audio,{soundEnabled=true,six=true,sampleRate=48000,signal,
  OfflineAudioContext:Context=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext,
  fetch:read=globalThis.fetch}={}){
  if(!soundEnabled)return null;
  if(![44100,48000].includes(sampleRate))throw new Error('音轨采样率须为44100或48000');
  if(typeof Context!=='function')throw new Error('当前浏览器无法混合音效，请关闭音效后导出');
  cancelled(signal);let context;
  try{context=new Context(1,6*sampleRate,sampleRate);}catch{throw new Error('当前浏览器无法混合音效，请关闭音效后导出');}
  const nodes=[];
  try{
    const sounds=await decodeSounds(context,audio,{fetch:read,signal,six});
    for(const round of [0,2,4])for(const event of selected(six)){
      cancelled(signal);const node=context.createBufferSource();nodes.push(node);node.buffer=sounds[event.name];node.connect(context.destination);node.start(round+event.time);
    }
    const buffer=await context.startRendering();cancelled(signal);
    if(buffer.numberOfChannels!==1||buffer.length!==6*sampleRate||buffer.sampleRate!==sampleRate)throw new Error('混合音轨规格异常，请关闭音效后导出');
    // Keep overlap from clipping; otherwise retain the decoded amplitudes.
    const pcm=buffer.getChannelData(0);let peak=0;
    for(const value of pcm){if(!Number.isFinite(value))throw new Error('音效数据无效，请关闭音效后导出');peak=Math.max(peak,Math.abs(value));}
    if(peak>.98){const gain=.98/peak;for(let i=0;i<pcm.length;i++)pcm[i]*=gain;}
    return buffer;
  }finally{for(const node of nodes)safe(()=>node.disconnect());}
}

export class DiceAudio{
  constructor({AudioContext:Context=globalThis.AudioContext||globalThis.webkitAudioContext,fetch:read=globalThis.fetch}={}){
    this.Context=Context;this.fetch=read;this.context=null;this.enabled=true;this.ready=false;this.disposed=false;this.revision=0;this.nodes=new Set();this.sounds={};this.loading=null;
  }
  getContext(){
    if(this.disposed)throw new Error('音效播放器已关闭');
    if(!this.context){if(typeof this.Context!=='function')throw new Error('当前浏览器不支持音效');this.context=new this.Context();}
    return this.context;
  }
  async load(audio={}){
    const revision=++this.revision;this.ready=false;this.stop();this.loading?.abort();
    const context=this.getContext(),controller=typeof AbortController==='function'?new AbortController():null;this.loading=controller;
    try{
      const sounds=await decodeSounds(context,audio,{fetch:this.fetch,signal:controller?.signal});
      if(this.disposed||revision!==this.revision)return false;
      this.sounds=sounds;this.ready=true;return true;
    }finally{if(this.loading===controller)this.loading=null;}
  }
  async unlock(){const context=this.getContext();if(context.state!=='running')await context.resume();return context.state==='running';}
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stop();}
  playRound({six=true}={}){
    if(!this.enabled||!this.ready||this.disposed||this.context?.state!=='running')return false;
    this.stop();const context=this.context,start=context.currentTime;
    try{
      for(const event of selected(six)){
        const node=context.createBufferSource();node.buffer=this.sounds[event.name];this.nodes.add(node);
        node.onended=()=>{this.nodes.delete(node);safe(()=>node.disconnect());};node.connect(context.destination);node.start(start+event.time);
      }
      return true;
    }catch(error){this.stop();throw error;}
  }
  stop(){for(const node of this.nodes){node.onended=null;safe(()=>node.stop());safe(()=>node.disconnect());}this.nodes.clear();}
  async dispose(){this.stop();this.loading?.abort();this.loading=null;this.disposed=true;this.ready=false;this.revision++;this.sounds={};const context=this.context;this.context=null;if(context&&context.state!=='closed')await context.close();}
}
