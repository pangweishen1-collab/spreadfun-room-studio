import {diceFilePath, readDropFiles} from '../dice/upload-input.mjs';
import {makeTokenZip, prepareToken, tokenFileKey, tokenPackageName, TOKEN_TRAIL_KEYS} from './engine.mjs?v=20261111-token4';
import {
  createTokenRenderer, recordTokenVideo, TOKEN_ROUND_SECONDS
} from './renderer.mjs?v=20261111-token5';

const copy = {
  zh: {
    drop: '拖入四色棋子 PNG', sizes: '红、绿、蓝、黄各一张 160 × 160 PNG。可加 240 × 240 封面。',
    materials: {green: '绿色棋子素材', purple: '紫色棋子素材'}, choose: '选择 PNG', folder: '选择文件夹',
    examples: '体验案例', exampleRose: '体验玫瑰', exampleAnubis: '体验阿努比斯',
    grade: '棋子等级', gradeGreen: '绿色', gradePurple: '紫色',
    trail: '拖尾素材', trailChoose: '更换拖尾 PNG', trailReset: '恢复默认', trailDefault: '默认火焰',
    trailScope: '替换范围', trailAll: '全部颜色', trailPaste: '点此区域后按 ⌘V / Ctrl+V 粘贴 PNG',
    trailVariants: count => `已替换 ${count} 张拖尾图`, oneTrail: '请选择一张拖尾 PNG。',
    exampleFailed: '样例加载失败，请重试。',
    assetDetails: '查看已选素材', coverDownload: '下载封面 PNG', name: '资源名称', placeholder: {green: '例如 rose', purple: '例如 anubis'}, color: '棋子颜色',
    action: '棋子动作', jump: '跳跃', kill: '吃子', bekill: '被吃', boom: '被炸',
    red: '红', green: '绿', blue: '蓝', yellow: '黄', cover: '封面',
    replay: '重播动作', pause: '暂停跳动', resume: '继续跳动',
    sound: '播放音效', video: '生成并下载视频', bundle: '打包下载 ZIP',
    preview: '棋盘动画预览', importing: '正在准备棋子预览…', noFiles: '未找到棋子 PNG，请检查文件名。',
    missing: names => `还需要 ${names}色棋子图。`, duplicate: name => `有重复素材，请只保留一张 ${name}。`,
    ready: '预览已就绪。', generating: '正在生成预览视频…', packing: '正在打包…',
    saved: '已发起下载。', failed: '处理失败，请检查素材或重试。', cancelled: '已取消生成视频。'
  },
  en: {
    drop: 'Drop four token PNGs', sizes: 'One 160 × 160 PNG per color. A 240 × 240 cover is optional.',
    materials: {green: 'Green token assets', purple: 'Purple token assets'}, choose: 'Choose PNGs', folder: 'Choose folder',
    examples: 'Playable examples', exampleRose: 'Try Rose', exampleAnubis: 'Try Anubis',
    grade: 'Token grade', gradeGreen: 'Green', gradePurple: 'Purple',
    trail: 'Trail artwork', trailChoose: 'Replace trail PNG', trailReset: 'Restore default', trailDefault: 'Default flames',
    trailScope: 'Apply to', trailAll: 'All colors', trailPaste: 'Focus here and press ⌘V / Ctrl+V to paste a PNG',
    trailVariants: count => `${count} custom trail images`, oneTrail: 'Choose one trail PNG.',
    exampleFailed: 'Could not load the example. Try again.',
    assetDetails: 'View selected assets', coverDownload: 'Download cover PNG', name: 'Asset name', placeholder: {green: 'e.g. rose', purple: 'e.g. anubis'}, color: 'Token color',
    action: 'Token action', jump: 'Jump', kill: 'Capture', bekill: 'Captured', boom: 'Bombed',
    red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow', cover: 'Cover',
    replay: 'Replay action', pause: 'Pause hopping', resume: 'Resume hopping',
    sound: 'Play sound', video: 'Generate and download video', bundle: 'Download ZIP',
    preview: 'Animated board preview', importing: 'Preparing token preview…', noFiles: 'No token PNGs found. Check the file names.',
    missing: names => `Still needed: ${names}.`, duplicate: name => `Keep only one ${name} file.`,
    ready: 'Preview ready.', generating: 'Generating the review video…', packing: 'Creating ZIP…',
    saved: 'Download started.', failed: 'Could not process the assets. Check your files and try again.', cancelled: 'Video export cancelled.'
  }
};

const $ = name => document.getElementById('token' + name);
const root = $('Tool');
const labels = root.querySelectorAll('[data-token-text]');
const gradeButtons = [...root.querySelectorAll('[data-token-grade]')];
const exampleButtons = [...root.querySelectorAll('[data-token-sample]')];
const colorButtons = [...root.querySelectorAll('[data-token-color]')];
const actionButtons = [...root.querySelectorAll('[data-token-action]')];
const colors = colorButtons.map(button => button.dataset.tokenColor);
const sampleFiles = ['棋子-红.png', '棋子-绿.png', '棋子-蓝.png', '棋子-黄.png', '大图.png'];
const sampleNames = {green: 'rose', purple: 'anubis'};
const status = $('Status');
const nameInput = $('Name');
const progress = $('ExportProgress');
const trailZone = $('Trail');
const trailScope = $('TrailScope');
const active = () => location.hash === '#token-preview' && !root.classList.contains('hidden');
const chinese = () => document.documentElement.lang.startsWith('zh');
const words = () => chinese() ? copy.zh : copy.en;
const locked = ['UploadEmpty', 'Upload', 'Folder', 'Name', 'Play', 'Sound', 'TrailScope', 'TrailChoose', 'TrailReset'].map($)
  .concat(gradeButtons, exampleButtons, colorButtons, actionButtons);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const drafts = new Map();
let files = new Map();
const assetURLs = new Map();
const trailNames = new WeakMap();
const trailSuffix = {red: '-红', green: '', blue: '-蓝', yellow: '-黄'};
let token = null, renderer = null, busy = false;
let grade = 'green';
let color = 'green', action = 'jump';
let message = null, animation = 0, exporting = null;
let hopTime = 0, loopWanted = false;

function scopedTrailKeys() {
  const color = trailScope.value;
  return color === 'all' ? TOKEN_TRAIL_KEYS : [`火1${trailSuffix[color]}`, `火2${trailSuffix[color]}`];
}

function syncTrail() {
  const text = words();
  trailZone.hidden = grade !== 'purple' || !token;
  const keys = scopedTrailKeys();
  const custom = keys.map(key => files.get(key)).filter(Boolean);
  const names = new Set(custom.map(file => trailNames.get(file) || file.name));
  $('TrailReset').hidden = !custom.length;
  const wholeScope = custom.length === keys.length && names.size === 1;
  $('TrailStatus').textContent = wholeScope ? names.values().next().value
    : custom.length ? text.trailVariants(custom.length) : text.trailDefault;
}

function sync() {
  const text = words();
  for (const label of labels) label.textContent = text[label.dataset.tokenText];
  nameInput.placeholder = text.placeholder[grade];
  $('MaterialsTitle').textContent = text.materials[grade];
  $('Grade').setAttribute('aria-label', text.grade);
  const examples = $('Examples');
  const exampleHost = token ? $('PreviewExamples') : $('EmptyExamples');
  if (examples.parentElement !== exampleHost) exampleHost.append(examples);
  examples.setAttribute('aria-label', text.examples);
  $('Canvas').setAttribute('aria-label', text.preview);
  $('PackageLabel').textContent = tokenPackageName(nameInput.value, grade) + '.zip';
  $('Count').textContent = `${colors.filter(key => files.has(key)).length} / 4 PNG`;
  $('Assets').hidden = !files.size;
  $('Empty').hidden = !!token;
  $('Empty').setAttribute('aria-busy', String(busy));
  $('Board').hidden = !token;
  $('Motion').hidden = !token;
  syncTrail();
  $('SoundOption').hidden = !renderer?.playSound;
  for (const control of locked) control.disabled = busy;
  for (const control of [$('Video'), $('Bundle')]) control.disabled = busy || !token;
  syncPlayback();
  for (const button of gradeButtons) button.setAttribute('aria-pressed', String(button.dataset.tokenGrade === grade));
  for (const button of colorButtons) button.setAttribute('aria-pressed', String(button.dataset.tokenColor === color));
  for (const button of actionButtons) button.setAttribute('aria-pressed', String(button.dataset.tokenAction === action));
  for (const [file, url] of assetURLs) {
    if ([...files.values()].includes(file)) continue;
    URL.revokeObjectURL(url);
    assetURLs.delete(file);
  }
  const rows = [...colors, 'cover'].filter(key => files.has(key)).map(key => {
    const file = files.get(key);
    if (!assetURLs.has(file)) assetURLs.set(file, URL.createObjectURL(file));
    const item = document.createElement('figure');
    const thumbnail = document.createElement('img');
    thumbnail.src = assetURLs.get(file);
    thumbnail.alt = '';
    thumbnail.width = thumbnail.height = 42;
    thumbnail.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = text[key];
    caption.title = file.name;
    item.append(thumbnail, caption);
    return item;
  });
  $('AssetList').replaceChildren(...rows);
  $('Cover').hidden = !token?.cover;
  if (token?.cover) $('Cover').href = assetURLs.get(token.cover);
  else $('Cover').removeAttribute('href');
  root.setAttribute('aria-busy', String(busy));
  status.dataset.tone = message?.tone || '';
  if (!message) {
    status.textContent = '';
  } else if (message.key === 'missing') {
    status.textContent = text.missing(message.colors.map(key => text[key]).join(chinese() ? '、' : ', '));
  } else if (message.key === 'duplicate') {
    status.textContent = text.duplicate(text[message.color]);
  } else {
    status.textContent = message.detail || text[message.key];
  }
}

function syncPlayback() {
  const text = words();
  $('Play').textContent = action === 'jump' ? text[loopWanted ? 'pause' : 'resume'] : text.replay;
}

function stopAnimation() {
  cancelAnimationFrame(animation);
  animation = 0;
  renderer?.stopSound?.();
  syncPlayback();
}

function showBoardOnMobile() {
  if (matchMedia('(max-width:760px)').matches) {
    const boardTop = $('Board').getBoundingClientRect().top;
    const header = document.querySelector('.topbar');
    const inset = header && getComputedStyle(header).position === 'sticky'
      ? header.offsetHeight
      : 0;
    window.scrollTo({top: window.scrollY + boardTop - inset - 8, behavior: 'instant'});
  }
}

function animate(duration, drawFrame) {
  const start = performance.now();
  drawFrame(0);
  const tick = now => {
    if (!active() || document.hidden || busy) {
      stopAnimation();
      return;
    }
    const time = Math.min(duration, Math.max(0, (now - start) / 1000));
    drawFrame(time);
    if (time < duration) {
      animation = requestAnimationFrame(tick);
    } else {
      animation = 0;
    }
  };
  animation = requestAnimationFrame(tick);
}

function drawHop(time) {
  hopTime = time;
  renderer.draw({color, action: 'jump', time: hopTime});
}

function resumeLoop() {
  if (!loopWanted || animation || !renderer || busy || !active() || document.hidden) return;
  const from = hopTime;
  animate(Infinity, time => drawHop(from + time));
}

function play() {
  if (!active() || !renderer || busy) return;
  stopAnimation();
  showBoardOnMobile();
  if (action === 'jump') {
    loopWanted = !loopWanted;
    resumeLoop();
  } else {
    if ($('Sound').checked) void renderer.playSound({action});
    animate(TOKEN_ROUND_SECONDS, time => renderer.draw({color, action, time}));
  }
  syncPlayback();
}

function selectFiles(selected) {
  const groups = new Map();
  for (const file of selected) {
    const key = tokenFileKey(file.name);
    const path = diceFilePath(file).split(/[/\\]/).filter(Boolean);
    if (!key || (grade !== 'purple' && TOKEN_TRAIL_KEYS.includes(key)) ||
        path.some(part => part.startsWith('.') || part === '__MACOSX')) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const mapped = new Map();
  for (const [key, group] of groups) {
    if (group.length === 1) {
      mapped.set(key, group[0]);
      continue;
    }
    const inFolder = name => group.filter(file => diceFilePath(file).split(/[/\\]/).at(-2)?.toLowerCase() === name);
    const png = inFolder('png');
    const standard = png.length ? png : inFolder('res');
    if (standard.length !== 1) return {duplicate: key};
    mapped.set(key, standard[0]);
  }
  return {mapped};
}

async function load(getFiles, {example, trailChange, scroll = true} = {}) {
  if (busy || !active()) return;
  stopAnimation();
  busy = true;
  message = {key: 'importing'};
  sync();
  const upload = window.UploadProgress?.begin();
  try {
    const selected = await getFiles();
    if (trailChange === 'replace' && selected.length !== 1) {
      message = {key: 'oneTrail', tone: 'error'};
      return;
    }
    const {mapped, duplicate} = selectFiles(trailChange ? [] : selected);
    if (duplicate) {
      message = {key: 'duplicate', color: duplicate, tone: 'error'};
      return;
    }
    if (!mapped.size && !trailChange) {
      message = {key: 'noFiles', tone: 'error'};
      return;
    }
    const wholeSet = colors.every(key => mapped.has(key));
    const previous = wholeSet ? [...files].filter(([key]) => !example && TOKEN_TRAIL_KEYS.includes(key)) : files;
    const merged = new Map([...previous, ...mapped]);
    if (trailChange) {
      for (const key of scopedTrailKeys()) {
        if (trailChange === 'reset') {
          merged.delete(key);
        } else {
          const source = selected[0];
          const variant = new File([source], `${key}.png`, {type: source.type, lastModified: source.lastModified});
          trailNames.set(variant, source.name);
          merged.set(key, variant);
        }
      }
    }
    const missing = colors.filter(key => !merged.has(key));
    if (missing.length) {
      files = merged;
      message = {key: 'missing', colors: missing};
      return;
    }
    const next = await prepareToken([...merged.values()], {grade});
    const currentCanvas = $('Canvas');
    const canvas = currentCanvas.cloneNode();
    const nextRenderer = await createTokenRenderer(canvas, next);
    try {
      nextRenderer.draw({color, action: 'jump', time: 0});
    } catch (error) {
      nextRenderer.dispose();
      throw error;
    }
    renderer?.dispose();
    currentCanvas.replaceWith(canvas);
    renderer = nextRenderer;
    token = next;
    files = merged;
    action = 'jump';
    hopTime = 0;
    loopWanted = !reduceMotion.matches;
    if (example) nameInput.value = example;
    message = {key: 'ready'};
  } catch (error) {
    message = {key: 'failed', detail: chinese() ? error.message : undefined, tone: 'error'};
  } finally {
    upload?.finish();
    busy = false;
    sync();
    resumeLoop();
    if (scroll && message.key === 'ready' && active()) showBoardOnMobile();
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function exportOutput(video) {
  if (!token || busy || !active()) return;
  stopAnimation();
  busy = true;
  message = {key: video ? 'generating' : 'packing'};
  progress.hidden = !video;
  progress.value = 0;
  sync();
  const base = tokenPackageName(nameInput.value, grade);
  const controller = new AbortController();
  if (video) exporting = controller;
  try {
    if (video) {
      const result = await recordTokenVideo(renderer, {
        color, action, soundEnabled: $('Sound').checked, signal: controller.signal,
        onProgress: value => { progress.value = value; }
      });
      if (!controller.signal.aborted) download(result.blob, `${base}_preview.${result.extension}`);
    } else {
      const bundle = await makeTokenZip(token, nameInput.value);
      if (active()) download(bundle, `${base}.zip`);
    }
    message = {key: controller.signal.aborted ? 'cancelled' : 'saved'};
  } catch (error) {
    message = controller.signal.aborted
      ? {key: 'cancelled'}
      : {key: 'failed', detail: chinese() ? error.message : undefined, tone: 'error'};
  } finally {
    exporting = null;
    progress.hidden = true;
    busy = false;
    sync();
    resumeLoop();
  }
}

for (const button of [$('UploadEmpty'), $('Upload')]) button.addEventListener('click', () => $('Files').click());
$('Empty').addEventListener('click', event => {
  if (!busy && !event.target.closest('button')) $('Files').click();
});
$('Folder').addEventListener('click', () => $('FolderFiles').click());
$('TrailScope').addEventListener('change', syncTrail);
$('TrailChoose').addEventListener('click', () => $('TrailFile').click());
trailZone.addEventListener('click', event => {
  if (!event.target.closest('button, select, label')) trailZone.focus({preventScroll: true});
});
const replaceTrail = selected => load(() => selected, {trailChange: 'replace', scroll: false});
$('TrailReset').addEventListener('click', () => void load(() => [], {trailChange: 'reset', scroll: false}));
$('TrailFile').addEventListener('change', event => {
  const input = event.currentTarget;
  const selected = Array.from(input.files);
  input.value = '';
  if (selected.length) void replaceTrail(selected);
});
for (const input of [$('Files'), $('FolderFiles')]) input.addEventListener('change', () => {
  const selected = Array.from(input.files);
  input.value = '';
  if (selected.length) void load(() => selected);
});
for (const zone of root.querySelectorAll('.token-upload-zone')) {
  zone.addEventListener('dragover', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    if (!busy) zone.dataset.dragging = 'true';
  });
  zone.addEventListener('dragleave', event => { if (!zone.contains(event.relatedTarget)) delete zone.dataset.dragging; });
  zone.addEventListener('drop', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    delete zone.dataset.dragging;
    const options = zone === trailZone ? {trailChange: 'replace', scroll: false} : undefined;
    void load(() => readDropFiles(event.dataTransfer), options);
  });
}
window.UploadPaste?.register({zone: root, isActive: active, isBusy: () => busy, onFiles: selected => load(() => selected)});
window.UploadPaste?.register({
  zone: trailZone,
  isActive: event => active() && !trailZone.hidden &&
    (trailZone.contains(event.target) || trailZone.contains(document.activeElement)),
  isBusy: () => busy,
  onFiles: replaceTrail,
});
function loadExample(next) {
  if (busy || !active()) return;
  changeGrade(next);
  const example = sampleNames[next];
  void load(() => Promise.all(sampleFiles.map(async name => {
    const response = await fetch(new URL(`./assets/${example}/${name}`, import.meta.url));
    if (!response.ok) throw new Error(words().exampleFailed);
    return new File([await response.blob()], name, {type: 'image/png'});
  })), {example});
}
for (const button of exampleButtons) button.addEventListener('click', () => loadExample(button.dataset.tokenSample));
nameInput.addEventListener('input', () => { $('PackageLabel').textContent = tokenPackageName(nameInput.value, grade) + '.zip'; });
function changeGrade(next) {
  if (grade === next) return false;
  stopAnimation();
  drafts.set(grade, {files, name: nameInput.value});
  renderer?.dispose();
  token = renderer = null;
  grade = next;
  const draft = drafts.get(grade);
  files = draft?.files || new Map();
  nameInput.value = draft?.name || '';
  trailScope.value = 'all';
  action = 'jump';
  hopTime = 0;
  loopWanted = false;
  message = null;
  return true;
}
for (const button of gradeButtons) button.addEventListener('click', () => {
  if (busy || !changeGrade(button.dataset.tokenGrade)) return;
  if (colors.every(key => files.has(key))) void load(() => [...files.values()], {scroll: false});
  else sync();
});
for (const button of colorButtons) button.addEventListener('click', () => {
  stopAnimation();
  color = button.dataset.tokenColor;
  hopTime = 0;
  if (action === 'jump') drawHop(0);
  else renderer.draw({color, action: 'standby'});
  resumeLoop();
  sync();
});
for (const button of actionButtons) button.addEventListener('click', () => {
  action = button.dataset.tokenAction;
  loopWanted = false;
  sync();
  play();
});
$('Sound').addEventListener('change', () => { if (!$('Sound').checked) renderer?.stopSound?.(); });
$('Play').addEventListener('click', play);
$('Bundle').addEventListener('click', () => void exportOutput(false));
$('Video').addEventListener('click', () => void exportOutput(true));
function suspend() {
  stopAnimation();
  exporting?.abort();
}
window.addEventListener('hashchange', () => { if (active()) resumeLoop(); else suspend(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else resumeLoop(); });
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches && loopWanted) {
    loopWanted = false;
    stopAnimation();
  }
});
window.addEventListener('pagehide', event => {
  suspend();
  if (!event.persisted) {
    renderer?.dispose();
    renderer = null;
    for (const url of assetURLs.values()) URL.revokeObjectURL(url);
  }
});
new MutationObserver(sync).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
sync();
