import { connectEmbedded } from './embed.mjs';
import { bindDiceUploads } from './upload-input.mjs';
import { VIDEO_SPEC } from './video-export.mjs';
import { DiceAudio } from './audio.mjs';
import { localApi } from './local-preview.mjs';
import { GameRenderer } from '/dice/renderer.js';
import { t, errorText, applyTranslations, toggleLanguage, getLanguage } from '/dice/preview-i18n.js';

const $ = id => document.getElementById(id);
const GREEN_SLOTS = Array.from({length:6}, (_,i) => 'sz_'+(i+1));
const SLOTS = ['大骰子', '1', '2', ...Array.from({length:7}, (_, index) => 'sz_' + index)];
let session = null, pending = new Map(), grade = 'green', busy = false;
let renderer = null, previewReady = false, hasCanvas = false, loadingPreview = false;
let activity = null, notice = null, currentError = null, toastTimer;
let embedded = null, audioWarning='', audioSignature='';
const gradeSessions = new Map(), audio = new DiceAudio();
const requiredSlots = () => grade === 'green' ? GREEN_SLOTS : SLOTS;
let greenExtras = [];
function greenSlot(file) {
 const name=file.name.normalize('NFKC').trim().toLowerCase(),stem=name.replace(/\.png$/i,'');
 const m=/^(?:sz[_ -]?|face[_ -]?)?([1-6])$/.exec(stem);
 return /\.png$/i.test(name) && m ? 'sz_'+m[1] : null;
}
function syncRound(status) {
 if (!status.playing || !renderer?.visible || document.hidden) audio.stop();
 else if (status.elapsed < .1) audio.playRound({six:true});
}

function issue(key, values) { return Object.assign(new Error(key), {key, values}); }
function slotFor(name) {
  if (!/\.png$/i.test(name) || /[/\\]/.test(name)) return null;
  const stem = name.slice(0, -4);
  const slot = stem.toLowerCase() === 'icon' ? '大骰子' : stem.toLowerCase();
  return SLOTS.includes(slot) ? slot : null;
}
function settings() {
  return {name:$('dice-name').value.trim(), grade, mode:'all',
    point:1, composition:grade === 'green' ? 'faces' : $('composition').value, soundEnabled:$('sound-enabled').checked};
}
function settingsDirty() {
  if (!session) return false;
  const values = settings();
  return Object.keys(values).some(key => values[key] !== session[key]);
}
function currentVideo(video = session?.video) {
  return video?.profile === VIDEO_SPEC.profile && video.size > 0 && video.size <= VIDEO_SPEC.maxBytes && video.duration === 6 && video.fps === 30 && video.frameCount === 180
    && video.width === 720 && video.height === 1600 && video.revision === session.revision
    && video.candidate === session.candidate?.id ? video : null;
}
function fillSettings(value) {
  $('dice-name').value = value.name;
  grade = value.grade;
  $('preview-mode').value = 'all';
  $('preview-point').value = '1';
  $('composition').value = value.composition;
  $('sound-enabled').checked = value.soundEnabled !== false; audio.setEnabled(value.soundEnabled !== false);
}
function releasePending() {
  pending.forEach(file => URL.revokeObjectURL(file.previewUrl));
  pending = new Map(); greenExtras = [];
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
  for (const slot of requiredSlots()) {
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
  $('file-count').textContent = requiredSlots().filter(slot=>files.has(slot)).length + ' / '+requiredSlots().length+' PNG';
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
  $('import-preview').disabled = locked || requiredSlots().some(slot=>!pending.has(slot));
  $('clear-pending').disabled = locked;
  $('dice-name').disabled = locked;
  $('preview-mode').disabled = locked;
  $('preview-point').disabled = locked || $('preview-mode').value !== 'single';
  $('composition').disabled = locked;
  $('composition-section').hidden = grade === 'green';
  $('sound-enabled').disabled = locked;
  $('audio-warning').textContent=audioWarning; $('audio-warning').hidden=!audioWarning;
  $('preview-empty').querySelector('h3').textContent = t(grade === 'green' ? 'greenEmptyTitle' : 'previewEmptyTitle');
  $('asset-grid').setAttribute('aria-label',t(grade === 'green' ? 'greenAssetStatus' : 'assetStatus'));
  $('grade-upload-hint').textContent=t(grade === 'green' ? 'greenUploadHint' : 'purpleUploadHint');
  document.querySelectorAll('[data-grade]').forEach(button => {
    const active = button.dataset.grade === grade;
    button.disabled = locked; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('apply-settings').hidden = !dirty || draft;
  $('apply-settings').disabled = locked;
  $('export-video').disabled = locked || !usable || (!clip && (!ready || !session?.videoAvailable));
  $('export-video').querySelector('span').textContent = t(clip ? 'downloadExistingVideo' : 'exportVideo');
  $('download-bundle').disabled = locked || !usable;
  $('reload-preview').hidden = !session || (previewReady && currentError?.status !== 409);
  $('reload-preview').disabled = locked;
  $('activity-status').hidden = !activity;
  $('activity-message').textContent = activity ? t(activity.key, activity.values) : '';
  $('error-message').hidden = !currentError;
  $('error-message').textContent = currentError ? errorText(currentError) : '';
  $('preview-loading').hidden = !loadingPreview || hasCanvas;
  $('preview-empty').hidden = hasCanvas;
  $('preview-empty').querySelector('.feedback-image').src = '/dice/assets/fun-toolkit/assets/feedback/' + (currentError ? 'empty-error.svg' : 'empty-upload.svg');
  $('preview-empty').querySelector('h3').textContent = t(currentError ? 'previewErrorTitle' : grade === 'green' ? 'greenEmptyTitle' : 'previewEmptyTitle');
  $('preview-empty').querySelector('p').textContent = currentError ? errorText(currentError) : t('previewEmptyHint');
  $('game-canvas').hidden = !hasCanvas;
  $('preview-stage').dataset.state = loadingPreview ? 'processing' : previewReady ? 'ready' : currentError ? 'error' : 'idle';
  $('session-meta').textContent = session ? t(session.grade === 'purple' ? 'purpleBackground' : 'greenBackground') : t('notLoaded');
  const missing = requiredSlots().filter(slot => !pending.has(slot));
  const uploadStatus = $('upload-status');
  uploadStatus.dataset.state = draft ? 'pending' : 'success';
  if (draft && missing.length) uploadStatus.textContent = t(grade === 'green' ? 'greenPartialFiles' : 'partialFiles', {count:pending.size, missing:missing.map(slot => slot + '.png').join(', ')});
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
  renderAssets();
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
  audioWarning=''; audio.setEnabled(next.soundEnabled !== false);
  const audioKey=JSON.stringify(next.candidate.audio||{});
  if(next.soundEnabled !== false && (audioKey!==audioSignature || !audio.ready)) {
    try { await audio.load(next.candidate.audio); audioSignature=audioKey; }
    catch(error) { audioWarning=error.message; audio.setEnabled(false); }
  }
  if (reusePresentation && renderer && previewReady && hasCanvas
    && await renderer.patchPresentation(next.candidate)) {
    session = next; gradeSessions.set(next.grade,next); fillSettings(next); render();
    return;
  }
  const previous = session;
  fillSettings(next); previewReady = false;
  loadingPreview = true; render();
  try {
    if (!renderer) throw issue('rendererFailed');
    await renderer.load(next.candidate);
    session = next; gradeSessions.set(next.grade,next);
    audio.setEnabled(next.soundEnabled !== false && !audioWarning);
    renderer.configure(next.mode, next.point);
    previewReady = true; hasCanvas = true;
    renderer.play();
  } catch (error) {
    session = previous; audio.stop(); audioSignature='';
    if (previous) {
      fillSettings(previous); previewReady = Boolean(renderer?.data);
      if (previous.soundEnabled !== false) try { await audio.load(previous.candidate.audio); audioSignature=JSON.stringify(previous.candidate.audio||{}); } catch(soundError) { audioWarning=soundError.message; audio.setEnabled(false); }
    }
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
  if (requiredSlots().some(slot=>!pending.has(slot))) throw issue(grade === 'green' ? 'greenIncomplete' : 'incompleteFiles');
  const values = settings();
  if (!values.name || values.name.length > 80) throw issue('nameRequired');
  activity = {key:'buildingPreview'}; render();
  if (grade === 'green') {
    const next=await api('/api/preview/import', {method:'POST',body:{...values,files:[...[...pending.values()].map(f=>f.original),...greenExtras]}});
    await loadSession(next); releasePending(); toast('greenImportSuccess'); return;
  }
  const next = await api('/api/preview/import', {method:'POST',body: {...values, files:[...SLOTS.map(slot => { const file=pending.get(slot); return {name:file.name, data:file.data}; }),...greenExtras]}});
  await loadSession(next);
  releasePending();
  toast('importSuccess');
}
async function stageFiles(files) {
  if (!files.length) throw issue('noFiles');
  if (grade === 'green') return stageGreen(files);
  const sidecars=files.filter(file=>/^anchor\.png$|^(?:dice_roll|sound_ui_dice6)\.mp3$/i.test(file.name));
  files=files.filter(file=>!sidecars.includes(file));
  const unknown = files.filter(file => !slotFor(file.name));
  if (unknown.length) throw issue('unknownFiles', {files:unknown.map(file => file.name).join(', ')});
  const seen = new Set(), duplicates = [];
  files.forEach(file => { const slot=slotFor(file.name); if (seen.has(slot)) duplicates.push(file.name); seen.add(slot); });
  if (duplicates.length) throw issue('duplicateFiles', {files:duplicates.join(', ')});
  const results = await Promise.allSettled(files.map(file => readPng(file, slotFor(file.name))));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) { results.forEach(result => { if (result.status === 'fulfilled') URL.revokeObjectURL(result.value.previewUrl); }); throw failed.reason; }
  if (files.length === 10) releasePending();
  greenExtras=sidecars;
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
  audio.setEnabled($('sound-enabled').checked); if($('sound-enabled').checked) void audio.unlock().catch(()=>{});
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
  audio.stop();
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
    onDirectory:provider => run('readingFiles',async()=>stageFiles(await provider())),
    onError:error => run(null,()=>{throw error;}),
    onEmptyFolder:() => run(null, () => { throw issue('folderEmpty'); }),
    isBusy:() => busy, hasPreview:() => hasCanvas, isActive:() => embedded?.isActive() ?? true, onFiles:importFiles});
}
function importFiles(value) {
  const files = Array.from(value || []);
  if (files.length) { void audio.unlock().catch(()=>{}); return run('readingFiles', () => stageFiles(files)); }
}
async function switchGrade(nextGrade) {
  const beforeGrade=grade, before=session;
  if (session) gradeSessions.set(grade,session);
  releasePending(); grade=nextGrade; audio.stop();
  const stored=gradeSessions.get(grade);
  try {
    if (stored) await loadSession(stored);
    else { session=null; previewReady=false; hasCanvas=false; renderer?.clear(); $('dice-name').value=''; $('composition').value='auto'; $('sound-enabled').checked=true; audio.setEnabled(true); audioWarning=''; }
    currentError=null; notice=null; render();
  } catch(error) { grade=beforeGrade;session=before;if(before)fillSettings(before);throw error; }
}
async function stageGreen(files) {
  const usable=files.filter(file=> !(file.webkitRelativePath||file.name).split(/[/\\]/).some(part=>part.startsWith('.')));
  const groups=new Map();
  for(const file of usable) { const slot=greenSlot(file); if(!slot)continue; const list=groups.get(slot)||[];list.push(file);groups.set(slot,list); }
  // Canonical sz_N beats legacy 1.png/2.png included in old resource folders.
  const chosen=[];
  for(const [slot,list] of groups) {
    const priority=f=>f.name.normalize('NFKC').toLowerCase()===slot+'.png'?0:/^\d\.png$/i.test(f.name)?2:1;
    const best=Math.min(...list.map(priority)),matches=list.filter(f=>priority(f)===best);
    if(matches.length!==1)throw issue('duplicateFiles',{files:matches.map(f=>f.name).join(', ')});
    chosen.push([slot,matches[0]]);
  }
  if(!chosen.length)throw issue('greenIncomplete');
  if(chosen.length===6)releasePending();
  const extras=usable.filter(f=>!greenSlot(f) && /^(?:icon|大骰子|sz_?0|anchor)\.png$|^(?:dice_roll|sound_ui_dice6)\.mp3$/i.test(f.name.normalize('NFKC').trim()));
  greenExtras.push(...extras);
  for(const [slot,file]of chosen) {
    const old=pending.get(slot);if(old)URL.revokeObjectURL(old.previewUrl);
    pending.set(slot,{slot,name:file.name,original:file,previewUrl:URL.createObjectURL(file),width:'—',height:'—'});
  }
  if(!$('dice-name').value.trim())$('dice-name').value=t('defaultName');
  render(); if(requiredSlots().every(slot=>pending.has(slot)))await importPending();
}
function openDialog(id) { const dialog=$(id); if (!dialog.open) dialog.showModal(); }

applyTranslations();
try {
  renderer = new GameRenderer($('game-canvas'),syncRound);
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
['preview-mode','preview-point','composition','sound-enabled'].forEach(id => $(id).addEventListener('change', settingsChanged));
document.querySelectorAll('[data-grade]').forEach(button => button.addEventListener('click', () => { if (!busy && grade!==button.dataset.grade) return run(null,()=>switchGrade(button.dataset.grade)); }));
$('apply-settings').addEventListener('click', () => run('updatingSettings', saveSettings));
$('import-preview').addEventListener('click', () => run('buildingPreview', importPending));
$('clear-pending').addEventListener('click', () => { if (busy) return; releasePending(); if (session) fillSettings(session); currentError=null; notice=null; toast('replacementCancelled'); render(); });
$('reload-preview').addEventListener('click', () => run('loadingPreview', async () => { if (session) await loadSession(await api('/api/preview/' + session.id)); }));
$('game-canvas').addEventListener('click', () => { if (!busy && previewReady && !pending.size && !settingsDirty()) { void audio.unlock().catch(()=>{}); renderer.play(); } });
$('export-video').addEventListener('click', () => run('recording', exportVideo));
$('download-bundle').addEventListener('click', () => run('bundling', async () => { if (!session || pending.size || settingsDirty()) return; const result=await api(`/api/preview/${session.id}/bundle`); download(result.url,'.zip'); toast('downloadStarted'); }));
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stop();});
window.addEventListener('beforeunload', () => { audio.dispose(); pending.forEach(file => URL.revokeObjectURL(file.previewUrl)); renderer?.pause(); });
embedded = connectEmbedded(renderer, {onFiles:importFiles, isBusy:() => busy});
render();
