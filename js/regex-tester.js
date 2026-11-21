(function () {
  'use strict';
  var error = document.getElementById('regex-tester-error');
  var pattern = document.getElementById('rx-pattern');
  var text = document.getElementById('rx-text');
  var replace = document.getElementById('rx-replace');
  var result = document.getElementById('rx-result');
  var MAX_MATCHES = 1000;
  var MAX_TEXT = 200000;
  var esc = FV.escapeHtml;

  function flags() {
    return Array.prototype.map.call(document.querySelectorAll('#rx-flags input:checked'), function (c) { return c.value; }).join('');
  }

  function run() {
    FV.clearError(error);
    if (!pattern.value) { result.hidden = true; return; }
    if (text.value.length > MAX_TEXT) {
      result.hidden = true;
      FV.showError(error, 'Текст слишком длинный: максимум ' + MAX_TEXT + ' символов.');
      return;
    }
    var f = flags();
    var re;
    try { re = new RegExp(pattern.value, f.indexOf('g') < 0 ? f + 'g' : f); }
    catch (e) { result.hidden = true; FV.showError(error, 'Ошибка в выражении: ' + e.message); return; }

    var src = text.value, matches = [], m, last = 0, html = '', truncated = false;
    while ((m = re.exec(src)) !== null) {
      if (matches.length >= MAX_MATCHES) { truncated = true; break; }
      matches.push(m);
      html += esc(src.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
      if (m[0] === '') { re.lastIndex++; }
    }
    html += esc(src.slice(last));
    document.getElementById('rx-highlight').innerHTML = html;

    var onlyFirst = f.indexOf('g') < 0 && matches.length > 1;
    if (onlyFirst) { matches = matches.slice(0, 1); }
    document.getElementById('rx-summary').textContent = matches.length
      ? 'Совпадений: ' + matches.length + (truncated ? ' (показаны первые ' + MAX_MATCHES + ')' : '') + '.'
      : 'Совпадений нет.';

    var rows = matches.map(function (x, i) {
      var groups = '';
      for (var g = 1; g < x.length; g++) {
        groups += '<div>Группа ' + g + ': <code>' + (x[g] === undefined ? '—' : esc(x[g])) + '</code></div>';
      }
      if (x.groups) {
        Object.keys(x.groups).forEach(function (k) {
          groups += '<div>Имя ' + esc(k) + ': <code>' + (x.groups[k] === undefined ? '—' : esc(x.groups[k])) + '</code></div>';
        });
      }
      return '<tr><td>' + (i + 1) + '</td><td>' + x.index + '</td><td><code>' + esc(x[0]) + '</code></td><td>' + groups + '</td></tr>';
    }).join('');
    document.getElementById('rx-matches').innerHTML = rows
      ? '<div class="b64-table-wrap"><table class="table table-bordered"><thead><tr><th>#</th><th>Позиция</th><th>Совпадение</th><th>Группы</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '';

    var wrap = document.getElementById('rx-replaced-wrap');
    if (replace.value !== '') {
      wrap.hidden = false;
      document.getElementById('rx-replaced').textContent = src.replace(new RegExp(pattern.value, f), replace.value);
    } else { wrap.hidden = true; }
    result.hidden = false;
  }

  var debounced = FV.debounce(run, 200);
  [pattern, text, replace].forEach(function (el) { el.addEventListener('input', debounced); });
  Array.prototype.forEach.call(document.querySelectorAll('#rx-flags input'), function (c) { c.addEventListener('change', run); });
  document.getElementById('rx-example').addEventListener('click', function () {
    pattern.value = '(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})';
    text.value = 'Релиз 2025-01-31, патч 2025-02-14.';
    replace.value = '$<d>.$<m>.$<y>';
    run();
  });
  document.getElementById('rx-clear').addEventListener('click', function () {
    pattern.value = ''; text.value = ''; replace.value = ''; run();
  });
})();
