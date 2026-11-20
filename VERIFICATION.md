# Toolkit 本地验收 · 2026-10-23

## 1.24.9 · 房间预览底部留白与旧样式兼容 · 2026-11-20

- 实际批次数同步到预览容器属性，两／三张的关键布局直接随页面交付；更新 toolkit.css 版本地址，移除外部样式中依赖 :has 的重复规则。手机也按内容收紧，画面采样与编码不变。
- 在真实 Chrome 中拦截并提供 v1.24.7 外部 CSS，复现截图的两张底部 122px／三张 222px 空白。候选加载同一旧 CSS 后，两／三张底部均为 13px，预览 520px 高；四张仍为原布局。逐项比较预览 RGBA SHA256 与 WebP 文件名称／字节数／SHA256，全部一致。测试还检查 320px 无横向溢出，截图已查看。
- npm test 全部通过，新增批次数属性断言。当前构建五份新导出通过腾讯 Tool 2.0.6 对照、三种腾讯 Web 完整播放及 PCM／AAC、tag1／qa_avatar 读回、无绑定及头像 A-B 替换；Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8。505 个公开文件、503 项源清单、31 项 VAP 指纹与冻结快照一致。证据位于 room-preview-tight-qa。

## 1.24.8 · 房间背景两／三图预览放大 · 2026-11-20

- 仅增加房间模块 CSS：两张、恰好三张的预览保持 720:1560 比例，宽度随可用空间缩放，上限 240px／520px 高；预览区和外卡按内容收紧。四张及以上保留旧布局，手机保留原响应式规则。
- 真实 Chrome 同一素材在生产 v1.24.7 与当前构建分别生成两／三／四张：1440px 下两张 400→520px，三张 300→520px，四张仍 300px。三组预览 Canvas 原始 RGBA SHA256 及全部 WebP 输出名称／字节数／SHA256 完全一致，Canvas 仍 720×1560，导出规格不变；320px 无横向溢出，桌面和手机截图已查看。
- npm test 完整通过。所有骰子公开文件与 v1.24.7 每字节一致，制作与导出代码未修改。证据位于 room-preview-size-qa。
- 当前构建五份 VAP 新导出通过腾讯 Tool 2.0.6 对照、三种腾讯 Web 完整播放与 PCM／AAC、tag1／qa_avatar 读回、无绑定及头像 A-B 替换；Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8。505 个公开文件、503 项源静态清单和 31 项 VAP 指纹与验收快照一致。

## 1.24.7 · 棋子上传范围和图标 · 2026-11-20

- 棋子上传工作区对齐骰子：1440px 视口下外卡均 920×610，单上传区均 416×534；1024px 下外卡均 580×610、单上传区均 246×534。保留手机上下分区，320px 无横向溢出。桌面和手机截图已查看。
- 通用上传插图替换为原有绿色／紫色棋子 96px WebP；只作为上传标识，不恢复案例入口。未重编码素材；棋子上传、渲染、打包引擎及所有骰子公开文件与 v1.24.6 字节一致。
- npm test 全部通过；真实 Chrome 复验两等级按钮、拖入、粘贴、键盘上传及实际 ZIP 下载，等级前缀正确。平板栏宽和间距修正后复验通过。
- 当前构建五份新导出通过腾讯 Tool 2.0.6 对照、三种腾讯 Web 完整播放及 PCM／AAC、tag1／qa_avatar 读回、无绑定与头像 A-B 替换；Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8。505 个公开文件、503 项源清单和 31 项 VAP 指纹与冻结快照一致。最后一次仅棋子 CSS 调整，其余 504 文件及全部 VAP 文件不变。证据位于 token-upload-size-qa。

## 1.24.6 · 棋子分等级上传 · 2026-11-20

- 上传空态拆成绿色／紫色两个独立区域，各有上传按钮、拖入、粘贴和键盘操作。读取文件前设置对应等级，继续沿用分等级草稿、棋子渲染和导出引擎。移除体验案例的 UI、事件和样例请求；拖尾恢复默认功能保留。
- 真实 Chrome 验证绿色按钮、紫色按钮、紫色拖入、紫色粘贴和绿色键盘，共五个实际 ZIP。等级、四色计数、预览、文件名前缀、ZIP CRC 正确；同等级各上传方式的包内内容逐字节一致。桌面并排／320px 上下排列均已截图查看，无横向溢出和脚本错误。
- npm test 全部通过，当前构建 501 项源静态清单／503 个公开文件。全部骰子公开文件与 v1.24.5 每字节一致；同海龟真实 UI 导出的绿色 PNG／SKEL／atlas 以及 8 组原始 Canvas RGBA 与生产版本相同。
- 当前构建五份新导出完成腾讯 VAP Tool 2.0.6 同源对照、三种完整腾讯 Web 播放与 PCM／AAC、tag1／qa_avatar 输入输出读回、无绑定及 A-B 替换；Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8。源清单、公开文件和 31 项 VAP 指纹与冻结快照一致。证据位于 token-upload-qa。

## 1.24.5 · 首次图片加载与展示缓存 · 2026-11-20

- 只调整请求时机和构建 URL，不重编码、缩放或替换任何原图。27 份带内容 SHA 的展示 WebP 副本与原文件逐字节一致；原静态文件和动态导出来源保留。展示副本独立 immutable 缓存，内容改变自动换地址，代码和原资源保持既有更新策略。
- 项目卡片使用可见性观察后赋值图片地址，保留浏览器能力降级和键盘选择；隐藏模式图原生延迟加载。空骰子渲染器不再预取两张背景，真正载入候选或切换背景时沿用同一读取和失败重试。
- 相同 1440px 首屏下，线上 v1.24.4 与候选真实 Chrome 的图片 body：首页 191613→34233 B，骰子空页 1009692→80078 B，减少约 82%／92%；比较的是下载字节，未将本地服务器时延当成线上提速。
- 桌面／320px 的预览子页、项目切换、头像框、资源库正常；视口图片全部解码成功，首次未请求隐藏项目 Logo／骰子背景，缓存图刷新 transferSize 为 0，无图片和脚本错误。静态预览无 API Worker，统计 API 404 单独排除。
- 同海龟原图及 QA 种子，实际 UI 新旧绿色 PNG／SKEL／atlas 字节一致，两背景、四时刻共 8 组原始 Canvas RGBA 完全相同。绿色制作和导出源码未修改。
- npm test 通过，新增图片缓存自检覆盖原字节、副本地址稳定、内容变化后的缓存失效和动态来源保留；背景测试改为验证按需加载，并继续覆盖切换／播放／失败重试。
- 当前构建五份实际 UI VAP 新导出通过腾讯 Tool 2.0.6 对照，三种腾讯 Web 完整播放／PCM 和原 AAC、tag1／qa_avatar 输入输出读回、无绑定及 A-B 替换通过；Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8。最终 505 个公开文件、503 项源清单、31 项 VAP 指纹与验收快照一致。末次仅调整缓存头的 detach 指令，其余 504 文件逐字节不变；未复用旧版网站导出结果。证据位于 site-image-audit。

## 1.24.4 · 紫色首次调色提速 · 2026-11-20

- `npm test` 完整通过。紫色专用 766 B WebAssembly 内核只执行精确查色；调色板发现、浮点运算和分支／相等距离选择、迭代顺序、PNG 压缩、图集预算及动画均保留。共享 UPNG、绿色量化器和制作分支未改。无新增 Worker、无合成预热；源像素限 4 MiB，内存上限 16 MiB，分配失败在消耗随机数前回退原算法。
- 96 组完整量化逐字节核对 RGBA、索引和调色板；933 组内核用例及加载／分配降级覆盖两种查色、透明度、相等距离、视图偏移和边界。独立冷启动调色实验包含初始化，五款提速约 28%～42%，不将此数字外推为整体首次制作收益。
- 同机 localhost、五款原始素材各 5 对新旧交错，共 50 个全新 Chrome；未固定随机数、未预热，计时从真实文件变更至预览可用／下载启用。首次制作中位数为钢铁侠 1238.6→1070.1ms、板球 1729.4→1646.0ms、狼人 930.8→870.7ms、灯笼鱼 1048.3→935.0ms，减少约 4.8%～13.6%。飞机 872.2→879.5ms（+0.8%），整体未测得稳定增益。五款 Worker 调色与 PNG 阶段均减少约 7.6%～20.3%，各款预算尝试次数保持 2／3／1／1／1；GPU／渲染调度波动单独保留。
- 五款固定种子完整新旧流程的 PNG 文件、SKEL、atlas 文本、完整包及精简包每项内容全部字节一致，含透明像素。图集为 296378／299514／285312／287073／292854 B，均单页且最长边不超过 1024。实际 ZIP 解包经官方 Runtime 7,230 次采样，32 个 60 Hz 转动姿态、51 附件／38 区域／13 次复用、200px 清晰结果、落点单可见、轨迹和声音时序保持，世界顶点差异为 0。
- 真实阻断可选内核下载后立即使用原 UPNG，钢铁侠两种实际 ZIP 内容及 PNG／SKEL／atlas 与旧版仍逐字节一致。正常原生路径诊断确认板球三次有效 PNG 回包累计执行 2／4／6 次 WASM PCA。
- 单骰独立播放、即时重播不重置邻居、整页集体重播和 320px 布局通过；同素材重导 23.6ms、无新增 Worker 任务，JS／HTTP 错误为 0。
- 同海龟原图及 QA 量化种子，候选与生产 v1.24.3 的绿色 PNG／SKEL／atlas 字节一致；两背景、四时间点共 8 组原始 Canvas RGBA 完全相同。
- 最终 v1.24.4 的 478 公开文件及文件集合、31 项 VAP 指纹、476 项源构建清单与冻结快照完全一致。本轮五份实际 UI 新导出通过腾讯 VAP Tool 2.0.6 同源封装／Alpha 对照，三种成品在腾讯 Web 播放器完整播放并验证实际 PCM 和原 AAC；默认 tag1／自定义 qa_avatar 的输入、成品读回、无绑定主体播放及两头像替换通过。Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 新 APK 8/8；未声称物理安卓机测试。
- 证据位于 dice-purple-first-qa 的 wasm-prototype、ui-first、independent-artifact-qa、green-freeze 和 vap-qa；本轮未将独立调色实验、真实 UI 总耗时和生产网络耗时混为一项。

## 1.24.3 · 紫色大图导入和重复扫描优化 · 2026-11-19

- `npm test` 完整通过。PNG CRC slicing-by-8 的 2,144 组用例覆盖已知值、空数组、非对齐视图、随机及 10MiB 数据，CRC 与原算法完全相同；绿色仍使用原扫描分支。
- 同机浏览器的约 10MiB CRC 校验由 51.7→14.3ms。真实大图逐文件扫描由约 39～54→10～11ms；对 SHA 和槽位均匹配、且已成功验证的资料复用尺寸和 alpha。自动组成若 alpha 未知仍扫描，新字节、改槽位及清空后必须重验。10 项实际界面缓存语义检查通过。
- 24 次原尺寸／1400² 输入的界面对照中，大图同素材重传中位数为钢铁侠 111.5→34.9ms、板球 104.4→45.4ms、飞机 88.3→33.8ms，降低约 56%～69%；普通小图仍约 20～22ms。本轮未从真实 UI 总耗时证明首次导入更快，相关 Worker／系统负载及原始测量均保留，不将组件耗时减少外推为整体提速。
- 按未来可匹配尺寸剪枝后，精确图集查重在同输入重复测量中由 49.9／68.4→4.6／4.9ms，原 RGBA、打包区域次序和附件完全等价。保留四分之一圈复用及最终像素比较。
- 缩放前进行同算法几何预检；源画布在单次任务内按需复用，缓存上限 8MiB。旧新函数浏览器 golden 共 146 对、23,375,276 个 RGBA 字节完全相同，包含半透明、透明 RGB、奇数尺寸、缓存满后的回退和释放检查。
- 原索引 PNG 已达 300,000 B 时不再执行额外无损优化，超预算仍走原 OxiPNG1；未增加线程或降低姿态／调色板质量。12 组量化 golden、14 组会话和 6 组真实 WASM 预算测试通过。
- 五款固定种子完整新旧流程的图集 RGBA 差异为 0，SKEL 与 atlas 文本 5/5 字节一致。钢铁侠 PNG 因达标短路由 281,163→296,378 B，其余四款 PNG 字节相同。7,230 个官方 Runtime 采样中轨迹、音频、单一可见落点、32 姿态、51 附件／38 区域／13 次复用和 200px 清晰结果保持。普通新图集约 284～301KB、均单页且边长不超过 1024；沿用约 300KB 的软目标。
- 12 个实际 UI ZIP 全部通过 CRC、原 PNG／MP3 字节、STORE PNG、官方 Spine 4.2.43／200²／30fps 元信息／12 动作和全套 1/60 时间键检查，完整包与精简包使用相同 PNG／SKEL。
- 同海龟原图及 QA 量化种子，候选与生产 v1.24.2 的绿色 PNG／SKEL／atlas 字节一致；两背景、四个时间点共 8 组原始 Canvas RGBA 完全相同。
- 最终 v1.24.3 的 473 公开文件、31 项 VAP 指纹及 471 项源构建清单与冻结快照一致。腾讯 VAP Tool 2.0.6 同源封装及 Alpha 对照、三种新成品完整腾讯 Web 播放／PCM 声音、tag1／自定义 ID／无绑定／两头像替换均通过；Android 11 ARM64／腾讯 SDK 2.0.28 新 APK 再次 8/8。
- 证据位于 dice-purple-speed2-qa 的 CANDIDATE_ACCEPTANCE.md、crc-benchmark、reuse-benchmark、golden、artifact-golden/comparison.json、independent-artifact-qa、green-freeze 与 vap-qa/acceptance.json。

## 1.24.2 · 紫色上传、制作和打包提速 · 2026-11-19

- `npm test` 完整通过。新增 12 组旧 PNG 路径与新 RGBA 路径的同种子逐字节 golden、9 组 Worker 会话／取消／错误／超时检查，以及制作校验值缓存、包并发去重、CRC、版本变更、失败重试和删除竞态测试。绿色共享量化器、Worker 和优化器源码未改。
- 同机 localhost、相同三款素材，各 3 次冷页面与 3 次同页重传的旧新版对照：首次上传至可播放中位数为钢铁侠 2.095→1.515 秒、板球 2.799→1.905 秒、飞机 1.227→.990 秒，减少约 19%～32%。同素材再次导入由 1.175～2.753 秒降至约 23～24 毫秒，复用限于当前页面最近一次校验值相同的 01R 制作结果；刷新页面仍重新生成。
- 相同页面的首次全包 ZIP 压缩耗时约 28～30→12～13 毫秒，重复下载不再生成 ZIP。真实界面 72 个候选下载包均过 CRC，原 PNG 和音频每字节保留；PNG 使用 STORE，其余维持原压缩。旧成品 URL 只保留同会话各格式最新完成版本，并发请求合并，改名、改图、锚点改变和删除不会返回旧包。
- 真实 UI 通过更换骰面／锚点后重做、相同新素材再次复用、改名后新包名、02 切回 01R、320px 单颗并行及快速重播、键盘和空区同步重播。无脚本或请求错误、无横向溢出。
- 五款实际新成品均为 32 个 60Hz 转动姿态、38 个打包区域、51 个附件和 13 次复用，清晰结果保留 200px。官方 Runtime 7,230 个采样通过，共同旧姿态世界顶点最大差异为 0，声音时序不变。PNG 为 280,822／300,894／286,015／288,201／292,617 B，单页均不超过 1024；量化颜色小波动来自原算法已有随机性。已查看板球和狼人快转及首尾四张对照，无新增伪影、变形或漂移。
- 真实阻断私有 Worker 后，原编码回退仍生成有效 280,074 B PNG、完整 32 姿态和合法骨架，另经 1,446 次官方 Runtime 采样通过。正常运行一个制作任务只创建一个 Worker、重试图集预算时复用 WASM，不猜测采样比例或减少动画帧。
- 同海龟原图及 QA 量化种子，候选和生产 v1.24.1 实际 UI 绿色 PNG／SKEL／atlas 字节一致，两种背景、四个时间点的 8 组原始 Canvas RGBA 完全相同。
- 最终 v1.24.2 的 472 个发布文件、31 项 VAP 指纹及 470 项源构建清单与独立快照一致。腾讯 VAP Tool 2.0.6 同源封装及 Alpha 对照、三种实际导出成品完整腾讯 Web 播放／声音、tag1／自定义 ID／无绑定／两头像替换全部通过；Android 11 ARM64／腾讯 SDK 2.0.28 新 APK 再次 8/8。
- 证据位于 dice-purple-speed-qa 的 ui-baseline、ui-baseline-local、ui-optimized、acceptance、independent-artifact-qa、green-freeze、profile-baseline／fast、codec-browser 和 vap-qa/acceptance.json。真实线上观察与同机性能对照分别保留，未将 CDN 网络差异计作算法提升。

## 1.24.1 · 紫色 01R 补齐 60 Hz 转动姿态 · 2026-11-19

- `npm test` 完整通过，新增逐个 60 Hz 时间键的官方 Spine 二进制读取，以及专用图集排布的 RGBA、透明边、碰撞和不可装入检查。
- 原生产版实际浏览器约 60 Hz 绘制，但只有 17 个转动姿态，快转相邻重复比例约 48%。候选补齐 32 个姿态，连续三轮均为 32 次绘制、32 个不同附件，相邻重复比例为 0；RAF 中位 16.70ms，原 2 秒循环保持。
- 实际 UI 的单颗并行、快速重播、空白处同步重播、320px 布局及键盘通过，无脚本或请求错误。点击前后 ZIP 每项字节一致；实际导出 MP4 为 720 × 1600、6 秒、60 FPS／360 帧、H.264 + AAC，720 次编码绘制保持六颗同步，录制后恢复独立预览状态。
- 五款实际成品共 7,230 次官方 Runtime 采样通过，共同旧时间键的世界顶点最大差异为 0，始终只有一个可见附件。轨迹、尺寸、35/60 落定、.6 秒音效和 .633333 秒动作长度不变；骨架编辑器元信息仍按既有交付规格保留 30 FPS，实际转动时间键间隔为 1/60 秒。
- 32 个姿态共用 38 个打包区域、51 个逻辑附件和 13 次精确／原图变换复用。五款均为单张、最长边不超过 1024；PNG 为钢铁侠 281,554 B、板球 300,372 B、飞机 284,164 B、狼人 287,289 B、灯笼鱼 293,141 B。仅按需降低运动模糊区域的栅格采样，清晰结果保留 200px。已查看五款快转及首尾对照，无新增漂移、叠影或裁切。
- 同海龟原图、同 QA 量化种子，经候选和原生产 v1.24.0 实际 UI 导出的绿色 PNG／SKEL／atlas 字节一致；两种背景、四个时间点共 8 组原始 Canvas RGBA 完全相同。绿色制作、输出和原有通用图集排布未改。
- 最终 v1.24.1 的 469 个发布文件、31 项 VAP 指纹及 467 项源构建清单与独立快照一致。腾讯 VAP Tool 2.0.6 同源封装和 Alpha 对照、三种实际网站导出成品完整 Web 播放及 PCM／AAC 声音、tag1／自定义 ID／无绑定／两头像替换全部通过。Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 实测再次 8/8。
- 本地证据保存在 dice-purple-smooth-qa 下的 baseline-v124、candidate-v3-final、independent-artifact-qa、green-freeze 和 vap-qa/acceptance.json，不包含在资源 ZIP 或公开构建中。原生 Spine 窗口视觉验收范围仍同下方记录。

## 1.24.0 · 紫色单颗重播和图集复用 · 2026-11-19

- `npm test` 完整通过，新增独立点数时钟、快速连点不阻塞邻居、录制状态隔离、分声道音效、输入竞态和精确图集复用回归。
- 实际浏览器点击 1／2 并行转动、转动中重复点击 1、单独重播 6 均通过；其他骰子的时间、尺寸和声音源保持独立。旧全局六点落音和被重播骰子的旧落音会取消，已落定者保持结果，点击 UI 空白处恢复六颗同步播放。
- 紫色画布支持 Tab 聚焦、数字键 1～6、Enter／空格。320px 命中与布局正常，忙碌、未保存设置、IME、组合键和绿色画布不拦截相关按键。受控隐藏和延迟解锁测试确认旧声音不会迟到播放；不将其当作 OS 后台或硬件权限验收。
- 真实 MP4 为 720 × 1600、6 秒、60 FPS／360 帧、H.264 + AAC，720 次实际编码绘制都包含六颗同步骰子，录制后独立预览状态恢复。点击前后 ZIP 每项字节一致。
- 钢铁侠、板球、飞机、狼人、灯笼鱼均由 36 块图像减少为 23 块，保留 36 个逻辑附件，复用 13 块。六次复用为完整 RGBA 相同，七次为可证明的原图变换。五款均为单张、最长边不超过 1024、低于 300,000 B，动作采样未降分辨率（factor=1）。
- 五个实际包经官方 Spine Runtime 检查 7,230 次取样，附件全部可解析、始终单一可见，六个结果和连续切换正确。12 个动作的时长、换图关键帧、音频路径及最终世界顶点与旧稳定包一致。已查看五款六个时间点的旧新成品渲染拼图，无新增变形、漂移、重影或裁切；原生窗口视觉限制仍同下方记录。
- 精确四分之一圈复用的官方 JSON／Binary 96 个角点最大误差低于 1e-6，透明像素 RGB、Alpha、锚点和输入数据均保留。
- 同海龟原图与同 QA 量化种子，经候选和原 v1.23.0 生产 UI 导出的绿色 SKEL／atlas／PNG 字节完全相同。绿色素材在绿、紫背景下的 0／.2283／.6／1.3 秒，共 8 组 720 × 1600 原始 Canvas RGBA 完全相同。绿色制作模块、原音效类和导出混音未改。
- 最终 v1.24.0 的 468 个发布文件及 31 个 VAP／首页指纹与独立验收快照一致。腾讯 VAP Tool 2.0.6 同源封装与 Alpha 对照、三种实际导出成品完整 Web 播放及 PCM／AAC 声音、tag1／自定义 ID／无绑定／两头像替换均通过。Android 11 ARM64／腾讯 SDK 2.0.28 新 APK 实测再次 8/8。
- 本地证据保存在 dice-purple-click-reuse-qa 下的 local、green-freeze、independent-artifact-qa 和 vap-qa/acceptance.json，不包含在资源 ZIP 或公开构建中。

## 1.23.0 · 紫色 01R 紧凑 Spine 导出 · 2026-11-19

- `npm test` 完整回归通过，包含新增的 01R 反向轨迹、官方二进制读取、原子落点和连续 standby 切换检查。01R 与已确认预览的 1,924 组分数帧和轮廓样本逐项一致。
- 网站真实上传钢铁侠 PNG／MP3 并下载完整包和精简包，默认 01R、2 秒循环、桌面及 320px 布局通过，无脚本或资源请求失败。实际下载的 PNG 为 1023 × 796／267,574 B，SKEL 为 3,294 B；两包使用相同 PNG／SKEL，原始 PNG 和音频逐字节保留。
- 钢铁侠、板球、飞机、狼人、灯笼鱼五种异形素材均生成单张图集，PNG 均低于 300,000 B，最长边不超过 1024，六张清晰结果保留 200 × 200 采样。
- 官方 Spine Runtime 读取实际下载包为 4.2.43、200 × 200、30 FPS，包含 6 个 spin 和 6 个 standby。1,446 个时间采样中始终只有一个可见附件且顶点有限。钢铁侠点 1–5 的有效尺寸为 143 × 159，经一次 .95 后为 135.85 × 151.05，无重复缩放；音频事件指向同包 sound 文件。
- 官方 Java Skeleton Viewer 4.2.40 成功加载实际包，以 1×、2 秒循环、Mix 0 运行多轮，无异常。桌面控制服务未配置，原生窗口截图和视觉复核未完成；独立播放器禁音，未声称原生声音实播通过。
- 绿色相关 19 个源文件与冻结 v1.19.7 的 SHA-256 一致。同素材实际 UI 导出的 SKEL 和 atlas 字节一致；现有 UPNG 量化含随机性，仅在 QA 为新旧站设置相同随机种子后，PNG 也逐字节一致。生产绿色代码和量化算法未改。
- 最终 v1.23.0 的 466 个发布文件与独立验收快照逐项一致。网站重新实际导出 AVC 和 HEVC 两种 CRF 成品，腾讯 VAP Tool 2.0.6 同源对照通过，1088 × 1568、24 FPS、RGB／Alpha 及封装一致。三种成品均在腾讯 Web SDK 1.0.5 完整播放，PCM 非静音，AAC payload 保留。
- 默认 tag1、自定义 qa_avatar 输入、下载 JSON／MP4 读回、无绑定主体播放和两张头像替换通过。Android 11 ARM64 模拟器／腾讯 SDK 2.0.28 实测再次 8/8；此结果不代表实体安卓设备或其他 Spine Runtime 版本已认证。
- 本地证据保存在 dice-purple-01r-integration 下的 ui-qa、native-viewer-qa 和 final-vap-qa/acceptance.json，不包含在运行资源 ZIP 或公开构建中。

## 已执行

- `node tests/regression.cjs`：通过。房间背景的裁切隔离、损坏图片跳过、下载、计数与删除清空未回退。
- `node tests/toolkit.cjs`：通过。覆盖路由与状态保留、复制动态 FileList、精确帧号和 Enter、编辑时暂停、帧边界、正方形尺寸联动、非法尺寸、导出命名、损坏文件保留、中英文、在导出侧栏位置拖入文件。
- `node --check toolkit.js`：通过。
- 浏览器选择官方 `kingset.svga`：识别 750 × 750、56 帧、20 FPS，动画实际播放。
- 原创测试文件 `avatar-ring-2.svga`：识别 320 × 320、60 帧、30 FPS，动态播放，输入 28 + Enter 后精确暂停为第 28 帧，拖动时间轴可以回到首帧。
- 原创 ZIP 版 `avatar-ring-1.svga`：成功读取、播放并定位第 16 帧。
- 实际浏览器下载 `avatar-ring-2-frame-028-240x240.webp` 和 `avatar-ring-2-frame-028-480x480.webp`；Pillow 解码确认格式为 WEBP，尺寸分别为 240 × 240 / 480 × 480，中心和角落 alpha=0，图形区域含 alpha=255。
- 高度改为 480 后宽度同步为 480；输入 0 时禁用导出，恢复 240 后恢复导出。
- 读取损坏 SVGA 后显示中文错误提示；前一个有效素材、选中帧和预览保留。
- 房间背景实际重新上传两图，生成四个输出；切换到头像框、再返回，四个输出保持。头像框选中的第 28 帧返回后也保持。
- 两种工具的中英文在 320 / 375 / 414 / 768px iframe 中检查，根内容宽度均等于视口宽度，无横向溢出；头像框已加载状态也完成两种语言的四档宽度检查。
- 浏览器检查控制台，未观察到 JavaScript 错误。

## 验证范围

这是本机内嵌浏览器通过本地 HTTP 进行的验证。窄屏使用真实 iframe 宽度，未声称实体 iPhone/Android 或所有 SVGA 素材兼容。原生拖入事件的处理通过事件回归验证，文件读取、动态播放和下载则在浏览器实际操作。

未发布线上；没有提交或推送 GitHub。SVGA 测试用官方示例仅保存在工作目录；交付包内只有原创测试素材。

## 顶部紧凑化 · 2026-10-23

- 两个工具共享顶部样式：操作按钮与语言切换外框 32px 高，顶部控件字体统一 12px；Logo 24px，品牌名称 15px。桌面顶部栏 60px 高。
- 已移除手机分支将按钮恢复到 40px、品牌放大到 16/17px、操作按钮强制拉满整行的覆盖。
- 浏览器读取实际渲染尺寸：320 / 375 / 414 / 768px 下按钮字体均为 12px、语言切换 32px、Logo 24px、名称 15px，根内容宽度等于视口。
- 320px 房间背景页的中英文都已查看，Examples、Contact 和语言控件保持单行，未溢出。桌面英文版已保存顶部效果图。
- 本次仅修改 toolkit.css 的顶部样式，未修改工具处理和导出逻辑；本地验证，未发布。

## 文字导航与紧凑标题 · 2026-10-23

- 两个工具入口改为普通文字链接；当前页保留蓝色下划线，hover 以 0.2 秒从左展开下划线并变色。语言、案例和联系入口同步去掉胶囊按钮背景。
- 浏览器实际悬停未激活的工具入口及联系入口，确认下划线展开、文字变蓝；工具链接切换路由正常，Tab 键有可见焦点。现有 reduced-motion 全局规则继续关闭过渡。
- 桌面顶部栏实测 48px；主标题 26px，手机为 24px；移除两页标题区品牌英文小字及辅助说明，标题上下和工作区间距同步缩小。
- 头像框页在中英文 320 / 375 / 414 / 768px iframe 下，根内容宽度等于视口宽度；手机栏高 101px、768px 栏高 73px。房间背景页另检查 320px 中英文布局，无横向溢出。
- 浏览器未观察到 JavaScript 错误。此次仅调整 HTML 标题区和共享 CSS，工具处理与导出代码未变；未重复执行先前已通过的素材导出测试。
- 最新页面截图：交付目录上层的 toolkit-text-navigation.png。仅本地验证，线上未发布。

## 上传区统一与字段精简 · 2026-10-23

- 删除导出预览下的“选中帧”、尺寸同步说明、导出按钮下的静态图片说明，并同步移除选中帧的 JS 赋值与三项翻译；保留左侧当前帧输入和非法尺寸错误。
- 头像框空上传区共用 .stage.upload-ready；载入成功后移除空状态类，首次载入失败仍由 syncControls 恢复。删除头像框独立高度、背景和上传文字字号覆写；共用房间背景的响应式高度与 hover/drag 规则。
- 桌面实际悬停两页：上传区高度均为 590px，渐变背景与 2px 内描边一致，过渡均为 0.18 秒。两页图标均 82×68px、主文案 17px、按钮 180×44px / 14px。头像图标移除蓝色底板，改用相同灰色与间距。
- 头像框页中英文 320 / 375 / 768px iframe 无横向溢出；320/375px 上传区 450px、标题 15px，768px 上传区 540px、标题 17px；提示文字均 12px、按钮均 14px。
- 实际载入 top3.svga，播放时帧号推进，暂停后输入 19 + Enter 精确定位第 19 帧；空状态类已移除。宽度 480 时高度同步 480；输入 0 显示错误并禁用导出，恢复 240 后可导出。
- 实际下载 top3-frame-019-240x240 (1).webp，Pillow 确认 WEBP、240×240、alpha 范围 0–255。测试副本在上层 top3-test-results/ui-update-frame-019-240x240.webp。
- tests/toolkit.cjs 与 node --check toolkit.js 通过；实际初始化、语言切换、素材载入和导出未观察到 JavaScript 错误。减少动态偏好继续由原有全局规则覆盖，本轮未切换系统偏好实测。
- 上层 toolkit-unified-upload.png 为精简后的空状态截图，toolkit-unified-upload-top3.png 为实际素材测试截图。本地已验证，线上未发布。

## 联系作者与圆形头像 · 2026-10-23

- 共享顶部入口改为“联系作者 / Contact author”，加入 24×24px 圆形本人头像；复用原联系弹窗的 WebP 图源和裁切构图，资源抽为 assets/author-profile.webp，弹窗与顶部共用。
- applyLanguage 仅更新 contactButtonText，切换语言不会清除头像；联系弹窗标题同步更新。
- 浏览器实际打开/关闭联系弹窗、两页切换、中英文切换后，头像仍加载正常；桌面顶部栏保持 48px。320px 手机布局中英文均已查看，英文房间背景页含 Examples 时内容宽度仍为 320px，联系入口右边界 276.375px。
- tests/regression.cjs、tests/toolkit.cjs 通过；浏览器未观察到 JavaScript 错误。效果图在上层 toolkit-contact-author.png。
- 本地已验证，线上未发布。

## 移除头像框背景说明行 · 2026-10-23

- 删除头像框导出面板“背景 / 透明背景”一行及上下分隔线，清理其独占样式和中英文词条；导出按钮自然上移，未修改图片处理逻辑。
- 浏览器实际切换中英文，确认该行均已移除。截图为上层 toolkit-avatar-export-clean.png。本地已验证，线上未发布。

## 蓝黄立方体 Logo · 2026-10-23

- 按用户提供的品牌规范图，用内置 image_gen 提取透明立方体标志；保持蓝/深蓝/黄色与上方方块粒子。透明原稿及最终提示词在上层 spreadfun-logo/ 中保存。
- 页面左上使用 30px 标志与两行 Spreadfun / Toolkit 字标，中间加细分隔线；去掉旧图标圆角、阴影和裁切。浏览器标签同步使用独立的 64px PNG favicon。
- 显示素材为 96×96 透明 WebP（8146 bytes），favicon 为 64×64 PNG（6407 bytes）；两项本地 HTTP 访问为 200 且 MIME 正确。未新增运行时依赖。
- 实际浏览器头像框/房间背景页标志加载正常；桌面顶部栏 48px，品牌占宽约 121.39px。320 / 375 / 768px 中文及 320px 英文预览无横向溢出，中英文切换后 Logo 保留，未观察到 JavaScript 错误。
- 本轮仅修改品牌 HTML/CSS/图像引用，未修改上传与导出逻辑，未重复运行先前已通过的处理测试。上层 toolkit-new-logo.png 为实际页面截图。
- 本地已验证，线上未发布。

## 首帧暂停、WebP 压缩与导出面板 · 2026-10-23

- 移除读取成功后的自动播放。初次上传和播放中替换文件都默认停在第 1 帧，直接绘制导出预览；不需要先播放即可下载。点击播放才开始动画。
- WebP 直接以 0.85 质量编码当前帧，替代原来的 0.95；不做多次有损转码，不缩小用户指定的尺寸，保留 alpha。
- 删除导出标题下的辅助说明、“文件格式”行和重复的“输出尺寸”结果行，清理相应 JS 节点访问及翻译。保留可编辑宽高、比例锁定和尺寸错误提示。
- 收紧右侧间距：同一桌面视口，未展开下载回执时，面板从 656.5px 降到 541.5px，减少 115px。
- 真实 top3.svga 上传后帧号为 1、状态为已暂停，经过其它检查后仍保持第 1 帧；未点击播放直接下载了 top3-frame-001-240x240 (1).webp。Pillow 确认为 WEBP、240×240、alpha 0–255，alpha 与原 0.95 质量的首帧导出逐像素一致。
- 同素材/同帧/同尺寸，旧文件 35214 bytes，新文件 27138 bytes，减少 22.93%。副本和报告在上层 top3-test-results/top3-first-frame-compressed-240x240.webp 与 first-frame-compression-report.json。
- 浏览器点击播放后观察到第 7 帧及播放状态；播放中替换同一素材后重新停在第 1 帧。宽度 480 时高度跟随，恢复 240 正常；中英文切换后仍保持暂停，无已删除字段引发的异常。
- tests/toolkit.cjs 新增普通动画偏好（reduced-motion 为 false）的行为回归：旧代码因自动播放实际失败，修复后通过。覆盖首次/替换/全页拖入的首帧暂停、直接导出首帧和显式点击播放。node --check toolkit.js 通过。
- 中英文 320 / 375 / 768px iframe 无横向溢出，浏览器未观察到 JavaScript 错误；截图为上层 toolkit-first-frame-compact.png。仅本地验证，线上未发布。

## 紧凑实心按钮 · 2026-10-23

- “替换文件”改为绿色实底白字，32px 高、12px 字号、8px 圆角；播放与上下帧改为蓝色实底白字，36px 高，播放最小宽度 84px，上下帧 36px 宽。移除手机端恢复 90px / 38px 的覆盖。
- 浏览器载入 top3.svga，桌面与 320 / 375 / 768px 下实际尺寸均符合上述值，根内容宽度等于视口。320px 英文 Replace file 约 92.7px 宽、Play 84px 宽，均无横向溢出。
- 实际悬停替换与播放按钮，颜色分别变为更深绿色与蓝色，文字保持白色；新增状态不作用于禁用按钮。Tab 聚焦播放按钮时仍有 3px 可见焦点圈。
- 实际点击播放/暂停后输入第 1 帧，状态正常；控制台未观察到 JavaScript 错误。本轮仅修改共享 CSS，未重复执行处理与导出测试。
- 按钮截图为上层 toolkit-solid-controls.png。本地已验证，线上未发布。

## 导航选中字重与语言分段开关 · 2026-10-23

- 工具导航常态字重 400，仅 aria-current 当前页使用 700；移除工具链接的下划线伪元素，悬停保留颜色过渡和键盘焦点圈。
- 中英切换恢复浅蓝胶囊分段按钮，整体 96×32px，选中项蓝底白字。移除语言按钮的下划线；继续复用原有语言切换与 aria-pressed 状态。
- 浏览器实际切换两个工具和两种语言，当前页加粗及语言选中块同步更新；选中/未选中工具链接的 ::after 均为 none。桌面顶部栏保持 48px。
- 房间背景英文页在 320 / 375 / 768px iframe 下均无横向溢出；手机操作区间距收至 12px，320px 英文联系按钮右边界 304px。中文 320px 也已查看，布局正常。
- 控制台未观察到 JavaScript 错误。此次只改 CSS，未重复工具处理测试。截图为上层 toolkit-nav-segmented.png。本地已验证，线上未发布。

## 标题左对齐与 16px 导航 · 2026-10-23

- 两个工具主标题改为左对齐，与内容区和卡片外缘一致。桌面实际标题/内容左边界均为 42px，手机为 16px，768px 为 24px。
- 工具入口、语言选项、案例和联系入口统一为 16px；桌面导航栏从 48px 加高到 64px，普通顶部控件高度 36px，语言分段开关为 120×36px。保留仅选中导航加粗及无下划线样式。
- 手机端采用三行布局：Logo 与语言开关、工具入口、案例/联系入口。保持全部导航文字 16px，320 / 375 / 414px 实测栏高 141px，768px 两行栏高 97px，无横向溢出。
- 浏览器查看中文头像框页、英文房间背景页的 320px 布局，另检查英文 375 / 414 / 768px；实际切换两种工具和语言正常，控制台未观察到 JavaScript 错误。
- 此次仅改 CSS，未重复处理与导出测试。截图为上层 toolkit-left-title-16px-nav.png。本地已验证，线上未发布。

## Fun Toolkit 单行字标 · 2026-10-23

- 左上角名称改为 Fun Toolkit，移除图标与文字之间的竖线；字标保持单行，保留原图标与导航尺寸。
- 同步当前站点的浏览器标题、页脚、启动提示和开发文档；保留已有语言偏好存储键及作者公司名称。
- 桌面和 320px 中文、英文实际预览均为单行；字标约 81.88×20.5px，分隔边框为 0px。320px 英文房间背景页根内容宽度为 320px，无横向溢出。
- 两个工具与语言切换正常，tests/toolkit.cjs 通过，浏览器未观察到 JavaScript 错误。截图为上层 toolkit-fun-toolkit-wordmark.png。本地已验证，线上未发布。

## Banner 工具与三项导航 · 2026-10-23

- 中文导航改为“房间背景 / 头像框 / Banner”，新增 `#banners` 页面，与已有工具共用导航、上传、文件替换、下载、双语和响应式样式。
- 上传单张 PNG / JPG / WebP 后立即居中 cover 裁切生成 772 × 200 房间 Banner 和 684 × 240 游戏 Banner。游戏图片目标为 x=19.5、y=18、645 × 201；模板来自用户 `11 2.zip` 中的上层框，原文件 2026 bytes。
- 原模板中心是不透明占位色，不能直接全图盖在照片上。实现保留原始 3px 边框并填充内部，名义图片裁切尺寸保持 645 × 201；预览和导出均保留外框与透明边缘。
- 两个输出各以 0.92 质量编码一次为 WebP；没有另设体积上限来强制降低画质。提供单文件下载与仅含两个文件的 ZIP，切换工具/语言保留结果，上传/编码失败保留上次结果。
- 浏览器真实上传案例 `image 16062708.webp`（测试副本 case-5.webp，336 × 100），实际下载 ZIP 和单独的游戏图。Pillow 验证房间图 772 × 200、40198 bytes；游戏图 684 × 240、36954 bytes；均为 WEBP。游戏 alpha 为 0–255，与原模板逐像素完全一致。测试文件及报告见上层 `banner-test-results/`。
- 浏览器检查 320px 英文空状态、上传结果和导出区，中文 320 / 375 / 414 / 768px 生成结果的根宽度与视口一致，无横向溢出。三个工具入口、页面标题和中英文联动正常。
- `tests/banner.cjs` 通过：中心裁切几何、极端比例、实时 FileList、两种精确尺寸和 .92 编码、模板/圆角、非法输入、解码/编码失败回滚、URL 释放、后退缓存保留 URL 和两文件 ZIP。`tests/toolkit.cjs` 新增 Banner 路由与返回头像框状态验证，并与 `tests/regression.cjs` 一并通过。
- 本地已验证，线上未发布。

## Header control typography - 2026-10-23

- Language options (including active/hover), Examples and Contact author use 14px, weight 400. Desktop and 320px rendered computed styles confirmed. Tool navigation keeps its existing typography. Screenshot: ../toolkit-compact-header-type.png. Local only.

## 三工具移动端适配 · 2026-10-23

- 540px 以内顶部改为两行：单行品牌、100px 语言开关、44px 圆形作者入口，以及三个等宽工具导航。英文使用简短可见标签，链接保留完整可访问名称；中文导航文案不变。手机实际栏高 109px，768px 为 97px，桌面仍为 64px。
- 案例入口在手机房间标题旁，实际可打开并滚动查看案例；弹窗标题和关闭按钮保持可见。头像入口可打开作者信息，关闭正常。
- 手机上传区按视口高度收紧，头像动画预览按可用宽度显示；实际 320px 预览为 220 × 220。播放/逐帧、替换、裁切和下载操作提供 44px 操作范围，数字输入为 16px。
- 4 张及以上房间背景在手机统一使用两列（320px 实测每列 109px），取消预览和输出列表内部的固定高度滚动。实际上传四图生成 8 个文件；编辑范围并应用后仍保留 8 个文件。
- 裁切、案例、作者弹窗限制在动态视口内并保留滚动。实际在 320 × 568 查看裁切、案例和作者弹窗，并在 844 × 390 横屏通过键盘调整范围后点击应用；短屏顶部不吸顶。
- 三个工具、中英文、320 / 360 / 375 / 390 / 414 / 430 / 768px 共 42 个唯一布局状态均检查根宽度和主要控件边界，无横向溢出。详细 DOM 测量记录见上层 `mobile-test-results/layout-samples.json`。检查使用浏览器视口及 iframe，未使用实体手机。
- 真实 top3.svga 在手机视口加载后默认停在第 1 帧；输入 12 并按 Enter 后停在第 12 帧，修改宽度至 480 时高度同步。实际下载 top3-frame-012-480x480.webp，Pillow 确认为 WEBP / 480 × 480 / 65450 bytes。
- 手机 Banner 上传实际案例后生成双尺寸并成功下载 ZIP，ZIP 中恰好包含房间和游戏两个 WebP。测试文件、下载核验与三个 390 × 850 截图均位于上层 `mobile-test-results/`。
- 房间、头像框和 Banner 的三个现有回归检查通过。恢复浏览器默认视口后，桌面导航为 16px，右侧文字为 14px / 400，未观察到 JavaScript 错误。此次未修改图片压缩与导出规则。本地已验证，线上未发布。

## 标题旁灰色提示按钮与 Banner 说明 · 2026-10-23

- 房间背景案例按钮移到标题旁，删除重复手机入口；Banner 标题旁新增同款灰色使用说明按钮。
- 原生说明弹窗包含 GPT 生图建议 3.3:1、提示词示例和双 WebP 导出说明，支持关闭按钮、Esc 和焦点返回。
- 实际验证桌面中英文打开/关闭、房间案例打开/关闭、320×568 英文弹窗无横向溢出。320px 英文房间标题与按钮同排（中心 y 均为 145px），手机操作区域保持 44px。控制台未见 JavaScript 错误。
- toolkit.cjs 和 banner.cjs 通过。截图见上层 toolkit-title-help.png、toolkit-room-title-examples.png 和 toolkit-banner-help-dialog.png。本地已验证，线上未发布。

## 游戏 Banner 黑色与透明预览 · 2026-10-23

- 游戏预览默认黑色，新增黑色/透明分段按钮。切换仅修改容器 CSS 背景，保留同一 Canvas、输出 Blob 和下载 URL，不触发重新编码。透明模式显示棋盘格，切换语言保留当前选择。
- 浏览器实际上传案例、切换两种背景和语言；黑色背景实测 rgb(0,0,0) 且无背景图，透明模式有棋盘格。320px 英文根宽度和内容宽度均为 320px，按钮高 44px。
- 黑色预览下实际下载游戏 WebP，尺寸 684×240、36954 bytes，alpha 0–255 并与原模板逐像素一致；文件内容与此前透明预览导出逐字节相同。记录见上层 banner-test-results/preview-background-export-check.json。
- tests/banner.cjs 新增预览切换隔离性断言并通过，验证不改变编码次数、outputs 引用、Blob、URL 及清理状态。截图见上层 toolkit-game-banner-black-preview.png 与 toolkit-game-banner-transparent-preview.png。本地已验证，线上未发布。

## Banner 无损 WebP 与原图尺寸提示 · 2026-10-23

- Banner 从原生 Canvas 0.92 有损编码改为本地无损 WebP，保留裁切后的全部 RGBA 像素，不再追加画质损失。固定使用 @jsquash/webp 1.5.0 非 SIMD 编码器，源码来源、版本及许可位于 `vendor/webp/`；首次上传按需加载，加载失败提示重试，不回退到有损编码。房间背景和头像框导出规则未修改。
- 原图宽度不足 772px 或高度不足 201px 时显示中英文提示。案例原图 336 × 100，生成两图需放大约 2.3 倍和 2 倍；无损编码不能恢复原图缺失的细节。
- 浏览器真实上传细字与单像素彩线测试图，实际下载 ZIP 后解码：房间图为 772 × 200，与无缩放参考图 RGBA 逐字节完全一致；游戏图为 684 × 240，Alpha 与原始模板逐像素一致。报告及实际下载文件见上层 `banner-quality-results/`。
- 原案例的无损房间图为 168402 bytes、游戏图为 149352 bytes，比此前 40198 / 36954 bytes 更大，符合保留画质的预期。
- `tests/banner.cjs` 与 `tests/toolkit.cjs` 通过；新增 `tests/lossless-webp.cjs` 使用生产 helper 和固定 WASM，验证含全透明、半透明、纯色像素的 RGBA 全部一致。相关 JS 语法检查通过。
- 实际检查 320 × 568 英文尺寸提示，根宽与内容宽度均为 320px；恢复中文桌面后导出区显示无损 WebP，控制台未见错误。截图见上层 `toolkit-lossless-banner.png`。本地已验证，线上未发布。

## 导航选中态短下划线 · 2026-10-23

- 三个工具导航的当前页增加居中 20 × 2px 蓝色圆角短线，选中时淡入；保留现有选中字重、Hover 与键盘焦点样式，不改变导航高度和点击范围。复用全局减少动态效果规则。
- 浏览器实际切换三个工具，短线跟随当前页；检查桌面中文和 320 × 568 英文，手机根宽与内容宽度均为 320px。当前项短线 opacity 为 1，其他项为 0，均为 20 × 2px。控制台未见错误。
- 截图见上层 `toolkit-nav-short-underline.png` 和 `toolkit-nav-underline-mobile.png`。此次仅改 CSS，未重复运行图片导出测试。本地已验证，线上未发布。

## 简洁作者页脚 · 2026-10-23

- 将原有纯文字页脚改为单行版权与作者信息，白色背景、细分隔线、12px 常规文字、20px 圆形头像。桌面实测 49px，手机 53px；作者按钮在手机保留 44px 点击高度，页脚自然排版，不覆盖内容。
- 作者姓名中文为“庞伟深”、英文为“Winsome”，按钮使用对应语言的联系作者名称，复用现有作者弹窗与关闭后焦点返回。移除两处旧的整块 textContent 写入，避免切换语言或房间背景状态刷新时清空头像与按钮。更新 JS 资源版本以避免旧脚本覆盖新页脚。
- 实际检查三个工具、中文桌面及 320 × 568 英文手机；手机内容宽度与根宽度均为 320px。作者弹窗打开/关闭正常，关闭后焦点返回页脚按钮；中英文切换保留页脚结构，控制台未见错误。
- toolkit.js 语法检查、tests/toolkit.cjs 与 tests/regression.cjs 通过。截图见上层 `toolkit-simple-footer.png` 和 `toolkit-footer-mobile.png`。本地已验证，线上未发布。

## 乐趣运营首页、共享统计与需求提交 · 2026-10-23

- 默认入口与 Logo 进入 `#home`，定位“专为乐趣运营而生”。增加三工具介绍、真实累计数据、工作方式说明与工具需求入口；`#statistics` 提供总生成、总下载、分工具明细、更新时间与计数说明，首页和页脚均可进入。保持原有三个工具导航、选中短线与紧凑作者页脚。
- 新增 Python 标准库 + SQLite 本地服务。`GET /api/stats` 汇总共享数据，`POST /api/events` 接收匿名 UUID 事件并事务累计；重试幂等，不合并旧 localStorage 数字，不推算人数。默认库位于用户 Application Support 的独立目录，禁止放在静态站点根目录内。启动脚本已改为运行 `server.py`。
- 按成功生成文件数计数；房间旧尺寸重新编码不重复累计，成功单尺寸重裁另计一次。Banner 两图完整提交后计 2，头像框正式导出计 1；首帧预览、播放、语言和预览背景切换不计。下载为有效发起操作，单文件、ZIP 与再次下载链接各计 1，不证明保存完成。
- `POST /api/requests` 接收标题、任务说明与选填联系方式，返回真实回执；无公开需求列表，作者通过 `view-requests.command` 或 CLI 查看。失败保留输入。图片、SVGA 与源文件名不发给统计接口，服务不记录 IP 日志。静态资源白名单阻断数据库、源码、测试目录、目录列表与目录外链接。
- 浏览器在独立 QA 数据库中真实生成 Banner 两文件、头像框一文件及房间背景两文件，并发起对应单图/ZIP 下载。统计为生成 5 / 下载 4，明细为 room 2/1、avatar 1/1、banner 2/2；另一个新页面读取同数。真实需求提交回执与作者 CLI 落库一致。报告和截图位于上层 `hub-test-results/`。
- 实际停止服务后，统计显示“—”和不可用提示，不用本机值或 0 冒充全站累计；手机需求表单失败后保留标题与说明，Esc 可关闭。320 × 568 中英文首页和统计页均无横向溢出；需求弹窗宽 282px、客户宽与滚动宽均 282px，高 544px，垂直滚动可到达提交按钮。另检查 768px 平板与 1111px 桌面布局。
- `tests/server_test.py` 的 7 组集成检查通过：独立客户端共享、50 个并发请求含重复事件、重启持久化、需求落库与 CLI、输入/Origin/体积校验、限流及敏感路径阻断。`tests/hub.cjs` 通过真实值渲染、错误占位、250 个文件分批、写后刷新竞态、表单失败/回执与双语检查。三个工具回归已补生成/下载成功与失败计数断言并通过，路由回归覆盖首页/统计往返保留 SVGA 状态；相关 JS 语法检查通过。
- 验收后切换到干净的正式本地数据库，事件与需求均为 0，QA 数据和数据库不进入站点 ZIP。统计依赖成功上报，持续断网或排队期间关闭页面可能漏计；旧历史无法追溯。最终预览见上层 `toolkit-operations-home.png`、`toolkit-shared-statistics.png`、`toolkit-statistics-mobile.png`。用户明确选择先完成本地版本，之后再部署；本轮未上线。

## 导航与工具标题留白 · 2026-10-23

- 三个工具页顶部内边距从 18px 调整为 32px；540px 以内从 14px 调整为 24px。导航、字号与标题下方间距保持原值，首页和统计页保持原布局。
- 浏览器桌面房间背景页实测导航底部到标题顶部为 32px；320 × 568 手机实测内容顶部内边距 24px，根宽与内容宽均 320px，无横向溢出。检查共享选择器覆盖三个工具，无后置冲突。
- 此次仅 CSS 间距调整，以渲染验收为准，未重复运行图片或统计测试。截图见上层 `toolkit-title-spacing.png`。本地已验证，未上线。

## 首页扁平插画与精简文案 · 2026-10-23

- 首页改为左右图文布局，加入原创蓝黄扁平插画；中文内容从 373 字精简至 106 字，移除重复说明和大段原则文案，保留三工具入口、真实统计与需求反馈。新增 home.css、tokens.css，样式限定首页，不调整工具页或统计页布局。
- 插画使用内置 imagegen 生成和精修；网页使用透明 WebP，960 × 640 为 113900 bytes，480 × 320 为 47014 bytes，通过 srcset 按实际尺寸选择。提示词与素材索引见上层 home-illustration-notes.md。
- 浏览器检查 1280 × 800 桌面，以及 320 / 375 / 414 / 768px 中英文共 8 个响应式状态：无横向溢出，标题和卡片文字可读，手机保留插画，主要按钮高 46px 且不换行。保留键盘焦点、Hover 和减少动态效果支持。布局测量见上层 home-redesign-test-results/responsive-layouts.json。
- 真实打开/关闭需求弹窗并确认焦点返回；统计链接、头像框卡片、Logo 返回首页及中英文切换正常。独立预览页完成测试，用户原页已上传的 SVGA 保持不动。控制台未见错误或警告。
- tests/hub.cjs 与 hub.js 语法检查通过。本轮未改图像生成及统计服务逻辑，未重复运行编码测试。最终截图见上层 toolkit-flat-home-desktop.png 和 toolkit-flat-home-mobile.png。本地已验证，线上未发布。

## Avatar preview height aligned with Banner - 2026-10-23

- Avatar previously inherited the generic 590px stage height (540px on tablet). It now shares Banner's 440px desktop height rule. The stylesheet cache version was updated. Mobile retains its shared responsive empty state and content-sized loaded state.
- At 1280px, both default preview regions measured 440px. A real top3.svga upload displayed its complete 320 x 320 player, paused on frame 1. Playback and pause worked.
- At 320 x 568, the loaded preview measured 254px with a complete 220 x 220 player and canvas. Root and scroll widths were both 320px. Banner's empty state measured 280px. Restored the default viewport; no console errors or warnings.
- The user's original uploaded page was preserved; a separate preview was used. CSS-only change, verified by rendering without rerunning image codecs. See toolkit-avatar-compact-preview.png and toolkit-avatar-compact-mobile.png in the parent output folder. Local only, not published.

## Production release - 2026-10-23

- Authorized public deployment: https://fun-toolkit.pangweishen1.workers.dev . Cloudflare Worker version 303c9411-bb20-4316-9333-89b25e1c4ff1; dedicated production D1, separate from local and QA databases. GitHub source remains pangweishen1-collab/spreadfun-room-studio.
- Added a native Worker implementation of the existing statistics and private suggestion API. Event insert and counter update use one D1 trigger; UUID retry/conflict semantics are preserved. Two bounded global D1 fixed-window rate-limit buckets replace process-local sliding windows. Actual streaming body size is limited to 16 KiB.
- Existing room, avatar, banner, hub and real lossless-WebP regressions passed. The Python service's 7 checks passed. The new Worker integration suite passed 7 checks against fresh local D1, including 50 concurrent requests, idempotency, conflicting UUIDs, Unicode/JSON/body limits, origin checks, private records and both global rate-limit caps. No synthetic data was sent to production.
- Production HTTP verification: all 26 published files returned 200 and matched the local SHA-256 bytes; WASM MIME is application/wasm. Statistics return real D1 totals and no-store. Invalid events return 400, cross-origin submissions 403. Seven private/unknown paths return 404, including the request list, source, tests and database. Detailed report: ../release-test-results/live-http-checks.json.
- Browser: English and Chinese home pages, real statistics, 375px mobile layout without horizontal overflow, and a real top3.svga first-frame/440px preview/play/pause check passed. No production generation/download or fake request records were added. Screenshots: ../toolkit-live-home.png and ../toolkit-live-mobile.png.
- The static build only copies approved website resources to dist; local databases, node_modules, .wrangler, tests and server source are excluded. Deployment instructions and private author query steps are in DEPLOYMENT.md.

## Production end-to-end QA and faster generation - 2026-10-23

- Public-site real uploads, first/selected SVGA frames, individual downloads, repeated downloads and room/Banner ZIPs passed. Pillow confirmed WebP formats, exact output sizes and alpha; ZIP CRC and member bytes matched single downloads. A four-file room batch ZIP also passed.
- Baseline shared totals were 0/0. Actual tests ended at 24 generated / 18 downloads: room 6/6, avatar 2/3, banner 16/9. Every operation-group increment matched. Language, preview background and navigation added zero events; adding a room file counted only its two new outputs. A fresh statistics document showed the same totals. Tests remain included in the counters.
- Room: try maximum quality .92 first and return when within 120 KiB; oversized inputs retain the full eleven-round search and strict cap. Removed fixed 70ms-per-output waits. The matched browser input sample completed in 673ms before / 166ms after, including automation overhead (one sample per version). Complex inputs require an extra maximum-quality probe and may gain less.
- Banner: lossless method3/quality75 keeps all RGBA and exact-alpha settings. Six-sample interleaved offline encoding reduced two-image CPU time from 1773 to 171ms, around 90%; actual detailed-image warm browser trials were 1326 to 186ms (two-sample medians, including automation overhead). These are scoped samples, not general end-to-end guarantees.
- Actual public-site Banner downloads before and after were identical after RGBA decoding for both sizes, including transparency. Detailed sample output grew about 2.3%. Room downloads stayed at 15688 bytes for 720x1560 and 5110 for 300x480; both valid.
- Room, toolkit, Banner and hub regressions passed; the real lossless helper passed independent round-trip checks at 17x9, 772x200 and 684x240. Optimized assets matched their published SHA-256 bytes. Worker version 07d880c8-ad9b-4055-8319-c95c3623eeb3 is live; backend/schema and D1 records were retained.
- Reports, actual downloaded files and screenshot: ../live-qa-results/report.md and statistics-final.png. The user's original tabs were preserved.

## 2026-10-23 · 页脚设计规范入口

新增双语页脚资源链接与在线组件规范，PDF、设计变量和本地图标由静态构建发布。项目四组Node回归通过。生产构建预览验证新标签打开、原工具页面保持、PDF实际下载与源文件SHA256相同；1280px桌面页脚49px，320px中英页脚97px、链接触控44px且无横向溢出。规范页面320px图片正常、无整页溢出。此改动不涉及API、数据库或计数逻辑。正式发布结果另见部署回执。

## 2026-10-23 · 精细焦点与完整规范 v1.1

- 点击输入采用1px蓝边、极淡2px光晕；Tab使用2px外环、offset2px，复合尺寸输入仅容器显示焦点。错误字段保留红边，鼠标聚焦错误时不叠蓝光晕。同步首页、工具与需求弹窗的焦点厚度。
- 在线目录15节，PDF29页/28书签，附28条可筛选业务场景。补充半选/零选择、部分失败重试、搜索空结果、IME计数、数值显式修正、裁切草稿、统计零值/失败/旧值，以及下载/取消/旧输出/兼容边界。新增业务能力均标为规范目标或示例，不声称正式工具已实现。
- 本地浏览器验证批量半选与零选择禁用、失败项重试不改成功项、搜索无结果恢复、8保留并显式修正16、2048合法、120字符计数、裁切取消回到上次应用、统计0/未知/旧数据与场景筛选。320/375/768/1280无页面横向溢出，手机输入16px，表格仅局部横向滚动；未见控制台错误。PDF全页视觉检查无遮挡/溢出。
- 此次未修改图像生成、统计API、Worker或D1结构，未向生产写入测试计数或需求。发布与字节校验结果见v1.1交付包verification.json。

## 2026-10-23 · 蓝调Hover与动效规范 v1.2

- 修复首页主操作Hover变正文黑的问题，普通帮助/关闭/取消/次操作统一浅蓝反馈。绿色替换、危险红与预览黑底保留语义。
- 五种原生业务弹窗显式复用ft-motion-dialog：260ms轻微回弹入场、180ms遮罩淡入；遮罩统一#10111480与7px玻璃模糊，不动画blur。打开/关闭/草稿/焦点/统计逻辑未修改；关闭仍即时。
- 规范更新32页、31书签、16节目录；新增480ms单次扫光演示及后续动效矩阵。退出160ms、菜单/折叠/切页等均明确为新增目标；不声称所有业务已接入。导出motion-patterns.css可显式复用，支持reduced-motion和无blur降级。
- 验证记录与公开资源一致性见v1.2规范包verification.json。此次不修改编码、API、Worker或数据库，未新增生产测试事件。

## 2026-10-23 · 三工具主按钮轻扫光

- 每个工具上传与导出/下载全部2个主CTA显式启用同一ft-motion-sheen，共6个；亮带白色8%、480ms ease-out、单次，伪元素不拦截输入。绿色替换、播放、逐帧、次操作未接入。
- 六按钮同步aria-busy，房间上传在导入/编码中禁用。禁用和忙碌统一静态灰态，无扫光、位移、阴影或滤镜；键盘焦点保留外环。触屏不模拟悬停，采用即时按下反馈，hover残留不产生扫光；减少动画时关闭扫光。
- 4组既有Node回归通过；房间回归新增上传忙碌时禁用及完成后恢复断言。生产构建预览真实上传房间图、top3.svga与Banner图，分别生成并下载ZIP/单帧/ZIP成功；三个工具320px按钮高44px，无整页横向溢出，375px英文亦通过；无控制台错误。
- 在线规范记录v1.2.1增补与8%参数，PDF保留v1.2基准；下载动效CSS同步。生成/下载测试仅在本地隔离数据库，未增加生产测试计数。部署与线上校验见上层tool-sheen-test-results/verification.json。


## 2026-10-23 · 工具页框架与可运行模板

- 在线规范 v1.3 新增第15节工具页框架，原交付节顺延16，共17节。独立指南涵盖六区布局、7:3/单列断点、五态、三类工具、真实业务接入、当前差异和复制要求；PDF保留v1.2基础版。
- 模板为纯 HTML/CSS/JS，本地图片预览使用ObjectURL；处理中禁用参数，取消停止演示，参数更改使示例输出失效，无效图片保留上一张，支持中英错误反馈。演示结果无真实文件，下载禁用；无服务器请求、统计或需求提交。ZIP含11个文件及接入说明/自检脚本。
- 标准库检查通过：五态、忙碌/取消、参数失效、校验、双语、本地资源及无假下载。指南/目录/模板ID与ARIA关联唯一有效，引用齐全，ZIP CRC及下载字节一致。浏览器验证真实图片预览、帮助弹窗/Escape返回焦点、复制要求和ZIP下载；未见控制台错误。
- 模板320/375/900/1024/1280布局正常，320英文输出区完整保留，表单16px、触控44px；指南320/375无整页溢出，表格局部滚动。模板和指南在本地HTTP预览验证；浏览器协议限制使file://直接运行未做视觉实测，离线所需相对资源已检查。
- 不修改生产工具、编码、API、Worker或D1结构，未新增生产测试事件。发布提交、Worker版本和线上资源字节核验见上层fun-toolkit-tool-page-framework/verification.json。


## 2026-10-23 · 空状态、加载、占位与轻动效

- 在线规范v1.4新增第16节，原交付节顺延17，共18节。六种160×120空态/反馈SVG及图片/圆形头像占位保持蓝灰线性风格；图片外文案与动作可独立复用。公开MD、CSS/JS、23文件ZIP提供同一契约，PDF保留v1.2。
- 新动效基础包含800ms Spinner（16/24/32px）、真实原生progress、1600ms低幅Skeleton、180ms/6px入场与120ms/3px退场；立即inert和取消旧回调防止透明区域交互。指针6px/滚动12px只动装饰层；手机/粗指针/减动归零，后台和离屏停，事件合并一帧，无持续RAF空转。
- 两组标准库VM检查执行真实动效与展示脚本，覆盖忙碌、图片load/error/重置竞态、剪贴板降级、减动、离屏/后台、暂停/恢复、限幅、快速exit-enter、inert恢复、销毁和平台能力降级；ZIP内自检亦通过。SVG XML与安全检查通过，HTML ID/ARIA和本地引用完整。
- 浏览器本地HTTP检查：6图加载、暂停/继续、实际图片加载前后502×334.664px容器不变、手动失败/恢复、显示/隐藏/重播，精确指针位移5.35/4.01px与滚动位移5.53px均在上限内；离屏停止。320/375/768/1440无整页溢出，手机按钮44px、输入16px、视差静态。无控制台错误；系统减动/后台路径由VM逻辑与CSS规则核验，未切换用户系统偏好。
- 模板资源使用相对路径并完成包内引用校验；视觉在HTTP进行，未测试file协议。主工具业务、编码、API、Worker和数据库均未改，不新增生产测试计数或需求。线上版本、实际下载字节与截图见上层fun-toolkit-feedback-motion/verification.json。


## 2026-10-23 · 三工具统一空态与反馈

- 房间背景、头像框、Banner使用同一上传插图与输出插图，头像导出区使用统一头像占位；错误仅改变空态图，仍有效的素材、画布和下载由原业务保留。结果缩略图在load/error回调后更换图片 / 错误占位。
- 未知进度统一800ms Spinner，首次输出等待用1600ms Skeleton，房间文件进度保留真实数量并补ARIA progressbar。新业务内容160ms opacity .35→1，忙碌提示120ms淡出；不移动Canvas、不等待动画后才生成/下载。切换工具去重，逐帧、语言、预览背景不重复淡入。
- 既有Room / Avatar / Banner / Hub四组回归及新增共享脚本回归均通过；覆盖异步读入、解析与renderer准备、处理成功 / 错误、finally终态、失败保留、双语、计数、仅透明度动画、后台与减动跳过/取消、缩略图生命周期。
- 本地HTTP真实桌面与320px手机均完成三个工具生成、ZIP / WebP下载。独立解码确认720×1560、300×480、240×240、772×200、684×240均为有效WebP，透明通道存在，房间大图112360bytes低于120KiB。SVGA上传停首帧，播放/暂停、选第12帧和手机导出第1帧通过。
- 320px中英与375px手机无横向溢出：三工具空态高度360px、插图96×72、可见主按钮44px；头像载入后254px预览完整，输入16px。错误替换后头像保留选帧与下载、Banner保留两结果、Room跳过无效文件保留输出；无控制台错误。
- 本地共享统计增量正好10生成/6下载：Room4/2、Avatar2/2、Banner4/2。无效文件、语言和切工具未额外计数。上述文件操作只在本地隔离数据库；生产发布仅做资源/样式和无计数预览复核，未写测试事件。系统减动/后台由真实JS在平台替身中定向核验，未修改用户系统设置。
- 源码、线上字节核验、Worker版本及截图见上层tool-feedback-test-results/verification.json。

## Avatar image layers and lossless SVGA · v1.10.0 · 2026-11-04

- Added one editable PNG/JPG/WebP picture above the original animation and below text, with drag, aspect-locked resize, numeric width, center, replacement/removal and keyboard nudge. Blank text permits image-only export. Font presets are collapsed by default; both centered tabs include filled icons, retained through language changes.
- Custom exports use lossless PNG repacking and container compression in a local worker; the complete smaller candidate wins. Pixel RGBA (including zero-alpha RGB), dimensions, original animation frames, unknown records and audio are preserved. The 3,000,000-byte limit rejects oversized lossless results without silently resizing or dropping frames. Complex PNG dialects remain untouched.
- Local independent PNG checks:40 passed. Same-content protobuf image+text111,916→102,392B; image-only85,821→80,321B; legacy ZIP113,351→103,901B. All decoded PNG pixels and timeline/geometry checks passed. Real top3 download retained240×240,40frames,20FPS and17 source PNGs exactly. Sample gains and timings depend on assets/device.
- Final merged v1.9.4 baseline: full npm test passed including current dice-loop regression. Pages build emitted329 public files; new JS/worker/codec/vendor asset bytes matched the manifest, and the footer identifiesv1.10.0. Actual production-build preview export produced102,390B SVGA in351.8ms, byte-identical to the pixel-verified artifact, plus240×240 WebP; browser error/warning log empty. Chinese/English320px tabs and both selected states previously verified without overflow or lost icons.
- No database migration or schema/API change. Deployment and live-verification receipts are saved outside the public source; native SDK certification is outside this browser release check.


## Green dice six-face roll, anchor and sound · v1.11.0 · 2026-11-04

- Green imports six sz_1–sz_6 faces and generates a native Spine 4.2 mesh/deform rig with a 1.3× scale peak, 12 actions, hidden 30px root anchor and two named audio events. Purple keeps the original ten-PNG template. File/folder/drop/paste paths retain original bytes; aliases and optional corrupt hero/zero fallbacks are covered.
- Final mirror full test suite and dice video suite passed; local server suite passed 9 cases. Green input/runtime/ZIP checks use official 4.2.120 Runtime; audio mocks cover 10 scenarios. This does not establish Spine Editor or target-game acceptance.
- Clean production-build browser: six sea-turtle PNGs, automatic preview, enabled sound, MP4 and ZIP downloads passed. Final video is 868,573 bytes, 720×1600, 30fps, 180 decoded frames, container duration 6.00s, AAC mono 48kHz. ZIP is 1,538,373 bytes including that exact current MP4, original six PNGs, anchor, two original MP3s and generated Spine files. Separate packet-copy trim audit proves removed AAC padding is silent and all video frames are unchanged.
- Purple cricket source preview/import passed with the existing ten files and purple background. Production build was checked at 375px with no horizontal overflow, controls inside the full resized iframe, and return from Avatar frames retained the green files, sound flag and current video. Clean browser error/warning log empty.
- Build contains 341 inventoried static files plus Pages API routing files. Every shipped static byte matched the build manifest; temporary browser diagnosis code was removed. A fast chained automation check toggled the sound input without a reproduced source path; separate clean upload/export/download/navigation checks retained the flag correctly, so no speculative product fix was added.
- Release authorization is the user's explicit request to merge and publish. API worker/D1 data and migrations are unchanged. Live deployment receipt and post-deploy artifact checks are recorded separately under the dice chat work/release-v1.11.0 directory.


## 本地资源包补齐 · 2026-11-04（未发布）

- 紫色打包增加预览实际使用的 dice.skel、dice.atlas、preview.png 和 README；图集页名保持 preview.png。原图、声音时间表、音频及当前绑定视频继续保留，不生成原生 .spine 工程。
- test:dice 全套通过，紫色会话测试新增运行资源字节/清单校验，共 12 组；绿色、声音及输入回归通过。实际本地网页完成板球十图导入、带声 6 秒视频和完整包下载，控制台无错误。
- 当前交付 ZIP 位于骰子聊天 outputs/骰子资源包：绿色海龟 1,524,323 字节；紫色板球 1,927,548 字节。原图字节、视频绑定和图集页引用已校验。正式站仍为 v1.11.0，本轮未部署。


## 本地大骰子原图修正 · 2026-11-04（未发布）

- 文件夹中大骰子.png优先于icon.png；缺图时不再用sz_0/sz_1平面图伪装大图，显示补传提示。
- 新增按revision更新hero的本地接口，保留原六面/runtime/audio/anchor和原视频Blob；更新candidate后旧视频不再下载。文件URL按原文件hash区分，避免换图仍读取旧图。
- 海龟真实文件夹上传显示正确立体海龟，视频和ZIP使用相同原图，SHA256=e8d402d339633f98fa19be4221c49733457c8b73040fc3d3d5d083a5b66c32e7。绿色大图版ZIP1,561,676字节，包含867,210字节6秒视频。真实网页另验证只六图提示缺大图、仅补传大图保留六面预览。
- green/purple后端定向测试覆盖原图字节、连续不同图hash URL、旧视频失效、失败/陈旧revision不修改原会话；渲染器验证缺大图不读取平面替代。正式站仍为v1.11.0，本轮未部署。

## 本地绿色 anchor 插槽修正 · 2026-11-04（未发布）

- anchor 插槽直接挂在 root，实际引用上传或内置同一张粉色 anchor.png；30×30 图片附件 scaleX/scaleY=6，世界尺寸180×180，slot和attachment alpha均为0。独立images/anchor.png与图集anchor区域同步生成，静态贴图数14；六面翻滚仍为Mesh/Deform，缩放峰值1.3，不增加序列帧。
- 旧绿色会话读取时仅迁移一次并更新资源缓存键、revision与candidate；原图、声音、anchor和旧视频Blob保留，旧视频不再公开或混入新ZIP。test:dice全套通过；最后补充的六面定向测试10组通过，覆盖默认/自传不同锚点和迁移幂等。
- 真实网页完成默认anchor与显式用户anchor两条导出流程，控制台无错误。最终绿色-海龟-anchor根骨骼6倍.zip为1,567,181字节，内同次MP4为872,171字节，解码6.00秒、720×1600、30fps/180帧，AAC单声道48kHz。上传PNG、anchor和两MP3原文件字节保持。
- 独立官方spine-core4.2.120检查两份实际下载包的12动作：每spin305个采样、每standby3个采样，root关联、6倍/180×180、透明度和六点落地均通过。images/anchor.png与atlas区域RGBA逐像素相同；相对原图仅4个半透明角像素G通道74→73（Canvas量化，alpha229不变），不声称派生图与原图所有RGBA字节一致；res/anchor.png保持原文件。报告在骰子聊天work/anchor-qa。未打开Spine Editor，未部署。

## 本地交付包前缀与精简结构 · 2026-11-04（未发布）

- 以用户 Desktop/dice_green_sea_turtle 目录为交付结构：ZIP 名与唯一根文件夹均为 dice_green_<主题> / dice_purple_<主题>。根目录仅同名 .skel/.atlas/.png、res/ 和 sound/；hero统一icon.png，点数按槽位规范命名，内容字节保持。视频独立下载，不再附带任何JSON、README、build-info、manifest、images或原始anchor。anchor继续保留在实际图集中。
- 绿色原生二进制写出使用当前生成JSON的region、非加权mesh/deform、RGBA、drawOrder、translate/scale和events。官方4.2.120 JSON/Binary Runtime对3组几何和12动作共5587时间样本比对，最大世界坐标差0.00001526逻辑像素（float32量化）；1.3缩放、6个结果、root下隐藏6倍anchor、声音时序均一致。未知功能明确拒绝，未生成伪造的.spine。
- 紫色仅对已知SHA256原模板补充原生roll(0秒)和six(仅spin_6的0.6秒)事件，所有非事件结构、附件、曲线逐值不变；输出5810字节，事件直接引用sound/。fingerprint不匹配或重复patch明确拒绝。紫色anchor继续原模板all→root/隐藏6倍和透明图集区域，未改为绿色新绑定。
- 真实本地网页以用户整目录导入，自动识别dice_green_sea_turtle，下载609273字节ZIP、恰13文件(core3+res8+sound2)；板球以cricket名称下载dice_purple_cricket.zip，975514字节、恰15文件(core3+res10+sound2)。两色原图、声音字节与输入一致，atlas页引用、PNG CRC与官方Runtime12动作独立审计通过。单独视频dice_purple_cricket.mp4为6秒、约931KiB，未进入资源包。控制台无错误。
- 复现脚本及实际包检查在骰子聊天work/compact-package-qa；交付ZIP在outputs/骰子资源包。test:dice全套通过（绿色11组、紫色13组，另含新增二进制数值对比和固定模板声音测试），生产构建343文件通过。正式站仍v1.11.0，本轮未部署、未打开Spine Editor；目标游戏尚需使用匹配的Spine4.2 Runtime接入。


## v1.12.0 发布准备 · 2026-11-04

- 发布前全量 pnpm test 通过；绿色/紫色实际下载包与独立 Spine 4.2 Runtime 已验收，视频保持单独下载和1,000,000字节上限。
- 版本、双语更新记录与资源交付规范同步；由同一发布所有者构建、提交并部署正式Pages项目fun-toolkit，无数据库迁移或配置变更。线上结果另记录在骰子聊天的release-1.12.0验收报告。

## 本地绿色轻异形收尾修正 · 2026-11-04（未发布）

- 实测绿色骆驼、猞猁、水牛。三套sz_1～6均为完整底板和数字，不再叠sz_0；共同裁框/注册保留原轮廓，原PNG不改。旧版0.600～0.633333秒双图50%叠加导致双边及约75%覆盖率；新版0.55秒起用landed网格矫正，0.591667秒达到正光、相同平面及1倍尺寸，侧面/额外影子归零，0.6秒原子切到result。总时长0.633333、峰值1.3、循环2秒保持。
- test:dice全套与生产构建通过。绿色会话14组，JSON/Binary跨三种geometry及12动作5659采样，最大顶点差0.00001526逻辑px；连续AnimationState、旧motion单次CAS迁移及视频失效检查通过。
- 真实工具导出三包，逐包官方4.2.120实读12动作、72组不reset的连续切换、13文件结构/14图集区、res8与原PNG字节、sound2、1.3峰值和隐藏root anchor6倍均通过。骆驼715597B、猞猁1067257B、水牛1128372B；每份skel608705B，较旧增加12518B（约2.1%），无序列帧或新增贴图。外框衔接一致，沿用0.01顶点量化造成的内部UV误差最大约0.00501逻辑px。
- CUA逐帧查看三主题新旧对照，正式工具WebGL预览和水牛6秒带声视频导出通过。视频846377B、720×1600、30fps/180帧，收尾16～20帧确认0.6秒后稳定。对照图、三份资源和MP4位于outputs/轻异形收尾优化；证据/复现脚本及仅本地lab在work/shape-qa。
- 本轮只更新本地实现与主源码，正式站仍为v1.12.0，未部署、未打开Spine Editor；紫色保持原方案。

## v1.12.1 发布准备 · 2026-11-04

- 发布前全量pnpm test、build:pages通过；343项静态构建包含新动作模型、旧会话迁移和更新后的中英文文案，不包含本地对照lab或原始测试目录。
- 已验证三套轻异形真实资源包、官方Runtime连续播放和水牛6秒视频；单一发布所有者更新版本、提交与Pages正式站，不涉及数据库迁移或服务端配置变化。线上验收另存骰子聊天outputs/release-1.12.1-线上验收.json。
