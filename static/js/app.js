"use strict";

const API = "";
let cleanMode = true;   // same origin — Flask serves both

/* ── Tab switching ─────────────────────────────── */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel-wrap").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

/* ── Helpers ───────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setStatus(type, msg, time) {
  const bar  = document.querySelector(".statusbar");
  const msgEl = document.getElementById("statusMsg");
  const timeEl = document.getElementById("statusTime");
  bar.className = `statusbar ${type}`;
  msgEl.textContent = msg;
  timeEl.textContent = time ? `${time} ms` : "";
}

function getSource() {
  return document.getElementById("srcCode").value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/* ── Compile ────────────────────────────────────── */
let lastCpp = "";
let lastAsm = "";

async function compile() {
  const source = getSource().trim();
  if (!source) return;

  const btn = document.getElementById("compileBtn");
  btn.disabled = true;
  setStatus("loading", "Compiling…", "");

  const lang = document.getElementById("lang").value;
  const arch = document.getElementById("arch").value;
  const opt  = document.getElementById("opt").value;

  const t0 = performance.now();

  try {
    const res  = await fetch(`${API}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, lang, arch, opt, clean: cleanMode }),
    });
    const data = await res.json();
    const ms   = Math.round(performance.now() - t0);

    const asmOut = document.getElementById("asmOut");

    if (data.error) {
      asmOut.innerHTML = `<span class="asm-error">${esc(data.error)}</span>`;
      setStatus("error", "Compilation failed", ms);
    } else {
      lastCpp = source;
      lastAsm = data.asm;

      // Render with line numbers
      asmOut.innerHTML = lastAsm.split("\n").map((line, i) =>
        `<span class="line-num">${i + 1}</span>${esc(line)}`
      ).join("\n");

      document.getElementById("langPill").textContent = lang === "c++" ? "C++" : "C";
      document.getElementById("archPill").textContent = `${arch} · Intel`;

      setStatus("ok", `GCC compiled (${opt}, ${arch}) — ${lastAsm.split("\n").length} lines`, ms);

      renderDiff();
      runTokenize();
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    document.getElementById("asmOut").innerHTML =
      `<span class="asm-error">Network error — is Flask running on port 5000?\n\n${e.message}</span>`;
    setStatus("error", "Cannot reach Flask backend", ms);
  }

  btn.disabled = false;
}

/* ── Keyboard shortcut: Ctrl+Enter ─────────────── */
document.getElementById("srcCode").addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") compile();
});

/* ── Diff view ──────────────────────────────────── */
function renderDiff() {
  if (!lastCpp || !lastAsm) return;
  const cLines = lastCpp.split("\n");
  const aLines = lastAsm.split("\n");
  const max = Math.max(cLines.length, aLines.length);
  let html = "";
  for (let i = 0; i < max; i++) {
    if (i < cLines.length)
      html += `<div class="diff-line cpp"><span class="diff-mark">+</span><span class="diff-text">${esc(cLines[i])}</span></div>`;
    if (i < aLines.length)
      html += `<div class="diff-line asm"><span class="diff-mark">›</span><span class="diff-text">${esc(aLines[i])}</span></div>`;
  }
  document.getElementById("diffOut").innerHTML = html || `<p class="placeholder">No content.</p>`;
}

/* ── Token lexer ─────────────────────────────────── */
async function runTokenize() {
  const source = getSource().trim();
  if (!source) return;

  const lang = document.getElementById("lang").value;

  try {
    const res  = await fetch(`${API}/tokenize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, lang }),
    });
    const data = await res.json();

    if (!data.tokens || data.tokens.length === 0) {
      document.getElementById("tokenArea").innerHTML = `<p class="placeholder">No tokens found.</p>`;
      return;
    }

    const html = data.tokens.map(t =>
      `<span class="tok ${esc(t.kind)}" title="${esc(t.kind)}">${esc(t.value)}</span>`
    ).join(" ");

    document.getElementById("tokenArea").innerHTML = html;
  } catch (e) {
    document.getElementById("tokenArea").innerHTML =
      `<p class="placeholder">Tokenizer error: ${esc(e.message)}</p>`;
  }
}

/* ── CLR Parser ──────────────────────────────────── */
async function parseCLR() {
  const grammar = document.getElementById("grammarInput").value.trim();
  const input   = document.getElementById("clrStr").value.trim();
  const resEl   = document.getElementById("clrResult");

  if (!grammar || !input) {
    resEl.innerHTML = `<div class="result-info">Please fill in grammar and input string.</div>`;
    return;
  }

  resEl.innerHTML = `<div class="result-info">Parsing…</div>`;

  try {
    const res  = await fetch(`${API}/parse_clr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grammar, input }),
    });
    const data = await res.json();

    if (data.error) {
      resEl.innerHTML = `<div class="result-err">${esc(data.error)}</div>`;
      return;
    }

    const tokensStr = data.tokens.map(t => `<span class="pt-t">${esc(t)}</span>`).join(" ");
    let html = data.accepted
      ? `<div class="result-ok">✓ Accepted by grammar (start: <strong>${esc(data.start)}</strong>)</div>`
      : `<div class="result-err">✗ String NOT accepted by this grammar</div>`;

    html += `<div style="margin-bottom:10px;font-size:12px;color:var(--text1);">Tokens: ${tokensStr}</div>`;

    if (data.accepted && data.tree) {
      html += `<div class="section-label" style="margin-bottom:6px;">Parse tree</div>`;
      html += `<div class="parse-tree">${renderTree(data.tree, 0)}</div>`;
    }

    // Grammar rules summary
    html += `<div class="section-label" style="margin-top:16px;margin-bottom:6px;">Grammar rules loaded</div>`;
    html += `<div style="font-size:12px;line-height:1.9;font-family:var(--font-mono);">`;
    for (const [nt, rules] of Object.entries(data.grammar_rules || {})) {
      for (const rule of rules) {
        html += `<div><span class="pt-nt">${esc(nt)}</span> <span class="pt-arrow">→</span> ${rule.map(s => /^[A-Z]/.test(s) ? `<span class="pt-nt">${esc(s)}</span>` : `<span class="pt-t">${esc(s)}</span>`).join(" ")}</div>`;
      }
    }
    html += `</div>`;

    resEl.innerHTML = html;
  } catch (e) {
    resEl.innerHTML = `<div class="result-err">Network error: ${esc(e.message)}</div>`;
  }
}

function renderTree(node, depth) {
  if (!node) return "";
  const indent = "  ".repeat(depth);

  if (node.terminal) {
    return `<div class="pt-node">${esc(indent)}<span class="pt-t">"${esc(node.terminal)}"</span></div>`;
  }

  const span = node.span ? `<span class="pt-span">[${node.span[0]}…${node.span[1]}]</span>` : "";
  let html = `<div class="pt-node">${esc(indent)}<span class="pt-nt">${esc(node.nt)}</span> ${span}</div>`;

  if (node.children) {
    for (const child of node.children) {
      html += renderTree(child, depth + 1);
    }
  }
  return html;
}

/* ── Expose globals ─────────────────────────────── */
function toggleClean() {
  cleanMode = !cleanMode;
  const btn = document.getElementById("cleanToggle");
  btn.textContent = cleanMode ? "Clean" : "Raw";
  btn.style.color = cleanMode ? "" : "var(--amber)";
  btn.style.borderColor = cleanMode ? "" : "var(--amber)";
}

window.compile     = compile;
window.parseCLR    = parseCLR;
window.runTokenize = runTokenize;
window.toggleClean = toggleClean;

/* ── Draggable split resizer ────────────────────── */
(function () {
  const resizer = document.getElementById("splitResizer");
  if (!resizer) return;
  const split = resizer.parentElement;

  let dragging = false;
  let startX   = 0;
  let leftW    = 0;

  resizer.addEventListener("mousedown", e => {
    dragging = true;
    startX   = e.clientX;
    const panes = split.querySelectorAll(".pane");
    leftW    = panes[0].getBoundingClientRect().width;
    resizer.classList.add("dragging");
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const dx      = e.clientX - startX;
    const total   = split.getBoundingClientRect().width - resizer.offsetWidth;
    const newLeft = Math.min(Math.max(leftW + dx, 120), total - 120);
    const pct     = (newLeft / total) * 100;
    const panes   = split.querySelectorAll(".pane");
    panes[0].style.flex = `0 0 ${pct}%`;
    panes[1].style.flex = `0 0 ${100 - pct}%`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.cursor     = "";
    document.body.style.userSelect = "";
  });
})();