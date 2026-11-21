(function () {
  'use strict';
  var error = document.getElementById('jwt-decoder-error');
  var input = document.getElementById('jwt-input');
  var result = document.getElementById('jwt-result');
  var lastPayload = '';
  var EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQxMDI0NDQ4MDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  var TIME_CLAIMS = { iat: 'Выдан (iat)', nbf: 'Действует с (nbf)', exp: 'Истекает (exp)' };

  function decodePart(part) {
    var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) { b64 += '='; }
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  function pretty(value) { return JSON.stringify(value, null, 2); }

  function fmtDate(sec) {
    var d = new Date(sec * 1000);
    return isNaN(d.getTime()) ? String(sec) : d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }

  function render() {
    FV.clearError(error);
    var token = input.value.trim().replace(/^Bearer\s+/i, '');
    if (!token) { result.hidden = true; return; }
    var parts = token.split('.');
    if (parts.length !== 3 && parts.length !== 2) {
      result.hidden = true;
      FV.showError(error, 'JWT должен состоять из трёх частей, разделённых точками.');
      return;
    }
    var header, payload;
    try {
      header = decodePart(parts[0]);
      payload = decodePart(parts[1]);
    } catch (e) {
      result.hidden = true;
      FV.showError(error, 'Не удалось расшифровать токен: части должны быть Base64URL с JSON внутри.');
      return;
    }
    var notes = [];
    var alg = header && header.alg;
    if (!alg) { notes.push('в заголовке нет alg'); }
    if (alg === 'none' || !parts[2]) { notes.push('токен без подписи (alg: none) — не доверяйте ему'); }
    var now = Math.floor(Date.now() / 1000);
    var rows = '';
    Object.keys(TIME_CLAIMS).forEach(function (k) {
      if (payload && typeof payload[k] === 'number') {
        rows += '<tr><th>' + TIME_CLAIMS[k] + '</th><td>' + FV.escapeHtml(fmtDate(payload[k])) + '</td></tr>';
      }
    });
    if (payload && typeof payload.exp === 'number') {
      notes.push(payload.exp < now ? 'срок действия истёк' : 'срок действия не истёк');
    }
    if (payload && typeof payload.nbf === 'number' && payload.nbf > now) { notes.push('токен ещё не действует (nbf)'); }
    lastPayload = pretty(payload);
    document.getElementById('jwt-header').textContent = pretty(header);
    document.getElementById('jwt-payload').textContent = lastPayload;
    document.getElementById('jwt-times').querySelector('tbody').innerHTML = rows || '<tr><td>Полей iat, nbf, exp нет.</td></tr>';
    document.getElementById('jwt-signature').textContent = parts[2] || '(пусто)';
    document.getElementById('jwt-status').textContent = 'Алгоритм: ' + (alg || '—') + (notes.length ? '. Замечания: ' + notes.join('; ') + '.' : '.');
    result.hidden = false;
  }

  input.addEventListener('input', FV.debounce(render, 200));
  document.getElementById('jwt-example').addEventListener('click', function () { input.value = EXAMPLE; render(); });
  document.getElementById('jwt-clear').addEventListener('click', function () { input.value = ''; render(); });
  document.getElementById('jwt-copy-payload').addEventListener('click', function () { FV.copyText(lastPayload); });
})();
