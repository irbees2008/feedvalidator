(function () {
  'use strict';
  var error = document.getElementById('php-compat-checker-error');
  var codeEl = document.getElementById('pc-code');
  var targetEl = document.getElementById('pc-target');
  var result = document.getElementById('pc-result');
  var summary = document.getElementById('pc-summary');
  var list = document.getElementById('pc-issues');
  var busy = false;

  function item(cls, label, msg, hint, line) {
    var li = document.createElement('li');
    li.className = cls;
    li.innerHTML = (line ? '<span class="ln">стр. ' + line + '</span> ' : '') + '<strong>' + label + ':</strong> ' + FV.escapeHtml(msg) +
      (hint ? '<span class="hint">' + FV.escapeHtml(hint) + '</span>' : '');
    list.appendChild(li);
  }

  function render(r) {
    list.innerHTML = '';
    r.syntax_errors.forEach(function (e) { item('sev-error', 'Синтаксис', e.message, '', e.line); });
    var order = { error: 0, warn: 1, info: 2 };
    var labels = { error: 'Ошибка', warn: 'Внимание', info: 'Совет' };
    var cnt = 0;
    r.issues.slice().sort(function (a, b) { return a.line - b.line || order[a.severity] - order[b.severity]; }).forEach(function (i) {
      cnt++;
      item('sev-' + i.severity, labels[i.severity] || i.severity, i.message, i.hint, i.line);
    });
    if (!r.syntax_errors.length && !cnt) { list.innerHTML = '<li class="sev-info">Проблем совместимости с PHP ' + FV.escapeHtml(r.target) + ' не найдено.</li>'; }
    summary.textContent = 'Синтаксис (PHP ' + r.php_version + ' на сервере): ' + (r.syntax_ok ? 'ошибок нет' : 'есть ошибки') +
      '. Целевая версия: ' + r.target + '. Замечаний совместимости: ' + cnt + '.';
    result.hidden = false;
  }

  function run() {
    FV.clearError(error);
    if (busy) { return; }
    var code = codeEl.value;
    if (!code.trim()) { FV.showError(error, 'Вставьте PHP-код.'); return; }
    if (code.length > 200000) { FV.showError(error, 'Код длиннее 200 000 символов.'); return; }
    busy = true;
    FV.postForm('php-compat.cgi', { code: code, target: targetEl.value })
      .then(render)
      .catch(function (e) { result.hidden = true; FV.showError(error, e.message); })
      .then(function () { busy = false; });
  }

  document.getElementById('pc-run').addEventListener('click', run);
  document.getElementById('pc-clear').addEventListener('click', function () { codeEl.value = ''; result.hidden = true; });
})();
