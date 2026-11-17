import {prepareProfileArtwork} from './gift-avatar-image.mjs?v=20261111-profile2';
import {bindPreviewSlotDrag} from './preview-slot-drag.mjs?v=20261111-profile1';

const copy = {
  zh: {
    productionTab: '预览图生产', deviceTab: '座驾/勋章预览', medalTab: '勋章预览', giftTab: '礼物预览',
    projects: '选择项目', select: '选择',
    pendingTemplate: '模板待提供',
    gift: '礼物', giftReviewExport: '下载礼物栏预览图',
    medalReviewExport: '下载勋章页预览图', smallMedal: '小图', largeMedal: '大图',
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
    productionTab: 'Create preview', deviceTab: 'Vehicles / Medals', medalTab: 'Medal preview', giftTab: 'Gift preview',
    projects: 'Choose a project', select: 'Select',
    pendingTemplate: 'Template pending',
    gift: 'Gifts', giftReviewExport: 'Download gift tray preview',
    medalReviewExport: 'Download medal page preview', smallMedal: 'Small', largeMedal: 'Large',
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
const projectBar = byId('profileProjectBar');
const projectCatalog = byId('profileProjectCatalog');
const pendingNotice = byId('profileProjectPending');
const pendingName = byId('profilePendingName');
const workspaces = root.querySelectorAll('.profile-workspace');
const projects = [
  {id: 'hapi-ludo', name: 'Hapi Ludo'},
  {id: 'hapi', name: 'Hapi'},
  {id: 'yari', name: 'Yari', pending: true},
  {id: '4fun', name: '4Fun', pending: true}
];
const placements = Object.fromEntries(projects.filter(project => !project.pending).map(({id}) => [id, new Map()]));
const loadingSlots = new Set();
const defaultMedal = 'assets/profile-preview/medal-default.webp?v=20261111-profile1';
let medalUploadInProgress = false;
let currentProject;
let activeTab = 0;
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

function mountPreview(device, prefix, scenes) {
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
  const stage = control('Stage');
  const backdrop = stage.querySelector('.profile-stage-background');
  const sharedMedals = scenes['hapi-ludo'].layout.some(item => item.kind === 'medal');
  let project, scene, mode, backgroundPatches;
  let busy = false;
  let notice = null;
  let pickedSlot = null;
  let hoveredSlot = null;
  let fileDropTarget = null;
  let spriteImage;
  const isBusy = () => busy || (sharedMedals && medalUploadInProgress);
  const views = [];
  const buttons = [];
  const slots = [];
  function addView(slot, {x, y, width, height, column, row, size}) {
    const {screen, largeMedals, sprite, columns, layout, defaultArtwork, smallArtwork} = scene;
    const index = views.length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-slot';
    button.dataset.slotIndex = String(largeMedals ? slot.number - 1 : index);
    button.dataset.viewIndex = String(index);
    button.dataset.type = slot.kind;
    if (size) button.dataset.size = size;
    button.style.setProperty('--slot-x', `${x / screen.width * 100}%`);
    button.style.setProperty('--slot-y', `${y / screen.height * 100}%`);
    button.style.setProperty('--slot-w', `${width / screen.width * 100}%`);
    button.style.setProperty('--slot-h', `${height / screen.height * 100}%`);
    let fallback = null;
    if (sprite) {
      fallback = document.createElement('span');
      fallback.className = 'profile-slot-art profile-slot-fallback';
      fallback.style.backgroundPosition = `${column * 100 / (columns.length - 1)}% ${row * 100 / (layout.length - 1)}%`;
    } else {
      const sources = size === 'smallMedal' && smallArtwork ? smallArtwork : defaultArtwork?.[slot.kind];
      const src = Array.isArray(sources) ? sources[slot.number - 1] : sources;
      if (src) fallback = artwork(src, true);
    }
    const cue = document.createElement('span');
    cue.className = 'profile-slot-replace';
    cue.setAttribute('aria-hidden', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'ft-spinner profile-slot-spinner';
    spinner.dataset.ftRunning = 'true';
    spinner.setAttribute('aria-hidden', 'true');
    if (fallback) button.append(fallback);
    button.append(cue);
    button.addEventListener('click', event => {
      if (slotDrag.consumeClick(event)) return;
      selectMode(slot.kind);
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
    buttons.push(button);
    views.push({slot, x, y, width, height, column, row, size, button, fallback, cue, spinner, element: fallback, shownAsset: null});
  }

  const active = () => location.hash === '#gift-previews' && !device.hidden && !currentProject?.pending;

  function slotAt(node) {
    const button = node?.closest?.('.profile-slot');
    return button && overlay.contains(button) ? Number(button.dataset.viewIndex) : null;
  }

  function sync() {
    const strings = stringsForPage();
    const blocked = isBusy() || Boolean(currentProject.pending);
    const category = slots.filter(slot => slot.kind === mode);
    const placed = category.filter(slot => slot.asset).length;
    count.textContent = `${placed} / ${category.length}`;
    upload.disabled = blocked;
    download.disabled = blocked || placed === 0;
    download.textContent = strings.export(strings[mode]) + (mode === 'gift' ? ' · ZIP' : '');
    reviewDownload.disabled = blocked;
    reviewDownload.textContent = scene.largeMedals ? strings.medalReviewExport : mode === 'gift' ? strings.giftReviewExport : strings.reviewExport;
    exportSize.textContent = strings.outputSize(outputSides[mode]);
    overlay.setAttribute('aria-busy', String(blocked));
    for (const [kind, button] of Object.entries(modes)) {
      button.disabled = blocked;
      button.setAttribute('aria-pressed', String(kind === mode));
    }
    for (const view of views) {
      const {slot, size, button, cue, spinner} = view;
      const title = strings.seat(strings[slot.kind], slot.number) + (size ? ` · ${strings[size]}` : '');
      button.disabled = blocked;
      button.setAttribute('aria-label', title);
      button.title = title;
      cue.textContent = strings.replace;
      if (slot.asset !== view.shownAsset) {
        view.shownAsset = slot.asset;
        view.element = slot.asset?.image.cloneNode() ?? view.fallback;
        button.replaceChildren(...(view.element ? [view.element, cue] : [cue]));
        button.classList.toggle('has-upload', Boolean(slot.asset));
      }
      if (loadingSlots.has(slot)) {
        if (spinner.parentElement !== button) button.append(spinner);
      } else spinner.remove();
    }
    status.dataset.tone = notice?.tone ?? '';
    const message = strings[notice?.key];
    const statusText = typeof message === 'function' ? message(notice.value) : message ?? '';
    if (status.textContent !== statusText) status.textContent = statusText;
    syncProjectCards();
  }

  function selectMode(kind) {
    mode = kind;
    notice = null;
    sync();
  }

  const slotDrag = bindPreviewSlotDrag({
    overlay,
    buttons,
    slotAt,
    assetAt: index => views[index].slot.asset && {element: views[index].element, image: views[index].element},
    isBusy,
    canMove: (from, to) => views[from].slot !== views[to].slot && views[from].slot.kind === views[to].slot.kind,
    ghostClass: 'profile-drag-ghost',
    move(from, to) {
      const source = views[from].slot, target = views[to].slot;
      const other = target.asset;
      target.asset = source.asset;
      source.asset = other;
      mode = target.kind;
      notice = {key: other ? 'swapped' : 'moved'};
      sync();
    }
  });

  async function loadFiles(files, {target = null, firstVacant = false} = {}) {
    if (currentProject.pending || isBusy() || !files.length) return;
    const targetView = target === null ? null : views[target];
    if (targetView) mode = targetView.slot.kind;
    const category = slots.filter(slot => slot.kind === mode);
    if (files.length > category.length) {
      notice = {key: 'tooMany', value: category.length, tone: 'error'};
      sync();
      return;
    }
    const destinations = files.length === 1 && targetView ? [targetView.slot]
      : files.length === 1 && firstVacant ? [category.find(slot => !slot.asset) ?? category[0]]
      : category;
    const trigger = targetView?.button ?? upload;
    const loadingMedals = mode === 'medal';
    const syncUpload = loadingMedals ? () => previews.forEach(preview => preview.sync()) : sync;
    if (loadingMedals) medalUploadInProgress = true;
    busy = true;
    notice = {key: 'processing'};
    syncUpload();
    const prepared = [];
    let activeFile, activeSlot, visibleSlot;
    function showLoading(slot) {
      loadingSlots.delete(visibleSlot);
      loadingSlots.add(slot);
      visibleSlot = slot;
      syncUpload();
    }
    const progress = window.UploadProgress?.begin(files.length, {onVisible: () => showLoading(activeSlot)});
    try {
      // Prepare the entire batch before replacing existing placements.
      for (const [index, file] of files.entries()) {
        activeFile = file;
        activeSlot = destinations[index];
        if (visibleSlot) showLoading(activeSlot);
        const blob = await prepareProfileArtwork(file, outputSides[mode]);
        const url = URL.createObjectURL(blob);
        const image = artwork(url);
        prepared.push({image, url, blob, sourceName: file.name});
        progress?.advance();
      }
      prepared.forEach((asset, index) => {
        const slot = destinations[index];
        if (slot.asset) URL.revokeObjectURL(slot.asset.url);
        slot.asset = asset;
      });
      notice = {key: 'loaded', value: prepared.length};
    } catch (error) {
      for (const asset of prepared) URL.revokeObjectURL(asset.url);
      const key = ['type', 'size', 'animated'].includes(error?.code) ? error.code : 'invalid';
      notice = {key, value: activeFile.name, tone: 'error'};
    } finally {
      progress?.finish();
      loadingSlots.delete(visibleSlot);
      busy = false;
      if (loadingMedals) medalUploadInProgress = false;
      syncUpload();
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
    if (isBusy() || !selected.length) return;
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
    if (isBusy()) return;
    busy = true;
    notice = {key: 'renderingReview'};
    sync();
    const canvas = document.createElement('canvas');
    const {screen, sprite, clipY = screen.height, largeMedals} = scene;
    try {
      // Include the entire screen, even rows below the visible page fold.
      if (sprite && !spriteImage) spriteImage = artwork(sprite);
      const images = views.map(view => view.slot.asset?.image ?? spriteImage ?? view.fallback);
      const artworkImages = [...new Set(images.filter(Boolean))];
      for (const image of artworkImages) image.loading = 'eager';
      await Promise.all([backdrop.decode(), ...artworkImages.map(image => image.decode())]);
      const style = getComputedStyle(overlay);
      const widthRatio = parseFloat(style.getPropertyValue('--profile-art-width')) / 100;
      const heightRatio = parseFloat(style.getPropertyValue('--profile-art-height')) / 100;
      const liftRatio = parseFloat(style.getPropertyValue('--profile-art-lift')) / 100;
      const defaultOpacity = slots.some(slot => slot.asset)
        ? parseFloat(style.getPropertyValue('--profile-default-opacity')) : 1;
      canvas.width = screen.width;
      canvas.height = screen.height;
      const context = canvas.getContext('2d');
      context.drawImage(backdrop, 0, 0, screen.width, screen.height);
      for (const {x, y, width, height, sourceX, sourceWidth = width} of backgroundPatches) {
        context.drawImage(backdrop, sourceX, y, sourceWidth, height, x, y, width, height);
      }
      context.imageSmoothingQuality = 'high';
      if (clipY < screen.height) {
        context.beginPath();
        context.rect(0, 0, screen.width, clipY);
        context.clip();
      }
      views.forEach((view, index) => {
        const {slot, x, y, width: boxWidth, height: boxHeight, column, row} = view;
        const image = images[index];
        if (!image) return;
        const artWidth = boxWidth * widthRatio;
        const artHeight = boxHeight * heightRatio;
        context.globalAlpha = slot.asset ? 1 : defaultOpacity;
        if (image === spriteImage) {
          context.drawImage(image, column * boxWidth, row * boxHeight, boxWidth, boxHeight,
            x, y, artWidth, artHeight);
          return;
        }
        const scale = Math.min(artWidth / image.naturalWidth, artHeight / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, x + (boxWidth - width) / 2,
          y + (boxHeight - height - boxWidth * liftRatio) / 2, width, height);
      });
      const blob = await window.canvasToLosslessWebP(canvas);
      const name = largeMedals ? 'medal-page' : mode === 'gift' ? 'gift-tray' : 'profile';
      downloadBlob(blob, `${project === 'hapi' ? 'hapi-' : ''}${name}-review-${screen.width}x${screen.height}.webp`);
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
    if (fileDropTarget !== null) delete views[fileDropTarget].button.dataset.dragging;
    fileDropTarget = null;
  }

  device.addEventListener('dragover', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    const canDrop = active() && !isBusy();
    event.dataTransfer.dropEffect = canDrop ? 'copy' : 'none';
    if (!canDrop) return;
    const target = slotAt(event.target);
    if (target !== fileDropTarget) clearFileDrop();
    device.dataset.dragging = 'true';
    fileDropTarget = target;
    if (target !== null) views[target].button.dataset.dragging = 'true';
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
    isBusy,
    onFiles: files => loadFiles(files, {target: slotAt(document.activeElement) ?? hoveredSlot, firstVacant: true})
  });

  function deactivate() {
    hoveredSlot = null;
    clearFileDrop();
    slotDrag.cancel();
  }

  window.addEventListener('hashchange', () => { if (!active()) deactivate(); });
  window.addEventListener('blur', clearFileDrop);
  window.addEventListener('pagehide', deactivate);

  function setProject(next) {
    deactivate();
    project = next;
    scene = scenes[project];
    const {background, screen, card, layout, columns, sprite, largeMedals, maskSource, cardPatches = [],
      clipY = screen.height} = scene;
    if (!mode || !layout.some(item => item.kind === mode)) mode = layout[0].kind;
    pickedSlot = null;
    notice = null;
    spriteImage = null;
    overlay.replaceChildren();
    slots.length = views.length = buttons.length = 0;
    backdrop.src = background;
    backdrop.width = screen.width;
    backdrop.height = screen.height;
    stage.style.aspectRatio = `${screen.width}/${screen.height}`;
    overlay.dataset.project = project;
    overlay.style.setProperty('--profile-default-sprite', sprite ? `url("${sprite}")` : 'none');
    overlay.style.setProperty('--profile-slot-clip-bottom', `${(screen.height - clipY) / screen.height * 100}%`);

    backgroundPatches = [...cardPatches];
    if (maskSource) {
      backgroundPatches.push({...maskSource, x: columns[0], y: layout[0].y,
        width: columns.at(-1) + card.width - columns[0], height: card.height});
    }
    for (const {x, y, width, height, sourceX, sourceWidth = width} of backgroundPatches) {
      const patch = document.createElement('div');
      patch.className = 'profile-background-patch';
      Object.assign(patch.style, {
        left: `${x / screen.width * 100}%`,
        top: `${y / screen.height * 100}%`,
        width: `${width / screen.width * 100}%`,
        height: `${height / screen.height * 100}%`,
        backgroundImage: `url("${background}")`,
        backgroundSize: `${screen.width / sourceWidth * 100}% ${screen.height / height * 100}%`,
        backgroundPosition: `${sourceX / (screen.width - sourceWidth) * 100}% ${y / (screen.height - height) * 100}%`
      });
      overlay.append(patch);
    }

    const counts = {};
    layout.forEach(({kind, y, columns: rowColumns = columns, card: rowCard = card}, row) => {
      rowColumns.forEach((x, column) => {
        const number = counts[kind] = (counts[kind] ?? 0) + 1;
        const key = `${kind}-${number}`;
        const saved = placements[project];
        if (!saved.has(key)) saved.set(key, {kind, number, asset: null});
        const slot = saved.get(key);
        addView(slot, {x, y, ...rowCard, column, row, size: largeMedals ? 'smallMedal' : null});
        slots.push(slot);
      });
    });
    if (largeMedals) {
      const {side, centers} = largeMedals;
      centers.forEach(([x, y], index) => addView(slots[index], {
        x: x - side / 2, y: y - side / 2, width: side, height: side, size: 'largeMedal'
      }));
    }
    sync();
  }
  return {sync, deactivate, isBusy, setProject};
}

const previews = [
  mountPreview(byId('profileDevice'), 'profile', {
    'hapi-ludo': {
      background: 'assets/profile-preview/profile-main.webp',
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
        medal: defaultMedal,
        vehicle: 'assets/profile-preview/vehicle-default.webp?v=20261111-profile1'
      }
    },
    hapi: {
      background: 'assets/profile-preview/hapi-profile.webp',
      screen: {width: 800, height: 1697},
      card: {width: 164, height: 164},
      columns: [28, 223, 411, 607],
      layout: [
        {kind: 'medal', y: 1375, columns: [29, 223, 412, 607]},
        {kind: 'vehicle', y: 483},
        {kind: 'vehicle', y: 768, columns: [28]}
      ],
      defaultArtwork: {
        medal: ['01', '02', '03', '04'].map(number => `assets/profile-preview/hapi-profile-medal-${number}.webp`)
      }
    }
  }),
  mountPreview(byId('profileMedalPage'), 'medalPage', {
    'hapi-ludo': {
      background: 'assets/profile-preview/medal-page.webp',
      screen: {width: 720, height: 1754},
      card: {width: 112, height: 112},
      columns: [40, 172, 304, 436],
      layout: [{kind: 'medal', y: 246}],
      largeMedals: {
        side: 230,
        centers: [[192, 905], [536, 905], [192, 1295], [536, 1295]]
      },
      maskSource: {sourceX: 550, sourceWidth: 10},
      cardPatches: [
        {x: 26, y: 756, width: 332, height: 382, sourceX: 370},
        {x: 370, y: 1146, width: 332, height: 382, sourceX: 26}
      ],
      defaultArtwork: {medal: defaultMedal}
    },
    hapi: {
      background: 'assets/profile-preview/hapi-medal-page.webp',
      screen: {width: 800, height: 1788},
      card: {width: 124, height: 124},
      columns: [44, 191, 339, 485],
      layout: [{kind: 'medal', y: 263}],
      largeMedals: {
        side: 280,
        centers: [[210, 937], [592, 937], [210, 1418], [592, 1418]]
      },
      smallArtwork: 'assets/profile-preview/hapi-medal-plus.webp'
    }
  }),
  mountPreview(byId('profileGift'), 'giftTray', {
    'hapi-ludo': {
      background: 'assets/profile-preview/gift-tray.webp',
      screen: {width: 720, height: 1620},
      card: {width: 130, height: 130},
      columns: [27, 202, 380, 556],
      layout: [1000, 1206, 1413].map(y => ({kind: 'gift', y})),
      sprite: 'assets/profile-preview/gift-defaults.webp',
      clipY: 1512
    },
    hapi: {
      background: 'assets/profile-preview/hapi-gift-tray.webp',
      screen: {width: 800, height: 1697},
      card: {width: 130, height: 130},
      columns: [48, 238, 429, 625],
      layout: [1076, 1320].map(y => ({kind: 'gift', y}))
    }
  })
];

function syncProjectCards() {
  const blocked = previews.some(preview => preview.isBusy());
  for (const button of projectCatalog.children) {
    button.disabled = blocked;
    button.setAttribute('aria-pressed', String(button.dataset.project === currentProject.id));
  }
}

function syncProjectView() {
  const pending = Boolean(currentProject.pending);
  for (const workspace of workspaces) workspace.hidden = pending;
  const showPending = pending && activeTab > 0;
  if (showPending) {
    pendingName.textContent = currentProject.name;
    const panel = panels[activeTab];
    if (pendingNotice.parentElement !== panel) panel.append(pendingNotice);
  }
  pendingNotice.hidden = !showPending;
}

function selectProject(project) {
  if (project === currentProject || previews.some(preview => preview.isBusy())) return;
  currentProject = project;
  syncProjectView();
  for (const preview of previews) {
    if (project.pending) {
      preview.deactivate();
      preview.sync();
    } else {
      preview.setProject(project.id);
    }
  }
}
window.ProjectSelector.render(projectCatalog, projects, {onSelect: selectProject, selectedId: projects[0].id});
selectProject(projects[0]);

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  for (const project of Object.values(placements)) {
    for (const {asset} of project.values()) if (asset) URL.revokeObjectURL(asset.url);
  }
});

function selectTab(index) {
  activeTab = index;
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[i].hidden = !selected;
  });
  projectBar.hidden = index === 0;
  syncProjectView();
  previews.forEach((preview, i) => {
    if (i + 1 === index && !currentProject.pending) preview.sync();
    else preview.deactivate();
  });
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
  projectCatalog.setAttribute('aria-label', strings.projects);
  for (const {id, name} of projects) {
    projectCatalog.querySelector(`[data-project="${id}"]`).setAttribute('aria-label', `${strings.select} ${name}`);
  }
  for (const preview of previews) preview.sync();
}
new MutationObserver(syncLanguage).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
syncLanguage();
