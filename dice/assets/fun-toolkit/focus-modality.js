/* Fun Toolkit: pointer feedback stays subtle; Tab restores the keyboard outline. */
(() => {
  const root = document.documentElement;
  root.dataset.inputModality = 'keyboard';
  document.addEventListener('pointerdown', () => { root.dataset.inputModality = 'pointer'; }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') root.dataset.inputModality = 'keyboard';
  }, true);
})();
