const STORAGE_KEY = 'dice-studio-language';
const messages = {
  zh: {
    greenEmptyTitle:'拖入大骰子+六点数图', greenAssetStatus:'六张点数素材状态', greenUploadHint:'六张点数图 · 大图使用大骰子.png', purpleUploadHint:'十张 PNG · 沿用原投掷动作', greenPartialFiles:'已选择 {count}/6 张，请补齐：{missing}', greenIncomplete:'请上传 sz_1～sz_6 六张点数图。', greenImportSuccess:'六张点数图已载入，可以预览和导出。', soundEnabled:'投掷音效', missingHero:'请补传大骰子.png，用作左上角立体大图。', heroUpdated:'大骰子已更换，请重新生成视频。',
    title:'骰子预览', skip:'跳到预览工作台', home:'Fun Toolkit 首页', nav:'工具导航', language:'切换界面语言', author:'联系作者', help:'使用说明', close:'关闭',
    description:'上传 res 文件夹中的十张 PNG，预览投掷效果，再下载视频或完整素材包。',
    uploadHeading:'上传素材', uploadTitle:'选择或拖入十张 PNG', uploadNote:'保留原文件名，透明背景', chooseFiles:'选择 PNG', chooseFolder:'选择文件夹', folderEmpty:'文件夹中没有 PNG 图片', replaceFiles:'更换素材', pasteHint:'⌘V / Ctrl+V 粘贴', filenames:'大骰子（或 icon）、1、2、sz_0～sz_6，共十张 PNG。', assetDetails:'素材明细', assetStatus:'十张素材状态', missingFile:'待上传', importPreview:'载入预览', cancelReplacement:'取消本次替换',
    settingsHeading:'预览设置', name:'骰子名称', namePlaceholder:'例如：板球', defaultName:'骰子预览', grade:'骰子等级', green:'绿色', purple:'紫色', gradeHint:'绿色使用六面图生成动画，紫色沿用原投掷动作。', mode:'预览模式', modeAll:'六面同时投掷', modeSingle:'指定点数', modeContinuous:'连续投掷', point:'点数',
    compositionHeading:'素材组合方式', automatic:'自动识别', compositionLabel:'sz_1～sz_6 的内容', compositionAuto:'自动识别', compositionFaces:'完整骰面', compositionDigits:'独立数字＋sz_0 底座', compositionHint:'数字素材会在投掷落定时与 sz_0 组合。大图与 1、2 保持原图。', detectedFaces:'识别为完整骰面，可在此手动更改。', detectedDigits:'识别为独立数字＋底座，可在此手动更改。', facesShort:'完整骰面', digitsShort:'数字＋底座', retrySettings:'应用设置', settingsPending:'设置尚未应用，请点击“应用设置”重试。',
    outputHeading:'下载文件', outputDescription:'资源包仅含 SKEL、图集、PNG、res 原图及 sound 音频；视频单独下载。', exportVideo:'生成并下载视频', downloadBundle:'打包下载', videoEmpty:'载入素材后可打包资源，视频单独下载。', videoOptional:'资源已可打包；可单独下载 6 秒循环 MP4。', downloadExistingVideo:'下载当前视频', videoReady:'MP4 · 6 秒 · {size}', videoUnavailable:'当前环境无法生成 MP4：{reason}。原图仍可打包。', videoInvalidated:'预览设置已更改，请重新生成视频。', greenBackground:'绿色背景', purpleBackground:'紫色背景',
    previewHeading:'游戏效果预览', notLoaded:'尚未载入', canvasLabel:'骰子投掷效果预览', previewEmptyTitle:'点击或拖入十张 PNG', previewEmptyHint:'透明背景，保留原文件名', previewErrorTitle:'暂未载入预览', loadingPreview:'正在载入预览…', playbackControls:'预览播放控制', play:'播放预览', pause:'暂停预览', replay:'重播预览', reloadPreview:'重试加载预览', previewNote:'预览每 2 秒循环，视频循环 3 轮共 6 秒。录制时请保持此页可见。', playing:'正在投掷', paused:'已暂停', readyToPlay:'可以播放', playingPoint:'正在投掷 · {point} 点', sessionRevision:'版本 {revision}',
    localTool:'本地工具', designSystem:'设计规范', moreTools:'更多工具', authorDescription:'Fun Toolkit UI 规范作者与维护人', resourceNote:'本工具复用 Fun Toolkit 的页面、表单与反馈资源。',
    helpUpload:'绿色使用 sz_1.png～sz_6.png 六张点数图生成翻滚，左上角立体大图读取大骰子.png（兼容 icon.png）；也可单独补传或更换大图。紫色仍上传大骰子（或 icon）、1、2、sz_0～sz_6 共十张 PNG。支持文件夹、拖放和文件粘贴。', helpSettings:'选择骰子等级并填写名称，预览固定为六面同步投掷。', helpComposition:'绿色自动补齐隐藏锚点及基础音效，也可随文件夹上传 anchor.png、dice_roll.mp3、sound_ui_dice6.mp3 覆盖。紫色数字图可选择“独立数字＋sz_0 底座”。', helpDownload:'预览每 2 秒循环，视频共 6 秒。资源包以 dice_green_ 或 dice_purple_ 开头，仅包含同名 SKEL、图集、PNG、res 原图和 sound 音频；MP4 单独下载。视频生成时保持页面可见。', helpPreserve:'导入失败会保留上一份可用预览。选择新一套素材会创建新的预览会话。',
    readingFiles:'正在读取 PNG…', buildingPreview:'正在准备投掷预览…', updatingSettings:'正在应用预览设置…', restoring:'正在恢复上次预览…', recording:'正在生成 6 秒循环视频，请保持此页可见…', encoding:'正在准备 MP4 下载…', bundling:'正在打包文件…', importSuccess:'十张素材已载入，可以播放或下载。', restored:'已恢复上次预览。', partialFiles:'已选择 {count}/10 张，请补齐：{missing}', replacingFiles:'正在准备新素材，上一份预览仍保留。', downloadStarted:'已发起下载。', videoSuccess:'6 秒循环视频已生成，用时 {seconds} 秒，已发起下载。', videoReused:'已发起当前 6 秒循环视频下载。', replacementCancelled:'已取消本次替换，恢复当前素材。',
    selectPng:'请选择 PNG 图片。', unknownFiles:'无法匹配文件名：{files}', duplicateFiles:'同一批次有重复素材：{files}', tooLarge:'{file}：单张 PNG 请小于 12 MB。', invalidPng:'{file}：文件内容不是有效 PNG。', invalidSize:'{file}：尺寸需为 {size}。', noFiles:'请先选择文件。', incompleteFiles:'请先补齐十张 PNG。', readFailed:'{file}：文件读取失败。', nameRequired:'请填写 1～80 字的预览名称。', requestFailed:'请求失败，请检查文件后重试。', networkFailed:'本地服务连接失败，请确认服务仍在运行后重试。', rendererFailed:'浏览器未能初始化预览，请使用支持 WebGL 的 Chrome。', previewLoadFailed:'预览加载失败，原有画面已保留。可点击“重试加载预览”。', restoreFailed:'上次预览无法恢复，请重新上传素材。', missing:'缺少：{files}', extra:'多余：{files}', duplicates:'重复：{files}', invalidDownload:'下载地址无效，请重试。', videoMismatch:'视频与当前预览不匹配，请重新生成。',
  },
  en: {
    greenEmptyTitle:'Drop the 3D dice + six face images', greenAssetStatus:'Six dice face assets', greenUploadHint:'Six faces · Use 大骰子.png for the hero', purpleUploadHint:'Ten PNGs · Original roll animation', greenPartialFiles:'Selected {count}/6. Add: {missing}', greenIncomplete:'Upload all six faces: sz_1–sz_6.png.', greenImportSuccess:'Six faces loaded. Preview and export are ready.', soundEnabled:'Roll sound', missingHero:'Add 大骰子.png for the 3D hero image.', heroUpdated:'Hero replaced. Generate a new video.',
    title:'Dice Preview', skip:'Skip to preview workspace', home:'Fun Toolkit home', nav:'Tool navigation', language:'Switch interface language', author:'Contact author', help:'How to use', close:'Close',
    description:'Upload the ten PNGs from your res folder, preview the dice roll, then download a video or the complete package.',
    uploadHeading:'Upload assets', uploadTitle:'Choose or drop ten PNGs', uploadNote:'Keep the original names and transparent backgrounds', chooseFiles:'Choose PNGs', chooseFolder:'Choose folder', folderEmpty:'The folder contains no PNG files.', replaceFiles:'Replace assets', pasteHint:'Paste with ⌘V / Ctrl+V', filenames:'Ten PNGs: 大骰子 (or icon), 1, 2, and sz_0–sz_6.', assetDetails:'Asset details', assetStatus:'Ten asset slots', missingFile:'Not uploaded', importPreview:'Load preview', cancelReplacement:'Cancel replacement',
    settingsHeading:'Preview settings', name:'Dice name', namePlaceholder:'For example: Cricket', defaultName:'Dice Preview', grade:'Dice grade', green:'Green', purple:'Purple', gradeHint:'Green uses six generated faces. Purple keeps the original roll animation.', mode:'Preview mode', modeAll:'Roll all six faces', modeSingle:'Selected result', modeContinuous:'Continuous rolls', point:'Result',
    compositionHeading:'Asset composition', automatic:'Automatic', compositionLabel:'Contents of sz_1–sz_6', compositionAuto:'Detect automatically', compositionFaces:'Complete dice faces', compositionDigits:'Separate numerals + sz_0 base', compositionHint:'Numeral assets are combined with sz_0 for settled results. The hero, 1 and 2 remain unchanged.', detectedFaces:'Detected complete dice faces. You can override this here.', detectedDigits:'Detected separate numerals and a base. You can override this here.', facesShort:'Complete faces', digitsShort:'Numerals + base', retrySettings:'Apply settings', settingsPending:'Settings have not been applied. Click “Apply settings” to retry.',
    outputHeading:'Download files', outputDescription:'The package contains only SKEL, atlas, PNG, res originals and sound audio. Download the video separately.', exportVideo:'Generate & download video', downloadBundle:'Download package', videoEmpty:'Load the assets to download the resource package. Download videos separately.', videoOptional:'The resource package is ready. Download the 6-second MP4 separately.', downloadExistingVideo:'Download current video', videoReady:'MP4 · 6 s · {size}', videoUnavailable:'MP4 export is unavailable: {reason}. You can still package the PNGs.', videoInvalidated:'Preview settings changed. Generate a new video.', greenBackground:'Green background', purpleBackground:'Purple background',
    previewHeading:'In-game preview', notLoaded:'Not loaded', canvasLabel:'Dice roll preview', previewEmptyTitle:'Click or drop ten PNGs', previewEmptyHint:'Transparent PNGs. Keep file names.', previewErrorTitle:'Preview not loaded', loadingPreview:'Loading preview…', playbackControls:'Preview playback controls', play:'Play preview', pause:'Pause preview', replay:'Replay preview', reloadPreview:'Retry loading preview', previewNote:'Preview loops every 2 seconds. Video contains 3 loops over 6 seconds. Keep this page visible while recording.', playing:'Rolling', paused:'Paused', readyToPlay:'Ready to play', playingPoint:'Rolling · result {point}', sessionRevision:'Revision {revision}',
    localTool:'Local tool', designSystem:'Design system', moreTools:'More tools', authorDescription:'Author and maintainer of the Fun Toolkit UI specification', resourceNote:'This tool reuses Fun Toolkit page, form and feedback resources.',
    helpUpload:'Green uses six faces, sz_1.png–sz_6.png, for rolling. The 3D hero uses 大骰子.png (or icon.png) from the same folder and can be replaced separately. Purple still needs ten PNGs: hero (or icon), 1, 2 and sz_0–sz_6. Choose files or a folder, drop, or paste files.', helpSettings:'Choose a dice grade and enter a name. The preview rolls all six faces together.', helpComposition:'Green includes a hidden anchor and roll sounds. Supply anchor.png, dice_roll.mp3 and sound_ui_dice6.mp3 to replace them. For purple numeral assets, choose numerals + sz_0 base.', helpDownload:'Preview loops every 2 seconds; MP4 runs for 6 seconds. Packages use the dice_green_ or dice_purple_ prefix and contain only matching SKEL, atlas, PNG, res originals and sound audio. Download MP4 separately and keep this page visible during video export.', helpPreserve:'An unsuccessful import keeps the previous usable preview. A new asset set creates a separate preview session.',
    readingFiles:'Reading PNGs…', buildingPreview:'Preparing the dice preview…', updatingSettings:'Applying preview settings…', restoring:'Restoring the previous preview…', recording:'Creating a 6-second looping video. Keep this page visible…', encoding:'Preparing the MP4 download…', bundling:'Packaging files…', importSuccess:'All ten assets are loaded. You can play or download.', restored:'Previous preview restored.', partialFiles:'Selected {count}/10. Add: {missing}', replacingFiles:'Preparing replacement assets. The previous preview is retained.', downloadStarted:'Download started.', videoSuccess:'6-second loop created in {seconds} s. Download started.', videoReused:'Current 6-second loop download started.', replacementCancelled:'Replacement cancelled. Current assets restored.',
    selectPng:'Choose PNG images.', unknownFiles:'Unrecognized file names: {files}', duplicateFiles:'Duplicate assets in this selection: {files}', tooLarge:'{file}: each PNG must be smaller than 12 MB.', invalidPng:'{file}: the file is not a valid PNG.', invalidSize:'{file}: dimensions must be {size}.', noFiles:'Choose files first.', incompleteFiles:'Complete all ten PNGs first.', readFailed:'{file}: the file could not be read.', nameRequired:'Enter a preview name with 1–80 characters.', requestFailed:'Request failed. Check the files and try again.', networkFailed:'Cannot reach the local service. Check that it is running and retry.', rendererFailed:'The browser could not initialize the preview. Use Chrome with WebGL support.', previewLoadFailed:'Preview loading failed. The previous image is retained. Click “Retry loading preview”.', restoreFailed:'The previous preview could not be restored. Upload the assets again.', missing:'Missing: {files}', extra:'Extra: {files}', duplicates:'Duplicates: {files}', invalidDownload:'The download address is invalid. Try again.', videoMismatch:'The video does not match the current preview. Generate it again.',
  },
};
const errors = {
  '请填写 1～80 字的预览名称':'Enter a preview name with 1–80 characters.',
  '请选择绿色或紫色等级背景':'Choose the green or purple grade background.',
  '预览会话不存在':'This preview session does not exist.',
  '预览会话记录损坏，请保留文件后联系维护者':'The preview record is damaged. Keep your files and contact the maintainer.',
  '预览已更新，请刷新后重试':'The preview has changed. Reload it and try again.',
  '调整期间预览已更新，请刷新后重试':'The preview changed while applying settings. Reload it and try again.',
  '预览已更新，请重新录制当前版本':'The preview has changed. Record the current revision again.',
  '打包期间预览已更新，请重新打包':'The preview changed while packaging. Download the package again.',
  '预览设置已更新，请重新录制视频':'Preview settings changed. Record a new video.',
  '视频版本已过期，请重新录制':'This video revision has expired. Record a new video.',
  '预览版本已更新，请重新录制':'The preview revision changed. Record a new video.',
  '视频版本与当前预览不一致':'The video does not match the current preview.',
  '本地 FFmpeg 不可用':'Local FFmpeg is unavailable',
  '视频转码超时，请重试':'Video encoding timed out. Try again.',
  '视频转码失败，请重试':'Video encoding failed. Try again.',
  '视频转码失败，请重新录制':'Video encoding failed. Record a new video.',
  '未找到本地 FFmpeg，无法输出 MP4':'Local FFmpeg is unavailable. MP4 export is disabled.',
  '视频大小不合法':'The video size is invalid.',
  '请上传有效的 WebM 或 MP4 录制视频':'Upload a valid WebM or MP4 recording.',
  '请上传有效的 WebM、MP4 或 H.264 录制视频':'Upload a valid WebM, MP4 or H.264 recording.',
  '视频校验超时，请重试':'Video validation timed out. Try again.',
  '视频校验失败，请重新导出':'Video validation failed. Export it again.',
  '视频规格需为 6 秒、30 帧/秒、720×1600，共 180 帧':'The video must be 6 seconds at 30 fps and 720×1600, with 180 frames.',
  '录制素材已变化，请重新导出视频':'The assets changed during recording. Export the video again.',
  '视频编码帧顺序异常，请重试':'Video frames were encoded out of order. Try again.',
  '视频编码失败，请重试':'Video encoding failed. Try again.',
  '视频编码帧数不完整，请重试':'The encoded video is missing frames. Try again.',
  '循环时长须大于0秒':'Loop duration must be greater than zero.',
  '视频版本或大小不合法':'The video revision or size is invalid.',
  '录制期间预览已更新，请重新录制':'The preview changed during recording. Record a new video.',
  '请等待资源加载完成':'Wait for the assets to load.',
  '当前页面在后台，请保持此页可见后再录制':'Keep this page visible before recording.',
  '正在录制视频，请等待完成':'A recording is already in progress. Wait for it to finish.',
  '当前浏览器不支持视频录制，请使用 Chrome':'This browser does not support recording. Use Chrome.',
  '当前浏览器没有可用的视频编码器':'No supported video encoder is available in this browser.',
  '视频录制失败':'Video recording failed.',
  '视频录制意外中断，请重试':'Recording was interrupted. Try again.',
  '录制期间页面被切到后台，请保持此页可见后重试':'The page went into the background during recording. Keep it visible and retry.',
  '视频录制超时，请重试':'Recording timed out. Try again.',
  '图片加载失败，请重新生成候选包':'An image could not be loaded. Reload the preview.',
  '请选择有效 PNG':'Choose a valid PNG.', '单张 PNG 请小于 12 MB':'Each PNG must be smaller than 12 MB.', 'PNG 数据损坏':'PNG data is damaged.', 'PNG 大小不合法':'PNG size is invalid.', '需要单帧 PNG':'A single-frame PNG is required.', 'PNG 读取失败':'PNG could not be read.', '图片没有可见内容':'The image contains no visible artwork.',
};
let language = 'zh';
try { if (localStorage.getItem(STORAGE_KEY) === 'en') language = 'en'; } catch {}
export const getLanguage = () => language;
export function t(key, values = {}) {
  return (messages[language][key] || messages.zh[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
export function errorText(error) {
  const payload = error?.payload;
  if (payload && ['missing','extra','duplicates'].some(key => payload[key]?.length)) {
    return ['missing','extra','duplicates'].filter(key => payload[key]?.length).map(key => t(key, {files:payload[key].join(', ')})).join(' · ');
  }
  if (error?.key) return t(error.key, error.values);
  const text = String(error?.message || error || '');
  if (language === 'zh') return text || t('requestFailed');
  if (errors[text]) return errors[text];
  const separator = text.indexOf('：');
  if (separator >= 0) {
    const detail = text.slice(separator + 1);
    if (errors[detail]) return text.slice(0, separator) + ': ' + errors[detail];
    if (/^尺寸需为 /.test(detail)) return text.slice(0, separator) + ': dimensions must be ' + detail.slice(5) + '.';
  }
  if (text.startsWith('动画资源加载失败：')) return 'Animation assets could not be loaded. Retry loading the preview.';
  return /[\u3400-\u9fff]/.test(text) ? t('requestFailed') : text || t('requestFailed');
}
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  for (const [attribute, dataKey] of [['aria-label','i18nAria'],['placeholder','i18nPlaceholder'],['title','i18nTitle']]) {
    root.querySelectorAll('[data-' + dataKey.replace(/[A-Z]/g, value => '-' + value.toLowerCase()) + ']').forEach(node => node.setAttribute(attribute, t(node.dataset[dataKey])));
  }
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = t('title') + ' · Fun Toolkit';
  const toggle = document.getElementById('language-toggle');
  if (toggle) { toggle.textContent = language === 'en' ? '中文' : 'EN'; toggle.lang = language === 'en' ? 'zh-CN' : 'en'; }
}
export function toggleLanguage() {
  language = language === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  applyTranslations();
  document.dispatchEvent(new CustomEvent('previewlanguagechange'));
}
