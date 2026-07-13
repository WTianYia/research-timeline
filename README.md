# 唐玉超教授研究工作时间轴

一个无前端框架的交互式学术时间轴。页面从 `data/papers.csv` 读取论文数据，以研究方向为泳道，展示论文节点、方法继承关系和自动生成的阶段总结。

## 本地运行

在项目目录执行：

```powershell
python -m http.server 8765
```

浏览器打开 `http://127.0.0.1:8765/`。由于浏览器安全策略限制，不能直接双击 `index.html` 读取 CSV。

## 数据字段

`papers.csv` 包含：`id, year, title, journal, authors, keywords, summary, direction, type, importance, representative, parent_id, doi`。

- `direction` 必须对应 `data/directions.json` 中的方向 ID。
- `type` 支持 `theory`、`extension`、`algorithm`、`application`。
- `importance` 建议取 1–5，控制节点大小。
- `representative` 为 `true` 时纳入“仅显示代表作”。
- `parent_id` 可填写一篇或多篇父论文 ID，多项使用 `|` 分隔。

## 交互

- 鼠标滚轮围绕指针位置横向缩放。
- 在时间轴空白处按住鼠标拖动以平移。
- 顶部可按研究方向筛选、关键词搜索及仅显示代表作。
- 节点悬停显示完整书目信息与工作摘要。
- 可将当前筛选和视图导出为 SVG 或 PNG。

## 数据口径

数据由本地核验文献清单生成。方向、论文类型、重要性和继承关系属于研究脉络分析字段，便于可视化，不替代作者本人对研究成果的正式分类。
