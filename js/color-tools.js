(function () {
  'use strict';
  var error = document.getElementById('color-tools-error');
  var input = document.getElementById('clr-input');
  var picker = document.getElementById('clr-picker');
  var bgInput = document.getElementById('clr-bg');
  var bgPicker = document.getElementById('clr-bg-picker');
  var NAMED = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
    orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', cyan: '#00ffff',
    magenta: '#ff00ff', brown: '#a52a2a', navy: '#000080', teal: '#008080', lime: '#00ff00', silver: '#c0c0c0'
  };

  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function hex2(n) { var s = Math.round(n).toString(16); return s.length < 2 ? '0' + s : s; }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    if (s === 0) { return [l * 255, l * 255, l * 255]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function f(t) {
      if (t < 0) { t += 1; } if (t > 1) { t -= 1; }
      if (t < 1 / 6) { return p + (q - p) * 6 * t; }
      if (t < 1 / 2) { return q; }
      if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
      return p;
    }
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) { h = (g - b) / d + (g < b ? 6 : 0); }
      else if (max === g) { h = (b - r) / d + 2; }
      else { h = (r - g) / d + 4; }
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = rgbToHsl(r * 255, g * 255, b * 255)[0];
    return [h, max === 0 ? 0 : d / max * 100, max * 100];
  }

  function parse(raw) {
    var s = raw.trim().toLowerCase(), m;
    if (NAMED[s]) { s = NAMED[s]; }
    if ((m = /^#?([0-9a-f]{3})$/.exec(s))) {
      return m[1].split('').map(function (c) { return parseInt(c + c, 16); });
    }
    if ((m = /^#?([0-9a-f]{6})$/.exec(s))) {
      return [parseInt(m[1].substr(0, 2), 16), parseInt(m[1].substr(2, 2), 16), parseInt(m[1].substr(4, 2), 16)];
    }
    if ((m = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/.exec(s))) {
      return [+m[1], +m[2], +m[3]].map(function (n) { return clamp(n, 0, 255); });
    }
    if ((m = /^hsl\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*\)$/.exec(s))) {
      return hslToRgb(+m[1], clamp(+m[2], 0, 100), clamp(+m[3], 0, 100)).map(Math.round);
    }
    return null;
  }

  function toHex(c) { return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }

  function luminance(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function row(name, value) {
    return '<tr><th>' + name + '</th><td><code>' + FV.escapeHtml(value) + '</code> ' +
      '<button type="button" class="b64-seg-btn fv-copy" data-copy="' + FV.escapeHtml(value) + '">Копировать</button></td></tr>';
  }

  function verdict(ok) { return ok ? '<span class="fv-ok">да</span>' : '<span class="fv-bad">нет</span>'; }

  function render() {
    FV.clearError(error);
    var c = parse(input.value), bg = parse(bgInput.value);
    if (!c) { FV.showError(error, 'Не удалось распознать цвет. Примеры: #1f65db, rgb(31,101,219), hsl(217,75%,49%), red.'); return; }
    if (!bg) { FV.showError(error, 'Не удалось распознать цвет фона.'); return; }
    var hsl = rgbToHsl(c[0], c[1], c[2]).map(Math.round);
    var hsv = rgbToHsv(c[0], c[1], c[2]).map(Math.round);
    picker.value = toHex(c);
    bgPicker.value = toHex(bg);
    document.getElementById('clr-swatch').style.background = toHex(c);
    document.getElementById('clr-table').querySelector('tbody').innerHTML =
      row('HEX', toHex(c)) +
      row('RGB', 'rgb(' + c.join(', ') + ')') +
      row('HSL', 'hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)') +
      row('HSV', 'hsv(' + hsv[0] + ', ' + hsv[1] + '%, ' + hsv[2] + '%)');

    var ratio = contrast(c, bg);
    document.getElementById('clr-contrast').innerHTML =
      '<div class="fv-contrast-sample" style="color:' + toHex(c) + ';background:' + toHex(bg) + '">Пример текста Aa</div>' +
      '<p>Контрастность: <strong>' + ratio.toFixed(2) + ' : 1</strong></p>' +
      '<p>AA обычный текст (4.5): ' + verdict(ratio >= 4.5) + ' · AA крупный (3): ' + verdict(ratio >= 3) +
      ' · AAA (7): ' + verdict(ratio >= 7) + '</p>';

    var pal = [];
    [-30, -15, 0, 15, 30].forEach(function (d) {
      pal.push(toHex(hslToRgb(hsl[0], hsl[1], clamp(hsl[2] + d, 3, 97)).map(Math.round)));
    });
    [180, 30, -30, 120, 240].forEach(function (d) {
      pal.push(toHex(hslToRgb(hsl[0] + d, hsl[1], hsl[2]).map(Math.round)));
    });
    document.getElementById('clr-palette').innerHTML = pal.map(function (h) {
      return '<button type="button" class="fv-chip" data-color="' + h + '" style="background:' + h + '" title="' + h + '" aria-label="' + h + '"></button>';
    }).join('');
  }

  input.addEventListener('input', FV.debounce(render, 150));
  bgInput.addEventListener('input', FV.debounce(render, 150));
  picker.addEventListener('input', function () { input.value = picker.value; render(); });
  bgPicker.addEventListener('input', function () { bgInput.value = bgPicker.value; render(); });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-copy')) { FV.copyText(t.getAttribute('data-copy')); }
    if (t.getAttribute && t.getAttribute('data-color')) { input.value = t.getAttribute('data-color'); render(); }
  });
  render();
})();
