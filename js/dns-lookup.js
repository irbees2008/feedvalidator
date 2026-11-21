(function () {
  'use strict';
  var error = document.getElementById('dns-lookup-error');
  var nameInput = document.getElementById('dns-name');
  var typeSelect = document.getElementById('dns-type');
  var resolverSelect = document.getElementById('dns-resolver');
  var runBtn = document.getElementById('dns-run');
  var copyBtn = document.getElementById('dns-copy');
  var resultBox = document.getElementById('dns-result');
  var summary = document.getElementById('dns-summary');
  var body = document.getElementById('dns-records');
  var report = '';

  function esc(v) { return FV.escapeHtml(v); }

  function render(r) {
    if (r.nxdomain) {
      summary.className = 'fv-result';
      summary.textContent = 'Домен ' + r.name + ' не существует (NXDOMAIN). Сервер: ' + r.resolver + '.';
    } else if (!r.records.length) {
      summary.className = 'fv-result';
      summary.textContent = 'Записей типа ' + r.query_type + ' для ' + r.name + ' нет. Сервер: ' + r.resolver + '.';
    } else {
      summary.className = 'fv-result ok';
      summary.textContent = 'Найдено записей ' + r.query_type + ': ' + r.records.length + '. Сервер: ' + r.resolver + '.';
    }
    body.innerHTML = r.records.length ? r.records.map(function (x) {
      return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.type) + '</td><td>' + x.ttl + '</td><td style="word-break:break-all">' + esc(x.value) + '</td></tr>';
    }).join('') : '<tr><td colspan="4">Нет записей.</td></tr>';
    report = summary.textContent + '\n' + r.records.map(function (x) {
      return x.name + '\t' + x.ttl + '\t' + x.type + '\t' + x.value;
    }).join('\n');
    resultBox.hidden = false;
    copyBtn.disabled = false;
  }

  function run() {
    var name = nameInput.value.trim();
    FV.clearError(error);
    if (!name) { FV.showError(error, 'Введите домен или IP-адрес.'); return; }
    runBtn.disabled = true;
    runBtn.textContent = 'Запрос…';
    resultBox.hidden = true;
    copyBtn.disabled = true;
    FV.postForm('dns-lookup.cgi', { name: name, type: typeSelect.value, resolver: resolverSelect.value }).then(render).catch(function (e) {
      FV.showError(error, e.message || 'Не удалось выполнить запрос.');
    }).then(function () {
      runBtn.disabled = false;
      runBtn.textContent = 'Запросить';
    });
  }

  runBtn.addEventListener('click', run);
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { run(); } });
  copyBtn.addEventListener('click', function () { FV.copyText(report, copyBtn); });
  document.getElementById('dns-sample').addEventListener('click', function () {
    nameInput.value = 'google.com';
    typeSelect.value = 'MX';
    run();
  });
})();
