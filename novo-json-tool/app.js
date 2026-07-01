// ── Novo JSON ────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── DOM refs ──────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Format tab
  const jsonInput = $('#json-input');
  const jsonOutput = $('#json-output');
  const formatBtn = $('#format-btn');
  const minifyBtn = $('#minify-btn');
  const copyBtn = $('#copy-btn');
  const clearBtn = $('#clear-btn');
  const pasteBtn = $('#paste-btn');
  const sampleBtn = $('#sample-btn');
  const expandAllBtn = $('#expand-all-btn');
  const collapseAllBtn = $('#collapse-all-btn');
  const indentSize = $('#indent-size');

  // Compare tab
  const jsonA = $('#json-a');
  const jsonB = $('#json-b');
  const compareBtn = $('#compare-btn');
  const swapBtn = $('#swap-btn');
  const clearCompareBtn = $('#clear-compare-btn');
  const diffOutput = $('#diff-output');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const labelA = $('#label-a');
  const labelB = $('#label-b');

  // ── Theme toggle ──────────────────────────────────
  const themeToggle = $('#theme-toggle');

  function getPreferredTheme() {
    const stored = localStorage.getItem('novo-json-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('novo-json-theme', theme);
  }

  applyTheme(getPreferredTheme());

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ── Tab switching ─────────────────────────────────
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tabContents.forEach((tc) => tc.classList.remove('active'));
      tab.classList.add('active');
      $('#' + tab.dataset.tab).classList.add('active');
    });
  });

  // ── Error toast ───────────────────────────────────
  let toastTimer;
  function showError(msg) {
    let toast = $('.error-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'error-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  // ── Parse JSON safely ─────────────────────────────
  function tryParse(str, label) {
    const trimmed = str.trim();
    if (!trimmed) {
      showError(label ? `${label} is empty` : 'Input is empty');
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      showError(label ? `${label}: ${e.message}` : e.message);
      return null;
    }
  }

  // ── Get indent value ──────────────────────────────
  function getIndent() {
    const val = indentSize.value;
    return val === 'tab' ? '\t' : Number(val);
  }

  // ══════════════════════════════════════════════════
  //  FORMAT / TREE VIEW
  // ══════════════════════════════════════════════════

  let nextCollapseId = 0;
  const collapsedGroups = new Set();

  // Build a flat array of { indent, html, groups[] } line objects
  function buildLines(data, indent, key, isLast) {
    const lines = [];
    const comma = isLast ? '' : '<span class="json-comma">,</span>';
    const keyHtml = key != null ? '<span class="json-key">"' + escapeHtml(String(key)) + '"</span>: ' : '';

    if (data === null) {
      lines.push({ indent, html: keyHtml + '<span class="json-null">null</span>' + comma });
      return lines;
    }
    if (typeof data === 'string') {
      lines.push({ indent, html: keyHtml + '<span class="json-string">"' + escapeHtml(data) + '"</span>' + comma });
      return lines;
    }
    if (typeof data === 'number') {
      lines.push({ indent, html: keyHtml + '<span class="json-number">' + data + '</span>' + comma });
      return lines;
    }
    if (typeof data === 'boolean') {
      lines.push({ indent, html: keyHtml + '<span class="json-boolean">' + data + '</span>' + comma });
      return lines;
    }

    const isArray = Array.isArray(data);
    const entries = isArray ? data.map((v, i) => [i, v]) : Object.entries(data);
    const open = isArray ? '[' : '{';
    const close = isArray ? ']' : '}';
    const count = entries.length;

    if (count === 0) {
      lines.push({ indent, html: keyHtml + '<span class="json-bracket">' + open + close + '</span>' + comma });
      return lines;
    }

    const cid = nextCollapseId++;
    const preview = isArray
      ? count + ' item' + (count !== 1 ? 's' : '')
      : count + ' key' + (count !== 1 ? 's' : '');

    // Opening bracket line
    lines.push({
      indent,
      html: keyHtml +
        '<span class="json-toggle" data-cid="' + cid + '"></span>' +
        '<span class="json-bracket">' + open + '</span>' +
        '<span class="json-preview"> // ' + preview + ' </span>'
    });

    // Children
    entries.forEach(([k, v], idx) => {
      const childKey = isArray ? null : String(k);
      const childIsLast = idx === count - 1;
      const childLines = buildLines(v, indent + 1, childKey, childIsLast);
      childLines.forEach(function (l) {
        if (!l.groups) l.groups = [];
        l.groups.push(cid);
      });
      lines.push(...childLines);
    });

    // Closing bracket line
    lines.push({ indent, html: '<span class="json-bracket">' + close + '</span>' + comma, groups: [cid] });

    return lines;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toggleCollapse(cid) {
    if (collapsedGroups.has(cid)) {
      collapsedGroups.delete(cid);
    } else {
      collapsedGroups.add(cid);
    }
    updateLineVisibility();
  }

  function updateLineVisibility() {
    jsonOutput.querySelectorAll('.json-line[data-groups]').forEach(function (line) {
      const groups = line.dataset.groups.split(',');
      const hidden = groups.some(function (g) { return collapsedGroups.has(g); });
      line.style.display = hidden ? 'none' : '';
    });
    jsonOutput.querySelectorAll('.json-toggle').forEach(function (toggle) {
      toggle.classList.toggle('collapsed', collapsedGroups.has(toggle.dataset.cid));
    });
  }

  function formatJSON() {
    const data = tryParse(jsonInput.value, 'Input');
    if (data === null && jsonInput.value.trim()) return;
    if (!jsonInput.value.trim()) return;

    nextCollapseId = 0;
    collapsedGroups.clear();
    const lines = buildLines(data, 0, null, true);

    let html = '<div class="json-tree">';
    lines.forEach(function (line, i) {
      const groupsAttr = line.groups && line.groups.length
        ? ' data-groups="' + line.groups.join(',') + '"'
        : '';
      html += '<div class="json-line"' + groupsAttr + '>';
      html += '<span class="line-num">' + (i + 1) + '</span>';
      html += '<span class="line-content" style="padding-left:' + (line.indent * 20) + 'px">' + line.html + '</span>';
      html += '</div>';
    });
    html += '</div>';

    jsonOutput.innerHTML = html;

    // Attach toggle click handlers
    jsonOutput.querySelectorAll('.json-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleCollapse(toggle.dataset.cid);
      });
    });
  }

  function minifyJSON() {
    const data = tryParse(jsonInput.value, 'Input');
    if (data === null) return;
    jsonInput.value = JSON.stringify(data);
    jsonOutput.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-all;color:var(--text-muted)">${escapeHtml(JSON.stringify(data))}</pre>`;
  }

  // ── Format tab event listeners ────────────────────
  formatBtn.addEventListener('click', formatJSON);
  minifyBtn.addEventListener('click', minifyJSON);

  clearBtn.addEventListener('click', () => {
    jsonInput.value = '';
    jsonOutput.innerHTML = '';
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      jsonInput.value = text;
    } catch {
      showError('Could not read clipboard');
    }
  });

  copyBtn.addEventListener('click', () => {
    const data = tryParse(jsonInput.value, 'Input');
    if (data === null) return;
    const indent = getIndent();
    const text = JSON.stringify(data, null, indent);
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    });
  });

  sampleBtn.addEventListener('click', () => {
    jsonInput.value = JSON.stringify(SAMPLE_JSON, null, 2);
    formatJSON();
  });

  expandAllBtn.addEventListener('click', () => {
    collapsedGroups.clear();
    updateLineVisibility();
  });

  collapseAllBtn.addEventListener('click', () => {
    jsonOutput.querySelectorAll('.json-toggle').forEach((toggle) => {
      collapsedGroups.add(toggle.dataset.cid);
    });
    updateLineVisibility();
  });

  // Keyboard shortcut: Ctrl/Cmd + Enter to format
  jsonInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      formatJSON();
    }
    // Tab key inserts tab character
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = jsonInput.selectionStart;
      const end = jsonInput.selectionEnd;
      jsonInput.value = jsonInput.value.substring(0, start) + '  ' + jsonInput.value.substring(end);
      jsonInput.selectionStart = jsonInput.selectionEnd = start + 2;
    }
  });

  // ══════════════════════════════════════════════════
  //  JSON COMPARISON (Side-by-side structured diff)
  // ══════════════════════════════════════════════════

  // Recursively compute a diff tree between two JSON values.
  // Returns a DiffNode: { type, value?, oldValue?, newValue?, children? }
  function computeDiff(a, b) {
    if (a === undefined && b === undefined) return { type: 'same', value: undefined };
    if (a === undefined) return { type: 'added', value: b };
    if (b === undefined) return { type: 'removed', value: a };

    if (a === null && b === null) return { type: 'same', value: null };
    if (a === null || b === null) return { type: 'changed', oldValue: a, newValue: b };

    if (typeof a !== typeof b) return { type: 'changed', oldValue: a, newValue: b };
    if (Array.isArray(a) !== Array.isArray(b)) return { type: 'changed', oldValue: a, newValue: b };

    // Both arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      const maxLen = Math.max(a.length, b.length);
      if (maxLen === 0) return { type: 'same', value: [] };
      const children = [];
      let allSame = true;
      for (let i = 0; i < maxLen; i++) {
        const child = computeDiff(i < a.length ? a[i] : undefined, i < b.length ? b[i] : undefined);
        children.push({ index: i, diff: child });
        if (child.type !== 'same') allSame = false;
      }
      if (allSame) return { type: 'same', value: a };
      return { type: 'array', children };
    }

    // Both objects
    if (typeof a === 'object' && typeof b === 'object') {
      const allKeys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      if (allKeys.length === 0) return { type: 'same', value: {} };
      const children = [];
      let allSame = true;
      allKeys.forEach((key) => {
        const child = computeDiff(
          key in a ? a[key] : undefined,
          key in b ? b[key] : undefined
        );
        children.push({ key, diff: child });
        if (child.type !== 'same') allSame = false;
      });
      if (allSame) return { type: 'same', value: a };
      return { type: 'object', children };
    }

    // Primitives
    if (a === b) return { type: 'same', value: a };
    return { type: 'changed', oldValue: a, newValue: b };
  }

  // Format a JSON value into an array of syntax-highlighted HTML lines.
  // key: property name (string) or null for array items / root.
  // hasComma: whether to append a trailing comma.
  function formatValueLines(value, indent, key, hasComma) {
    const pad = '  '.repeat(indent);
    const kp = key != null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '';
    const cm = hasComma ? '<span class="json-comma">,</span>' : '';
    const lines = [];

    if (value === null) {
      lines.push(pad + kp + '<span class="json-null">null</span>' + cm);
    } else if (typeof value === 'string') {
      lines.push(pad + kp + '<span class="json-string">"' + escapeHtml(value) + '"</span>' + cm);
    } else if (typeof value === 'number') {
      lines.push(pad + kp + '<span class="json-number">' + value + '</span>' + cm);
    } else if (typeof value === 'boolean') {
      lines.push(pad + kp + '<span class="json-boolean">' + value + '</span>' + cm);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(pad + kp + '<span class="json-bracket">[]</span>' + cm);
      } else {
        lines.push(pad + kp + '<span class="json-bracket">[</span>');
        value.forEach((item, i) => {
          lines.push(...formatValueLines(item, indent + 1, null, i < value.length - 1));
        });
        lines.push(pad + '<span class="json-bracket">]</span>' + cm);
      }
    } else {
      const keys = Object.keys(value).sort();
      if (keys.length === 0) {
        lines.push(pad + kp + '<span class="json-bracket">{}</span>' + cm);
      } else {
        lines.push(pad + kp + '<span class="json-bracket">{</span>');
        keys.forEach((k, i) => {
          lines.push(...formatValueLines(value[k], indent + 1, k, i < keys.length - 1));
        });
        lines.push(pad + '<span class="json-bracket">}</span>' + cm);
      }
    }

    return lines;
  }

  // Render a diff tree into two aligned arrays of lines (left = JSON A, right = JSON B).
  // Each line: { html: string, type: 'normal'|'added'|'removed'|'changed'|'blank' }
  function renderDiffTree(diff, indent, key, isLast) {
    const left = [];
    const right = [];
    const hasComma = !isLast;

    switch (diff.type) {
      case 'same': {
        const lines = formatValueLines(diff.value, indent, key, hasComma);
        lines.forEach((l) => {
          left.push({ html: l, type: 'normal' });
          right.push({ html: l, type: 'normal' });
        });
        break;
      }
      case 'added': {
        const lines = formatValueLines(diff.value, indent, key, hasComma);
        lines.forEach((l) => {
          left.push({ html: '', type: 'blank' });
          right.push({ html: l, type: 'added' });
        });
        break;
      }
      case 'removed': {
        const lines = formatValueLines(diff.value, indent, key, hasComma);
        lines.forEach((l) => {
          left.push({ html: l, type: 'removed' });
          right.push({ html: '', type: 'blank' });
        });
        break;
      }
      case 'changed': {
        const oldLines = formatValueLines(diff.oldValue, indent, key, hasComma);
        const newLines = formatValueLines(diff.newValue, indent, key, hasComma);
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
          left.push(i < oldLines.length ? { html: oldLines[i], type: 'changed' } : { html: '', type: 'blank' });
          right.push(i < newLines.length ? { html: newLines[i], type: 'changed' } : { html: '', type: 'blank' });
        }
        break;
      }
      case 'object': {
        const pad = '  '.repeat(indent);
        const kp = key != null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '';
        const cm = hasComma ? '<span class="json-comma">,</span>' : '';

        left.push({ html: pad + kp + '<span class="json-bracket">{</span>', type: 'normal' });
        right.push({ html: pad + kp + '<span class="json-bracket">{</span>', type: 'normal' });

        diff.children.forEach((child, i) => {
          const childIsLast = i === diff.children.length - 1;
          const result = renderDiffTree(child.diff, indent + 1, child.key, childIsLast);
          left.push(...result.left);
          right.push(...result.right);
        });

        left.push({ html: pad + '<span class="json-bracket">}</span>' + cm, type: 'normal' });
        right.push({ html: pad + '<span class="json-bracket">}</span>' + cm, type: 'normal' });
        break;
      }
      case 'array': {
        const pad = '  '.repeat(indent);
        const kp = key != null ? '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' : '';
        const cm = hasComma ? '<span class="json-comma">,</span>' : '';

        left.push({ html: pad + kp + '<span class="json-bracket">[</span>', type: 'normal' });
        right.push({ html: pad + kp + '<span class="json-bracket">[</span>', type: 'normal' });

        diff.children.forEach((child, i) => {
          const childIsLast = i === diff.children.length - 1;
          const result = renderDiffTree(child.diff, indent + 1, null, childIsLast);
          left.push(...result.left);
          right.push(...result.right);
        });

        left.push({ html: pad + '<span class="json-bracket">]</span>' + cm, type: 'normal' });
        right.push({ html: pad + '<span class="json-bracket">]</span>' + cm, type: 'normal' });
        break;
      }
    }

    return { left, right };
  }

  // Count leaf-level diffs in the diff tree
  function countDiffs(diff) {
    const counts = { added: 0, removed: 0, changed: 0 };
    function walk(d) {
      switch (d.type) {
        case 'same': break;
        case 'added': counts.added++; break;
        case 'removed': counts.removed++; break;
        case 'changed': counts.changed++; break;
        case 'object':
        case 'array':
          d.children.forEach((c) => walk(c.diff));
          break;
      }
    }
    walk(diff);
    return counts;
  }

  // Render two aligned line arrays into the side-by-side diff panels.
  // opts: { labelA, labelB, counts, identicalMsg }
  function renderSideBySide(left, right, opts) {
    const counts = opts.counts;
    const totalDiffs = counts.added + counts.removed + counts.changed;

    // Build header
    let html = '<div class="diff-header"><div class="diff-stat">';
    if (totalDiffs === 0) {
      html += '<span style="color: var(--success)">' + opts.identicalMsg + '</span>';
    } else {
      if (counts.added) html += '<span class="diff-stat-added">+' + counts.added + ' added</span>';
      if (counts.removed) html += '<span class="diff-stat-removed">-' + counts.removed + ' removed</span>';
      if (counts.changed) html += '<span class="diff-stat-changed">~' + counts.changed + ' changed</span>';
    }
    html += '</div></div>';

    // Side-by-side panels
    html += '<div class="diff-side-by-side">';

    function renderPanel(lines, label, id) {
      let panel = '<div class="diff-panel-side"><div class="diff-panel-label">' + label + '</div>';
      panel += '<div class="diff-panel-body" id="' + id + '">';
      let num = 0;
      lines.forEach((line) => {
        const n = line.type !== 'blank' ? ++num : '';
        panel += '<div class="diff-line ' + line.type + '">';
        panel += '<span class="line-num">' + n + '</span>';
        panel += '<span class="line-content">' + (line.html || '&nbsp;') + '</span>';
        panel += '</div>';
      });
      panel += '</div></div>';
      return panel;
    }

    html += renderPanel(left, opts.labelA, 'diff-left');
    html += renderPanel(right, opts.labelB, 'diff-right');
    html += '</div>';
    diffOutput.innerHTML = html;

    // Synchronized scrolling between the two panels
    const leftPanel = document.getElementById('diff-left');
    const rightPanel = document.getElementById('diff-right');
    if (leftPanel && rightPanel) {
      let syncing = false;
      leftPanel.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        rightPanel.scrollTop = leftPanel.scrollTop;
        rightPanel.scrollLeft = leftPanel.scrollLeft;
        syncing = false;
      });
      rightPanel.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        leftPanel.scrollTop = rightPanel.scrollTop;
        leftPanel.scrollLeft = rightPanel.scrollLeft;
        syncing = false;
      });
    }
  }

  function compareJSON() {
    const a = tryParse(jsonA.value, 'JSON A');
    if (a === null) return;
    const b = tryParse(jsonB.value, 'JSON B');
    if (b === null) return;

    const diff = computeDiff(a, b);
    const { left, right } = renderDiffTree(diff, 0, null, true);
    renderSideBySide(left, right, {
      labelA: 'JSON A',
      labelB: 'JSON B',
      counts: countDiffs(diff),
      identicalMsg: 'JSONs are identical'
    });
  }

  // ══════════════════════════════════════════════════
  //  TEXT COMPARISON (line-by-line diff, à la diffchecker)
  // ══════════════════════════════════════════════════

  // Longest-common-subsequence over two token arrays → list of ops.
  // Each op: { type: 'equal'|'del'|'ins', a?: token, b?: token }
  function lcsDiff(aTokens, bTokens) {
    const n = aTokens.length;
    const m = bTokens.length;
    // dp[i][j] = LCS length of aTokens[i..] and bTokens[j..]
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = aTokens[i] === bTokens[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (aTokens[i] === bTokens[j]) {
        ops.push({ type: 'equal', a: aTokens[i], b: bTokens[j] });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', a: aTokens[i] });
        i++;
      } else {
        ops.push({ type: 'ins', b: bTokens[j] });
        j++;
      }
    }
    while (i < n) ops.push({ type: 'del', a: aTokens[i++] });
    while (j < m) ops.push({ type: 'ins', b: bTokens[j++] });
    return ops;
  }

  // Word/whitespace-level inline highlight for a changed line pair.
  // Returns { left, right } HTML strings with differing runs wrapped.
  function inlineDiff(oldLine, newLine) {
    const split = (s) => s.match(/\s+|\S+/g) || [];
    const ops = lcsDiff(split(oldLine), split(newLine));
    let left = '', right = '';
    ops.forEach((op) => {
      if (op.type === 'equal') {
        left += escapeHtml(op.a);
        right += escapeHtml(op.b);
      } else if (op.type === 'del') {
        left += '<span class="diff-inline-del">' + escapeHtml(op.a) + '</span>';
      } else {
        right += '<span class="diff-inline-ins">' + escapeHtml(op.b) + '</span>';
      }
    });
    return { left: left || '&nbsp;', right: right || '&nbsp;' };
  }

  function compareText() {
    const aRaw = jsonA.value;
    const bRaw = jsonB.value;
    if (!aRaw.trim() && !bRaw.trim()) {
      showError('Both inputs are empty');
      return;
    }

    const aLines = aRaw.split('\n');
    const bLines = bRaw.split('\n');
    const ops = lcsDiff(aLines, bLines);

    const left = [];
    const right = [];
    const counts = { added: 0, removed: 0, changed: 0 };

    // Walk ops, pairing runs of deletions with following insertions so they
    // line up on the same rows and get inline word-level highlighting.
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op.type === 'equal') {
        const h = escapeHtml(op.a) || '&nbsp;';
        left.push({ html: h, type: 'normal' });
        right.push({ html: h, type: 'normal' });
        continue;
      }

      // Gather a contiguous block of del/ins ops.
      const dels = [];
      const ins = [];
      while (k < ops.length && ops[k].type !== 'equal') {
        if (ops[k].type === 'del') dels.push(ops[k].a);
        else ins.push(ops[k].b);
        k++;
      }
      k--; // for-loop will advance past the block

      const paired = Math.min(dels.length, ins.length);
      for (let p = 0; p < paired; p++) {
        const inl = inlineDiff(dels[p], ins[p]);
        left.push({ html: inl.left, type: 'changed' });
        right.push({ html: inl.right, type: 'changed' });
        counts.changed++;
      }
      for (let p = paired; p < dels.length; p++) {
        left.push({ html: escapeHtml(dels[p]) || '&nbsp;', type: 'removed' });
        right.push({ html: '', type: 'blank' });
        counts.removed++;
      }
      for (let p = paired; p < ins.length; p++) {
        left.push({ html: '', type: 'blank' });
        right.push({ html: escapeHtml(ins[p]) || '&nbsp;', type: 'added' });
        counts.added++;
      }
    }

    renderSideBySide(left, right, {
      labelA: 'Text A',
      labelB: 'Text B',
      counts,
      identicalMsg: 'Texts are identical'
    });
  }

  // ── Compare mode toggle ───────────────────────────
  let compareMode = 'json';

  function setCompareMode(mode) {
    compareMode = mode;
    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const isJson = mode === 'json';
    labelA.textContent = isJson ? 'JSON A' : 'Text A';
    labelB.textContent = isJson ? 'JSON B' : 'Text B';
    jsonA.placeholder = isJson ? 'Paste first JSON here...' : 'Paste first text here...';
    jsonB.placeholder = isJson ? 'Paste second JSON here...' : 'Paste second text here...';
    diffOutput.innerHTML = '';
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => setCompareMode(btn.dataset.mode));
  });

  function runCompare() {
    if (compareMode === 'text') compareText();
    else compareJSON();
  }

  // ── Compare tab event listeners ───────────────────
  compareBtn.addEventListener('click', runCompare);

  swapBtn.addEventListener('click', () => {
    const temp = jsonA.value;
    jsonA.value = jsonB.value;
    jsonB.value = temp;
  });

  clearCompareBtn.addEventListener('click', () => {
    jsonA.value = '';
    jsonB.value = '';
    diffOutput.innerHTML = '';
  });

  document.querySelectorAll('.compare-paste-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = $('#' + btn.dataset.target);
      try {
        target.value = await navigator.clipboard.readText();
      } catch {
        showError('Could not read clipboard');
      }
    });
  });

  // ── Drag & drop .json files ───────────────────────
  // Without this, dropping a file anywhere on the page makes the browser
  // navigate away to open it — which is why a drop that misses the textarea
  // looked like "nothing happened". Swallow drops outside our drop zones.
  function isFileDrag(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }
  window.addEventListener('dragover', (e) => {
    if (isFileDrag(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (isFileDrag(e)) e.preventDefault();
  });

  function readJsonFile(file, onText) {
    if (!file) return;
    const isJson = /\.json$/i.test(file.name) ||
      file.type === 'application/json';
    if (!isJson) {
      showError('Please drop a .json file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result));
    reader.onerror = () => showError('Could not read file');
    reader.readAsText(file);
  }

  // The whole panel is the drop target (not just the textarea), so a near-miss
  // still works. A depth counter keeps the highlight steady while the cursor
  // moves over the panel's child elements.
  function enableFileDrop(zone, textarea, onLoaded) {
    let depth = 0;
    zone.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      depth++;
      textarea.classList.add('drag-over');
    });
    zone.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) textarea.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      textarea.classList.remove('drag-over');
      readJsonFile(e.dataTransfer.files && e.dataTransfer.files[0], (text) => {
        textarea.value = text;
        if (onLoaded) onLoaded();
      });
    });
  }

  enableFileDrop($('.format-input-panel'), jsonInput, formatJSON);
  enableFileDrop(jsonA.closest('.compare-panel'), jsonA);
  enableFileDrop(jsonB.closest('.compare-panel'), jsonB);

  // ── Sample data ───────────────────────────────────
  const SAMPLE_JSON = {
    name: "Novo JSON Tool",
    version: "1.0.0",
    features: ["format", "beautify", "collapse", "compare"],
    config: {
      theme: "dark",
      indentSize: 2,
      maxDepth: null,
      autoFormat: true
    },
    users: [
      { id: 1, name: "Alice", role: "admin", active: true },
      { id: 2, name: "Bob", role: "editor", active: false },
      { id: 3, name: "Charlie", role: "viewer", active: true }
    ],
    metadata: {
      created: "2026-04-10",
      tags: ["json", "formatter", "tool"],
      stats: {
        downloads: 15420,
        rating: 4.8,
        reviews: 230
      }
    }
  };
})();
