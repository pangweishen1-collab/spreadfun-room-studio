import {GIFT_AVATAR_SEATS, prepareGiftAvatar, prepareGiftAvatarFrame} from './gift-avatar-image.mjs?v=20261111-seat-layout20';

const copy = {
  zh: {
    previewTab: '预览效果',
    heading: '麦位预览',
    controlsTitle: '头像素材',
    spec: 'ZIP 导出 240 × 240 静态 WebP，SVGA 取当前帧。',
    modeLabel: '素材类型',
    photoMode: '换头像',
    frameMode: '加头像框',
    batch: '批量上传',
    export: '打包下载 ZIP',
    reviewExport: '下载过稿图 WebP',
    reviewVideoExport: '下载 6 秒过稿视频',
    replaceCue: '替换',
    privacy: '图片仅在本地处理。',
    loadedLabel: '已导入',
    seat: (number, name, type) => `第 ${number} 个麦位${type === 'frame' ? '头像框' : '头像'}${name ? '，当前为 ' + name : ''}`,
    processing: '正在处理素材…',
    packing: '正在打包…',
    renderingReview: '正在生成过稿图…',
    renderingReviewVideo: progress => `正在生成 6 秒视频… ${progress}%`,
    downloadedReview: '已发起过稿图下载。',
    downloadedReviewVideo: '已发起过稿视频下载。',
    replaced: count => `已更新 ${count} 个麦位。`,
    downloaded: count => `已发起下载，包含 ${count} 张素材。`,
    tooMany: count => `一次最多上传 ${count} 个素材。`,
    frameMoved: '已移动头像框。',
    framesSwapped: '已互换头像框。',
    invalid: (name, reason) => `${name}：${reason}`,
    type: '请选择静态 WebP 图片。',
    frameType: '请选择 SVGA、透明 PNG 或静态 WebP 头像框。',
    animated: '请上传静态图片。',
    size: '图片过大，请缩小后重试。',
    decode: '无法读取图片，请检查文件后重试。',
    encode: '无法处理这张图片，请重试。',
    svgaDecode: '无法播放此 SVGA，请检查文件。',
    svgaSize: 'SVGA 过大，请压缩后重试。',
    zipError: '打包失败，请重试。',
    reviewError: '过稿图生成失败，请重试。',
    reviewVideoError: '过稿视频生成失败，请重试。',
    reviewVideoUnsupported: '当前浏览器无法生成视频，请换用支持视频编码的浏览器。'
  },
  en: {
    previewTab: 'Preview',
    heading: 'Room seat preview',
    controlsTitle: 'Avatar files',
    spec: 'ZIP exports 240 × 240 static WebP, using the current frame of each SVGA.',
    modeLabel: 'Asset type',
    photoMode: 'Replace photo',
    frameMode: 'Add frame',
    batch: 'Bulk upload',
    export: 'Download ZIP',
    reviewExport: 'Download review WebP',
    reviewVideoExport: 'Download 6-second review',
    replaceCue: 'Replace',
    privacy: 'Images are processed on this device.',
    loadedLabel: 'Imported',
    seat: (number, name, type) => `${type === 'frame' ? 'Avatar frame' : 'Avatar photo'} at seat ${number}${name ? ', currently ' + name : ''}`,
    processing: 'Preparing images…',
    packing: 'Creating ZIP…',
    renderingReview: 'Creating review image…',
    renderingReviewVideo: progress => `Creating 6-second video… ${progress}%`,
    downloadedReview: 'Review image download started.',
    downloadedReviewVideo: 'Review video download started.',
    replaced: count => `Updated ${count} seats.`,
    downloaded: count => `Download started with ${count} images.`,
    tooMany: count => `Upload up to ${count} files at a time.`,
    frameMoved: 'Avatar frame moved.',
    framesSwapped: 'Avatar frames swapped.',
    invalid: (name, reason) => `${name}: ${reason}`,
    type: 'Choose a static WebP image.',
    frameType: 'Choose an SVGA, PNG or static WebP avatar frame.',
    animated: 'Choose a static image.',
    size: 'The image is too large. Resize it and try again.',
    decode: 'The image could not be read. Check the file and try again.',
    encode: 'This image could not be processed. Try again.',
    svgaDecode: 'Could not play this SVGA. Check the file and try again.',
    svgaSize: 'The SVGA is too large. Compress it and try again.',
    zipError: 'Could not create the ZIP. Try again.',
    reviewError: 'Could not create the review image. Try again.',
    reviewVideoError: 'Could not create the review video. Try again.',
    reviewVideoUnsupported: 'This browser cannot export video. Try a browser with video encoding support.'
  }
};

const byId = id => document.getElementById(id);
const avatarTool = byId('avatarTool');
const preview = byId('giftAvatarPreview');
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
const labels = avatarTool.querySelectorAll('[data-gift-avatar-text]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const visibleSeats = new Set();
let mode = 'frame';
let busy = false;
let pickedSeat = null;
let hoveredSeat = null;
let dragTarget = null;
let notice = null;
let reviewJob = null;
let frameMove = null;
let suppressSeatClick = false;

const seats = GIFT_AVATAR_SEATS.map(({x, y, size}, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gift-avatar-seat';
  button.dataset.seatIndex = String(index);
  button.style.setProperty('--seat-x', `${x / 720 * 100}%`);
  button.style.setProperty('--seat-y', `${y / 1560 * 100}%`);
  button.style.setProperty('--seat-size', `${size / 720 * 100}%`);
  const replaceCue = document.createElement('span');
  replaceCue.className = 'gift-avatar-replace-cue';
  replaceCue.setAttribute('aria-hidden', 'true');
  button.append(replaceCue);
  button.addEventListener('click', event => {
    if (suppressSeatClick && event.detail > 0) {
      suppressSeatClick = false;
      event.preventDefault();
      return;
    }
    pickedSeat = index;
    singleInput.click();
  });
  button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hoveredSeat = index; });
  button.addEventListener('pointerleave', () => { if (hoveredSeat === index) hoveredSeat = null; });
  overlay.append(button);
  return button;
});

const currentCopy = () => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'];
const hasSvga = () => assets.frame.some(asset => asset?.animation);

function sync() {
  const strings = currentCopy();
  for (const label of labels) {
    if (label !== reviewDownload) label.textContent = strings[label.dataset.giftAvatarText];
  }
  const replaced = assets[mode].filter(Boolean).length;
  count.textContent = `${replaced} / ${seats.length}`;
  batch.disabled = busy;
  download.disabled = busy || !Object.values(assets).some(layer => layer.some(Boolean));
  reviewDownload.disabled = busy;
  reviewDownload.textContent = hasSvga() ? strings.reviewVideoExport : strings.reviewExport;
  reviewDownload.setAttribute('aria-busy', String(notice?.key === 'renderingReviewVideo' || notice?.key === 'renderingReview'));
  for (const [key, button] of Object.entries(modes)) {
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(mode === key));
  }
  batchInput.accept = singleInput.accept = mode === 'frame' ? 'image/png,image/webp,.png,.webp,.svga' : 'image/webp,.webp';
  overlay.setAttribute('aria-busy', String(busy));
  seats.forEach((seat, index) => {
    seat.disabled = busy;
    const label = strings.seat(index + 1, assets[mode][index]?.name, mode);
    seat.setAttribute('aria-label', label);
    seat.title = label;
    seat.querySelector('.gift-avatar-replace-cue').textContent = mode === 'photo' ? strings.photoMode : strings.replaceCue;
  });
  syncNotice(strings);
}

function syncNotice(strings = currentCopy()) {
  status.dataset.tone = notice?.tone ?? '';
  const message = strings[notice?.key];
  status.textContent = notice?.key === 'invalid'
    ? strings.invalid(notice.name, strings[notice.reason] ?? strings.encode)
    : typeof message === 'function' ? message(notice.count) : message ?? '';
}

const isSvga = file => /\.svga$/i.test(file.name);

async function prepareAsset(file, type, animated) {
  if (animated) {
    const {prepareSeatSvga} = await import('./gift-avatar-svga.mjs?v=20261111-seat-review1');
    const animation = await prepareSeatSvga(file);
    const element = document.createElement('span');
    element.className = 'gift-avatar-frame-image';
    element.setAttribute('aria-hidden', 'true');
    element.append(animation.element);
    return {animation, element, image: animation.canvas, name: file.name};
  }
  const blob = await (type === 'frame' ? prepareGiftAvatarFrame(file) : prepareGiftAvatar(file));
  const image = document.createElement('img');
  const url = URL.createObjectURL(blob);
  image.src = url;
  image.alt = '';
  image.draggable = false;
  image.className = type === 'photo' ? 'gift-avatar-photo' : 'gift-avatar-frame-image';
  return {blob, element: image, image, url, name: file.name};
}

function disposeAsset(asset) {
  if (asset.animation) asset.animation.dispose();
  else URL.revokeObjectURL(asset.url);
}

function replaceSeat(index, asset, type) {
  const previous = assets[type][index];
  assets[type][index] = asset;
  if (previous) {
    previous.element.replaceWith(asset.element);
    disposeAsset(previous);
  } else {
    seats[index].append(asset.element);
  }
  if (type === 'frame') seats[index].classList.add('has-frame');
}

async function loadFiles(files, firstSeat, trigger) {
  if (busy || !files.length) return;
  if (files.length > seats.length) {
    notice = {key: 'tooMany', count: seats.length, tone: 'error'};
    sync();
    return;
  }
  const prepared = [];
  const selectedMode = mode;
  busy = true;
  notice = {key: 'processing'};
  sync();
  let activeFile;
  let type;
  let animated;
  try {
    // Validate and process the whole batch before replacing any existing seat.
    // Keeping one image decode in flight also bounds memory on mobile.
    for (const file of files) {
      activeFile = file;
      animated = isSvga(file);
      type = animated ? 'frame' : selectedMode;
      const asset = await prepareAsset(file, type, animated);
      prepared.push({asset, type});
    }
    prepared.forEach(({asset, type}, i) => replaceSeat(firstSeat + i, asset, type));
    if (prepared.every(({asset}) => asset.animation)) mode = 'frame';
    notice = {key: 'replaced', count: prepared.length};
  } catch (error) {
    for (const {asset} of prepared) disposeAsset(asset);
    let reason = error?.code;
    if (animated) reason = reason === 'size' ? 'svgaSize' : 'svgaDecode';
    else if (type === 'frame' && reason === 'type') reason = 'frameType';
    notice = {key: 'invalid', name: activeFile.name, reason, tone: 'error'};
  } finally {
    busy = false;
    sync();
    syncPlayback();
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

function setMoveTarget(index) {
  if (index === frameMove.from) index = null;
  if (frameMove.target === index) return;
  if (frameMove.target !== null) delete seats[frameMove.target].dataset.moveTarget;
  frameMove.target = index;
  if (index !== null) seats[index].dataset.moveTarget = 'true';
}

function startFrameDrag() {
  const {from} = frameMove;
  const {element, image, animation} = assets.frame[from];
  const ghost = document.createElement('canvas');
  ghost.width = ghost.height = 240;
  ghost.className = 'gift-avatar-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = ghost.style.height = getComputedStyle(element).width;
  if (animation || image.naturalWidth) ghost.getContext('2d').drawImage(image, 0, 0, 240, 240);
  document.body.append(ghost);
  frameMove.ghost = ghost;
  seats[from].dataset.moving = 'true';
  suppressSeatClick = true;
}

function finishFrameDrag(destination = null) {
  if (!frameMove) return;
  const {from, target, ghost} = frameMove;
  frameMove = null;
  if (!ghost) return;
  ghost.remove();
  delete seats[from].dataset.moving;
  if (target !== null) delete seats[target].dataset.moveTarget;
  if (busy || destination === null || destination === from) return;

  const frame = assets.frame[from];
  const other = assets.frame[destination];
  assets.frame[from] = other;
  assets.frame[destination] = frame;
  seats[destination].append(frame.element);
  if (other) seats[from].append(other.element);
  seats[from].classList.toggle('has-frame', Boolean(other));
  seats[destination].classList.add('has-frame');
  notice = {key: other ? 'framesSwapped' : 'frameMoved'};
  sync();
  syncPlayback();
  seats[destination].focus({preventScroll: true});
}

overlay.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  // A drag can still dispatch a click on its source button. A new
  // pointer gesture clears that suppression, even after canceling a drag.
  suppressSeatClick = false;
  if (busy || frameMove) return;
  const from = seatIndex(event.target);
  if (from === null || !assets.frame[from]) return;
  frameMove = {from, pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: null, ghost: null};
});
window.addEventListener('pointermove', event => {
  if (frameMove?.pointerId !== event.pointerId) return;
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
    finishFrameDrag();
    return;
  }
  if (!frameMove.ghost) {
    if (busy || Math.hypot(event.clientX - frameMove.x, event.clientY - frameMove.y) < 6) return;
    startFrameDrag();
  }
  event.preventDefault();
  frameMove.ghost.style.left = `${event.clientX}px`;
  frameMove.ghost.style.top = `${event.clientY}px`;
  setMoveTarget(seatIndex(document.elementFromPoint(event.clientX, event.clientY)));
});
window.addEventListener('pointerup', event => {
  if (frameMove?.pointerId !== event.pointerId) return;
  finishFrameDrag(seatIndex(document.elementFromPoint(event.clientX, event.clientY)));
});
window.addEventListener('pointercancel', event => {
  if (frameMove?.pointerId === event.pointerId) finishFrameDrag();
});
window.addEventListener('pointerout', event => {
  if (frameMove?.pointerId === event.pointerId && event.pointerType === 'mouse' && !event.relatedTarget) finishFrameDrag();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && frameMove?.ghost) {
    event.preventDefault();
    finishFrameDrag();
  }
});

function loadTransferredFiles(files, target) {
  if (files.length !== 1) {
    void loadFiles(files, 0, batch);
    return;
  }
  const vacancy = assets[isSvga(files[0]) ? 'frame' : mode].findIndex(asset => !asset);
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
window.addEventListener('blur', () => {
  clearDragTarget();
  finishFrameDrag();
});
window.UploadPaste?.register({
  zone: preview,
  isActive: () => location.hash === '#avatar-frames' && !preview.hidden,
  isBusy: () => busy,
  onFiles: files => loadTransferredFiles(files, seatIndex(document.activeElement) ?? hoveredSeat)
});

function syncPlayback() {
  const active = !preview.hidden && location.hash === '#avatar-frames' && !document.hidden && !reducedMotion.matches;
  if (!active) {
    hoveredSeat = null;
    clearDragTarget();
    if (preview.hidden || location.hash !== '#avatar-frames' || document.hidden) finishFrameDrag();
  }
  assets.frame.forEach((asset, index) => {
    if (!asset?.animation) return;
    if (active && visibleSeats.has(index)) asset.animation.play();
    else asset.animation.pause();
  });
}

const seatVisibility = new IntersectionObserver(entries => {
  for (const {target, isIntersecting} of entries) {
    const index = Number(target.dataset.seatIndex);
    if (isIntersecting) visibleSeats.add(index);
    else visibleSeats.delete(index);
  }
  syncPlayback();
});
seats.forEach(seat => seatVisibility.observe(seat));
new MutationObserver(syncPlayback).observe(preview, {attributes: true, attributeFilter: ['hidden']});
window.addEventListener('hashchange', syncPlayback);
document.addEventListener('visibilitychange', syncPlayback);
reducedMotion.addEventListener('change', syncPlayback);

// Freeze every active frame at click time, before any image decoding or encoding.
function captureSvgaFrames() {
  const snapshots = new Map();
  for (const asset of assets.frame) {
    if (!asset?.animation) continue;
    const canvas = document.createElement('canvas');
    canvas.width = asset.image.width;
    canvas.height = asset.image.height;
    canvas.getContext('2d').drawImage(asset.image, 0, 0);
    snapshots.set(asset, canvas);
  }
  return snapshots;
}

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
    const snapshots = captureSvgaFrames();
    const zip = new window.JSZip();
    let packed = 0;
    for (const [type, layer] of Object.entries(assets)) {
      const prefix = type === 'photo' ? 'avatar' : 'frame';
      for (const [index, asset] of layer.entries()) {
        if (!asset) continue;
        const blob = asset.blob ?? await window.canvasToLosslessWebP(snapshots.get(asset));
        zip.file(`${prefix}-${String(index + 1).padStart(2, '0')}.webp`, blob);
        packed++;
      }
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

function drawReviewBase(ctx, {plate, rim, rimWidth, frameScale}) {
  ctx.drawImage(room, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.lineWidth = rimWidth;
  ctx.strokeStyle = rim;
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
    ctx.arc(x, y, radius - rimWidth / 2, 0, 2 * Math.PI);
    ctx.stroke();
    const frame = assets.frame[index];
    if (frame && !frame.animation) {
      const diameter = size * frameScale;
      ctx.drawImage(frame.image, x - diameter / 2, y - diameter / 2, diameter, diameter);
    }
  });
}

reviewDownload.addEventListener('click', async () => {
  if (busy) return;
  const video = hasSvga();
  const job = new AbortController();
  reviewJob = job;
  busy = true;
  notice = {key: video ? 'renderingReviewVideo' : 'renderingReview', count: 0};
  sync();
  const base = document.createElement('canvas');
  let output;
  try {
    const stills = Object.values(assets).flat().filter(asset => asset?.blob);
    await Promise.all([room.decode(), ...stills.map(({image}) => image.decode())]);
    job.signal.throwIfAborted();
    base.width = room.naturalWidth;
    base.height = room.naturalHeight;
    const style = getComputedStyle(room.parentElement);
    const frameScale = Number(style.getPropertyValue('--gift-avatar-frame-scale'));
    drawReviewBase(base.getContext('2d'), {
      plate: style.getPropertyValue('--gift-avatar-plate').trim(),
      rim: style.getPropertyValue('--gift-avatar-frame').trim(),
      rimWidth: Number(style.getPropertyValue('--gift-avatar-frame-size')),
      frameScale
    });
    const filename = `gift-room-review-${base.width}x${base.height}`;
    if (video) {
      const {encodeAvatarReviewVideo} = await import('./gift-avatar-review-video.mjs?v=20261111-seat-review1');
      output = document.createElement('canvas');
      output.width = base.width;
      output.height = base.height;
      const ctx = output.getContext('2d', {alpha: false});
      ctx.imageSmoothingQuality = 'high';
      const animatedFrames = assets.frame.flatMap((frame, index) => {
        if (!frame?.animation) return [];
        const {x, y, size} = GIFT_AVATAR_SEATS[index];
        const diameter = size * frameScale;
        return [{animation: frame.animation, x: x - diameter / 2, y: y - diameter / 2, diameter}];
      });
      const {blob, extension} = await encodeAvatarReviewVideo(output, time => {
        ctx.drawImage(base, 0, 0);
        for (const {animation, x, y, diameter} of animatedFrames) {
          animation.drawAt(time, frame => ctx.drawImage(frame, x, y, diameter, diameter));
        }
      }, progress => {
        const percent = Math.floor(progress * 100);
        // Announce progress in coarse increments to avoid interrupting the user.
        if (percent >= notice.count + 10 || percent === 100) {
          notice.count = percent;
          syncNotice();
        }
      }, {signal: job.signal});
      downloadFile(blob, `${filename}-6s.${extension}`);
    } else {
      const blob = await window.canvasToLosslessWebP(base);
      job.signal.throwIfAborted();
      downloadFile(blob, `${filename}.webp`);
    }
    notice = {key: video ? 'downloadedReviewVideo' : 'downloadedReview'};
    window.Hub?.record('avatar', 'generated');
    window.Hub?.record('avatar', 'download');
  } catch (error) {
    let key = 'reviewError';
    if (video) key = error?.code === 'unsupported' ? 'reviewVideoUnsupported' : 'reviewVideoError';
    notice = job.signal.aborted ? null : {key, tone: 'error'};
  } finally {
    reviewJob = null;
    base.width = base.height = 1;
    if (output) output.width = output.height = 1;
    busy = false;
    sync();
    if (document.activeElement === document.body && !preview.hidden) reviewDownload.focus({preventScroll: true});
  }
});

new MutationObserver(sync).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
window.addEventListener('pagehide', event => {
  finishFrameDrag();
  reviewJob?.abort();
  for (const asset of Object.values(assets).flat()) {
    if (!asset) continue;
    if (event.persisted) asset.animation?.pause();
    else disposeAsset(asset);
  }
});
window.addEventListener('pageshow', syncPlayback);
sync();
