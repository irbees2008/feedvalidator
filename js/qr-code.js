(function () {
  'use strict';
  var error = document.getElementById('qr-code-error');
  var textEl = document.getElementById('qr-text');
  var eccEl = document.getElementById('qr-ecc');
  var sizeEl = document.getElementById('qr-size');
  var fgEl = document.getElementById('qr-fg');
  var bgEl = document.getElementById('qr-bg');
  var canvas = document.getElementById('qr-canvas');
  var info = document.getElementById('qr-info');
  var pngLink = document.getElementById('qr-png');
  var svgLink = document.getElementById('qr-svg');
  var svgUrl = '';

  var ECC_ORD = { L: 0, M: 1, Q: 2, H: 3 };
  var ECC_FORMAT = [1, 0, 3, 2];
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  function utf8(str) {
    return Array.prototype.slice.call(new TextEncoder().encode(str));
  }

  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      var n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) { r -= 36; }
    }
    return r;
  }

  function dataCodewords(v, e) {
    return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * NUM_BLOCKS[e][v];
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    var res = [], i, j;
    for (i = 0; i < degree; i++) { res.push(0); }
    res[degree - 1] = 1;
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < degree; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < degree) { res[j] ^= res[j + 1]; }
      }
      root = gfMul(root, 2);
    }
    return res;
  }

  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, factor); });
    });
    return res;
  }

  function addEcc(data, v, e) {
    var nb = NUM_BLOCKS[e][v], eccLen = ECC_PER_BLOCK[e][v];
    var raw = Math.floor(rawModules(v) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var blocks = [], div = rsDivisor(eccLen), k = 0, i;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) { dat.push(0); }
      blocks.push(dat.concat(ecc));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      blocks.forEach(function (b, j) {
        if (i !== shortLen - eccLen || j >= nShort) { out.push(b[i]); }
      });
    }
    return out;
  }

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function build(bytes, eccName) {
    var e = ECC_ORD[eccName], v, cc;
    for (v = 1; v <= 40; v++) {
      cc = v < 10 ? 8 : 16;
      if (bytes.length < (1 << cc) && 4 + cc + bytes.length * 8 <= dataCodewords(v, e) * 8) { break; }
    }
    if (v > 40) { return null; }
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) { bits.push((val >>> i) & 1); } }
    push(4, 4);
    push(bytes.length, cc);
    bytes.forEach(function (b) { push(b, 8); });
    var cap = dataCodewords(v, e) * 8;
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) { push(pad, 8); }
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    }
    var all = addEcc(data, v, e);

    var size = v * 4 + 17;
    var mod = [], fn = [];
    for (i = 0; i < size; i++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    function setFn(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) { setFn(x, y, d !== 2 && d !== 4); }
        }
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (v > 1) {
      var na = Math.floor(v / 7) + 2;
      var step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6];
      for (var p = size - 7; pos.length < na; p -= step) { pos.splice(1, 0, p); }
    }
    pos.forEach(function (cx, a) {
      pos.forEach(function (cy, b) {
        if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) { return; }
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) { setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
        }
      });
    });
    function drawFormat(mask) {
      var d = ECC_FORMAT[e] << 3 | mask, rem = d, k;
      for (k = 0; k < 10; k++) { rem = (rem << 1) ^ ((rem >>> 9) * 0x537); }
      var b = (d << 10 | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) { setFn(8, k, bit(b, k)); }
      setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
      for (k = 9; k < 15; k++) { setFn(14 - k, 8, bit(b, k)); }
      for (k = 0; k < 8; k++) { setFn(size - 1 - k, 8, bit(b, k)); }
      for (k = 8; k < 15; k++) { setFn(8, size - 15 + k, bit(b, k)); }
      setFn(8, size - 8, true);
    }
    drawFormat(0);
    if (v >= 7) {
      var rem = v, k;
      for (k = 0; k < 12; k++) { rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); }
      var vb = v << 12 | rem;
      for (k = 0; k < 18; k++) {
        var a = size - 11 + k % 3, b2 = Math.floor(k / 3);
        setFn(a, b2, bit(vb, k)); setFn(b2, a, bit(vb, k));
      }
    }

    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) { right = 5; }
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < all.length * 8) {
            mod[y][x] = bit(all[idx >>> 3], 7 - (idx & 7));
            idx++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var inv;
          switch (mask) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = x * y % 2 + x * y % 3 === 0; break;
            case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
            default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
          }
          if (!fn[y][x] && inv) { mod[y][x] = !mod[y][x]; }
        }
      }
    }

    function penalty() {
      var score = 0, y, x, lines = [], dark = 0;
      for (y = 0; y < size; y++) {
        lines.push(mod[y].map(function (m) { return m ? '1' : '0'; }).join(''));
      }
      for (x = 0; x < size; x++) {
        var col = '';
        for (y = 0; y < size; y++) { col += mod[y][x] ? '1' : '0'; }
        lines.push(col);
      }
      lines.forEach(function (s) {
        var run = 1, i2, f;
        for (i2 = 1; i2 <= s.length; i2++) {
          if (i2 < s.length && s[i2] === s[i2 - 1]) { run++; } else { if (run >= 5) { score += run - 2; } run = 1; }
        }
        ['10111010000', '00001011101'].forEach(function (pat) {
          f = s.indexOf(pat);
          while (f !== -1) { score += 40; f = s.indexOf(pat, f + 1); }
        });
      });
      for (y = 0; y < size - 1; y++) {
        for (x = 0; x < size - 1; x++) {
          var c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) { score += 3; }
        }
      }
      mod.forEach(function (r) { r.forEach(function (m) { if (m) { dark++; } }); });
      var total = size * size;
      score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return score;
    }

    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      var s = penalty();
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m);
    }
    applyMask(best);
    drawFormat(best);
    return { version: v, size: size, modules: mod };
  }

  function render() {
    FV.clearError(error);
    var text = textEl.value;
    if (!text) { info.textContent = ''; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
    var bytes = utf8(text);
    var qr = build(bytes, eccEl.value);
    if (!qr) {
      FV.showError(error, 'Текст слишком длинный для QR-кода при выбранной коррекции ошибок. Сократите текст или уменьшите уровень коррекции.');
      return;
    }
    var border = 4, total = qr.size + border * 2;
    var px = Math.min(2000, Math.max(100, parseInt(sizeEl.value, 10) || 400));
    var scale = Math.max(1, Math.floor(px / total));
    canvas.width = canvas.height = scale * total;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bgEl.value;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fgEl.value;
    var path = '';
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
          path += 'M' + (x + border) + ',' + (y + border) + 'h1v1h-1z';
        }
      }
    }
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    pngLink.href = canvas.toDataURL('image/png');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + (scale * total) + '" height="' + (scale * total) + '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' + bgEl.value + '"/><path d="' + path + '" fill="' + fgEl.value + '"/></svg>';
    if (svgUrl) { URL.revokeObjectURL(svgUrl); }
    svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    svgLink.href = svgUrl;
    info.textContent = 'Версия ' + qr.version + ', ' + qr.size + '×' + qr.size + ' модулей, ' + bytes.length + ' байт, изображение ' + canvas.width + '×' + canvas.height + ' px';
  }

  var update = FV.debounce(render, 150);
  [textEl, sizeEl].forEach(function (el) { el.addEventListener('input', update); });
  [eccEl, fgEl, bgEl].forEach(function (el) { el.addEventListener('change', render); el.addEventListener('input', update); });
  document.getElementById('qr-wifi').addEventListener('click', function () {
    textEl.value = 'WIFI:T:WPA;S:НазваниеСети;P:Пароль;;';
    render();
  });
  render();
})();
