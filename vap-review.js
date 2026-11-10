const root = document.querySelector('#vapTool');
const $ = suffix => document.getElementById('vapReview' + suffix);
const canvas = $('Canvas');
const copy = {
  zh: {
    convertTab:'VAP 工具',reviewTab:'预览功能',title:'房间礼物过稿',
    background:'房间背景',ludo:'Hapi Ludo 房间',dark:'深色对比',custom:'自定义背景',uploadBackground:'上传背景',
    uploadVideo:'上传{gift} MP4',count:'礼物数量',play:'同步播放',pause:'暂停',timeline:'播放时间',slots:'礼物调整',
    large:'大礼物',medium:'中礼物',small:'小礼物',gift:'礼物',noVideo:'尚未添加 MP4',replace:'替换',add:'上传',remove:'移除',
    scale:'画面大小',offsetY:'上下位置',editHint:'拖动视频调整位置，拖蓝线上的百分比手柄调整遮罩。',key:'视频底色',auto:'自动识别',opaque:'保留画面',black:'黑底去背景',white:'白底去背景',chroma:'色幕去背景',native:'原生 VAP 透明',
    mask:'上下渐变遮罩',enabled:'启用渐变',topStart:'上方透明边界',topEnd:'上方渐变结束',bottomStart:'下方渐变开始',bottomEnd:'下方透明边界',
    templates:'过稿模板',templateHint:'保存背景、礼物数量、尺寸、位置和渐变。视频素材可重新替换。',templateName:'模板名称',namePlaceholder:'输入模板名称',
    saveTemplate:'保存模板',pickTemplate:'选择已保存模板',applyTemplate:'套用模板',delivery:'合成视频',
    exportHint:'时长以最长视频为准，导出一条 30 FPS 无声 MP4。',export:'导出对比 MP4',cancel:'取消',download:'下载 MP4',
    reading:'正在读取视频…',readError:'有视频无法读取。请选择 200 MB、120 秒以内的 SDR MP4。',limit:'最多添加 6 路礼物。可单独替换某一路。',
    backgroundError:'背景无法读取。请选择 20 MB 以内的 PNG、JPG 或 WebP。',nameMissing:'请输入模板名称。',
    saved:'模板已保存。',applied:'已套用模板。',storageError:'无法访问本机模板，请检查浏览器的存储设置。',
    exporting:'正在合成对比视频…',exported:'对比视频已生成。',exportError:'合成失败，请重新尝试或用较短的视频。',encoder:'当前浏览器无法编码 H.264 MP4，请使用支持 WebCodecs 的 Chrome 或 Edge。',
    cancelled:'已取消合成。',stage:'房间对比预览',previewError:'预览无法绘制，请重新上传视频。',initialError:'过稿工具加载失败，请刷新后重试。',
  },
  en: {
    convertTab:'VAP tool',reviewTab:'Review preview',title:'Room gift review',
    background:'Room background',ludo:'Hapi Ludo room',dark:'Dark comparison',custom:'Custom background',uploadBackground:'Upload background',
    uploadVideo:'Upload {gift} MP4',count:'Gift count',play:'Play together',pause:'Pause',timeline:'Playback time',slots:'Gift adjustments',
    large:'Large gift',medium:'Medium gift',small:'Small gift',gift:'Gift',noVideo:'Add an MP4',replace:'Replace',add:'Upload',remove:'Remove',
    scale:'Gift size',offsetY:'Vertical position',editHint:'Drag the video to move it. Drag the percentage handles to adjust the mask.',key:'Video background',auto:'Auto detect',opaque:'Keep picture',black:'Remove black',white:'Remove white',chroma:'Remove color screen',native:'Native VAP alpha',
    mask:'Vertical feather mask',enabled:'Enable feathering',topStart:'Top transparent edge',topEnd:'Top fade end',bottomStart:'Bottom fade start',bottomEnd:'Bottom transparent edge',
    templates:'Review templates',templateHint:'Save the background, gift count, sizes, positions and fades. Import videos separately.',templateName:'Template name',namePlaceholder:'Name this template',
    saveTemplate:'Save template',pickTemplate:'Choose saved template',applyTemplate:'Apply template',delivery:'Comparison video',
    exportHint:'The longest clip sets the duration of the silent 30 FPS MP4.',export:'Export comparison',cancel:'Cancel',download:'Download MP4',
    reading:'Reading videos…',readError:'A video could not be read. Choose an SDR MP4 under 200 MB and 120 seconds.',limit:'Up to six gifts. Replace an individual slot to make room.',
    backgroundError:'Choose a PNG, JPG or WebP background under 20 MB.',nameMissing:'Enter a template name.',
    saved:'Template saved.',applied:'Template applied.',storageError:'Local templates are unavailable. Check browser storage settings.',
    exporting:'Compositing video…',exported:'Comparison video ready.',exportError:'Could not compose the video. Retry or use shorter clips.',encoder:'This browser cannot encode H.264 MP4. Use a WebCodecs-capable Chrome or Edge.',
    cancelled:'Export cancelled.',stage:'Room comparison preview',previewError:'The preview could not be drawn. Upload the videos again.',initialError:'Could not load the review tool. Refresh to retry.',
  },
};
const t = key => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'][key];
const maskKeys = ['topStart', 'topEnd', 'bottomStart', 'bottomEnd'];
const label = index => index < 3 ? t(['large', 'medium', 'small'][index]) : t('gift') + ' ' + (index + 1);
const state = {
  active: false, tab: 'convert', engine: null, count: 3, slots: [],
  background: 'ludo', backgroundImage: null, backgroundFile: null,
  templates: [], target: null, time: 0, running: false, start: 0,
  busy: '', status: null, result: null, abort: null, renderer: null,
};
let initTask, animation, lastFrame = -1, previewLayout, selectedSlot, editorDrag, loadingSlot, fileDropZone;
const shown = () => state.slots.slice(0, state.count);
const duration = () => Math.max(0, ...shown().map(slot => slot.clip?.duration || 0));
const reviewing = () => state.active && state.tab === 'review';
const busy = () => !!state.busy;
const report = (key, kind = '', suffix = '') => {
  state.status = key ? {key, kind, suffix} : null;
  syncStatus();
};
function syncStatus() {
  const status = state.status;
  const isInputStatus = ['reading', 'readError', 'limit', 'backgroundError', 'initialError'].includes(status?.key);
  for (const [id, show] of [['InputStatus', isInputStatus], ['Status', !isInputStatus]]) {
    const notice = $(id);
    notice.hidden = !status || !show;
    notice.textContent = notice.hidden ? '' : t(status.key) + status.suffix;
    notice.dataset.tone = status?.kind || 'info';
  }
}
function discardResult() {
  if (state.result) URL.revokeObjectURL(state.result.url);
  state.result = null;
}
function syncPlayback() {
  const total = duration();
  $('Timeline').max = total;
  $('Timeline').value = state.time;
  $('Time').textContent = state.time.toFixed(2) + ' / ' + total.toFixed(2) + ' s';
  $('Play').textContent = t(state.running ? 'pause' : 'play');
  $('Play').setAttribute('aria-pressed', String(state.running));
}
function sync() {
  const lock = busy() || !state.engine || !state.slots.length, anyClip = duration() > 0;
  for (const id of ['Background', 'PickBackground', 'Count', 'SaveTemplate', 'TemplateName', 'Templates']) $(id).disabled = lock;
  $('ApplyTemplate').disabled = lock || !$('Templates').value;
  $('Timeline').disabled = $('Play').disabled = $('Export').disabled = lock || !anyClip;
  $('Export').textContent = t(state.busy === 'export' ? 'exporting' : 'export');
  $('Progress').hidden = $('Cancel').hidden = state.busy !== 'export';
  $('Download').hidden = !state.result || busy();
  if (state.result) {$('Download').href = state.result.url;$('Download').download = state.result.name;}
  else $('Download').removeAttribute('href');
  $('Count').value = state.count; $('Background').value = state.background;
  $('Panel').setAttribute('aria-busy', String(busy()));
  shown().forEach(syncSlot);
  syncEditors();
  syncPlayback(); syncStatus();
}
function maskBounds(mask, key) {
  const values = maskKeys.map(name => Math.round(mask[name] * 100));
  return {
    topStart:[0, values[1] - 1], topEnd:[values[0] + 1, values[2]],
    bottomStart:[values[1], values[3] - 1], bottomEnd:[values[2] + 1, 100],
  }[key];
}
function settingBounds(slot, key) {
  if (key === 'scale') return [25, 110];
  if (key === 'offsetY') return [-state.engine.REVIEW_POSITION_LIMIT, state.engine.REVIEW_POSITION_LIMIT];
  return maskBounds(slot.settings.mask, key);
}
function settingValue(slot, key) {
  return maskKeys.includes(key) ? Math.round(slot.settings.mask[key] * 100) : slot.settings[key];
}
function setSlotValue(slot, key, value) {
  const [min, max] = settingBounds(slot, key);
  const next = Math.max(min, Math.min(max, Math.round(value)));
  if (settingValue(slot, key) === next) return;
  if (maskKeys.includes(key)) slot.settings.mask[key] = next / 100;
  else slot.settings[key] = next;
  changed();
}
function syncSlot(slot) {
  const card = slot.card;
  if (!card) return;
  const clip = slot.clip, lock = busy();
  card.querySelector('[data-name]').textContent = clip ? clip.file.name : t('noVideo');
  card.querySelector('[data-open]').textContent = t(clip ? 'replace' : 'add');
  card.querySelector('[data-remove]').hidden = !clip;
  card.querySelector('[data-native]').hidden = !clip?.config;
  card.querySelector('[data-key-wrap]').hidden = !!clip?.config;
  card.querySelector('[data-key]').value = slot.settings.key;
  const toggle = card.querySelector('[data-enable]');
  toggle.checked = slot.settings.mask.enabled;
  for (const control of card.querySelectorAll('button,input,select')) control.disabled = lock;
  for (const slider of card.querySelectorAll('[data-slider]')) {
    const key = slider.dataset.slider;
    const value = settingValue(slot, key);
    const [min, max] = settingBounds(slot, key);
    slider.min = min; slider.max = max; slider.value = value;
    slider.disabled = lock || (maskKeys.includes(key) && !toggle.checked);
    slider.nextElementSibling.textContent = value + '%';
  }
}
function changed() {
  discardResult(); report(); sync(); draw();
}
const slider = key => '<label class="vap-review-slider"><span>' + t(key) + '</span><input type="range" step="1" data-slider="' + key + '"><output></output></label>';
function renderSlots() {
  const open = new Set(shown().filter(slot => slot.card?.querySelector('details').open));
  $('Slots').replaceChildren(...shown().map((slot, index) => {
    const card = document.createElement('article');
    card.className = 'vap-review-slot';
    card.innerHTML = '<div class="vap-review-slot-head"><h3>' + label(index) +
      '</h3><div class="vap-review-actions"><button type="button" class="vap-button vap-secondary" data-open></button>' +
      '<button type="button" class="vap-button vap-secondary" data-remove>' + t('remove') + '</button></div></div>' +
      '<p class="vap-hint" data-name></p>' + slider('scale') + slider('offsetY') +
      '<details><summary>' + t('mask') + '</summary><label class="vap-switch-row"><span>' + t('enabled') +
      '</span><input type="checkbox" class="vap-switch" role="switch" data-enable></label>' + maskKeys.map(slider).join('') +
      '<label data-key-wrap><span>' + t('key') + '</span><select data-key>' +
      [['auto','auto'],['opaque','opaque'],['black_luma','black'],['white_luma','white'],['chroma_key','chroma']]
        .map(([value,key]) => '<option value="' + value + '">' + t(key) + '</option>').join('') +
      '</select></label><p class="vap-hint" data-native>' + t('native') + '</p></details>';
    slot.card = card;
    card.querySelector('details').open = open.has(slot);
    card.querySelector('[data-open]').addEventListener('click', () => openFiles(index));
    card.querySelector('[data-remove]').addEventListener('click', () => {
      pause(); disposeClip(slot.clip); slot.clip = null; seek(Math.min(state.time, duration())); changed();
    });
    card.querySelector('[data-enable]').addEventListener('change', event => {
      selectedSlot = slot; slot.settings.mask.enabled = event.target.checked; changed();
    });
    card.querySelector('[data-key]').addEventListener('change', event => {
      slot.settings.key = event.target.value; changed();
    });
    for (const input of card.querySelectorAll('[data-slider]')) input.addEventListener('input', () => {
      selectedSlot = slot;
      setSlotValue(slot, input.dataset.slider, Number(input.value));
    });
    return card;
  }));
}
function updateLayout() {
  const width = state.count === 1 ? 252 : 272;
  state.renderer?.dispose();
  previewLayout = state.engine.reviewLayout(state.count, width);
  state.renderer = state.engine.createReviewRenderer(canvas, previewLayout);
  const frame = $('Frame');
  frame.style.setProperty('--review-width', previewLayout.width + 'px');
  frame.style.setProperty('--review-ratio', previewLayout.width / previewLayout.height);
  renderEditors();
}
function placeEditor(element, rect, width, height) {
  element.style.left = rect.x / width * 100 + '%';
  element.style.top = rect.y / height * 100 + '%';
  element.style.width = rect.w / width * 100 + '%';
  element.style.height = rect.h / height * 100 + '%';
}
function renderEditors() {
  finishEditorDrag();
  $('Editors').replaceChildren(...shown().map((slot, index) => {
    const tile = previewLayout.tiles[index], room = {...tile, y: tile.y + tile.label};
    const editor = document.createElement('div');
    editor.className = 'vap-review-editor';
    editor.dataset.slot = index;
    editor.innerHTML = '<button type="button" class="vap-review-move" data-adjust="offsetY"></button>' +
      maskKeys.map(key => '<div class="vap-review-guide-line" hidden><button type="button" class="vap-review-guide" data-adjust="' +
        key + '"><span></span></button></div>').join('') +
      '<button type="button" class="vap-review-upload ft-upload-zone upload-ready" data-preview-upload="' + index + '">' +
      '<img class="tool-empty-art" src="design-system/assets/feedback/empty-upload.svg" alt="" width="120" height="90"><span></span></button>';
    slot.editor = editor;
    slot.room = room;
    placeEditor(editor, room, previewLayout.width, previewLayout.height);
    return editor;
  }));
}
function syncEditors() {
  const slots = shown();
  if (!slots.includes(selectedSlot) || !selectedSlot?.clip) selectedSlot = slots.find(slot => slot.clip);
  $('EditHint').hidden = !selectedSlot;
  slots.forEach((slot, index) => {
    const {clip, editor, room, settings} = slot;
    if (!editor) return;
    const upload = editor.lastElementChild;
    const loading = loadingSlot === slot;
    const uploadLabel = loading ? t('reading') : t('uploadVideo').replace('{gift}', label(index));
    upload.hidden = !!clip;
    upload.disabled = busy();
    upload.setAttribute('aria-busy', String(loading));
    upload.setAttribute('aria-disabled', String(upload.disabled));
    upload.setAttribute('aria-label', loading ? label(index) + ' · ' + uploadLabel : uploadLabel);
    upload.lastElementChild.textContent = uploadLabel;
    const move = editor.firstElementChild;
    move.hidden = !clip || busy();
    const guides = editor.querySelectorAll('.vap-review-guide-line');
    if (move.hidden) {
      for (const guide of guides) guide.hidden = true;
      return;
    }
    const rect = state.engine.giftRect(room, clip.width, clip.height, settings.scale, settings.offsetY);
    placeEditor(move, {...rect, x: rect.x - room.x, y: rect.y - room.y}, room.w, room.h);
    move.setAttribute('aria-label', label(index) + ' · ' + t('offsetY') + ' ' + settings.offsetY + '%');
    for (const line of guides) {
      line.hidden = selectedSlot !== slot || !settings.mask.enabled || state.running;
      if (line.hidden) continue;
      const guide = line.firstElementChild, key = guide.dataset.adjust;
      const position = settings.mask[key];
      const percent = settingValue(slot, key) + '%';
      line.style.top = position * 100 + '%';
      line.dataset.edge = position < .04 ? 'top' : position > .96 ? 'bottom' : '';
      const name = t(key) + ' ' + percent;
      guide.title = name;
      guide.setAttribute('aria-label', label(index) + ' · ' + name);
      guide.firstElementChild.textContent = percent;
    }
  });
}
function finishEditorDrag(event) {
  if (!editorDrag || (event && editorDrag.id !== event.pointerId)) return;
  const {id, handle} = editorDrag;
  editorDrag = null;
  handle.classList.remove('is-adjusting');
  if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
  syncEditors();
}
function startEditorDrag(event) {
  const handle = event.target.closest('[data-adjust]');
  if (!handle || busy() || editorDrag || !event.isPrimary || event.button !== 0) return;
  const slot = state.slots[handle.closest('[data-slot]').dataset.slot];
  const key = handle.dataset.adjust, {height} = slot.editor.getBoundingClientRect();
  if (!height) return;
  selectedSlot = slot; pause();
  if (key === 'offsetY' && state.time >= slot.clip.duration) seek(0);
  editorDrag = {id: event.pointerId, handle, slot, key, height, y: event.clientY, value: settingValue(slot, key)};
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('is-adjusting');
  handle.focus({preventScroll:true});
  event.preventDefault();
}
function moveEditorDrag(event) {
  if (!editorDrag || editorDrag.id !== event.pointerId || busy()) return;
  const {slot, key, height, y, value} = editorDrag;
  setSlotValue(slot, key, value + (event.clientY - y) / height * 100);
}
function adjustWithKeyboard(event) {
  const handle = event.target.closest('[data-adjust]');
  if (!handle || busy() || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const slot = state.slots[handle.closest('[data-slot]').dataset.slot];
  const key = handle.dataset.adjust, step = event.shiftKey ? 5 : 1;
  event.preventDefault();
  selectedSlot = slot; pause();
  if (key === 'offsetY' && state.time >= slot.clip.duration) seek(0);
  setSlotValue(slot, key, settingValue(slot, key) + (event.key === 'ArrowUp' ? -step : step));
}
function draw() {
  if (!reviewing() || !state.renderer) return;
  const slots = shown();
  const clips = slots.map(slot => slot.clip);
  try {
    state.renderer.draw({
      background: state.backgroundImage, clips,
      settings: slots.map(slot => slot.settings), labels: slots.map((_, index) => label(index)),
      sources: clips.map(clip => clip && clip.video.readyState >= 2 && state.time < clip.duration ? clip.video : null),
      showEmptyRooms: false,
    });
  } catch (error) {
    pause();
    report('previewError', 'error');
  }
}
function pause() {
  state.running = false;
  cancelAnimationFrame(animation);
  for (const slot of state.slots) slot.clip?.video.pause();
  syncPlayback(); syncEditors();
}
function seek(time) {
  state.time = Math.max(0, Math.min(duration(), time));
  for (const {clip} of shown()) if (clip) {
    const target = clip.start + Math.min(state.time, Math.max(0, clip.duration - .001));
    if (Math.abs(clip.video.currentTime - target) > .008) clip.video.currentTime = target;
  }
  syncPlayback(); draw();
}
function tick(now) {
  if (!state.running || !reviewing()) return;
  const total = duration(), next = (now - state.start) / 1000;
  if (next >= total) {
    state.start = now; lastFrame = -1; seek(0);
  } else state.time = next;
  for (const {clip} of shown()) if (clip) {
    const {video} = clip;
    if (state.time >= clip.duration) {video.pause();continue;}
    const target = clip.start + state.time;
    if (Math.abs(video.currentTime - target) > .24 && !video.seeking) video.currentTime = target;
    if (video.paused && !video.seeking && !clip.starting) {
      clip.starting = true;
      video.play().catch(() => {pause();report('previewError','error');}).finally(() => {clip.starting = false;});
    }
  }
  const frame = Math.floor(state.time * state.engine.REVIEW_FPS);
  if (frame !== lastFrame) {lastFrame = frame;syncPlayback();draw();}
  if (state.running) animation = requestAnimationFrame(tick);
}
function play() {
  if (!reviewing() || !duration() || busy()) return;
  if (state.running) {pause();return;}
  if (state.time >= duration() - .02) seek(0);
  state.running = true; state.start = performance.now() - state.time * 1000;
  lastFrame = -1; syncPlayback(); syncEditors(); tick(performance.now());
}
function disposeClip(clip) {
  if (!clip) return;
  clip.video.pause(); clip.video.removeAttribute('src'); clip.video.load();
  URL.revokeObjectURL(clip.url);
}
function loadVideoElement(video, url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(fail, 15000);
    function done(error) {
      clearTimeout(timer);video.removeEventListener('loadeddata', ready);video.removeEventListener('error', fail);
      if (error) reject(error); else resolve();
    }
    function ready() {done();}
    function fail() {done(new Error('Video frame unavailable'));}
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', fail);
    video.src = url; video.load();
  });
}
async function loadClip(file, index) {
  if (!/\.mp4$/i.test(file.name) || file.size > 200 * 1024 * 1024) throw new Error('Invalid MP4');
  const clip = await state.engine.inspectReviewClip(file, {allowCustomScreen: index === 2});
  const video = document.createElement('video'), url = URL.createObjectURL(file);
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    await loadVideoElement(video, url);
    video.addEventListener('seeked', () => {if (!state.running) draw();});
    return {...clip, video, url};
  } catch (error) {disposeClip({video,url});throw error;}
}
function openFiles(target) {
  if (busy() || !state.engine) return;
  state.target = target; $('File').click();
}
async function importFiles(files, target = null) {
  if (!reviewing() || busy() || !state.engine || !files.length) return;
  const mp4 = files.filter(file => /\.mp4$/i.test(file.name));
  const free = shown().map((slot,index) => slot.clip ? -1 : index).filter(index => index !== -1);
  const destinations = target === null
    ? free.concat(state.slots.slice(state.count).flatMap((slot,index) => slot.clip ? [] : [index + state.count]))
    : [target];
  if (!destinations.length) {report('limit','error');return;}
  const initialCount = state.count;
  const restoreFocus = target !== null && previewUploadIndex(document.activeElement) === target;
  pause();state.busy = 'load';report('reading');sync();
  let loaded = false, failed = files.length !== mp4.length;
  const count = Math.min(destinations.length, mp4.length);
  for (let i = 0; i < count; i++) {
    const index = destinations[i], slot = state.slots[index];
    loadingSlot = slot;
    syncEditors();
    try {
      const clip = await loadClip(mp4[i], index);
      disposeClip(slot.clip); slot.clip = clip; loaded = true;
      state.count = Math.max(state.count, index + 1);
    } catch (error) {failed = true;}
  }
  loadingSlot = null; state.busy = '';
  if (loaded) {
    discardResult(); renderSlots();
    if (state.count !== initialCount) updateLayout();
    seek(0);
  }
  report(failed ? 'readError' : mp4.length > count ? 'limit' : null, failed || mp4.length > count ? 'error' : '');
  sync();draw();
  if (restoreFocus && reviewing() && document.activeElement === document.body) {
    const {editor, clip} = state.slots[target];
    (clip ? editor.firstElementChild : editor.lastElementChild).focus({preventScroll:true});
  }
}
async function readBackground(key, file) {
  if (key === 'dark') return null;
  const blob = key === 'custom' ? file : await fetch(state.engine.REVIEW_BACKGROUNDS[key]).then(response => {
    if (!response.ok) throw new Error('Room background unavailable');
    return response.blob();
  });
  if (!blob || blob.size > 20 * 1024 * 1024) throw new Error('Invalid background');
  const image = await createImageBitmap(blob);
  if (image.width * image.height > 32000000) {image.close();throw new Error('Background too large');}
  return image;
}
function useBackground(key, file, image) {
  state.backgroundImage?.close();
  state.background = key; state.backgroundFile = file; state.backgroundImage = image;
}
async function selectBackground(key, file = state.backgroundFile) {
  if (busy()) return;
  if (key === 'custom' && !file) {$('Background').value = state.background;$('BackgroundFile').click();return;}
  state.busy = 'background';sync();
  try {
    const image = await readBackground(key, file);
    useBackground(key, key === 'custom' ? file : state.backgroundFile, image); changed();
  } catch (error) {report('backgroundError','error');}
  finally {state.busy = '';sync();draw();}
}

function templateStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fun-toolkit-vap-review', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('templates', {keyPath: 'name'});
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Template store blocked'));
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction('templates', mode);
        const result = operation(transaction.objectStore('templates'));
        transaction.oncomplete = () => {db.close();resolve(result.result);};
        transaction.onabort = () => {db.close();reject(transaction.error);};
      } catch (error) {db.close();reject(error);}
    };
  });
}
async function readTemplates() {
  state.templates = (await templateStore('readonly', store => store.getAll())).sort((a, b) => b.savedAt - a.savedAt);
  const selected = $('Templates').value;
  $('Templates').replaceChildren(new Option(t('pickTemplate'), ''),
    ...state.templates.map(template => new Option(template.name, template.name)));
  $('Templates').value = state.templates.some(template => template.name === selected) ? selected : '';
}
async function saveTemplate() {
  const name = $('TemplateName').value.trim();
  if (!name) {report('nameMissing','error');$('TemplateName').focus();return;}
  state.busy = 'template';sync();
  try {
    const settings = state.engine.normalizeReviewTemplate({
      background: state.background, backgroundFile: state.backgroundFile, slots: shown().map(slot => slot.settings),
    });
    await templateStore('readwrite', store => store.put({name, ...settings, savedAt: Date.now()}));
    await readTemplates();
    $('Templates').value = name;report('saved','success');
  } catch (error) {report('storageError','error');}
  finally {state.busy = '';sync();}
}
async function applyTemplate() {
  const template = state.templates.find(item => item.name === $('Templates').value);
  if (!template) return;
  pause(); state.busy = 'template';sync();
  try {
    const settings = state.engine.normalizeReviewTemplate(template);
    const image = await readBackground(settings.background, settings.backgroundFile);
    useBackground(settings.background, settings.backgroundFile, image);
    state.count = settings.slots.length;
    settings.slots.forEach((value, index) => {state.slots[index].settings = value;});
    $('TemplateName').value = template.name;
    discardResult();renderSlots();updateLayout();seek(0);report('applied','success');
  } catch (error) {report('storageError','error');}
  finally {state.busy = '';sync();}
}

async function exportVideo() {
  if (busy() || !duration()) return;
  pause();
  state.busy = 'export';state.abort = new AbortController();
  $('Progress').value = 0;report('exporting');sync();
  const slots = shown();
  try {
    const result = await state.engine.exportReviewMp4({
      background: state.backgroundImage, clips: slots.map(slot => slot.clip),
      settings: slots.map(slot => slot.settings), labels: slots.map((_, index) => label(index)),
    }, {signal: state.abort.signal, onProgress: fraction => {$('Progress').value = fraction * 100;}});
    discardResult();
    const name = ($('TemplateName').value.trim() || 'vap-gift-review').replace(/[\\/:*?"<>|]/g, '-');
    state.result = {url: URL.createObjectURL(result.blob), name: name + '.mp4'};
    window.Hub?.record('vap', 'generated');
    report('exported', 'success', ' ' + result.layout.width + ' × ' + result.layout.height + ' · ' + state.engine.REVIEW_FPS + ' FPS · ' + result.duration.toFixed(2) + ' s · ' + (result.blob.size / 1e6).toFixed(2) + ' MB');
  } catch (error) {
    const cancelled = error.name === 'AbortError' || state.abort.signal.aborted;
    report(cancelled ? 'cancelled' : error.code === 'encoder' ? 'encoder' : 'exportError', cancelled ? '' : 'error');
  } finally {state.abort = null;state.busy = '';sync();}
}

async function initialize() {
  if (!initTask) initTask = (async () => {
    state.busy = 'init';sync();
    try {
      state.engine = await import('./vap-review-engine.mjs?v=20261110-review-mask');
      state.slots = Array.from({length: state.engine.MAX_REVIEW_SLOTS}, () => ({settings: state.engine.defaultReviewSlot(), clip: null}));
      state.backgroundImage = await readBackground('ludo');
      renderSlots();updateLayout();
      try {await readTemplates();} catch (error) {report('storageError','error');}
    } catch (error) {
      state.engine = null;initTask = null;report('initialError','error');
    }
    state.busy = '';sync();draw();
  })();
  await initTask;
}
function switchTab(tab) {
  if (state.tab !== tab) {finishEditorDrag();pause();state.abort?.abort();state.tab = tab;}
  const reviewingTab = tab === 'review';
  $('Panel').hidden = !reviewingTab;
  document.getElementById('vapConvertPanel').hidden = reviewingTab;
  for (const [id, active] of [['vapConvertTab', !reviewingTab], ['vapReviewTab', reviewingTab]]) {
    const button = document.getElementById(id);
    button.setAttribute('aria-selected', String(active));button.tabIndex = active ? 0 : -1;
  }
  root.setAttribute('aria-labelledby', reviewingTab ? 'vapReviewTitle' : 'vapTitle');
  window.VapTool?.setActive(state.active && !reviewingTab);
  if (reviewing()) {sync();void initialize();draw();}
}
function setActive(value) {
  state.active = value;
  if (!value) {finishEditorDrag();pause();state.abort?.abort();}
  switchTab(state.tab);
}
function localize() {
  root.querySelectorAll('[data-review-text]').forEach(node => {node.textContent = t(node.dataset.reviewText);});
  root.querySelector('.vap-review-tabs').setAttribute('aria-label', t('title'));
  $('TemplateName').placeholder = t('namePlaceholder');
  $('Stage').setAttribute('aria-label', t('stage'));
  canvas.setAttribute('aria-label', t('stage'));
  if (state.slots.length) renderSlots();
  sync(); draw();
}
for (const [id, tab] of [['vapConvertTab','convert'],['vapReviewTab','review']]) {
  const button = document.getElementById(id);
  button.addEventListener('click', () => switchTab(tab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'convert' : event.key === 'End' ? 'review' : tab === 'convert' ? 'review' : 'convert';
    switchTab(next);document.getElementById(next === 'review' ? 'vapReviewTab' : 'vapConvertTab').focus();
  });
}
$('File').addEventListener('change', event => {
  const files = Array.from(event.target.files), target = state.target;
  event.target.value = '';state.target = null;void importFiles(files, target);
});
$('Count').addEventListener('change', () => {
  pause();state.count = Number($('Count').value);renderSlots();updateLayout();seek(Math.min(state.time,duration()));changed();
});
$('Background').addEventListener('change', () => selectBackground($('Background').value));
$('PickBackground').addEventListener('click', () => $('BackgroundFile').click());
$('BackgroundFile').addEventListener('change', event => {
  const file = event.target.files[0];event.target.value = '';if (file) void selectBackground('custom',file);
});
$('Play').addEventListener('click', play);
$('Timeline').addEventListener('input', () => {pause();seek(Number($('Timeline').value));});
$('SaveTemplate').addEventListener('click', saveTemplate);
$('Templates').addEventListener('change', sync);
$('ApplyTemplate').addEventListener('click', applyTemplate);
$('Export').addEventListener('click', exportVideo);
$('Cancel').addEventListener('click', () => state.abort?.abort());
$('Download').addEventListener('click', () => window.Hub?.record('vap','download'));
$('Editors').addEventListener('click', event => {
  const index = previewUploadIndex(event.target);
  if (index !== null) openFiles(index);
});
$('Editors').addEventListener('pointerdown', startEditorDrag);
$('Editors').addEventListener('pointermove', moveEditorDrag);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('Editors').addEventListener(event, finishEditorDrag);
$('Editors').addEventListener('keydown', adjustWithKeyboard);
function showFileDrop(zone) {
  if (zone === fileDropZone) return;
  fileDropZone?.classList.remove('is-dragging');
  fileDropZone = zone;
  zone?.classList.add('is-dragging');
}
function previewUploadIndex(node) {
  const upload = node?.closest?.('[data-preview-upload]');
  return upload && !upload.hidden ? Number(upload.dataset.previewUpload) : null;
}
$('Stage').addEventListener('dragover', event => {
  if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
  event.preventDefault();
  if (!busy()) showFileDrop((event.dataTransfer.items?.length <= 1 && event.target.closest('[data-preview-upload]')) || $('Stage'));
});
$('Stage').addEventListener('dragleave', event => {
  if (!event.currentTarget.contains(event.relatedTarget)) showFileDrop(null);
});
$('Stage').addEventListener('drop', event => {
  event.preventDefault(); showFileDrop(null);
  const files = Array.from(event.dataTransfer?.files || []);
  void importFiles(files, files.length === 1 ? previewUploadIndex(event.target) : null);
});
window.UploadPaste?.register({
  zone: $('Stage'), isActive: reviewing, isBusy: busy,
  onFiles: files => importFiles(files, files.length === 1 ? previewUploadIndex(document.activeElement) : null),
});
document.addEventListener('visibilitychange', () => {if (document.hidden) {finishEditorDrag();pause();}});
window.addEventListener('pagehide', event => {
  pause();state.abort?.abort();
  if (!event.persisted) {
    for (const slot of state.slots) disposeClip(slot.clip);
    state.renderer?.dispose();state.backgroundImage?.close();discardResult();
  }
});
new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
window.VapWorkspace = {setActive};
localize();setActive(!root.classList.contains('hidden'));
