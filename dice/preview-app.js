import { connectEmbedded } from './embed.mjs';
import { bindDiceUploads, diceFilePath } from './upload-input.mjs';
import { VIDEO_SPEC } from './video-export.mjs?v=20261109-dice-60fps';
import { DiceAudio } from './audio.mjs';
import { clearLegacyPreviewHistory, forgetLocalPreview, localApi } from './local-preview.mjs?v=20261109-dice-60fps';
import { GameRenderer } from '/dice/renderer.js?v=20261109-dice-60fps';
import { t, errorText, applyTranslations, toggleLanguage, getLanguage } from '/dice/preview-i18n.js?v=20261109-dice-60fps';

const $ = id => document.getElementById(id);
const GREEN_SLOTS = Array.from({length:6}, (_,i) => 'sz_'+(i+1));
let session = null, pending = new Map(), grade = 'green', uploadGrade = null, previewGrade = 'green', busy = false;
let renderer = null, previewReady = false, hasCanvas = false, loadingPreview = false;
let activity = null, notice = null, currentError = null, toastTimer;
let embedded = null, audioWarning='', audioSignature='';
const audio = new DiceAudio();
const requiredSlots = () => GREEN_SLOTS;
let pendingExtras = [];
const normalizedName = file => file.name.normalize('NFKC').trim().toLowerCase();
function greenSlot(file) {
 const name=normalizedName(file),stem=name.replace(/\.png$/i,'');
 const m=/^(?:sz[_ -]?|face[_ -]?)?([1-6])$/.exec(stem);
 return /\.png$/i.test(name) && m ? 'sz_'+m[1] : null;
}
function syncRound(status) {
 if (!status.playing || !renderer?.visible || document.hidden) audio.stop();
 else if (status.elapsed < .1) audio.playRound({six:true});
}

function issue(key, values) { return Object.assign(new Error(key), {key, values}); }
function settings() {
  return {name:$('dice-name').value.trim(), grade, previewGrade, mode:'all',
    point:1, composition:grade === 'green' ? 'faces' : session?.composition || 'faces', soundEnabled:$('sound-enabled').checked};
}
function settingsDirty() {
  if (!session) return false;
  const values = settings();
  return Object.keys(values).some(key => values[key] !== session[key]);
}
function currentVideo(video = session?.video) {
  const {profile, maxBytes, duration, fps, frameCount, width, height} = VIDEO_SPEC;
  return video?.profile === profile && video.size > 0 && video.size <= maxBytes && video.duration === duration && video.fps === fps && video.frameCount === frameCount
    && video.width === width && video.height === height && video.revision === session.revision
    && video.candidate === session.candidate?.id ? video : null;
}
function fillSettings(value) {
  $('dice-name').value = value.name;
  grade = value.grade; previewGrade = value.previewGrade || value.grade;
  $('preview-mode').value = 'all';
  $('preview-point').value = '1';
  $('sound-enabled').checked = value.soundEnabled !== false; audio.setEnabled(value.soundEnabled !== false);
}
function releasePending(resetTarget = true) {
  pending.forEach(file => { if(file.previewUrl) URL.revokeObjectURL(file.previewUrl); });
  pending = new Map(); pendingExtras = []; if (resetTarget) uploadGrade = null;
}
const api = localApi;
const post = (path, body) => api(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
function bytes(value) {
  return value >= 1_000_000 ? (value / 1_000_000).toFixed(2) + ' MB' : Math.max(1, Math.round(value / 1000)) + ' KB';
}
function toast(key, values) {
  clearTimeout(toastTimer);
  const node = $('toast');
  node.textContent = t(key, values); node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
}
function download(url, extension, name=session?.resourceName) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) throw issue('invalidDownload');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = ((name || session?.name || t('defaultName')).replace(/[\\/:*?"<>|]/g, '_')) + extension;
  if (window.parent !== window) {
    window.parent.postMessage({type:'fun-dice-download', url, fileName:anchor.download}, location.origin);
    return;
  }
  document.body.append(anchor); anchor.click(); anchor.remove();
}
function renderAssets() {
  const list = pending.size ? [...pending.values()] : session?.files || [];
  const files = new Map(list.map(file => [file.slot, file]));
  $('file-count').textContent = requiredSlots().filter(slot=>files.has(slot)).length + ' / '+requiredSlots().length+' PNG';
  if (!$('asset-details').open) return;
  const grid = document.createDocumentFragment();
  for (const slot of requiredSlots()) {
    const file = files.get(slot);
    const item = document.createElement('div'); item.className = 'asset-slot ' + (file ? 'ready' : 'missing');
    const thumb = document.createElement('div'); thumb.className = 'asset-thumb checkerboard';
    if (file) {
      if (file.original && !file.previewUrl) file.previewUrl = URL.createObjectURL(file.original);
      const image = document.createElement('img'); image.decoding = 'async'; image.src = file.previewUrl || file.url;
      image.alt = file.name; image.width = 72; image.height = 72; thumb.append(image);
    } else { const mark = document.createElement('span'); mark.textContent = '—'; mark.setAttribute('aria-hidden','true'); thumb.append(mark); }
    const name = document.createElement('span'); name.className = 'asset-name';
    name.textContent = file?.name || slot + '.png'; name.title = name.textContent;
    const meta = document.createElement('span'); meta.className = 'asset-meta';
    meta.textContent = file ? `${file.width} × ${file.height}` : t('missingFile');
    item.append(thumb, name, meta); grid.append(item);
  }
  $('asset-grid').replaceChildren(grid);
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
  ['choose-files','choose-folder','choose-purple-files','choose-purple-folder','choose-preview-files','choose-preview-folder','choose-preview-purple-files','choose-preview-purple-folder','res-file-input','res-folder-input'].forEach(id => { $(id).disabled = locked; });
  $('upload-zone').hidden = !hasCanvas;
  $('background-field').hidden = !session;
  document.querySelectorAll('[data-upload-grade]').forEach(card => {
    card.classList.toggle('is-selected', card.dataset.uploadGrade === (draft ? uploadGrade : session?.grade));
    card.setAttribute('aria-disabled', String(locked));
  });
  const canRetry = draft && !locked && requiredSlots().every(slot=>pending.has(slot));
  $('pending-actions').hidden = !draft || locked;
  $('import-preview').hidden = !canRetry;
  $('import-preview').disabled = !canRetry;
  $('clear-pending').disabled = locked;
  $('dice-name').disabled = locked;
  $('preview-mode').disabled = locked;
  $('preview-point').disabled = locked || $('preview-mode').value !== 'single';
  $('sound-enabled').disabled = locked;
  $('audio-warning').textContent=audioWarning; $('audio-warning').hidden=!audioWarning;
  $('asset-grid').setAttribute('aria-label',t(grade === 'green' ? 'greenAssetStatus' : 'assetStatus'));
  $('hero-hint').hidden=!session || Boolean(session.candidate.icon);
  $('hero-hint').textContent=t('missingHero');
  document.querySelectorAll('[data-preview-grade]').forEach(button => {
    const active = button.dataset.previewGrade === previewGrade;
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
  $('game-canvas').hidden = !hasCanvas;
  $('preview-stage').dataset.state = loadingPreview ? 'processing' : previewReady ? 'ready' : currentError ? 'error' : 'idle';
  $('session-meta').textContent = session ? t(previewGrade === 'purple' ? 'purpleBackground' : 'greenBackground') : t('notLoaded');
  const missing = requiredSlots().filter(slot => !pending.has(slot));
  const uploadStatus = $('upload-status');
  uploadStatus.dataset.state = draft ? 'pending' : 'success';
  if (draft && missing.length) uploadStatus.textContent = t(grade === 'green' ? 'greenPartialFiles' : 'partialFiles', {count:pending.size, missing:missing.map(slot => slot + '.png').join(', ')});
  else if (draft) uploadStatus.textContent = t('replacingFiles');
  else if (dirty) { uploadStatus.textContent = t('settingsPending'); uploadStatus.dataset.state = 'pending'; }
  else { uploadStatus.textContent = notice?.key === 'videoInvalidated' ? t(notice.key) : ''; uploadStatus.dataset.state = 'pending'; }
  let videoKey = 'videoEmpty', videoValues;
  if (session && (draft || dirty)) videoKey = 'videoInvalidated';
  else if (clip) { videoKey = 'videoReady'; videoValues = {fps:clip.fps, size:bytes(clip.size)}; }
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
    session = next; fillSettings(next); render();
    return;
  }
  const previous = session;
  previewReady = false;
  loadingPreview = true; render();
  try {
    if (!renderer) throw issue('rendererFailed');
    await renderer.load(next.candidate);
    session = next; fillSettings(next);
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
async function importPending() {
  if (requiredSlots().some(slot=>!pending.has(slot))) throw issue(grade === 'green' ? 'greenIncomplete' : 'incompleteFiles');
  if (!['green','purple'].includes(uploadGrade)) throw issue('chooseUploadGrade');
  const values = {...settings(), grade:uploadGrade, previewGrade:uploadGrade, composition:'faces'};
  if (!values.name || values.name.length > 80) throw issue('nameRequired');
  activity = {key:'buildingPreview'}; render();
  const previous = session;
  const next=await api('/api/preview/import', {method:'POST',body:{...values,files:[...[...pending.values()].map(f=>f.original),...pendingExtras]}});
  try { await loadSession(next); }
  catch (error) { forgetLocalPreview(next.id); throw error; }
  if (previous) forgetLocalPreview(previous.id);
  releasePending(); toast(grade === 'green' ? 'greenImportSuccess' : 'importSuccess');
}
async function stageFiles(files) {
  if (!files.length) throw issue('noFiles');
  if(!$('dice-name').value.trim()){
    const folders=new Set(files.flatMap(file=>diceFilePath(file).replace(/\\/g,'/').split('/').slice(0,-1))
      .filter(part=>/^dice_(?:green|purple)_.+/i.test(part)));
    if(folders.size===1)$('dice-name').value=[...folders][0];
  }
  if (files.length===1 && /^(?:大骰子|icon)\.png$/i.test(files[0].name.normalize('NFKC').trim()) && session && uploadGrade === session.grade && !pending.size) {
    const next=await api(`/api/preview/${session.id}/hero`,{method:'POST',body:{expectedRevision:session.revision,file:files[0]}});
    await loadSession(next,true); toast('heroUpdated'); return;
  }
  return stageGreen(files);
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
  const blob = await renderer.recordLoop(VIDEO_SPEC.duration);
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
    primaryButtons:[$('choose-preview-files'),$('choose-preview-purple-files')], replacementButtons:[$('choose-files'),$('choose-purple-files')], input:$('res-file-input'),
    folderInput:$('res-folder-input'), primaryFolderButtons:[$('choose-preview-folder'),$('choose-preview-purple-folder')], replacementFolderButtons:[$('choose-folder'),$('choose-purple-folder')],
    onTarget:(event) => selectUploadGrade(event?.target?.closest?.('[data-upload-grade]')?.dataset.uploadGrade || document.activeElement?.closest?.('[data-upload-grade]')?.dataset.uploadGrade || uploadGrade || session?.grade),
    onDirectory:provider => run('readingFiles',async()=>{
      const files=await provider();
      if (!files.length) throw issue('folderEmpty');
      await stageFiles(files);
    }),
    onError:error => run(null,()=>{throw error;}),
    onEmptyFolder:() => run(null, () => { throw issue('folderEmpty'); }),
    isBusy:() => busy, hasPreview:() => hasCanvas, isActive:() => embedded?.isActive() ?? true, onFiles:importFiles});
}
function importFiles(value) {
  const files = Array.from(value || []);
  if (files.length && !uploadGrade) {
    try { selectUploadGrade(session?.grade); } catch(error) { return run(null,()=>{throw error;}); }
  }
  if (files.length) { void audio.unlock().catch(()=>{}); return run('readingFiles', () => stageFiles(files)); }
}
function selectUploadGrade(nextGrade) {
  if (!['green','purple'].includes(nextGrade)) throw issue('chooseUploadGrade');
  if (pending.size && uploadGrade && uploadGrade !== nextGrade) throw issue('finishPendingUpload');
  uploadGrade = nextGrade;
  currentError = null; render();
  return true;
}
async function switchBackground(nextGrade) {
  if (!session || !['green','purple'].includes(nextGrade) || previewGrade === nextGrade) return;
  const draft = pending.size || settingsDirty() ? {name:$('dice-name').value, soundEnabled:$('sound-enabled').checked} : null;
  const hadVideo = Boolean(currentVideo());
  const next = await post(`/api/preview/${session.id}/settings`, {expectedRevision:session.revision, previewGrade:nextGrade});
  try { await loadSession(next, true); }
  catch (error) {
    // Settings already committed: keep its revision for a safe retry while retaining the last frame.
    session = next; fillSettings(next); previewReady = false; audio.stop();
    throw error;
  }
  finally { if (draft) { $('dice-name').value=draft.name; $('sound-enabled').checked=draft.soundEnabled; audio.setEnabled(draft.soundEnabled && !audioWarning); } }
  notice = hadVideo && !next.video ? {key:'videoInvalidated'} : null;
}
async function stageGreen(files) {
  const usable=files.filter(file=> !(diceFilePath(file)||file.name).split(/[/\\]/).some(part=>part.startsWith('.')));
  const groups=new Map();
  for(const file of usable) { const slot=greenSlot(file); if(!slot)continue; const list=groups.get(slot)||[];list.push(file);groups.set(slot,list); }
  // Canonical sz_N beats legacy 1.png/2.png included in old resource folders.
  const chosen=[];
  for(const [slot,list] of groups) {
    const priority=f=>normalizedName(f)===slot+'.png'?0:/^\d\.png$/i.test(f.name)?2:1;
    const best=Math.min(...list.map(priority)),matches=list.filter(f=>priority(f)===best);
    if(matches.length!==1)throw issue('duplicateFiles',{files:matches.map(f=>f.name).join(', ')});
    chosen.push([slot,matches[0]]);
  }
  if(!chosen.length)throw issue('greenIncomplete');
  if(chosen.length===6)releasePending(false);
  const selected=new Set(chosen.map(([,file])=>file));
  const extras=usable.filter(f=>!selected.has(f) && (/^(?:icon|大骰子|sz_?0|anchor)\.png$|^(?:dice_roll|sound_ui_dice6)\.mp3$/.test(normalizedName(f))
    ||uploadGrade==='purple'&&/^[12]\.png$/.test(normalizedName(f))));
  const newExtraNames = new Set(extras.map(normalizedName));
  pendingExtras = [...pendingExtras.filter(file => !newExtraNames.has(normalizedName(file))), ...extras];
  for(const [slot,file]of chosen) {
    const old=pending.get(slot);if(old?.previewUrl)URL.revokeObjectURL(old.previewUrl);
    pending.set(slot,{slot,name:file.name,original:file,width:'—',height:'—'});
  }
  if(!$('dice-name').value.trim())$('dice-name').value=t('defaultName');
  render(); if(requiredSlots().every(slot=>pending.has(slot)))await importPending();
}
function openDialog(id) { const dialog=$(id); if (!dialog.open) dialog.showModal(); }

applyTranslations();
clearLegacyPreviewHistory();
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
['preview-mode','preview-point','sound-enabled'].forEach(id => $(id).addEventListener('change', settingsChanged));
document.querySelectorAll('[data-preview-grade]').forEach(button => button.addEventListener('click', () => { if (!busy && previewGrade!==button.dataset.previewGrade) return run(null,()=>switchBackground(button.dataset.previewGrade)); }));
$('apply-settings').addEventListener('click', () => run('updatingSettings', saveSettings));
$('asset-details').addEventListener('toggle', renderAssets);
$('import-preview').addEventListener('click', () => run('buildingPreview', importPending));
$('clear-pending').addEventListener('click', () => { if (busy) return; releasePending(); if (session) fillSettings(session); currentError=null; notice=null; toast('replacementCancelled'); render(); });
$('reload-preview').addEventListener('click', () => run('loadingPreview', async () => { if (session) await loadSession(await api('/api/preview/' + session.id)); }));
$('game-canvas').addEventListener('click', () => { if (!busy && previewReady && !pending.size && !settingsDirty()) { void audio.unlock().catch(()=>{}); renderer.play(); } });
$('export-video').addEventListener('click', () => run('recording', exportVideo));
$('download-bundle').addEventListener('click', () => run('bundling', async () => { if (!session || pending.size || settingsDirty()) return; const result=await api(`/api/preview/${session.id}/bundle`); download(result.url,'.zip',result.name); toast('downloadStarted'); }));
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stop();});
window.addEventListener('beforeunload', () => { audio.dispose(); releasePending(); renderer?.pause(); });
embedded = connectEmbedded(renderer, {onFiles:importFiles, isBusy:() => busy});
render();
