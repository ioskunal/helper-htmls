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

  // ── Strip // and /* */ comments while respecting string literals.
  // Newlines inside block comments are preserved so JSON.parse error line
  // numbers still line up with the user's original input.
  function stripJsonComments(str) {
    let out = '';
    let i = 0;
    const n = str.length;
    let inString = false;
    while (i < n) {
      const ch = str[i];
      const next = str[i + 1];

      if (inString) {
        out += ch;
        if (ch === '\\' && i + 1 < n) {
          out += str[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inString = false;
        i++;
        continue;
      }

      if (ch === '"') {
        inString = true;
        out += ch;
        i++;
        continue;
      }

      // Line comment: //...\n
      if (ch === '/' && next === '/') {
        i += 2;
        while (i < n && str[i] !== '\n') i++;
        continue;
      }

      // Block comment: /* ... */
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < n && !(str[i] === '*' && str[i + 1] === '/')) {
          if (str[i] === '\n') out += '\n';
          i++;
        }
        i += 2;
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  // ── Parse JSON safely ─────────────────────────────
  function tryParse(str, label) {
    const trimmed = str.trim();
    if (!trimmed) {
      showError(label ? `${label} is empty` : 'Input is empty');
      return null;
    }
    try {
      return JSON.parse(stripJsonComments(trimmed));
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

  // ── Cursor position tracking (Ln/Col) ─────────────
  const cursorPos = $('#cursor-pos');

  function updateCursorPos() {
    const upto = jsonInput.value.substring(0, jsonInput.selectionStart);
    const newlineIdx = upto.lastIndexOf('\n');
    const line = (upto.match(/\n/g) || []).length + 1;
    const col = upto.length - (newlineIdx + 1) + 1;
    cursorPos.textContent = `Ln ${line}, Col ${col}`;
  }

  ['keyup', 'mouseup', 'input', 'focus', 'select', 'click'].forEach((evt) => {
    jsonInput.addEventListener(evt, updateCursorPos);
  });
  updateCursorPos();

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

  function compareJSON() {
    const a = tryParse(jsonA.value, 'JSON A');
    if (a === null) return;
    const b = tryParse(jsonB.value, 'JSON B');
    if (b === null) return;

    const diff = computeDiff(a, b);
    const { left, right } = renderDiffTree(diff, 0, null, true);
    const counts = countDiffs(diff);
    const totalDiffs = counts.added + counts.removed + counts.changed;

    // Build header
    let html = '<div class="diff-header"><div class="diff-stat">';
    if (totalDiffs === 0) {
      html += '<span style="color: var(--success)">JSONs are identical</span>';
    } else {
      if (counts.added) html += '<span class="diff-stat-added">+' + counts.added + ' added</span>';
      if (counts.removed) html += '<span class="diff-stat-removed">-' + counts.removed + ' removed</span>';
      if (counts.changed) html += '<span class="diff-stat-changed">~' + counts.changed + ' changed</span>';
    }
    html += '</div></div>';

    // Side-by-side panels
    html += '<div class="diff-side-by-side">';

    // Left panel (JSON A)
    html += '<div class="diff-panel-side"><div class="diff-panel-label">JSON A</div>';
    html += '<div class="diff-panel-body" id="diff-left">';
    let leftNum = 0;
    left.forEach((line) => {
      const num = line.type !== 'blank' ? ++leftNum : '';
      html += '<div class="diff-line ' + line.type + '">';
      html += '<span class="line-num">' + num + '</span>';
      html += '<span class="line-content">' + (line.html || '&nbsp;') + '</span>';
      html += '</div>';
    });
    html += '</div></div>';

    // Right panel (JSON B)
    html += '<div class="diff-panel-side"><div class="diff-panel-label">JSON B</div>';
    html += '<div class="diff-panel-body" id="diff-right">';
    let rightNum = 0;
    right.forEach((line) => {
      const num = line.type !== 'blank' ? ++rightNum : '';
      html += '<div class="diff-line ' + line.type + '">';
      html += '<span class="line-num">' + num + '</span>';
      html += '<span class="line-content">' + (line.html || '&nbsp;') + '</span>';
      html += '</div>';
    });
    html += '</div></div>';

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

  // ── Compare tab event listeners ───────────────────
  compareBtn.addEventListener('click', compareJSON);

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
