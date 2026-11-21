(function () {
  'use strict';
  var error = document.getElementById('user-agent-parser-error');
  var input = document.getElementById('ua-input');
  var result = document.getElementById('ua-result');
  var BOT = /(googlebot|bingbot|yandex(?:bot|images|mobilebot|metrika|direct)?|baiduspider|duckduckbot|slurp|applebot|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|curl|wget|python-requests|go-http-client|okhttp|libwww|java\/|scrapy|headlesschrome|bot|crawler|spider)[\/ ]?([\d.]*)/i;
  var EXAMPLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

  function first(ua, list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i][1].exec(ua);
      if (m) { return [list[i][0], m[1] || '']; }
    }
    return null;
  }

  function browser(ua) {
    return first(ua, [
      ['Microsoft Edge', /\b(?:Edg|EdgA|EdgiOS|Edge)\/([\d.]+)/],
      ['Opera', /\b(?:OPR|Opera)\/([\d.]+)/],
      ['Yandex Browser', /\bYaBrowser\/([\d.]+)/],
      ['Samsung Internet', /\bSamsungBrowser\/([\d.]+)/],
      ['Vivaldi', /\bVivaldi\/([\d.]+)/],
      ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
      ['Safari', /\bVersion\/([\d.]+).*Safari\//],
      ['Internet Explorer', /\bMSIE ([\d.]+)/],
      ['Internet Explorer', /\bTrident\/.*rv:([\d.]+)/]
    ]);
  }

  function engine(ua) {
    if (/\bTrident\//.test(ua) || /\bMSIE /.test(ua)) { return ['Trident', (/Trident\/([\d.]+)/.exec(ua) || [])[1] || '']; }
    if (/\bGecko\/\d/.test(ua) && /\bFirefox\//.test(ua) || /\bFxiOS\//.test(ua)) {
      return /\bFxiOS\//.test(ua) ? ['WebKit', (/AppleWebKit\/([\d.]+)/.exec(ua) || [])[1] || ''] : ['Gecko', (/rv:([\d.]+)/.exec(ua) || [])[1] || ''];
    }
    if (/\b(?:Chrome|CriOS|Edg|EdgA|OPR)\//.test(ua) && !/\bEdge\//.test(ua)) { return ['Blink', (/Chrome\/([\d.]+)/.exec(ua) || [])[1] || '']; }
    if (/AppleWebKit\//.test(ua)) { return ['WebKit', (/AppleWebKit\/([\d.]+)/.exec(ua) || [])[1] || '']; }
    return null;
  }

  function os(ua) {
    var m;
    if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
      var map = { '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
      return ['Windows', map[m[1]] || m[1]];
    }
    if ((m = /Android ([\d.]+)/.exec(ua))) { return ['Android', m[1]]; }
    if ((m = /(?:iPhone|CPU) OS ([\d_]+)/.exec(ua))) { return [/iPad/.test(ua) ? 'iPadOS' : 'iOS', m[1].replace(/_/g, '.')]; }
    if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) { return ['macOS', m[1].replace(/_/g, '.')]; }
    if (/CrOS/.test(ua)) { return ['Chrome OS', '']; }
    if (/Ubuntu/.test(ua)) { return ['Ubuntu', '']; }
    if (/Linux/.test(ua)) { return ['Linux', '']; }
    if (/Android/.test(ua)) { return ['Android', '']; }
    return null;
  }

  function device(ua, bot) {
    if (bot) { return 'Бот / программа'; }
    if (/iPad|Tablet|Nexus 7|Nexus 9|SM-T/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) { return 'Планшет'; }
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) { return 'Телефон'; }
    if (/SmartTV|SMART-TV|HbbTV|Tizen|Web0S|AppleTV/i.test(ua)) { return 'Телевизор'; }
    if (/PlayStation|Xbox|Nintendo/i.test(ua)) { return 'Игровая консоль'; }
    return 'Компьютер';
  }

  function arch(ua) {
    if (/WOW64|Win64|x64|x86_64|amd64/i.test(ua)) { return 'x64'; }
    if (/arm64|aarch64/i.test(ua)) { return 'ARM64'; }
    if (/\barm/i.test(ua)) { return 'ARM'; }
    if (/i[3-6]86|x86/i.test(ua)) { return 'x86'; }
    return '';
  }

  function row(name, value) {
    return '<tr><th>' + FV.escapeHtml(name) + '</th><td>' + FV.escapeHtml(value || '—') + '</td></tr>';
  }

  function ver(pair) { return pair ? (pair[0] + (pair[1] ? ' ' + pair[1] : '')) : ''; }

  function render() {
    FV.clearError(error);
    var ua = input.value.trim();
    if (!ua) { result.hidden = true; return; }
    if (ua.length > 2000) {
      result.hidden = true;
      FV.showError(error, 'Строка слишком длинная (максимум 2000 символов).');
      return;
    }
    var botMatch = BOT.exec(ua);
    var bot = botMatch && !/^Mozilla\/5\.0 \([^)]*\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Chrome\/[\d.]+ Safari\/[\d.]+$/.test(ua) ? botMatch : null;
    var b = bot ? [bot[1], bot[2] || ''] : browser(ua);
    var o = os(ua);
    var e = engine(ua);
    document.getElementById('ua-table').querySelector('tbody').innerHTML =
      row('Тип', bot ? 'Бот / скрипт' : 'Браузер') +
      row(bot ? 'Название бота' : 'Браузер', b ? b[0] : '') +
      row('Версия', b ? b[1] : '') +
      row('Движок', ver(e)) +
      row('Операционная система', ver(o)) +
      row('Архитектура', arch(ua)) +
      row('Устройство', device(ua, bot));
    result.hidden = false;
  }

  input.addEventListener('input', FV.debounce(render, 200));
  document.getElementById('ua-mine').addEventListener('click', function () { input.value = navigator.userAgent; render(); });
  document.getElementById('ua-example').addEventListener('click', function () { input.value = EXAMPLE; render(); });
  document.getElementById('ua-clear').addEventListener('click', function () { input.value = ''; render(); });
  input.value = navigator.userAgent;
  render();
})();
