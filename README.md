# Fun Toolkit

专为乐趣运营打造的素材处理工作台，包含聚合首页、四个生产工具、资源库与共享统计页。图片在浏览器中处理，正式站由 Cloudflare Pages 提供静态资源，API Worker + D1 保存现有工具统计与需求；本地可用 Python + SQLite 预览服务。

- 房间背景工具：批量图片上传、合成预览、每图每尺寸独立裁切、720 × 1560 / 300 × 480 WebP 与 ZIP 下载。
- 头像框预览图生产工具：读取本地 SVGA、循环动态预览、播放/暂停、时间轴、上一帧/下一帧、帧号输入和透明 WebP 单帧导出。
- Banner 生产工具：上传一张图片，自动居中裁切，生成 772 × 200 房间 Banner 与 684 × 240 游戏 Banner；游戏图内部为 645 × 201，保留提供的外框。两图使用无损 WebP 压缩，支持单独下载与 ZIP。
- 礼物&座驾预览图生产工具：上传 PNG、JPG、WebP，调整构图并导出正方形 WebP；支持场景羽化、透明素材、黑底主体与边缘精修、光效恢复、擦除与恢复、历史记录、旋转和安全区。

### 黑底抠图质量处理（1.2.2）

黑色和近黑色背景先用现有 BiRefNet 定位主体，再生成前景／背景／未知边缘三分图，通过 ViTMatte 精修未知区域。确定的主体暗部保持不透明；外部连通的背景黑缝被清除；不确定边缘使用邻近主体颜色约束透明度，避免光环变为棕灰色不透明轮廓。连续光效与独立粒子另行恢复，再扣除估计背景颜色。

先生成原生透明 RGBA，再通过 Canvas 重采样到默认 200 × 200 并无损导出 WebP，避免黑底像素在缩小时重新混入边缘。非黑底素材仍使用原有 AI 路径。两套模型按需加载、分块校验并在本机缓存；不上传图片，也未加入 Python 服务。ViTMatte 权重和原始代码声明位于 `assets/vitmatte/`。

狮子样例的实际浏览器验证和多背景对照保存在上层 `outputs/gift-quality-verification/`。本地完整流程约 13 秒，不能作为所有图片／设备或 2 秒性能保证；主体暗部 ROI 与光点抽样也不是完整透明度真值。以白底、彩色底和实际礼物栏效果共同验收，不能只检查黑底复合误差。
### 抠图速度优化（1.2.2 · 2026-10-25）

保留当前 BiRefNet-lite 512、ViTMatte 512 以及原尺寸边缘处理，改为共享 WASM 运行时。满足跨源隔离和 SharedArrayBuffer 时最多使用 4 个线程；不满足条件时保持单线程兼容路径。静态构建加入 COOP／COEP 响应头，现有资源为同源或本地 Blob／Data。

同一张图片完成后仅保留一份内存结果；还原背景再抠图可直接复用。键包含图片对象、来源和原始尺寸；返回数组独立复制，避免笔刷或历史操作污染缓存；退出、Worker 失败或超时清理。

本机狮子样例：同模型独立对比的首次 Worker 完整点击到渲染为单线程 12.146 秒、4 线程 5.754 秒；模型会话复用的 4 线程为 3.101 秒。实际工具页记录的抠图处理为首次 6.712 秒、替换图片后复用模型 3.517 秒、同图结果缓存 5 毫秒。页面处理计时到原尺寸抠图结果返回，未包含最终 UI 动画、导出编码；首次模型下载受网络影响。缓存命中不代表新图推理达到毫秒级，也未达到所有图片稳定 2 秒。

同模型 200px 白／蓝／深灰换底对照、固定暗部和 12 个粒子检查通过；多线程存在少量数值差异，不宣称逐像素一致。缓存前后实际 200×200 RGBA WebP 字节完全一致。GPU 和 8 线程候选本机表现不如 4 线程，未接入应用。此轮保持既有质量处理，未解决原有棕灰残边，也未将独立 HR 试验并入网页。

14 个回归套件和构建通过；实际浏览器复查了 320px 布局、抠图／恢复／替换／导出、Banner 双尺寸生成、头像框 SVGA 读取与单帧导出、房间双尺寸生成、资源库以及控制台。详细证据位于上层 `outputs/gift-browser-speed-verification/`，质量比较位于 `outputs/matte-speed-quality/browser-wasm4/`。

- 资源库：六个项目 Logo，支持尺寸、圆角和 PNG/JPG/WebP 导出。
- 统一中英文切换与响应式布局；切换工具保留本次会话中的上传内容与选中帧。
- 点击 Logo 返回聚合首页，查看工具介绍、累计生成与下载，并提出新的工具需求。首页和页脚均可进入使用统计页。
- 首页采用精简双语文案与原创蓝黄扁平插画，工具入口改为紧凑布局。插画使用带透明通道的 960 / 480px WebP 响应式资源，小屏仍保留插画。

## 预览

在本目录执行：

```sh
python3 server.py --host 127.0.0.1 --port 8765
```

或双击 `start-preview.command`，然后用浏览器打开：

- `http://127.0.0.1:8765/index.html#room-backgrounds`
- `http://127.0.0.1:8765/index.html#avatar-frames`
- `http://127.0.0.1:8765/index.html#banners`
- `http://127.0.0.1:8765/index.html#gift-previews`
- `http://127.0.0.1:8765/index.html#resources`
- `http://127.0.0.1:8765/index.html#home`（不带地址片段时也进入首页）
- `http://127.0.0.1:8765/index.html#statistics`

需要 Python 3.9 或更新版本。请使用 `server.py` 启动；普通静态服务器仍可使用图片工具，但无法提供共享统计或接收需求，页面会显示服务不可用。

`Room BG Studio.html` 是旧书签的跳转入口。最新源码入口为 `index.html`，需要同时保留各工具的 CSS/JS、`assets/`、`vendor/` 和 `design-system/`，不能只复制一个 HTML。发布时使用 `npm run build:pages` 生成完整目录。

## 统计与需求

- 生成次数：每个成功输出的文件计 1 次。房间背景和 Banner 一次输出两个尺寸，各计 2 次；头像框导出计 1 次。房间背景删除旧图或添加新图时，不重复累计未变化的旧文件；成功重新裁切一个尺寸计 1 次。
- 下载次数：每次有效发起单文件或 ZIP 下载计 1 次，不按 ZIP 内文件数累加，也不表示浏览器已完成保存。预览、播放、切换语言与背景不计数。
- 全站统计由同一个服务接收并持久化，支持多个客户端共享与服务重启后保留。不会把旧的浏览器本机累计冒充全站历史，也不计算用户人数。统计服务不可用时显示“—”和重试提示。
- 仅上报随机事件编号、工具、行为与数量，不上传用户素材、文件名或 IP。重试使用相同编号，后端幂等；匿名上报仍可能因持续断网或页面在排队期间关闭而漏计。
- 首页“提出工具需求”可提交标题、任务说明和选填联系方式。提交成功返回真实编号，失败保留输入；需求没有公开列表。作者双击 `view-requests.command`，或运行 `python3 server.py --list-requests` 查看。

macOS 默认数据文件为 `~/Library/Application Support/Fun Toolkit/toolkit.sqlite3`，位于网站目录之外，不进入 ZIP。可用 `FUN_TOOLKIT_DATA_DIR` 设置私有数据目录，或使用 `python3 server.py --db /absolute/private/path/toolkit.sqlite3` 指定文件；服务器拒绝将数据库放在网站目录内。

接口为 `GET /api/stats`、`POST /api/events` 与 `POST /api/requests`。正式站已由 Cloudflare Worker + D1 提供跨用户累计；单独复制静态页面不包含这项服务。旧使用次数无法追溯。

## 头像框工具用法

1. 选择顶部“头像框”，点击上传，或将一个 `.svga` 文件拖入页面。
2. 读取后默认停在第 1 帧，可直接导出；点击“播放”才开始动画。拖动时间轴、点击上一帧/下一帧，或输入帧号并按 Enter，停在需要的帧。替换文件后同样回到第 1 帧暂停。
3. 默认输出 240 × 240。宽、高任意一边都可修改，另一边等比例联动，固定为 1:1。支持 16–2048 的整数像素。
4. 点击“导出 WebP”，压缩并保存当前选中的静态帧。导出时自动暂停，保留所设尺寸与素材本身的透明区域。棋盘格只用于预览，不写入图片。

非正方形素材会等比放入正方形透明画布，避免拉伸。导出文件名包含源文件名、帧号和输出尺寸。离开工具、后台标签页或预览离开视口时暂停播放。

支持经过验证的 SVGA 2.0 与 ZIP 格式 1.x；音轨不播放。文件需小于 50 MB。读取失败会提示，并保留上一次有效素材；不会上传用户的文件。

## Banner 工具用法

点击标题旁的灰色“使用说明”按钮，可查看 GPT 生图建议：在提示词中写明宽高比为 3.3:1。弹窗提供可直接参考的文字和关闭按钮，支持中英文及手机布局。房间背景的灰色“案例图片”按钮也统一放在标题旁。

选择顶部 Banner，点击上传或把一张 PNG、JPG、WebP 拖入页面，即可预览并下载两个尺寸。输入限制 30 MB、4000 万像素；默认居中裁切填满，不拉伸。游戏外框来自本次提供的 `11 2.zip`，名义图片区域位于 x=19.5、y=18，大小 645 × 201，保留原有圆角和 3px 外框。

导出固定尺寸且仅编码一次，保留游戏图透明边缘。替换失败保留上次有效结果；切换工具或语言不清空结果。

Banner 使用本地 WebAssembly 编码器进行无损 WebP 压缩，保留裁切后画面的像素与 Alpha，不设置体积上限或降低画质。文件通常比旧版 0.92 有损编码更大。首次上传时按需加载本地编码器，加载失败会提示重试，不会改用有损编码。房间背景工具和头像框工具继续沿用各自已有导出规则。

原图宽度小于 772px 或高度小于 201px 时，会提示放大可能变模糊；建议使用至少 772 × 201px 的原图。无损编码不会恢复低分辨率图片中缺失的细节。

游戏 Banner 默认使用黑色预览底色，可通过“黑色 / 透明”切换为透明棋盘格。此设置只改变预览容器，不写入画布或导出文件，WebP 始终保留原有透明区域。

## 手机使用

- 540px 以内采用两行顶部导航，工具入口保持一行；联系作者通过右上圆形头像打开，房间案例入口位于标题旁。
- 三个工具共用简洁页脚：版权信息、圆形作者头像与姓名；点击作者打开联系弹窗，支持中英文。桌面高约 49px，手机约 53px。
- 预览和导出按单列排列，背景批量预览默认两列；下载列表跟随页面滚动。手机按钮和滑动控件提供 44px 操作区域，数字输入为 16px。
- 裁切、案例和联系弹窗限制在可视高度内，可滚动到操作按钮；横屏短视口下顶部栏不吸顶。
- `tests/responsive.html` 支持 320–844px 宽度与 390–850px 高度检查。当前已验证三个工具的中英文 320 / 360 / 375 / 390 / 414 / 430 / 768px 布局及 844 × 390 横屏裁切操作，记录见 `VERIFICATION.md`。

## 目录

- `index.html`：站点结构、原有房间背景逻辑及内嵌素材。
- `toolkit.css`：统一导航与头像框样式，沿用原来的蓝白视觉系统。
- `toolkit.js`：工具路由、语言同步、SVGA 控制、尺寸校验与单帧导出。
- `hub.css`、`hub.js`：聚合首页、统计展示、匿名事件上报与需求提交。
- `home.css`、`tokens.css`：首页专属布局与品牌变量；不覆盖工具、统计或需求弹窗的样式。
- `server.py`：同源 API、持久化统计、私有需求与受限静态资源服务。
- `view-requests.command`：作者本地查看已收到的工具需求。
- `banner.js`：Banner 上传、自动裁切、外框合成与两图压缩下载。
- `banner-webp.js`：按需加载本地无损 WebP 编码器。
- `assets/game-banner-frame.webp`：用户提供的 684 × 240 游戏外框。
- `vendor/`：固定版本本地播放/解包库与许可；不依赖在线 CDN。
- `tests/regression.cjs`：房间背景回归。
- `tests/toolkit.cjs`：导航、帧定位、尺寸联动、错误保留和整页拖放等回归。
- `tests/banner.cjs`：Banner 裁切几何、两图编码、错误回滚与 ZIP 回归。
- `tests/lossless-webp.cjs`：真实生产编码 helper 与固定 WASM 的 RGBA 逐字节回归，另需 Python / Pillow。
- `tests/hub.cjs`：共享统计展示、错误态、事件分批、写后刷新与双语需求回执。
- `tests/server_test.py`：临时数据库中的并发、幂等、重启、独立客户端、需求隐私与输入校验。
- `tests/fixtures/`：原创测试头像框的 SVGA 1.x / 2.0 文件与损坏样本。
- `tests/responsive.html`：可调宽度和高度的 iframe 布局检查页。
- `VERIFICATION.md`：本次实测证据与范围。
- `GitHub-Pages/`：**收到交接包时的旧线上快照，并非当前 Toolkit 发布目录。**

## 检查

需要 Node.js，仅使用其标准库：

```sh
node tests/regression.cjs
node tests/toolkit.cjs
node tests/banner.cjs
node tests/hub.cjs
python3 tests/server_test.py
node --check toolkit.js
node --check banner.js
node --check banner-webp.js
node --check hub.js
```

重建原创测试素材需要 Python 与 Pillow：`python3 tests/make-fixtures.py`。日常运行网站不需要 Pillow。

无损编码核验：`node tests/lossless-webp.cjs`，需要可运行 Pillow 的 `python3`；可用 `BANNER_TEST_PYTHON=/path/to/python` 指定路径。

## 发布状态

正式网站：[Fun Toolkit](https://fun-toolkit.pages.dev/)。源码仓库：[pangweishen1-collab/spreadfun-room-studio](https://github.com/pangweishen1-collab/spreadfun-room-studio)。

线上使用 Cloudflare Pages + API Worker + D1，提供完整工具、共享统计和私有需求提交。旧 [Workers 地址](https://fun-toolkit.pangweishen1.workers.dev/) 作为兼容入口保留，默认发布目标为 Pages。`server.py` 保留为本地开发服务。GitHub Pages 使用 `docs/` 中的轻量入口跳转到正式 Pages 站并保留地址片段；不再直接发布仓库根目录。部署步骤和作者查看需求的方法见 `DEPLOYMENT.md`。数据库、运行状态和账号凭据不进入仓库或静态资源目录。

## 生成性能

1.0.1：房间背景先尝试最高质量编码，达到 120 KiB 限制即完成；复杂图保留原有完整搜索和严格容量检查，并移除每个输出固定 70ms 的等待。Banner 调整无损编码搜索参数，保留全部 RGBA 像素与透明通道。线上同图样本及真实下载、统计核验见 `VERIFICATION.md`；速度取决于素材与设备，不以降低画质提速。

2026-10-24：房间队列最多同时编码两张图，保留上传顺序；追加/删除复用未修改的两尺寸结果，修改裁切仅失效对应尺寸。失败时等待所有在途编码结束再解锁，首次成功提交后才累计统计。头像框复用已暂停的当前帧，尺寸和素材变化会重新绘制。Banner 并行准备图片/外框/编码器，并使用更快的无损搜索；解码像素与原版一致，测试样例体积增加约 4%–5%。本地三轮中位数：复杂双图 1775→936ms，追加第二张 1711→871ms，头像框导出 17→13ms，Banner 246→135ms。单张房间图原有质量搜索保持不变；实际耗时取决于设备和素材。

## 资源库（本地开发版）

主导航 Banner 后新增“资源库 / Assets”，直接入口为 `#resources`。内置用户提供的 Yari、Hapi、中东 Hapi、4Fun、Maza、Hapi Ludo 六个项目 Logo，保留原图背景。

默认 512×512，提供 128 / 256 / 512 / 1024 快捷尺寸，也可输入 16–4096 的整数；宽高始终 1:1 联动。可选择 PNG、JPG、WebP；PNG / WebP 保留透明通道，JPG 的透明区域填白。原图不足目标尺寸时提示放大可能变模糊。

展示使用轻量 WebP 预览；导出按需读取合适规格，复用原有异步 Canvas 编码器，避免对大尺寸 Logo 使用同步主线程 WASM 压缩。更改项目、尺寸、格式会失效旧回执，语言和工具切换保留选择；忙碌时防重，错误可重试。

`resource-library.css/js` 管理此页面，素材位于 `assets/resources/`。`node tests/resources.cjs` 覆盖业务状态、并发与格式；浏览器已实际核验五项目三格式以及 4096px 导出。资源库暂不接入共享计数，避免将素材下载误记到原有三个工具。此节不表示已发布到正式站。

## 第三方库

- [SVGAPlayer-Web 2.3.2](https://github.com/svga/SVGAPlayer-Web)：Apache-2.0，许可见 `vendor/SVGA-LICENSE`。本地副本 SHA-256：`b04d24d3a41a7a602d5ab6f917e9c0453f23709fdd08069d37e5ae41265fcbf9`。
- [JSZip 3.10.1](https://github.com/Stuk/jszip)：本地保留 MIT/GPL 许可文本，见 `vendor/JSZIP-LICENSE.md`。
- [@jsquash/webp 1.5.0](https://github.com/jamsinclair/jSquash/tree/main/packages/webp)：只保留非 SIMD 编码器、WASM 和选项默认值，来源与 npm 完整性校验见 `vendor/webp/README.md`，许可见该目录的 `LICENSE` 和 `LICENSE.codec.md`。

## 作者

庞伟深 · Winsome · Spreadfun

## 设计规范入口

页脚“设计规范 / Design guidelines”在新标签页打开 `design-system/`，保留当前工具会话。在线规范v1.4.1提供32页基础PDF（v1.2）、28条可筛选场景、动效与玻璃遮罩演示、工具页框架和设计变量下载；组件交互仅演示，不提交需求或记录生成/下载统计。公开文件由构建脚本显式加入，移动端页脚分行显示。

三个工具各2个上传/导出主按钮已启用8%单次轻扫光；移动端保留44px触控与按下反馈。在线v1.2.1增补和可下载动效CSS已同步，PDF仍为v1.2基础版。


## 工具页框架 v1.0

在线规范 v1.3 的第15节提供 `design-system/tool-page-framework.html`，包含六区职责、响应式尺寸、五态流程、三种工具变体、插槽/API映射、业务接入清单和可复制搭建要求。`design-system/tool-page-starter/` 是原生 HTML/CSS/JS 可运行示例，ZIP 额外包含中文 README，本轮已合入最新反馈基础库与8张空态/占位SVG。支持中英、真实本地图片预览、取消/错误/忙碌和无障碍焦点；生成是模拟，下载明确禁用。业务编码、实际下载和统计需另行接入，示例不会调用 API 或新增统计。基础 PDF 保留 v1.2，新增框架见在线规范或框架 MD。


## 空状态与反馈动效 v1.0

在线规范v1.4第16节链接 `design-system/feedback-states.html`：6张蓝灰线性SVG缺省图、图片/头像占位、统一Spinner/原生progress/Skeleton，以及可操作的淡入淡出与轻视差。`feedback-motion.css` / `.js`是可按需复用的原生基础实现；活动区离屏/后台暂停、支持全局暂停与系统减少动态效果，手机禁用视差，退出阶段立即inert且可取消旧退场。图片加载、任务进度和焦点路由由接入方实现。`Fun-Toolkit-Feedback-Motion-Kit.zip`包含全部本地资源、MD和可运行Node自检；基础PDF仍为v1.2。工具的生产接入方式见下方“三工具统一反馈”。


## 三工具统一反馈

生产页显式复用design-system/assets/feedback图形与feedback-motion.css/js；tool-feedback.css/js只负责空态、占位、busy提示与160ms纯透明度入场，不改变文件、Canvas、坐标、编码、下载或计数。忙碌提示120ms淡出，循环离屏/后台暂停，减少动画即时反馈；手机插图96×72、触控44px。原工具持有阶段，实际新预览/结果或工具切换才淡入，逐帧、语言与背景切换不反复入场。新共享适配检查：node tests/tool-feedback.cjs。


## 团队 UI Skill · v1.0.2

规范页第17节提供完整 [团队Skill](https://fun-toolkit.pages.dev/design-system/#team-skill)，源码在 `skills/fun-toolkit-ui/`，发布ZIP位于 `design-system/downloads/fun-toolkit-ui-1.0.2.zip`。包含资源规范1.4.2、可运行模板、最新空态和动效、表单与业务接入规则、团队安装与AGENTS片段、复制/完整性脚本及一次独立Agent真实试做案例。ZIP内容须解压到名为fun-toolkit-ui的目录，不能只保存SKILL.md。

包内演示不产生真实文件或统计；新工具必须接真实业务。独立试做已验证512×512 WebP下载与中英手机布局，团队真人试用与其他Agent安装兼容仍未认证，治理标记pilot。具体边界见随包references/validation.md，发布摘要见ZIP同名.sha256文件。

## Pages 测试站 · 2026-10-24

测试地址：https://fun-toolkit-pages-test.pages.dev/ 。原 Workers 地址继续保留。

运行 `npm run deploy:pages:test` 构建并发布 Pages 测试站。构建脚本将原静态构建复制到 `dist-pages/public`，使用相同 API Worker 和仅覆盖 `/api`、`/api/*` 的 `_routes.json`。Pages 配置放在公开资产目录之外，避免误读原 Workers 配置。`wrangler.pages.jsonc` 为此独立构建目录的配置模板。

Pages 与原站绑定同一个 `fun-toolkit-production` D1 数据库，无需迁移、初始化或清零。测试和真实使用均累计到共享生成/下载次数；不要对共享库执行重置或重新导入。

此测试站与 FunSkill 一样使用 Pages 入口；大陆三网的长期可用性仍须实测，浏览器功能验收不等于大陆网络稳定性证明。

## Pages 正式环境 · 2026-10-24

正式地址：https://fun-toolkit.pages.dev/ 。测试地址继续为 https://fun-toolkit-pages-test.pages.dev/ 。

`npm run deploy` 或 `npm run deploy:pages` 默认发布正式 Pages 项目 `fun-toolkit`；`npm run deploy:pages:test` 单独发布测试项目。旧 Workers 的发布方式保留为 `npm run deploy:worker`，不再作为默认发布入口。

正式站、测试站与旧 Workers 继续使用同一个 D1 统计库；本次晋级不改业务代码、不执行数据库迁移、不清零计数。正式静态资源和 API Worker 与刚完成真实上传、生成、下载验收的测试构建逐字节一致。

### 商店图标预设

资源库提供 iOS App Store（1024 × 1024、RGB PNG，无 Alpha）和 Google Play（512 × 512、RGBA PNG、sRGB、最大 1024 KB）预设，固定平台尺寸与 PNG；切回自定义可恢复原有尺寸和格式。按用途选择后逐个平台下载。iOS 透明区域填白，两种文件均保持完整正方形，不增加圆角或外部阴影。

这是平面商店图标输出，不生成 Android Adaptive 前景/背景或 Apple Icon Composer 工程。小于 1024px 的原图导出 iOS 时会放大并提示。平台预设使用原生 CompressionStream 无损 PNG 编码，缺少该能力会明确提示，不降级生成错误通道文件。

规范来源：[Apple Xcode](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)、[Apple App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)、[Google Play](https://developer.android.com/distribute/google-play/resources/icon-design-specifications)。核验日期：2026-10-24。随网站 1.1.0 纳入发布。

### 直角与自定义圆角

资源库默认以 0% 直角预览和导出。自定义尺寸提供 0–50% 圆角滑杆与整数输入框，圆角按输出边长等比计算；50% 为圆形。PNG/WebP 裁切区域外透明，JPG 填白，预览同步显示。参数变化使旧下载失效，切换项目/语言保留设置；商店预设强制输出直角，切回自定义恢复原圆角。

### 主导航交互

主导航选中态保留蓝色加粗，不显示下划线；精细指针 Hover 使用蓝色柔光与最多1px轻微上浮，触屏保留按下反馈，减少动态效果时不位移。

### 输出速度复验（本地 · 2026-10-24）

本地预览：http://127.0.0.1:8792/#room-backgrounds 。以下为本机性能测量，相关修改随网站 1.1.0 纳入发布。

- Banner 保留完全无损、exact alpha 与 method 1，将无损编码搜索力度降至 0；此参数只影响搜索耗时和文件体积，不降低像素质量。同素材三次生成中位数 146.7 → 84.2ms；实际下载的两张 WebP 解码 RGBA 与原版完全相同，样例文件增加约 3.8%–4.7%。
- 房间 ZIP 使用 CRC32 查表，文件内容和 ZIP 字节保持一致。40 个真实 WebP 的独立打包 CPU 基准中位数 140.0 → 29.2ms；不等于整批图片生成提速 79%。
- 资源库同项目、用途、尺寸、格式与圆角的再次下载复用当前 Blob，不新增多份缓存。2048px WebP 重复三次下载处理的中位数 212.5 → 2.1ms；首次导出未改变。参数变化后重新生成，语言切换保留有效文件。

已在本地生产构建完成 18 次真实下载，覆盖三工具、六个项目 Logo、PNG/JPG/WebP、iOS/Android 预设与圆角；375px 中英窄屏和 1280px 桌面布局已检查。独立本地 D1 按预期新增生成 8、下载 6；资源库不混入原三工具计数。头像框首帧暂停、指定帧、尺寸锁定与损坏文件后重试通过，原画质设置不变。完整证据在项目工作区 `outputs/local-speed-verification/`，性能数字仅代表本机样例。

### 资源库默认状态 · 1.1.0

首次打开或刷新资源库，默认 PNG、0% 圆角；自定义选项支持调整圆角并实时预览。页面切换保留当前调整，刷新恢复默认。资源库标题仅保留“资源库”，中英文均不显示标题下说明，与其他工具页保持一致。
