/** Shared time-based opacity for the editing preview and encoded VAP frames. */
export function normalizeGiftFade(value={enabled:true,fadeIn:1,fadeOut:1}){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean')throw new TypeError('礼物淡入淡出设置无效。');
  const {enabled,fadeIn=1,fadeOut=1}=value;
  if(![fadeIn,fadeOut].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=120))throw new RangeError('淡入和淡出时长须为 0–120 秒。');
  return {enabled,fadeIn,fadeOut};
}

export function giftFadeOpacity(timestamp,duration,fps,fade={enabled:true,fadeIn:1,fadeOut:1}){
  if(![timestamp,duration,fps].every(v=>typeof v==='number'&&Number.isFinite(v))||duration<=0||fps<=0)throw new RangeError('淡入淡出时间参数无效。');
  if(!fade.enabled||fade.fadeIn===0&&fade.fadeOut===0)return 1;
  // End at the last *displayed* frame, rather than an unencoded duration point.
  // Compress both ramps proportionally for short clips so they meet at 100%.
  const frames=Math.max(1,Math.ceil(duration*fps-1e-7));
  // A still or two-frame sequence has no interior frame. Preserve its content
  // instead of making the entire supported input disappear by default.
  if(frames<3)return 1;
  const end=(frames-1)/fps;
  const scale=Math.min(1,end/(fade.fadeIn+fade.fadeOut)),fadeIn=fade.fadeIn*scale,fadeOut=fade.fadeOut*scale,t=Math.max(0,Math.min(end,timestamp));
  return Math.max(0,Math.min(1,fadeIn?t/fadeIn:1,fadeOut?(end-t)/fadeOut:1));
}

// Pixels here are straight RGBA. Keep their original colors and fade alpha;
// packed RGB premultiplication is handled once by the export pipeline.
export function applyGiftFade(image,opacity){
  if(typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)throw new RangeError('礼物透明度无效。');
  if(opacity!==1)for(let i=3;i<image.data.length;i+=4)image.data[i]=Math.round(image.data[i]*opacity);
  return image;
}
