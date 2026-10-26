# Fun Toolkit 工具页模板 · 资源规范 1.4.4

完整复制本目录，打开index.html或用任意本地HTTP服务器预览。无需Node或远程依赖。

本版合入8张空态/占位SVG、feedback-motion基础库、800ms Spinner、1600ms Skeleton，保留中英文、响应式、五态、弹窗和按钮扫光。

演示控制器只演示状态和本地图片预览，不编码文件、不提供真实下载、不接统计。正式工具需把tool-page.js里的simulateGeneration/previewFile替换为实际业务并验证输出。不要只复制index.html。

完整团队Skill、业务接入和验收：https://fun-toolkit.pangweishen1.workers.dev/design-system/#team-skill

下拉框复用 select.css 与 .ft-select：16px 装饰箭头、距右边框16px、文字右内边距44px。保留真实 select 和原生键盘/系统菜单；不要只加padding后继续依赖默认箭头位置。

## 带状态的折叠标题

按实际参数复杂度选用，不要求每个工具添加折叠区。已引入 `disclosure.css`，可以复制以下原生组件；状态文字由业务更新，语言切换只改标题/状态 span 的文字，不给整个 summary 设置 textContent。

```html
<details class="ft-disclosure" open>
  <summary>
    <span class="ft-disclosure-title" data-i18n="verticalFade">上下透明渐变</span>
    <span class="ft-disclosure-actions">
      <span class="ft-disclosure-status" data-state="applied">已应用</span>
      <svg class="ft-disclosure-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4"/></svg>
    </span>
  </summary>
  <!-- 参数内容 -->
</details>
```

标题占弹性剩余空间并允许长英文换行；右侧 actions 不压缩，状态不拆行，状态与 16×16px SVG 箭头在同一垂直中轴，间距 8px。无状态时只移除状态 span，保留 actions 与箭头。summary 至少 44px，整行点击和 Enter/Space 使用原生折叠行为；不要放嵌套按钮，也不要用字符箭头旋转来补视觉基线。展开/收起只绕箭头中心旋转180°，不移动状态。

## 上传空态交互

复用 `upload-surface.css`，容器标记 `ft-upload-zone upload-ready`，样式在页面控件样式之后加载。有素材后移除 `upload-ready`；不要给编辑画布加上传 Hover。默认沿用房间背景的径向浅蓝渐变（#F3F8FF → #E3EEFB），细描边 #D4E4F6。精细指针 Hover 与键盘聚焦改为 #F7FBFF → #DCECFF，2px #8DC3FF 内描边；拖入为 #DCECFF 与3px #2786ED 内描边。焦点另有2px #0071E3 外环、偏移2px。过渡180ms，不缩放、位移插画、文字或画布。

触屏不使用持久 Hover；按下有即时反馈。`aria-busy=true` / `aria-disabled=true` 时取消悬停、拖入与按下高亮，业务防重复选择。减少动态取消过渡；forced-colors采用系统色与可见焦点。无文件时整个上传区可点击，内置原生上传按钮支持Enter/空格并阻止冒泡；容器使用group，避免嵌套button角色。有素材后不再拦截编辑操作。资源库没有上传空态，不套用此背景到Logo选择卡片。
