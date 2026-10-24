# Fun Toolkit 工具页模板 · 资源规范 1.4.2

完整复制本目录，打开index.html或用任意本地HTTP服务器预览。无需Node或远程依赖。

本版合入8张空态/占位SVG、feedback-motion基础库、800ms Spinner、1600ms Skeleton，保留中英文、响应式、五态、弹窗和按钮扫光。

演示控制器只演示状态和本地图片预览，不编码文件、不提供真实下载、不接统计。正式工具需把tool-page.js里的simulateGeneration/previewFile替换为实际业务并验证输出。不要只复制index.html。

完整团队Skill、业务接入和验收：https://fun-toolkit.pangweishen1.workers.dev/design-system/#team-skill

下拉框复用 select.css 与 .ft-select：16px 装饰箭头、距右边框16px、文字右内边距44px。保留真实 select 和原生键盘/系统菜单；不要只加padding后继续依赖默认箭头位置。
