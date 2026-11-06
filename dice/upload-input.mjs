const isDiceFileName = name => /\.png$|^(?:dice_roll|sound_ui_dice6)\.mp3$/i.test(name.normalize('NFKC').trim());
const skipEntry = name => name.startsWith('.') || name === '__MACOSX';
const directoryPaths = new WeakMap();
export const diceFilePath = file => directoryPaths.get(file) || file.webkitRelativePath || '';

// Both upload surfaces share the existing file validation and clipboard parser.
export function bindDiceUploads({primaryZone, replacementZone, input, primaryButton,
  replacementButton, primaryButtons = [primaryButton], replacementButtons = [replacementButton],
  isBusy, hasPreview, onFiles, isActive = () => true, onTarget,
  onDirectory, onError, folderInput, primaryFolderButton, replacementFolderButton,
  primaryFolderButtons = [primaryFolderButton], replacementFolderButtons = [replacementFolderButton], onEmptyFolder = () => {},
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
  const selectTarget = (event, zone, active) => {
    if (!active() || isBusy()) return false;
    try { return onTarget?.(event, zone) !== false; }
    catch (error) { if (onError) { onError(error); return false; } throw error; }
  };
  for (const [zone, buttons, folderButtons, active] of [
    [primaryZone, primaryButtons, primaryFolderButtons, () => isActive() && !hasPreview()],
    [replacementZone, replacementButtons, replacementFolderButtons, isActive],
  ]) {
    const choose = event => { if (selectTarget(event, zone, active)) input.click(); };
    for (const button of new Set(buttons || [])) if (button)
      listen(button, 'click', event => { event.stopPropagation(); choose(event); });
    listen(zone, 'click', event => {
      if (!event.target.closest('button,input')) choose(event);
    });
    listen(zone, 'keydown', event => {
      const card = event.target.closest('[data-upload-grade]');
      const focusedCard = card === event.target && zone.contains(card) && card.getAttribute('tabindex') === '0'
        && !card.closest('button,input');
      if ((event.target === zone || focusedCard) && active() && !isBusy() && ['Enter', ' '].includes(event.key)) {
        event.preventDefault(); choose(event);
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
      if (!active() || isBusy()) return;
      const transfer=event.dataTransfer;
      if (!hasFiles(event) || !selectTarget(event, zone, active)) return;
      if (Array.from(transfer?.items || []).some(item=>item.webkitGetAsEntry?.()?.isDirectory)) {
        if (onDirectory) return onDirectory(()=>readDropFiles(transfer));
        return readDropFiles(transfer).then(importFiles).catch(error=>onError ? onError(error) : Promise.reject(error));
      }
      return importFiles(transfer?.files);
    });
    const unregister = paste?.register({zone, isActive:active, isBusy,
      onFiles:value => {
        if (!active() || isBusy()) return;
        const files=Array.from(value || []);
        if (files.length && selectTarget(undefined, zone, active)) return importFiles(files);
      }});
    if (unregister) cleanups.push(unregister);
    if (folderInput) for (const button of new Set(folderButtons || [])) if (button)
      listen(button, 'click', event => {
        event.stopPropagation();
        if (selectTarget(event, zone, active)) folderInput.click();
      });
  }
  listen(input, 'change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    return importFiles(files);
  });
  if (folderInput) {
    listen(folderInput, 'change', () => {
      // Directory pickers include sidecar files; PNGs retain their original names.
      const files = Array.from(folderInput.files || []);
      folderInput.value = '';
      if (!isActive() || isBusy() || !files.length) return;
      const pngs = files.filter(file => isDiceFileName(file.name)
        && !(file.webkitRelativePath || file.name).split(/[/\\]/).some(skipEntry));
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

const bounded = operation => new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('文件夹读取超时，请重新选择素材目录')),8000);
  operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});

async function readEntryFiles(entries, read) {
  const files=[];
  // Preserve directory order and duplicate names while overlapping filesystem reads.
  for(let offset=0;offset<entries.length;offset+=8) {
    files.push(...await Promise.all(entries.slice(offset,offset+8).map(entry=>bounded(read(entry)))));
  }
  return files.filter(file=>isDiceFileName(file.name));
}

// Read all directory pages, with one bound shared by file and directory entries.
export async function readDropFiles(transfer) {
  const entries=[], roots=Array.from(transfer.items||[]).map(item=>item.webkitGetAsEntry?.()).filter(Boolean);
  if (!roots.length) return Array.from(transfer.files||[]);
  let count=0;
  const visit = async entry => {
    if (++count>512) throw new Error('文件夹内容过多，请直接选择这一套骰子素材目录');
    if (skipEntry(entry.name)) return;
    if (entry.isFile && isDiceFileName(entry.name)) entries.push(entry);
    if (entry.isDirectory) {
      const reader=entry.createReader();
      for (;;) { const page=await bounded(new Promise((resolve,reject)=>reader.readEntries(resolve,reject))); if(!page.length) break; for(const child of page) await visit(child); }
    }
  };
  for (const root of roots) await visit(root);
  return readEntryFiles(entries,entry=>new Promise((resolve,reject)=>entry.file(file=>{
    if(entry.fullPath)directoryPaths.set(file,entry.fullPath);
    resolve(file);
  },reject)));
}
