# 更新记录

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
