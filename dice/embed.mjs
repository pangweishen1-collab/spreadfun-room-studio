import { getLanguage, toggleLanguage } from './preview-i18n.js';

export function connectEmbedded(renderer, {onFiles, isBusy = () => false} = {}) {
  let toolActive = window.parent === window;
  const context = {isActive:() => toolActive};
  if (toolActive) return context;
  if (renderer) renderer.visible = false;
  const main = document.querySelector('main');
  let scheduled = false;
  const height = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      window.parent.postMessage({type:'fun-dice-height', height:main.getBoundingClientRect().height + 2}, location.origin);
    });
  };
  const setContext = ({active, language}) => {
    if (['zh','en'].includes(language) && language !== getLanguage()) toggleLanguage();
    if (typeof active === 'boolean') {
      toolActive = active;
      if (renderer) {
        renderer.visible = active;
        renderer.last = performance.now();
        if (!active && renderer.recordingLoop) renderer.recordingAbort?.(new Error('录制期间页面被切到后台，请保持此页可见后重试'));
      }
    }
    height();
  };
  const initial = new URLSearchParams(location.search).get('lang');
  if (initial) setContext({language:initial});
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'fun-dice-context') setContext(event.data);
    if (event.data?.type === 'fun-dice-files' && toolActive && !document.hidden &&
        !document.querySelector('dialog[open]') && !isBusy() && typeof onFiles === 'function' && Array.isArray(event.data.files)) {
      const files = Array.from(event.data.files);
      if (!files.length || !files.every(file => file instanceof File)) return;
      try { Promise.resolve(onFiles(files)).catch(error => console.error('Pasted file upload failed:', error)); }
      catch (error) { console.error('Pasted file upload failed:', error); }
    }
  });
  new ResizeObserver(height).observe(main);
  window.addEventListener('resize', height);
  window.parent.postMessage({type:'fun-dice-ready'}, location.origin);
  height();
  return context;
}
