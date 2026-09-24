# 口述史事件时间线核对

供口述史整理者核对多个事件“先后描述”是否自洽的小工具。整理者把访谈中得到的两事件时间差区间逐行粘贴，后端把全部区间联立为**差分约束系统**：

- 若约束互相矛盾，返回一条由**原始行号与对应上下界**构成的**闭合矛盾链**（负环），说明是哪几句话“打了架”；
- 若无矛盾，返回一条以**最早事件为第 0 分钟**、满足全部区间的可行时间线，并逐条核对每个区间；
- **约束冗余核对**：任选一条原始行，删去该行对应的上、下界约束后，求其余约束对这两个事件时间差的**最紧下界与上界**——推不出的端点标为**无界**，有界端点给出**推导路径、原始行号与所用界值**；仅当推导区间完全落在所选行区间内时判为**“可删”**，否则标为**“必要”**；
- **两版比较**：分别粘贴**基准文本**与**修订文本**，后端对两版**各自独立校验、独立联立**后按事件名对齐，返回共同事件的基准/修订时刻与**变化分钟数**、**导致变化的修订行号**（复用冗余核对同款最短路推导，给出每环修订行号、所用界及该行相对基准是“已修改/新增/区间未改”的证据链），并列出修订版的**新增事件**与**删除事件**；任一版无效或互相矛盾时，分别返回该版错误或闭合矛盾链，**不生成任何差异结论**。

技术栈：Python 3.11 + FastAPI + 原生 JavaScript（无前端构建、无 npm）。

## 输入格式

每行一条：

```
事件甲,事件乙,最少分钟,最多分钟
```

含义：`最少分钟 ≤ 事件乙时刻 − 事件甲时刻 ≤ 最多分钟`（即“乙比甲晚”的时间差区间，分钟为整数；允许负数表示乙实际更早）。

- 支持半角 `,` 与中文逗号 `，`；
- 空行会被跳过，但**行号按原始文本计算**，矛盾链与错误提示引用的都是原始行号；
- 每行校验：事件名非空、上下界为整数、下界不大于上界。

示例（无冲突）：

```
起床,洗漱,10,30
洗漱,早饭,15,45
早饭,出门,20,60
出门,开会,40,90
起床,开会,80,240
```

页面上可一键填充“可行示例”与“矛盾示例”。

## 约束冗余核对

整理者在文本中**任选一条原始行**，后端删去该行对应的上、下界两条约束后，在其余约束上求这两个事件时间差的**最紧下界与上界**：

- 推不出的端点标为**无界**（`null`）；
- 有界端点给出**推导路径**：路径上每一环都标注**原始行号、所用界（上界/下界）与界值**；
- 判定规则：推导区间**完全落在**所选行区间内（推导下界 ≥ 原下界 且 推导上界 ≤ 原上界）⇒ **可删**；任一端点无界或超出 ⇒ **必要**；
- 输入无效或原约束互相冲突时，接口直接返回现有 `/api/solve` 的求解结果（错误列表或矛盾链）。

页面操作：粘贴文本后，在“约束冗余核对”区的下拉框中选择一条原始行（选项即原始行号与行内容），点击**“核对所选行”**，下方即显示结论横幅（可删/必要）、区间对比表与两个端点的推导路径链图及明细表。

示例：点“填入可行示例”后，第 5 行 `起床,开会,80,240` 与第 6 行 `起床,早饭,25,90` 均会被判为**可删**（第 5 行由第 1–4 行推出 [85, 225] ⊆ [80, 240]）；第 1–4 行则为**必要**。

## 两版比较

整理者把口述稿的**基准版**与**修订版**区间文本分别粘贴到两个文本框，点击**“比较两版”**。后端对两版**完全独立**地执行现有解析与联立求解（复用同一套 `parse_text` 与 Bellman-Ford 逻辑），再按**事件名对齐**：

- **共同事件**：给出基准时刻、修订时刻与**变化分钟数**（正数为推迟、负数为提前、0 为未变）；
- **导致变化的修订行**：对每个分钟发生变化的共同事件，复用冗余核对同款**最短路推导**（修订版中从第 0 分钟锚点事件到该事件的最紧上界 / 反向最短路取负的最紧下界，规范化可行解恰好顶在其中一个紧界上），把推出修订时刻的路径作为证据——路径上每环都标注**修订行原始行号、所用界（上界/下界）与界值**，并标注该行相对基准是**“已修改 / 新增 / 区间未改”**；
- **新增 / 删除事件**：仅修订版出现的事件标为**新增**（列出修订时刻），仅基准版出现的事件标为**删除**（列出基准时刻）；
- **第 0 分钟锚点**：两版优先取**共有的第 0 分钟事件**作锚点，使共同事件的变化分钟数不夹带整体平移；若两版零分钟事件没有交集（页面给出提示），与锚点分属互不连通事件组件的事件标为**“不可比”**，其分钟差只是各组件独立归零的假象，不计为变化；
- **失败不产生差异**：任一版校验无效（逐行错误）或存在闭合矛盾链（负环）时，接口返回 `status: "invalid"`，在 `base` / `revised` 字段中**分别**带回该版与 `/api/solve` 完全相同的错误列表或矛盾链，页面左右两栏分别展示，**不生成对齐表或差异结论**；
- 任一输入框内容变化时，页面立即**清空旧的比较结果**，避免展示与输入不一致的结论。

页面操作：在“两版比较”区两个文本框中分别粘贴（或点**“填入两版示例”**），点击**“比较两版”**；下方显示统计横幅、**事件对齐表**（类型 / 事件 / 基准时刻 / 修订时刻 / 变化分钟 / 导致变化的修订行号）以及每个变化事件的**变更行证据**卡片（推导路径链图 + 明细表）。

接口用法（curl）：

```bash
curl -X POST http://localhost:8080/api/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "base": "起床,洗漱,10,30\n洗漱,早饭,15,45",
    "revised": "起床,洗漱,15,35\n洗漱,早饭,20,50"
  }'
```

返回（节选）：

```json
{
  "status": "ok",
  "base":    { "event_count": 3, "line_count": 2, "anchor": "起床" },
  "revised": { "event_count": 3, "line_count": 2, "anchor": "起床" },
  "anchor_shifted": false,
  "changed_count": 2, "added_count": 0, "removed_count": 0, "incomparable_count": 0,
  "alignment": [
    { "kind": "common", "event": "起床", "base_minute": 0,  "revised_minute": 0,  "delta": 0,  "evidence": null },
    { "kind": "common", "event": "洗漱", "base_minute": 10, "revised_minute": 15, "delta": 5,
      "evidence": { "direction": "lower", "bound": 15, "lines": [1], "path": [ /* 第1行下界 15 的推导环，含 change 标记 */ ] } },
    { "kind": "added",   "event": "午休", "base_minute": null, "revised_minute": 115, "delta": null, "evidence": null },
    { "kind": "removed", "event": "出门", "base_minute": 45,   "revised_minute": null, "delta": null, "evidence": null },
    { "kind": "incomparable", "event": "散会", "base_minute": 0, "revised_minute": 10, "delta": 10, "evidence": null }
  ]
}
```

任一版失败时：

```json
{
  "status": "invalid",
  "base":    { "status": "error",    "errors": [ { "line": 2, "message": "第2行：…" } ] },
  "revised": { "status": "conflict", "conflict": { "steps": [ /* 与 /api/solve 相同的闭合矛盾链 */ ], "weight_sum": -95, "closes_to": "…" } }
}
```

## 单条启动命令（Docker Compose）

```bash
docker compose up -d --build
```

启动后打开浏览器访问：

**http://localhost:8080**

> 页面地址与端口固定为 **8080**。如宿主机 8080 被占用，修改 `compose.yaml` 中 `ports` 的左侧值（如 `"9090:8080"`）即可，容器内端口保持 8080。

停止：

```bash
docker compose down
```

查看日志：

```bash
docker compose logs -f
```

## 不用 Compose 的等价启动方式

```bash
docker build -t oral-history-timeline .
docker run -d --name oral-history-timeline -p 8080:8080 oral-history-timeline
```

## 本地开发运行（不使用容器）

需要 Python 3.11+：

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## 必要配置（环境变量）

均为可选项，默认值即可正常使用：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `PORT` | `8080` | 服务监听端口（容器内固定暴露 8080） |

## 原理简介

对每行 `甲,乙,lo,hi` 建立两条最短路约束：

- `t乙 − t甲 ≤ hi`：边 `甲 → 乙`，权 `hi`（上界）
- `t甲 − t乙 ≤ −lo`：边 `乙 → 甲`，权 `−lo`（下界）

再加一个指向所有事件、权为 0 的虚拟源（实现上等价于所有距离初始化为 0），运行 Bellman-Ford：

- 第 N 轮仍能松弛 ⇒ 存在负环，沿前驱指针还原负环，并映射回每条边的**原始行号与上/下界值**，即页面展示的闭合矛盾链（环上权值之和 < 0，意味着推出 `0 < 0` 式的矛盾）；
- 否则得到一组可行时刻，整体平移令最小值为 0，即为“最早事件在第 0 分钟”的时间线。

**冗余核对的推导**：删去所选行的两条边后，以单源 Bellman-Ford 求最短路——

- `甲 → 乙` 最短路 = 其余约束能推出的 `t乙 − t甲` **最紧上界**（不可达 ⇒ 上界无界）；
- `乙 → 甲` 最短路取负 = 其余约束能推出的 `t乙 − t甲` **最紧下界**（不可达 ⇒ 下界无界）；
- 最短路经前驱指针还原为推导路径，路径上每条边映射回**原始行号与所用界值**，作为页面展示的证据。

**两版比较的对齐与证据**：两版文本分别走同一套“解析 → Bellman-Ford → 平移归零”流程，得到各事件规范化时刻后按事件名对齐求差；分钟变化事件的证据直接复用上述界推导——从修订版第 0 分钟锚点事件出发的两条最短路给出最紧上/下界，取与规范化时刻相等的那个紧界路径，路径上的修订行号即**导致变化的修订行**；任一版错误或负环时短路返回该版结果，不构造对齐结论。

## API

- `GET /` — 页面
- `GET /api/health` — 健康检查
- `POST /api/solve` — 请求体 `{"text": "甲,乙,30,60\n..."}`，返回：
  - `status: "ok"`：`timeline`（事件与分钟）、`differences`（逐条核对）；
  - `status: "conflict"`：`conflict.steps`（矛盾链每一环的行号、方向、上/下界与含义）；
  - `status: "error"`：`errors`（逐行校验错误，含原始行号）。
- `POST /api/redundancy` — 请求体 `{"text": "...", "line": 5}`（`line` 为原始行号），返回：
  - `status: "ok"`：`verdict`（`"removable"` 可删 / `"necessary"` 必要）、所选行 `a/b/low/high`、推导区间 `derived_low/derived_high`（无界端点为 `null`，另有 `lower_bounded/upper_bounded` 布尔标记）、有界端点的推导路径 `lower_path/upper_path`（每环含 `line` 原始行号、`kind`/`kind_label` 所用界、`bound` 界值、`relation` 含义）；
  - `status: "conflict"` / `status: "error"`：与 `/api/solve` 完全相同的现有求解结果（原约束冲突或输入无效时沿用）。
- `POST /api/compare` — 请求体 `{"base": "...", "revised": "..."}`，两版各自独立解析与联立：
  - `status: "ok"`：`base`/`revised` 各含 `event_count/line_count/anchor`（第 0 分钟锚点事件），`anchor_shifted`（两版锚点是否不同），计数 `common_count/changed_count/added_count/removed_count/incomparable_count`，以及 `alignment` 对齐列表（每项 `kind` 为 `common`/`added`/`removed`/`incomparable`，含 `event`、`base_minute`、`revised_minute`、`delta`；分钟变化的共同事件另带 `evidence`：`direction`（顶在上界还是下界）、`bound`（紧界值）、`lines`（导致变化的修订行号，去重保序）、`path`（推导路径每环的行号、所用界、界值、含义及 `change`：`added`/`changed`/`unchanged`））；
  - `status: "invalid"`：不生成差异结论；`base`/`revised` 分别为该版完整求解结果——`status: "error"` 带逐行 `errors`（含原始行号），或 `status: "conflict"` 带闭合矛盾链；另一版若可解则带与 `/api/solve` 相同的 `timeline/differences`。

## 项目结构

```
.
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI 入口
│   └── solver.py        # 解析、校验、Bellman-Ford 联立、矛盾链还原、冗余核对与两版比较
├── static/
│   ├── index.html
│   ├── app.js           # 原生 JS
│   └── style.css
├── Dockerfile
├── compose.yaml
├── docker-entrypoint.sh
└── requirements.txt
```
