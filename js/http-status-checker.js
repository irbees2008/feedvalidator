(function () {
  'use strict';
  var error = document.getElementById('http-status-checker-error');
  var urlInput = document.getElementById('hs-url');
  var runBtn = document.getElementById('hs-run');
  var copyBtn = document.getElementById('hs-copy');
  var methodGroup = document.getElementById('hs-method');
  var resultBox = document.getElementById('hs-result');
  var summary = document.getElementById('hs-summary');
  var facts = document.getElementById('hs-facts');
  var chainWrap = document.getElementById('hs-chain-wrap');
  var chain = document.getElementById('hs-chain');
  var headers = document.getElementById('hs-headers');
  var method = 'GET';
  var report = '';

  function formatSize(r) {
    if (r.method === 'HEAD' && !r.size) { return 'не определён (HEAD)'; }
    var n = r.size, text = n < 1024 ? n + ' Б' : (n / 1024).toFixed(1) + ' КБ';
    return r.size_exact ? text : 'не менее ' + text;
  }

  function esc(v) { return FV.escapeHtml(v); }

  function render(r) {
    var level = r.status >= 200 && r.status < 300 ? 'ok' : '';
    summary.className = 'fv-result' + (level ? ' ' + level : '');
    summary.textContent = r.status + ' ' + r.reason + ' — ' + r.elapsed_ms + ' мс';

    var rows = [
      ['Итоговый URL', r.final_url],
      ['Перенаправлений', String(r.redirect_count)],
      ['HTTPS', r.https ? 'Да' : 'Нет — итоговый адрес без шифрования'],
      ['Тип содержимого', r.content_type || '—'],
      ['Размер ответа', formatSize(r)],
      ['IP-адрес', r.ip || '—'],
      ['Метод', r.method]
    ];
    facts.innerHTML = rows.map(function (x) {
      return '<tr><th style="width:200px">' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>';
    }).join('');

    chainWrap.hidden = !r.redirects.length;
    var hops = r.redirects.map(function (h, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(h.url) + ' → ' + esc(h.location || '') + '</td><td>' + h.status + '</td><td>' + h.elapsed_ms + ' мс</td></tr>';
    });
    hops.push('<tr><td>' + (r.redirects.length + 1) + '</td><td>' + esc(r.final_url) + '</td><td>' + r.status + '</td><td>' + r.elapsed_ms + ' мс</td></tr>');
    chain.innerHTML = hops.join('');

    headers.innerHTML = r.headers.map(function (h) {
      return '<tr><td><code>' + esc(h[0]) + '</code></td><td style="word-break:break-all">' + esc(h[1]) + '</td></tr>';
    }).join('');

    report = [r.url, summary.textContent, ''].concat(rows.map(function (x) { return x[0] + ': ' + x[1]; }), ['', 'Заголовки:'],
      r.headers.map(function (h) { return h[0] + ': ' + h[1]; })).join('\n');
    resultBox.hidden = false;
    copyBtn.disabled = false;
  }

  function check() {
    var url = urlInput.value.trim();
    FV.clearError(error);
    if (!url) { FV.showError(error, 'Введите адрес для проверки.'); return; }
    runBtn.disabled = true;
    runBtn.textContent = 'Проверяем…';
    resultBox.hidden = true;
    copyBtn.disabled = true;
    FV.postForm('http-status.cgi', { url: url, method: method }).then(render).catch(function (e) {
      FV.showError(error, e.message || 'Не удалось выполнить проверку.');
    }).then(function () {
      runBtn.disabled = false;
      runBtn.textContent = 'Проверить';
    });
  }

  methodGroup.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { return; }
    method = b.getAttribute('data-method');
    Array.prototype.forEach.call(methodGroup.querySelectorAll('button'), function (x) {
      var on = x === b;
      x.classList.toggle('active', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });

  runBtn.addEventListener('click', check);
  urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { check(); } });
  copyBtn.addEventListener('click', function () { FV.copyText(report, copyBtn); });
  document.getElementById('hs-sample').addEventListener('click', function () { urlInput.value = 'http://github.com'; check(); });
})();
