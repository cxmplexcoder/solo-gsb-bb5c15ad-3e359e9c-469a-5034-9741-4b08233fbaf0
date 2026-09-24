"""差分约束求解：联立事件时间差区间，检测矛盾并给出可行时间线。

每条输入行：事件甲, 事件乙, 最少分钟 lo, 最多分钟 hi
含义：lo <= t(乙) - t(甲) <= hi

改写为标准差分约束（最短路）形式：
    t(乙) - t(甲) <= hi        -> 边 甲 -> 乙，权 hi（上界）
    t(甲) - t(乙) <= -lo       -> 边 乙 -> 甲，权 -lo（下界）

引入指向所有事件、权为 0 的虚拟源（实现上等价于把所有距离初始化为 0），
用 Bellman-Ford 判定：第 N 轮仍可松弛 => 存在负环，即区间互相矛盾。

约束冗余核对（check_redundancy）：删去所选行对应的上、下界两条边后，
在其余约束构成的图上分别求 甲->乙 与 乙->甲 的单源最短路：
    甲->乙 最短路 = 其余约束能推出的 t(乙)-t(甲) 最紧上界（不可达则无界）
    乙->甲 最短路取负 = 其余约束能推出的 t(乙)-t(甲) 最紧下界（不可达则无界）
仅当推导区间 [下界, 上界] 完全落在所选行区间 [lo, hi] 内时判为“可删”。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_INT_RE = re.compile(r"^[+-]?\d+$")


@dataclass(frozen=True)
class Row:
    line: int
    a: str
    b: str
    low: int
    high: int


@dataclass(frozen=True)
class Edge:
    u: int
    v: int
    w: int
    line: int
    kind: str  # "upper"（上界边）或 "lower"（下界边）
    bound: int  # 原始行中的界值（上界为 high，下界为 low）


def _parse_int(token: str, field: str, line: int) -> tuple[int | None, str | None]:
    if not _INT_RE.match(token):
        return None, f"第{line}行：{field}必须是整数分钟，得到 “{token}”"
    return int(token), None


def parse_text(text: str) -> tuple[list[Row], list[dict]]:
    """按行解析与校验。返回 (有效行, 错误列表)。"""
    errors: list[dict] = []
    rows: list[Row] = []

    if not text or not text.strip():
        return rows, [{"line": None, "message": "输入为空：请粘贴“事件甲,事件乙,最少分钟,最多分钟”格式的多行文本。"}]

    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue  # 空行不计入校验，但行号保留为原始行号

        # 兼容中文逗号
        parts = [p.strip() for p in line.replace("，", ",").split(",")]
        if len(parts) != 4:
            errors.append({
                "line": line_no,
                "message": f"第{line_no}行：应为 4 个字段（事件甲,事件乙,最少分钟,最多分钟），实际得到 {len(parts)} 个。",
            })
            continue

        a, b, low_s, high_s = parts
        row_errors: list[str] = []
        if not a:
            row_errors.append("事件甲名称为空")
        if not b:
            row_errors.append("事件乙名称为空")

        low, err_low = _parse_int(low_s, "最少分钟", line_no)
        high, err_high = _parse_int(high_s, "最多分钟", line_no)
        if err_low:
            row_errors.append(err_low.split("：", 1)[1])
        if err_high:
            row_errors.append(err_high.split("：", 1)[1])

        if low is not None and high is not None and low > high:
            row_errors.append(f"下界 {low} 大于上界 {high}，时间差区间为空")

        if row_errors:
            errors.append({"line": line_no, "message": f"第{line_no}行：" + "；".join(row_errors) + "。"})
            continue

        rows.append(Row(line_no, a, b, low, high))  # type: ignore[arg-type]

    return rows, errors


def _edge_step(names: list[str], e: Edge) -> dict:
    """把一条约束边还原为可读步骤：原始行号、方向、所用界（上/下界）与界值。"""
    if e.kind == "upper":
        relation = f"{names[e.v]}−{names[e.u]} ≤ {e.bound}"
        kind_label = "上界（最多）"
    else:
        # 边 v -> u、权 -low 对应 names[v]−names[u] >= low，即 u 事件比 v 事件早至少 low
        relation = f"{names[e.u]}−{names[e.v]} ≥ {e.bound}"
        kind_label = "下界（最少）"
    return {
        "from": names[e.u],
        "to": names[e.v],
        "weight": e.w,
        "line": e.line,
        "kind": e.kind,
        "kind_label": kind_label,
        "bound": e.bound,
        "relation": relation,
    }


def solve(text: str) -> dict:
    rows, errors = parse_text(text)
    if errors:
        return {"status": "error", "errors": errors}

    if not rows:
        return {
            "status": "error",
            "errors": [{"line": None, "message": "没有可联立的有效约束行。"}],
        }

    # 事件按首次出现顺序编号
    names: list[str] = []
    index: dict[str, int] = {}
    for r in rows:
        for name in (r.a, r.b):
            if name not in index:
                index[name] = len(names)
                names.append(name)

    edges: list[Edge] = []
    for r in rows:
        ia, ib = index[r.a], index[r.b]
        edges.append(Edge(ia, ib, r.high, r.line, "upper", r.high))
        edges.append(Edge(ib, ia, -r.low, r.line, "lower", r.low))

    n = len(names)
    dist = [0] * n
    pred: list[tuple[int, Edge] | None] = [None] * n
    last_relaxed: int | None = None

    # Bellman-Ford：共 N 轮，第 N 轮仍可松弛 => 存在负环
    for iteration in range(n):
        relaxed = False
        for e in edges:
            cand = dist[e.u] + e.w
            if cand < dist[e.v]:
                dist[e.v] = cand
                pred[e.v] = (e.u, e)
                relaxed = True
                if iteration == n - 1:
                    last_relaxed = e.v
        if not relaxed:
            break

    if last_relaxed is not None:
        return _conflict_result(names, pred, last_relaxed, n)

    # 平移使最早事件落在第 0 分钟（差值不变，约束全部保留）
    base = min(dist)
    timeline = [
        {"event": names[i], "minute": dist[i] - base}
        for i in range(n)
    ]
    timeline.sort(key=lambda x: (x["minute"], x["event"]))

    differences = [
        {
            "line": r.line,
            "a": r.a,
            "b": r.b,
            "low": r.low,
            "high": r.high,
            "actual": dist[index[r.b]] - dist[index[r.a]],
        }
        for r in rows
    ]

    return {
        "status": "ok",
        "timeline": timeline,
        "differences": differences,
        "event_count": n,
        "line_count": len(rows),
    }


def _conflict_result(names: list[str], pred, start: int, n: int) -> dict:
    """从第 N 轮仍被松弛的顶点出发，沿前驱找回负环并还原为原始行构成的矛盾链。"""
    x = start
    for _ in range(n):
        step = pred[x]
        if step is None:
            break
        x = step[0]

    cycle_edges: list[tuple[int, Edge]] = []
    seen: set[int] = set()
    cur = x
    while cur not in seen:
        seen.add(cur)
        step = pred[cur]
        if step is None:
            break
        pu, e = step
        cycle_edges.append((pu, e))
        cur = pu

    # 沿前驱收集是逆序的，翻转回边的正向（u -> v）
    cycle_edges.reverse()

    steps = [_edge_step(names, e) for _, e in cycle_edges]

    total = sum(s["weight"] for s in steps)
    return {
        "status": "conflict",
        "conflict": {
            "steps": steps,
            "weight_sum": total,
            "closes_to": steps[0]["from"] if steps else None,
        },
    }


def _bellman_ford(names: list[str], edges: list[Edge], source: int) -> tuple[list[int | None], list[tuple[int, Edge] | None]]:
    """单源最短路（调用前已确认无负环）。不可达顶点的距离为 None。"""
    n = len(names)
    dist: list[int | None] = [None] * n
    dist[source] = 0
    pred: list[tuple[int, Edge] | None] = [None] * n

    for _ in range(n - 1):
        relaxed = False
        for e in edges:
            du = dist[e.u]
            if du is None:
                continue
            cand = du + e.w
            if dist[e.v] is None or cand < dist[e.v]:
                dist[e.v] = cand
                pred[e.v] = (e.u, e)
                relaxed = True
        if not relaxed:
            break
    return dist, pred


def _derive_bound(names: list[str], edges: list[Edge], source: int, target: int) -> tuple[int | None, list[dict]]:
    """t(target) − t(source) 的最紧上界及其推导路径（source -> target 最短路）。

    返回 (上界, 路径步骤)；不可达时上界为 None、路径为空（该端点标为无界）。
    source == target 时上界为 0、路径为空（同一事件时间差恒为 0）。
    """
    dist, pred = _bellman_ford(names, edges, source)
    if dist[target] is None:
        return None, []

    path_edges: list[Edge] = []
    cur = target
    while cur != source:
        step = pred[cur]
        if step is None:  # 不可达时不会走到这里，防御性退出
            break
        pu, e = step
        path_edges.append(e)
        cur = pu
    path_edges.reverse()
    return dist[target], [_edge_step(names, e) for e in path_edges]


def check_redundancy(text: str, line: int) -> dict:
    """约束冗余核对：删去第 line 行后，求其余约束对该行两事件时间差的最紧区间。

    输入无效或原约束互相冲突时，直接返回 solve() 的现有求解结果。
    """
    base = solve(text)
    if base["status"] != "ok":
        return base

    rows, _ = parse_text(text)  # solve 已通过，此处必然无校验错误
    target = next((r for r in rows if r.line == line), None)
    if target is None:
        return {
            "status": "error",
            "errors": [{"line": line, "message": f"第{line}行不是一条有效约束行（空行或不存在的行号），无法核对。"}],
        }

    names: list[str] = []
    index: dict[str, int] = {}
    for r in rows:
        for name in (r.a, r.b):
            if name not in index:
                index[name] = len(names)
                names.append(name)

    # 移除所选行对应的上、下界两条约束，其余行照常建边
    edges: list[Edge] = []
    for r in rows:
        if r.line == target.line:
            continue
        ia, ib = index[r.a], index[r.b]
        edges.append(Edge(ia, ib, r.high, r.line, "upper", r.high))
        edges.append(Edge(ib, ia, -r.low, r.line, "lower", r.low))

    ia, ib = index[target.a], index[target.b]
    # 上界：t(乙) − t(甲) 的最紧上界 = 甲 -> 乙 最短路
    high_val, upper_path = _derive_bound(names, edges, ia, ib)
    # 下界：t(甲) − t(乙) 的最紧上界 = 乙 -> 甲 最短路，取负即 t(乙) − t(甲) 的最紧下界
    low_val, lower_path = _derive_bound(names, edges, ib, ia)
    derived_low = -low_val if low_val is not None else None
    derived_high = high_val

    # 推导区间完全落在所选行区间内 <=> 可删；任一端点无界或超出 <=> 必要
    removable = (
        derived_low is not None
        and derived_high is not None
        and derived_low >= target.low
        and derived_high <= target.high
    )

    return {
        "status": "ok",
        "line": target.line,
        "a": target.a,
        "b": target.b,
        "low": target.low,
        "high": target.high,
        "derived_low": derived_low,
        "derived_high": derived_high,
        "lower_bounded": derived_low is not None,
        "upper_bounded": derived_high is not None,
        "lower_path": lower_path,
        "upper_path": upper_path,
        "verdict": "removable" if removable else "necessary",
        "event_count": len(names),
        "line_count": len(rows),
    }
