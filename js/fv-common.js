/* Общие помощники для инструментов. Подключать до скрипта инструмента. */
(function (global) {
  'use strict';

  var FV = {};

  FV.escapeHtml = function (value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  FV.debounce = function (fn, delay) {
    var timer;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, delay || 200);
    };
  };

  FV.flash = function (button, text, ms) {
    if (!button) { return; }
    if (button._fvText === undefined) { button._fvText = button.textContent; }
    button.textContent = text;
    clearTimeout(button._fvTimer);
    button._fvTimer = setTimeout(function () {
      button.textContent = button._fvText;
      button._fvText = undefined;
    }, ms || 1400);
  };

  FV.copyText = function (text, button) {
    function done() { FV.flash(button, 'Скопировано'); }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (e) { FV.flash(button, 'Не удалось'); }
      document.body.removeChild(area);
    }
    if (navigator.clipboard && global.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  };

  FV.download = function (content, name, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  FV.showError = function (box, message) {
    if (!box) { return; }
    box.textContent = message;
    box.hidden = false;
  };

  FV.clearError = function (box) {
    if (!box) { return; }
    box.textContent = '';
    box.hidden = true;
  };

  FV.storage = {
    get: function (key, fallback) {
      try {
        var v = global.localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { global.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  /* POST к серверному инструменту; сервер отвечает JSON, ошибки приходят как {"error": "..."} */
  FV.postForm = function (url, data) {
    var body = Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    }).join('&');
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) {
        if (!response.ok) { throw new Error(json.error || 'Ошибка запроса (' + response.status + ')'); }
        return json;
      });
    });
  };

  global.FV = FV;
})(window);
