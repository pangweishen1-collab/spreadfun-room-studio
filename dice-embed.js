/* Same-origin bridge: navigation owns the active tool; dice owns its local files. */
(() => {
  const frame = document.getElementById('dicePreviewFrame');
  let active = false, lang = 'en', loaded = false;
  const sync = () => {
    if (loaded) frame.contentWindow.postMessage({type:'fun-dice-context', active, language:lang}, location.origin);
  };
  window.DicePreview = {
    setActive(value) {
      active = Boolean(value);
      if (active && !loaded) {
        loaded = true;
        frame.src = '/dice/index.html?embedded=1&lang=' + lang;
      }
      sync();
    },
    setLanguage(value) {
      lang = value === 'zh' ? 'zh' : 'en';
      frame.title = lang === 'zh' ? '骰子预览' : 'Dice preview';
      sync();
    },
  };
  window.UploadPaste?.register({
    zone:frame,
    isActive:() => active && loaded,
    onFiles(files) {
      if (!active || !loaded) return;
      const snapshot = Array.from(files || []);
      if (!snapshot.length || !snapshot.every(file => file instanceof File)) return;
      frame.contentWindow.postMessage({type:'fun-dice-files', files:snapshot}, location.origin);
    },
  });
  frame.addEventListener('load', sync);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'fun-dice-ready') sync();
    if (event.data?.type === 'fun-dice-download' && typeof event.data.url === 'string'
      && event.data.url.startsWith('blob:' + location.origin + '/')
      && typeof event.data.fileName === 'string' && event.data.fileName.length <= 100
      && /\.(mp4|zip)$/.test(event.data.fileName)) {
      const link = document.createElement('a');
      link.href = event.data.url;
      link.download = event.data.fileName.replace(/[\\/:*?"<>|]/g, '_');
      document.body.append(link); link.click(); link.remove();
    }
    if (event.data?.type === 'fun-dice-height' && Number.isFinite(event.data.height)) {
      frame.style.height = Math.max(480, Math.min(6000, Math.ceil(event.data.height))) + 'px';
    }
  });
})();
