(function () {
  'use strict';

  var MAX_LENGTH = 500000;
  var STORAGE_KEY = 'fv-md-draft';
  var MAX_DEPTH = 8;

  var ORIGIN = /^https?:$/.test(location.protocol) ? location.origin : 'https://example.com';
  var SAMPLE = [
    '# Привет, Markdown!',
    '',
    'Это **живой** предпросмотр: пишите слева, результат появляется справа. Поддерживаются *курсив*, ~~зачёркивание~~ и `встроенный код`.',
    '',
    '## Списки',
    '',
    '- Маркированный пункт',
    '- Ещё один пункт',
    '  - Вложенный пункт',
    '',
    '1. Первый шаг',
    '2. Второй шаг',
    '',
    '- [x] Готовая задача',
    '- [ ] Задача в работе',
    '',
    '## Код и таблица',
    '',
    '```js',
    'const sum = (a, b) => a + b;',
    'console.log(sum(2, 3));',
    '```',
    '',
    '| Формат | Назначение |',
    '| :----- | :--------: |',
    '| RSS    | Ленты новостей |',
    '| Atom   | Ленты и записи |',
    '',
    '> Цитата помогает выделить важную мысль.',
    '',
    '---',
    '',
    'Ссылка: [Проверить RSS-ленту](' + ORIGIN + '/) или просто https://example.com'
  ].join('\n');

  function $(id) { return document.getElementById(id); }

  var el = {
    input: $('md-input'),
    preview: $('md-preview'),
    panels: $('md-panels'),
    count: $('md-count'),
    stats: $('md-stats'),
    copyHtml: $('md-copy-html'),
    copyMd: $('md-copy-md'),
    saveMd: $('md-save-md'),
    saveHtml: $('md-save-html'),
    sample: $('md-sample'),
    clear: $('md-clear')
  };

  /* ---------- Markdown → HTML (HTML-теги из исходника всегда экранируются) ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function emphasis(text) {
    return text
      .replace(/\*\*\*(?!\s)(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(?!\s)(.+?)\*\*|__(?!\s)(.+?)__/g, function (_, a, b) { return '<strong>' + (a || b) + '</strong>'; })
      .replace(/\*(?!\s)(.+?)\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?!\s)(.+?)_(?![\w])/g, '$1<em>$2</em>')
      .replace(/~~(?!\s)(.+?)~~/g, '<del>$1</del>');
  }

  function safeLink(url) {
    return /^(https?:\/\/|mailto:)/i.test(url) || !/:/.test(url);
  }

  function anchor(url, label) {
    var external = /^https?:\/\//i.test(url);
    return '<a href="' + url + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
  }

  function inline(text) {
    var stash = [];
    function keep(html) {
      stash.push(html);
      return '\u0001' + (stash.length - 1) + '\u0002';
    }

    text = text.replace(/(`{1,2})([^\n]*?[^`\n])\1(?!`)/g, function (_, ticks, code) {
      return keep('<code>' + esc(code.trim()) + '</code>');
    });
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, function (_, c) { return keep(esc(c)); });
    text = esc(text);

    text = text.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (_, alt, url, title) {
      if (!/^https?:\/\//i.test(url)) { return keep(alt); }
      return keep('<img src="' + url + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy">');
    });
    text = text.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;([^)]*?)&quot;)?\s*\)/g, function (_, label, url, title) {
      if (!safeLink(url)) { return keep(label); }
      var html = anchor(url, emphasis(label));
      if (title) { html = html.replace('<a ', '<a title="' + title + '" '); }
      return keep(html);
    });
    text = text.replace(/&lt;(https?:\/\/[^\s]*?)&gt;/g, function (_, url) { return keep(anchor(url, url)); });
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, function (_, lead, url) {
      var tail = /(&quot;|&gt;|&lt;|[.,;:!?)\]])+$/.exec(url);
      var rest = '';
      if (tail) { rest = tail[0]; url = url.slice(0, url.length - rest.length); }
      if (!url) { return lead + rest; }
      return lead + keep(anchor(url, url)) + rest;
    });

    text = emphasis(text);

    for (var pass = 0; pass < 6; pass++) {
      text = text.replace(/\u0001(\d+)\u0002/g, function (_, i) { return stash[+i]; });
    }
    return text;
  }

  var RE = {
    fence: /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/,
    heading: /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
    hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
    quote: /^\s{0,3}>/,
    list: /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/,
    tableSep: /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/
  };

  function indentOf(line) {
    return line.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  }

  function splitCells(line) {
    line = line.trim();
    if (line.charAt(0) === '|') { line = line.slice(1); }
    var cells = [];
    var cur = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '\\' && line.charAt(i + 1) === '|') {
        cur += '|';
        i++;
      } else if (ch === '|') {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim() !== '' || line.charAt(line.length - 1) !== '|') { cells.push(cur.trim()); }
    return cells;
  }

  function isTableStart(lines, i) {
    return i + 1 < lines.length && lines[i].indexOf('|') !== -1 &&
      lines[i + 1].indexOf('-') !== -1 && RE.tableSep.test(lines[i + 1]) &&
      lines[i + 1].indexOf('|') !== -1;
  }

  function startsBlock(lines, i) {
    var line = lines[i];
    return RE.fence.test(line) || RE.heading.test(line) || RE.hr.test(line) ||
      RE.quote.test(line) || RE.list.test(line) || isTableStart(lines, i);
  }

  function renderTable(lines, i) {
    var head = splitCells(lines[i]);
    var aligns = splitCells(lines[i + 1]).map(function (c) {
      var left = c.charAt(0) === ':';
      var right = c.charAt(c.length - 1) === ':';
      return left && right ? 'center' : (right ? 'right' : (left ? 'left' : ''));
    });
    function cell(tag, text, n) {
      var a = aligns[n] ? ' style="text-align:' + aligns[n] + '"' : '';
      return '<' + tag + a + '>' + inline(text) + '</' + tag + '>';
    }
    var html = '<table><thead><tr>' + head.map(function (c, n) { return cell('th', c, n); }).join('') + '</tr></thead>';
    var rows = [];
    i += 2;
    while (i < lines.length && lines[i].trim() !== '' && lines[i].indexOf('|') !== -1) {
      var cells = splitCells(lines[i]);
      var row = '<tr>';
      for (var n = 0; n < head.length; n++) { row += cell('td', cells[n] || '', n); }
      rows.push(row + '</tr>');
      i++;
    }
    html += rows.length ? '<tbody>' + rows.join('') + '</tbody>' : '';
    return { html: html + '</table>', next: i };
  }

  function renderList(lines, i, depth) {
    var first = RE.list.exec(lines[i]);
    var base = indentOf(lines[i]);
    var ordered = /\d/.test(first[2].charAt(0));
    var start = ordered ? parseInt(first[2], 10) : 1;
    var items = [];

    while (i < lines.length) {
      var m = RE.list.exec(lines[i]);
      if (!m || indentOf(lines[i]) !== base || /\d/.test(m[2].charAt(0)) !== ordered) { break; }

      var itemLines = [m[3]];
      var loose = false;
      i++;
      while (i < lines.length) {
        var l = lines[i];
        if (l.trim() === '') {
          var j = i + 1;
          while (j < lines.length && lines[j].trim() === '') { j++; }
          if (j < lines.length && indentOf(lines[j]) > base) {
            for (; i < j; i++) { itemLines.push(''); }
            loose = true;
            continue;
          }
          break;
        }
        var ind = indentOf(l);
        if (ind > base) {
          itemLines.push(l.replace(/^\s+/, function (ws) {
            return ' '.repeat(Math.max(0, ws.replace(/\t/g, '    ').length - (base + 2)));
          }));
          i++;
        } else if (RE.list.test(l) || startsBlock(lines, i)) {
          break;
        } else {
          itemLines.push(l.trim());
          i++;
        }
      }

      var firstLine = itemLines[0];
      var box = '';
      var task = /^\[([ xX])\]\s+/.exec(firstLine);
      if (task) {
        box = '<input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ';
        itemLines[0] = firstLine.slice(task[0].length);
      }
      var body = renderBlocks(itemLines.join('\n'), depth + 1);
      if (!loose) { body = body.replace(/^<p>([\s\S]*?)<\/p>\n?/, '$1'); }
      items.push('<li' + (task ? ' class="task"' : '') + '>' + box + body + '</li>');
    }

    var tag = ordered ? 'ol' : 'ul';
    var attr = ordered && start !== 1 ? ' start="' + start + '"' : '';
    return { html: '<' + tag + attr + '>' + items.join('') + '</' + tag + '>', next: i };
  }

  function renderBlocks(src, depth) {
    var lines = src.split('\n');
    if (depth > MAX_DEPTH) {
      return '<p>' + inline(src) + '</p>';
    }
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var m;

      if (line.trim() === '') { i++; continue; }

      if ((m = RE.fence.exec(line))) {
        var marker = m[1];
        var lang = m[2];
        var code = [];
        i++;
        while (i < lines.length && lines[i].trim() !== marker) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre><code' + (lang ? ' class="language-' + esc(lang) + '"' : '') + '>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }
      if ((m = RE.heading.exec(line))) {
        var level = m[1].length;
        out.push('<h' + level + '>' + inline(m[2]) + '</h' + level + '>');
        i++;
        continue;
      }
      if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }
      if (isTableStart(lines, i)) {
        var table = renderTable(lines, i);
        out.push(table.html);
        i = table.next;
        continue;
      }
      if (RE.quote.test(line)) {
        var quoted = [];
        while (i < lines.length && lines[i].trim() !== '' && (RE.quote.test(lines[i]) || !startsBlock(lines, i))) {
          quoted.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderBlocks(quoted.join('\n'), depth + 1) + '</blockquote>');
        continue;
      }
      if (RE.list.test(line)) {
        var list = renderList(lines, i, depth);
        out.push(list.html);
        i = list.next;
        continue;
      }

      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) { para.push(lines[i]); i++; }
      out.push('<p>' + inline(para.join('\n')).replace(/(?: {2,}|\\)\n/g, '<br>\n') + '</p>');
    }
    return out.join('\n');
  }

  function render(src) {
    var clean = src.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    return renderBlocks(clean, 0);
  }

  /* ---------- интерфейс ---------- */

  var state = { view: 'split', html: '' };

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) { return many; }
    if (b > 1 && b < 5) { return few; }
    return b === 1 ? one : many;
  }

  function formatBytes(n) {
    return n < 1024 ? n + ' Б' : (n / 1024).toFixed(1).replace('.', ',') + ' КБ';
  }

  function firstTitle(html) {
    var m = /<h[1-6]>([\s\S]*?)<\/h[1-6]>/.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  function update() {
    var value = el.input.value;
    var empty = value.trim() === '';
    state.html = empty ? '' : render(value);
    el.preview.innerHTML = state.html || '<p class="md-empty">Здесь появится предпросмотр.</p>';

    var words = empty ? 0 : (value.trim().match(/\S+/g) || []).length;
    el.count.textContent = words + ' ' + plural(words, 'слово', 'слова', 'слов') + ' · ' +
      value.length + ' ' + plural(value.length, 'символ', 'символа', 'символов');
    if (empty) {
      el.stats.textContent = '';
    } else {
      var minutes = Math.max(1, Math.round(words / 200));
      el.stats.textContent = 'Строк: ' + value.split('\n').length + ' · Чтение ≈ ' + minutes + ' мин · HTML: ' +
        formatBytes(new Blob([state.html]).size);
    }
    el.copyHtml.disabled = el.copyMd.disabled = el.saveMd.disabled = el.saveHtml.disabled = empty;

    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* хранилище недоступно */ }
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(update, 80);
  }

  function setView(view) {
    state.view = view;
    el.panels.className = 'md-panels md-' + view;
    Array.prototype.forEach.call(document.querySelectorAll('#md-views [data-view]'), function (b) {
      var on = b.getAttribute('data-view') === view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function flash(button, text) {
    var old = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', old);
    button.textContent = text;
    setTimeout(function () { button.textContent = old; }, 1500);
  }

  function copy(text, button) {
    var done = function () { flash(button, 'Скопировано'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(area);
  }

  function save(content, type, name) {
    var url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function htmlDocument() {
    var title = firstTitle(state.html) || 'Документ';
    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(title) + '</title>\n<style>\n' +
      'body{max-width:820px;margin:32px auto;padding:0 16px;font:16px/1.65 system-ui,sans-serif;color:#283d59}\n' +
      'pre{padding:14px;overflow:auto;background:#f4f6fa;border-radius:6px}code{font-family:Consolas,monospace}\n' +
      'p code,li code{padding:2px 5px;background:#f4f6fa;border-radius:4px}\n' +
      'table{border-collapse:collapse}th,td{padding:6px 12px;border:1px solid #dde3ec}\n' +
      'blockquote{margin:0;padding:2px 16px;border-left:4px solid #1F65DB;color:#667085}\nimg{max-width:100%}\n' +
      '</style>\n</head>\n<body>\n' + state.html + '\n</body>\n</html>\n';
  }

  /* ---------- форматирование выделенного текста ---------- */

  function fire() {
    el.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wrap(before, after, placeholder) {
    var t = el.input;
    var s = t.selectionStart;
    var e = t.selectionEnd;
    var chosen = t.value.slice(s, e) || placeholder;
    t.focus();
    t.setRangeText(before + chosen + after, s, e, 'end');
    t.setSelectionRange(s + before.length, s + before.length + chosen.length);
    fire();
  }

  function prefixLines(make) {
    var t = el.input;
    var value = t.value;
    var s = value.lastIndexOf('\n', t.selectionStart - 1) + 1;
    var endIdx = value.indexOf('\n', t.selectionEnd);
    var e = endIdx === -1 ? value.length : endIdx;
    var block = value.slice(s, e).split('\n').map(function (line, n) { return make(line, n); }).join('\n');
    t.focus();
    t.setRangeText(block, s, e, 'select');
    fire();
  }

  var ACTIONS = {
    bold: function () { wrap('**', '**', 'жирный текст'); },
    italic: function () { wrap('*', '*', 'курсив'); },
    code: function () {
      var t = el.input;
      if (t.value.slice(t.selectionStart, t.selectionEnd).indexOf('\n') !== -1) {
        wrap('```\n', '\n```', 'код');
      } else {
        wrap('`', '`', 'код');
      }
    },
    heading: function () {
      prefixLines(function (line) {
        var m = /^(#{1,6})\s+/.exec(line);
        if (!m) { return '# ' + line; }
        return m[1].length >= 6 ? line.replace(/^#{1,6}\s+/, '') : '#' + line;
      });
    },
    quote: function () { prefixLines(function (line) { return '> ' + line; }); },
    ul: function () { prefixLines(function (line) { return '- ' + line; }); },
    ol: function () { prefixLines(function (line, n) { return (n + 1) + '. ' + line; }); },
    task: function () { prefixLines(function (line) { return '- [ ] ' + line; }); },
    link: function () {
      var t = el.input;
      var s = t.selectionStart;
      var label = t.value.slice(s, t.selectionEnd) || 'текст ссылки';
      t.focus();
      t.setRangeText('[' + label + '](https://)', s, t.selectionEnd, 'end');
      var urlStart = s + label.length + 3;
      t.setSelectionRange(urlStart, urlStart + 8);
      fire();
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('[data-md]'), function (button) {
    button.addEventListener('click', function () { ACTIONS[button.getAttribute('data-md')](); });
  });

  el.input.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) { return; }
    var key = event.key.toLowerCase();
    var map = { b: 'bold', i: 'italic', k: 'link' };
    if (map[key]) {
      event.preventDefault();
      ACTIONS[map[key]]();
    }
  });

  el.input.addEventListener('input', schedule);
  Array.prototype.forEach.call(document.querySelectorAll('#md-views [data-view]'), function (b) {
    b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
  });

  el.copyHtml.addEventListener('click', function () { copy(state.html, el.copyHtml); });
  el.copyMd.addEventListener('click', function () { copy(el.input.value, el.copyMd); });
  el.saveMd.addEventListener('click', function () { save(el.input.value, 'text/markdown', 'document.md'); });
  el.saveHtml.addEventListener('click', function () { save(htmlDocument(), 'text/html', 'document.html'); });
  el.sample.addEventListener('click', function () { el.input.value = SAMPLE; update(); });
  el.clear.addEventListener('click', function () { el.input.value = ''; update(); el.input.focus(); });

  el.input.maxLength = MAX_LENGTH;

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  el.input.value = saved === null ? SAMPLE : saved;
  setView('split');
  update();
})();
