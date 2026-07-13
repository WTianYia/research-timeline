# PDF 接口设计

## 目标

为时间轴中具有本地 PDF 的论文增加在线阅读入口，并通过 Cloudflare Pages Function 从私有 R2 桶安全输出文件，不把二进制论文塞入 GitHub 仓库。

## 数据范围

- 时间轴论文：86 篇。
- 可映射本地 PDF：81 篇，共约 185.12 MiB。
- 暂缺 PDF：A3、A12、A26、A37、A43；这些论文继续使用 DOI 入口。
- R2 对象键固定为 `papers/<paperId>.pdf`。

## 接口

- 路径：`GET|HEAD /api/papers/:id/pdf`。
- 仅接受 `A` 加数字的论文 ID，拒绝路径穿越和其他键名。
- 支持单段 HTTP Range 请求，返回 `206`、`Content-Range` 和 `Accept-Ranges: bytes`，保证 Chrome PDF 阅读器可按需加载。
- PDF 以内联方式返回；响应带 ETag、缓存头和 `nosniff`。
- 不存在的对象返回 404，R2 未绑定返回 503，非法范围返回 416。

## 前端

- 页面加载 `data/pdf-manifest.json`，为论文补充 `pdfAvailable`。
- 详情页对 81 篇论文显示“阅读 PDF”主按钮，新标签页打开同源 API。
- 5 篇缺失论文保留“访问论文 DOI”按钮，不展示失效 PDF 按钮。

## 部署

- GitHub 只保存接口代码、清单和网站改动。
- Cloudflare R2 桶名为 `tang-research-papers`，Pages 绑定变量名为 `PAPERS_BUCKET`。
- 本地 PDF 通过受控上传脚本写入 R2，不复制进仓库。
- GitHub 推送触发 `research-timeline` Pages 项目部署，最终在 `www.tianyi.ddns-ip.net` 验收。
