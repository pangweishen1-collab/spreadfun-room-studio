const root = document.querySelector('#vapTool');
const $ = suffix => document.getElementById('vapReview' + suffix);
const canvas = $('Canvas');
const copy = {
  zh: {
    convertTab:'VAP 工具',reviewTab:'预览功能',title:'房间礼物过稿',
    settings:'过稿设置',background:'房间背景',ludo:'Hapi Ludo 房间',dark:'深色对比',custom:'自定义背景',uploadBackground:'选择本机背景…',uploadCloudBackground:'添加云端背景…',
    uploadVideo:'上传{gift} MP4',count:'视频数量',play:'同步播放',pause:'暂停',timeline:'播放时间',slots:'视频调整',
    large:'大礼物',medium:'中礼物',small:'小礼物',gift:'礼物',vehicle:'座驾',replace:'替换',add:'上传',remove:'移除',
    scale:'画面大小',offsetY:'上下位置',editHint:'拖动视频调整位置，拖蓝线上的百分比手柄调整遮罩。',key:'视频底色',auto:'自动识别',opaque:'保留画面',black:'黑底去背景',white:'白底去背景',chroma:'色幕去背景',native:'原生 VAP 透明',
    mask:'上下渐变遮罩',enabled:'启用渐变',topStart:'上方透明边界',topEnd:'上方渐变结束',bottomStart:'下方渐变开始',bottomEnd:'下方透明边界',
    templates:'过稿模板',templateName:'模板名称',namePlaceholder:'输入模板名称',sharedHint:'模板及所选背景对全站访客可见。',
    maskPreview:'遮罩调整',maskExample:'示意',maskDrag:'在各自画面中上下拖动渐变线。',giftSettings:'画面设置',
    topStartShort:'上透',topEndShort:'上保',bottomStartShort:'下保',bottomEndShort:'下透',
    createTemplate:'创建模板',saveTemplate:'保存模板',close:'关闭',
    export:'导出对比 MP4',cancel:'取消',download:'下载 MP4',
    reading:'正在读取视频…',readError:'有视频无法读取。请选择 200 MB、120 秒以内的 SDR MP4。',limit:'最多添加 6 路礼物。可单独替换某一路。',
    backgroundError:'背景无法读取。请选择 20 MB 以内的 PNG、JPG 或 WebP。',nameMissing:'请输入模板名称。',
    backgroundSaved:'房间背景已保存到云端。',backgroundStorage:'云端背景暂不可用，请稍后重试。',
    background_exists:'背景名称已存在。可从列表选用，或修改文件名后再上传。',background_limit:'云端背景已达到数量上限。',
    background_missing:'这张云端背景已无法读取，请重新选择。',invalid_background:'背景文件无效，请更换图片。',
    saved:'模板已保存到云端。',applied:'已套用模板。',storageError:'暂时无法读取模板，请稍后再试。',cloudError:'云端模板暂不可用，请稍后重试。',
    template_exists:'模板名称已存在。',template_limit:'云端模板已达到数量上限。',rate_limited:'创建过于频繁，请稍后重试。',
    invalid_template:'模板参数无效，请检查名称和设置。',backgroundSize:'背景压缩后仍过大，请选择更小的图片。',
    exporting:'正在合成对比视频…',exported:'对比视频已生成。',exportError:'合成失败，请重新尝试或用较短的视频。',encoder:'当前浏览器无法编码 H.264 MP4，请使用支持 WebCodecs 的 Chrome 或 Edge。',
    cancelled:'已取消合成。',stage:'房间对比预览',previewError:'预览无法绘制，请重新上传视频。',initialError:'过稿工具加载失败，请刷新后重试。',
  },
  en: {
    convertTab:'VAP tool',reviewTab:'Review preview',title:'Room gift review',
    settings:'Review settings',background:'Room background',ludo:'Hapi Ludo room',dark:'Dark comparison',custom:'Custom background',uploadBackground:'Choose local background…',uploadCloudBackground:'Add cloud background…',
    uploadVideo:'Upload {gift} MP4',count:'Video count',play:'Play together',pause:'Pause',timeline:'Playback time',slots:'Video adjustments',
    large:'Large gift',medium:'Medium gift',small:'Small gift',gift:'Gift',vehicle:'Vehicle',replace:'Replace',add:'Upload',remove:'Remove',
    scale:'Gift size',offsetY:'Vertical position',editHint:'Drag the video to move it. Drag the percentage handles to adjust the mask.',key:'Video background',auto:'Auto detect',opaque:'Keep picture',black:'Remove black',white:'Remove white',chroma:'Remove color screen',native:'Native VAP alpha',
    mask:'Vertical feather mask',enabled:'Enable feathering',topStart:'Top transparent edge',topEnd:'Top fade end',bottomStart:'Bottom fade start',bottomEnd:'Bottom transparent edge',
    templates:'Review templates',templateName:'Template name',namePlaceholder:'Name this template',sharedHint:'The template and selected background are visible to all site visitors.',
    maskPreview:'Mask adjustment',maskExample:'Sample',maskDrag:'Drag the guides up or down in each preview.',giftSettings:'Picture settings',
    topStartShort:'Top clear',topEndShort:'Top solid',bottomStartShort:'Bottom solid',bottomEndShort:'Bottom clear',
    createTemplate:'Create template',saveTemplate:'Save template',close:'Close',
    export:'Export comparison',cancel:'Cancel',download:'Download MP4',
    reading:'Reading videos…',readError:'A video could not be read. Choose an SDR MP4 under 200 MB and 120 seconds.',limit:'Up to six gifts. Replace an individual slot to make room.',
    backgroundError:'Choose a PNG, JPG or WebP background under 20 MB.',nameMissing:'Enter a template name.',
    backgroundSaved:'Room background saved to the cloud.',backgroundStorage:'Cloud backgrounds are unavailable. Try again shortly.',
    background_exists:'That background name already exists. Select it from the list or rename your file.',background_limit:'The cloud background library is full.',
    background_missing:'This cloud background could not be found. Choose another background.',invalid_background:'This background file is invalid. Choose a different image.',
    saved:'Template saved to the cloud.',applied:'Template applied.',storageError:'Templates are temporarily unavailable.',cloudError:'Cloud templates are unavailable. Try again shortly.',
    template_exists:'That template name already exists.',template_limit:'The shared template library is full.',rate_limited:'Too many templates were created. Try again shortly.',
    invalid_template:'Check the template name and settings.',backgroundSize:'The background is still too large after compression. Choose a smaller image.',
    exporting:'Compositing video…',exported:'Comparison video ready.',exportError:'Could not compose the video. Retry or use shorter clips.',encoder:'This browser cannot encode H.264 MP4. Use a WebCodecs-capable Chrome or Edge.',
    cancelled:'Export cancelled.',stage:'Room comparison preview',previewError:'The preview could not be drawn. Upload the videos again.',initialError:'Could not load the review tool. Refresh to retry.',
  },
};
const t = key => copy[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'][key];
const maskKeys = ['topStart', 'topEnd', 'bottomStart', 'bottomEnd'];
function label(index, count = state.count) {
  if (count === 2) return t('vehicle') + '-' + (index + 1);
  return index < 3 ? t(['large', 'medium', 'small'][index]) : t('gift') + ' ' + (index + 1);
}
const state = {
  active: false, tab: 'convert', engine: null, count: 3, slots: [],
  background: 'ludo', backgroundImage: null, backgroundFile: null, backgroundId: null, localBackgroundFile: null, cloudBackgrounds: [],
  cloudTemplates: [], localTemplates: [], templateSelection: '', templateName: '', target: null, time: 0, running: false, start: 0,
  busy: '', status: null, result: null, abort: null, renderer: null,
};
let initTask, animation, lastFrame = -1, previewLayout, selectedSlot, editorDrag, loadingSlot, fileDropZone, previewWidth = 0;
let templateDraft, templateListTask, backgroundListTask;
const playbackTileWidth = 192;
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
  const isInputStatus = ['reading', 'readError', 'limit', 'initialError'].includes(status?.key);
  const isExportStatus = ['exporting', 'exported', 'exportError', 'encoder', 'cancelled'].includes(status?.key);
  for (const [id, show] of [['InputStatus', isInputStatus], ['ExportStatus', isExportStatus], ['Status', !isInputStatus && !isExportStatus]]) {
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
  $('Play').querySelector('span').textContent = t(state.running ? 'pause' : 'play');
  $('Play').setAttribute('aria-pressed', String(state.running));
}
function sync() {
  const lock = busy() || !state.engine || !state.slots.length, anyClip = duration() > 0;
  for (const id of ['Background', 'Count', 'CreateTemplate', 'Templates']) $(id).disabled = lock;
  for (const id of ['TemplateFields', 'SaveTemplate', 'CloseTemplate']) $(id).disabled = busy();
  $('Timeline').disabled = $('Play').disabled = $('Export').disabled = lock || !anyClip;
  $('Export').textContent = t(state.busy === 'export' ? 'exporting' : 'export');
  $('Progress').hidden = $('Cancel').hidden = state.busy !== 'export';
  $('Download').hidden = !state.result || busy();
  if (state.result) {$('Download').href = state.result.url;$('Download').download = state.result.name;}
  else $('Download').removeAttribute('href');
  $('Count').value = state.count;
  syncBackgroundChoice(state);
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
function assignSlotValue(slot, key, value) {
  const [min, max] = settingBounds(slot, key);
  const next = Math.max(min, Math.min(max, Math.round(value)));
  if (settingValue(slot, key) === next) return false;
  if (maskKeys.includes(key)) slot.settings.mask[key] = next / 100;
  else slot.settings[key] = next;
  return true;
}
function setSlotValue(slot, key, value) {
  if (assignSlotValue(slot, key, value)) changed();
}
function syncSlot(slot) {
  const card = slot.card;
  if (!card) return;
  const clip = slot.clip, lock = busy();
  const name = card.querySelector('[data-name]');
  name.textContent = clip?.file.name || '';
  name.hidden = !clip;
  card.querySelector('[data-open]').textContent = t(clip ? 'replace' : 'add');
  card.querySelector('[data-remove]').hidden = !clip;
  card.querySelector('[data-settings]').hidden = !clip;
  for (const control of card.querySelectorAll('button,input,select')) control.disabled = lock;
  syncSlotSettings(slot, card, lock);
}
function syncSlotSettings(slot, card, lock = false) {
  card.querySelector('[data-native]').hidden = !slot.clip?.config;
  card.querySelector('[data-key-wrap]').hidden = !!slot.clip?.config;
  card.querySelector('[data-key]').value = slot.settings.key;
  const toggle = card.querySelector('[data-enable]');
  toggle.checked = slot.settings.mask.enabled;
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
function slotSettingsMarkup(visual = false) {
  const mask = '<label class="vap-switch-row"><span>' + t('enabled') +
    '</span><input type="checkbox" class="vap-switch" role="switch" data-enable></label>' + (visual ? '' : maskKeys.map(slider).join('')) +
    '<label data-key-wrap><span>' + t('key') + '</span><select data-key>' +
    [['auto','auto'],['opaque','opaque'],['black_luma','black'],['white_luma','white'],['chroma_key','chroma']]
      .map(([value,key]) => '<option value="' + value + '">' + t(key) + '</option>').join('') +
    '</select></label><p class="vap-hint" data-native hidden>' + t('native') + '</p>';
  return slider('scale') + slider('offsetY') + (visual ? mask : '<details><summary>' + t('mask') + '</summary>' + mask + '</details>');
}
function bindSlotSettings(slot, card, update) {
  card.querySelector('[data-enable]').addEventListener('change', event => {
    slot.settings.mask.enabled = event.target.checked;
    update();
  });
  card.querySelector('[data-key]').addEventListener('change', event => {
    slot.settings.key = event.target.value;
    update();
  });
  for (const input of card.querySelectorAll('[data-slider]')) input.addEventListener('input', () => {
    if (assignSlotValue(slot, input.dataset.slider, Number(input.value))) update();
  });
}
function renderSlots() {
  const open = new Set(shown().filter(slot => slot.card?.querySelector('details').open));
  $('Slots').replaceChildren(...shown().map((slot, index) => {
    const card = document.createElement('article');
    card.className = 'vap-review-slot';
    card.innerHTML = '<div class="vap-review-slot-head"><h3>' + label(index) +
      '</h3><div class="vap-review-actions"><button type="button" class="vap-button vap-secondary" data-open></button>' +
      '<button type="button" class="vap-button vap-secondary" data-remove>' + t('remove') + '</button></div></div>' +
      '<p class="vap-hint" data-name></p><div data-settings>' + slotSettingsMarkup() + '</div>';
    slot.card = card;
    card.querySelector('details').open = open.has(slot);
    card.querySelector('[data-open]').addEventListener('click', () => openFiles(index));
    card.querySelector('[data-remove]').addEventListener('click', () => {
      pause(); disposeClip(slot.clip); slot.clip = null; seek(Math.min(state.time, duration())); changed();
    });
    bindSlotSettings(slot, card, () => {
      selectedSlot = slot;
      changed();
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
  frame.style.setProperty('--review-ratio', previewLayout.width / previewLayout.height);
  renderEditors();
}
function placeEditor(element, rect, width, height) {
  element.style.left = rect.x / width * 100 + '%';
  element.style.top = rect.y / height * 100 + '%';
  element.style.width = rect.w / width * 100 + '%';
  element.style.height = rect.h / height * 100 + '%';
}
function guideMarkup(visual = false) {
  return maskKeys.map(key => '<div class="vap-review-guide-line" hidden><button type="button" class="vap-review-guide" data-adjust="' +
    key + '"' + (visual ? ' role="slider" aria-orientation="vertical"' : '') + '><span></span></button></div>').join('');
}
function syncMaskGuides(guides, slot, slotLabel, visible, visual = false) {
  for (const line of guides) {
    line.hidden = !visible;
    if (line.hidden) continue;
    const guide = line.firstElementChild, key = guide.dataset.adjust;
    const position = slot.settings.mask[key], value = settingValue(slot, key), percent = value + '%';
    line.style.top = position * 100 + '%';
    line.dataset.edge = position < .04 ? 'top' : position > .96 ? 'bottom' : '';
    const name = t(key);
    guide.title = name + ' ' + percent;
    guide.setAttribute('aria-label', slotLabel + ' · ' + name + (visual ? '' : ' ' + percent));
    if (visual) {
      const [min, max] = maskBounds(slot.settings.mask, key);
      guide.setAttribute('aria-valuemin', min);
      guide.setAttribute('aria-valuemax', max);
      guide.setAttribute('aria-valuenow', value);
      guide.setAttribute('aria-valuetext', percent);
    }
    guide.firstElementChild.textContent = visual ? t(key + 'Short') + ' ' + percent : percent;
  }
}
function renderEditors() {
  finishEditorDrag();
  $('Editors').replaceChildren(...shown().map((slot, index) => {
    const tile = previewLayout.tiles[index], room = {...tile, y: tile.y + tile.label};
    const editor = document.createElement('div');
    editor.className = 'vap-review-editor';
    editor.dataset.slot = index;
    editor.innerHTML = '<button type="button" class="vap-review-move" data-adjust="offsetY"></button>' +
      guideMarkup() +
      '<button type="button" class="vap-review-upload ft-upload-zone upload-ready" data-preview-upload="' + index + '">' +
      '<svg viewBox="38 20 84 84" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M56 76V29a5 5 0 0 1 5-5h26l17 17v35M87 25v12a4 4 0 0 0 4 4h12"/>' +
      '<path d="m48 76-6 12v8a4 4 0 0 0 4 4h68a4 4 0 0 0 4-4v-8l-6-12H95l-5 9H70l-5-9H48ZM43 88h22l5 5h20l5-5h22"/>' +
      '<path d="M80 74V51m-8 8 8-8 8 8" stroke-width="2.4"/></svg><span></span></button>';
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
    syncMaskGuides(guides, slot, label(index), selectedSlot === slot && settings.mask.enabled && !state.running);
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
  captureEditorDrag(event, handle, height, settingValue(slot, key), value => setSlotValue(slot, key, value));
}
function captureEditorDrag(event, handle, height, value, update) {
  editorDrag = {id:event.pointerId, handle, height, y:event.clientY, value, update};
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('is-adjusting');
  handle.focus({preventScroll:true});
  event.preventDefault();
}
function moveEditorDrag(event) {
  if (!editorDrag || editorDrag.id !== event.pointerId || busy()) return;
  const {update, height, y, value} = editorDrag;
  update(value + (event.clientY - y) / height * 100);
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
  const sources = clips.map(clip => clip && clip.video.readyState >= 2 && state.time < clip.duration ? clip.video : null);
  const pixelScale = state.running ? Math.min(1, (previewWidth || previewLayout.width) / previewLayout.width,
    playbackTileWidth / previewLayout.tiles[0].w) : 1;
  try {
    state.renderer.draw({
      background: state.backgroundImage, clips,
      settings: slots.map(slot => slot.settings), labels: slots.map((_, index) => label(index)),
      sources, showEmptyRooms: false, pixelScale,
      frameTimes: state.running ? undefined : sources.map(video => video && !video.seeking ? video.currentTime : undefined),
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
  if (state.running) {pause();draw();return;}
  previewWidth = $('Frame').clientWidth || previewWidth;
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
    video.addEventListener('seeked', () => {
      if (!state.running) draw();
      const slot = templateDraft?.slots.find(slot => slot.clip?.video === video);
      if (slot) drawTemplateMask(slot);
    });
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
function useBackground(key, file, image, id) {
  state.backgroundImage?.close();
  Object.assign(state, {background:key, backgroundFile:file, backgroundImage:image, backgroundId:id || null});
  if (key === 'custom' && !id) state.localBackgroundFile = file;
}
function syncBackgroundChoice(target) {
  const [field, local] = target === state ? ['Background', 'BackgroundCustom'] : ['TemplateBackground', 'TemplateCustom'];
  $(local).hidden = !target.localBackgroundFile;
  $(field).value = target.backgroundId ? 'cloud:' + target.backgroundId : target.background;
}

function readLocalTemplates() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fun-toolkit-vap-review', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('templates', {keyPath: 'name'});
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Template store blocked'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('templates')) {db.close();resolve([]);return;}
      const transaction = db.transaction('templates', 'readonly');
      const result = transaction.objectStore('templates').getAll();
      transaction.oncomplete = () => {db.close();resolve(result.result);};
      transaction.onabort = () => {db.close();reject(transaction.error);};
    };
  });
}
const templateApi = '/api/vap-review-templates';
const backgroundApi = '/api/vap-review-backgrounds';
async function reviewRequest(path, body) {
  const options = body === undefined ? {} : {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
  };
  const response = await fetch(path, {...options, cache:'no-store', signal:AbortSignal.timeout(12000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function renderTemplateOptions() {
  const select = $('Templates');
  const empty = new Option('', '');
  empty.disabled = empty.hidden = true;
  select.replaceChildren(empty,
    ...state.cloudTemplates.map(item => new Option(item.name, 'cloud:' + item.id)),
    ...state.localTemplates.map(item => new Option(item.name, 'local:' + item.name)));
  select.value = state.templateSelection;
}
function readTemplates() {
  if (templateListTask) return templateListTask;
  templateListTask = Promise.allSettled([reviewRequest(templateApi), readLocalTemplates()]).then(([cloud, local]) => {
    if (cloud.status === 'fulfilled' && Array.isArray(cloud.value.templates)) {
      const entries = new Map([...state.cloudTemplates, ...cloud.value.templates].map(item => [item.id,item]));
      state.cloudTemplates = [...entries.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (local.status === 'fulfilled') state.localTemplates = local.value.sort((a,b) => b.savedAt - a.savedAt);
    renderTemplateOptions();
  }).finally(() => {templateListTask = null;});
  return templateListTask;
}
function templateStatus(key, tone = 'error') {
  const node = $('TemplateStatus');
  node.hidden = !key;
  node.textContent = key ? t(key) : '';
  node.dataset.tone = tone;
}
function renderBackgroundOptions() {
  for (const id of ['Background', 'TemplateBackground']) {
    const field = $(id);
    field.querySelectorAll('[data-cloud-background]').forEach(option => option.remove());
    const pick = field.querySelector('[value="pick"]');
    for (const background of state.cloudBackgrounds) {
      const option = new Option(background.name, 'cloud:' + background.id);
      option.dataset.cloudBackground = '';
      pick.before(option);
    }
  }
  syncBackgroundChoice(state);
  if (templateDraft) syncBackgroundChoice(templateDraft);
}
function rememberBackground({id, name, createdAt}) {
  if (state.cloudBackgrounds.some(background => background.id === id)) return;
  state.cloudBackgrounds.unshift({id, name, createdAt});
  renderBackgroundOptions();
}
function readBackgrounds() {
  if (backgroundListTask) return backgroundListTask;
  backgroundListTask = reviewRequest(backgroundApi).then(({backgrounds}) => {
    const known = new Set(state.cloudBackgrounds.map(background => background.id));
    const additions = backgrounds.filter(background => !known.has(background.id));
    if (!additions.length) return;
    state.cloudBackgrounds = [...state.cloudBackgrounds, ...additions].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    renderBackgroundOptions();
  }).catch(() => {}).finally(() => {backgroundListTask = null;});
  return backgroundListTask;
}
async function cloudBackgroundFile(id) {
  const entry = await reviewRequest(backgroundApi + '/' + encodeURIComponent(id));
  const file = await fetch(entry.backgroundImage).then(response => response.blob());
  rememberBackground(entry);
  return file;
}
const templateLayout = {width:180, height:390, tiles:[{x:0, y:0, w:180, h:390, label:0}]};
const currentTemplateSlot = () => templateDraft.slots[templateDraft.activeSlot];
function templateExample() {
  const sample = document.createElement('canvas');
  sample.width = templateLayout.width; sample.height = templateLayout.height;
  const ctx = sample.getContext('2d');
  const light = ctx.createRadialGradient(90, 190, 18, 90, 190, 225);
  light.addColorStop(0, '#91dfff');
  light.addColorStop(.45, '#4486ed');
  light.addColorStop(1, '#543a9d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, sample.width, sample.height);
  ctx.strokeStyle = '#ffffff40';
  for (let y = 15; y < sample.height; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sample.width, y); ctx.stroke();
  }
  return sample;
}
function drawTemplateMask(slot) {
  if (!slot.renderer) return;
  const {previewBackground, example, count} = templateDraft;
  const source = slot.clip?.video.readyState >= 2 ? slot.clip.video : example;
  const sample = source === example;
  const clip = sample ? {width:example.width, height:example.height, meta:{}} : slot.clip;
  slot.card.querySelector('[data-example]').hidden = !sample;
  slot.renderer.draw({
    background:previewBackground, clips:[clip], sources:[source], settings:[sample ? {...slot.settings, key:'opaque'} : slot.settings], labels:[''],
    frameTimes:[sample ? 0 : source.seeking ? undefined : source.currentTime],
  });
  syncMaskGuides(slot.card.querySelector('.vap-review-template-guides').children, slot, label(slot.index, count), slot.settings.mask.enabled, true);
}
function renderTemplateEditor() {
  const draft = templateDraft, slot = currentTemplateSlot(), card = $('TemplateControls');
  for (const preview of $('TemplateSlots').children) {
    const selected = Number(preview.dataset.templateSlot) === draft.activeSlot;
    preview.classList.toggle('is-selected', selected);
    preview.firstElementChild.setAttribute('aria-pressed', String(selected));
  }
  $('TemplateAdjustTitle').textContent = label(slot.index, draft.count) + ' · ' + t('giftSettings');
  card.innerHTML = slotSettingsMarkup(true);
  bindSlotSettings(slot, card, () => {syncSlotSettings(slot, card);drawTemplateMask(slot);});
  syncSlotSettings(slot, card);
}
function selectTemplateSlot(index) {
  if (templateDraft.activeSlot === index) return;
  templateDraft.activeSlot = index;
  renderTemplateEditor();
}
function disposeTemplatePreviews() {
  for (const slot of templateDraft.slots) {
    slot.renderer?.dispose();
    slot.renderer = slot.card = null;
  }
}
function renderTemplateSlots() {
  finishEditorDrag();
  disposeTemplatePreviews();
  const {slots, count} = templateDraft, grid = $('TemplateSlots');
  templateDraft.activeSlot = Math.min(templateDraft.activeSlot, count - 1);
  grid.replaceChildren(...slots.slice(0, count).map(slot => {
    const card = document.createElement('div');
    card.className = 'vap-review-template-tile';
    card.dataset.templateSlot = slot.index;
    card.innerHTML = '<button type="button" class="vap-review-template-label" aria-controls="vapReviewTemplateEditor"><span>' +
      label(slot.index, count) + '</span><span data-example hidden>' + t('maskExample') + '</span></button>' +
      '<div class="vap-review-template-preview"><canvas aria-hidden="true"></canvas>' +
      '<div class="vap-review-template-guides">' + guideMarkup(true) + '</div></div>';
    card.firstElementChild.addEventListener('click', () => selectTemplateSlot(slot.index));
    slot.card = card;
    slot.renderer = state.engine.createReviewRenderer(card.querySelector('canvas'), templateLayout);
    drawTemplateMask(slot);
    return card;
  }));
  grid.style.setProperty('--template-columns', Math.min(3, count));
  grid.style.setProperty('--template-mobile-columns', Math.min(2, count));
  renderTemplateEditor();
}
function openTemplateDialog() {
  if (busy() || !state.engine) return;
  pause();
  templateDraft = {
    background:state.background, backgroundFile:state.backgroundFile, backgroundId:state.backgroundId,
    localBackgroundFile:state.localBackgroundFile, count:state.count,
    activeSlot:Math.max(0, shown().indexOf(selectedSlot)), previewBackground:state.backgroundImage,
    example:templateExample(),
    slots:state.slots.map((slot, index) => ({index, clip:slot.clip, settings:{...slot.settings, mask:{...slot.settings.mask}}})),
  };
  $('TemplateName').value = '';
  $('TemplateCount').value = templateDraft.count;
  syncBackgroundChoice(templateDraft);
  renderTemplateSlots();
  templateStatus();
  $('TemplateDialog').showModal();
  void readBackgrounds();
}
async function changeBackground(target, choice, file) {
  if (!target || busy()) return;
  const inTemplate = target !== state, uploading = choice === 'upload';
  const cloud = uploading || choice.startsWith('cloud:');
  const isCurrent = () => !inTemplate || target === templateDraft && $('TemplateDialog').open;
  const status = (key, tone) => {if (isCurrent()) (inTemplate ? templateStatus : report)(key, tone);};
  state.busy = 'background';sync();status();
  let image;
  try {
    let id = choice.startsWith('cloud:') ? choice.slice(6) : null;
    const key = cloud || choice === 'pick' ? 'custom' : choice;
    if (uploading) {
      const stem = file.name.replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().normalize('NFC');
      const name = [...stem].slice(0, 40).join('') || t('custom');
      file = await compressTemplateBackground(file);
      image = await readBackground(key, file);
      const entry = await reviewRequest(backgroundApi, {name, backgroundImage:await backgroundDataUrl(file)});
      id = entry.id;
      rememberBackground(entry);
    } else {
      file = id ? await cloudBackgroundFile(id) : key === 'custom' ? file || target.localBackgroundFile : null;
      image = await readBackground(key, file);
    }
    if (!isCurrent()) return;
    if (inTemplate) {
      target.ownedBackground?.close();
      Object.assign(target, {background:key, backgroundFile:file, backgroundId:id, ownedBackground:image, previewBackground:image});
      if (key === 'custom' && !id) target.localBackgroundFile = file;
      image = null;
      target.slots.forEach(drawTemplateMask);
    } else {
      useBackground(key, file, image, id);
      image = null;
      changed();
    }
    if (uploading) status('backgroundSaved', 'success');
  } catch (error) {
    const known = ['background_exists', 'background_limit', 'invalid_background', 'rate_limited', 'backgroundSize'];
    status(known.includes(error.message) ? error.message : cloud ? 'backgroundStorage' : 'backgroundError', 'error');
  } finally {
    image?.close();
    state.busy = '';sync();
    if (inTemplate && isCurrent()) syncBackgroundChoice(target);
    draw();
  }
}
async function compressTemplateBackground(file) {
  const image = await readBackground('custom', file);
  const surface = document.createElement('canvas');
  surface.width = 720;surface.height = 1560;
  try {
    const ctx = surface.getContext('2d');
    const ratio = Math.max(surface.width / image.width, surface.height / image.height);
    const w = image.width * ratio, h = image.height * ratio;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (surface.width - w) / 2, (surface.height - h) / 2, w, h);
    for (const quality of [.92,.8,.65,.5]) {
      const blob = await new Promise(resolve => surface.toBlob(resolve, 'image/webp', quality));
      if (blob?.type === 'image/webp' && blob.size <= 512 * 1024) return blob;
    }
    throw new Error('backgroundSize');
  } finally {image.close();surface.width = surface.height = 1;}
}
function backgroundDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function useTemplate(settings, name, image, selection) {
  useBackground(settings.background, settings.backgroundFile, image, settings.backgroundId);
  state.count = settings.slots.length;
  settings.slots.forEach((value, index) => {state.slots[index].settings = value;});
  state.templateName = name;
  state.templateSelection = selection;
  renderTemplateOptions();
  discardResult();renderSlots();updateLayout();seek(0);
}
async function saveTemplate(event) {
  event.preventDefault();
  if (!templateDraft || busy()) return;
  const name = $('TemplateName').value.trim();
  if (!name) {templateStatus('nameMissing');$('TemplateName').focus();return;}
  const draft = templateDraft;
  state.busy = 'template';sync();templateStatus();
  let image;
  try {
    const settings = state.engine.normalizeReviewTemplate({
      background: draft.background, backgroundFile: draft.backgroundFile, slots: draft.slots.slice(0, draft.count).map(slot => slot.settings),
    });
    const {backgroundId} = draft;
    if (settings.backgroundFile && !backgroundId) settings.backgroundFile = await compressTemplateBackground(settings.backgroundFile);
    image = await readBackground(settings.background, settings.backgroundFile);
    const {background, slots} = settings;
    const receipt = await reviewRequest(templateApi, {
      name, background, slots, backgroundImage: !backgroundId && settings.backgroundFile ? await backgroundDataUrl(settings.backgroundFile) : null,
      ...(backgroundId ? {backgroundId} : {}),
    });
    state.cloudTemplates.unshift(receipt);
    useTemplate({...settings, backgroundId}, receipt.name, image, 'cloud:' + receipt.id);
    image = null;
    $('TemplateDialog').close();
    report('saved','success');
  } catch (error) {
    const known = ['template_exists', 'template_limit', 'rate_limited', 'invalid_template', 'backgroundSize', 'background_missing'];
    templateStatus(known.includes(error.message) ? error.message : 'cloudError');
  } finally {image?.close();state.busy = '';sync();draw();}
}
async function applyTemplate() {
  if (busy()) return;
  const selection = $('Templates').value;
  if (!selection) {state.templateSelection = '';state.templateName = '';return;}
  pause(); state.busy = 'template';sync();
  try {
    const template = selection.startsWith('cloud:')
      ? await reviewRequest(templateApi + '/' + encodeURIComponent(selection.slice(6)))
      : state.localTemplates.find(item => item.name === selection.slice(6));
    if (template.backgroundId)
      template.backgroundFile = await cloudBackgroundFile(template.backgroundId);
    else if (template.background === 'custom' && template.backgroundImage)
      template.backgroundFile = await fetch(template.backgroundImage).then(response => response.blob());
    const settings = state.engine.normalizeReviewTemplate(template);
    const image = await readBackground(settings.background, settings.backgroundFile);
    useTemplate({...settings, backgroundId:template.backgroundId}, template.name, image, selection);
    report('applied','success');
  } catch (error) {
    $('Templates').value = state.templateSelection;
    report('storageError','error');
  } finally {state.busy = '';sync();draw();}
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
    const name = (state.templateName || 'vap-gift-review').replace(/[\\/:*?"<>|]/g, '-');
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
      state.engine = await import('./vap-review-engine.mjs?v=20261110-review-hd-compact');
      state.slots = Array.from({length: state.engine.MAX_REVIEW_SLOTS}, () => ({settings: state.engine.defaultReviewSlot(), clip: null}));
      state.backgroundImage = await readBackground('ludo');
      renderSlots();updateLayout();
      void readTemplates();
      void readBackgrounds();
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
  if ((!reviewingTab || !state.active) && $('TemplateDialog').open) $('TemplateDialog').close();
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
  renderTemplateOptions();
  if (templateDraft) renderTemplateSlots();
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
for (const [prefix, current] of [['', () => state], ['Template', () => templateDraft]]) {
  const field = $(prefix + 'Background'), picker = $(prefix + 'BackgroundFile');
  field.addEventListener('focus', () => {if (!busy()) void readBackgrounds();});
  field.addEventListener('change', () => {
    const target = current(), choice = field.value;
    if (!target) return;
    if (choice === 'pick' || choice === 'upload') {
      syncBackgroundChoice(target);
      picker.dataset.choice = choice;
      picker.click();
    } else void changeBackground(target, choice);
  });
  picker.addEventListener('change', () => {
    const file = picker.files[0], choice = picker.dataset.choice;
    picker.value = '';delete picker.dataset.choice;
    if (file && choice) void changeBackground(current(), choice, file);
  });
}
$('Play').addEventListener('click', play);
$('Timeline').addEventListener('input', event => {
  const time = event.currentTarget.valueAsNumber;
  pause();
  seek(time);
});
$('CreateTemplate').addEventListener('click', openTemplateDialog);
$('CloseTemplate').addEventListener('click', () => $('TemplateDialog').close());
$('TemplateDialog').addEventListener('close', () => {
  if ($('TemplateDialog').open || !templateDraft) return;
  finishEditorDrag();
  disposeTemplatePreviews();
  templateDraft.ownedBackground?.close();
  templateDraft = null;
});
$('TemplateDialog').addEventListener('cancel', event => {if (busy()) event.preventDefault();});
$('TemplateForm').addEventListener('submit', saveTemplate);
$('TemplateSlots').addEventListener('pointerdown', event => {
  const handle = event.target.closest('[data-adjust]') || event.target.closest('.vap-review-guide-line')?.firstElementChild;
  if (!handle || !templateDraft || busy() || editorDrag || !event.isPrimary || event.button !== 0) return;
  const index = Number(handle.closest('[data-template-slot]').dataset.templateSlot);
  const slot = templateDraft.slots[index], key = handle.dataset.adjust;
  const {height} = handle.closest('.vap-review-template-preview').getBoundingClientRect();
  selectTemplateSlot(index);
  if (height) captureEditorDrag(event, handle, height, settingValue(slot, key), value => {
    if (assignSlotValue(slot, key, value)) drawTemplateMask(slot);
  });
});
$('TemplateSlots').addEventListener('pointermove', moveEditorDrag);
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('TemplateSlots').addEventListener(event, finishEditorDrag);
$('TemplateSlots').addEventListener('keydown', event => {
  const handle = event.target.closest('[data-adjust]');
  if (!handle || !templateDraft || busy() || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const index = Number(handle.closest('[data-template-slot]').dataset.templateSlot);
  const slot = templateDraft.slots[index], key = handle.dataset.adjust, [min,max] = settingBounds(slot, key);
  selectTemplateSlot(index);
  const direction = ['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1;
  const value = event.key === 'Home' ? min : event.key === 'End' ? max : settingValue(slot, key) + direction * (event.shiftKey ? 5 : 1);
  if (assignSlotValue(slot, key, value)) drawTemplateMask(slot);
});
$('TemplateCount').addEventListener('change', event => {
  templateDraft.count = Number(event.target.value);renderTemplateSlots();
});
$('Templates').addEventListener('focus', () => {if (!busy()) void readTemplates();});
$('Templates').addEventListener('change', applyTemplate);
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
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(([entry]) => {if (entry.contentRect.width > 0) previewWidth = entry.contentRect.width;}).observe($('Frame'));
}
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
