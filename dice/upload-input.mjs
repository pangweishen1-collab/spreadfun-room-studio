// Both upload surfaces share the existing file validation and clipboard parser.
export function bindDiceUploads({primaryZone, replacementZone, input, primaryButton,
  replacementButton, isBusy, hasPreview, onFiles, isActive = () => true,
  folderInput, primaryFolderButton, replacementFolderButton, onEmptyFolder = () => {},
  paste = window.UploadPaste, document = window.document}) {
  const cleanups = [];
  const listen = (node, type, handler) => {
    node.addEventListener(type, handler);
    cleanups.push(() => node.removeEventListener(type, handler));
  };
  const importFiles = value => {
    const files = Array.from(value || []);
    if (isActive() && !isBusy() && files.length) return onFiles(files);
  };
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files')
    || Boolean(event.dataTransfer?.files?.length);
  const clearHover = zone => zone.classList.remove('upload-hover', 'is-dragging');
  for (const [zone, button, active] of [
    [primaryZone, primaryButton, () => isActive() && !hasPreview()],
    [replacementZone, replacementButton, isActive],
  ]) {
    const choose = () => { if (active() && !isBusy()) input.click(); };
    listen(button, 'click', event => { event.stopPropagation(); choose(); });
    listen(zone, 'click', event => {
      if (!event.target.closest('button,input')) choose();
    });
    listen(zone, 'keydown', event => {
      if (event.target === zone && active() && !isBusy() && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); choose();
      }
    });
    listen(zone, 'dragover', event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (active() && !isBusy()) zone.classList.add('upload-hover', 'is-dragging');
      else clearHover(zone);
    });
    listen(zone, 'dragleave', event => { if (!zone.contains(event.relatedTarget)) clearHover(zone); });
    listen(zone, 'drop', event => {
      if (hasFiles(event)) event.preventDefault();
      clearHover(zone);
      if (active()) return importFiles(event.dataTransfer?.files);
    });
    const unregister = paste?.register({zone, isActive:active, isBusy,
      onFiles:files => active() ? importFiles(files) : undefined});
    if (unregister) cleanups.push(unregister);
  }
  listen(input, 'change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    return importFiles(files);
  });
  if (folderInput) {
    for (const [button, active] of [
      [primaryFolderButton, () => isActive() && !hasPreview()],
      [replacementFolderButton, isActive],
    ]) if (button) listen(button, 'click', event => {
      event.stopPropagation();
      if (active() && !isBusy()) folderInput.click();
    });
    listen(folderInput, 'change', () => {
      // Directory pickers include sidecar files; PNGs retain their original names.
      const files = Array.from(folderInput.files || []);
      folderInput.value = '';
      if (!isActive() || isBusy() || !files.length) return;
      const pngs = files.filter(file => /\.png$/i.test(file.name)
        && !(file.webkitRelativePath || file.name).split(/[/\\]/).some(part => part.startsWith('.')));
      return pngs.length ? importFiles(pngs) : onEmptyFolder();
    });
  }
  // Dropping outside a surface must not navigate away from the current work.
  for (const type of ['dragover', 'drop']) listen(document, type, event => {
    if (hasFiles(event)) event.preventDefault();
  });
  return () => {
    cleanups.splice(0).forEach(dispose => dispose());
    [primaryZone, replacementZone].forEach(clearHover);
  };
}
