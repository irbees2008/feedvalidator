(function () {
  'use strict';
  var input = document.getElementById('json-input');
  var errorBox = document.getElementById('json-error');
  var statusBox = document.getElementById('json-status');
  var count = document.getElementById('json-count');
  var indentGroup = document.getElementById('json-indent');
  var sortBox = document.getElementById('json-sort');
  var copyBtn = document.getElementById('json-copy');
  var downloadBtn = document.getElementById('json-download');
  var SAMPLE = '{"title":"Мой блог","items":[{"id":1,"tags":["rss","atom"],"published":true},{"id":2,"tags":[],"published":null}],"version":1.1}';

  var indent = FV.storage.get('fv-json-indent', '2');

  function indentValue() {
    return indent === 'tab' ? '\t' : Number(indent);
  }

  function sortKeys(value) {
    if (Array.isArray(value)) { return value.map(sortKeys); }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = sortKeys(value[k]); });
      return out;
    }
    return value;
  }

  function position(text, message) {
    var lc = /line (\d+) column (\d+)/.exec(message);
    if (lc) { return ' (строка ' + lc[1] + ', столбец ' + lc[2] + ')'; }
    var m = /position (\d+)/.exec(message);
    if (!m) { return ''; }
    var before = text.slice(0, Number(m[1])).split('\n');
    return ' (строка ' + before.length + ', столбец ' + (before[before.length - 1].length + 1) + ')';
  }

  function parse() {
    var text = input.value;
    if (!text.trim()) {
      FV.clearError(errorBox);
      statusBox.hidden = true;
      return { empty: true };
    }
    try {
      return { value: JSON.parse(text) };
    } catch (e) {
      statusBox.hidden = true;
      FV.showError(errorBox, 'Ошибка JSON: ' + e.message + position(text, e.message));
      return { failed: true };
    }
  }

  function ok(text) {
    FV.clearError(errorBox);
    statusBox.className = 'fv-result ok';
    statusBox.textContent = text;
    statusBox.hidden = false;
  }

  function update() {
    var len = input.value.length;
    count.textContent = len ? len + ' симв.' : '';
    copyBtn.disabled = downloadBtn.disabled = !len;
  }

  function run(minify) {
    var r = parse();
    if (r.empty || r.failed) { return; }
    var value = sortBox.checked ? sortKeys(r.value) : r.value;
    input.value = JSON.stringify(value, null, minify ? 0 : indentValue());
    ok(minify ? 'JSON корректен, сжат.' : 'JSON корректен, отформатирован.');
    update();
  }

  function markIndent() {
    Array.prototype.forEach.call(indentGroup.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-indent') === indent;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  indentGroup.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { return; }
    indent = b.getAttribute('data-indent');
    FV.storage.set('fv-json-indent', indent);
    markIndent();
  });

  document.getElementById('json-format').addEventListener('click', function () { run(false); });
  document.getElementById('json-minify').addEventListener('click', function () { run(true); });
  copyBtn.addEventListener('click', function () { FV.copyText(input.value, copyBtn); });
  downloadBtn.addEventListener('click', function () { FV.download(input.value, 'data.json', 'application/json;charset=utf-8'); });
  document.getElementById('json-sample').addEventListener('click', function () { input.value = SAMPLE; run(false); });
  document.getElementById('json-clear').addEventListener('click', function () {
    input.value = '';
    FV.clearError(errorBox);
    statusBox.hidden = true;
    update();
  });
  input.addEventListener('input', FV.debounce(function () {
    update();
    var r = parse();
    if (r.value !== undefined) { ok('JSON корректен.'); }
  }, 300));

  markIndent();
  update();
})();
