(function () {
  'use strict';
  var error = document.getElementById('meta-tags-analyzer-error');
  var input = document.getElementById('meta-input');
  var result = document.getElementById('meta-result');
  var summary = document.getElementById('meta-summary');
  var body = document.getElementById('meta-body');
  var count = document.getElementById('meta-count');
  var SAMPLE = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<title>Мой блог о RSS</title>\n<meta name="description" content="Короткое описание.">\n<meta name="robots" content="noindex,follow">\n<link rel="canonical" href="/blog">\n<meta property="og:title" content="Мой блог о RSS">\n<meta property="og:type" content="website">\n</head>\n<body></body>\n</html>';

  function meta(doc, attr, name) {
    var el = doc.querySelector('meta[' + attr + '="' + name + '" i]');
    return el ? (el.getAttribute('content') || '').trim() : null;
  }

  function lengthCheck(value, min, max, unit) {
    var n = value.length;
    if (!n) { return ['bad', 'Пусто']; }
    if (n < min) { return ['warn', 'Коротко (' + n + ' ' + unit + ', от ' + min + ')']; }
    if (n > max) { return ['warn', 'Длинно (' + n + ' ' + unit + ', до ' + max + ')']; }
    return ['ok', 'Хорошо (' + n + ' ' + unit + ')'];
  }

  function analyse(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var rows = [];
    function add(tag, value, check) { rows.push({ tag: tag, value: value, level: check[0], note: check[1] }); }
    function missing(tag, level, note) { rows.push({ tag: tag, value: '', level: level, note: note }); }

    var titles = doc.querySelectorAll('title');
    if (!titles.length) { missing('title', 'bad', 'Не найден'); }
    else {
      var t = titles[0].textContent.trim();
      add('title', t, lengthCheck(t, 30, 60, 'симв.'));
      if (titles.length > 1) { missing('title (повтор)', 'warn', 'Найдено тегов title: ' + titles.length); }
    }

    var desc = meta(doc, 'name', 'description');
    if (desc === null) { missing('description', 'bad', 'Не найден'); }
    else { add('description', desc, lengthCheck(desc, 70, 160, 'симв.')); }

    var robots = meta(doc, 'name', 'robots');
    if (robots === null) { missing('robots', 'info', 'Не задан (по умолчанию index, follow)'); }
    else { add('robots', robots, /noindex/i.test(robots) ? ['warn', 'Страница закрыта от индексации'] : ['ok', 'Индексация разрешена']); }

    var canon = doc.querySelector('link[rel~="canonical" i]');
    if (!canon) { missing('canonical', 'warn', 'Не найден'); }
    else {
      var href = (canon.getAttribute('href') || '').trim();
      add('canonical', href, /^https?:\/\//i.test(href) ? ['ok', 'Абсолютный адрес'] : ['warn', 'Нужен абсолютный адрес']);
    }

    var vp = meta(doc, 'name', 'viewport');
    if (vp === null) { missing('viewport', 'warn', 'Не найден (мобильная версия)'); } else { add('viewport', vp, ['ok', 'Задан']); }

    var charset = doc.querySelector('meta[charset]');
    var charsetValue = charset ? charset.getAttribute('charset') : meta(doc, 'http-equiv', 'content-type');
    if (!charsetValue) { missing('charset', 'warn', 'Не найден'); } else { add('charset', charsetValue, ['ok', 'Задан']); }

    var lang = doc.documentElement.getAttribute('lang');
    if (!lang) { missing('html lang', 'warn', 'Не указан'); } else { add('html lang', lang, ['ok', 'Задан']); }

    ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].forEach(function (p) {
      var v = meta(doc, 'property', p);
      if (v === null) { missing(p, p === 'og:image' ? 'warn' : 'info', 'Не найден'); }
      else if (!v) { missing(p, 'bad', 'Пусто'); }
      else { add(p, v, ['ok', 'Задан']); }
    });

    var card = meta(doc, 'name', 'twitter:card');
    if (card === null) { missing('twitter:card', 'info', 'Не найден'); } else { add('twitter:card', card, ['ok', 'Задан']); }
    return rows;
  }

  var LABEL = { ok: 'OK', warn: 'Внимание', bad: 'Ошибка', info: 'Совет' };
  var COLOR = { ok: '#1b6b3a', warn: '#a06a00', bad: '#b4234a', info: '#667085' };

  function render(rows) {
    var counts = { ok: 0, warn: 0, bad: 0, info: 0 };
    body.innerHTML = rows.map(function (r) {
      counts[r.level]++;
      return '<tr><td><code>' + FV.escapeHtml(r.tag) + '</code></td><td>' +
        (r.value ? FV.escapeHtml(r.value) : '<span class="md-empty">—</span>') +
        '</td><td style="color:' + COLOR[r.level] + '"><strong>' + LABEL[r.level] + '</strong>: ' + FV.escapeHtml(r.note) + '</td></tr>';
    }).join('');
    summary.className = 'fv-result' + (counts.bad || counts.warn ? '' : ' ok');
    summary.textContent = 'OK: ' + counts.ok + ', внимание: ' + counts.warn + ', ошибки: ' + counts.bad + ', советы: ' + counts.info;
    result.hidden = false;
  }

  function run() {
    var html = input.value;
    result.hidden = true;
    if (!html.trim()) { FV.showError(error, 'Вставьте HTML для анализа.'); return; }
    FV.clearError(error);
    render(analyse(html));
  }

  document.getElementById('meta-run').addEventListener('click', run);
  document.getElementById('meta-sample').addEventListener('click', function () { input.value = SAMPLE; update(); run(); });
  document.getElementById('meta-clear').addEventListener('click', function () {
    input.value = '';
    result.hidden = true;
    FV.clearError(error);
    update();
  });
  function update() { count.textContent = input.value.length ? input.value.length + ' симв.' : ''; }
  input.addEventListener('input', update);
  update();
})();
