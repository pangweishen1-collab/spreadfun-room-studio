import {GIFT_AVATAR_SEATS, prepareGiftAvatar} from './gift-avatar-image.mjs?v=20261111-seats1';

const copy = {
  zh: {
    previewTab: '预览效果',
    productionTab: '生产工具',
    heading: '麦位预览',
    controlsTitle: '头像素材',
    help: '点击麦位可单独替换，或批量上传，按从上到下、从左到右排列。',
    spec: '240 × 240 px · 静态 WebP',
    batch: '批量上传',
    export: '打包下载 ZIP',
    reviewExport: '下载过稿图 WebP',
    privacy: '图片仅在本地处理。',
    loadedLabel: '已替换',
    seat: (number, name) => `替换第 ${number} 个麦位头像${name ? '，当前为 ' + name : ''}`,
    processing: '正在处理头像…',
    packing: '正在打包…',
    renderingReview: '正在生成过稿图…',
    downloadedReview: '已发起过稿图下载。',
    replaced: count => `已替换 ${count} 个麦位头像。`,
    downloaded: count => `已发起下载，包含 ${count} 张头像。`,
    tooMany: '一次最多上传 14 张头像。',
    invalid: (name, reason) => `${name}：${reason}`,
    type: '请选择静态 WebP 图片。',
    animated: '暂不支持动态 WebP，请上传静态图。',
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
    help: 'Click a seat to replace it, or upload in bulk to fill seats from top to bottom, left to right.',
    spec: '240 × 240 px · Static WebP',
    batch: 'Bulk upload',
    export: 'Download ZIP',
    reviewExport: 'Download review WebP',
    privacy: 'Images are processed on this device.',
    loadedLabel: 'Replaced',
    seat: (number, name) => `Replace avatar at seat ${number}${name ? ', currently ' + name : ''}`,
    processing: 'Preparing avatars…',
    packing: 'Creating ZIP…',
    renderingReview: 'Creating review image…',
    downloadedReview: 'Review image download started.',
    replaced: count => `Replaced ${count} seat avatars.`,
    downloaded: count => `Download started with ${count} avatars.`,
    tooMany: 'Upload up to 14 avatars at a time.',
    invalid: (name, reason) => `${name}: ${reason}`,
    type: 'Choose a static WebP image.',
    animated: 'Choose a static WebP instead of an animated image.',
    size: 'The image is too large. Resize it and try again.',
    decode: 'The image could not be read. Check the file and try again.',
    encode: 'This image could not be processed. Try again.',
    zipError: 'Could not create the ZIP. Try again.',
    reviewError: 'Could not create the review image. Try again.'
  }
};

const byId = id => document.getElementById(id);
const preview = byId('giftAvatarPreview');
const production = byId('giftProduction');
const tabs = [byId('giftAvatarPreviewTab'), byId('giftProductionTab')];
const panels = [preview, production];
const batch = byId('giftAvatarBatch');
const download = byId('giftAvatarExport');
const reviewDownload = byId('giftAvatarReviewExport');
const room = byId('giftAvatarRoom');
const count = byId('giftAvatarCount');
const status = byId('giftAvatarStatus');
const batchInput = byId('giftAvatarFiles');
const singleInput = byId('giftAvatarSingle');
const overlay = byId('giftAvatarSeats');
const avatars = Array(GIFT_AVATAR_SEATS.length).fill(null);
const labels = byId('giftPreviewTool').querySelectorAll('[data-gift-avatar-text]');
let busy = false;
let pickedSeat = null;
let notice = null;

function selectTab(index) {
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[i].hidden = !selected;
  });
  if (index === 1) window.GiftPreviewTool?.activate();
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
  button.style.setProperty('--seat-x', `${x / 720 * 100}%`);
  button.style.setProperty('--seat-y', `${y / 1560 * 100}%`);
  button.style.setProperty('--seat-size', `${size / 720 * 100}%`);
  button.addEventListener('click', () => {
    pickedSeat = index;
    singleInput.click();
  });
  overlay.append(button);
  return button;
});

function sync() {
  const strings = copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];
  for (const label of labels) label.textContent = strings[label.dataset.giftAvatarText];
  const replaced = avatars.filter(Boolean).length;
  count.textContent = `${replaced} / ${avatars.length}`;
  batch.disabled = busy;
  download.disabled = busy || replaced === 0;
  reviewDownload.disabled = busy;
  overlay.setAttribute('aria-busy', String(busy));
  seats.forEach((seat, index) => {
    seat.disabled = busy;
    const label = strings.seat(index + 1, avatars[index]?.name);
    seat.setAttribute('aria-label', label);
    seat.title = label;
  });
  status.dataset.tone = notice?.tone ?? '';
  const message = strings[notice?.key];
  status.textContent = notice?.key === 'invalid'
    ? strings.invalid(notice.name, strings[notice.reason] ?? strings.encode)
    : typeof message === 'function' ? message(notice.count) : message ?? '';
}

function replaceSeat(index, file, blob) {
  const image = document.createElement('img');
  const url = URL.createObjectURL(blob);
  image.src = url;
  image.alt = '';
  const previous = avatars[index];
  avatars[index] = {blob, image, url, name: file.name};
  seats[index].replaceChildren(image);
  seats[index].classList.add('has-avatar');
  if (previous) URL.revokeObjectURL(previous.url);
}

async function loadFiles(files, firstSeat, trigger) {
  if (busy || !files.length) return;
  if (files.length > avatars.length) {
    notice = {key: 'tooMany', tone: 'error'};
    sync();
    return;
  }
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
      prepared.push(await prepareGiftAvatar(file));
    }
    prepared.forEach((blob, i) => replaceSeat(firstSeat + i, files[i], blob));
    notice = {key: 'replaced', count: prepared.length};
  } catch (error) {
    notice = {key: 'invalid', name: activeFile.name, reason: error.code, tone: 'error'};
  } finally {
    busy = false;
    sync();
    if (document.activeElement === document.body && !preview.hidden) {
      trigger.focus({preventScroll: true});
    }
  }
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
  if (busy || !avatars.some(Boolean)) return;
  busy = true;
  notice = {key: 'packing'};
  sync();
  try {
    const zip = new window.JSZip();
    let packed = 0;
    avatars.forEach((avatar, index) => {
      if (!avatar) return;
      zip.file(`avatar-${String(index + 1).padStart(2, '0')}.webp`, avatar.blob);
      packed++;
    });
    const blob = await zip.generateAsync({type: 'blob', compression: 'STORE'});
    downloadFile(blob, 'gift-room-avatars-240x240.zip');
    notice = {key: 'downloaded', count: packed};
    window.Hub?.record('gift', 'download');
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
    await Promise.all([room.decode(), ...avatars.filter(Boolean).map(({image}) => image.decode())]);
    canvas.width = room.naturalWidth;
    canvas.height = room.naturalHeight;
    const ctx = canvas.getContext('2d');
    const style = getComputedStyle(room.parentElement);
    const plate = style.getPropertyValue('--gift-avatar-plate').trim();
    const frame = style.getPropertyValue('--gift-avatar-frame').trim();
    const frameWidth = Number(style.getPropertyValue('--gift-avatar-frame-size'));
    ctx.drawImage(room, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.lineWidth = frameWidth;
    ctx.strokeStyle = frame;
    GIFT_AVATAR_SEATS.forEach(({x, y, size}, index) => {
      const radius = size / 2;
      const avatar = avatars[index];
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
    });
    const blob = await window.canvasToLosslessWebP(canvas);
    downloadFile(blob, `gift-room-review-${canvas.width}x${canvas.height}.webp`);
    notice = {key: 'downloadedReview'};
    window.Hub?.record('gift', 'generated');
    window.Hub?.record('gift', 'download');
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
  if (!event.persisted) for (const avatar of avatars) if (avatar) URL.revokeObjectURL(avatar.url);
});
sync();
