> 历史记录：下文对应升级 Toolkit 前的第一批修复。当前入口与文件组织请以 README.md 为准；Room BG Studio.html 现为跳转入口。

# 本地修复记录 · 2026-10-23

基于交接包 v1.1。只修改本地开发主文件 `Room BG Studio.html`；未发布，`GitHub-Pages/index.html` 保留收到时的发布快照。

## 已修复

- 每个输出按钮定位到自己的原图；每张图片的两种输出尺寸独立保存裁切位置。
- 应用裁切只重新生成所选输出，同时更新大图合成预览和 ZIP；其他输出保持原字节。未改变位置时不重新生成或累计计数。
- 裁切编码失败时保留原文件、原裁切和可下载 ZIP。
- 上传前读取并校验图片，跳过损坏和不支持的文件并显示名称；正常图片继续处理。异步处理前复制 FileList，防止清空上传控件时丢失后续文件。
- 生成和导入过程中禁用相关操作，防止重复操作改变队列。
- 删除后同步输出数、任务数和上传空状态。
- 缩略图复用文件地址；重新生成时正确失效和延迟回收旧地址，避免语言切换反复创建地址或当前文件稍后失效。
- 使用原生裁切弹窗，支持焦点限制、Esc 关闭和滑块标签；保留减少动态效果偏好。
- 延续原界面，补充窄屏单列布局，修复强制 1080px 页面宽度和统计卡片定位问题。
- 上传后提供可见的“继续添加背景图”按钮。
- 重置新一轮生成的进度文字，避免显示上一批的完成信息。

## 实际验证

- Node 标准库回归检查：`node tests/regression.cjs`。
- 浏览器实际选择两张 WebP 和一张损坏 PNG：生成四个输出，提示跳过损坏文件。
- 浏览器编辑第二张大图，下载修改前后 ZIP：只有 `Bg02.webp` 字节发生变化，其他三个文件不变。
- 解码实际下载的四个文件：格式均为 WebP，尺寸为 720 × 1560 或 300 × 480；两张大图均不超过 122880 字节（120 × 1024）。ZIP 完整性通过。
- 中文/英文切换、追加上传、单图下载、ZIP 下载、案例/联系弹窗及删除清空均已操作检查。
- 390 × 844 iframe 中检查实际窄屏布局及中文裁切弹窗，页面内容宽度等于 390px，无横向溢出。不是实体手机测试。
- 浏览器控制台检查未出现 JavaScript 错误。

## 本地运行

双击 `Room BG Studio.html`，或在项目目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8765/Room%20BG%20Studio.html`。窄屏检查页为 `/tests/responsive.html`。

本次浏览器验证使用本地 HTTP；自动化浏览器不允许 file 协议，双击离线打开未在该浏览器中复测。累计产图数属于浏览器和访问来源，本地 HTTP、离线文件与线上站点的数据不共享。

## 发布边界

尚未同步发布目录，也未提交、推送 GitHub 或部署。需要发布时先将主文件同步为 `GitHub-Pages/index.html`，再按交接说明发布与验收。

旧 JXA 检查依赖原设备的固定路径，已改用项目相对路径的 Node 回归脚本。原始交接 ZIP 保持原样。


## 2026-10-26 · VAP invisible RGB cleanup (local, after 1.3.0)

The user-provided Pakistan reference visibly blacks out fully clear areas in RGB as well as storing Alpha. Previous exports retained hidden RGB in these areas, so ordinary-player views did not expose mask bounds. The local engine now clears RGB only at exact full-resolution Alpha=0; partial RGB stays straight and the independent Alpha plane is unchanged. Native opaque conversion caches a binary full-size clearing surface and avoids per-frame JS readback. Player and third-party SDK files remain unchanged. 23 regression suites, Pages build, independent review, actual browser export, decoded color/Alpha checks, QuickTime and Tencent Web playback passed. The verification sample reconstructed from the older packed file is 720×1560, 24 FPS, 2,457,569 bytes; it is not a replacement for testing the original source. Production remains v1.3.0 until a separate release.


## 2026-10-26 · Continuous RGB feather (supersedes clear-only default; local)

The user rejected the hard RGB boundary of the clear-only sample. The UI now defaults to synchronized RGB/Alpha feather: RGB is weighted by the final continuous full-resolution alpha; independent Alpha remains continuous. Cached native masking avoids per-frame JS readback. The embedded namespaced rgbAlphaMode marker configures WebGL premultiplied composition and prevents a second alpha multiplication on this website. Advanced settings retain straight RGB for SDKs requiring SourceAlpha blending; engine API default and unmarked historical resources retain straight behavior. Do not claim all native SDKs accept the new reference-style default without target-device checks.

23 regression suites, independent review, actual UI encoding, 0/4/8-second RGB curve/composite analysis, QuickTime soft-edge playback, main and inspector White/checker playback, and Pages build passed. Sample is 720×1560 at24fps, 2,454,702 bytes, reconstructed from old packed RGB for visual verification; not the untouched source. Production remains unchanged until release authorization. Evidence is outside the public source under outputs/vap-feather-verification.
