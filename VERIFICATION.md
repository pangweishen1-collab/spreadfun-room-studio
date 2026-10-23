# Toolkit 本地验收 · 2026-10-23

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
