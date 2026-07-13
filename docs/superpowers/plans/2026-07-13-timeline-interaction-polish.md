# Timeline Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This run stays inline and deliberately creates no commit.

**Goal:** 完成研究时间线的二维缩放、万向拖拽、动态泳道、工具栏位置和详情切换微调。

**Architecture:** 将可测试的泳道高度、二维缩放和节点切换逻辑放入 `timeline-core.js`；DOM 事件只负责把纯函数结果写回状态与滚动容器。CSS 只调整工具栏定位和详情粘滞层。

**Tech Stack:** 原生 JavaScript ES Modules、SVG、CSS、Node 内置测试、Chrome。

---

### Task 1: 纯交互计算

**Files:** `tests/timeline-core.test.js`, `js/timeline-core.js`

- [ ] 先增加失败测试：少量论文泳道更矮、二维缩放同时改变年份跨度和纵向倍率、重复选择返回关闭状态。
- [ ] 运行 `npm test`，确认因导出函数缺失而失败。
- [ ] 实现 `computeLaneHeights`、`zoomViewport2D`、`togglePaperSelection`。
- [ ] 运行 `npm test`，确认全部通过。

### Task 2: 时间线状态与渲染

**Files:** `js/timeline.js`

- [ ] 增加 `verticalScale`，用动态泳道高度数组计算 SVG 总高度和节点中心。
- [ ] 默认不选择任何标题卡片；只给主动选择节点渲染标题卡片。
- [ ] 滚轮调用二维缩放函数；拖拽同时更新年份视窗和 `timelineScroll.scrollTop`。
- [ ] 同一节点重复点击时调用关闭详情逻辑。

### Task 3: 工具栏与详情面板

**Files:** `css/style.css`, `index.html`

- [ ] 工具栏改为右下角横向浮层。
- [ ] 详情面板改为容器滚动，详情头部设置粘滞定位和不透明背景。
- [ ] 更新静态资源版本参数，避免本地 Chrome 使用旧缓存。

### Task 4: 本地回归验证

**Files:** `design-qa.md`

- [ ] 运行 `npm test`、`npm run check`、`git diff --check`。
- [ ] 在本地 Chrome 验证六项交互和浏览器错误日志。
- [ ] 更新 `design-qa.md`，保留改动为未提交状态。

### Task 5: 第二轮滚动与首屏适配

**Files:** `tests/timeline-core.test.js`, `js/timeline-core.js`, `js/timeline.js`, `index.html`, `css/style.css`

- [ ] 先为六泳道高度适配函数增加失败测试，再实现纯函数。
- [ ] 移除画布滚轮缩放监听，让浏览器原生滚轮只控制画布纵向滚动。
- [ ] 首次加载、重置及适配按钮按画布可用高度计算纵向比例。
- [ ] 将侧栏内容包入独立滚动容器，图例固定在侧栏底部。
- [ ] 使用本机 Chrome 验证首屏六泳道、按钮缩放、滚轮滚动和侧栏图例。
