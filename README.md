# 点卯 Dianmao

一日航道式的日程工作台。纯前端、无后端，数据只存在你自己的设备上。

网址：`https://little-fish-ccc.github.io/workbuddy-all/`

## 它是什么

一天是一条河，从 00:00 顺流到 24:00。

- **航程**：有持续时间的事，在航道图上占一段长度，能看出时间撞不撞车
- **航标**：只设开始时刻的事，钉在那一行，不占长度
- **打勾**：块右上角方框，或航标右侧的勾
- **月历**：看哪天有活，按总时长分四档深浅；点任意日期进入那天的航道

### 一句话拆成多条

标题里用**逗号、顿号、分号、竖线或换行**隔开，会自动拆成子任务：

```
起床，先喂猫，刷牙洗脸，出门买菜   →   4 条，各自可勾
```

- 编辑器里会即时列出识别结果，可逐条改文字、删条目、点「＋ 加一条」
- 认错了就点「合并成一条」，恢复成原来那句
- 块里按可用高度显示能放下的条数，时间行给出 `2/6` 这样的进度；点开看全部
- 点某一条只勾那一条；点块右上角的勾＝整组全勾／全取消
- 全部勾完，父任务自动变成已完成

### 长标题会折行

块的高度＝时长，空间够就往下折行把话说完（最多 6 行）；15–30 分钟的矮块只留一行，点开看全。

## 目录

```
index.html          单页骨架，所有资源引用带 ?v=
css/style.css
js/store.js         数据层（localStorage + IndexedDB 附件）
js/lane.js          航道布局计算（重叠分簇、贪心分列）
js/view-day.js      一日航道
js/view-month.js    月历
js/view-editor.js   事项编辑抽屉
js/remind.js        提醒调度
js/app.js           入口、路由、设置
manifest.json       PWA
sw.js               Service Worker（预缓存全部资源）
icons/              图标
tests/smoke.mjs     jsdom 冒烟测试
```

## 数据

| 存哪 | 键 | 内容 |
|---|---|---|
| localStorage | `dianmao_db_v1` | 任务、领域、设置 |
| IndexedDB | `dianmao_fs` / `files` | 事项附图（dataURL） |

数据按**域名**隔离。换仓库名＝换网址＝数据从零开始，所以仓库名一旦定了就别改。

备份：设置 → 导出备份，会生成一个把图片内联进去的 JSON。

## 版本号规则

改完代码要做两件事，缺一不可：

1. `index.html` 里所有 `?v=20261115a` 改成新版本（字母递增，如 `20261113b`）
2. `sw.js` 第一行 `VERSION` 改成同一个值

测试会校验这两处是否一致。

## 本地跑

```bash
npm install
npm test                    # jsdom 冒烟，91 项
python3 -m http.server 8787 # 然后开 http://localhost:8787/
```

## 推送

```bash
git add -A && git commit -m "说明"
git push origin main
```

GitHub Pages 一般 30–60 秒生效。手机上如果还是旧版，多半是 Service Worker 缓存：
关掉页面重进，或在浏览器设置里清一次站点数据。
