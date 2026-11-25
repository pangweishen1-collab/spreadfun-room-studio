(() => {
  const byId = id => document.getElementById(id);
  const dialog = byId('issueDialog');
  const form = byId('issueForm');
  const description = byId('issueDescription');
  const contextText = byId('issueContextText');
  const status = byId('issueStatus');
  const receiptPanel = byId('issueReceipt');
  const submit = byId('issueSubmit');
  const copy = {
    zh: {
      title:'问题反馈', close:'关闭', description:'已自动识别的问题', details:'诊断详情',
      noCurrentError:'当前页面未显示明确报错。已记录当前工具和运行状态。',
      privacy:'点击提交后，问题记录和诊断详情将发给作者。',
      submit:'提交反馈', sending:'提交中…',
      failed:'暂未收到提交回执，已保留问题记录。请重试。',
      rateLimit:'反馈提交较频繁，已保留问题记录。请稍后重试。',
      received:'反馈已收到，排查时请提供这个编号。', copy:'复制编号', copied:'已复制'
    },
    en: {
      title:'Report an issue', close:'Close', description:'Detected issue', details:'Diagnostic details',
      noCurrentError:'The page shows no explicit error. The current tool and its status were recorded.',
      privacy:'The report and diagnostic details are shared with the author when you submit.',
      submit:'Send report', sending:'Sending…',
      failed:'No receipt was received. Your report was kept so you can retry.',
      rateLimit:'Too many reports. Your report was kept. Try again later.',
      received:'Report received. Use this number for follow-up.', copy:'Copy number', copied:'Copied'
    }
  };
  const t = key => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'][key];
  let report, lastId, vapError, sending = false, message = '', receipt = '', copied = false;
  const errorNotices = {
    room:'#uploadNotice, #downloadNotice p[data-issue-error]', avatar:'#avatarCustomNotice[data-state="error"], #svgaNotice',
    banner:'#bannerNotice', 'gift-preview':'#giftPreviewNotice', resources:'#resourceNotice',
    vap:'#vapNotice[data-tone="error"]', token:'#tokenStatus[data-tone="error"]'
  };

  function syncLanguage() {
    document.querySelectorAll('[data-issue-copy]').forEach(node => {
      node.textContent = t(node.dataset.issueCopy);
    });
    description.value = report?.description || '';
    contextText.textContent = report?.context || '';
    byId('issueButton').setAttribute('aria-label', t('title'));
    byId('issueButton').title = t('title');
    status.textContent = message ? t(message) : '';
    status.hidden = !message;
    receiptPanel.hidden = !receipt;
    byId('issueReceiptId').textContent = receipt;
    byId('issueCopy').textContent = t(copied ? 'copied' : 'copy');
    submit.disabled = !report || sending || !!receipt;
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
    vapError = { ...details, reasons, at:new Date().toISOString() };
  }

  function collectReport() {
    const tool = document.querySelector('main[data-tool]:not(.hidden):not([hidden])');
    const active = tool?.dataset.tool || 'home';
    const version = document.querySelector('[data-app-version]')?.textContent.trim();
    const selector = errorNotices[active];
    const notice = selector && [...tool.querySelectorAll(selector)].find(node =>
      !node.closest('.hidden,[hidden]') && node.getClientRects().length && node.textContent.trim());
    const error = notice ? (notice.dataset.issueMessage || notice.textContent).trim().slice(0, 400) : '';
    const phase = error ? 'error' : tool?.dataset.state || tool?.dataset.feedbackPhase ||
      (tool?.getAttribute('aria-busy') === 'true' ? 'processing' : 'unknown');
    const lines = [
      `Tool: ${active} · ${version || 'unknown'}`,
      `Status: ${phase}`,
      `Browser: ${navigator.userAgent.slice(0, 320)}`
    ];
    if (active === 'vap') {
      lines.push(`VAP browser features: isolated=${crossOriginIsolated}, VideoFrame=${typeof VideoFrame !== 'undefined'}, OPFS=${typeof navigator.storage?.getDirectory === 'function'}`);
      if (vapError && notice && notice.dataset.issueKey === vapError.noticeKey) {
        const {phase, mode, codec, crf, reasons, at} = vapError;
        lines.push(`VAP last conversion: ${mode}, ${phase}, ${codec}, CRF ${crf} · ${reasons.join(' / ')}`, `Time: ${at}`);
      }
    }
    return { description:error || t('noCurrentError'), context:lines.join('\n') };
  }

  byId('issueButton').addEventListener('click', () => {
    if (!sending) {
      const next = collectReport();
      if (next.description !== report?.description || next.context !== report?.context) {
        lastId = null;
        message = receipt = '';
        copied = false;
      }
      report = next;
    }
    syncLanguage();
    dialog.showModal();
    (receipt ? receiptPanel : description).focus();
  });
  byId('issueClose').addEventListener('click', () => dialog.close());
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
    if (!report || sending || receipt) return;
    lastId ||= crypto.randomUUID();
    const payload = { ...report, screenshot:null, id:lastId };
    sending = true;
    message = '';
    syncLanguage();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch('/api/issue-reports', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload), signal:controller.signal
      });
      if (!response.ok) {
        message = response.status === 429 ? 'rateLimit' : 'failed';
        return;
      }
      const result = await response.json();
      if (result.id !== lastId) throw new Error('invalid_issue_receipt');
      receipt = result.id;
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
