import {GIFT_AVATAR_SEATS, prepareGiftAvatar, prepareGiftAvatarFrame} from './gift-avatar-image.mjs?v=20261111-avatar-seats1';

const copy = {
  zh: {
    previewTab: '预览效果',
    productionTab: '生产工具',
    heading: '麦位预览',
    controlsTitle: '头像素材',
    help: '点击麦位选图，也可拖入或粘贴。多张按从上到下、从左到右排列。',
    spec: '导出 240 × 240 px 静态 WebP',
    modeLabel: '素材类型',
    photoMode: '换头像',
    frameMode: '加头像框',
    batch: '批量上传',
    export: '打包下载 ZIP',
    reviewExport: '下载过稿图 WebP',
    privacy: '图片仅在本地处理。',
    loadedLabel: '已导入',
    seat: (number, name, type) => `第 ${number} 个麦位${type === 'frame' ? '头像框' : '头像'}${name ? '，当前为 ' + name : ''}`,
    processing: '正在处理素材…',
    packing: '正在打包…',
    renderingReview: '正在生成过稿图…',
    downloadedReview: '已发起过稿图下载。',
    replaced: count => `已更新 ${count} 个麦位。`,
    downloaded: count => `已发起下载，包含 ${count} 张素材。`,
    tooMany: '一次最多上传 14 张图片。',
    invalid: (name, reason) => `${name}：${reason}`,
    type: '请选择静态 WebP 图片。',
    frameType: '请选择透明 PNG 或静态 WebP 头像框。',
    animated: '请上传静态图片。',
    size: '图片过大，请缩小后重试。',
    decode: '无法读取图片，请检查文件后重试。',
    encode: '无法处理这张图片，请重试。',
    zipError: '打包失败，请重试。',
    reviewError: '过稿图生成失败，请重试。'
  },
  en: {
    previewTab: 'Preview',
    productionTab: 'Production',
    heading: 'Room seat preview',
    controlsTitle: 'Avatar files',
    help: 'Click a seat, drop an image or paste. Multiple files fill seats from top to bottom, left to right.',
    spec: 'Exports static 240 × 240 px WebP',
    modeLabel: 'Asset type',
    photoMode: 'Replace photo',
    frameMode: 'Add frame',
    batch: 'Bulk upload',
    export: 'Download ZIP',
    reviewExport: 'Download review WebP',
    privacy: 'Images are processed on this device.',
    loadedLabel: 'Imported',
    seat: (number, name, type) => `${type === 'frame' ? 'Avatar frame' : 'Avatar photo'} at seat ${number}${name ? ', currently ' + name : ''}`,
    processing: 'Preparing images…',
    packing: 'Creating ZIP…',
    renderingReview: 'Creating review image…',
    downloadedReview: 'Review image download started.',
    replaced: count => `Updated ${count} seats.`,
    downloaded: count => `Download started with ${count} images.`,
    tooMany: 'Upload up to 14 images at a time.',
    invalid: (name, reason) => `${name}: ${reason}`,
    type: 'Choose a static WebP image.',
    frameType: 'Choose a PNG or static WebP avatar frame.',
    animated: 'Choose a static image.',
    size: 'The image is too large. Resize it and try again.',
    decode: 'The image could not be read. Check the file and try again.',
    encode: 'This image could not be processed. Try again.',
    zipError: 'Could not create the ZIP. Try again.',
    reviewError: 'Could not create the review image. Try again.'
  }
};

const byId = id => document.getElementById(id);
const preview = byId('giftAvatarPreview');
const production = byId('avatarSeatProduction');
const tabs = [byId('avatarSeatPreviewTab'), byId('avatarSeatProductionTab')];
const panels = [preview, production];
const modes = {photo: byId('giftAvatarUsePhoto'), frame: byId('giftAvatarUseFrame')};
const batch = byId('giftAvatarBatch');
const download = byId('giftAvatarExport');
const reviewDownload = byId('giftAvatarReviewExport');
const room = byId('giftAvatarRoom');
const count = byId('giftAvatarCount');
const status = byId('giftAvatarStatus');
const batchInput = byId('giftAvatarFiles');
const singleInput = byId('giftAvatarSingle');
const overlay = byId('giftAvatarSeats');
const assets = {
  photo: Array(GIFT_AVATAR_SEATS.length).fill(null),
  frame: Array(GIFT_AVATAR_SEATS.length).fill(null)
};
const labels = byId('avatarTool').querySelectorAll('[data-gift-avatar-text]');
let mode = 'frame';
let busy = false;
let pickedSeat = null;
let hoveredSeat = null;
let dragTarget = null;
let notice = null;

function selectTab(index) {
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[i].hidden = !selected;
  });
  if (index === 0) {
    window.Toolkit?.pauseAvatar();
    window.AvatarCustom?.pause();
  } else {
    clearDragTarget();
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = 1 - index;
    else return;
    event.preventDefault();
    selectTab(next);
    tabs[next].focus();
  });
});

const seats = GIFT_AVATAR_SEATS.map(({x, y, size}, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gift-avatar-seat';
  button.dataset.seatIndex = String(index);
  button.style.setProperty('--seat-x', `${x / 720 * 100}%`);
  button.style.setProperty('--seat-y', `${y / 1560 * 100}%`);
  button.style.setProperty('--seat-size', `${size / 720 * 100}%`);
  button.addEventListener('click', () => {
    pickedSeat = index;
    singleInput.click();
  });
  button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hoveredSeat = index; });
  button.addEventListener('pointerleave', () => { if (hoveredSeat === index) hoveredSeat = null; });
  overlay.append(button);
  return button;
});

function sync() {
  const strings = copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];
  for (const label of labels) label.textContent = strings[label.dataset.giftAvatarText];
  const replaced = assets[mode].filter(Boolean).length;
  count.textContent = `${replaced} / ${seats.length}`;
  batch.disabled = busy;
  download.disabled = busy || !Object.values(assets).some(layer => layer.some(Boolean));
  reviewDownload.disabled = busy;
  for (const [key, button] of Object.entries(modes)) {
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(mode === key));
  }
  batchInput.accept = singleInput.accept = mode === 'frame' ? 'image/png,image/webp,.png,.webp' : 'image/webp,.webp';
  overlay.setAttribute('aria-busy', String(busy));
  seats.forEach((seat, index) => {
    seat.disabled = busy;
    const label = strings.seat(index + 1, assets[mode][index]?.name, mode);
    seat.setAttribute('aria-label', label);
    seat.title = label;
  });
  status.dataset.tone = notice?.tone ?? '';
  const message = strings[notice?.key];
  status.textContent = notice?.key === 'invalid'
    ? strings.invalid(notice.name, strings[notice.reason] ?? strings.encode)
    : typeof message === 'function' ? message(notice.count) : message ?? '';
}

function replaceSeat(index, file, blob, type) {
  const image = document.createElement('img');
  const url = URL.createObjectURL(blob);
  image.src = url;
  image.alt = '';
  image.className = type === 'photo' ? 'gift-avatar-photo' : 'gift-avatar-frame-image';
  const previous = assets[type][index];
  assets[type][index] = {blob, image, url, name: file.name};
  if (previous) {
    previous.image.replaceWith(image);
    URL.revokeObjectURL(previous.url);
  } else {
    seats[index].append(image);
  }
}

async function loadFiles(files, firstSeat, trigger) {
  if (busy || !files.length) return;
  if (files.length > seats.length) {
    notice = {key: 'tooMany', tone: 'error'};
    sync();
    return;
  }
  const type = mode;
  const prepareImage = type === 'frame' ? prepareGiftAvatarFrame : prepareGiftAvatar;
  busy = true;
  notice = {key: 'processing'};
  sync();
  let activeFile;
  try {
    const prepared = [];
    // Validate and process the whole batch before replacing any existing seat.
    // Keeping one image decode in flight also bounds memory on mobile.
    for (const file of files) {
      activeFile = file;
      prepared.push(await prepareImage(file));
    }
    prepared.forEach((blob, i) => replaceSeat(firstSeat + i, files[i], blob, type));
    notice = {key: 'replaced', count: prepared.length};
  } catch (error) {
    const reason = type === 'frame' && error?.code === 'type' ? 'frameType' : error?.code;
    notice = {key: 'invalid', name: activeFile.name, reason, tone: 'error'};
  } finally {
    busy = false;
    sync();
    if (document.activeElement === document.body && !preview.hidden) {
      trigger?.focus({preventScroll: true});
    }
  }
}

for (const [key, button] of Object.entries(modes)) {
  button.addEventListener('click', () => {
    mode = key;
    notice = null;
    sync();
  });
}

batch.addEventListener('click', () => batchInput.click());
batchInput.addEventListener('change', () => {
  const files = Array.from(batchInput.files);
  batchInput.value = '';
  void loadFiles(files, 0, batch);
});
singleInput.addEventListener('change', () => {
  const file = singleInput.files[0];
  singleInput.value = '';
  const index = pickedSeat;
  pickedSeat = null;
  if (file && index !== null) void loadFiles([file], index, seats[index]);
});
singleInput.addEventListener('cancel', () => { pickedSeat = null; });

function seatIndex(node) {
  const seat = node?.closest?.('.gift-avatar-seat');
  return seat && overlay.contains(seat) ? Number(seat.dataset.seatIndex) : null;
}

function loadTransferredFiles(files, target) {
  if (files.length !== 1) {
    void loadFiles(files, 0, batch);
    return;
  }
  const vacancy = assets[mode].findIndex(asset => !asset);
  const index = target ?? Math.max(0, vacancy);
  void loadFiles(files, index, target === null ? batch : seats[index]);
}

function clearDragTarget() {
  delete preview.dataset.dragging;
  if (dragTarget !== null) delete seats[dragTarget].dataset.dragging;
  dragTarget = null;
}

preview.addEventListener('dragover', event => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  if (busy) return;
  const target = seatIndex(event.target);
  if (target !== dragTarget) clearDragTarget();
  preview.dataset.dragging = 'true';
  dragTarget = target;
  if (target !== null) seats[target].dataset.dragging = 'true';
});
preview.addEventListener('dragleave', event => {
  if (!preview.contains(event.relatedTarget)) clearDragTarget();
});
preview.addEventListener('drop', event => {
  clearDragTarget();
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault();
  loadTransferredFiles(files, seatIndex(event.target));
});
window.addEventListener('blur', clearDragTarget);
window.UploadPaste?.register({
  zone: preview,
  isActive: () => location.hash === '#avatar-frames' && !preview.hidden,
  isBusy: () => busy,
  onFiles: files => loadTransferredFiles(files, seatIndex(document.activeElement) ?? hoveredSeat)
});

function downloadFile(blob, filename) {
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

download.addEventListener('click', async () => {
  if (busy || !Object.values(assets).some(layer => layer.some(Boolean))) return;
  busy = true;
  notice = {key: 'packing'};
  sync();
  try {
    const zip = new window.JSZip();
    let packed = 0;
    for (const [type, layer] of Object.entries(assets)) {
      const prefix = type === 'photo' ? 'avatar' : 'frame';
      layer.forEach((asset, index) => {
        if (!asset) return;
        zip.file(`${prefix}-${String(index + 1).padStart(2, '0')}.webp`, asset.blob);
        packed++;
      });
    }
    const blob = await zip.generateAsync({type: 'blob', compression: 'STORE'});
    downloadFile(blob, 'gift-room-avatars-240x240.zip');
    notice = {key: 'downloaded', count: packed};
    window.Hub?.record('avatar', 'download');
  } catch {
    notice = {key: 'zipError', tone: 'error'};
  } finally {
    busy = false;
    sync();
    if (document.activeElement === document.body && !preview.hidden) download.focus({preventScroll: true});
  }
});

reviewDownload.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  notice = {key: 'renderingReview'};
  sync();
  const canvas = document.createElement('canvas');
  try {
    await Promise.all([room.decode(), ...Object.values(assets).flat().filter(Boolean).map(({image}) => image.decode())]);
    canvas.width = room.naturalWidth;
    canvas.height = room.naturalHeight;
    const ctx = canvas.getContext('2d');
    const style = getComputedStyle(room.parentElement);
    const plate = style.getPropertyValue('--gift-avatar-plate').trim();
    const frame = style.getPropertyValue('--gift-avatar-frame').trim();
    const frameWidth = Number(style.getPropertyValue('--gift-avatar-frame-size'));
    const frameScale = Number(style.getPropertyValue('--gift-avatar-frame-scale'));
    ctx.drawImage(room, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.lineWidth = frameWidth;
    ctx.strokeStyle = frame;
    GIFT_AVATAR_SEATS.forEach(({x, y, size}, index) => {
      const radius = size / 2;
      const avatar = assets.photo[index];
      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.clip();
        ctx.fillStyle = plate;
        ctx.fillRect(x - radius, y - radius, size, size);
        ctx.drawImage(avatar.image, x - radius, y - radius, size, size);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(x, y, radius - frameWidth / 2, 0, 2 * Math.PI);
      ctx.stroke();
      const avatarFrame = assets.frame[index];
      if (avatarFrame) {
        const diameter = size * frameScale;
        ctx.drawImage(avatarFrame.image, x - diameter / 2, y - diameter / 2, diameter, diameter);
      }
    });
    const blob = await window.canvasToLosslessWebP(canvas);
    downloadFile(blob, `gift-room-review-${canvas.width}x${canvas.height}.webp`);
    notice = {key: 'downloadedReview'};
    window.Hub?.record('avatar', 'generated');
    window.Hub?.record('avatar', 'download');
  } catch {
    notice = {key: 'reviewError', tone: 'error'};
  } finally {
    canvas.width = canvas.height = 1;
    busy = false;
    sync();
    if (document.activeElement === document.body && !preview.hidden) reviewDownload.focus({preventScroll: true});
  }
});

new MutationObserver(sync).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
window.addEventListener('pagehide', event => {
  if (!event.persisted) {
    for (const asset of Object.values(assets).flat()) if (asset) URL.revokeObjectURL(asset.url);
  }
});
sync();
