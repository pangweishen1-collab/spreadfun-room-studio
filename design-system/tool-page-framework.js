(() => {
  const diagram = document.getElementById('framework-diagram');
  document.querySelectorAll('[data-framework-view]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-framework-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      diagram.classList.toggle('is-mobile', button.dataset.frameworkView === 'mobile');
      document.getElementById('diagram-description').textContent = button.dataset.frameworkView === 'mobile' ? '手机顺序：标题 → 上传与预览 → 参数与动作 → 输出 → 页脚。示意图不是实际像素稿。' : '桌面顺序：全站外壳 → 标题 → 左预览与参数 / 右输出 → 页脚。示意图不是实际像素稿。';
    });
  });
  document.getElementById('copy-framework-prompt').addEventListener('click', async () => {
    const source = document.getElementById('framework-prompt');
    const status = document.getElementById('copy-framework-status');
    try {
      await navigator.clipboard.writeText(source.value);
      status.textContent = '搭建要求已复制。';
    } catch {
      source.focus();
      source.select();
      status.textContent = '已选中全文，请手动复制。';
    }
  });
})();
