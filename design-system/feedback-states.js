/* Catalogue controls only; reusable lifecycle lives in feedback-motion.js. */
(() => {
  const $ = id => document.getElementById(id);
  let paused = false;
  $('fb-pause').addEventListener('click', () => {
    paused = !paused;
    window.FunToolkitFeedback?.setPaused(paused);
    $('fb-pause').setAttribute('aria-pressed', String(paused));
    $('fb-pause').textContent = paused ? '继续装饰动画' : '暂停装饰动画';
    $('fb-motion-note').textContent = paused ? '已暂停加载示例与装饰视差，主动显示 / 隐藏仍可操作。' : '持续动效离屏或后台暂停；手机关闭视差，系统减少动态效果时使用静态反馈。';
  });
  let imageVersion = 0;
  let pendingImage = null;
  function setImageState(state) {
    const media = $('fb-media');
    media.dataset.mediaState = state;
    media.setAttribute('aria-busy', String(state === 'loading'));
    media.querySelector('.fb-placeholder-img').hidden = state !== 'placeholder';
    media.querySelector('.fb-media-loading').hidden = state !== 'loading';
    media.querySelector('.fb-media-error').hidden = state !== 'error';
    $('fb-sample-image').hidden = state !== 'loaded';
    $('fb-image-load').disabled = state === 'loading';
    $('fb-image-status').textContent = ({placeholder:'尚未选择图片；这是默认占位。',loading:'正在读取本站示例图…',loaded:'示例图片已载入；容器比例与高度保持不变。',error:'这是可手动检查的失败态示例；可恢复占位或重新载入。'})[state];
    window.FunToolkitFeedback?.refresh();
  }
  function clearPendingImage() {
    imageVersion++;
    if (pendingImage) { pendingImage.onload = null; pendingImage.onerror = null; pendingImage = null; }
  }
  $('fb-image-load').addEventListener('click', () => {
    clearPendingImage();
    const version = imageVersion;
    setImageState('loading');
    const image = new Image();
    pendingImage = image;
    image.onload = () => {
      if (version !== imageVersion) return;
      $('fb-sample-image').src = image.src;
      pendingImage = null;
      setImageState('loaded');
    };
    image.onerror = () => {
      if (version !== imageVersion) return;
      pendingImage = null;
      setImageState('error');
    };
    image.src = '../assets/home-studio-illustration-480.webp';
  });
  $('fb-image-reset').addEventListener('click', () => { clearPendingImage(); setImageState('placeholder'); });
  $('fb-image-error').addEventListener('click', () => { clearPendingImage(); setImageState('error'); });
  $('fb-copy-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('fb-copy-prompt').value);
      $('fb-copy-status').textContent = '搭建要求已复制。';
    } catch {
      $('fb-copy-prompt').focus();
      $('fb-copy-prompt').select();
      $('fb-copy-status').textContent = '已选中内容，可手动复制。';
    }
  });
  window.addEventListener('pagehide', clearPendingImage);
})();
