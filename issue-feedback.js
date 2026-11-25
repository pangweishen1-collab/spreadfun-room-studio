(() => {
  const byId = id => document.getElementById(id);
  const dialog = byId('issueDialog');
  const form = byId('issueForm');
  const description = byId('issueDescription');
  const file = byId('issueScreenshot');
  const choose = byId('issueChoose');
  const attachment = byId('issueAttachment');
  const preview = byId('issuePreview');
  const diagnostics = byId('issueDiagnostics');
  const status = byId('issueStatus');
  const receiptPanel = byId('issueReceipt');
  const submit = byId('issueSubmit');
  const maxScreenshot = 512 * 1024;
  const copy = {
    zh: {
      title:'问题反馈', close:'关闭', description:'问题描述', placeholder:'请粘贴报错文字，或说明哪个步骤遇到问题。',
      screenshot:'报错截图（选填）', choose:'选择截图', replace:'更换截图', hint:'支持 PNG、JPG、WebP，也可直接粘贴截图。', remove:'移除截图',
      diagnostics:'附上浏览器、工具版本和报错信息', privacy:'提交的内容仅供作者排查。请遮盖截图中的账号或敏感信息。',
      submit:'提交反馈', sending:'提交中…', preparing:'正在处理截图…', empty:'请填写问题描述或上传一张截图。',
      invalidImage:'无法读取这张截图。请选择 15 MB 以内的 PNG、JPG 或 WebP 图片。',
      imageTooLarge:'截图压缩后仍过大。请裁到报错区域后重试。',
      failed:'反馈暂未提交，描述和截图已保留。请重试。',
      rateLimit:'反馈提交较频繁，请稍后重试。描述和截图已保留。',
      received:'反馈已收到，排查时请提供这个编号。', copy:'复制编号', copied:'已复制'
    },
    en: {
      title:'Report an issue', close:'Close', description:'What happened?', placeholder:'Paste the error message or describe the step that failed.',
      screenshot:'Error screenshot (optional)', choose:'Choose screenshot', replace:'Replace screenshot', hint:'Choose a PNG, JPG or WebP file, or paste a screenshot.', remove:'Remove screenshot',
      diagnostics:'Include browser, toolkit version and error details', privacy:'Only the author can access submissions. Hide account details or other sensitive information in screenshots.',
      submit:'Send report', sending:'Sending…', preparing:'Preparing screenshot…', empty:'Describe the issue or attach a screenshot.',
      invalidImage:'Could not read the screenshot. Use a PNG, JPG or WebP file under 15 MB.',
      imageTooLarge:'The screenshot is still too large. Crop to the error area and try again.',
      failed:'The report could not be sent. Your description and screenshot are still here.',
      rateLimit:'Too many reports. Try again later. Your description and screenshot are still here.',
      received:'Report received. Use this number for follow-up.', copy:'Copy number', copied:'Copied'
    }
  };
  const t = key => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'][key];
  let screenshot = null, preparing = false, sending = false, message = '', receipt = '', copied = false;
  let draftContext = '', lastBody, lastId, vapError;

  function syncLanguage() {
    document.querySelectorAll('[data-issue-copy]').forEach(node => {
      node.textContent = t(node.dataset.issueCopy);
    });
    description.placeholder = t('placeholder');
    byId('issueButton').setAttribute('aria-label', t('title'));
    byId('issueButton').title = t('title');
    status.textContent = message ? t(message) : '';
    status.hidden = !message;
    attachment.hidden = !screenshot;
    receiptPanel.hidden = !receipt;
    byId('issueReceiptId').textContent = receipt;
    byId('issueCopy').textContent = t(copied ? 'copied' : 'copy');
    choose.disabled = preparing || sending;
    choose.textContent = t(screenshot ? 'replace' : 'choose');
    byId('issueRemove').disabled = preparing || sending;
    diagnostics.disabled = sending;
    description.readOnly = sending;
    submit.disabled = preparing || sending;
    submit.textContent = t(sending ? 'sending' : 'submit');
    form.setAttribute('aria-busy', String(sending));
  }

  function recordVapError(error, details) {
    vapError = null;
    if (!error) return;
    const reasons = [];
    for (let cause = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
      const label = [cause.name, cause.code].filter(value =>
        typeof value === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(value)).join('/');
      if (label && !reasons.includes(label)) reasons.push(label);
    }
    vapError = { ...details, reasons };
  }

  function currentContext() {
    const active = document.querySelector('main[data-tool]:not(.hidden)')?.dataset.tool || 'home';
    const version = document.querySelector('[data-app-version]')?.textContent.trim();
    const lines = [
      `Tool: ${active} · ${version || 'unknown'}`,
      `Browser: ${navigator.userAgent.slice(0, 320)}`
    ];
    if (active === 'vap') {
      lines.push(`VAP browser features: isolated=${crossOriginIsolated}, VideoFrame=${typeof VideoFrame !== 'undefined'}, OPFS=${typeof navigator.storage?.getDirectory === 'function'}`);
      if (vapError) {
        const {phase, mode, codec, crf, reasons} = vapError;
        lines.push(`VAP last conversion: ${mode}, ${phase}, ${codec}, CRF ${crf} · ${reasons.join(' / ')}`);
      }
      const notice = byId('vapNotice');
      if (notice && !notice.hidden && notice.dataset.tone === 'error') lines.push(notice.textContent.slice(0, 300));
    }
    return lines.join('\n');
  }

  function invalidateReceipt() {
    receipt = '';
    copied = false;
  }

  async function prepareScreenshot(input) {
    if (preparing || sending || !input) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(input.type) &&
        (input.type || !/\.(png|jpe?g|webp)$/i.test(input.name))) {
      message = 'invalidImage';
      syncLanguage();
      return;
    }
    if (!input.size || input.size > 15 * 1024 * 1024) {
      message = 'invalidImage';
      syncLanguage();
      return;
    }
    invalidateReceipt();
    preparing = true;
    message = 'preparing';
    syncLanguage();
    let image;
    try {
      image = await createImageBitmap(input);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      let scale = Math.min(1, 2200 / Math.max(image.width, image.height));
      for (let attempt = 0; attempt < 3; attempt++) {
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL('image/webp', .92);
        if (!encoded.startsWith('data:image/webp;base64,')) throw new Error('webp_unavailable');
        const base64 = encoded.slice(23);
        if (base64.length / 4 * 3 <= maxScreenshot) {
          screenshot = encoded;
          preview.src = encoded;
          message = '';
          return;
        }
        scale *= .8;
      }
      message = 'imageTooLarge';
    } catch {
      message = 'invalidImage';
    } finally {
      image?.close();
      preparing = false;
      syncLanguage();
    }
  }

  byId('issueButton').addEventListener('click', () => {
    draftContext = currentContext();
    dialog.showModal();
    description.focus();
  });
  byId('issueClose').addEventListener('click', () => dialog.close());
  choose.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const selected = file.files[0];
    file.value = '';
    void prepareScreenshot(selected);
  });
  dialog.addEventListener('paste', event => {
    const image = [...event.clipboardData.files].find(item => item.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    void prepareScreenshot(image);
  });
  byId('issueRemove').addEventListener('click', () => {
    screenshot = null;
    preview.removeAttribute('src');
    message = '';
    syncLanguage();
    choose.focus();
  });
  description.addEventListener('input', () => {
    if (receipt || message === 'empty') {
      invalidateReceipt();
      message = '';
      syncLanguage();
    }
  });
  byId('issueCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(receipt);
      copied = true;
      syncLanguage();
    } catch {
      const range = document.createRange();
      range.selectNodeContents(byId('issueReceiptId'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (preparing || sending) return;
    const payload = {
      description: description.value.trim(),
      screenshot,
      context: diagnostics.checked ? draftContext : ''
    };
    if (!payload.description && !screenshot) {
      message = 'empty';
      syncLanguage();
      return;
    }
    const body = JSON.stringify(payload);
    if (body !== lastBody) {
      lastBody = body;
      lastId = crypto.randomUUID();
    }
    sending = true;
    message = '';
    invalidateReceipt();
    syncLanguage();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch('/api/issue-reports', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ ...payload, id:lastId }), signal:controller.signal
      });
      if (!response.ok) {
        message = response.status === 429 ? 'rateLimit' : 'failed';
        return;
      }
      const result = await response.json();
      if (result.id !== lastId) throw new Error('invalid_issue_receipt');
      receipt = result.id;
      form.reset();
      screenshot = null;
      preview.removeAttribute('src');
      lastBody = lastId = null;
    } catch {
      message = 'failed';
    } finally {
      clearTimeout(timer);
      sending = false;
      syncLanguage();
      if (receipt && dialog.open) receiptPanel.focus();
    }
  });
  window.IssueFeedback = { syncLanguage, recordVapError };
  syncLanguage();
})();
