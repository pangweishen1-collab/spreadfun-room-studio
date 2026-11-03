import { getLanguage, toggleLanguage } from './preview-i18n.js';

export function connectEmbedded(renderer) {
  if (window.parent === window) return;
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
    if (renderer && typeof active === 'boolean') {
      renderer.visible = active;
      renderer.last = performance.now();
      if (!active && renderer.recordingLoop) renderer.recordingAbort?.(new Error('录制期间页面被切到后台，请保持此页可见后重试'));
    }
    height();
  };
  const initial = new URLSearchParams(location.search).get('lang');
  if (initial) setContext({language:initial});
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'fun-dice-context') setContext(event.data);
  });
  new ResizeObserver(height).observe(main);
  window.addEventListener('resize', height);
  window.parent.postMessage({type:'fun-dice-ready'}, location.origin);
  height();
}
