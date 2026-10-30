/* Local VAP workbench. Media, preview and committed downloads are separate state. */
(() => {
  'use strict';
  const root=document.querySelector('#vapTool');if(!root)return;
  const $=id=>root.querySelector('#vap'+id),video=$('SourceVideo'),canvas=$('PreviewCanvas'),stage=$('Stage');
  const copy={
    zh:{title:'MP4 转 VAP 工具',help:'使用说明',helpTitle:'MP4 转 VAP 使用说明',close:'关闭',preview:'效果预览',inputType:'输入类型',plain:'普通 MP4',chroma:'纯色幕布 MP4',method:'去背景方式',blackLuma:'黑底去背景',whiteLuma:'白底去背景',aiPerson:'AI 人像抠像',manualMask:'导入遮罩',opaque:'保留原背景',screenAuto:'自动识别幕色',screenGreen:'绿色',screenBlue:'蓝色',chooseMask:'选择遮罩图片 / 视频',noMask:'尚未选择遮罩',original:'原片',transparent:'透明效果',alphaView:'Alpha 黑白图',checker:'棋盘格',black:'黑',white:'白',blue:'蓝',uploadTitle:'点击、拖入或粘贴 MP4 视频',uploadHint:'200 MB 以内 · 最长 120 秒 · 本机处理',pasteHint:'支持复制粘贴，按 ⌘V / Ctrl+V 上传',upload:'上传 MP4',previewProcessing:'正在生成当前帧预览…',play:'播放',pause:'暂停',soundOff:'静音预览',soundOn:'有声预览',timeline:'视频时间轴',replace:'替换视频',keySettings:'边缘与去溢色',tolerance:'抠像强度',softness:'边缘柔化',spill:'去幕色溢色',resultPreview:'输出效果',compareSource:'当前效果',playResult:'透明播放',resultPreviewHint:'VAP MP4 将 RGB 与黑白 Alpha 拼接存储，普通播放器会同时显示两部分。本页使用原版腾讯 VAP 播放器合成透明效果；手机端 SDK 需另行验证。',privacy:'视频与声音仅在本机处理，不上传至服务器。',output:'调整与导出',dimensions:'输出尺寸',ratioLocked:'输出比例锁定',sourceSize:'原片尺寸',sizePresets:'尺寸快捷项',sourceSizeUnavailable:'原片尺寸不在 16–2048 范围内，请设置输出尺寸',width:'宽度',height:'高度',invalidSize:'宽高需为 16–2048 的整数。',alphaResolution:'Alpha 分辨率',alphaHalfHint:'透明边缘宽高各减半，RGB 保持完整尺寸；不是 50% 透明度。',alphaFullHint:'全分辨率 Alpha，边缘采样更完整，文件可能更大。',fps:'帧率 FPS',targetSize:'体积上限 MB',compression:'压缩预设',ultraQuality:'超清优先',qualityFirst:'高清优先',balanced:'智能均衡',sizeFirst:'体积优先',budgetHint:'成品严格控制在所选 1 / 2 / 3 MB 上限以内（1 MB = 1,000,000 字节）；优先保留输出尺寸、帧率与透明效果，按实际大小自动调整码率并有界重试。视频越长或画面越复杂，同等体积下可保留的细节越少；无法达标时不提供超标文件。',advanced:'高级设置',keepAudio:'保留原片声音',codecHint:'默认 H.264 兼容编码；AAC 音轨直接保留，其余音轨在本机转换。',convert:'开始转换 VAP',convertAgain:'重新转换',converting:'正在转换…',cancel:'取消',generated:'VAP v2 已生成',downloadMp4:'下载 VAP 资源',downloadJson:'下载 vapc.json',downloadZip:'下载完整包 · ZIP',helpOne:'直接上传 MP4、同尺寸图片序列或一个 ZIP，自动识别类型；序列按文件名数字排序。',helpTwo:'选择匹配的去背景方式，先检查透明预览和 Alpha 黑白图。AI 人像只适用于人像，黑白底方式可能误删相近颜色。',helpThree:'设置尺寸、Alpha 分辨率和目标体积，再开始转换。0.5 / 1.0 表示 Alpha 平面分辨率，不是整体透明度。',helpFour:'下载 MP4，旧版网页播放器可配合 vapc.json 使用。成品是否适配具体 iOS / Android SDK，仍需目标设备实测。',blackHint:'适合已知纯黑底素材。黑色衣物、暗部和弱光可能被误删，请先检查透明预览。',whiteHint:'适合已知纯白底素材。白色主体、高光和烟雾可能被误删，请先检查透明预览。',aiHint:'AI 仅分割人像，不适合通用礼物、车辆或粒子。首次约下载 14.3 MB 组件与模型；请检查逐帧效果。',maskHint:'使用与原片对应的灰度遮罩：白色保留、黑色透明。支持静态图片或同步 MP4。',opaqueHint:'不执行抠像，完整保留原片画面颜色；可叠加上下透明渐变。',chromaHint:'自动取样实际幕色，支持红、橙、黄、绿、青、蓝、紫等纯色；也可手动改色。普通场景和不确定素材保留原画面，与幕色相近的主体细节请检查 Alpha。',reading:'正在读取视频…',loading:'正在加载本机组件…',decoding:'正在解码与抠像…',encoding:'正在编码视频…',packaging:'正在打包 VAP…',cancelled:'已取消转换，原片与设置已保留。',stale:'设置已更改，请重新转换。',saved:'已发起下载',audioYes:'有音轨',audioNo:'无音轨',audioKept:'保留声音',audioMuted:'无声导出',audioNone:'原片无声音',withinBudget:'实际文件在目标体积内。',overBudget:'为保留画质，实际文件超出软目标。可选择“体积优先”重新转换。',errorFile:'请选择一段可读取的 MP4 视频（200 MB 以内）。',errorLoad:'视频读取失败，请替换视频或重试；已有原片已保留。',errorLimits:'视频最长 120 秒，原片长边不超过 4096；输出宽高需在 16–2048 之间。',errorUnsupported:'此浏览器不能完成本机 H.264 编解码，请使用支持 WebCodecs 的新版浏览器。',errorDecode:'视频解码失败，请更换为可播放的 H.264 MP4 后重试。',errorEncode:'视频编码失败，请尝试降低尺寸或帧率后重试。',errorAudio:'声音处理失败。可更换 AAC 音轨视频，或主动取消“保留原片声音”后重试。',errorMatte:'当前去背景方式处理失败，请检查遮罩或改用其他方式后重试。',errorInvalid:'请检查尺寸、帧率、目标体积与去背景设置。',errorMask:'请先选择有效的遮罩图片或 MP4。',errorConvert:'转换失败，原片已保留，请检查设置并重试。',errorDownload:'未能发起下载，请重试。',errorZip:'打包组件未能加载，请重试或分别下载 MP4 与 JSON。',previewFailed:'当前帧透明预览失败，请检查去背景方式或遮罩；原片可继续预览。'},
    en:{title:'MP4 to VAP tool',help:'How to use',helpTitle:'MP4 to VAP guide',close:'Close',preview:'Preview',inputType:'Input type',plain:'Regular MP4',chroma:'Solid-color screen',method:'Background removal',blackLuma:'Black background',whiteLuma:'White background',aiPerson:'AI person segmentation',manualMask:'Import mask',opaque:'Keep background',screenAuto:'Detect screen color',screenGreen:'Green',screenBlue:'Blue',chooseMask:'Choose mask image / video',noMask:'No mask selected',original:'Original',transparent:'Transparent',alphaView:'Alpha matte',checker:'Checkerboard',black:'Black',white:'White',blue:'Blue',uploadTitle:'Click, drop or paste an MP4 video',uploadHint:'Up to 200 MB · 120 seconds · On-device processing',pasteHint:'Paste with ⌘V / Ctrl+V to upload',upload:'Upload MP4',previewProcessing:'Preparing current-frame preview…',play:'Play',pause:'Pause',soundOff:'Preview muted',soundOn:'Preview with audio',timeline:'Video timeline',replace:'Replace video',keySettings:'Edges and despill',tolerance:'Key strength',softness:'Edge softness',spill:'Screen-color despill',resultPreview:'Output',compareSource:'Current effect',playResult:'Play transparent',resultPreviewHint:'VAP MP4 stores RGB and grayscale alpha side by side. Regular video players show both; this page uses the Tencent VAP player to composite transparency. Mobile SDK compatibility requires device testing.',privacy:'Video and audio stay on your device and are never uploaded.',output:'Adjust and export',dimensions:'Output dimensions',ratioLocked:'Output ratio locked',sourceSize:'Source size',sizePresets:'Size presets',sourceSizeUnavailable:'Source dimensions exceed the 16–2048 output range; set output dimensions',width:'Width',height:'Height',invalidSize:'Use whole numbers from 16 to 2048.',alphaResolution:'Alpha resolution',alphaHalfHint:'Half width and height for the alpha plane, with full RGB dimensions. This does not mean 50% opacity.',alphaFullHint:'Full-resolution alpha preserves more edge samples and may increase file size.',fps:'Frame rate FPS',targetSize:'Size limit MB',compression:'Compression preset',ultraQuality:'Ultra quality',qualityFirst:'Quality first',balanced:'Balanced',sizeFirst:'Size first',budgetHint:'Exports stay below the selected 1 / 2 / 3 MB limit (1 MB = 1,000,000 bytes). Dimensions, frame rate and transparency are preserved while bitrate is adjusted with bounded retries. Longer or more complex videos retain less detail at the same size. Oversized results are never offered for download.',advanced:'Advanced settings',keepAudio:'Keep source audio',codecHint:'H.264 for compatibility. AAC is copied; other audio is converted on-device.',convert:'Convert to VAP',convertAgain:'Convert again',converting:'Converting…',cancel:'Cancel',generated:'VAP v2 generated',downloadMp4:'Download VAP asset',downloadJson:'Download vapc.json',downloadZip:'Download bundle · ZIP',helpOne:'Import one MP4, same-size image frames, or one ZIP. The input type is detected automatically; numeric filenames determine frame order.',helpTwo:'Choose the matching background removal method and inspect transparency and alpha. AI is for people only; black / white keying can remove similar foreground colors.',helpThree:'Set dimensions, alpha resolution and target size, then convert. Alpha 0.5 / 1.0 controls plane resolution, not overall opacity.',helpFour:'Download the MP4. Older web players can use vapc.json. Test the final file on the target iOS / Android SDK.',blackHint:'For a known black background. Dark clothing, shadows and faint lights may be removed; inspect transparency first.',whiteHint:'For a known white background. White subjects, highlights and smoke may be removed; inspect transparency first.',aiHint:'AI segments people only, not general gifts, vehicles or particles. About 14.3 MB of components and model download on first use. Inspect the moving edges.',maskHint:'Use a matching grayscale mask: white keeps the image and black makes it transparent. Static images and synchronized MP4 masks are supported.',opaqueHint:'No background removal. Source frame colors are preserved, with optional top and bottom transparency fades.',chromaHint:'Samples the actual solid screen color automatically, with manual color overrides. Uncertain scenes keep the original frame. Check alpha for foreground details similar to the screen color.',reading:'Reading video…',loading:'Loading local components…',decoding:'Decoding and matting…',encoding:'Encoding video…',packaging:'Packaging VAP…',cancelled:'Conversion cancelled. Your source and settings are preserved.',stale:'Settings changed. Convert again to update the result.',saved:'Download requested',audioYes:'Audio track',audioNo:'No audio',audioKept:'Audio kept',audioMuted:'Muted output',audioNone:'Source has no audio',withinBudget:'The actual file is within the target size.',overBudget:'The file exceeds the soft target to preserve quality. Choose “Size first” to retry.',errorFile:'Choose a readable MP4 video under 200 MB.',errorLoad:'Could not read this video. Replace it or retry; your previous source is preserved.',errorLimits:'Use up to 120 seconds and a source long edge up to 4096. Output dimensions must be 16–2048.',errorUnsupported:'This browser cannot encode and decode local H.264. Use a current browser with WebCodecs support.',errorDecode:'Video decoding failed. Try a playable H.264 MP4.',errorEncode:'Encoding failed. Try smaller dimensions or a lower frame rate.',errorAudio:'Audio processing failed. Try AAC audio, or explicitly turn off “Keep source audio”.',errorMatte:'Background removal failed. Check the mask or try another method.',errorInvalid:'Check dimensions, frame rate, target size and removal settings.',errorMask:'Choose a valid mask image or MP4 first.',errorConvert:'Conversion failed. Your source is preserved. Check settings and retry.',errorDownload:'Could not start the download. Please retry.',errorZip:'Could not load ZIP packaging. Retry or download MP4 and JSON separately.',previewFailed:'Current-frame matting failed. Check the method or mask; the original preview is still available.'}
  };
  Object.assign(copy.zh,{verticalMask:'上下透明渐变',enableVerticalMask:'启用上下透明渐变',verticalMaskHint:'拖动画面中的四条辅助线，或输入百分比。上、下边缘平滑过渡到透明，中间画面保留；辅助线不写入成品。',maskTopStart:'上方全透明至',maskTopEnd:'上方渐变结束',maskBottomStart:'下方渐变开始',maskBottomEnd:'下方全透明自',maskShortTopStart:'上透明',maskShortTopEnd:'上保留',maskShortBottomStart:'下保留',maskShortBottomEnd:'下透明',maskOrderError:'请按从上到下排列四个边界，两段渐变都需保留宽度。',maskLiveHint:'遮罩调整实时生效，预览与导出使用当前参数；若已生成成品，修改后需重新转换。',maskLive:'实时生效',maskInvalid:'请检查参数',maskOff:'未启用',maskGuides:'上下渐变辅助线',keepFrameMask:'保留画面 + 透明遮罩',frameMaskHint:'保留画面颜色，实时按上下渐变调整透明度；转换时直接使用当前设置。'});
  Object.assign(copy.en,{verticalMask:'Top and bottom transparency',enableVerticalMask:'Enable vertical transparency fade',verticalMaskHint:'Drag the four guides or enter percentages. The top and bottom fade smoothly to transparent while the middle stays visible. Guides are not exported.',maskTopStart:'Top fully transparent until',maskTopEnd:'Top fade ends',maskBottomStart:'Bottom fade starts',maskBottomEnd:'Bottom fully transparent from',maskShortTopStart:'Top clear',maskShortTopEnd:'Top visible',maskShortBottomStart:'Bottom visible',maskShortBottomEnd:'Bottom clear',maskOrderError:'Keep the four boundaries in top-to-bottom order, with nonzero width for both fades.',maskLiveHint:'Mask edits take effect immediately in preview and export settings. After changing a generated result, convert again to update the file.',maskLive:'Live',maskInvalid:'Check values',maskOff:'Off',maskGuides:'Vertical fade guides',keepFrameMask:'Keep frame + transparency mask',frameMaskHint:'Preserves frame colors and adjusts alpha using the current vertical fade. Edits take effect immediately; convert with the current settings.'});
  Object.assign(copy.zh,{volume:'视频音量',volumeMobile:'移动端 60%',volumeOriginal:'原声 100%',volumePresets:'音量预设',volumeHint:'本站移动端推荐默认 60%（相对原片约 -4.4 dB），预览与导出同时生效；100% 保持原音量，0% 无声。这是音频增益预设，不是 LUFS 自动响度归一化；实际响度受原片、播放器与设备音量影响，交付前请在目标手机中试听。',noAudioHint:'原片没有音轨。',disabledAudioHint:'已关闭保留原片声音，成品将无声。',previewAudioError:'预览声音暂时无法启用，请重新点击声音按钮重试；导出设置仍保留。',codecHint:'默认 H.264 兼容编码；原音量 AAC 直接保留，调整音量时在本机重新编码声音。',previewBackground:'两侧预览背景',outputEmpty:'输出效果将在这里显示',outputBeforeUpload:'上传视频并完成转换后，在这里查看成品。',outputBeforeConvert:'调整完成后，点击“开始转换 VAP”。',outputProcessing:'正在生成输出效果',outputPlayerLoading:'正在加载成品预览…',outputPlayerError:'成品预览暂时无法播放',outputPlayerErrorHint:'导出文件已生成，仍可下载。'});
  Object.assign(copy.en,{volume:'Video volume',volumeHint:'Applies to preview and export. 100% keeps source volume; 0% is silent.',noAudioHint:'The source has no audio track.',disabledAudioHint:'Source audio is turned off. The export will be silent.',previewAudioError:'Preview audio could not start. Try the sound button again; export settings are preserved.',codecHint:'H.264 for compatibility. AAC at source volume is copied; volume adjustments re-encode audio on-device.',previewBackground:'Background for both previews',outputEmpty:'Your output will appear here',outputBeforeUpload:'Upload and convert a video to view the result here.',outputBeforeConvert:'Finish adjusting, then choose “Convert to VAP”.',outputProcessing:'Generating output',outputPlayerLoading:'Loading output preview…',outputPlayerError:'Output preview could not play',outputPlayerErrorHint:'Your export is ready and can still be downloaded.'});
  Object.assign(copy.zh,{alphaView:'Alpha',chroma:'纯色幕布',enableVerticalMask:'启用',backgroundLabel:'两侧背景',parameterGuide:'参数说明',screenColor:'幕布颜色',downloadJson:'配置 JSON',downloadZip:'完整包 ZIP',overBudget:'超过目标体积',noAudioLabel:'无音轨',audioOffLabel:'已关闭声音'});
  Object.assign(copy.en,{alphaView:'Alpha',chroma:'Solid-color screen',enableVerticalMask:'Enabled',backgroundLabel:'Both backgrounds',parameterGuide:'Parameter guide',screenColor:'Screen color',downloadJson:'JSON config',downloadZip:'ZIP bundle',overBudget:'Above target size',noAudioLabel:'No audio',audioOffLabel:'Audio off'});
  Object.assign(copy.en,{volumeMobile:'Mobile 60%',volumeOriginal:'Original 100%',volumePresets:'Volume presets',volumeHint:'This site recommends 60% for mobile (about -4.4 dB relative to the source), applied to both preview and export. 100% keeps source volume; 0% is silent. This is an audio gain preset, not automatic LUFS loudness normalization. Actual loudness depends on the source, player and device volume; audition on the target phone before delivery.'});
  Object.assign(copy.zh,{checker:'透明',sourceAuto:'自动识别',sourceDetecting:'正在识别…',sourceGreen:'绿幕 MP4',sourceBlue:'蓝幕 MP4',helpOne:'直接上传 MP4、同尺寸图片序列或一个 ZIP，自动识别类型；序列按文件名数字排序。'});
  Object.assign(copy.en,{checker:'Transparent',sourceAuto:'Auto-detect',sourceDetecting:'Detecting…',sourceGreen:'Green-screen MP4',sourceBlue:'Blue-screen MP4',helpOne:'Import one MP4, same-size image frames, or one ZIP. The input type is detected automatically; numeric filenames determine frame order.'});
  Object.assign(copy.zh,{errorBudget:'文件未能压到体积上限以内。请缩短视频、降低帧率或关闭声音后重试；原素材已保留。',recompressing:'正在压缩体积…'});
  Object.assign(copy.en,{errorBudget:'Could not fit this video within the size limit. Shorten it, reduce the frame rate or turn audio off, then retry. Your source is preserved.',recompressing:'Compressing to size…'});
  Object.assign(copy.zh,{vapPlaybackNotice:'请在本页“透明播放”中查看；普通视频播放器会显示 RGB 与黑白 Alpha 通道。'});
  Object.assign(copy.en,{vapPlaybackNotice:'Use Play transparent on this page. Regular video players show RGB and grayscale alpha side by side.'});
  Object.assign(copy.zh,{inspectVap:'查看 VAP 成品'});
  Object.assign(copy.en,{inspectVap:'Check VAP output'});
  Object.assign(copy.zh,{moveVideo:'上下拖动调整视频位置；方向键微调，Shift 加速'});
  Object.assign(copy.en,{moveVideo:'Drag vertically to position the video. Arrow keys nudge; Shift moves faster.'});
  Object.assign(copy.zh,{rgbFeather:'RGB 羽化',rgbFeatherReference:'同步羽化（参考效果）',rgbFeatherStraight:'标准 Alpha（兼容直通）',rgbFeatherHint:'同步羽化会把渐隐写入 RGB 与 Alpha，系统播放器也能看到柔和边缘。本站按文件标记播放；接入要求直通 RGB 的 SDK 时，请选择标准 Alpha。'});
  Object.assign(copy.en,{rgbFeather:'RGB feathering',rgbFeatherReference:'Feather RGB and Alpha',rgbFeatherStraight:'Straight RGB compatibility',rgbFeatherHint:'Feathered RGB also shows soft edges in regular video players. This site reads the embedded mode. Choose straight RGB for SDKs that require it.'});
  Object.assign(copy.zh,{rgbFeatherApplied:'RGB 同步羽化',errorFeather:'羽化组件版本不一致，请刷新页面后重新转换。'});
  Object.assign(copy.en,{rgbFeatherApplied:'RGB + Alpha feathered',errorFeather:'The feathering component is outdated. Refresh this page and convert again.'});
  Object.assign(copy.zh,{nativeVap:'VAP · 已识别资源与透明通道',resourceInvalid:'请补齐头像和文字，并检查资源标签、位置与时间。',errorVapSource:'VAP 配置与视频不匹配，无法读取资源与透明通道。',dynamicResources:'动态资源',bakedResources:'固定合成',resourceBundleHint:'头像按Key替换，完整包 ZIP 包含占位资源与接入示例。'});
  Object.assign(copy.en,{nativeVap:'VAP · Resources and alpha detected',resourceInvalid:'Complete the avatar and text, then check tags, position and timing.',errorVapSource:'The VAP configuration does not match the video.',dynamicResources:'Dynamic resources',bakedResources:'Baked resources',resourceBundleHint:'Avatars use key bindings. The ZIP includes placeholders and integration examples.'});
  copy.zh.errorResourceLimit='原 VAP 超过 6 个资源位，请先减少资源后导入。';copy.en.errorResourceLimit='This VAP has more than 6 resource slots. Reduce its resources before importing.';
  Object.assign(copy.zh,{screenRed:'红色',screenOrange:'橙色',screenYellow:'黄色',screenCyan:'青色',screenMagenta:'紫 / 品红',screenCustom:'其他纯色'});
  Object.assign(copy.en,{screenRed:'Red',screenOrange:'Orange',screenYellow:'Yellow',screenCyan:'Cyan',screenMagenta:'Purple / magenta',screenCustom:'Other solid color'});
  const screenColors=['red','orange','yellow','green','cyan','blue','magenta','custom'];
  const screenLabel=color=>t('screen'+color[0].toUpperCase()+color.slice(1));
  const validScreenBackground=value=>Array.isArray(value)&&value.length===3&&value.every(c=>Number.isInteger(c)&&c>=0&&c<=255);
  Object.assign(copy.zh,{title:'VAP 转换工具',helpTitle:'VAP 转换使用说明',inputVideo:'MP4 视频',inputSequence:'序列帧',inputModes:'输入来源',sequenceTitle:'点击、拖入或粘贴序列帧',sequenceHint:'PNG / WebP / JPG / ZIP · 按文件名数字排序 · 本机处理',sequenceUpload:'上传序列帧',sequenceReplace:'替换序列帧',sequenceType:'图片序列帧',frames:'帧',sequenceFps:'序列帧率 FPS',sequenceReading:'正在读取序列帧…',sequenceHelp:'可多选同尺寸图片或上传 ZIP；帧率决定序列播放速度，透明图片保留原始透明度，可叠加上下渐变。',sequenceFpsError:'帧率需为 1–60；序列总时长不能超过 120 秒。',sequenceError:'序列帧读取失败，请检查图片、尺寸、帧数与文件大小。',budget1:'1 MB 以内',budget2:'2 MB 以内',budget3:'3 MB 以内',budgetPresets:'体积上限快捷项'});
  Object.assign(copy.en,{title:'VAP converter',helpTitle:'VAP conversion guide',inputVideo:'MP4 video',inputSequence:'Image sequence',inputModes:'Input source',sequenceTitle:'Click, drop or paste image frames',sequenceHint:'PNG / WebP / JPG / ZIP · Numeric filename order · On-device',sequenceUpload:'Upload frames',sequenceReplace:'Replace frames',sequenceType:'Image sequence',frames:'frames',sequenceFps:'Sequence FPS',sequenceReading:'Reading image frames…',sequenceHelp:'Select same-size images or one ZIP. FPS controls sequence speed. Source alpha is preserved, with optional vertical fades.',sequenceFpsError:'Use 1–60 FPS and a sequence duration no longer than 120 seconds.',sequenceError:'Could not read these frames. Check image format, dimensions, frame count and total size.',budget1:'Under 1 MB',budget2:'Under 2 MB',budget3:'Under 3 MB',budgetPresets:'File size limit presets'});
  Object.assign(copy.zh,{methodAuto:'自动识别（默认）',chromaKey:'纯色幕布抠像',autoMethodHint:'上传后自动识别纯色幕布、纯黑底与纯白底；普通场景或不确定素材保留原画面。可在高级设置中手动调整，并检查透明效果与 Alpha。',helpTwo:'上传后自动识别去背景方式；需要调整时展开高级设置。先检查透明效果和 Alpha，黑白底方式可能影响相近颜色的主体。'});
  Object.assign(copy.en,{methodAuto:'Auto-detect (default)',chromaKey:'Solid-color keying',autoMethodHint:'Detects solid-color screens and pure black or white backgrounds after import. Regular or uncertain scenes keep their original background. Override in Advanced settings and inspect transparency and alpha.',helpTwo:'Background removal is detected after import. Override it in Advanced settings when needed, and inspect transparency and alpha. Black / white keying can affect similar foreground colors.'});
  Object.assign(copy.zh,{uploadTitle:'点击、拖入或粘贴 MP4 / 序列帧',uploadHint:'MP4 / PNG / WebP / JPG / ZIP · 200 MB 内 · 本机处理',upload:'上传文件',replace:'替换文件',reading:'正在识别并读取文件…',errorFile:'请选择一个 MP4、同尺寸图片序列，或一个序列帧 ZIP；不同类型不能混选。'});
  Object.assign(copy.en,{uploadTitle:'Click, drop or paste MP4 / image frames',uploadHint:'MP4 / PNG / WebP / JPG / ZIP · Up to 200 MB · On-device',upload:'Upload files',replace:'Replace files',reading:'Detecting and reading files…',errorFile:'Choose one MP4, same-size image frames, or one frame ZIP. Do not mix input types.'});
  Object.assign(copy.zh,{refining:'正在提升画质…',codecHint:'优先使用高清 H.264 编码，不支持时自动回退兼容配置；原音量 AAC 直接保留，调整音量时在本机重新编码声音。'});
  Object.assign(copy.en,{refining:'Refining video quality…',codecHint:'Uses efficient H.264 encoding with a compatibility fallback. AAC at source volume is copied; volume adjustments re-encode audio on-device.'});
  const maskDefaults={enabled:true,topStart:0,topEnd:.15,bottomStart:.85,bottomEnd:1};
  Object.assign(copy.zh,{giftFade:'礼物淡入淡出',giftFadeEnabled:'启用',giftFadeIn:'淡入时长',giftFadeOut:'淡出时长',secondsUnit:'秒',giftFadeError:'淡入、淡出时长需为 0–120 秒。',giftFadeHint:'礼物默认淡入、淡出各 1 秒；设为 0 秒可取消对应一侧的渐变。短片会按比例缩短两端时长，少于 3 帧时保留原画面，避免整段全透明。'});
  Object.assign(copy.en,{giftFade:'Gift fade in and out',giftFadeEnabled:'Enabled',giftFadeIn:'Fade-in duration',giftFadeOut:'Fade-out duration',secondsUnit:'s',giftFadeError:'Use fade durations from 0 to 120 seconds.',giftFadeHint:'Gifts fade in and out for 1 second each by default. Set either duration to 0 to disable that end. Short clips proportionally shorten both fades; clips with fewer than 3 frames keep their original image so the entire clip stays visible.'});
  const maskFields=[['TopStart','topStart'],['TopEnd','topEnd'],['BottomStart','bottomStart'],['BottomEnd','bottomEnd']];
  const maskStorageKey='fun-toolkit.vap.vertical-mask.v1';
  function savedMask(){
    try{
      const value=JSON.parse(window.localStorage?.getItem(maskStorageKey)||'null');
      if(validVerticalMask(value))return {enabled:value.enabled,topStart:value.topStart,topEnd:value.topEnd,bottomStart:value.bottomStart,bottomEnd:value.bottomEnd};
    }catch(ignored){}
    return {...maskDefaults};
  }
  let lang=typeof language!=='undefined'&&language==='en'?'en':'zh';
  const t=key=>(copy[lang]||copy.zh)[key]||key;
  const state={active:false,file:null,meta:null,sourceUrl:null,inputMode:'video',sequenceTime:0,videoOffsetY:0,maskFile:null,sourceKind:'plain_mp4',detectedMethod:'opaque',detectedScreen:'auto',detectedBackground:null,alphaScale:.5,outputRatio:720/1560,sizePreset:'default',view:'original',background:'checker',loading:false,converting:false,packing:false,playing:false,revision:0,result:null,notice:null,errorTone:'error',progress:0,phase:'loading',previewError:false};
  state.verticalMask=savedMask();state.giftFade={enabled:true,fadeIn:1,fadeOut:1};state.playerState='empty';state.sourceFrameReady=false;state.previewReady=false;
  const maxOutputBytes=3000000;
  $('Quality').value='ultra';$('Method').value='auto';$('Width').value='720';$('Height').value='1560';$('Target').value='3';$('Volume').value='60';$('VerticalMask').open=true;
  let sequenceLoadController=null,sequenceStarted=0;
  const isSequence=()=>state.file?.kind==='image_sequence';
  Object.assign(copy.zh,{lightRecovery:'光效透明修复',lightRecoveryHint:'适合光圈、粒子等半透明特效；同色实体材质可关闭。'});
  Object.assign(copy.en,{lightRecovery:'Recover transparent glow',lightRecoveryHint:'For translucent light and particles. Turn off for solid materials sharing the screen color.'});
  const activeMethod=()=>isSequence()||state.sourceVapConfig?'opaque':$('Method').value==='auto'?state.detectedMethod:$('Method').value;
  const sourceTime=()=>isSequence()?state.sequenceTime:video.currentTime||0;
  function seekSource(time){const next=Math.max(0,Math.min(state.meta?.duration||0,time));if(isSequence()){state.sequenceTime=next;sync();requestPreview()}else video.currentTime=next}
  let enginePromise=null,loadVersion=0,controller=null,animation=0,previewVersion=0,previewProcessor=null,previewJob=null,previewQueued=false,lastPreviewTime=-1,maskDrag=null,videoDrag=null;
  const sourceFrame=document.createElement('canvas');
  let resourceModulePromise=null,resourcePreview=null,resourcePreviewRevision=-1;
  let giftFadeModulePromise=null;
  const getGiftFadeModule=()=>giftFadeModulePromise||(giftFadeModulePromise=import('./vap-gift-fade.mjs?v=20261029-gift-fade1').catch(error=>{giftFadeModulePromise=null;throw error}));
  const getResourceModule=()=>resourceModulePromise||(resourceModulePromise=import('./vap-resources.mjs?v=20261030-avatar-motion1').catch(error=>{resourceModulePromise=null;throw error}));
  const resourceEditor=window.VapResourceEditor?.create({root,stage,canvas,onChange(event={}){
    if(state.loading||state.converting||state.packing)return;
    if(event.reason==='interaction-start'){pause();return}
    if(event.reason==='focus-resource'){pause();state.view='transparent';sync();requestPreview();stage.scrollIntoView?.({block:'center',behavior:'instant'});return}
    if(event.reason==='seek-resource'){
      if(state.file&&Number.isFinite(event.time)){pause();seekSource(event.time);stage.scrollIntoView?.({block:'center',behavior:'instant'})}
      return;
    }
    if(['loading','image-error'].includes(event.reason)){sync();return}
    pause();invalidateResult();state.previewError=false;previewVersion++;lastPreviewTime=-1;if(resourceEditor.getResources().length)state.view='transparent';sync();requestPreview();
  }});
  let previewAudioContext=null,previewGain=null,playbackVersion=0;
  let sourceNonce=0,firstFrameCallback=null,firstFramePaint=[];
  const busy=()=>state.loading||state.converting||state.packing||!!resourceEditor?.isLoading?.();
  const neutralName=name=>String(name||'').replace(/\u6781\u77ac|\u006a\u0069\u0073\u0068\u0075\u006e/gi,'').replace(/^[_\s-]+|[_\s-]+$/g,'')||'video';
  const getEngine=()=>enginePromise||(enginePromise=import('./vap-engine.mjs?v=20261030-avatar-motion1').catch(error=>{enginePromise=null;throw error}));
  function errorKey(error,fallback='errorConvert'){
    const codes={unsupported:'errorUnsupported',file:'errorFile',decode:'errorDecode',encode:'errorEncode',audio:'errorAudio',matte:'errorMatte',invalid:'errorInvalid',limits:'errorLimits',budget:'errorBudget',cancelled:'cancelled'};
    return codes[error?.code]||fallback;
  }
  function options({preview=false}={}){
    const width=Number($('Width').value),height=Number($('Height').value),fps=Number($('Fps').value),target=Number($('Target').value);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>2048||height>2048||!Number.isInteger(fps)||fps<1||fps>60||!Number.isFinite(target)||target<.1||target>3)throw Object.assign(new Error('invalid export fields'),{code:'invalid'});
    const matteMethod=activeMethod(),sourceKind=matteMethod==='chroma_key'?'chroma_mp4':'plain_mp4';
    if(isSequence()&&state.file.frameCount/fps>120)throw Object.assign(new Error('sequence duration exceeds limit'),{code:'limits'});
    if(matteMethod==='manual_mask'&&!state.maskFile)throw Object.assign(new Error('mask required'),{uiKey:'errorMask'});
    const verticalMask=state.verticalMask;if(!validVerticalMask(verticalMask))throw Object.assign(new Error('invalid vertical mask'),{code:'invalid'});
    const giftFade=state.giftFade;if(!validGiftFade(giftFade))throw Object.assign(new Error('invalid gift fade'),{code:'invalid'});
    const audioGain=Number($('Volume').value)/100;if(!Number.isFinite(audioGain)||audioGain<0||audioGain>2)throw Object.assign(new Error('invalid volume'),{code:'invalid'});
    const resourceOptions={...(resourceEditor?.getOptions()||{resources:[]}),resourceMode:'dynamic'};
    if(!preview&&resourceEditor?.hasErrors())throw Object.assign(new Error('invalid resources'),{uiKey:'resourceInvalid'});
    // Incomplete slots may be edited while the source and valid slots remain visible.
    if(preview)resourceOptions.resources=resourceOptions.resources.filter(r=>r.type==='image'?r.file instanceof Blob&&r.file.size:r.text?.trim());
    return {...resourceOptions,sourceVapConfig:state.sourceVapConfig||undefined,rgbAlphaMode:resourceOptions.resourceMode==='dynamic'&&resourceOptions.resources.length?'premultiplied':$('RgbAlphaMode').value||'premultiplied',sourceKind,matteMethod,screenColor:$('Screen').value,...(matteMethod==='chroma_key'&&$('Screen').value==='auto'&&state.sourceKind==='chroma_mp4'&&state.detectedBackground?{background:state.detectedBackground.slice()}:{}),alphaScale:state.alphaScale,width,height,fps,videoOffsetY:state.videoOffsetY,targetBytes:Math.round(target*1e6),quality:$('Quality').value,keepAudio:$('KeepAudio').checked,audioGain,confirmedOpaque:matteMethod==='opaque',verticalMask:{...verticalMask},giftFade:{...giftFade},maskFile:state.maskFile,keyTolerance:Number($('Tolerance').value),edgeSoftness:Number($('Softness').value),spill:Number($('Spill').value),lightRecovery:matteMethod==='chroma_key'&&$('LightRecovery').checked};
  }
  function syncPreviewVolume(){
    const gain=$('KeepAudio').checked?Math.max(0,Math.min(2,Number($('Volume').value)/100||0)):0;
    video.volume=previewGain?1:Math.min(1,gain);if(previewGain)previewGain.gain.value=gain;
    video.dataset.audioGain=String(gain);
  }
  async function preparePreviewAudio(){
    if(Number($('Volume').value)>100&&!previewGain){
      const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('AudioContext unavailable');
      const context=new AudioContext(),gain=context.createGain();
      try{context.createMediaElementSource(video).connect(gain);gain.connect(context.destination);previewAudioContext=context;previewGain=gain}
      catch(error){void context.close();throw error}
    }
    if(previewAudioContext?.state==='suspended')await previewAudioContext.resume();syncPreviewVolume();
  }
  function syncOutputPlaceholder(){
    const exists=!!state.result,loading=exists?state.playerState==='loading':state.converting,failed=exists&&state.playerState==='error';
    $('ResultPlaceholder').hidden=exists&&state.playerState==='ready';$('OutputSpinner').hidden=!loading;$('OutputArt').hidden=loading;
    $('OutputArt').src='design-system/assets/feedback/'+(failed?'empty-error.svg':'empty-output.svg');
    const title=t(failed?'outputPlayerError':loading?(exists?'outputPlayerLoading':'outputProcessing'):'outputEmpty');
    const hint=t(failed?'outputPlayerErrorHint':loading?(exists?'outputPlayerLoading':state.phase):state.file?'outputBeforeConvert':'outputBeforeUpload');
    if($('OutputEmptyTitle').textContent!==title)$('OutputEmptyTitle').textContent=title;
    if($('OutputEmptyHint').textContent!==hint)$('OutputEmptyHint').textContent=hint;
    $('ResultFrame').setAttribute('aria-busy',String(loading));
  }
  function validVerticalMask(mask){return !!mask&&typeof mask.enabled==='boolean'&&maskFields.every(([,key])=>Number.isFinite(mask[key]))&&mask.topStart>=0&&mask.topStart<mask.topEnd&&mask.topEnd<=mask.bottomStart&&mask.bottomStart<mask.bottomEnd&&mask.bottomEnd<=1}
  function validGiftFade(fade){return !!fade&&typeof fade.enabled==='boolean'&&[fade.fadeIn,fade.fadeOut].every(value=>Number.isFinite(value)&&value>=0&&value<=120)}
  function syncGiftFadeControls(){
    const fade=state.giftFade,locked=busy()||!state.file,valid=validGiftFade(fade);
    $('GiftFadeEnabled').checked=fade.enabled;$('GiftFadeEnabled').disabled=locked;$('GiftFadeEnabled').setAttribute('aria-label',t('giftFade'));
    $('GiftFadeStatus').textContent=t(!valid?'maskInvalid':fade.enabled?'maskLive':'maskOff');$('GiftFadeStatus').dataset.invalid=String(!valid);$('GiftFadeStatus').dataset.enabled=String(fade.enabled);$('GiftFadeError').hidden=valid;
    for(const [id,key] of [['GiftFadeIn','fadeIn'],['GiftFadeOut','fadeOut']]){const field=$(id);field.value=Number.isFinite(fade[key])?String(fade[key]):'';field.disabled=locked||!fade.enabled;field.setAttribute('aria-invalid',String(!valid));}
  }
  function giftFadeChanged(){
    pause();invalidateResult();state.previewError=false;previewVersion++;lastPreviewTime=-1;if(state.giftFade.enabled)state.view='transparent';sync();if(validGiftFade(state.giftFade))requestPreview();
  }
  function maskBounds(key){const m=state.verticalMask,gap=.001;return {topStart:[0,m.topEnd-gap],topEnd:[m.topStart+gap,m.bottomStart],bottomStart:[m.topEnd,m.bottomEnd-gap],bottomEnd:[m.bottomStart+gap,1]}[key]}
  function positionMaskOverlay(){
    const overlay=$('MaskOverlay');if(overlay.hidden)return;const r=canvas.getBoundingClientRect(),s=stage.getBoundingClientRect();
    overlay.style.left=(r.left-s.left-(stage.clientLeft||0))+'px';overlay.style.top=(r.top-s.top-(stage.clientTop||0))+'px';overlay.style.width=(r.width||r.right-r.left)+'px';overlay.style.height=(r.height||r.bottom-r.top)+'px';
    const play=$('Play'),p=play.getBoundingClientRect();
    for(const [id] of maskFields){const label=$('MaskHandle'+id).querySelector('span');label.style.marginRight='0px';const q=label.getBoundingClientRect();if(!play.hidden&&q.bottom>p.top-6&&q.top<p.bottom+6&&q.right>p.left-8&&q.left<p.right+8)label.style.marginRight=Math.max(0,q.right-p.left+8)+'px';}
  }
  function syncMaskControls(){
    const locked=busy()||!state.file,valid=validVerticalMask(state.verticalMask),m=state.verticalMask;
    $('MaskEnabled').checked=m.enabled;$('MaskEnabled').disabled=locked;$('MaskEnabled').setAttribute('aria-label',t('verticalMask'));
    $('MaskStatus').textContent=t(!valid?'maskInvalid':m.enabled?'maskLive':'maskOff');$('MaskStatus').dataset.invalid=String(!valid);$('MaskStatus').dataset.enabled=String(m.enabled);$('MaskError').hidden=valid;
    $('MaskOverlay').hidden=locked||!state.previewReady||!m.enabled||!valid||state.view==='original'||!$('VerticalMask').open;$('MaskOverlay').setAttribute('aria-label',t('maskGuides'));
    for(const [id,key] of maskFields){
      const value=m[key],field=$('Mask'+id),line=$('MaskLine'+id),handle=$('MaskHandle'+id),bounds=maskBounds(key);
      field.value=Number.isFinite(value)?String(Math.round(value*10000)/100):'';field.disabled=locked||!m.enabled;field.setAttribute('aria-invalid',String(!valid));
      line.style.top=(value*100)+'%';handle.disabled=locked;handle.setAttribute('aria-label',t('mask'+id));handle.setAttribute('aria-valuemin',String(Math.round(bounds[0]*10000)/100));handle.setAttribute('aria-valuemax',String(Math.round(bounds[1]*10000)/100));handle.setAttribute('aria-valuenow',String(Math.round(value*10000)/100));handle.setAttribute('aria-valuetext',(Math.round(value*10000)/100)+'%');
      handle.querySelector('span').textContent=t('maskShort'+id)+' '+(Math.round(value*1000)/10)+'%';handle.style.transform=value<=0?'translateY(0)':value>=1?'translateY(-100%)':'translateY(-50%)';
    }
    positionMaskOverlay();
  }
  function maskChanged(){
    if(validVerticalMask(state.verticalMask))try{window.localStorage?.setItem(maskStorageKey,JSON.stringify(state.verticalMask))}catch(ignored){}
    invalidateResult();state.previewError=false;previewVersion++;lastPreviewTime=-1;if(state.verticalMask.enabled)state.view='transparent';sync();if(validVerticalMask(state.verticalMask))requestPreview();
  }
  function setMaskBoundary(key,value,{clamp=false}={}){
    if(busy()||!state.file||!state.verticalMask.enabled)return;
    if(clamp){const [min,max]=maskBounds(key);value=Math.max(min,Math.min(max,value))}if(Number.isFinite(value))value=Math.round(value*1000)/1000;
    if(Object.is(state.verticalMask[key],value))return;state.verticalMask[key]=value;maskChanged();
  }
  function endMaskDrag(){const drag=maskDrag;maskDrag=null;if(drag)try{drag.handle.releasePointerCapture?.(drag.id)}catch(ignored){}}
  function endVideoDrag(event){if(!videoDrag||event?.pointerId!==undefined&&event.pointerId!==videoDrag.id)return;const drag=videoDrag;videoDrag=null;stage.classList.remove('is-positioning');try{stage.releasePointerCapture?.(drag.id)}catch(ignored){}}
  function setVideoOffsetY(value){
    if(busy()||!state.file||!Number.isFinite(value))return;
    const next=Math.round(Math.max(-1,Math.min(1,value))*1e6)/1e6;if(next===state.videoOffsetY)return;
    pause();const revision=state.revision;state.videoOffsetY=next;invalidateResult();
    // Video movement does not change the independent Key textures or their positions.
    if(resourcePreviewRevision===revision)resourcePreviewRevision=state.revision;
    state.previewError=false;previewVersion++;lastPreviewTime=-1;state.view='transparent';sync();requestPreview();
  }
  function validOptions(){try{options();return true}catch(error){return false}}
  function showNotice(key,tone='error'){state.notice=key;state.errorTone=tone;sync()}
  function cleanupProcessor(){
    previewVersion++;lastPreviewTime=-1;const old=previewProcessor,job=previewJob;previewProcessor=null;
    if(old)Promise.allSettled([old,job]).then(async results=>{if(results[0].status==='fulfilled')await results[0].value.dispose?.()}).catch(()=>{});
    const oldResource=resourcePreview;resourcePreview=null;resourcePreviewRevision=-1;
    if(oldResource)Promise.resolve(job).catch(()=>{}).then(()=>oldResource.dispose());
  }
  function releaseResult(){
    if(!state.result)return;
    const {url,resourceRenderer}=state.result;state.result=null;setTimeout(()=>{URL.revokeObjectURL(url);resourceRenderer?.dispose()},60000);
    document.dispatchEvent(new CustomEvent('vap:result-invalidated'));
  }
  function invalidateResult(){
    state.revision++;const hadResult=!!state.result;releaseResult();
    if(hadResult){state.notice='stale';state.errorTone='info'}else state.notice=null;
  }
  function invalidate(){
    if(busy())return;invalidateResult();
    state.previewError=false;cleanupProcessor();sync();requestPreview();
  }
  function sync(){
    let locked=busy();const ready=!!state.file,sequence=isSequence(),sequenceInput=state.inputMode==='sequence';
    resourceEditor?.setContext({ready,busy:locked,width:Number($('Width').value)||720,height:Number($('Height').value)||1560,duration:state.meta?.duration||0,fps:Number($('Fps').value)||24,time:sourceTime(),view:state.view,language:lang});
    // A native avatar slot may start loading its default portrait during context sync.
    locked=busy();const valid=validOptions();if(locked)endVideoDrag();
    root.dataset.state=state.loading?'loading':state.converting||state.packing?'processing':state.notice&&state.errorTone==='error'?'error':state.result?'success':ready?'ready':'idle';
    root.setAttribute('aria-busy',String(locked));stage.setAttribute('aria-busy',String(locked));stage.classList.toggle('has-file',ready);stage.classList.toggle('upload-ready',!ready);
    for(const id of ['Upload','Replace','Input','SequenceInput','InputVideo','InputSequence','Budget1','Budget2','Budget3','Method','Screen','MaskPick','MaskInput','Width','Height','Fps','Target','Quality','RgbAlphaMode','KeepAudio','Tolerance','Softness','Spill','LightRecovery','AlphaHalf','AlphaFull','SizeDefault','Size750'])$(id).disabled=locked;
    for(const id of ['Play','Mute','Timeline','ViewOriginal','ViewTransparent','ViewAlpha'])$(id).disabled=locked||!ready;
    for(const id of ['BgChecker','BgBlack','BgWhite'])$(id).disabled=locked;
    $('Empty').hidden=ready;$('Sourcebar').hidden=!ready;$('Playback').hidden=!ready;$('ViewToolbar').hidden=false;
    $('SourceVideo').hidden=sequence||!ready||(state.view!=='original'&&state.previewReady);$('PreviewCanvas').hidden=!ready||(!sequence&&state.view==='original')||!state.previewReady;
    $('InputVideo').setAttribute('aria-pressed',String(!sequenceInput));$('InputSequence').setAttribute('aria-pressed',String(sequenceInput));$('InputModes').setAttribute('aria-label',t('inputModes'));$('InputModes').hidden=true;$('DetectedType').hidden=true;
    root.querySelector('[data-vap-i18n="uploadTitle"]').textContent=t('uploadTitle');root.querySelector('[data-vap-i18n="uploadHint"]').textContent=t('uploadHint');$('Upload').textContent=t('upload');$('Replace').textContent=t('replace');
    $('BudgetPresets').setAttribute('aria-label',t('budgetPresets'));$('BudgetPresets').hidden=true;for(const amount of [1,2,3])$('Budget'+amount).setAttribute('aria-pressed',String(Number($('Target').value)===amount));
    root.querySelector('[data-vap-i18n="fps"]').textContent=t(sequence||!ready&&sequenceInput?'sequenceFps':'fps');$('Mute').hidden=true;

    root.dataset.sourceFrameReady=String(state.sourceFrameReady);root.dataset.previewReady=String(state.previewReady);
    const method=activeMethod(),chroma=method==='chroma_key';
    $('DetectedType').textContent=t(state.loading?'sourceDetecting':!ready?(sequenceInput?'sequenceType':'sourceAuto'):sequence?'sequenceType':state.sourceVapConfig?'nativeVap':({chroma_key:'chroma',black_luma:'blackLuma',white_luma:'whiteLuma',opaque:'plain'}[method]||'plain'));
    if(ready&&!state.loading&&chroma)$('DetectedType').textContent=t('chroma')+' · '+($('Screen').value==='auto'?screenLabel(state.detectedScreen):screenLabel($('Screen').value));
    $('MethodWrap').hidden=(!ready&&sequenceInput)||sequence||!!state.sourceVapConfig;$('ScreenWrap').hidden=!chroma;
    const dynamicResources=resourceEditor?.getOptions();if(dynamicResources?.resources.length){$('RgbAlphaMode').value='premultiplied';$('RgbAlphaMode').disabled=true}
    $('MaskRow').hidden=sequence||chroma||method!=='manual_mask';
    $('KeySettings').hidden=sequence||!chroma&&!['black_luma','white_luma'].includes(method);$('LightRecoveryRow').hidden=!chroma;$('LightRecovery').title=t('lightRecoveryHint');
    $('MethodHint').textContent=t(sequence?'sequenceHelp':$('Method').value==='auto'&&!state.sourceVapConfig?'autoMethodHint':chroma?'chromaHint':method==='opaque'&&state.verticalMask.enabled?'frameMaskHint':({black_luma:'blackHint',white_luma:'whiteHint',ai_foreground:'aiHint',manual_mask:'maskHint',opaque:'opaqueHint'}[method]||'opaqueHint'));
    root.querySelector('[data-vap-i18n="opaque"]').textContent=t(state.verticalMask.enabled?'keepFrameMask':'opaque');
    $('Spill').closest('.vap-range-row').hidden=!chroma;
    $('MaskName').textContent=state.maskFile?neutralName(state.maskFile.name):t('noMask');
    const sourceSizeAvailable=!!state.meta&&[state.meta.width,state.meta.height].every(n=>Number.isInteger(n)&&n>=16&&n<=2048);
    $('SizeSource').disabled=locked||!sourceSizeAvailable;$('SizeSource').title=sourceSizeAvailable?'':t('sourceSizeUnavailable');$('SizeDefault').setAttribute('aria-pressed',String(state.sizePreset==='default'));$('Size750').setAttribute('aria-pressed',String(state.sizePreset==='750'));$('SizeSource').setAttribute('aria-pressed',String(state.sizePreset==='source'));root.querySelector('.vap-size-presets').setAttribute('aria-label',t('sizePresets'));
    $('AlphaHalf').setAttribute('aria-pressed',String(state.alphaScale===.5));$('AlphaFull').setAttribute('aria-pressed',String(state.alphaScale===1));$('AlphaHint').textContent=t(state.alphaScale===.5?'alphaHalfHint':'alphaFullHint');
    for(const [id,value] of [['Original','original'],['Transparent','transparent'],['Alpha','alpha']])$('View'+id).setAttribute('aria-pressed',String(state.view===value));
    for(const [id,value] of [['Checker','checker'],['Black','black'],['White','white']])$('Bg'+id).setAttribute('aria-pressed',String(state.background===value));
    stage.dataset.background=state.background;$('ResultFrame').dataset.background=state.background;
    $('Play').hidden=!ready;$('Play').textContent='';$('Play').setAttribute('aria-label',t(state.playing?'pause':'play'));$('Play').title=t(state.playing?'pause':'play');$('Play').setAttribute('aria-pressed',String(state.playing));$('Mute').textContent=t(video.muted?'soundOff':'soundOn');$('Mute').setAttribute('aria-pressed',String(!video.muted));
    $('Volume').closest('.vap-volume').hidden=sequence||!ready&&sequenceInput;$('KeepAudio').closest('label').hidden=sequence||!ready&&sequenceInput;
    $('Volume').disabled=locked||!state.meta?.hasAudio||!$('KeepAudio').checked;$('VolumeValue').textContent=state.meta&&!state.meta.hasAudio?t('noAudioLabel'):!$('KeepAudio').checked?t('audioOffLabel'):$('Volume').value+'%';$('Volume').setAttribute('aria-valuetext',$('Volume').value+'%');
    $('VolumeHint').textContent=t(state.meta&&!state.meta.hasAudio?'noAudioHint':!$('KeepAudio').checked?'disabledAudioHint':'volumeHint');$('Volume').title=$('VolumeHint').textContent;syncPreviewVolume();
    $('VolumePresets').setAttribute('aria-label',t('volumePresets'));for(const [id,percent] of [['VolumeMobile',60],['VolumeOriginal',100]]){$(id).disabled=$('Volume').disabled;$(id).setAttribute('aria-pressed',String(Number($('Volume').value)===percent));$(id).title=$('VolumeHint').textContent}
    if(ready){$('FileName').textContent=neutralName(state.file.name).replace(/\.sequence$/i,'');$('FileMeta').textContent=`${state.meta.width} × ${state.meta.height} px · ${sequence?state.file.frameCount+' '+t('frames')+' · ':''}${state.meta.duration.toFixed(2)} s · ${(state.file.size/1e6).toFixed(2)} MB · ${t(state.meta.hasAudio?'audioYes':'audioNo')}`}
    $('Time').textContent=`${sourceTime().toFixed(2)} / ${(state.meta?.duration||0).toFixed(2)} s`;
    $('Timeline').max=String(state.meta?.duration||0);$('Timeline').value=String(Math.min(sourceTime(),state.meta?.duration||0));
    const validSize=['Width','Height'].every(id=>{const n=Number($(id).value);return Number.isInteger(n)&&n>=16&&n<=2048});
    for(const id of ['Width','Height'])$(id).setAttribute('aria-invalid',String(!validSize));$('SizeError').hidden=validSize;
    const validFps=Number.isInteger(Number($('Fps').value))&&Number($('Fps').value)>=1&&Number($('Fps').value)<=60&&(!sequence||state.file.frameCount/Number($('Fps').value)<=120);$('Fps').setAttribute('aria-invalid',String(!validFps));$('FpsError').hidden=validFps;$('FpsError').textContent=t('sequenceFpsError');
    $('Convert').disabled=locked||!ready||!valid;$('Convert').textContent=t(state.converting?'converting':state.result?'convertAgain':'convert');$('Convert').setAttribute('aria-busy',String(state.converting));
    $('Convert').classList.toggle('vap-primary',!state.result);$('Convert').classList.toggle('vap-secondary',!!state.result);
    $('Cancel').hidden=!state.loading&&!state.converting;$('Cancel').disabled=state.packing;
    $('ProgressRow').hidden=!state.loading&&!state.converting;$('Phase').textContent=t(state.loading?'reading':state.phase);$('Percent').textContent=Math.round(state.progress*100)+'%';$('Progress').value=state.progress;
    $('Notice').hidden=!state.notice;$('Notice').textContent=state.notice?t(state.notice):'';$('Notice').dataset.tone=state.errorTone;
    $('PreviewError').hidden=!state.previewError;$('PreviewError').textContent=t('previewFailed');
    $('Result').hidden=!state.result;$('ResultPreview').hidden=!state.result;$('CompareSourceLabel').hidden=!ready;root.querySelector('.vap-view-modes').hidden=!ready;$('Comparison').classList.toggle('has-source',ready);$('Comparison').classList.toggle('has-result',!!state.result);$('Comparison').style.setProperty('--vap-preview-ratio',String(Number($('Width').value)/Number($('Height').value)||720/1560));syncOutputPlaceholder();
    for(const id of ['DownloadMp4','DownloadJson','DownloadZip'])$(id).disabled=locked||!state.result;
    $('ResultPlay').hidden=!state.result;$('ResultPlay').disabled=locked||!state.result||state.playerState!=='ready';$('DownloadMp4').title=t('vapPlaybackNotice');
    $('ResourceBundleHint').hidden=state.result?.config?.info?.isVapx!==1;$('ResourceBundleHint').textContent=t('resourceBundleHint');
    if(state.result){
      const {blob,config,report}=state.result,info=config.info;const seconds=Number(report.timings?.wallMs)/1000;
      $('ResultMeta').textContent=`${info.w} × ${info.h} px · ${info.fps} FPS · Alpha ${state.alphaScale.toFixed(1)}${config.funToolkit?.rgbAlphaMode==='premultiplied'?' · '+t('rgbFeatherApplied'):''}${report.resourceCount?' · '+t(report.resourceMode==='dynamic'?'dynamicResources':'bakedResources')+' '+report.resourceCount:''}\n${(blob.size/1e6).toFixed(2)} MB · ${t(report.audioKept?'audioKept':state.meta.hasAudio?'audioMuted':'audioNone')}${report.audioKept&&Number.isFinite(report.audioGain)&&report.audioGain!==1?` · ${t('volume')} ${Math.round(report.audioGain*100)}%`:''}${Number.isFinite(seconds)?` · ${seconds.toFixed(2)} s`:''}`;
      $('BudgetNotice').textContent=t(report.budgetExceeded?'overBudget':'withinBudget');
      $('BudgetNotice').hidden=!report.budgetExceeded;
    }
    for(const [id,field] of [['Tolerance','keyTolerance'],['Softness','edgeSoftness'],['Spill','spill']])$(''+id+'Value').textContent=Math.round(Number($(id).value)*100)+'%';
    stage.setAttribute('aria-label',t(ready?'moveVideo':'uploadTitle'));stage.title=ready?t('moveVideo'):'';stage.setAttribute('tabindex',ready?'0':'-1');stage.dataset.videoOffsetY=String(state.videoOffsetY);$('Progress').setAttribute('aria-label',t('converting'));root.querySelector('.vap-view-modes').setAttribute('aria-label',t('preview'));root.querySelector('.vap-view-background').setAttribute('aria-label',t('previewBackground'));$('Screen').setAttribute('aria-label',t('chroma'));$('Timeline').setAttribute('aria-label',t('timeline'));canvas.setAttribute('aria-label',t(state.view==='alpha'?'alphaView':'transparent'));
    syncMaskControls();syncGiftFadeControls();
    window.FunToolkitUI?.setState('vap',{phase:state.loading?'loading':state.converting||state.packing?'processing':state.notice&&state.errorTone==='error'?'error':state.result?'success':ready?'ready':'empty',message:state.loading?t('reading'):t(state.phase)});
  }
  function pause(){playbackVersion++;video.pause();state.playing=false;if(animation)cancelAnimationFrame(animation);animation=0;sync()}
  function loop(){
    animation=0;if(!state.playing||!state.active||document.hidden)return;
    if(isSequence()){state.sequenceTime=Math.min(state.meta.duration,(Date.now()-sequenceStarted)/1000);if(state.sequenceTime>=state.meta.duration){pause();requestPreview();return}}
    sync();if((isSequence()||state.view!=='original')&&Math.abs(sourceTime()-lastPreviewTime)>.015)requestPreview();animation=requestAnimationFrame(loop);
  }
  async function togglePlay(){
    if(!state.file||busy())return;if(state.playing){pause();return}
    if(isSequence()){if(sourceTime()>=state.meta.duration-.02)state.sequenceTime=0;sequenceStarted=Date.now()-sourceTime()*1000;state.playing=true;sync();loop();return}
    if(video.currentTime>=state.meta.duration-.02)video.currentTime=0;
    const token=++playbackVersion,url=state.sourceUrl,current=()=>token===playbackVersion&&state.sourceUrl===url&&state.active&&!document.hidden&&!busy();
    try{if(!video.muted)await preparePreviewAudio()}catch(error){if(current()){video.muted=true;showNotice('previewAudioError')}return}
    if(!current())return;
    try{await video.play();if(!current()){video.pause();return}state.playing=true;sync();loop()}catch(error){if(current())showNotice('errorDecode')}
  }
  function getPreviewProcessor(opts){
    if(!previewProcessor)previewProcessor=import('./vap-matte.mjs?v=20261030-avatar-motion1').then(module=>module.createMatteProcessor(opts)).catch(error=>{previewProcessor=null;throw error});
    return previewProcessor;
  }
  function cancelSourceFrameWait(){
    if(firstFrameCallback!==null)video.cancelVideoFrameCallback?.(firstFrameCallback);firstFrameCallback=null;
    for(const id of firstFramePaint)cancelAnimationFrame(id);firstFramePaint=[];
  }
  function currentSource(nonce,url){return nonce===sourceNonce&&state.sourceUrl===url&&!!state.file}
  function acceptSourceFrame(nonce,url){
    if(isSequence()||!currentSource(nonce,url)||state.sourceFrameReady||video.readyState<2)return;
    state.sourceFrameReady=true;cancelSourceFrameWait();sync();requestPreview();
  }
  function waitForSourceFrame(){
    cancelSourceFrameWait();const nonce=sourceNonce,url=state.sourceUrl;
    if(typeof video.requestVideoFrameCallback==='function')firstFrameCallback=video.requestVideoFrameCallback(()=>{firstFrameCallback=null;acceptSourceFrame(nonce,url)});
  }
  function sourceDataLoaded(){
    if(isSequence())return;sync();if(state.sourceFrameReady){requestPreview();return}
    if(!state.file||firstFramePaint.length)return;
    const nonce=sourceNonce,url=state.sourceUrl;
    firstFramePaint.push(requestAnimationFrame(()=>{if(!currentSource(nonce,url))return;firstFramePaint.push(requestAnimationFrame(()=>acceptSourceFrame(nonce,url)))}));
  }
  function requestPreview(){
    if(!state.file||!state.sourceFrameReady||(!isSequence()&&(video.readyState<2||state.view==='original'))||state.converting||!state.active||!validVerticalMask(state.verticalMask))return;
    if(previewJob){previewQueued=true;return}
    const version=previewVersion,revision=state.revision,time=sourceTime(),duration=state.meta.duration,sequence=isSequence()?state.file:null,view=state.view;
    let opts;try{opts=options({preview:true})}catch(error){state.previewError=true;sync();return}
    const sourceWidth=state.meta.packedWidth||state.meta.width,sourceHeight=state.meta.packedHeight||state.meta.height;
    const sourceScale=state.sourceVapConfig?1:Math.min(1,640/Math.max(sourceWidth,sourceHeight)),outputScale=opts.resources.length||state.sourceVapConfig?1:Math.min(1,640/Math.max(opts.width,opts.height));
    const width=Math.max(1,Math.round(opts.width*outputScale)),height=Math.max(1,Math.round(opts.height*outputScale));
    if(!sequence){sourceFrame.width=Math.max(1,Math.round(sourceWidth*sourceScale));sourceFrame.height=Math.max(1,Math.round(sourceHeight*sourceScale));sourceFrame.getContext('2d').drawImage(video,0,0,sourceFrame.width,sourceFrame.height)}lastPreviewTime=time;
    $('PreviewBusy').hidden=false;state.previewError=false;
    previewJob=(async()=>{
      if(sequence){
        const engine=await getEngine(),frame=await engine.decodeSequenceFrame(sequence,Math.min(sequence.frameCount-1,Math.floor(time*opts.fps)));
        try{if(version!==previewVersion||revision!==state.revision||state.converting)return;sourceFrame.width=Math.max(1,Math.round(sourceWidth*sourceScale));sourceFrame.height=Math.max(1,Math.round(sourceHeight*sourceScale));sourceFrame.getContext('2d').drawImage(frame,0,0,sourceFrame.width,sourceFrame.height)}finally{frame.close()}
        if(view==='original'){if(version===previewVersion&&revision===state.revision)drawPixels(sourceFrame.getContext('2d').getImageData(0,0,sourceFrame.width,sourceFrame.height));return}
      }
      const module=opts.sourceVapConfig||opts.resources.length?await getResourceModule():null;
      const processor=opts.sourceVapConfig?null:await getPreviewProcessor(opts);
      let pixels=opts.sourceVapConfig?module.unpackVapFrame(sourceFrame,{width,height,sourceVapConfig:opts.sourceVapConfig,verticalMask:opts.verticalMask,videoOffsetY:opts.videoOffsetY}):await processor.process(sourceFrame,{timestamp:time,width,height,verticalMask:opts.verticalMask,videoOffsetY:opts.videoOffsetY});
      const fadeModule=await getGiftFadeModule(),opacity=fadeModule.giftFadeOpacity(time,duration,opts.fps,opts.giftFade),dynamic=opts.resources.length&&opts.resourceMode==='dynamic';
      if(dynamic)pixels=fadeModule.applyGiftFade(pixels,opacity);
      if(opts.resources.length){
        if(resourcePreviewRevision!==revision){
          const next=await module.createResourceRenderer(opts.resources,{width,height,duration:state.meta.duration,fps:opts.fps,sourceVapConfig:opts.sourceVapConfig,verticalMask:opts.verticalMask});
          if(version!==previewVersion||revision!==state.revision){next.dispose();return}
          resourcePreview?.dispose();resourcePreview=next;resourcePreviewRevision=revision;
        }
        pixels=resourcePreview.apply(pixels,time,{sourceCanvas:sourceFrame,resourceOpacity:dynamic?opacity:1});
      }
      if(!dynamic)pixels=fadeModule.applyGiftFade(pixels,opacity);
      if(version!==previewVersion||revision!==state.revision||state.converting||!state.file)return;
      if(typeof module?.resourceFrame==='function')resourceEditor?.setContext({frameResolver:module.resourceFrame,resourceOpacity:dynamic?opacity:1,fps:opts.fps,time});
      drawPixels(pixels,state.view==='alpha');
    })().catch(error=>{if(version===previewVersion){root.dataset.previewError=String(error?.message||error);state.previewError=true;sync()}}).finally(()=>{
      previewJob=null;$('PreviewBusy').hidden=true;
      if(previewQueued){previewQueued=false;requestPreview()}
    });
  }
  function drawPixels(pixels,alpha=false){
    let shown=pixels;
    if(alpha){const data=new Uint8ClampedArray(pixels.data);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=data[i+3];data[i+3]=255}shown=new ImageData(data,pixels.width,pixels.height)}
    canvas.width=shown.width;canvas.height=shown.height;canvas.getContext('2d').putImageData(shown,0,0);state.previewReady=true;sync();
  }
  async function readMetadata(url){
    const probe=document.createElement('video');probe.preload='metadata';probe.muted=true;probe.playsInline=true;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(new Error('metadata timeout')),20000);
      function finish(error){clearTimeout(timer);probe.onloadedmetadata=probe.onerror=null;probe.removeAttribute('src');probe.load();error?reject(error):resolve({width:probe.videoWidth,height:probe.videoHeight,duration:probe.duration})}
      probe.onloadedmetadata=()=>{const data={width:probe.videoWidth,height:probe.videoHeight,duration:probe.duration};clearTimeout(timer);probe.onloadedmetadata=probe.onerror=null;probe.removeAttribute('src');probe.load();resolve(data)};
      probe.onerror=()=>finish(new Error('metadata failed'));probe.src=url;
    });
  }
  function sourceSelection(files){
    const extensions={mp4:'video',png:'frames',jpg:'frames',jpeg:'frames',webp:'frames',zip:'zip'};
    const mimeExtensions={'video/mp4':'mp4','image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/zip':'zip','application/x-zip-compressed':'zip'};
    const selected=[],kinds=[];
    for(const [index,file] of Array.from(files||[]).entries()){
      if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>200*1024**2)return null;
      const name=String(file.name||''),extension=name.match(/\.([^./\\]+)$/)?.[1].toLowerCase(),mimeExtension=mimeExtensions[String(file.type||'').toLowerCase()];
      if(extension&&!extensions[extension])return null;
      const kind=extensions[extension||mimeExtension];
      if(!kind||extension&&mimeExtension&&kind!==extensions[mimeExtension])return null;
      if(!extension){
        const stem=name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||`${kind==='frames'?'frame':'source'}-${String(index+1).padStart(3,'0')}`;
        const normalizedName=stem+'.'+mimeExtension;
        // Give extensionless clipboard/native Blobs a parser-compatible name;
        // slice keeps their immutable bytes and MIME without changing the source.
        selected.push(file instanceof Blob?Object.assign(file.slice(0,file.size,file.type),{name:normalizedName,lastModified:file.lastModified}):{...file,name:normalizedName});
      }else selected.push(file);
      kinds.push(kind);
    }
    if(!selected.length)return null;
    if(kinds.every(kind=>kind==='frames'))return {mode:'sequence',files:selected};
    if(selected.length===1&&kinds[0]==='zip')return {mode:'sequence',files:selected};
    return selected.length===1&&kinds[0]==='video'?{mode:'video',files:selected}:null;
  }
  async function loadFiles(files){
    if(busy()||!files?.length)return;
    const selection=sourceSelection(files);if(!selection){showNotice('errorFile');return}
    if(selection.mode==='sequence')return loadSequence(selection.files);
    const file=selection.files[0];
    const version=++loadVersion;pause();state.loading=true;state.notice=null;state.progress=0;sync();let url=URL.createObjectURL(file);
    try{
      const browserMeta=await readMetadata(url);const engine=await getEngine();let meta={...browserMeta,...await engine.inspectVideo(file,{detectSource:true})},sourceVapConfig=null;
      if(file instanceof Blob){
        const protocol=await import('./vap-protocol.mjs?v=20261028-resources1');
        try{sourceVapConfig=await protocol.readSourceVapConfig(file)}catch(error){throw Object.assign(error,{uiKey:'errorVapSource'})}
        if(sourceVapConfig){
          if((sourceVapConfig.src?.length||0)>6)throw Object.assign(new Error('too many native resource slots'),{uiKey:'errorResourceLimit'});
          if(sourceVapConfig.info.videoW!==meta.width||sourceVapConfig.info.videoH!==meta.height)throw Object.assign(new Error('VAP source dimensions differ'),{uiKey:'errorVapSource'});
          meta={...meta,packedWidth:meta.width,packedHeight:meta.height,width:sourceVapConfig.info.w,height:sourceVapConfig.info.h};
        }
      }
      if(version!==loadVersion)return;
      if(!Number.isFinite(meta.duration)||meta.duration<=0||meta.duration>120||meta.width<1||meta.height<1||Math.max(meta.width,meta.height)>4096)throw Object.assign(new Error('source exceeds limits'),{code:'limits'});
      const old=state.sourceUrl;cleanupProcessor();releaseResult();state.file=file;state.meta=meta;state.sourceVapConfig=sourceVapConfig;state.inputMode='video';state.sourceUrl=url;url=null;state.revision++;state.notice=null;state.previewError=false;
      resourceEditor?.setSource(sourceVapConfig);
      const detected=meta.sourceDetection;state.sourceKind=!sourceVapConfig&&detected?.sourceKind==='chroma_mp4'&&screenColors.includes(detected.screenColor)?'chroma_mp4':'plain_mp4';
      state.detectedMethod=sourceVapConfig?'opaque':state.sourceKind==='chroma_mp4'?'chroma_key':['black_luma','white_luma'].includes(detected?.matteMethod)?detected.matteMethod:'opaque';
      state.detectedScreen=state.sourceKind==='chroma_mp4'?detected.screenColor:'auto';
      state.detectedBackground=state.sourceKind==='chroma_mp4'&&validScreenBackground(detected.background)?detected.background.slice():null;
      $('Screen').value='auto';$('Method').value='auto';
      if(state.sizePreset==='source'&&(Number($('Width').value)!==meta.width||Number($('Height').value)!==meta.height))state.sizePreset='custom';
      state.view=state.verticalMask.enabled||state.giftFade.enabled?'transparent':'original';if(state.verticalMask.enabled)$('VerticalMask').open=true;
      sourceNonce++;state.sourceFrameReady=false;state.previewReady=false;cancelSourceFrameWait();sync();
      video.src=state.sourceUrl;video.muted=true;video.load();waitForSourceFrame();$('DownloadReceipt').hidden=true;
      if(old)URL.revokeObjectURL(old);
    }catch(error){if(version===loadVersion){root.dataset.lastError=String(error?.message||error);state.notice=error.uiKey||errorKey(error,'errorLoad');state.errorTone='error'}}
    finally{if(url)URL.revokeObjectURL(url);if(version===loadVersion){state.loading=false;sync();if(state.file){window.FunToolkitUI?.reveal(stage);if(video.readyState>=2)sourceDataLoaded()}}}
  }
  async function loadSequence(files){
    if(busy())return;const selected=Array.from(files||[]);if(!selected.length)return;
    const started=Date.now(),version=++loadVersion,job=new AbortController();sequenceLoadController=job;pause();state.loading=true;state.notice=null;state.progress=0;sync();
    try{
      const engine=await getEngine(),Zip=selected.some(file=>/\.zip$/i.test(file.name||''))?await loadZip():undefined;
      const sequence=await engine.inspectImageSequence(selected,{fps:Number($('Fps').value),signal:job.signal,Zip,onProgress:event=>{if(version===loadVersion){state.progress=Math.max(state.progress,Math.min(.95,(Number(event.progress)||0)*.95));sync()}}});
      const meta=engine.sequenceMetadata(sequence,Number($('Fps').value));
      if(version!==loadVersion||job.signal.aborted)return;
      root.dataset.sequenceImportMs=String(Date.now()-started);const old=state.sourceUrl;cleanupProcessor();releaseResult();cancelSourceFrameWait();sourceNonce++;
      state.file=sequence;state.meta=meta;state.inputMode='sequence';state.sourceUrl=null;state.sequenceTime=0;state.sourceVapConfig=null;state.sourceKind='plain_mp4';state.detectedMethod='opaque';state.detectedScreen='auto';state.detectedBackground=null;state.revision++;state.previewError=false;state.notice=null;
      resourceEditor?.setSource(null);$('Screen').value='auto';$('Method').value='auto';video.pause();video.removeAttribute('src');video.load();video.muted=true;
      state.view='transparent';state.sourceFrameReady=true;state.previewReady=false;$('DownloadReceipt').hidden=true;
      if(state.sizePreset==='source'){if([sequence.width,sequence.height].every(n=>n>=16&&n<=2048)){$('Width').value=String(sequence.width);$('Height').value=String(sequence.height);state.outputRatio=sequence.width/sequence.height}else state.sizePreset='custom'}
      if(old)URL.revokeObjectURL(old);
    }catch(error){if(version===loadVersion){root.dataset.lastError=String(error?.message||error);state.notice=job.signal.aborted?'cancelled':'sequenceError';state.errorTone=job.signal.aborted?'info':'error'}}
    finally{if(sequenceLoadController===job)sequenceLoadController=null;if(version===loadVersion){state.loading=false;sync();requestPreview()}}
  }
  async function convert(){
    if(busy()||!state.file)return;
    if(resourceEditor?.finishEditing?.()===false){showNotice('resourceInvalid');return}
    let opts;try{opts=options()}catch(error){showNotice(error.uiKey||errorKey(error));return}
    pause();cleanupProcessor();state.converting=true;state.notice=null;state.progress=0;state.phase='loading';state.previewError=false;$('DownloadReceipt').hidden=true;
    const revision=state.revision,job=new AbortController();controller=job;sync();
    let resultResources=null;
    try{
      let tags={},resourceFiles=[];
      if(opts.resources.length&&opts.resourceMode==='dynamic'){
        const module=await getResourceModule();resultResources=await module.createResourceRenderer(opts.resources,{width:opts.width,height:opts.height,duration:state.meta.duration,fps:opts.fps,sourceVapConfig:opts.sourceVapConfig,verticalMask:opts.verticalMask,signal:job.signal,includeDefaultAvatars:false});
        [tags,resourceFiles]=await Promise.all([resultResources.getPlayerTags(),resultResources.getPackageFiles()]);
        opts.packageReserveBytes=resourceFiles.reduce((sum,file)=>sum+file.blob.size,0)+8192;
      }
      const engine=await getEngine();const result=await engine.convertVideo(state.file,opts,{signal:job.signal,onProgress:event=>{
        if(controller!==job||job.signal.aborted)return;state.progress=Math.max(state.progress,Math.min(1,Number(event.progress)||0));state.phase=event.phase==='encoding'&&event.reason==='quality'?'refining':event.phase==='encoding'&&event.pass>1?'recompressing':['loading','decoding','encoding','packaging'].includes(event.phase)?event.phase:'encoding';sync();
      }});
      if(job.signal.aborted||revision!==state.revision||controller!==job)return;
      if(!(result.blob instanceof Blob)||!result.blob.size||!result.config?.info||result.config.info.v!==2||result.report?.valid!==true)throw new Error('invalid final VAP result');
      if((result.config.funToolkit?.rgbAlphaMode||'straight')!==opts.rgbAlphaMode)throw Object.assign(new Error('RGB feather export mode mismatch'),{uiKey:'errorFeather'});
      if(result.blob.size>Math.min(opts.targetBytes,maxOutputBytes))throw Object.assign(new Error('oversized VAP result'),{code:'budget'});
      releaseResult();state.result={...result,url:URL.createObjectURL(result.blob),revision,tags,resourceFiles,resourceRenderer:resultResources};resultResources=null;state.progress=1;state.notice=null;sync();
      window.Hub?.record('vap','generated');document.dispatchEvent(new CustomEvent('vap:result',{detail:state.result}));window.FunToolkitUI?.reveal($('Result'));
    }catch(error){if(controller===job){root.dataset.lastError=String(error?.message||error);state.notice=job.signal.aborted?'cancelled':error.uiKey||errorKey(error);state.errorTone=job.signal.aborted?'info':'error'}}
    finally{resultResources?.dispose();if(controller===job){controller=null;state.converting=false;sync();requestPreview()}}
  }
  function cancel(){
    if(state.loading){sequenceLoadController?.abort();loadVersion++;state.loading=false;state.notice='cancelled';state.errorTone='info';sync()}
    if(controller)controller.abort();
  }
  function filename(){const stem=neutralName(state.file?.name||'video').replace(/\.(mp4|zip|sequence)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().slice(0,100)||'video';return stem+'_vap'}
  function triggerDownload(blob,name){
    if(blob.size>Math.min(state.result?.report?.targetBytes||maxOutputBytes,maxOutputBytes))throw Object.assign(new Error('oversized download'),{code:'budget'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);
    try{link.click();window.Hub?.record('vap','download');$('DownloadReceipt').hidden=false;$('DownloadReceipt').textContent=`${t('saved')} · ${name}${/\.(mp4|zip)$/i.test(name)?' · '+t('vapPlaybackNotice'):''}`}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  }
  async function download(kind){
    if(busy()||!state.result||state.result.revision!==state.revision)return;
    state.notice=null;
    try{
      const {blob,config}=state.result;
      if(kind==='mp4')triggerDownload(blob,filename()+'.mp4');
      else if(kind==='json')triggerDownload(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),'vapc.json');
      else{
        state.packing=true;sync();const Zip=await loadZip();const zip=new Zip();zip.file(filename()+'.mp4',blob);zip.file('vapc.json',JSON.stringify(config));
        if(config.info.isVapx===1){
          for(const file of state.result.resourceFiles||[])zip.file(file.name,file.blob);
          zip.file('resources.json',JSON.stringify(config.funToolkit?.resourceManifest||[],null,2));
          zip.file('README.txt',resourceBundleReadme(config));
        }
        const packed=await zip.generateAsync({type:'blob',compression:'STORE'});triggerDownload(packed,filename()+'.zip');
      }
    }catch(error){root.dataset.lastError=String(error?.message||error);state.notice=errorKey(error,kind==='zip'?'errorZip':'errorDownload');state.errorTone='error'}finally{state.packing=false;sync()}
  }
  function resourceBundleReadme(config){
    const entries=config.funToolkit?.resourceManifest||[],bindings=Object.fromEntries(entries.map(item=>['['+item.tag+']',item.type==='image'?'./'+item.file:item.text]));
    return 'Fun Toolkit · VAP 动态资源 / Dynamic resources\n\nMP4 包含 RGB、Alpha、资源遮罩和 VAP v2 src/frame 配置。头像文件不嵌入 MP4，请将 resources/ 中的文件与视频一起接入。\nMP4 contains RGB, alpha, resource masks and VAP v2 src/frame metadata. Avatar images are supplied separately from resources/.\n\nTencent Web SDK example:\nnew Vap().play({container:document.querySelector("#player"),src:"./'+filename()+'.mp4",config:"./vapc.json",...'+JSON.stringify(bindings,null,2)+'});\n\n文本、头像可用相同标签传入新的值，视频无需重新编码。本站“查看 VAP 成品”页面也可以重新绑定标签测试。\nReplace these tag values to change the avatar or text without re-encoding. You can also bind resources in this site’s VAP output checker.\n\nNative iOS / Android: use the target SDK resource delegate and the srcTag values in vapc.json. Device compatibility must be tested on the target SDK.\n';
  }
  let zipPromise=null;
  function loadZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);
    if(!zipPromise)zipPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/jszip-3.10.1.min.js';script.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('ZIP unavailable'));script.onerror=()=>{script.remove();zipPromise=null;reject(new Error('ZIP load failed'))};document.head.append(script)});
    return zipPromise;
  }
  function setActive(active){
    state.active=!!active;if(!state.active){endMaskDrag();endVideoDrag();pause();cleanupProcessor();if(state.converting)cancel()}else{sync();requestPreview()}
    document.dispatchEvent(new CustomEvent('vap:active',{detail:{active:state.active}}));
  }
  function setLanguage(value){
    lang=value==='en'?'en':'zh';root.querySelectorAll('[data-vap-i18n]').forEach(node=>node.textContent=t(node.dataset.vapI18n));sync();
  }
  const openInput=()=>$(state.inputMode==='sequence'?'SequenceInput':'Input').click();
  for(const [id,mode] of [['InputVideo','video'],['InputSequence','sequence']])$(id).addEventListener('click',()=>{if(busy())return;state.inputMode=mode;sync()});
  for(const amount of [1,2,3])$('Budget'+amount).addEventListener('click',()=>{if(busy())return;if(Number($('Target').value)===amount){sync();return}$('Target').value=String(amount);invalidate()});
  for(const id of ['Upload','Replace'])$(id).addEventListener('click',event=>{event.stopPropagation();if(!busy())openInput()});
  stage.addEventListener('click',()=>{if(!state.file&&!busy())openInput()});
  $('SequenceInput').addEventListener('change',event=>{loadFiles(event.target.files);event.target.value=''});
  $('Input').addEventListener('change',event=>{loadFiles(event.target.files);event.target.value=''});
  $('MaskPick').addEventListener('click',()=>{if(!busy())$('MaskInput').click()});
  function loadMask(files){
    if(busy())return;const selected=Array.from(files||[]);if(!selected.length)return;const file=selected[0];
    const supported=/^(image\/(png|jpeg|webp)|video\/mp4)$/.test(file.type)||!file.type&&/\.(png|jpe?g|webp|mp4)$/i.test(file.name);
    if(selected.length!==1||!supported||!Number.isFinite(file.size)||file.size<=0||file.size>200*1024**2){showNotice('errorFile');return}
    state.maskFile=file;invalidate();
  }
  $('MaskInput').addEventListener('change',event=>{loadMask(event.target.files);event.target.value=''});
  window.UploadPaste?.register({zone:stage,isActive:()=>state.active,isBusy:busy,onFiles:loadFiles});
  window.UploadPaste?.register({zone:$('MaskRow'),isActive:event=>state.active&&!$('MaskRow').hidden&&($('MaskRow').contains(event.target)||$('MaskRow').contains(document.activeElement)),isBusy:busy,onFiles:loadMask});
  for(const id of ['Method','Screen','Target','Quality','KeepAudio','RgbAlphaMode','LightRecovery'])$(id).addEventListener('change',invalidate);
  $('Fps').addEventListener('change',()=>{if(busy())return;if(isSequence()){const frame=Math.min(state.file.frameCount-1,Math.floor(sourceTime()*state.meta.fps));pause();const fps=Number($('Fps').value);if(Number.isInteger(fps)&&fps>=1&&fps<=60){state.meta={...state.meta,fps,duration:state.file.frameCount/fps};state.sequenceTime=frame/fps}}invalidate()});
  for(const id of ['Tolerance','Softness','Spill'])$(id).addEventListener('input',invalidate);
  for(const [id,other] of [['Width','Height'],['Height','Width']])$(id).addEventListener('input',()=>{
    if(busy())return;const value=Number($(id).value);state.sizePreset='custom';if(Number.isInteger(value)&&value>=16&&value<=2048){const ratio=state.outputRatio;$(other).value=String(Math.round(id==='Width'?value/ratio:value*ratio))}invalidate();
  });
  function chooseSize(width,height,preset){if(busy()||![width,height].every(n=>Number.isInteger(n)&&n>=16&&n<=2048))return;const same=Number($('Width').value)===width&&Number($('Height').value)===height;state.outputRatio=width/height;state.sizePreset=preset;$('Width').value=String(width);$('Height').value=String(height);if(same)sync();else invalidate()}
  $('SizeDefault').addEventListener('click',()=>chooseSize(720,1560,'default'));$('Size750').addEventListener('click',()=>chooseSize(750,1624,'750'));$('SizeSource').addEventListener('click',()=>{if(state.meta)chooseSize(state.meta.width,state.meta.height,'source')});
  for(const [id,scale] of [['AlphaHalf',.5],['AlphaFull',1]])$(id).addEventListener('click',()=>{if(busy())return;state.alphaScale=scale;invalidate()});
  for(const [id,view] of [['ViewOriginal','original'],['ViewTransparent','transparent'],['ViewAlpha','alpha']])$(id).addEventListener('click',()=>{if(busy())return;state.view=view;state.previewError=false;sync();requestPreview()});
  for(const [id,bg] of [['BgChecker','checker'],['BgBlack','black'],['BgWhite','white']])$(id).addEventListener('click',()=>{if(busy())return;state.background=bg;sync()});
  $('Play').addEventListener('click',togglePlay);$('Mute').addEventListener('click',async()=>{video.muted=!video.muted;try{if(!video.muted)await preparePreviewAudio()}catch(error){video.muted=true;showNotice('previewAudioError')}sync()});
  function volumeChanged(){if(busy())return;invalidate();if(!video.muted)void preparePreviewAudio().catch(()=>{video.muted=true;showNotice('previewAudioError')})}
  $('Volume').addEventListener('input',volumeChanged);
  for(const [id,percent] of [['VolumeMobile',60],['VolumeOriginal',100]])$(id).addEventListener('click',()=>{if($(id).disabled||Number($('Volume').value)===percent)return;$('Volume').value=String(percent);volumeChanged()});
  $('Timeline').addEventListener('input',()=>{if(busy()||!state.file)return;const nextTime=Math.max(0,Math.min(state.meta.duration,Number($('Timeline').value)||0));pause();seekSource(nextTime)});
  video.addEventListener('seeked',()=>{sync();requestPreview()});video.addEventListener('loadeddata',sourceDataLoaded);video.addEventListener('ended',pause);video.addEventListener('timeupdate',()=>{if(!state.playing)sync()});
  $('MaskEnabled').addEventListener('change',()=>{if(busy()||!state.file)return;const enabled=$('MaskEnabled').checked;if(enabled===state.verticalMask.enabled)return;state.verticalMask.enabled=enabled;maskChanged()});
  $('GiftFadeEnabled').addEventListener('change',()=>{if(busy()||!state.file)return;const enabled=$('GiftFadeEnabled').checked;if(enabled===state.giftFade.enabled)return;state.giftFade.enabled=enabled;giftFadeChanged()});
  for(const [id,key] of [['GiftFadeIn','fadeIn'],['GiftFadeOut','fadeOut']])$(id).addEventListener('input',()=>{if(busy()||!state.file||!state.giftFade.enabled)return;const value=$(id).value.trim()===''?NaN:Number($(id).value);if(Object.is(value,state.giftFade[key]))return;state.giftFade[key]=value;giftFadeChanged()});
  for(const [id,key] of maskFields){
    $('Mask'+id).addEventListener('input',()=>setMaskBoundary(key,$('Mask'+id).value.trim()===''?NaN:Number($('Mask'+id).value)/100));
    const handle=$('MaskHandle'+id);
    handle.addEventListener('pointerdown',event=>{if(maskDrag&&maskDrag.id!==event.pointerId)return;if(busy()||!state.file||!state.verticalMask.enabled||!validVerticalMask(state.verticalMask)||(event.button!==undefined&&event.button!==0))return;pause();maskDrag={id:event.pointerId,key,handle};handle.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopPropagation?.()});
    handle.addEventListener('pointermove',event=>{if(!maskDrag||event.pointerId!==maskDrag.id)return;const r=canvas.getBoundingClientRect(),height=r.height||r.bottom-r.top;if(height>0)setMaskBoundary(key,(event.clientY-r.top)/height,{clamp:true});event.preventDefault()});
    const stop=event=>{if(maskDrag?.id!==event.pointerId)return;try{handle.releasePointerCapture?.(event.pointerId)}catch(ignored){}maskDrag=null};
    handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);handle.addEventListener('lostpointercapture',()=>{if(maskDrag?.handle===handle)maskDrag=null});
    handle.addEventListener('keydown',event=>{if(busy()||!state.file||!state.verticalMask.enabled||!validVerticalMask(state.verticalMask))return;const step=event.shiftKey ? .02 : .005,[min,max]=maskBounds(key);let value=state.verticalMask[key];if(['ArrowUp','ArrowLeft'].includes(event.key))value-=step;else if(['ArrowDown','ArrowRight'].includes(event.key))value+=step;else if(event.key==='Home')value=min;else if(event.key==='End')value=max;else return;event.preventDefault();setMaskBoundary(key,value,{clamp:true})});
  }
  stage.addEventListener('pointerdown',event=>{
    if(event.defaultPrevented||event.isPrimary===false||event.button!==undefined&&event.button!==0||videoDrag||busy()||!state.active||!state.file||!state.previewReady||![stage,canvas,video].includes(event.target))return;
    pause();state.view='transparent';sync();const rect=canvas.getBoundingClientRect(),height=rect.height||rect.bottom-rect.top;if(!(height>0))return;
    videoDrag={id:event.pointerId,y:event.clientY,offset:state.videoOffsetY,height};stage.classList.add('is-positioning');stage.focus?.({preventScroll:true});stage.setPointerCapture?.(event.pointerId);event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{if(!videoDrag||event.pointerId!==videoDrag.id)return;setVideoOffsetY(videoDrag.offset+(event.clientY-videoDrag.y)/videoDrag.height);event.preventDefault()});
  stage.addEventListener('pointerup',endVideoDrag);stage.addEventListener('pointercancel',endVideoDrag);stage.addEventListener('lostpointercapture',endVideoDrag);
  stage.addEventListener('keydown',event=>{if(busy()||!state.file||![stage,canvas,video].includes(event.target)||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='Escape'){endVideoDrag();return}if(!['ArrowUp','ArrowDown'].includes(event.key))return;const step=(event.shiftKey?10:1)/Number($('Height').value);setVideoOffsetY(state.videoOffsetY+(event.key==='ArrowUp'?-step:step));event.preventDefault();event.stopPropagation?.()});
  $('VerticalMask').addEventListener('toggle',()=>{syncMaskControls();if($('VerticalMask').open&&state.verticalMask.enabled)requestPreview()});
  if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(positionMaskOverlay);observer.observe(canvas);observer.observe(stage)}else window.addEventListener('resize',positionMaskOverlay);
  $('Convert').addEventListener('click',convert);$('Cancel').addEventListener('click',cancel);
  for(const [id,kind] of [['DownloadMp4','mp4'],['DownloadJson','json'],['DownloadZip','zip']])$(id).addEventListener('click',()=>download(kind));
  $('Help').addEventListener('click',()=>$('HelpDialog').showModal());$('HelpClose').addEventListener('click',()=>$('HelpDialog').close());$('HelpDialog').addEventListener('click',event=>{if(event.target===$('HelpDialog')){const r=$('HelpDialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('HelpDialog').close()}});
  document.addEventListener('dragover',event=>{if(state.active&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();stage.classList.add('is-dragging')}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)stage.classList.remove('is-dragging')});
  document.addEventListener('drop',event=>{stage.classList.remove('is-dragging');if(state.active&&event.dataTransfer?.files.length&&!event.defaultPrevented){event.preventDefault();loadFiles(event.dataTransfer.files)}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){endVideoDrag();pause()}});
  document.addEventListener('vap:player-state',event=>{if(!['empty','loading','ready','error'].includes(event.detail?.state))return;state.playerState=event.detail.state;sync()});
  window.addEventListener('blur',()=>{endMaskDrag();endVideoDrag()});
  window.addEventListener('pagehide',event=>{sourceNonce++;endVideoDrag();cancelSourceFrameWait();pause();cleanupProcessor();cancel();if(!event.persisted){if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);if(state.result)URL.revokeObjectURL(state.result.url);state.result?.resourceRenderer?.dispose();resourcePreview?.dispose();resourceEditor?.dispose();void previewAudioContext?.close()}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&state.file&&!state.sourceFrameReady){waitForSourceFrame();if(video.readyState>=2)sourceDataLoaded()}});
  window.VapTool={setActive,setLanguage};setLanguage(lang);
})();
