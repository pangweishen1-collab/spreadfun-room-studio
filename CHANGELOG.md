# 更新记录

## 1.18.9 - 2026-11-11

### Avatar frames

- Move the 14-seat room preview and its ZIP and review-image downloads to Avatar frames. Keep the existing avatar frame production tools together under Production.
- Drop or paste static PNG or WebP frames onto seats. Frames sit above the avatars at 1.56× their diameter in both the preview and the review image.

## 1.18.8 - 2026-11-11

### VAP converter

- Export every VAP at a packed size of 1088 × 1568 with a 720 × 1560 display area, half-resolution alpha and 24 FPS H.264 Baseline.
- Download a 17AE preview copy for dynamic VAPs. It preserves the encoded animation, sound and transparency while the regular export retains the avatar and text tags.

## 1.18.7 - 2026-11-11

### Gift images

- Split the gift image workspace into Preview and Production tabs.
- Replace up to 14 avatars individually or in bulk on the room preview, and download them as a ZIP of 240 × 240 static WebP files.
- Export the room with its current avatars and frames as a 720 × 1560 lossless WebP for review.

## 1.18.6 - 2026-11-11

### VAP converter

- Default to a 2 MB budget and retain the full-resolution alpha plane for recognized paired-alpha videos.
- Preserve encoded H.264 frames when compatible paired-alpha inputs already fit the budget at 24 FPS and require no edits; otherwise use the regular conversion path.

## 1.18.5 - 2026-11-11

### VAP converter and room review

- Recognize side-by-side color and alpha planes in compatible MP4s without VAP metadata, and display the composited transparent video in both workflows.

## 1.18.4 - 2026-11-11

### Gift image background removal

- Prepare the existing background removal model after importing dark-backed artwork on supported browsers, so loading can overlap with editing.

## 1.18.3 - 2026-11-10

### VAP converter and room review

- Export VAP videos at a constant 24 FPS, with a full duration for every video frame.
- Apply a one-second fade at the start and end of each review clip in both preview and exported MP4s. Fit the fades to shorter clips and reuse fades already declared by VAP sources.

## 1.18.2 - 2026-11-10

### VAP room gift review

- Export sharper two- and three-column 30 FPS MP4s with faster compositing and a smaller two-column file.
- Label the two review slots Vehicle-1 and Vehicle-2. Show the 19-seat room as the default background in the VAP conversion preview.

### Dice tool

- Keep the purple 02 B toss close to its resting size while preserving spacing between all six dice.
- Reduce the 02 B compact Spine package by compressing the atlas more during the fastest part of the toss.
- Show a single upload button for each grade and remove the divider above the asset details.

## 1.18.1 - 2026-11-10

### Dice tool

- Default purple dice to 02 B, the dual-axis toss.
- Make each die 5% smaller in live previews, MP4s, and exported Spine packages.

## 1.18.0 - 2026-11-10

### Custom avatar frames

- Edit the base, highlight, and shadow colors of metallic text presets. Changes appear in the preview, the exported SVGA, and its first-frame WebP.

### VAP room gift review

- Save and reuse shared review templates and WebP room backgrounds. The source videos remain in the browser.
- Adjust template masks in the review preview, keep per-slot settings, and support the software AAC encoder when browser AAC encoding is unavailable.

## 1.17.0 - 2026-11-10

### VAP room gift review

- Review up to six gift videos side by side over the default Hapi Ludo room or a custom background. Each slot accepts its own MP4, and local templates retain the layout and settings.
- Move each video vertically under a room-anchored feather mask. The percentage handles adjust the mask independently, and the preview and export use the same coordinates.
- Export one silent 30 FPS H.264 MP4. The longest clip sets the duration, and shorter slots return to the room background as they end.

## 1.16.0 - 2026-11-10

### Custom avatar frames

- List embedded SVGA bitmaps below the preview with individual downloads, multi-select deletion, original-image recovery, and support for adding multiple images.
- Drag selected original and added images together in the preview. Export the new positions while retaining the animation timing.
- Show estimated decoded image and canvas memory beside the source details. Reject exports that exceed 3 MB of estimated runtime memory or 3 MB on disk.

## 1.15.10 - 2026-11-09

### Dice preview

- Automatically remove dark outer outlines from green dice in previews and video exports. Preserve the silhouette and interior artwork.
- Keep visible rounded faces opaque while rolling to prevent gaps and dark seams.

## 1.15.9 - 2026-11-09

### Dice preview

- Export green and purple dice at 60 FPS, with 360 frames per six-second MP4 and a 1.5 MB limit.
- Make the green dice grow more visibly during the roll and return to their resting size on landing.

## 1.15.8 - 2026-11-09

### Dice preview

- Improve six-second MP4 clarity within a 1.5 MB limit. If the native encode is too large, retry from the original rendered frames.
- Keep green dice visibly rounded while rolling, and enlarge purple dice in the preview and video export.

### Gift image cutout

- Reduce first-use model downloads with verified compressed chunks and a fallback to the original files. Preserve the existing cutout output.

## 1.15.7 - 2026-11-09

### Dice preview

- Show the unnumbered rolling image (`sz_0.png`) in the purple dice upload instructions.

## 1.15.6 - 2026-11-09

### Dice preview

- Fit rolling dice within their cells in six-dice previews and video exports so neighboring dice stay separated.

## 1.15.5 - 2026-11-09

### Dice preview

- Prevent the settled face from overlapping the start of green rolls, where the 2 and 6 faces could appear to flash.
- Restore the original crown pattern behind the title on both green and purple popups.
- Keep uploads in the current page session. A successful replacement releases the previous preview, and a page reload starts with an empty upload form.

## 1.15.4 - 2026-11-09

- Use up to 192 palette colors for purple atlas PNGs and up to 256 for green atlas PNGs when exporting dice ZIPs.

## 1.15.3 - 2026-11-09

### Dice atlas compression

- Compress green and purple atlas PNGs locally during ZIP export using up to 256 palette colors. Keep atlas dimensions, placement, and Spine references intact. Use lossless compression if the indexed PNG is unavailable or larger.
- Share rolling textures across all six purple results. Reuse the opening texture for similar poses and reduce texture resolution during the fast, blurred part of the roll.
- Pack each green landing and rolling texture side by side to improve compression.

## 1.15.2 - 2026-11-06

### Dice upload

- Open the preview automatically when all six faces are present. Show a retry action only when the preview fails to load.
- Skip unrelated files before reading dropped folders, validate eligible PNGs in bounded parallel batches, and load thumbnails only when the asset details are expanded.
- Use cactus artwork for the green upload card and cricket artwork for the purple card, with optically balanced sizes.

## 1.15.1 - 2026-11-06

### Purple dice motion fidelity

- Use the original 05 tilted-gyro motion for purple uploads. Keep the original exposure blur, timing and 1.5× zoom peak, and build the rolling silhouette from the uploaded art.
- Play the same Spine 4.2 binary and atlas in the browser and in the purple ZIP. Store the brief rolling exposures in a shared, losslessly compressed atlas, with native zoom and position keys and the original six faces for the settled results.
- Keep the green animation, grade-specific ZIP naming, invisible root anchor and sound events.

## 1.15.0 - 2026-11-05

- Use a fixed purple UI display scale so preview and video do not add a second time-varying zoom outside the exported native05 animation.
- Keep purple dice on the silhouette gyro05 structure for all uploaded shapes, including high-coverage square art. Preserve the approved motion curve and rebuild older purple geometry using a versioned native cache.
- Remove the blue mat behind the two upload areas, give green and purple separate hover motion and pale grade colors, and tint the compact replacement cards to match.
- Avoid repeated face-opacity decoding and reuse the validated PNG buffer for hashing. Cache identical per-mesh animation samples within each build without changing generated timelines.
- Preserve unsaved name and sound edits when switching preview backgrounds, including drafts without replacement files. Keep the background update scoped to previewGrade and leave pending edits available to apply.

## 1.14.0 - 2026-11-05

### Dice upload grade and preview backgrounds

- Split the empty preview into green and purple upload areas. Choose the source grade before file, folder, drop or paste imports; keep complete-six-face validation and incremental uploads. Green generates cube roll; purple generates tilted gyro 05.
- Separate preview backgrounds from source grade. Changing backgrounds reuses the current runtime and playback, preserves native animation, PNGs, anchor, audio and resource prefix, and invalidates only the prior video. Remove stale per-grade session caches.
- Increase the loaded preview to a 400px-wide, aspect-preserved phone canvas. Retain compact grade-specific replacement controls after upload, including keyboard and clipboard support.
- Preserve partial drafts and mute state through background changes, reject mixed-grade partial uploads, and retain current revision after a failed background load so preview retry remains usable.

## 1.13.2 - 2026-11-05

### Dice preview scale and controls

- Move the grade selector directly below the upload heading and remove its explanatory caption.
- Increase purple settled display size by 15% in preview and video, blending from 0.47 to 0.60 seconds to retain the existing fast-turn bounds. Preserve green sizing and native resource registration.

## 1.13.1 - 2026-11-05

### Shared dice upload flow

- Green and purple now use the same complete-six-face upload contract and controls. Remove the purple composition selector and automatic numeral/base guessing for new uploads; keep file, folder, drop, paste, incremental completion and hero replacement.
- Preserve existing auto/digits sessions when renaming, restoring grade caches or exporting. Keep optional legacy source PNGs and the existing purple05 animation/resource format.

## 1.13.0 - 2026-11-05

### Purple dice motion 05

- Generate purple dice with the approved tilted-gyro motion and a 1.5x scale peak as native Spine 4.2 mesh/deform data. Preview, video and compact SKEL export use the same animation data, with six spin and six standby actions and no image sequences.
- Accept six complete point faces for either grade. Purple also preserves optional hero, sz_0 and legacy angle images, supports base-plus-numeral composition, and rebuilds older purple template sessions without changing original PNG/MP3 files.
- Keep invisible root anchor, roll/six-result sound events and the existing compact delivery structure. Purple ZIP folders, SKEL, atlas, PNG and atlas-page references consistently use the dice_purple_ prefix.
- Preserve the current green motion and improve native purple Canvas fallback when WebGL is unavailable or loses its context. The native mesh, side-wall shading and short trail adapt the selected web study rather than reproduce its nine-exposure shader pixel for pixel.

## 1.12.1 - 2026-11-04

### Dice landing fixes

- Align the rolling front face to the original transparent silhouette and brightness before switching to the stationary result. Remove the overlapping end fade that caused ghost edges on horns, fur and other shaped faces.
- Keep the 1.3x scale peak, two-second preview loop, six-second video and fourteen static atlas regions. Reuse existing images for landing meshes without image sequences.
- Reset all six mesh attachments for each spin and standby, preserve continuous Runtime playback, and rebuild older green motion sessions once with versioned asset caches while retaining source files.
- Change the green upload prompt to “拖入大骰子+六点数图” and update its English translation. Purple motion and the compact resource-package structure remain unchanged.

## 1.12.0 - 2026-11-04

### Dice resource delivery

- Package layout change: ZIPs now contain only one named folder with matching .skel, .atlas, .png, res/ originals and sound/ audio. Download review videos separately; JSON, manifests, README, derived image folders and videos are excluded from game packages.
- Apply the dice_green_ or dice_purple_ prefix automatically, normalize existing prefixes and unsafe filenames, and keep atlas page references consistent with the resulting name.
- Export green rolls as genuine Spine 4.2 binary mesh/deform data, preserving all twelve animations, six results, a 1.3x scale peak and native sound events. Purple retains its original motion and adds the same native sound cues.
- Bind the real pink anchor image to an invisible root slot with a 6x region attachment, and rebuild older green sessions once while retaining their original files.
- Use the uploaded 3D 大骰子.png (or icon.png) for the preview hero. Support a separate hero replacement, prefer the explicit large-dice image, and show a missing-image hint instead of a flat-face fallback.

## 1.11.0 - 2026-11-04

### Dice preview

- Generate the green dice roll from six original sz_1–sz_6 faces, with a 1.3× zoom peak and native Spine 4.2 mesh/deform animation; retain the purple ten-image template flow.
- Include the hidden anchor and supplied base sounds automatically. Keep each grade's preview session, original PNG/MP3 bytes, optional file/folder replacements, and failed-import recovery in the browser.
- Export a six-second, 180-frame H.264 MP4 with a mono AAC sound track when enabled, capped at 1,000,000 bytes. Green ZIPs include JSON, atlas, attachment images, originals, sound timeline and any current video.
- Keep sound failures independent of visual preview, provide a silent export switch, use Canvas projection when green WebGL is unavailable, and revalidate dice assets after releases.

## 1.10.0 - 2026-11-04

### Custom avatar frames

- Add a PNG, JPG or WebP image layer to an uploaded SVGA. Drag, resize with a locked aspect ratio, center, replace or remove it; text can be left empty for image-only customization.
- Compress SVGA packages and PNG assets losslessly in a local worker, choosing the smaller complete-file candidate. Preserve decoded RGBA, original dimensions, all animation frames and audio. If lossless output exceeds 3,000,000 bytes, show an error instead of resizing or dropping frames.
- Keep font style presets collapsed and add filled photo-stack and palette icons to the centered tabs. Labels and icons remain intact across Chinese/English changes and narrow layouts.

## 1.9.4 - 2026-11-04

### Dice preview export

- Remove the playback buttons and status row beneath the automatic preview.
- Retain 720×1600, 30fps and three full loops over six seconds; prefer efficient AVC profiles and lower the native encoder bitrate with bounded compression retries and a final 1,000,000-byte MP4 limit.
- Invalidate videos from older export profiles while preserving their stored Blobs and every original PNG; downloads and ZIPs use only the current verified video.

## 1.9.3 - 2026-11-04

### Dice upload

- Make the left empty preview the wide primary uploader, with click, drop and file paste using the same PNG validation.
- Support folder selection on both upload surfaces, filtering out non-PNG sidecar files and hidden thumbnail directories and preserving original filenames.
- Reduce the right upload area to a compact replacement entry while preserving the loaded preview aspect ratio.
- Forward file paste from the active parent tool to the same child upload flow; ignore hidden tools and busy sessions.

## 1.9.2 - 2026-11-04

### Dice interface

- Remove the page and preview headings. Keep Upload assets as the only heading and move help beside it.
- Start with the upload empty state on entry or refresh; show the actual preview after upload and retain the current upload during same-page tool navigation.

## 1.9.1 - 2026-11-04

### Dice preview

- Reuse loaded skeletons and textures for grade/name changes. Preload backgrounds and preserve the current animation progress.
- Center the dice name without a grade subtitle. Always roll all six faces and hide the mode/result controls.
- Keep one unnumbered Upload assets heading in the operations panel and remove the redundant section headings and size badge.
- Restore older sessions in six-face mode and invalidate older videos while retaining original PNGs and stored video Blobs.

## 1.9.0 - 2026-11-03

### Avatar frames

- Add centered Frame images / Custom frames tabs while retaining multi-file static-frame exports.
- Customize SVGA text with eight locally hosted English fonts, weight, fill color, outline and direct canvas positioning.
- Add editable 3D Gold, Champagne, Silver and Rose gold metallic presets using reflective gradients, bevel highlights and crisp extrusion; preserve a Solid option.
- Export the actual customized SVGA and its transparent 240×240 first-frame WebP together. Keep the SVGA within 3,000,000 bytes through bounded image optimization; reject files that cannot fit without dropping frames.
- Start visible SVGA uploads and replacements automatically. Keep manual pause, frame selection, export pausing, background/offscreen safeguards and reduced-motion preferences.
- Fix the pinned web renderer's matte-group exit so appended text stays above original masked sprites. Preserve third-party licences.

### Dice workbench

- Add the Dice navigation item and a local browser workbench for green and purple dice assets.
- Preview a two-second loop and export six seconds containing three complete cycles. Package ten original PNG files without altering their pixels.
- Keep imported assets on the visitor's computer. Preserve the current shared statistics schema without a D1 migration.

### Validation

- Verify customized raw and legacy ZIP SVGA output, original animation records, masked layers, metallic PNG transparency, actual first-frame WebP pixels, desktop and narrow-screen controls.
- Browser and decoded-artifact checks do not certify native iOS or Android SVGA runtimes; export speed and size depend on the source assets and device.

## 1.8.1 - 2026-11-03

### Shared interface

- Replace the overview and statistics pages with a persistent 40px footer showing the shared production-file total, current version, design guidelines and author entry across all six tools.
- Open room backgrounds by default and from the logo; old overview and statistics bookmarks fall back to the room tool while preserving uploaded work.
- Reserve footer space so controls remain reachable at the bottom of the page, keep the footer compact in Chinese and English on narrow screens, and hide the separate browser-local production card.

### Reliability

- Refresh the shared count on tool activation, successful event submission and reconnection; retain the post-write refresh ordering, six-tool validation, event deduplication and unknown-versus-zero states.
- Inject the shipped footer version from package.json during the build. Verify the full regression suite, all tool routes, desktop and 320px bilingual layouts.

## 1.8.0 - 2026-11-03

### Features

- Add a screen-color eyedropper below the MP4 preview. Pick the exact RGB from the original video and apply it to both transparent preview and VAP export; retain automatic detection as a one-click reset.
- Pause and reveal the original frame while picking, use a small median sample to reduce codec noise, and ignore preview backgrounds, masks and avatar/text layers. Escape or the picker button cancels without changing the committed color.
- Support custom gray-green, red, blue and other screen colors through the existing local CPU/Worker pipeline, preserving existing output dimensions and file-size limits.

### Reliability and validation

- Guard pending seeks, loading and conversion; successful source replacement clears the old picked color, while failed or cancelled imports preserve current work. Native VAP and image sequences retain their existing controls.
- Verify actual gray-green, red, blue and real gradient-screen MP4 exports, original-frame sampling, preview/export consistency, cancellation, mobile layout and offline decoded alpha. Similar foreground and screen colors can still become translucent; this release does not guarantee lossless or perfect matting.

## 1.7.4 - 2026-11-02

### VAP resource correctness

- Keep the full gold question-mark badge below optional avatar keys. Unbound and transparent avatar bindings reveal the badge; replacement portraits overlay it. The default human remains editor-only.
- Preserve explicit no-cutout metadata through native VAP re-import and export. Keep resource tags, masks, animation geometry and text defaults replaceable.
- Preserve embedded text font size and color when importing native resource slots instead of deriving font size from texture height.
- Keep native VAP transparency and timing by default instead of applying its spatial and temporal fades again; additional effects remain opt-in, with ordinary-source preferences restored when switching back.
- Align optional-resource playback, automatic source previews and source-video duration handling across the editor and output inspector.
- Re-import the current session's exact exported VAP without duplicating its local keys, while preserving unrelated local work; use valid animated frames for inherited resource dimensions.
- Keep duplicate-key validation focused on resource tags instead of reporting an unrelated video-preview failure.
- Use readable mobile navigation spacing for all six tools, including English labels.

### Matting, size and performance

- Detect smooth uneven chroma screens with conservative multi-frame evidence; calibrate local screen colors and clean connected screen shadows and limb gaps while retaining non-key foreground detail.
- Cap clips up to five seconds at 1.5 MB, respecting smaller user limits and a bounded one-frame endpoint tolerance; longer clips keep the 3 MB ceiling. Use effective native video duration for classification while reserving bytes for complete audio and resource packaging.
- Reuse native VAP GPU byte-plane processing and lazily allocate resource composition buffers, with CPU fallback and existing resolution, FPS and alpha behavior preserved.

## 1.7.3 - 2026-11-02

### VAP inspection

- Right-align the finished-VAP inspection entry and distinguish it from the help button with a light-blue treatment and playback icon.
- Place playback resource bindings in a dedicated right-hand panel beside the preview on desktop; use a single column on narrow screens. Show an explicit empty state when the file has no replaceable keys.
- Move the transparent play/pause control into the canvas lower-right corner, retaining circular 70%-opaque black styling, white icons, accessible state labels and keyboard operation.

### Shared interface

- Remove the divider above the VAP text/avatar key editor and soften horizontal content dividers across the tools without reducing input, selection or focus contrast.
- Synchronize divider tokens, reusable disclosure styles and the project UI guidance.

## 1.7.2 - 2026-11-02

### VAP quality and size

- Use ultra quality with automatic size optimization by default and hide the retired compression preset selector. Check up to five decoded samples of RGB, local edges, alpha and dynamic key masks before skipping redundant bitrate refinement; retain the previous ultra refinement when checks fail or cannot run.
- Keep selected dimensions, FPS, resource metadata and the hard file-size limit. Sampled quality checks are not a lossless guarantee; complex footage may retain the previous ultra bitrate.

### Interface refinements

- Use compact disclosure spacing throughout the Gift and VAP controls: 4px margin, 4px padding after the divider and a 44px clickable header. Synchronize reusable disclosure styles and guidance.
- Move Alpha resolution above advanced settings, keep legacy audio/RGB options hidden, remove the current-effect heading and align the two preview canvases.
- Standardize small field captions at 12px across the tools while retaining existing input and button sizes.

## 1.7.1 - 2026-11-01

### VAP refinements

- Keep a default human portrait in the editing preview only; output players, MP4 files and resource packages retain transparent replaceable avatar slots.
- Start new circular avatar keys at one second and share a gentle spring entrance between the portrait, ID and optional gold icon, followed by the existing float and fade.
- Allow the gold icon to be disabled independently while keeping its avatar key. Collapse Alpha resolution by default and use circular black playback controls with white icons.
- Reuse avatar mask coverage and pixel buffers, preserving native animated masks, output dimensions, FPS and encoder quality. A local 240-frame mask comparison kept identical pixels and reduced median mask work from 74 ms to 16 ms; total conversion still depends on video encoding.

## 1.7.0 - 2026-10-30

### Image production

- Default all WebP tools to high-quality compression, with a synchronized strict-lossless option. Compare actual high-quality and lossless candidates while retaining exact output alpha; use a bounded two-worker queue and regenerate from original canvases when changing modes.
- Import multiple SVGA avatar frames through selection, drop or paste. Keep independent frame choices, isolate invalid files and export a size-consistent batch ZIP with collision-safe names.
- Name small room-background exports with the `- preview` suffix.

### VAP keys and canvas editing

- Default new avatar keys to 144 output pixels, with a matching matching gold question-mark frame and a key label that follows movement and resizing. The gold question-mark frame stays in encoded RGB and base alpha and follows the key and gift fades. Remove the default portrait; transparent avatar placeholders retain replaceable slots in previews and packages.
- Keep avatar/text resources independent of the vertical video mask while applying the gift entrance/exit fade to their resource masks. Preserve native source masks, resource timing and individual opacity.
- Animate new avatar keys by default with a spring scale entrance, a 10-output-pixel vertical float and an ending fade. Share the same frame geometry with editor labels, gold artwork and runtime-replaced avatars; preserve existing native animations.
- Drag video content vertically inside the output canvas with matching preview and export placement. Keep canvas size, mask boundaries and manual resource coordinates fixed.
- Fix incremental runtime replacement across `tag1` and `[tag1]` aliases without overwriting unrelated tags or SDK control options.
- Simplify the workbench controls and show accessible play/pause icons at the lower-right of the current and completed output canvases. Display output only after a successful conversion.

### Validation and limits

- Validate exported ID/frame/mask metadata, real Web SDK avatar and text replacement, temporal alpha and on-canvas positioning before publication; keep local test media and state out of the static build and Git source.
- H.264 remains lossy and subject to the selected file-size budget. Runtime tag replacement is verified in the Web SDK; target iOS/Android SDK integration still requires device testing.
- Preserve the existing API, D1 bindings and migration history.

## 1.6.0 - 2026-10-29

### Exact-lossless image exports

- Share one local WebP encoder across room backgrounds, avatar frames, banners, gift images and WebP resource exports. Preserve the rendered canvas RGBA exactly, compare three lossless search settings and retain the smallest actual result; do not reduce fidelity to meet the former room-image size target.
- Run encoding in a dedicated worker, serialize jobs and fall back to the same lossless codec when workers are unavailable. PNG/JPEG resource exports keep their existing encoders.

### VAP quality and performance

- Try H.264 High, Main and Baseline profiles in order, probing the actual dimensions and bitrate. Ultra/quality presets may use one headroom-driven quality boost within the existing four-pass ceiling; retain an earlier valid result if the optional refinement fails or exceeds the byte budget.
- Add bounded chroma-key workers, reusable working buffers and ordered frame processing. Prefetch a small number of sequence bitmaps and release them after use; keep native-alpha Canvas packing without caching an entire decoded animation.
- The same local 72-frame sequence benchmark showed approximately 40–45% less conversion time with prefetching. This measures that input and machine, not a universal speed guarantee.
- Unify MP4, loose image-sequence and ZIP uploads, including stable names for pasted frames. Auto-detect strong black/white plate evidence as well as colored screens; keep uncertain scenes unchanged and place manual overrides in advanced settings.
- Add optional light-transparency recovery for colored screens. It is off by default; same-color solid details and original semitransparent colors remain ambiguous and require visual inspection or a source mask.

### Gift fade in and out

- Enable one-second entrance and exit fades by default. Adjust either duration, set an end to zero or disable the effect. Preview and export share the same time-based opacity, including dynamic resource masks.
- Proportionally shorten overlapping fades for short clips; preserve one- and two-frame inputs instead of making the entire sequence transparent. Record the selected settings inside the VAP configuration.

### Validation and limits

- Passed 30 JavaScript regression suites, existing local 72-frame exports and Tencent Web SDK playback checks. Independently decoded actual sequence and MP4 export files frame by frame; transparent endpoints and linear fades passed within H.264 quantization tolerance. Files were captured from the local page's exported Blobs; the macOS system save dialog was not tested.
- Production verification follows deployment. H.264 output remains lossy and byte-budget constrained; exact-lossless WebP applies to rendered image pixels, not recovery of source detail lost during resizing or matting. Web SDK checks do not certify iOS/Android devices.
- Keep the existing API, production D1 bindings and migration history unchanged.

## 1.5.0 - 2026-10-28

### VAP resources and direct preview editing

- Add avatar and text resources for runtime tag replacement or fixed composition. Import native VAP slots while retaining their animated positions and masks.
- Drag resources and resize from corner handles; preserve aspect ratio by default or hold Shift for free resize. Double-click to edit text or replace an image, with centering, duplication, deletion, undo and redo directly in the preview.

### Colored screens and image sequences

- Detect solid red, orange, yellow, green, cyan, blue, magenta and other colored plates. Preview and export share the sampled RGB; uncertain scenes retain their original pixels.
- Import PNG, WebP or JPG frames, or one ZIP, in numeric filename order. Preserve native alpha with optional vertical fades and encode on-device without an intermediate MP4.
- Add 1, 2 and 3 MB presets plus custom limits. Enforce the selected cap during encoding and MP4/ZIP download while retaining output dimensions, frame rate and alpha settings.

### Validation and limits

- Passed 27 JavaScript regression suites and the production build, plus real dynamic/baked-resource, colored-screen and main-page sequence import/export checks.
- On this Mac, a 72-frame, three-second PNG sequence at 720x1560, 24 FPS and half-resolution alpha converted in approximately 1.64, 1.47 and 1.45 seconds across the three caps. Actual downloads passed 138 decoded-media and five ZIP consistency checks.
- Timing applies to the measured fixture, not every input or device. Smaller budgets constrain image quality. Web playback does not certify mobile SDK compatibility, and a composited plate cannot uniquely reveal identical-color subject details or the original semitransparent RGBA.

## 1.4.0 - 2026-10-27

### Clipboard uploads

- Paste images or supported files into the active upload area with Cmd+V / Ctrl+V across room backgrounds, avatar frames, banners, gift images, VAP conversion and VAP inspection. Existing import validation, busy guards and file replacement behavior are reused.
- Keep normal paste behavior in editable fields and open dialogs. Add bilingual shortcut hints inside upload empty states.

### Whole-site statistics

- Record successful generation and valid download actions for all six tools: room backgrounds, avatar frames, banners, gift images, VAP and resources. Show every tool in the shared statistics page and include all records in home totals.
- Cached or receipt downloads add downloads without generating another file. Previewing, loading, failed operations, and packaging a VAP JSON/ZIP do not inflate generation counts.
- Apply migration 0002 before rollout to extend database constraints while preserving existing events, counter values, timestamps, suggestions and rate-limit records. Unrecorded historical output cannot be reconstructed.

### UI kit and validation

- Publish the updated reusable clipboard helper, starter, and versioned UI-kit downloads. Website publication does not update the separate FunSkill platform.
- Verified 24 JavaScript regression suites, 9 Python backend tests, 8 isolated local Worker API tests, nonempty schema upgrades, desktop/mobile bilingual layouts, native Finder SVGA paste, and real gift/resource/VAP exports with shared counts.

## 1.3.1 - 2026-10-26

### VAP 连续羽化与真实成品验收

- 默认将连续渐隐同步写入 RGB 和独立 Alpha，修复系统播放器中保留原画面或出现硬边的问题；文件内记录导出修订、RGB 模式和实际遮罩参数。
- 本站按文件标记选择预乘或直通合成，避免重复变暗；已有无标记文件仍按旧模式播放。高级设置保留标准 Alpha，以供要求直通 RGB 的目标 SDK 使用。
- 成品摘要明确显示 RGB 同步羽化；引擎返回的模式与当前选择不符时拒绝替换结果，提示刷新后重新转换。
- 透明播放按钮增加播放／暂停图标，主工具和成品验收页共用样式。

### Banner 界面

- 项目选择移到预览区域顶部，标题为“选择项目规范”，使用小 Logo 左图右文；随预览区域可用宽度切换四列／两列，保留项目尺寸联动。

### 验证与边界

- 23 组自动回归、独立代码审查和本地实际视频导出通过；此次发布还必须在正式域名重新上传原始视频、转换并下载后验收，不能用本地样例替代线上证据。
- RGB 同步羽化需要匹配的合成方式；使用 SourceAlpha 混合且要求直通 RGB 的 SDK 应选择高级兼容模式，并在目标设备验收。
- 保留生产数据库与 API，不执行迁移、导入或重置。

## 1.3.0 - 2026-10-26

### VAP 工具

- 新增本机 MP4 转 VAP v2，支持普通视频与绿／蓝幕自动识别、保留画面颜色、实时上下透明渐变、遮罩拖动及参数保留；默认 720×1560、Alpha 0.5，提供 750×1624 快捷尺寸。
- 当前效果与输出效果并排显示；预览方式位于左侧，透明／黑／白背景位于右侧，背景切换同时作用于两侧。移动端保留可用的分组排列。
- 增加移动端 60% 音量预设与视频音量调整；所有压缩预设均校验实际体积，VAP MP4 与下载 ZIP 严格控制在 3 MB 内，不改变所选输出尺寸与帧率。
- 新增独立的“查看 VAP 成品”入口，读取下载文件的内嵌配置并使用腾讯 VAP 播放器合成 Alpha；明确区分 VAP 资源与普通视频播放器中的 RGB／Alpha 拼接画面。验收不重新编码或上传视频。

### Banner 与共享界面

- Banner 使用共享项目卡片，支持 Hapi Ludo、Hapi、Yari、4Fun 对应尺寸，项目选择移至预览框下方；切换项目联动右侧输出。
- 五个工具的上传空态统一使用共享 Hover、拖入与键盘焦点样式；已有素材后恢复编辑画布状态。
- 同步在线设计规范 1.4.4、基础模板与团队 Skill 1.0.4 下载包；本次网站发布不等于 FunSkill 平台更新。

### 验证与边界

- 23 组自动回归通过，实际导出的 720×1560、2.47 MB VAP 文件在第 0／4／8 秒的透明渐变及腾讯 Web 播放器中通过检查；验收页 320px 英文无横向溢出。
- 保留现有生产 D1 与 API，不执行数据库迁移、导入或重置。具体 iOS／Android 客户端仍需接入 VAP SDK 后在目标设备验收。

## 1.2.4 - 2026-10-26

- 上传后的编辑画布与礼物栏改为 5:5；放大礼物栏至与左画布等高，完整保留截图比例。上传前仍隐藏礼物栏，手机端上下排列。
- 模型分块改为最多三路并发下载，逐块与整包 SHA 校验保持不变；分块校验后直接写入预分配模型，限制暂存内存。
- 将抠图总时限改为无进展超时：有效加载／处理进展续期，卡住或重复心跳仍会超时；避免慢网首次正常下载被五分钟总时限中断。
- 抠图模型、前景颜色恢复与最终像素处理保持 1.2.3 已验收方案。2 秒目标仍未达到，首次网络下载另计。

## 1.2.3 - 2026-10-26

### 抠图质量

- 均匀深色底图改用 Lucida 1024 与原尺寸前景色恢复，清理黑边并保护主体暗部、光效和粒子，再输出默认 200×200 无损 WebP。
- 使用 8 位矩阵权重与 FP32 计算，优先 WebGPU，无 GPU 时采用 WASM；21 个模型分块按需下载、校验并缓存在本机，保留原有图片隐私与单结果缓存。
- 狮子样例的真实客户端与 UI 导出通过 22 项固定检查及白、蓝、深灰底人工复查。半精度与图捕获候选没有进入发布版本。

### 预览与尺寸

- 上传后在同一效果框内按 6:4 显示编辑画布和礼物栏；去掉礼物栏白色外框、标题和切换按钮，手机端上下排列。上传前隐藏礼物栏。
- 新增 200／240／400／500 等比尺寸快捷项，当前图片和后续替换图片沿用所选尺寸，并支持撤销／重做。
- 导航仅选中项加粗，预留加粗宽度避免位移；放大品牌文字并修正 320px 布局。

### 验证与性能边界

- 17 个回归套件、桌面与 320px 交互、真实客户端抠图和 WebP 导出验证通过。
- 本机模型就绪后新图处理约 9.2 秒，实际编辑页约 15.3 秒；本地首轮约 13.7–16 秒。2 秒目标尚未达到，首次网络下载受网速影响。完成结果缓存不计作新图推理。

## 1.2.2 - 2026-10-25

### 抠图处理与性能

- 礼物图黑底处理使用主体识别、三分图与 ViTMatte 边缘精修，生成原尺寸透明 RGBA 后再输出默认 200×200 WebP；保护主体暗部并保留独立光效和粒子。
- 两个模型共用 WASM 运行时，支持共享内存和跨源隔离时最多使用 4 线程；不支持的浏览器保留单线程路径。
- 缓存最近一张图片的完成结果，还原后再次抠图直接复用；按来源及尺寸失效，并复制结果避免笔刷或历史记录污染。
- 新增精修模型的分块校验、本机缓存、许可证和来源声明。仅在执行抠图时加载，不上传图片。

### 验证与边界

- 本地同模型完整交互样本从单线程 12.146 秒降至四线程 5.754 秒；实际工具页缓存模型后的首次处理约 6.712 秒、模型就绪后约 3.517 秒，同图结果缓存约 5 毫秒。这是本机样例，不等于线上旧算法的同条件性能比较，首次网络下载另计。
- 固定暗部、12 个粒子、白／蓝／深灰换底对照与缓存导出一致性已检查；多线程存在少量浮点差异，不宣称抠图完美或稳定 2 秒。
- 未包含 HR 大模型、GPU 试验或 Python 服务；现有棕灰残边和复杂背景仍有优化空间。
