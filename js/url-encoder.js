(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var el = {
    input: $('url-input'),
    output: $('url-output'),
    inLabel: $('url-input-label'),
    outLabel: $('url-output-label'),
    inCount: $('url-in-count'),
    outCount: $('url-out-count'),
    error: $('url-error'),
    plus: $('url-plus'),
    copy: $('url-copy'),
    swap: $('url-swap'),
    sample: $('url-sample'),
    clear: $('url-clear'),
    params: $('url-params'),
    paramsBody: $('url-params-body')
  };

  var state = { mode: 'encode', scope: 'component' };
  var SAMPLE = 'https://example.com/search?q=привет мир&tag=a&b=c#раздел 1';

  function setSeg(containerId, attr, value) {
    Array.prototype.forEach.call($(containerId).querySelectorAll('[' + attr + ']'), function (b) {
      var on = b.getAttribute(attr) === value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function convert(text) {
    if (state.mode === 'encode') {
      var encoded = state.scope === 'component' ? encodeURIComponent(text) : encodeURI(text);
      return el.plus.checked ? encoded.replace(/%20/g, '+') : encoded;
    }
    var src = el.plus.checked ? text.replace(/\+/g, ' ') : text;
    return state.scope === 'component' ? decodeURIComponent(src) : decodeURI(src);
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; }
  }

  function renderParams(text) {
    var source = state.mode === 'encode' ? text : text;
    var hashAt = source.indexOf('#');
    if (hashAt !== -1) { source = source.slice(0, hashAt); }
    var q = source.indexOf('?');
    var query = q !== -1 ? source.slice(q + 1) : (source.indexOf('=') !== -1 && !/\s/.test(source) ? source : '');
    el.paramsBody.textContent = '';
    if (!query) { el.params.hidden = true; return; }
    var rows = 0;
    query.split('&').forEach(function (pair) {
      if (!pair) { return; }
      var eq = pair.indexOf('=');
      var tr = document.createElement('tr');
      var k = document.createElement('td');
      var v = document.createElement('td');
      k.textContent = safeDecode(eq === -1 ? pair : pair.slice(0, eq));
      v.textContent = eq === -1 ? '' : safeDecode(pair.slice(eq + 1));
      tr.appendChild(k);
      tr.appendChild(v);
      el.paramsBody.appendChild(tr);
      rows++;
    });
    el.params.hidden = rows === 0;
  }

  function count(n) { return n + ' симв.'; }

  function update() {
    var text = el.input.value;
    var encode = state.mode === 'encode';
    el.inLabel.textContent = encode ? 'Исходный текст' : 'Закодированный URL';
    el.outLabel.textContent = encode ? 'Закодированный результат' : 'Декодированный текст';
    el.input.placeholder = encode ? 'Вставьте текст или адрес…' : 'Вставьте строку вида %D0%BF%D1%80…';

    el.error.hidden = true;
    var result = '';
    var failed = false;
    if (text !== '') {
      try {
        result = convert(text);
      } catch (e) {
        failed = true;
        el.error.textContent = 'Не удалось декодировать: в строке есть некорректная последовательность %XX.';
        el.error.hidden = false;
      }
    }
    el.output.value = result;
    el.inCount.textContent = text ? count(text.length) : '';
    el.outCount.textContent = result ? count(result.length) : '';
    el.copy.disabled = !result;
    el.swap.disabled = !result;
    el.clear.disabled = !text;
    if (failed || !text) { el.params.hidden = true; } else { renderParams(encode ? text : result); }
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
    el.output.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
  }

  Array.prototype.forEach.call($('url-mode').querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () {
      state.mode = b.getAttribute('data-mode');
      setSeg('url-mode', 'data-mode', state.mode);
      update();
    });
  });
  Array.prototype.forEach.call($('url-scope').querySelectorAll('[data-scope]'), function (b) {
    b.addEventListener('click', function () {
      state.scope = b.getAttribute('data-scope');
      setSeg('url-scope', 'data-scope', state.scope);
      update();
    });
  });

  el.input.addEventListener('input', update);
  el.plus.addEventListener('change', update);
  el.copy.addEventListener('click', function () { copy(el.output.value, el.copy); });
  el.swap.addEventListener('click', function () {
    var result = el.output.value;
    state.mode = state.mode === 'encode' ? 'decode' : 'encode';
    setSeg('url-mode', 'data-mode', state.mode);
    el.input.value = result;
    update();
  });
  el.sample.addEventListener('click', function () {
    state.mode = 'encode';
    setSeg('url-mode', 'data-mode', 'encode');
    el.input.value = SAMPLE;
    update();
  });
  el.clear.addEventListener('click', function () {
    el.input.value = '';
    update();
    el.input.focus();
  });

  update();
})();
