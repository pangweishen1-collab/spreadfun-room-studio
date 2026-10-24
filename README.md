# Fun Toolkit

专为乐趣运营打造的素材处理工作台，包含聚合首页、三个工具与共享统计页。图片在浏览器中处理，线上统计与工具需求由 Cloudflare Worker + D1 保存；本地可用 Python + SQLite 预览服务。

- 房间背景工具：批量图片上传、合成预览、每图每尺寸独立裁切、720 × 1560 / 300 × 480 WebP 与 ZIP 下载。
- 头像框生产工具：读取本地 SVGA、循环动态预览、播放/暂停、时间轴、上一帧/下一帧、帧号输入和透明 WebP 单帧导出。
- Banner 生产工具：上传一张图片，自动居中裁切，生成 772 × 200 房间 Banner 与 684 × 240 游戏 Banner；游戏图内部为 645 × 201，保留提供的外框。两图使用无损 WebP 压缩，支持单独下载与 ZIP。
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
- `http://127.0.0.1:8765/index.html#home`（不带地址片段时也进入首页）
- `http://127.0.0.1:8765/index.html#statistics`

需要 Python 3.9 或更新版本。请使用 `server.py` 启动；普通静态服务器仍可使用图片工具，但无法提供共享统计或接收需求，页面会显示服务不可用。

`Room BG Studio.html` 是旧书签的跳转入口。最新源码入口为 `index.html`，需要同时保留 `toolkit.css`、`toolkit.js`、`hub.css`、`hub.js`、`home.css`、`tokens.css`、`banner.js`、`banner-webp.js`、`assets/` 和 `vendor/`，不能只复制一个 HTML。

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

正式网站：[Fun Toolkit](https://fun-toolkit.pangweishen1.workers.dev)。源码仓库：[pangweishen1-collab/spreadfun-room-studio](https://github.com/pangweishen1-collab/spreadfun-room-studio)。

线上使用 Cloudflare Worker Static Assets + D1，提供完整工具、共享统计和私有需求提交。`server.py` 保留为本地开发服务。GitHub Pages 使用 `docs/` 中的轻量入口跳转到正式站；不再直接发布仓库根目录。部署步骤和作者查看需求的方法见 `DEPLOYMENT.md`。数据库、运行状态和账号凭据不进入仓库或静态资源目录。

## 生成性能

1.0.1：房间背景先尝试最高质量编码，达到 120 KiB 限制即完成；复杂图保留原有完整搜索和严格容量检查，并移除每个输出固定 70ms 的等待。Banner 调整无损编码搜索参数，保留全部 RGBA 像素与透明通道。线上同图样本及真实下载、统计核验见 `VERIFICATION.md`；速度取决于素材与设备，不以降低画质提速。

2026-10-24：房间队列最多同时编码两张图，保留上传顺序；追加/删除复用未修改的两尺寸结果，修改裁切仅失效对应尺寸。失败时等待所有在途编码结束再解锁，首次成功提交后才累计统计。头像框复用已暂停的当前帧，尺寸和素材变化会重新绘制。Banner 并行准备图片/外框/编码器，并使用更快的无损搜索；解码像素与原版一致，测试样例体积增加约 4%–5%。本地三轮中位数：复杂双图 1775→936ms，追加第二张 1711→871ms，头像框导出 17→13ms，Banner 246→135ms。单张房间图原有质量搜索保持不变；实际耗时取决于设备和素材。

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


## 团队 UI Skill · v1.0.1

规范页第17节提供完整 [团队Skill](https://fun-toolkit.pangweishen1.workers.dev/design-system/#team-skill)，源码在 `skills/fun-toolkit-ui/`，发布ZIP位于 `design-system/downloads/fun-toolkit-ui-1.0.1.zip`。包含资源规范1.4.1、可运行模板、最新空态和动效、表单与业务接入规则、团队安装与AGENTS片段、复制/完整性脚本及一次独立Agent真实试做案例。ZIP内容须解压到名为fun-toolkit-ui的目录，不能只保存SKILL.md。

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
