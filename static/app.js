"use strict";

const EXAMPLE_OK = [
  "起床,洗漱,10,30",
  "洗漱,早饭,15,45",
  "早饭,出门,20,60",
  "出门,开会,40,90",
  "起床,开会,80,240",
  "起床,早饭,25,90",
].join("\n");

// 矛盾示例：
// 1) 开会比早饭晚 30~60；2) 晚饭比开会晚 45~90；3) 早饭比晚饭晚 20~50
// 三式相加 0 <= 95~200 与第三式给出的“晚饭早于早饭”冲突，构成闭合负环。
const EXAMPLE_CONFLICT = [
  "早饭,开会,30,60",
  "开会,晚饭,45,90",
  "晚饭,早饭,20,50",
].join("\n");

const $ = (id) => document.getElementById(id);
const resultEl = $("result");
const redundancyEl = $("redundancy-result");
const inputEl = $("input");
const lineSelect = $("redundancy-line");

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderErrors(errors, target = resultEl) {
  const items = errors.map((e) =>
    `<li>${esc(e.message)}</li>`
  ).join("");
  target.innerHTML = `
    <div class="banner err">
      <h2>输入校验未通过</h2>
      <p>请修正下列问题后重新联立（行号对应文本框中的原始行号）：</p>
    </div>
    <div class="card"><ul class="plain">${items}</ul></div>`;
}

function renderOk(data) {
  const rows = data.timeline.map((t) =>
    `<tr><td>${esc(t.event)}</td><td class="num">${t.minute}</td></tr>`
  ).join("");

  const maxMinute = Math.max(...data.timeline.map((t) => t.minute));
  const points = data.timeline.map((t) => `
    <div class="tl-point">
      <div class="tl-dot"></div>
      <div class="tl-name">${esc(t.event)}</div>
      <div class="tl-time">第 ${t.minute} 分钟</div>
    </div>`).join("");

  const checks = data.differences.map((d) => {
    const fit = d.low <= d.actual && d.actual <= d.high;
    return `<tr>
      <td class="num">${d.line}</td>
      <td>${esc(d.a)} → ${esc(d.b)}</td>
      <td class="num">[${d.low}, ${d.high}]</td>
      <td class="num">${d.actual}</td>
      <td>${fit ? '<span class="ok-text">满足</span>' : '<span style="color:var(--err)">不满足</span>'}</td>
    </tr>`;
  }).join("");

  resultEl.innerHTML = `
    <div class="banner ok">
      <h2>✓ 区间无冲突</h2>
      <p>共 ${data.event_count} 个事件、${data.line_count} 条约束；以下时间线以最早事件为第 0 分钟，且满足全部区间。</p>
    </div>
    <div class="card">
      <h3>可行时间线</h3>
      <div class="timeline-track">
        <div class="tl-line"></div>
        <div class="tl-grid">${points}</div>
      </div>
      <table>
        <thead><tr><th>事件</th><th class="num">分钟（最早事件 = 0）</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted">时间跨度：0 ~ ${maxMinute} 分钟。所有事件可整体平移，差值不变。</p>
    </div>
    <div class="card">
      <h3>逐条核对</h3>
      <table>
        <thead><tr>
          <th class="num">行号</th><th>事件对</th><th class="num">要求区间</th>
          <th class="num">本时间线差值</th><th>结果</th>
        </tr></thead>
        <tbody>${checks}</tbody>
      </table>
    </div>`;
}

function renderConflict(data, target = resultEl) {
  const c = data.conflict;
  const steps = c.steps;

  // 链式图：事件节点 + 行号/界值标注，最后回到起点形成闭合环
  const parts = [];
  steps.forEach((s, i) => {
    if (i === 0) parts.push(`<div class="chain-node">${esc(s.from)}</div>`);
    parts.push(`
      <div class="chain-edge">
        <span class="tag ${s.kind}">第 ${s.line} 行 · ${esc(s.kind_label)} ${s.bound}</span>
        <span class="rel">${esc(s.relation)}</span>
        <span class="chain-arrow">→</span>
      </div>
      <div class="chain-node">${esc(s.to)}</div>`);
  });
  parts.push(`
    <div class="chain-edge">
      <span class="muted">闭合回到</span>
      <span class="chain-arrow">⟲</span>
    </div>
    <div class="chain-node">${esc(c.closes_to)}</div>`);

  const detailRows = steps.map((s) => `
    <tr>
      <td class="num">${s.line}</td>
      <td>${esc(s.from)} → ${esc(s.to)}</td>
      <td><span class="tag ${s.kind}">${esc(s.kind_label)}</span></td>
      <td class="num">${s.bound}</td>
      <td>${esc(s.relation)}</td>
    </tr>`).join("");

  target.innerHTML = `
    <div class="banner conflict">
      <h2>✗ 区间存在冲突（闭合矛盾链）</h2>
      <p>下列 ${steps.length} 条原始行首尾相接形成闭合环，环上界值相加为负数
      （<strong>${c.weight_sum} &lt; 0</strong>），即推出“某事件必须早于自己”，无任何时间线可同时满足。</p>
    </div>
    <div class="card">
      <h3>矛盾链</h3>
      <div class="chain">${parts.join("")}</div>
    </div>
    <div class="card">
      <h3>涉及的原始行与上下界</h3>
      <table>
        <thead><tr>
          <th class="num">行号</th><th>图中方向</th><th>使用的界</th>
          <th class="num">界值</th><th>含义</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
      <p class="muted">“上界”取该行最多分钟（事件乙 − 事件甲 ≤ 上界）；“下界”取该行最少分钟（事件乙 − 事件甲 ≥ 下界）。</p>
    </div>`;
}

async function solve() {
  const text = inputEl.value;
  resultEl.innerHTML = `<div class="card muted">联立中…</div>`;
  try {
    const resp = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await resp.json();
    if (data.status === "ok") renderOk(data);
    else if (data.status === "conflict") renderConflict(data);
    else renderErrors(data.errors || [{ line: null, message: "未知错误。" }]);
  } catch (err) {
    resultEl.innerHTML = `
      <div class="banner err"><h2>请求失败</h2><p>${esc(err.message)}</p></div>`;
  }
}

// ---------- 约束冗余核对 ----------

// 文本变化时刷新可选行（跳过空行，行号保持原始行号）
function refreshLineOptions() {
  const prev = lineSelect.value;
  lineSelect.innerHTML = "";
  let count = 0;
  inputEl.value.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = `第 ${i + 1} 行：${line}`;
    lineSelect.appendChild(opt);
    count += 1;
  });
  if (count === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（请先在上方输入约束行）";
    lineSelect.appendChild(opt);
    return;
  }
  if ([...lineSelect.options].some((o) => o.value === prev)) {
    lineSelect.value = prev;
  }
}

// 推导路径的链式图（复用矛盾链样式）
function pathChainHtml(steps) {
  if (!steps.length) {
    return `<p class="muted">无需任何其他约束：两事件为同一事件，时间差恒为 0。</p>`;
  }
  const parts = [`<div class="chain-node">${esc(steps[0].from)}</div>`];
  steps.forEach((s) => {
    parts.push(`
      <div class="chain-edge">
        <span class="tag ${s.kind}">第 ${s.line} 行 · ${esc(s.kind_label)} ${s.bound}</span>
        <span class="rel">${esc(s.relation)}</span>
        <span class="chain-arrow">→</span>
      </div>
      <div class="chain-node">${esc(s.to)}</div>`);
  });
  return `<div class="chain">${parts.join("")}</div>`;
}

// 推导路径的明细表：原始行号、方向、所用界与界值
function pathTableHtml(steps) {
  if (!steps.length) return "";
  const rows = steps.map((s) => `
    <tr>
      <td class="num">${s.line}</td>
      <td>${esc(s.from)} → ${esc(s.to)}</td>
      <td><span class="tag ${s.kind}">${esc(s.kind_label)}</span></td>
      <td class="num">${s.bound}</td>
      <td>${esc(s.relation)}</td>
    </tr>`).join("");
  return `
    <table>
      <thead><tr>
        <th class="num">行号</th><th>图中方向</th><th>使用的界</th>
        <th class="num">界值</th><th>含义</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRedundancy(data) {
  const removable = data.verdict === "removable";
  const lowText = data.lower_bounded ? String(data.derived_low) : "−∞（无界）";
  const highText = data.upper_bounded ? String(data.derived_high) : "+∞（无界）";
  const rest = data.line_count - 1;

  const reasons = [];
  if (!data.lower_bounded) {
    reasons.push("推导下界无界：删去该行后，其余约束对这两个事件的时间差给不出任何下限。");
  } else if (data.derived_low < data.low) {
    reasons.push(`推导下界 ${data.derived_low} 小于该行下界 ${data.low}：其余约束保证不了“最少 ${data.low} 分钟”。`);
  }
  if (!data.upper_bounded) {
    reasons.push("推导上界无界：删去该行后，其余约束对这两个事件的时间差给不出任何上限。");
  } else if (data.derived_high > data.high) {
    reasons.push(`推导上界 ${data.derived_high} 大于该行上界 ${data.high}：其余约束保证不了“最多 ${data.high} 分钟”。`);
  }

  const banner = removable
    ? `<div class="banner ok">
        <h2>✓ 可删：第 ${data.line} 行是冗余约束</h2>
        <p>删去该行后，其余 ${rest} 条约束推出的最紧区间为 <strong>[${lowText}, ${highText}]</strong>，
        完全落在该行区间 <strong>[${data.low}, ${data.high}]</strong> 内——其余叙述必然满足它，删去不损失信息。</p>
      </div>`
    : `<div class="banner conflict">
        <h2>✗ 必要：第 ${data.line} 行不可删</h2>
        <p>删去该行后，其余 ${rest} 条约束只能推出 <strong>[${lowText}, ${highText}]</strong>，
        未完全落在该行区间 <strong>[${data.low}, ${data.high}]</strong> 内：</p>
        <ul class="plain">${reasons.map((r) => `<li>· ${esc(r)}</li>`).join("")}</ul>
      </div>`;

  const summary = `
    <div class="card">
      <h3>结论依据</h3>
      <table>
        <thead><tr>
          <th>区间</th><th class="num">下界（最少分钟）</th><th class="num">上界（最多分钟）</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>第 ${data.line} 行原区间：${esc(data.a)} → ${esc(data.b)}</td>
            <td class="num">${data.low}</td>
            <td class="num">${data.high}</td>
          </tr>
          <tr>
            <td>删去该行后，其余约束推导区间</td>
            <td class="num">${lowText}</td>
            <td class="num">${highText}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">判定规则：推导下界 ≥ 原下界 且 推导上界 ≤ 原上界（推导区间完全落在原区间内）⇒ 可删；任一端点无界或超出 ⇒ 必要。</p>
    </div>`;

  const upperCard = data.upper_bounded ? `
    <div class="card">
      <h3>上界推导路径：t(${esc(data.b)}) − t(${esc(data.a)}) ≤ ${data.derived_high}</h3>
      <p class="muted">沿路径各边权值相加即最紧上界 ${data.derived_high}；每环标注原始行号与所用界值。</p>
      ${pathChainHtml(data.upper_path)}
      ${pathTableHtml(data.upper_path)}
    </div>` : `
    <div class="card">
      <h3>上界推导路径</h3>
      <p class="muted">在其余约束中，从 “${esc(data.a)}” 到 “${esc(data.b)}” 没有任何可推导路径，上界标为无界（+∞）。</p>
    </div>`;

  const lowerCard = data.lower_bounded ? `
    <div class="card">
      <h3>下界推导路径：t(${esc(data.b)}) − t(${esc(data.a)}) ≥ ${data.derived_low}</h3>
      <p class="muted">路径由 “${esc(data.b)}” 指向 “${esc(data.a)}”，权值之和为 ${-data.derived_low}，
      即 t(${esc(data.a)}) − t(${esc(data.b)}) ≤ ${-data.derived_low}，等价于 t(${esc(data.b)}) − t(${esc(data.a)}) ≥ ${data.derived_low}。</p>
      ${pathChainHtml(data.lower_path)}
      ${pathTableHtml(data.lower_path)}
    </div>` : `
    <div class="card">
      <h3>下界推导路径</h3>
      <p class="muted">在其余约束中，从 “${esc(data.b)}” 到 “${esc(data.a)}” 没有任何可推导路径，下界标为无界（−∞）。</p>
    </div>`;

  redundancyEl.innerHTML = banner + summary + upperCard + lowerCard;
}

async function checkRedundancy() {
  const line = parseInt(lineSelect.value, 10);
  if (!line) {
    redundancyEl.innerHTML = `
      <div class="banner err"><h2>未选择有效行</h2><p>请先在上方输入约束文本，再选择一条原始行。</p></div>`;
    return;
  }
  redundancyEl.innerHTML = `<div class="card muted">核对中…</div>`;
  try {
    const resp = await fetch("/api/redundancy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: inputEl.value, line }),
    });
    const data = await resp.json();
    if (data.status === "ok") {
      renderRedundancy(data);
    } else if (data.status === "conflict") {
      // 原约束冲突：沿用现有求解结果展示
      renderConflict(data, redundancyEl);
      redundancyEl.insertAdjacentHTML("afterbegin",
        `<p class="muted">原约束互相冲突，无法进行冗余核对；以下为现有联立求解结果：</p>`);
    } else {
      // 输入无效：沿用现有求解结果展示
      renderErrors(data.errors || [{ line: null, message: "未知错误。" }], redundancyEl);
      redundancyEl.insertAdjacentHTML("afterbegin",
        `<p class="muted">输入未通过校验，无法进行冗余核对；以下为现有联立求解结果：</p>`);
    }
  } catch (err) {
    redundancyEl.innerHTML = `
      <div class="banner err"><h2>请求失败</h2><p>${esc(err.message)}</p></div>`;
  }
}

$("btn-solve").addEventListener("click", solve);
$("btn-example-ok").addEventListener("click", () => {
  inputEl.value = EXAMPLE_OK;
  refreshLineOptions();
  solve();
});
$("btn-example-conflict").addEventListener("click", () => {
  inputEl.value = EXAMPLE_CONFLICT;
  refreshLineOptions();
  solve();
});
$("btn-clear").addEventListener("click", () => {
  inputEl.value = "";
  resultEl.innerHTML = "";
  redundancyEl.innerHTML = "";
  refreshLineOptions();
  inputEl.focus();
});
$("btn-redundancy").addEventListener("click", checkRedundancy);
inputEl.addEventListener("input", () => {
  refreshLineOptions();
  redundancyEl.innerHTML = "";  // 文本已变，旧的冗余结论作废
});
refreshLineOptions();
