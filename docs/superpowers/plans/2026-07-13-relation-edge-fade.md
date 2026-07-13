# Relation Edge Fade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让论文节点和关系线在横向拖出泳道绘图区时同步渐隐并同时停止渲染。

**Architecture:** 在 `timeline-core.js` 中提供可独立测试的水平边缘可见度函数；`timeline.js` 让节点和关系线共享同一计算结果；CSS 将现有状态透明度与边缘透明度相乘。

**Tech Stack:** 原生 JavaScript、SVG、CSS、Node.js 内置测试运行器、本机 Chrome。

---

### Task 1: 边缘可见度计算

**Files:**
- Modify: `tests/timeline-core.test.js`
- Modify: `js/timeline-core.js`

- [x] 在测试中导入 `horizontalEdgeOpacity` 和 `relationEdgeOpacity`，覆盖内部值 1、缓冲区线性值、外部值 0，以及关系线取两端最小值。
- [x] 运行 `npm test`，确认因导出缺失而失败。
- [x] 在 `timeline-core.js` 实现两个纯函数。
- [x] 再次运行 `npm test`，确认新增测试通过。

### Task 2: SVG 与 CSS 同步渐隐

**Files:**
- Modify: `js/timeline.js`
- Modify: `css/style.css`

- [x] 在节点绘制时计算边缘透明度，为 0 时跳过，并写入 `--edge-opacity`。
- [x] 在关系线绘制时计算两个端点的关系透明度，为 0 时跳过，并写入同一 CSS 变量。
- [x] 将普通、高亮、弱化节点与线条的透明度改为基础透明度乘以 `--edge-opacity`。

### Task 3: 验证

**Files:**
- Modify: `design-qa.md`

- [x] 运行 `npm test`、`npm run check` 和 `git diff --check`。
- [x] 用本机 Chrome 横向移动画布，核对边缘节点和关系线同步渐隐。
- [x] 在 `design-qa.md` 记录浏览器证据与最终结果，不提交、不推送、不部署。
