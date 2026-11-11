(() => {
  'use strict';

  let parentProgress;
  try {
    if (window.parent !== window) parentProgress = window.parent.UploadProgress;
  } catch {
    // A standalone or cross-origin embed presents its own progress.
  }
  if (parentProgress) {
    const uploads = new Set();
    window.UploadProgress = {
      begin(total) {
        const upload = parentProgress.begin(total);
        uploads.add(upload);
        return {
          advance: upload.advance,
          setProgress: upload.setProgress,
          finish() {
            uploads.delete(upload);
            upload.finish();
          }
        };
      }
    };
    window.addEventListener('pagehide', () => {
      uploads.forEach(upload => upload.finish());
      uploads.clear();
    });
    return;
  }

  const visible = new Set();
  let panel, title, value, bar;

  function render() {
    const upload = visible.values().next().value;
    if (!upload) {
      if (panel) {
        if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover();
        panel.remove();
        title.textContent = '';
      }
      return;
    }
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = 'upload-progress';
      title = document.createElement('span');
      title.id = 'upload-progress-label';
      title.setAttribute('role', 'status');
      value = document.createElement('span');
      value.className = 'upload-progress-value';
      value.setAttribute('aria-hidden', 'true');
      bar = document.createElement('progress');
      bar.setAttribute('aria-labelledby', title.id);
      bar.max = 1;
      panel.append(title, value, bar);
    }
    if (!panel.isConnected) {
      const dialogs = document.querySelectorAll('dialog[open]');
      (dialogs[dialogs.length - 1] ?? document.body).append(panel);
      if (typeof panel.showPopover === 'function') {
        panel.setAttribute('popover', 'manual');
        panel.showPopover();
      }
    }
    const message = document.documentElement.lang.startsWith('zh') ? '正在读取素材…' : 'Importing files…';
    if (title.textContent !== message) title.textContent = message;
    if (upload.fraction === null) {
      bar.removeAttribute('value');
      value.textContent = '';
    } else {
      bar.value = upload.fraction;
      value.textContent = Math.floor(upload.fraction * 100) + '%';
    }
  }

  window.UploadProgress = {
    begin(total) {
      const upload = {fraction: null};
      let completed = 0;
      let finished = false;
      const timer = setTimeout(() => {
        visible.add(upload);
        render();
      }, 1000);
      function setProgress(fraction) {
        if (finished || !Number.isFinite(fraction)) return;
        upload.fraction = Math.max(0, Math.min(1, fraction));
        if (visible.has(upload)) render();
      }
      return {
        advance() {
          if (Number.isInteger(total) && total > 1) setProgress(++completed / total);
        },
        setProgress,
        finish() {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (visible.delete(upload)) render();
        }
      };
    }
  };
})();
