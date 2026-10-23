/* Native, offline starter. Replace simulateGeneration() with the tool's real business function. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = {
    zh: {
      pageTitle: '基础工具页框架 · Fun Toolkit', home: 'Fun Toolkit 首页', skip: '跳到工具区', toolNav: '工具导航', navRoom: '房间背景', navAvatar: '头像框', language: '界面语言', contactLink: '前往网站联系作者', contact: '联系作者',
      title: '基础工具页', help: '使用说明', example: '框架示例', demoControl: '框架演示控制', demoState: '演示状态', demoHint: '切换状态检查布局；此示例不上传、不计数、不生成文件。',
      stateEmpty: '未选择', stateReady: '已载入', stateProcessing: '处理中', stateSuccess: '成功', stateError: '失败', preview: '预览', uploadTitle: '点击上传或拖入图片', uploadHint: 'PNG、JPG、WebP，仅在本地预览。', upload: '上传图片',
      sourceAlt: '已选择的本地图片预览', placeholderAria: '示例预览内容', placeholderTitle: '预览内容插槽', placeholderHint: '替换为图片、Canvas 或播放器', processingTitle: '模拟处理中', processingHint: '演示结束后显示示例结果', cancel: '取消演示',
      replace: '替换文件', privacy: '本地预览，不会上传你的文件。', output: '输出文件', filename: '文件名称', filenameHint: '表单插槽示例，可替换为尺寸、质量等参数。', noResult: '暂无输出', noResultHint: '载入素材并点击模拟生成',
      downloadDemo: '示例结果，不提供真实文件', generate: '模拟生成', chooseFirst: '先上传图片，或切换到“已载入”状态。', footerDemo: '基础工具页框架 · 离线示例', guidelines: '设计规范', helpTitle: '如何使用这个框架', close: '关闭',
      helpBody: '先切换五种演示状态，检查预览、表单、按钮和结果反馈。也可以上传一张本地图片查看真实预览。', helpNote: '这是搭建新工具的起点，不是第四个线上工具。将模拟任务替换为实际业务函数，再接入校验、生成与真实下载。', helpEscape: '按 Esc 或点击关闭按钮返回。',
      sourceDemoName: 'demo-source.webp', sourceDemoMeta: '框架占位素材', errorDemo: '这是失败状态示例：素材保持不变，可点击“重试演示”。', invalidType: '请选择 PNG、JPG 或 WebP 图片，再试一次。', imageError: '图片无法读取，请换一张可正常打开的 PNG、JPG 或 WebP。', reading: '读取本地预览', readingHint: '正在检查图片能否正常显示', readingCancel: '取消读取', running: '正在模拟…', retry: '重试演示', generateAgain: '重新演示', readyHint: '仅演示状态变化，约 1 秒后显示示例结果。', processingActionHint: '正在演示处理中状态，可在预览区取消。', readingActionHint: '图片仅在此浏览器中读取。', successTitle: '示例结果已就绪', successHint: '结果插槽；接入真实业务后再提供文件下载。', successActionHint: '当前结果是占位演示，不是已生成的文件。', errorTitle: '未完成', errorHint: '保留当前素材和参数，便于再次尝试。', errorActionHint: '修正问题后重试；这里不会产生真实文件。', pendingTitle: '处理中', pendingHint: '结果就绪后会在此处展示。', cancelled: '已取消，素材和参数已保留。', statusPrefix: '当前状态：', sourceLocal: '本地预览', emptyName: '填写文件名称后再演示。', savedName: '参数已更改，可重新演示。'
    },
    en: {
      pageTitle: 'Tool Page Starter · Fun Toolkit', home: 'Fun Toolkit home', skip: 'Skip to tool', toolNav: 'Tools', navRoom: 'Room BG', navAvatar: 'Avatar', language: 'Interface language', contactLink: 'Open the website to contact the author', contact: 'Contact',
      title: 'Tool page starter', help: 'How to use', example: 'FRAMEWORK DEMO', demoControl: 'Framework demo controls', demoState: 'Demo state', demoHint: 'Explore the layout. No uploads, analytics or file generation.',
      stateEmpty: 'Empty', stateReady: 'Loaded', stateProcessing: 'Processing', stateSuccess: 'Success', stateError: 'Failed', preview: 'Preview', uploadTitle: 'Choose or drop an image', uploadHint: 'PNG, JPG or WebP. Previewed locally.', upload: 'Choose image',
      sourceAlt: 'Preview of the selected local image', placeholderAria: 'Example preview slot', placeholderTitle: 'Preview content slot', placeholderHint: 'Add an image, Canvas or player', processingTitle: 'Simulating a task', processingHint: 'A placeholder result appears when finished', cancel: 'Cancel demo',
      replace: 'Replace file', privacy: 'Local preview. Your file is never uploaded.', output: 'Output files', filename: 'File name', filenameHint: 'A form slot. Replace with dimensions, quality or other settings.', noResult: 'No output yet', noResultHint: 'Load a source and run the demo',
      downloadDemo: 'Demo result — no real file', generate: 'Run demo', chooseFirst: 'Choose an image or select the Loaded state first.', footerDemo: 'Tool page starter · Offline demo', guidelines: 'Design guidelines', helpTitle: 'Using this starter', close: 'Close',
      helpBody: 'Switch between the five demo states to inspect the preview, form, actions and results. You can also choose a local image for a real preview.', helpNote: 'This is a foundation for a new tool, not a fourth production tool. Replace the simulation with a real task, then add validation, generation and file downloads.', helpEscape: 'Press Esc or use Close to return.',
      sourceDemoName: 'demo-source.webp', sourceDemoMeta: 'Framework placeholder source', errorDemo: 'Example failure: the source is preserved. Use Retry demo to try again.', invalidType: 'Choose a PNG, JPG or WebP image and try again.', imageError: 'The image could not be read. Choose a valid PNG, JPG or WebP image.', reading: 'Reading local preview', readingHint: 'Checking that the image can be displayed', readingCancel: 'Cancel loading', running: 'Running demo…', retry: 'Retry demo', generateAgain: 'Run again', readyHint: 'A placeholder result appears in about 1 second.', processingActionHint: 'A processing state is being demonstrated. Cancel from the preview.', readingActionHint: 'The image is read only in this browser.', successTitle: 'Demo result is ready', successHint: 'A result slot. Enable downloads only when real files exist.', successActionHint: 'This is a placeholder, not a generated file.', errorTitle: 'Not completed', errorHint: 'The source and settings remain available for retry.', errorActionHint: 'Fix the issue and retry. This demo never produces a file.', pendingTitle: 'Processing', pendingHint: 'Completed results will appear here.', cancelled: 'Cancelled. The source and settings are preserved.', statusPrefix: 'Current state: ', sourceLocal: 'Local preview', emptyName: 'Enter a file name to run the demo.', savedName: 'Settings changed. You can run the demo again.'
    }
  };
  const stateKeys = { empty: 'stateEmpty', ready: 'stateReady', processing: 'stateProcessing', success: 'stateSuccess', error: 'stateError' };
  let language = 'zh';
  let state = 'empty';
  let operation = 'demo';
  let noticeKey = '';
  let source = null;
  let timer = null;
  let loadVersion = 0;
  let dialogTrigger = null;
  const t = key => copy[language][key] || key;

  function announce(message) { $('live-status').textContent = message; }
  function clearPending() { window.clearTimeout(timer); timer = null; loadVersion += 1; }
  function clearSource() {
    if (source) URL.revokeObjectURL(source.url);
    source = null;
    $('source-preview').removeAttribute('src');
    $('source-file').value = '';
  }

  function render(previousState = state) {
    const busy = state === 'processing';
    const showSource = state !== 'empty';
    $('filename-hint').textContent = t($('output-name').getAttribute('aria-invalid') === 'true' ? 'emptyName' : 'filenameHint');
    $('main').dataset.state = state;
    // Keep the live status outside a busy region so assistive technology hears updates immediately.
    $('drop-zone').setAttribute('aria-busy', String(busy));
    $('output-result').setAttribute('aria-busy', String(busy));
    $('demo-state').value = state;
    $('state-badge').textContent = t(stateKeys[state]);
    $('state-badge').dataset.state = state;
    $('empty-content').hidden = showSource;
    $('loaded-content').hidden = !showSource;
    $('source-bar').hidden = !showSource;
    $('source-preview').hidden = !source;
    $('preview-placeholder').hidden = Boolean(source);
    $('placeholder-art').src = `assets/feedback/${state === 'error' ? 'empty-error' : 'placeholder-image'}.svg`;
    $('preview-placeholder').querySelector('strong').textContent = t(state === 'error' ? 'errorTitle' : 'placeholderTitle');
    $('preview-placeholder').querySelector('span').textContent = t(state === 'error' ? 'errorHint' : 'placeholderHint');
    $('source-name').textContent = source ? source.name : t('sourceDemoName');
    $('source-meta').textContent = source ? `${source.width} × ${source.height} px · ${(source.size / 1024).toFixed(1)} KB · ${t('sourceLocal')}` : t('sourceDemoMeta');
    if ((previousState === 'processing') !== busy && window.FunToolkitFeedback) {
      window.FunToolkitFeedback[busy ? 'enter' : 'exit']($('processing-overlay'));
    } else if (!window.FunToolkitFeedback) $('processing-overlay').hidden = !busy;
    $('upload-button').disabled = busy;
    $('replace-button').disabled = busy;
    $('output-name').disabled = busy;
    $('generate-button').disabled = state === 'empty' || busy;
    $('generate-button').setAttribute('aria-busy', String(busy));
    $('generate-button').textContent = t(busy ? 'running' : state === 'error' ? 'retry' : state === 'success' ? 'generateAgain' : 'generate');
    $('processing-overlay').querySelector('strong').textContent = t(operation === 'preview' ? 'reading' : 'processingTitle');
    $('processing-description').textContent = t(operation === 'preview' ? 'readingHint' : 'processingHint');
    $('cancel-button').textContent = t(operation === 'preview' ? 'readingCancel' : 'cancel');
    $('error-notice').hidden = state !== 'error';
    $('error-notice').textContent = t(noticeKey || 'errorDemo');
    const resultCopy = state === 'success' ? ['successTitle','successHint'] : state === 'error' ? ['errorTitle','errorHint'] : busy ? ['pendingTitle','pendingHint'] : ['noResult','noResultHint'];
    $('result-title').textContent = t(resultCopy[0]);
    $('result-description').textContent = t(resultCopy[1]);
    $('result-skeleton').hidden = !busy;
    $('result-art').hidden = busy;
    $('result-art').src = `assets/feedback/${state === 'error' ? 'empty-error' : state === 'success' ? 'placeholder-image' : 'empty-output'}.svg`;
    const actionKey = state === 'empty' ? 'chooseFirst' : busy ? (operation === 'preview' ? 'readingActionHint' : 'processingActionHint') : state === 'success' ? 'successActionHint' : state === 'error' ? 'errorActionHint' : 'readyHint';
    $('action-hint').textContent = t(actionKey);
    window.FunToolkitFeedback?.refresh();
  }

  // Stable integration entry: render every branch from one state, not scattered class changes.
  function setToolState(nextState, options = {}) {
    if (!Object.hasOwn(stateKeys, nextState)) throw new TypeError(`Unknown tool state: ${nextState}`);
    clearPending();
    operation = options.operation || 'demo';
    noticeKey = options.noticeKey || '';
    if (nextState === 'empty') clearSource();
    const previousState = state;
    state = nextState;
    render(previousState);
    if (previousState !== state) {
      window.FunToolkitFeedback?.replay($(state === 'empty' ? 'empty-content' : 'loaded-content'));
      window.FunToolkitFeedback?.replay($('output-result'));
    }
    announce(t('statusPrefix') + t(stateKeys[state]));
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === 'en' ? 'en' : 'zh';
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = t('pageTitle');
    document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-alt]').forEach(element => { element.alt = t(element.dataset.i18nAlt); });
    document.querySelectorAll('[data-language]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.language === language)); });
    render();
    announce(t('statusPrefix') + t(stateKeys[state]));
  }

  function simulateGeneration() {
    if (state === 'empty' || state === 'processing') return;
    if (!$('output-name').value.trim()) {
      $('output-name').setAttribute('aria-invalid','true');
      $('filename-hint').textContent = t('emptyName');
      $('output-name').focus();
      return;
    }
    setToolState('processing');
    timer = window.setTimeout(() => { setToolState('success'); }, 1100);
  }

  async function previewFile(file) {
    if (!file || state === 'processing') return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      setToolState('error', { noticeKey: 'invalidType' });
      return;
    }
    setToolState('processing', { operation: 'preview' });
    const version = loadVersion;
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      if (version !== loadVersion) { URL.revokeObjectURL(url); return; }
      if (source) URL.revokeObjectURL(source.url);
      source = { url, name:file.name, size:file.size, width:image.naturalWidth, height:image.naturalHeight };
      $('source-preview').src = url;
      setToolState('ready');
    } catch {
      URL.revokeObjectURL(url);
      if (version === loadVersion) setToolState('error', { noticeKey:'imageError' });
    }
  }

  $('demo-state').addEventListener('change', event => { setToolState(event.target.value); });
  document.querySelectorAll('[data-language]').forEach(button => { button.addEventListener('click', () => { setLanguage(button.dataset.language); }); });
  [$('upload-button'),$('replace-button')].forEach(button => { button.addEventListener('click', () => { $('source-file').click(); }); });
  $('source-file').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    void previewFile(file);
  });
  $('generate-button').addEventListener('click', simulateGeneration);
  $('cancel-button').addEventListener('click', () => { setToolState('ready'); announce(t('cancelled')); $('generate-button').focus(); });
  $('output-name').addEventListener('input', () => {
    $('output-name').removeAttribute('aria-invalid');
    $('filename-hint').textContent = t('filenameHint');
    if (state === 'success') { setToolState('ready'); announce(t('savedName')); }
  });

  let dragDepth = 0;
  $('drop-zone').addEventListener('dragenter', event => { event.preventDefault(); dragDepth += 1; if (state !== 'processing') $('drop-zone').classList.add('is-dragging'); });
  $('drop-zone').addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = state === 'processing' ? 'none' : 'copy'; });
  $('drop-zone').addEventListener('dragleave', () => { dragDepth = Math.max(0,dragDepth - 1); if (!dragDepth) $('drop-zone').classList.remove('is-dragging'); });
  $('drop-zone').addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; $('drop-zone').classList.remove('is-dragging');
    void previewFile(event.dataTransfer?.files[0]);
  });
  // Prevent accidental browser navigation when a file is dropped outside the preview.
  document.addEventListener('dragover', event => { event.preventDefault(); });
  document.addEventListener('drop', event => { event.preventDefault(); });

  $('help-trigger').addEventListener('click', event => {
    dialogTrigger = event.currentTarget;
    $('help-dialog').showModal();
  });
  $('close-help').addEventListener('click', () => { $('help-dialog').close(); });
  $('help-dialog').addEventListener('close', () => { dialogTrigger?.focus(); });
  window.addEventListener('pagehide', event => { if (!event.persisted) { clearPending(); clearSource(); } });

  // No fetch(), storage, analytics, canvas encoding or real downloads in this example.
  window.ToolPageDemo = Object.freeze({ setState:setToolState, setLanguage, simulateGeneration, getState:() => state });
  setLanguage('zh');
})();
