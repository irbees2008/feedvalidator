(function () {
  'use strict';
  var error = document.getElementById('security-headers-checker-error');
  var urlInput = document.getElementById('sh-url');
  var result = document.getElementById('sh-result');
  var esc = FV.escapeHtml;
  var LABEL = { ok: 'OK', warn: 'Внимание', bad: 'Нет' };

  function csp(v) {
    var l = v.toLowerCase();
    if (/script-src[^;]*'unsafe-inline'/.test(l) || (!/script-src/.test(l) && /default-src[^;]*'unsafe-inline'/.test(l))) {
      return ['warn', 'В script-src разрешён \'unsafe-inline\' — защита от XSS ослаблена.'];
    }
    if (/script-src[^;]*\*|default-src[^;]*\s\*(\s|;|$)/.test(l)) { return ['warn', 'Слишком широкий источник скриптов (*).']; }
    if (!/default-src|script-src/.test(l)) { return ['warn', 'Нет default-src и script-src.']; }
    return ['ok', ''];
  }
  function hsts(v) {
    var m = /max-age=(\d+)/i.exec(v);
    if (!m) { return ['warn', 'Не указан max-age.']; }
    if (+m[1] < 15552000) { return ['warn', 'max-age меньше 180 дней (15552000 с).']; }
    return /includeSubDomains/i.test(v) ? ['ok', ''] : ['ok', 'Можно добавить includeSubDomains.'];
  }
  function xcto(v) { return v.toLowerCase().trim() === 'nosniff' ? ['ok', ''] : ['warn', 'Ожидается nosniff.']; }
  function xfo(v, h) {
    var l = v.toLowerCase().trim();
    if (l === 'deny' || l === 'sameorigin') { return ['ok', '']; }
    return /frame-ancestors/i.test(h['content-security-policy'] || '') ? ['ok', ''] : ['warn', 'Ожидается DENY или SAMEORIGIN.'];
  }
  function referrer(v) {
    return /unsafe-url|no-referrer-when-downgrade/i.test(v) ? ['warn', 'Политика передаёт полный адрес на другие сайты.'] : ['ok', ''];
  }
  function perms(v) { return v.trim() ? ['ok', ''] : ['warn', 'Заголовок пустой.']; }

  var CHECKS = [
    { name: 'Content-Security-Policy', key: 'content-security-policy', weight: 25, fn: csp, hint: 'Ограничивает источники скриптов, стилей и фреймов.' },
    { name: 'Strict-Transport-Security', key: 'strict-transport-security', weight: 20, fn: hsts, https: true, hint: 'Принудительно включает HTTPS: Strict-Transport-Security: max-age=31536000; includeSubDomains.' },
    { name: 'X-Content-Type-Options', key: 'x-content-type-options', weight: 15, fn: xcto, hint: 'Добавьте X-Content-Type-Options: nosniff.' },
    { name: 'X-Frame-Options', key: 'x-frame-options', weight: 15, fn: xfo, hint: 'Защита от кликджекинга: X-Frame-Options: SAMEORIGIN (или CSP frame-ancestors).' },
    { name: 'Referrer-Policy', key: 'referrer-policy', weight: 15, fn: referrer, hint: 'Например: Referrer-Policy: strict-origin-when-cross-origin.' },
    { name: 'Permissions-Policy', key: 'permissions-policy', weight: 10, fn: perms, hint: 'Отключите ненужные функции браузера: Permissions-Policy: camera=(), microphone=(), geolocation=().' }
  ];

  function render(data) {
    var h = {};
    data.headers.forEach(function (p) { h[p[0].toLowerCase()] = p[1]; });
    var score = 0, total = 0, rows = '', missing = 0;
    CHECKS.forEach(function (c) {
      if (c.https && !data.https) {
        rows += '<tr><td>' + c.name + '</td><td>—</td><td>Сайт отвечает по HTTP, заголовок имеет смысл только для HTTPS.</td></tr>';
        return;
      }
      total += c.weight;
      var v = h[c.key], st, note;
      if (v === undefined) { st = 'bad'; note = c.hint; missing++; }
      else {
        var r = c.fn(v, h); st = r[0]; note = r[1];
        score += st === 'ok' ? c.weight : c.weight / 2;
      }
      rows += '<tr><td>' + c.name + '</td><td>' + LABEL[st] + '</td><td>' +
        (v !== undefined ? '<code>' + esc(v.length > 300 ? v.slice(0, 300) + '…' : v) + '</code>' : '') +
        (note ? '<div>' + esc(note) + '</div>' : '') + '</td></tr>';
    });
    var pct = total ? Math.round(score * 100 / total) : 0;
    var grade = pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 55 ? 'C' : pct >= 35 ? 'D' : 'F';
    document.getElementById('sh-summary').textContent = 'Оценка: ' + grade + ' (' + pct + '%). Адрес после перенаправлений: ' +
      data.final_url + '. Отсутствует заголовков: ' + missing + '.';
    document.getElementById('sh-rows').innerHTML = rows;
    var leaks = [];
    ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator'].forEach(function (k) {
      if (h[k] && (k !== 'server' || /\d/.test(h[k]))) { leaks.push('<div><code>' + esc(k) + ': ' + esc(h[k]) + '</code></div>'); }
    });
    document.getElementById('sh-leaks').innerHTML = leaks.length ? leaks.join('') + '<p class="text-muted">Версии ПО помогают атакующему подобрать уязвимости — лучше их скрыть.</p>' : '<p>Версии ПО в заголовках не обнаружены.</p>';
    result.hidden = false;
  }

  function run() {
    FV.clearError(error);
    var url = urlInput.value.trim();
    if (!url) { FV.showError(error, 'Введите адрес сайта.'); return; }
    result.hidden = true;
    FV.postForm('http-status.cgi', { url: url, method: 'GET' }).then(render).catch(function (e) { FV.showError(error, e.message); });
  }

  document.getElementById('sh-run').addEventListener('click', run);
  urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { run(); } });
  document.getElementById('sh-example').addEventListener('click', function () { urlInput.value = 'https://github.com/'; run(); });
})();
