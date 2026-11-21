(function () {
  'use strict';
  var error = document.getElementById('timestamp-converter-error');
  var input = document.getElementById('ts-input');
  var zoneSel = document.getElementById('ts-zone');
  var result = document.getElementById('ts-result');
  var nowEl = document.getElementById('ts-now');
  var ZONES = ['UTC', 'Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Vladivostok',
    'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai'];
  var localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  ZONES.unshift(localZone);
  ZONES.filter(function (z, i) { return ZONES.indexOf(z) === i; }).forEach(function (z, i) {
    var o = document.createElement('option');
    o.value = z;
    o.textContent = i === 0 ? z + ' (ваш)' : z;
    zoneSel.appendChild(o);
  });
  zoneSel.value = localZone;

  function pad(n, l) { n = String(n); while (n.length < (l || 2)) { n = '0' + n; } return n; }

  function iso(d) { return d.toISOString().replace(/\.\d+Z$/, 'Z').replace(/(\.\d+)Z$/, '$1Z'); }

  function inZone(d, zone) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short'
      }).format(d);
    } catch (e) { return '—'; }
  }

  function relative(ms) {
    var diff = Math.round((ms - Date.now()) / 1000);
    var abs = Math.abs(diff);
    var units = [[31536000, 'г.'], [2592000, 'мес.'], [86400, 'дн.'], [3600, 'ч'], [60, 'мин'], [1, 'сек']];
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var v = Math.floor(abs / units[i][0]);
        return diff < 0 ? v + ' ' + units[i][1] + ' назад' : 'через ' + v + ' ' + units[i][1];
      }
    }
    return 'сейчас';
  }

  function parse(raw) {
    var s = raw.trim();
    if (!s) { return null; }
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      var n = parseFloat(s);
      var digits = s.replace(/^-/, '').split('.')[0].length;
      return new Date(digits > 11 ? n : n * 1000);
    }
    return new Date(s.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
  }

  function row(name, value) {
    return '<tr><th>' + FV.escapeHtml(name) + '</th><td><code>' + FV.escapeHtml(value) + '</code></td></tr>';
  }

  function render() {
    FV.clearError(error);
    var d = parse(input.value);
    if (!d) { result.hidden = true; return; }
    if (isNaN(d.getTime()) || Math.abs(d.getTime()) > 8.64e15) {
      result.hidden = true;
      FV.showError(error, 'Не удалось распознать значение. Введите Unix Timestamp или дату, например 2024-05-01 12:30:00.');
      return;
    }
    var ms = d.getTime();
    var rows = row('Unix (секунды)', String(Math.floor(ms / 1000))) +
      row('Unix (миллисекунды)', String(ms)) +
      row('ISO 8601 (UTC)', iso(d)) +
      row('RFC 2822 (UTC)', d.toUTCString()) +
      row('UTC', inZone(d, 'UTC')) +
      row('Ваш часовой пояс', inZone(d, localZone)) +
      row(zoneSel.value, inZone(d, zoneSel.value)) +
      row('Относительно сейчас', relative(ms));
    document.getElementById('ts-table').querySelector('tbody').innerHTML = rows;
    result.hidden = false;
  }

  function tick() { nowEl.textContent = String(Math.floor(Date.now() / 1000)); }
  tick();
  setInterval(tick, 1000);

  input.addEventListener('input', FV.debounce(render, 150));
  zoneSel.addEventListener('change', render);
  document.getElementById('ts-now-btn').addEventListener('click', function () {
    input.value = String(Math.floor(Date.now() / 1000));
    render();
  });
  document.getElementById('ts-clear').addEventListener('click', function () { input.value = ''; render(); });
})();
