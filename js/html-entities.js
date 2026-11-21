(function () {
  'use strict';
  var error = document.getElementById('html-entities-error');
  var input = document.getElementById('he-input');
  var output = document.getElementById('he-output');
  var scope = document.getElementById('he-scope');
  var mode = FV.storage.get('he-mode') === 'decode' ? 'decode' : 'encode';
  var BASIC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var NAMED = {
    '\u00a0': '&nbsp;', '\u00a9': '&copy;', '\u00ae': '&reg;', '\u2122': '&trade;', '\u20ac': '&euro;',
    '\u00a3': '&pound;', '\u00a5': '&yen;', '\u00a2': '&cent;', '\u00a7': '&sect;', '\u00b0': '&deg;',
    '\u00b1': '&plusmn;', '\u00d7': '&times;', '\u00f7': '&divide;', '\u00ab': '&laquo;', '\u00bb': '&raquo;',
    '\u2013': '&ndash;', '\u2014': '&mdash;', '\u2018': '&lsquo;', '\u2019': '&rsquo;', '\u201c': '&ldquo;',
    '\u201d': '&rdquo;', '\u2026': '&hellip;', '\u2022': '&bull;', '\u2190': '&larr;', '\u2192': '&rarr;',
    '\u2191': '&uarr;', '\u2193': '&darr;', '\u00b6': '&para;', '\u00b5': '&micro;'
  };

  function encode(text, kind) {
    var out = '';
    for (var ch of text) {
      var cp = ch.codePointAt(0);
      if (BASIC[ch]) { out += BASIC[ch]; }
      else if (kind === 'named' && NAMED[ch]) { out += NAMED[ch]; }
      else if (cp > 127 && kind === 'dec') { out += '&#' + cp + ';'; }
      else if (cp > 127 && kind === 'hex') { out += '&#x' + cp.toString(16).toUpperCase() + ';'; }
      else { out += ch; }
    }
    return out;
  }

  // textarea.innerHTML только декодирует сущности и не выполняет разметку
  function decode(text) {
    var area = document.createElement('textarea');
    area.innerHTML = text.replace(/</g, '&lt;');
    return area.value;
  }

  function update() {
    FV.clearError(error);
    output.value = mode === 'encode' ? encode(input.value, scope.value) : decode(input.value);
    scope.disabled = mode !== 'encode';
  }

  function setMode(next) {
    mode = next;
    FV.storage.set('he-mode', next);
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === next);
    });
    update();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  input.addEventListener('input', FV.debounce(update, 150));
  scope.addEventListener('change', update);
  document.getElementById('he-copy').addEventListener('click', function () { FV.copyText(output.value); });
  document.getElementById('he-swap').addEventListener('click', function () { input.value = output.value; update(); });
  document.getElementById('he-clear').addEventListener('click', function () { input.value = ''; update(); });
  setMode(mode);
})();
