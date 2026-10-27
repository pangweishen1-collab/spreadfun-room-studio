# Fun Toolkit 继续开发说明

当前项目已从单一 Room Studio 升级为乐趣运营工作台，包含聚合首页、五个生产工具、资源库和共享统计页。最新说明见 `README.md`，验证记录见 `VERIFICATION.md`。

## 当前唯一入口

开发 `index.html`、`toolkit.js`、`banner.js`、`banner-webp.js`、`hub.js`、`hub.css`、`home.css`、`tokens.css` 和 `toolkit.css`。首页视觉限定在 `#homeTool`，使用本地 WebP 插画；统计与弹窗的共享样式仍在 `hub.css`。`server.py` 提供统计和需求 API，数据库必须放在静态站点目录外。SVGA 与 WebP 依赖保存在 `vendor/`，用户素材仍在浏览器本地处理。

旧 `Room BG Studio.html` 仅用于跳转，不再是开发主文件。`GitHub-Pages/` 保留交接时的旧发布快照，未同步 Toolkit。

## 运行和检查

双击 `start-preview.command`，或在本目录运行 `python3 server.py --host 127.0.0.1 --port 8765`（Python 3.9+）。不要用普通静态服务器替代，否则统计与需求接口不可用。

浏览器打开 `http://127.0.0.1:8765/index.html`。默认进入 `#home` 聚合首页（Logo 也进入首页）；`#statistics` 为共享统计。工具使用 `#room-backgrounds`、`#avatar-frames`、`#banners`、`#gift-previews`、`#vap-tools` 和 `#resources`，支持直接进入及浏览器前进/后退并保留工具会话。统计标识对应 `room`、`avatar`、`banner`、`gift`、`vap`、`resources`。

运行 `node tests/regression.cjs`、`node tests/toolkit.cjs`、`node tests/banner.cjs`，并对 `toolkit.js`、`banner.js` 和 `banner-webp.js` 运行 `node --check`。无损编码变更另运行 `node tests/lossless-webp.cjs`（需要 Python / Pillow，路径可用 `BANNER_TEST_PYTHON` 指定）。有 UI 改动时再检查桌面和 `tests/responsive.html`，自动检查不能代替视觉检查。

首页、统计或需求改动另运行 `node tests/hub.cjs`、`node --check hub.js` 和 `python3 tests/server_test.py`。后端测试与浏览器验收使用独立数据库，不向正式累计写入样本。默认 macOS 数据位于 `~/Library/Application Support/Fun Toolkit/`；不要将其打包或放入网站目录。作者可双击 `view-requests.command` 查看需求。

## 当前功能

- 房间背景：两种 WebP 尺寸、独立裁切、120 KiB 大图限制、单图和 ZIP。
- 头像框：SVGA 动画、本地文件选择或整页拖放、暂停、帧号/时间轴/逐帧控制；当前帧导出透明 WebP，默认 240 × 240，正方形比例锁定，16–2048 px。
- Banner：772 × 200 房间图、684 × 240 游戏图，游戏内图 645 × 201，使用 `assets/game-banner-frame.webp` 保留外框；通过本地 `vendor/webp/` 编码器生成无损 WebP 和两图 ZIP。原图尺寸不足时提示放大可能模糊。`tests/lossless-webp.cjs` 可核验生产 helper 的实际 RGBA 保真。
- 统一语言与工具导航，工具切换保留当前会话的工作。
- 首页文案围绕“专为乐趣运营而生”，提供工具入口、真实统计与私有需求提交。生成按成功文件数计，下载按有效发起操作计，ZIP 计一次；不迁移本机历史，不推算用户人数。

## 发布边界

用户已于 2026-10-23 明确授权发布。正式站为 https://fun-toolkit.pangweishen1.workers.dev，源码使用原 GitHub 仓库 pangweishen1-collab/spreadfun-room-studio。线上为 Worker + D1，本地继续使用 Python + SQLite，二者数据隔离。

线上发布执行 `pnpm install --frozen-lockfile`、`pnpm build`、检查和 `pnpm deploy`。`scripts/build-site.mjs` 只向 `dist/` 复制公开资源，Worker 入口为 `worker/index.mjs`，数据库迁移在 `migrations/`。GitHub Pages 必须保持 main 分支 `/docs`，避免把私有服务文件当静态资源发布。完整步骤见 `DEPLOYMENT.md`。
