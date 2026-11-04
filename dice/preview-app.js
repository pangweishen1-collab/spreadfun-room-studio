import { connectEmbedded } from './embed.mjs';
import { bindDiceUploads } from './upload-input.mjs';
import { localApi } from './local-preview.mjs';
import { GameRenderer } from '/dice/renderer.js';
import { t, errorText, applyTranslations, toggleLanguage, getLanguage } from '/dice/preview-i18n.js';

const $ = id => document.getElementById(id);
const SLOTS = ['大骰子', '1', '2', ...Array.from({length:7}, (_, index) => 'sz_' + index)];
let session = null, pending = new Map(), grade = 'green', busy = false;
let renderer = null, previewReady = false, hasCanvas = false, loadingPreview = false;
let activity = null, notice = null, currentError = null, playback = null, hasPlayed = false, toastTimer;
let embedded = null;

function issue(key, values) { return Object.assign(new Error(key), {key, values}); }
function slotFor(name) {
  if (!/\.png$/i.test(name) || /[/\\]/.test(name)) return null;
  const stem = name.slice(0, -4);
  const slot = stem.toLowerCase() === 'icon' ? '大骰子' : stem.toLowerCase();
  return SLOTS.includes(slot) ? slot : null;
}
function settings() {
  return {name:$('dice-name').value.trim(), grade, mode:'all',
    point:1, composition:$('composition').value};
}
function settingsDirty() {
  if (!session) return false;
  const values = settings();
  return Object.keys(values).some(key => values[key] !== session[key]);
}
function currentVideo(video = session?.video) {
  return video?.profile === 'loop6-v2' && video.duration === 6 && video.fps === 30 && video.frameCount === 180
    && video.width === 720 && video.height === 1600 && video.revision === session.revision
    && video.candidate === session.candidate?.id ? video : null;
}
function fillSettings(value) {
  $('dice-name').value = value.name;
  grade = value.grade;
  $('preview-mode').value = 'all';
  $('preview-point').value = '1';
  $('composition').value = value.composition;
}
function releasePending() {
  pending.forEach(file => URL.revokeObjectURL(file.previewUrl));
  pending = new Map();
}
const api = localApi;
const post = (path, body) => api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
function bytes(value) {
  return value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(value / 1024)) + ' KB';
}
function toast(key, values) {
  clearTimeout(toastTimer);
  const node = $('toast');
  node.textContent = t(key, values); node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
}
function download(url, extension) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) throw issue('invalidDownload');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = ((session?.name || t('defaultName')).replace(/[\/:*?"<>|]/g, '_')) + extension;
  if (window.parent !== window) {
    window.parent.postMessage({type:'fun-dice-download', url, fileName:anchor.download}, location.origin);
    return;
  }
  document.body.append(anchor); anchor.click(); anchor.remove();
}
function renderAssets() {
  const list = pending.size ? [...pending.values()] : session?.files || [];
  const files = new Map(list.map(file => [file.slot, file]));
  const grid = document.createDocumentFragment();
  for (const slot of SLOTS) {
    const file = files.get(slot);
    const item = document.createElement('div'); item.className = 'asset-slot ' + (file ? 'ready' : 'missing');
    const thumb = document.createElement('div'); thumb.className = 'asset-thumb checkerboard';
    if (file) {
      const image = document.createElement('img'); image.src = file.previewUrl || file.url;
      image.alt = file.name; image.width = 72; image.height = 72; thumb.append(image);
    } else { const mark = document.createElement('span'); mark.textContent = '—'; mark.setAttribute('aria-hidden','true'); thumb.append(mark); }
    const name = document.createElement('span'); name.className = 'asset-name';
    name.textContent = file?.name || slot + '.png'; name.title = name.textContent;
    const meta = document.createElement('span'); meta.className = 'asset-meta';
    meta.textContent = file ? `${file.width} × ${file.height}` : t('missingFile');
    item.append(thumb, name, meta); grid.append(item);
  }
  $('asset-grid').replaceChildren(grid);
  $('file-count').textContent = files.size + ' / 10 PNG';
}
function renderPlayback() {
  let key = 'notLoaded', values;
  if (previewReady) {
    key = playback?.playing ? (session?.mode === 'all' ? 'playing' : 'playingPoint') : hasPlayed ? 'paused' : 'readyToPlay';
    values = {point:playback?.target || session?.point || 1};
  }
  $('playback-status').textContent = t(key, values);
  $('play-preview').setAttribute('aria-pressed', String(Boolean(playback?.playing)));
}
function render() {
  const dirty = settingsDirty(), draft = pending.size > 0;
  const usable = Boolean(session) && !draft && !dirty;
  const clip = currentVideo();
  const ready = usable && previewReady && renderer?.candidate?.id === session?.candidate?.id;
  const locked = busy;
  $('controls-card').setAttribute('aria-busy', String(locked));
  $('upload-zone').setAttribute('aria-busy', String(locked));
  $('upload-zone').setAttribute('aria-disabled', String(locked));
  document.querySelector('.preview-card').dataset.hasCanvas = String(hasCanvas);
  $('preview-empty').setAttribute('aria-busy', String(locked));
  $('preview-empty').setAttribute('aria-disabled', String(locked));
  $('choose-files').disabled = locked; $('res-file-input').disabled = locked;
  $('choose-preview-files').disabled = locked;
  ['choose-preview-folder','choose-folder','res-folder-input'].forEach(id => { $(id).disabled = locked; });
  $('choose-files').querySelector('span').textContent = t('replaceFiles');
  $('pending-actions').hidden = !draft;
  $('import-preview').disabled = locked || pending.size !== 10;
  $('clear-pending').disabled = locked;
  $('dice-name').disabled = locked;
  $('preview-mode').disabled = locked;
  $('preview-point').disabled = locked || $('preview-mode').value !== 'single';
  $('composition').disabled = locked;
  document.querySelectorAll('[data-grade]').forEach(button => {
    const active = button.dataset.grade === grade;
    button.disabled = locked; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('apply-settings').hidden = !dirty || draft;
  $('apply-settings').disabled = locked;
  ['play-preview','pause-preview','reset-preview'].forEach(id => { $(id).disabled = locked || !ready; });
  $('export-video').disabled = locked || !usable || (!clip && (!ready || !session?.videoAvailable));
  $('export-video').querySelector('span').textContent = t(clip ? 'downloadExistingVideo' : 'exportVideo');
  $('download-bundle').disabled = locked || !usable;
  $('reload-preview').hidden = !session || (previewReady && currentError?.status !== 409);
  $('reload-preview').disabled = locked;
  $('activity-status').hidden = !activity;
  $('activity-message').textContent = activity ? t(activity.key, activity.values) : '';
  $('error-message').hidden = !currentError;
  $('error-message').textContent = currentError ? errorText(currentError) : '';
  $('preview-loading').hidden = !loadingPreview;
  $('preview-empty').hidden = hasCanvas;
  $('preview-empty').querySelector('.feedback-image').src = '/dice/assets/fun-toolkit/assets/feedback/' + (currentError ? 'empty-error.svg' : 'empty-upload.svg');
  $('preview-empty').querySelector('h3').textContent = t(currentError ? 'previewErrorTitle' : 'previewEmptyTitle');
  $('preview-empty').querySelector('p').textContent = currentError ? errorText(currentError) : t('previewEmptyHint');
  $('game-canvas').hidden = !hasCanvas;
  $('preview-stage').dataset.state = loadingPreview ? 'processing' : previewReady ? 'ready' : currentError ? 'error' : 'idle';
  $('session-meta').textContent = session ? t(session.grade === 'purple' ? 'purpleBackground' : 'greenBackground') : t('notLoaded');
  const missing = SLOTS.filter(slot => !pending.has(slot));
  const uploadStatus = $('upload-status');
  uploadStatus.dataset.state = draft ? 'pending' : 'success';
  if (draft && missing.length) uploadStatus.textContent = t('partialFiles', {count:pending.size, missing:missing.map(slot => slot + '.png').join(', ')});
  else if (draft) uploadStatus.textContent = t('replacingFiles');
  else if (dirty) { uploadStatus.textContent = t('settingsPending'); uploadStatus.dataset.state = 'pending'; }
  else { uploadStatus.textContent = notice?.key === 'videoInvalidated' ? t(notice.key) : ''; uploadStatus.dataset.state = 'pending'; }
  const composition = draft || dirty ? (settings().composition === 'auto' ? null : settings().composition) : session?.resolvedComposition;
  $('composition-status').textContent = composition ? t(composition === 'digits' ? 'digitsShort' : 'facesShort') : t('automatic');
  $('composition-status').dataset.state = composition ? 'applied' : '';
  $('composition-hint').textContent = t('compositionHint') + (session?.composition === 'auto' && composition ? ' ' + t(composition === 'digits' ? 'detectedDigits' : 'detectedFaces') : '');
  let videoKey = 'videoEmpty', videoValues;
  if (session && (draft || dirty)) videoKey = 'videoInvalidated';
  else if (clip) { videoKey = 'videoReady'; videoValues = {size:bytes(clip.size || 0)}; }
  else if (session && !session.videoAvailable) { videoKey = 'videoUnavailable'; videoValues = {reason:errorText(new Error(session.videoUnavailableReason || '本地 FFmpeg 不可用'))}; }
  else if (session) videoKey = 'videoOptional';
  $('video-details').textContent = ['videoEmpty','videoOptional'].includes(videoKey) ? '' : t(videoKey, videoValues);
  $('video-details').hidden = !session || ['videoEmpty','videoOptional'].includes(videoKey);
  renderAssets(); renderPlayback();
}
async function run(key, operation) {
  if (busy) return;
  busy = true; currentError = null; notice = null; activity = key ? {key} : null; render();
  try { await operation(); }
  catch (error) { currentError = error; }
  finally { busy = false; activity = null; render(); }
}
async function loadSession(next, reusePresentation = false) {
  if (!next?.id || !next.candidate) throw issue('requestFailed');
  if (reusePresentation && renderer && previewReady && hasCanvas
    && await renderer.patchPresentation(next.candidate)) {
    session = next; fillSettings(next); render();
    return;
  }
  session = next; fillSettings(next); previewReady = false;
  loadingPreview = true; hasPlayed = false; render();
  try {
    if (!renderer) throw issue('rendererFailed');
    await renderer.load(next.candidate);
    renderer.configure(next.mode, next.point);
    previewReady = true; hasCanvas = true;
    hasPlayed = true;
    renderer.play();
  } catch (error) {
    if (error.key === 'rendererFailed') throw error;
    throw Object.assign(issue('previewLoadFailed'), {cause:error});
  } finally { loadingPreview = false; render(); }
}
async function readPng(file, slot) {
  if (!file.size || file.size > 12 * 1024 * 1024) throw issue('tooLarge', {file:file.name});
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (![137,80,78,71,13,10,26,10].every((value,index) => signature[index] === value)) throw issue('invalidPng', {file:file.name});
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(issue('invalidPng', {file:file.name})); image.src = previewUrl; });
    const expected = slot === '大骰子' ? 240 : 200;
    if (image.naturalWidth !== expected || image.naturalHeight !== expected) throw issue('invalidSize', {file:file.name, size:`${expected} × ${expected}`});
    const data = await new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(issue('readFailed', {file:file.name})); reader.readAsDataURL(file);
    });
    return {name:file.name, slot, data, previewUrl, width:expected, height:expected, size:file.size};
  } catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
}
async function importPending() {
  if (pending.size !== 10) throw issue('incompleteFiles');
  const values = settings();
  if (!values.name || values.name.length > 80) throw issue('nameRequired');
  activity = {key:'buildingPreview'}; render();
  const next = await post('/api/preview/import', {...values, files:SLOTS.map(slot => { const file=pending.get(slot); return {name:file.name, data:file.data}; })});
  releasePending();
  await loadSession(next);
  toast('importSuccess');
}
async function stageFiles(files) {
  if (!files.length) throw issue('noFiles');
  const unknown = files.filter(file => !slotFor(file.name));
  if (unknown.length) throw issue('unknownFiles', {files:unknown.map(file => file.name).join(', ')});
  const seen = new Set(), duplicates = [];
  files.forEach(file => { const slot=slotFor(file.name); if (seen.has(slot)) duplicates.push(file.name); seen.add(slot); });
  if (duplicates.length) throw issue('duplicateFiles', {files:duplicates.join(', ')});
  const results = await Promise.allSettled(files.map(file => readPng(file, slotFor(file.name))));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) { results.forEach(result => { if (result.status === 'fulfilled') URL.revokeObjectURL(result.value.previewUrl); }); throw failed.reason; }
  if (files.length === 10) releasePending();
  for (const result of results) {
    const file = result.value, previous = pending.get(file.slot);
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    pending.set(file.slot, file);
  }
  if (!$('dice-name').value.trim()) $('dice-name').value = t('defaultName');
  render();
  if (pending.size === 10) await importPending();
}
async function saveSettings() {
  if (!session || pending.size || !settingsDirty()) return;
  const values = settings();
  if (!values.name || values.name.length > 80) throw issue('nameRequired');
  const hadVideo = Boolean(currentVideo());
  const next = await post(`/api/preview/${session.id}/settings`, {...values, expectedRevision:session.revision});
  const presentationOnly = session.id === next.id && session.mode === next.mode
    && session.point === next.point && session.resolvedComposition === next.resolvedComposition;
  await loadSession(next, presentationOnly);
  notice = hadVideo && !next.video ? {key:'videoInvalidated'} : null;
}
function settingsChanged() {
  currentError = null; render();
  if (session && !pending.size && settingsDirty()) return run(null, saveSettings);
}
async function exportVideo() {
  if (!session || settingsDirty() || pending.size) return;
  const clip = currentVideo();
  if (clip) { download(clip.url, '.mp4'); toast('videoReused'); return; }
  if (!previewReady) return;
  const current = {id:session.id, revision:session.revision, candidate:session.candidate.id};
  const started = performance.now();
  activity = {key:'recording'}; render();
  const blob = await renderer.recordLoop(6);
  activity = {key:'encoding'}; render();
  const video = await api(`/api/preview/${current.id}/video`, {method:'POST', headers:{'Content-Type':blob.type, 'X-Preview-Revision':String(current.revision), 'X-Candidate-Id':current.candidate}, body:blob});
  if (session.id !== current.id || session.revision !== current.revision || session.candidate.id !== current.candidate) throw issue('videoMismatch');
  if (!currentVideo(video)) throw issue('videoMismatch');
  download(video.url, '.mp4');
  session.video = video;
  const values = {seconds:((performance.now()-started)/1000).toFixed(1)};
  toast('videoSuccess', values);
}
function bindUploads() {
  bindDiceUploads({primaryZone:$('preview-empty'), replacementZone:$('upload-zone'),
    primaryButton:$('choose-preview-files'), replacementButton:$('choose-files'), input:$('res-file-input'),
    folderInput:$('res-folder-input'), primaryFolderButton:$('choose-preview-folder'), replacementFolderButton:$('choose-folder'),
    onEmptyFolder:() => run(null, () => { throw issue('folderEmpty'); }),
    isBusy:() => busy, hasPreview:() => hasCanvas, isActive:() => embedded?.isActive() ?? true, onFiles:importFiles});
}
function importFiles(value) {
  const files = Array.from(value || []);
  if (files.length) return run('readingFiles', () => stageFiles(files));
}
function openDialog(id) { const dialog=$(id); if (!dialog.open) dialog.showModal(); }

applyTranslations();
try {
  renderer = new GameRenderer($('game-canvas'), state => { playback=state; renderPlayback(); });
  renderer.setLooping(true, 2);
}
catch { currentError = issue('rendererFailed'); }
bindUploads();
$('language-toggle').addEventListener('click', toggleLanguage);
document.addEventListener('previewlanguagechange', () => { $('toast').hidden=true; render(); });
$('help-button').addEventListener('click', () => openDialog('help-dialog'));
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('author-button').addEventListener('click', () => openDialog('author-dialog'));
$('close-author').addEventListener('click', () => $('author-dialog').close());
$('dice-name').addEventListener('input', () => { if (!busy) render(); });
$('dice-name').addEventListener('change', settingsChanged);
['preview-mode','preview-point','composition'].forEach(id => $(id).addEventListener('change', settingsChanged));
document.querySelectorAll('[data-grade]').forEach(button => button.addEventListener('click', () => { if (!busy) { grade=button.dataset.grade; settingsChanged(); } }));
$('apply-settings').addEventListener('click', () => run('updatingSettings', saveSettings));
$('import-preview').addEventListener('click', () => run('buildingPreview', importPending));
$('clear-pending').addEventListener('click', () => { if (busy) return; releasePending(); if (session) fillSettings(session); currentError=null; notice=null; toast('replacementCancelled'); render(); });
$('reload-preview').addEventListener('click', () => run('loadingPreview', async () => { if (session) await loadSession(await api('/api/preview/' + session.id)); }));
function play(action) { if (busy || !previewReady || pending.size || settingsDirty()) return; hasPlayed=true; renderer[action](); renderPlayback(); }
$('play-preview').addEventListener('click', () => play('play'));
$('pause-preview').addEventListener('click', () => play('pause'));
$('reset-preview').addEventListener('click', () => play('reset'));
$('game-canvas').addEventListener('click', () => play('play'));
$('export-video').addEventListener('click', () => run('recording', exportVideo));
$('download-bundle').addEventListener('click', () => run('bundling', async () => { if (!session || pending.size || settingsDirty()) return; const result=await api(`/api/preview/${session.id}/bundle`); download(result.url,'.zip'); toast('downloadStarted'); }));
window.addEventListener('beforeunload', () => { pending.forEach(file => URL.revokeObjectURL(file.previewUrl)); renderer?.pause(); });
embedded = connectEmbedded(renderer, {onFiles:importFiles, isBusy:() => busy});
render();
