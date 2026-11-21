(function () {
  'use strict';
  var error = document.getElementById('ssl-checker-error');
  var input = document.getElementById('ssl-host');
  var result = document.getElementById('ssl-result');
  var esc = FV.escapeHtml;

  function row(title, value) {
    return '<tr><th>' + title + '</th><td>' + value + '</td></tr>';
  }

  function render(d) {
    var c = d.certificate, rows = '', summary;
    if (!d.valid) {
      summary = 'Сертификат не прошёл проверку: ' + d.verify_error + '.';
    } else if (c.days_left < 0) {
      summary = 'Срок действия сертификата истёк.';
    } else if (c.days_left <= 14) {
      summary = 'Сертификат действителен, но истекает через ' + c.days_left + ' дн. — пора продлевать.';
    } else {
      summary = 'Сертификат действителен, осталось ' + c.days_left + ' дн.';
    }
    document.getElementById('ssl-summary').textContent = summary;
    rows += row('Домен', esc(d.host));
    rows += row('IP-адрес', esc(d.ip));
    rows += row('Версия TLS', esc(d.tls_version || '—') + (/^TLSv1(\.[01])?$/.test(d.tls_version) ? ' (устарела)' : ''));
    rows += row('Шифр', esc(d.cipher || '—'));
    rows += row('HTTP/2', d.http2 ? 'да' : 'нет');
    if (c) {
      rows += row('Выдан для', esc(c.subject));
      rows += row('Издатель', esc(c.issuer) + (c.issuer_cn ? ' (' + esc(c.issuer_cn) + ')' : ''));
      rows += row('Действует с', esc(c.not_before));
      rows += row('Действует до', esc(c.not_after));
      rows += row('Срок действия', c.valid_days + ' дн., осталось ' + c.days_left);
      rows += row('Домены (SAN)', c.san.map(function (s) { return '<code>' + esc(s) + '</code>'; }).join(' ') || '—');
      rows += row('Серийный номер', '<code>' + esc(c.serial) + '</code>');
      if (c.ocsp.length) { rows += row('OCSP', esc(c.ocsp.join(', '))); }
      if (c.ca_issuers.length) { rows += row('Сертификат издателя', esc(c.ca_issuers.join(', '))); }
    } else {
      rows += row('Данные сертификата', 'недоступны, пока он не проходит проверку');
    }
    document.getElementById('ssl-rows').innerHTML = rows;
    result.hidden = false;
  }

  function run() {
    FV.clearError(error);
    var host = input.value.trim();
    if (!host) { FV.showError(error, 'Введите домен.'); return; }
    result.hidden = true;
    FV.postForm('ssl-check.cgi', { host: host }).then(render).catch(function (e) { FV.showError(error, e.message); });
  }

  document.getElementById('ssl-run').addEventListener('click', run);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { run(); } });
  document.getElementById('ssl-example').addEventListener('click', function () { input.value = 'github.com'; run(); });
})();
