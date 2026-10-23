/* Native, opt-in feedback examples. No requests, storage, counters or business tasks. */
(() => {
  'use strict';
  const activities = new Set();
  const parallaxes = new Map();
  const visibility = new Map();
  const transitions = new Map();
  const listeners = [];
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
  const finePointer = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 541px)') : {matches:false};
  let observer = null;
  let frame = null;
  let mounted = false;
  let paused = false;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function isVisible(element) {
    if (visibility.has(element)) return visibility.get(element);
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
  }
  function canMove(element) { return !paused && !document.hidden && !reduced.matches && finePointer.matches && isVisible(element); }
  function setOffset(element, x, y) {
    const record = parallaxes.get(element);
    record.layers.forEach(layer => {
      const number = Number(layer.dataset.ftDepth);
      const depth = Number.isFinite(number) ? Math.max(0,Math.min(1,number)) : 1;
      layer.style.setProperty('--ft-parallax-x',`${(x * depth).toFixed(2)}px`);
      layer.style.setProperty('--ft-parallax-y',`${(y * depth).toFixed(2)}px`);
    });
  }
  function update() {
    frame = null;
    activities.forEach(element => {
      element.dataset.ftRunning = String(!paused && !document.hidden && !reduced.matches && isVisible(element));
    });
    parallaxes.forEach((record, element) => {
      if (!canMove(element)) { record.x = 0;record.y = 0;setOffset(element,0,0); return; }
      if (record.mode === 'pointer') { setOffset(element,record.x,record.y); return; }
      const box = element.getBoundingClientRect();
      const travel = (window.innerHeight / 2 - (box.top + box.height / 2)) / (window.innerHeight / 2 + box.height / 2);
      setOffset(element,0,Math.max(-1,Math.min(1,travel)) * 12);
    });
  }
  function schedule() {
    if (document.hidden || paused || reduced.matches) { cancelFrame();update();return; }
    if (frame !== null) return;
    if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(update);
    else update();
  }
  function cancelFrame() {
    if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    frame = null;
  }
  function settleTransitions() {
    transitions.forEach((record, element) => {
      transitions.delete(element);
      record.animation.cancel();
      element.hidden = record.exiting;
      if (record.supportsInert) element.inert = record.originalInert;
    });
  }
  function refresh() {
    cancelFrame();
    if (reduced.matches) settleTransitions();
    update();
  }
  function transition(element, exiting) {
    if (!element || element.nodeType !== 1) return Promise.resolve(false);
    const previous = transitions.get(element);
    const supportsInert = 'inert' in element;
    const originalInert = previous ? previous.originalInert : Boolean(element.inert);
    if (previous) { transitions.delete(element); previous.animation.cancel(); }
    if (exiting && element.hidden) { if (supportsInert) element.inert = originalInert;return Promise.resolve(true); }
    element.hidden = false;
    if (supportsInert) element.inert = exiting ? true : originalInert;
    if (reduced.matches || typeof element.animate !== 'function' || (exiting && !supportsInert)) {
      element.hidden = exiting;
      if (supportsInert) element.inert = originalInert;
      return Promise.resolve(true);
    }
    const fade = element.dataset.ftReveal === 'fade';
    const animation = element.animate(exiting ? [
      {opacity:1,transform:'translateY(0)'},{opacity:0,transform:fade ? 'translateY(0)' : 'translateY(3px)'}
    ] : [
      {opacity:0,transform:fade ? 'translateY(0)' : 'translateY(6px)'},{opacity:1,transform:'translateY(0)'}
    ], {duration:exiting ? 120 : 180,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
    const record = {animation,exiting,originalInert,supportsInert};
    transitions.set(element,record);
    return animation.finished.then(() => {
      if (transitions.get(element) !== record) return false;
      transitions.delete(element);
      element.hidden = exiting;
      if (supportsInert) element.inert = originalInert;
      animation.cancel();
      return true;
    }, () => false);
  }
  function elements(root, selector) {
    const found = Array.from(root.querySelectorAll(selector));
    if (root.nodeType === 1 && root.matches(selector)) found.unshift(root);
    return found;
  }
  function init(root = document) {
    if (!mounted) {
      mounted = true;
      if (typeof window.IntersectionObserver === 'function') {
        observer = new window.IntersectionObserver(entries => {
          entries.forEach(entry => visibility.set(entry.target,entry.isIntersecting));
          schedule();
        });
      }
      listen(window,'scroll',schedule,{passive:true});
      listen(window,'resize',refresh,{passive:true});
      listen(document,'visibilitychange',refresh);
      [reduced,finePointer].forEach(query => {
        if (typeof query.addEventListener === 'function') listen(query,'change',refresh);
        else if (typeof query.addListener === 'function') { query.addListener(refresh); listeners.push(() => query.removeListener(refresh)); }
      });
      listen(document,'click',event => {
        const button = event.target.closest('[data-ft-action][data-ft-target]');
        if (!button || button.disabled) return;
        const element = document.getElementById(button.dataset.ftTarget);
        if (!element || !element.hasAttribute('data-ft-reveal')) return;
        if (button.dataset.ftAction === 'exit') transition(element,true);
        else if (['enter','replay'].includes(button.dataset.ftAction)) transition(element,false);
      });
    }
    elements(root,'[data-ft-activity]').forEach(element => {
      if (activities.has(element)) return;
      activities.add(element);
      if (observer) observer.observe(element);
    });
    elements(root,'[data-ft-parallax]').forEach(element => {
      if (parallaxes.has(element) || !['pointer','scroll'].includes(element.dataset.ftParallax)) return;
      const record = {mode:element.dataset.ftParallax,layers:Array.from(element.querySelectorAll('[data-ft-layer]')),x:0,y:0};
      parallaxes.set(element,record);
      if (observer) observer.observe(element);
      if (record.mode === 'pointer') {
        listen(element,'pointermove',event => {
          if (!canMove(element) || (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
          const box = element.getBoundingClientRect();
          record.x = Math.max(-1,Math.min(1,(event.clientX - box.left) / box.width * 2 - 1)) * 6;
          record.y = Math.max(-1,Math.min(1,(event.clientY - box.top) / box.height * 2 - 1)) * 6;
          schedule();
        },{passive:true});
        listen(element,'pointerleave',() => { record.x = 0; record.y = 0; schedule(); });
      }
    });
    refresh();
    return api;
  }
  function destroy() {
    cancelFrame();
    settleTransitions();
    listeners.splice(0).forEach(remove => remove());
    if (observer) observer.disconnect();
    observer = null;
    activities.forEach(element => { element.dataset.ftRunning = 'false'; });
    parallaxes.forEach((record,element) => setOffset(element,0,0));
    activities.clear();parallaxes.clear();visibility.clear();mounted = false;
  }
  const api = {init,refresh,destroy,setPaused:value => { paused = Boolean(value);refresh(); },enter:element => transition(element,false),exit:element => transition(element,true),replay:element => transition(element,false)};
  window.FunToolkitFeedback = api;
  if (document.readyState === 'loading') listen(document,'DOMContentLoaded',() => init(),{once:true});
  else init();
})();
