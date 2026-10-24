/* Shared presentation only. Tool code owns files, canvases, task state and counters. */
(() => {
  'use strict';
  const roots = {room:document.getElementById('roomTool'),avatar:document.getElementById('avatarTool'),banner:document.getElementById('bannerTool'),resources:document.getElementById('resourceTool')};
  const phases = new Set(['empty','loading','ready','processing','success','error']);
  const records = new Map();
  const animations = new Map();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const asset = name => `design-system/assets/feedback/${name}.svg`;
  const isZh = () => document.documentElement.lang.startsWith('zh');
  let active = null;

  function visible(element) {
    return !!element && !document.hidden && !element.closest('.hidden,[hidden]') && element.getClientRects().length > 0;
  }
  function reveal(element) {
    if (!visible(element) || reduced?.matches || typeof element.animate !== 'function') return;
    animations.get(element)?.cancel();
    // Opacity only: a working canvas and its coordinate system never move.
    const animation = element.animate([{opacity:.35},{opacity:1}],{duration:160,easing:'ease-out'});
    animations.set(element,animation);
    animation.finished.then(() => { if(animations.get(element)===animation)animations.delete(element); }, () => {});
  }
  function setState(tool, value) {
    const root = roots[tool];
    if (!root || !phases.has(value.phase)) return;
    const previous = records.get(tool);
    records.set(tool,{...value});
    const busy = value.phase==='loading'||value.phase==='processing';
    const message = busy ? value.message || (isZh()?'正在处理…':'Processing…') : '';
    root.dataset.feedbackPhase = value.phase;
    root.querySelector('[data-feedback-stage]')?.setAttribute('aria-busy',String(busy));
    // Keep the last visual label during its 120ms fade-out; the live status clears immediately.
    if(busy)root.querySelectorAll('[data-feedback-message]').forEach(element => { element.textContent=message; });
    const status = root.querySelector('[data-feedback-status]');
    if(status && status.textContent!==message)status.textContent=message;
    root.querySelectorAll('[data-feedback-art]').forEach(image => {
      const source = value.phase==='error'?'empty-error':image.dataset.feedbackArt;
      if(image.getAttribute('src')!==asset(source))image.src=asset(source);
    });
    if(tool==='avatar'){
      const canvas=root.querySelector('#frameOutputCanvas'),placeholder=root.querySelector('#frameOutputEmpty');
      if(canvas&&placeholder)canvas.setAttribute('aria-hidden',String(!placeholder.classList.contains('hidden')));
    }
    // The primitive manages only visual loops, including offscreen/background pause.
    window.FunToolkitFeedback?.refresh();
    if(previous && previous.phase!==value.phase && !busy) {
      root.querySelectorAll('.tool-output-empty:not(.hidden)').forEach(reveal);
    }
  }
  function activate(tool) {
    if(active===tool)return;
    active=tool;
    if(roots[tool])reveal(roots[tool]);
    window.FunToolkitFeedback?.refresh();
  }
  function settleImage(image) {
    const box=image.closest('.output-img');
    if(!box)return;
    box.dataset.feedbackImage=image.naturalWidth>0?'ready':'error';
    image.classList.toggle('is-loaded',image.naturalWidth>0);
  }
  function prepareImages(container) {
    container?.querySelectorAll('.output-img img').forEach(image=>{
      image.loading='lazy';image.decoding='async';
      if(image.complete)settleImage(image);
    });
  }
  document.addEventListener('load',event=>{if(event.target.matches?.('.output-img img'))settleImage(event.target);},true);
  document.addEventListener('error',event=>{if(event.target.matches?.('.output-img img'))settleImage(event.target);},true);
  function stopAnimations() {
    if(!document.hidden&&!reduced?.matches)return;
    animations.forEach(animation=>animation.cancel());animations.clear();
  }
  document.addEventListener('visibilitychange',stopAnimations);
  reduced?.addEventListener?.('change',stopAnimations);
  window.FunToolkitUI={setState,reveal,activate,prepareImages};
  for(const tool of Object.keys(roots))setState(tool,{phase:'empty'});
})();
