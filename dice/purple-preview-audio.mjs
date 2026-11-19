import {DiceAudio,DICE_SOUND_EVENTS} from './audio.mjs';

const safe=fn=>{try{fn();}catch{}};

// Preview channels share decoded sounds; the green player and export mixer keep
// their original single-round behavior in audio.mjs.
export class PurplePreviewAudio extends DiceAudio {
  constructor(options) { super(options); this.nodes=new Map(); }

  playRound({six=true,elapsed=0,channel='preview'}={}) {
    if(!this.enabled||!this.ready||this.disposed||this.context?.state!=='running')return false;
    this.stop(channel);
    if(!Number.isFinite(elapsed)||elapsed<0)throw Error('音效起播位置无效');
    const context=this.context,start=context.currentTime;
    try {
      for(const event of DICE_SOUND_EVENTS) {
        if(!six&&event.name==='sound_ui_dice6')continue;
        const offset=Math.max(0,elapsed-event.time),buffer=this.sounds[event.name];
        if(offset>=buffer.duration)continue;
        const node=context.createBufferSource();node.buffer=buffer;this.nodes.set(node,channel);
        node.onended=()=>{this.nodes.delete(node);safe(()=>node.disconnect());};
        node.connect(context.destination);node.start(start+Math.max(0,event.time-elapsed),offset);
      }
      return true;
    } catch(error) { this.stop(channel);throw error; }
  }

  stop(channel) {
    for(const [node,current] of this.nodes) {
      if(channel!==undefined&&channel!==current)continue;
      node.onended=null;safe(()=>node.stop());safe(()=>node.disconnect());this.nodes.delete(node);
    }
  }
}
