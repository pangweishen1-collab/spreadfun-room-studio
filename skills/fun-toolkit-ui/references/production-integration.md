# 现有网站的接入边界

现网三个工具已经通过根目录tool-feedback.css/js适配共享反馈库。原适配层快照在 `assets/production-adapter/`；它识别roomTool/avatarTool/bannerTool、固定状态字段、图片节点及 `design-system/assets/feedback/` 路径。

**新独立页面从Starter接入基础库，不直接导入生产适配层。** Starter使用自己的DOM和状态控制器，生产适配层不会自动注册新工具；硬拷会找不到节点或重置不相关状态。修改原站时保留原业务方法和脚本顺序，把新状态准确映射到UI层，不把业务进度放入纯动效助手。

原站route/hash、全站翻译和统计在toolkit.js、index.html、hub.js及worker服务中分散接入；新增标识需同时更新导航、首页、直接访问路由、翻译与服务端登记。当前共享统计只接受room/avatar/banner，包内不带生产账户、数据库或密钥，也不提供任意事件发送脚本。

原站框架仍有legacy样式；本包tokens是新组件的统一参考，不代表整站所有旧选择器已经改为tokens。局部接入时使用作用域，回归相邻工具，不能因为替换同名全局CSS改变其他页面。

一般内容入场180ms / Y6→0、退场120ms / Y0→3；原站媒体/工具切换适配为160ms纯opacity，避免Canvas命中坐标变化。两者用途不同，不为统一数字强行移动媒体。
