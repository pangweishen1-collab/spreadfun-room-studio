import {prepareProfileArtwork} from './gift-avatar-image.mjs?v=20261111-profile2';
import {bindPreviewSlotDrag} from './preview-slot-drag.mjs?v=20261111-profile1';

const copy = {
  zh: {
    productionTab: '预览图生产', deviceTab: '座驾/勋章预览', giftTab: '礼物预览',
    gift: '礼物', giftReviewExport: '下载礼物栏预览图',
    materialsHeading: '展示素材', medal: '勋章', vehicle: '座驾', upload: '批量上传',
    countLabel: '已放置', privacy: '图片仅在本地处理。', replace: '替换',
    export: kind => `下载${kind} WebP`,
    outputSize: side => `输出尺寸 ${side} × ${side} px · WebP`,
    reviewExport: '下载实机预览图', renderingReview: '正在生成实机预览图…',
    reviewDownloaded: '已发起实机预览图下载。',
    packing: '正在打包…', downloaded: count => `已发起下载，共 ${count} 张图片。`,
    downloadError: '下载失败，请重试。',
    seat: (kind, number) => `替换${kind} ${number}`,
    processing: '正在处理图片…', loaded: count => `已放置 ${count} 张图片。`,
    tooMany: count => `当前分类最多放置 ${count} 张图片。`,
    moved: '已移动图片。', swapped: '已互换图片。',
    type: '请选择 PNG、JPG 或 WebP 图片。', animated: '请选择静态图片。',
    size: '图片尺寸或体积过大。', invalid: name => `无法读取「${name}」。`
  },
  en: {
    productionTab: 'Create preview', deviceTab: 'Vehicles / Medals', giftTab: 'Gift preview',
    gift: 'Gifts', giftReviewExport: 'Download gift tray preview',
    materialsHeading: 'Display assets', medal: 'Medals', vehicle: 'Vehicles', upload: 'Bulk upload',
    countLabel: 'Placed', privacy: 'Images are processed on this device.', replace: 'Replace',
    export: kind => `Download ${kind.toLowerCase()} WebP`,
    outputSize: side => `Output size ${side} × ${side} px · WebP`,
    reviewExport: 'Download in-game preview', renderingReview: 'Creating in-game preview…',
    reviewDownloaded: 'In-game preview download started.',
    packing: 'Creating ZIP…', downloaded: count => `Download started with ${count} images.`,
    downloadError: 'Could not download the images. Try again.',
    seat: (kind, number) => `${kind}, replace item ${number}`,
    processing: 'Preparing images…', loaded: count => `Placed ${count} images.`,
    tooMany: count => `This category can hold up to ${count} images.`,
    moved: 'Image moved.', swapped: 'Images swapped.',
    type: 'Choose a PNG, JPG or WebP image.', animated: 'Choose a static image.',
    size: 'The image is too large.', invalid: name => `Could not read “${name}”.`
  }
};

const byId = id => document.getElementById(id);
const root = byId('giftPreviewTool');
const tabs = [...byId('profileTabs').querySelectorAll('[role="tab"]')];
const panels = tabs.map(tab => byId(tab.getAttribute('aria-controls')));
const labels = root.querySelectorAll('[data-profile-text]');
const outputSides = {medal: 400, vehicle: 200, gift: 200};
const stringsForPage = () => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];

function artwork(src, lazy = false) {
  const image = document.createElement('img');
  image.className = 'profile-slot-art';
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  if (lazy) image.loading = 'lazy';
  image.src = src;
  return image;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function mountPreview(device, {prefix, screen, card, layout, columns, defaultArtwork, sprite, clipY = screen.height}) {
  const control = name => byId(prefix + name);
  const modes = Object.fromEntries(['Medal', 'Vehicle'].filter(name => control(name)).map(name => [name.toLowerCase(), control(name)]));
  const upload = control('Upload');
  const download = control('Export');
  const reviewDownload = control('ReviewExport');
  const exportSize = control('ExportSize');
  const input = control('Files');
  const count = control('Count');
  const status = control('Status');
  const overlay = control('Slots');
  const backdrop = control('Stage').querySelector('.profile-stage-background');
  let mode = layout[0].kind;
  let busy = false;
  let notice = null;
  let pickedSlot = null;
  let hoveredSlot = null;
  let fileDropTarget = null;
  let spriteImage;
  if (sprite) {
    overlay.style.setProperty('--profile-default-sprite', `url("${sprite}")`);
    overlay.style.setProperty('--profile-slot-clip-bottom', `${(screen.height - clipY) / screen.height * 100}%`);
  }

  const slots = layout.flatMap(({kind, y}, row) => columns.map((x, column) => {
    const index = row * columns.length + column;
    const number = (row - layout.findIndex(item => item.kind === kind)) * columns.length + column + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-slot';
    button.dataset.slotIndex = String(index);
    button.dataset.type = kind;
    button.style.setProperty('--slot-x', `${x / screen.width * 100}%`);
    button.style.setProperty('--slot-y', `${y / screen.height * 100}%`);
    button.style.setProperty('--slot-w', `${card.width / screen.width * 100}%`);
    button.style.setProperty('--slot-h', `${card.height / screen.height * 100}%`);
    let fallback;
    if (sprite) {
      fallback = document.createElement('span');
      fallback.className = 'profile-slot-art profile-slot-fallback';
      fallback.style.backgroundPosition = `${column * 100 / (columns.length - 1)}% ${row * 100 / (layout.length - 1)}%`;
    } else {
      fallback = artwork(defaultArtwork[kind], true);
    }
    const cue = document.createElement('span');
    cue.className = 'profile-slot-replace';
    cue.setAttribute('aria-hidden', 'true');
    button.append(fallback, cue);
    button.addEventListener('click', event => {
      if (slotDrag.consumeClick(event)) return;
      selectMode(kind);
      pickedSlot = index;
      input.multiple = false;
      input.click();
    });
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') hoveredSlot = index;
    });
    button.addEventListener('pointerleave', () => {
      if (hoveredSlot === index) hoveredSlot = null;
    });
    overlay.append(button);
    return {kind, number, x, y, column, row, button, fallback, cue, asset: null};
  }));

  const active = () => location.hash === '#gift-previews' && !device.hidden;

  function slotAt(node) {
    const button = node?.closest?.('.profile-slot');
    return button && overlay.contains(button) ? Number(button.dataset.slotIndex) : null;
  }

  function sync() {
    const strings = stringsForPage();
    const category = slots.filter(slot => slot.kind === mode);
    const placed = category.filter(slot => slot.asset).length;
    count.textContent = `${placed} / ${category.length}`;
    upload.disabled = busy;
    download.disabled = busy || placed === 0;
    download.textContent = strings.export(strings[mode]) + (mode === 'gift' ? ' · ZIP' : '');
    reviewDownload.disabled = busy;
    reviewDownload.textContent = mode === 'gift' ? strings.giftReviewExport : strings.reviewExport;
    exportSize.textContent = strings.outputSize(outputSides[mode]);
    overlay.setAttribute('aria-busy', String(busy));
    for (const [kind, button] of Object.entries(modes)) {
      button.disabled = busy;
      button.setAttribute('aria-pressed', String(kind === mode));
    }
    for (const slot of slots) {
      const title = strings.seat(strings[slot.kind], slot.number);
      slot.button.disabled = busy;
      slot.button.setAttribute('aria-label', title);
      slot.button.title = title;
      slot.cue.textContent = strings.replace;
    }
    status.dataset.tone = notice?.tone ?? '';
    const message = strings[notice?.key];
    status.textContent = typeof message === 'function' ? message(notice.value) : message ?? '';
  }

  function selectMode(kind) {
    mode = kind;
    notice = null;
    sync();
  }

  function renderSlot(slot) {
    slot.button.replaceChildren(slot.asset?.element ?? slot.fallback, slot.cue);
    slot.button.classList.toggle('has-upload', Boolean(slot.asset));
  }

  const slotDrag = bindPreviewSlotDrag({
    overlay,
    buttons: slots.map(slot => slot.button),
    slotAt,
    assetAt: index => slots[index].asset,
    isBusy: () => busy,
    canMove: (from, to) => slots[from].kind === slots[to].kind,
    ghostClass: 'profile-drag-ghost',
    move(from, to) {
      const source = slots[from], target = slots[to];
      const other = target.asset;
      target.asset = source.asset;
      source.asset = other;
      renderSlot(source);
      renderSlot(target);
      mode = target.kind;
      notice = {key: other ? 'swapped' : 'moved'};
      sync();
    }
  });

  async function loadFiles(files, {target = null, firstVacant = false} = {}) {
    if (busy || !files.length) return;
    if (target !== null) mode = slots[target].kind;
    const category = slots.filter(slot => slot.kind === mode);
    if (files.length > category.length) {
      notice = {key: 'tooMany', value: category.length, tone: 'error'};
      sync();
      return;
    }
    const destinations = files.length === 1 && target !== null ? [slots[target]]
      : files.length === 1 && firstVacant ? [category.find(slot => !slot.asset) ?? category[0]]
      : category;
    const trigger = target === null ? upload : slots[target].button;
    busy = true;
    notice = {key: 'processing'};
    sync();
    const progress = window.UploadProgress?.begin(files.length);
    const prepared = [];
    let activeFile;
    try {
      // Prepare the entire batch before replacing existing placements.
      for (const file of files) {
        activeFile = file;
        const blob = await prepareProfileArtwork(file, outputSides[mode]);
        const url = URL.createObjectURL(blob);
        const image = artwork(url);
        prepared.push({element: image, image, url, blob, sourceName: file.name});
        progress?.advance();
      }
      prepared.forEach((asset, index) => {
        const slot = destinations[index];
        if (slot.asset) URL.revokeObjectURL(slot.asset.url);
        slot.asset = asset;
        renderSlot(slot);
      });
      notice = {key: 'loaded', value: prepared.length};
    } catch (error) {
      for (const asset of prepared) URL.revokeObjectURL(asset.url);
      const key = ['type', 'size', 'animated'].includes(error?.code) ? error.code : 'invalid';
      notice = {key, value: activeFile.name, tone: 'error'};
    } finally {
      progress?.finish();
      busy = false;
      sync();
      if (active() && document.activeElement === document.body) trigger.focus({preventScroll: true});
    }
  }

  for (const [kind, button] of Object.entries(modes)) button.addEventListener('click', () => selectMode(kind));
  upload.addEventListener('click', () => {
    pickedSlot = null;
    input.multiple = true;
    input.click();
  });
  input.addEventListener('change', () => {
    const target = pickedSlot;
    pickedSlot = null;
    const files = Array.from(input.files);
    input.value = '';
    void loadFiles(files, {target});
  });
  input.addEventListener('cancel', () => { pickedSlot = null; });

  download.addEventListener('click', async () => {
    const kind = mode;
    const selected = slots.filter(slot => slot.kind === kind && slot.asset);
    if (busy || !selected.length) return;
    busy = true;
    const side = outputSides[kind];
    const dimensions = `${side}x${side}`;
    const nameFor = slot => `${kind}-${String(slot.number).padStart(2, '0')}-${dimensions}.webp`;
    const zipOutput = kind === 'gift' || selected.length > 1;
    notice = zipOutput ? {key: 'packing'} : null;
    sync();
    try {
      if (!zipOutput) {
        const [slot] = selected;
        downloadBlob(slot.asset.blob, nameFor(slot));
      } else {
        const zip = new window.JSZip();
        const names = window.GiftPreviewTool.batchWebpNames(selected.map(slot => slot.asset.sourceName));
        selected.forEach((slot, index) => zip.file(names[index], slot.asset.blob));
        const blob = await zip.generateAsync({type: 'blob', compression: 'STORE'});
        downloadBlob(blob, `${kind}-${dimensions}-webp.zip`);
      }
      notice = {key: 'downloaded', value: selected.length};
      window.Hub?.record('gift', 'download');
    } catch {
      notice = {key: 'downloadError', tone: 'error'};
    } finally {
      busy = false;
      sync();
      if (active() && document.activeElement === document.body) download.focus({preventScroll: true});
    }
  });

  reviewDownload.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    notice = {key: 'renderingReview'};
    sync();
    const canvas = document.createElement('canvas');
    try {
      // Include the entire screen, even rows below the visible page fold.
      if (sprite && !spriteImage) spriteImage = artwork(sprite);
      const images = slots.map(slot => slot.asset?.image ?? spriteImage ?? slot.fallback);
      for (const image of images) image.loading = 'eager';
      await Promise.all([backdrop.decode(), ...images.map(image => image.decode())]);
      const style = getComputedStyle(overlay);
      const artWidth = card.width * parseFloat(style.getPropertyValue('--profile-art-width')) / 100;
      const artHeight = card.height * parseFloat(style.getPropertyValue('--profile-art-height')) / 100;
      const lift = card.width * parseFloat(style.getPropertyValue('--profile-art-lift')) / 100;
      const defaultOpacity = slots.some(slot => slot.asset)
        ? parseFloat(style.getPropertyValue('--profile-default-opacity')) : 1;
      canvas.width = screen.width;
      canvas.height = screen.height;
      const context = canvas.getContext('2d');
      context.drawImage(backdrop, 0, 0, screen.width, screen.height);
      context.imageSmoothingQuality = 'high';
      if (clipY < screen.height) {
        context.beginPath();
        context.rect(0, 0, screen.width, clipY);
        context.clip();
      }
      slots.forEach((slot, index) => {
        const image = images[index];
        context.globalAlpha = slot.asset ? 1 : defaultOpacity;
        if (image === spriteImage) {
          context.drawImage(image, slot.column * card.width, slot.row * card.height, card.width, card.height,
            slot.x, slot.y, artWidth, artHeight);
          return;
        }
        const scale = Math.min(artWidth / image.naturalWidth, artHeight / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, slot.x + (card.width - width) / 2, slot.y + (card.height - height - lift) / 2, width, height);
      });
      const blob = await window.canvasToLosslessWebP(canvas);
      downloadBlob(blob, `${mode === 'gift' ? 'gift-tray' : 'profile'}-review-${screen.width}x${screen.height}.webp`);
      notice = {key: 'reviewDownloaded'};
      window.Hub?.record('gift', 'generated');
      window.Hub?.record('gift', 'download');
    } catch {
      notice = {key: 'downloadError', tone: 'error'};
    } finally {
      canvas.width = canvas.height = 1;
      busy = false;
      sync();
      if (active() && document.activeElement === document.body) reviewDownload.focus({preventScroll: true});
    }
  });

  function clearFileDrop() {
    delete device.dataset.dragging;
    if (fileDropTarget !== null) delete slots[fileDropTarget].button.dataset.dragging;
    fileDropTarget = null;
  }

  device.addEventListener('dragover', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    if (busy) return;
    const target = slotAt(event.target);
    if (target !== fileDropTarget) clearFileDrop();
    device.dataset.dragging = 'true';
    fileDropTarget = target;
    if (target !== null) slots[target].button.dataset.dragging = 'true';
  });
  device.addEventListener('dragleave', event => {
    if (!device.contains(event.relatedTarget)) clearFileDrop();
  });
  device.addEventListener('drop', event => {
    clearFileDrop();
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    void loadFiles(files, {target: slotAt(event.target), firstVacant: true});
  });
  window.UploadPaste?.register({
    zone: device,
    isActive: active,
    isBusy: () => busy,
    onFiles: files => loadFiles(files, {target: slotAt(document.activeElement) ?? hoveredSlot, firstVacant: true})
  });

  function deactivate() {
    hoveredSlot = null;
    clearFileDrop();
    slotDrag.cancel();
  }

  window.addEventListener('hashchange', () => { if (!active()) deactivate(); });
  window.addEventListener('blur', clearFileDrop);
  window.addEventListener('pagehide', event => {
    deactivate();
    if (!event.persisted) {
      for (const {asset} of slots) if (asset) URL.revokeObjectURL(asset.url);
    }
  });
  return {sync, deactivate};
}

const previews = [
  mountPreview(byId('profileDevice'), {
    prefix: 'profile',
    screen: {width: 720, height: 1613},
    card: {width: 156, height: 171},
    columns: [30, 198, 366, 534],
    layout: [
      {kind: 'medal', y: 430},
      {kind: 'vehicle', y: 709},
      {kind: 'vehicle', y: 899},
      {kind: 'vehicle', y: 1089}
    ],
    defaultArtwork: {
      medal: 'assets/profile-preview/medal-default.webp?v=20261111-profile1',
      vehicle: 'assets/profile-preview/vehicle-default.webp?v=20261111-profile1'
    }
  }),
  mountPreview(byId('profileGift'), {
    prefix: 'giftTray',
    screen: {width: 720, height: 1620},
    card: {width: 130, height: 130},
    columns: [27, 202, 380, 556],
    layout: [1000, 1206, 1413].map(y => ({kind: 'gift', y})),
    sprite: 'assets/profile-preview/gift-defaults.webp',
    clipY: 1512
  })
];

function selectTab(index) {
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[i].hidden = !selected;
  });
  previews.forEach((preview, i) => { if (i + 1 !== index) preview.deactivate(); });
  if (index === 0) window.GiftPreviewTool?.activate();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else return;
    event.preventDefault();
    selectTab(next);
    tabs[next].focus();
  });
});

function syncLanguage() {
  const strings = stringsForPage();
  for (const label of labels) label.textContent = strings[label.dataset.profileText];
  for (const preview of previews) preview.sync();
}
new MutationObserver(syncLanguage).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
syncLanguage();
