(function () {
  'use strict';
  var error = document.getElementById('pixel-art-maker-error');
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('px-canvas');
  var ctx = canvas.getContext('2d');
  var CANVAS = canvas.width;
  var preview = $('px-preview');
  var pctx = preview.getContext('2d');
  var STORE_KEY = 'fv-pixel-art';
  var SIZES = [8, 16, 32, 64];
  var MAX_HISTORY = 100;
  var MAX_FRAMES = 32;
  var MAX_PALETTE = 48;
  var DEFAULT_PALETTE = ['#000000', '#ffffff', '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39',
    '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948',
    '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#68386c', '#b55088', '#f6757a',
    '#8b9bb4', '#5a6988', '#3a4466', '#262b44'];

  var S = { n: 16, frames: [], cur: 0, color: '#e43b44', palette: DEFAULT_PALETTE.slice(), mx: false, my: false, grid: true };
  var tool = 'pencil';
  var undoStack = [];
  var redoStack = [];
  var drawing = false;
  var last = null;
  var playing = false;
  var playTimer = null;
  var playIdx = 0;

  function blank(n) {
    var a = new Array(n * n);
    for (var i = 0; i < a.length; i++) { a[i] = -1; }
    return a;
  }

  function hexToInt(h) { return parseInt(h.slice(1), 16); }
  function intToHex(v) { return '#' + ('000000' + v.toString(16)).slice(-6); }

  /* ---------- сохранение ---------- */
  function validFrames(f, n) {
    if (!Array.isArray(f) || !f.length || f.length > MAX_FRAMES) { return false; }
    return f.every(function (fr) {
      return Array.isArray(fr) && fr.length === n * n && fr.every(function (v) {
        return typeof v === 'number' && v >= -1 && v <= 0xFFFFFF && v === Math.floor(v);
      });
    });
  }

  function load() {
    var d = FV.storage.get(STORE_KEY, null);
    if (d && SIZES.indexOf(d.n) >= 0 && validFrames(d.frames, d.n)) {
      S.n = d.n;
      S.frames = d.frames;
      S.cur = Math.min(Math.max(0, d.cur | 0), d.frames.length - 1);
      if (typeof d.color === 'string' && /^#[0-9a-f]{6}$/i.test(d.color)) { S.color = d.color; }
      if (Array.isArray(d.palette) && d.palette.length && d.palette.length <= MAX_PALETTE &&
          d.palette.every(function (c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); })) {
        S.palette = d.palette;
      }
      S.grid = d.grid !== false;
    } else {
      S.frames = [blank(S.n)];
    }
  }

  var save = FV.debounce(function () {
    FV.storage.set(STORE_KEY, { n: S.n, frames: S.frames, cur: S.cur, color: S.color, palette: S.palette, grid: S.grid });
  }, 400);

  /* ---------- история ---------- */
  function snap() {
    return { n: S.n, cur: S.cur, frames: S.frames.map(function (f) { return f.slice(); }) };
  }

  function restore(s) {
    S.n = s.n;
    S.cur = Math.min(s.cur, s.frames.length - 1);
    S.frames = s.frames;
  }

  function pushHistory() {
    undoStack.push(snap());
    if (undoStack.length > MAX_HISTORY) { undoStack.shift(); }
    redoStack = [];
    updateButtons();
  }

  function undo() {
    if (!undoStack.length) { return; }
    redoStack.push(snap());
    restore(undoStack.pop());
    refreshAll();
  }

  function redo() {
    if (!redoStack.length) { return; }
    undoStack.push(snap());
    restore(redoStack.pop());
    refreshAll();
  }

  function updateButtons() {
    $('px-undo').disabled = !undoStack.length;
    $('px-redo').disabled = !redoStack.length;
    $('px-fdel').disabled = S.frames.length <= 1;
    $('px-fadd').disabled = S.frames.length >= MAX_FRAMES;
    $('px-fdup').disabled = S.frames.length >= MAX_FRAMES;
  }

  /* ---------- отрисовка ---------- */
  function drawFrame(c, frame, n, size) {
    var cell = size / n;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var v = frame[y * n + x];
        if (v >= 0) {
          c.fillStyle = intToHex(v);
          c.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
  }

  function render() {
    var n = S.n;
    var cell = CANVAS / n;
    var frame = S.frames[S.cur];
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var v = frame[y * n + x];
        ctx.fillStyle = v >= 0 ? intToHex(v) : ((x + y) & 1 ? '#e9edf3' : '#ffffff');
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    if (S.grid) {
      ctx.strokeStyle = 'rgba(0,0,0,.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i < n; i++) {
        var p = Math.round(i * cell) + .5;
        ctx.moveTo(p, 0); ctx.lineTo(p, CANVAS);
        ctx.moveTo(0, p); ctx.lineTo(CANVAS, p);
      }
      ctx.stroke();
    }
    drawThumb(S.cur);
    if (!playing) { drawPreview(S.cur); }
  }

  function drawThumb(i) {
    var box = $('px-frames').children[i];
    if (!box) { return; }
    var c = box.querySelector('canvas');
    var cc = c.getContext('2d');
    cc.clearRect(0, 0, c.width, c.height);
    drawFrame(cc, S.frames[i], S.n, c.width);
  }

  function drawPreview(i) {
    pctx.clearRect(0, 0, preview.width, preview.height);
    drawFrame(pctx, S.frames[i], S.n, preview.width);
  }

  function buildFrames() {
    var box = $('px-frames');
    box.innerHTML = '';
    S.frames.forEach(function (f, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fv-px-frame' + (i === S.cur ? ' active' : '');
      b.title = 'Кадр ' + (i + 1);
      b.setAttribute('aria-label', 'Кадр ' + (i + 1));
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      b.appendChild(c);
      b.addEventListener('click', function () { S.cur = i; refreshAll(); });
      box.appendChild(b);
      drawThumb(i);
    });
  }

  function buildPalette() {
    var box = $('px-palette');
    box.innerHTML = '';
    S.palette.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fv-px-sw' + (c.toLowerCase() === S.color.toLowerCase() ? ' active' : '');
      b.style.background = c;
      b.title = c + ' (правый клик — убрать из палитры)';
      b.setAttribute('aria-label', c);
      b.addEventListener('click', function () { setColor(c); });
      b.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (S.palette.length > 1) { S.palette.splice(i, 1); buildPalette(); save(); }
      });
      box.appendChild(b);
    });
  }

  function setColor(c) {
    S.color = c.toLowerCase();
    $('px-color').value = S.color;
    if (tool === 'eraser' || tool === 'picker') { setTool('pencil'); }
    buildPalette();
    save();
  }

  function refreshAll() {
    document.querySelectorAll('[data-size]').forEach(function (b) {
      b.classList.toggle('active', +b.getAttribute('data-size') === S.n);
    });
    $('px-grid').checked = S.grid;
    buildFrames();
    buildPalette();
    updateButtons();
    render();
    updateCode();
    save();
  }

  function setTool(t) {
    tool = t;
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === t);
    });
  }

  /* ---------- рисование ---------- */
  function setPx(x, y, val) {
    var n = S.n;
    var f = S.frames[S.cur];
    var xs = S.mx ? [x, n - 1 - x] : [x];
    var ys = S.my ? [y, n - 1 - y] : [y];
    xs.forEach(function (xx) {
      ys.forEach(function (yy) { f[yy * n + xx] = val; });
    });
  }

  function line(a, b, val) {
    var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      setPx(x0, y0, val);
      if (x0 === x1 && y0 === y1) { break; }
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function flood(x, y, val) {
    var n = S.n;
    var f = S.frames[S.cur];
    var target = f[y * n + x];
    if (target === val) { return; }
    var stack = [[x, y]];
    while (stack.length) {
      var p = stack.pop();
      var px = p[0], py = p[1];
      if (px < 0 || py < 0 || px >= n || py >= n || f[py * n + px] !== target) { continue; }
      f[py * n + px] = val;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
  }

  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * S.n);
    var y = Math.floor((e.clientY - r.top) / r.height * S.n);
    return { x: Math.min(S.n - 1, Math.max(0, x)), y: Math.min(S.n - 1, Math.max(0, y)) };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button > 0) { return; }
    e.preventDefault();
    var p = cellAt(e);
    if (tool === 'picker') {
      var v = S.frames[S.cur][p.y * S.n + p.x];
      if (v >= 0) { setColor(intToHex(v)); setTool('pencil'); }
      return;
    }
    pushHistory();
    if (tool === 'fill') {
      flood(p.x, p.y, hexToInt(S.color));
      render();
      save();
      return;
    }
    drawing = true;
    last = p;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    line(p, p, tool === 'eraser' ? -1 : hexToInt(S.color));
    render();
  });

  canvas.addEventListener('pointermove', function (e) {
    var p = cellAt(e);
    $('px-pos').textContent = 'Клетка: ' + (p.x + 1) + ', ' + (p.y + 1) + ' из ' + S.n + '×' + S.n;
    if (!drawing) { return; }
    if (p.x === last.x && p.y === last.y) { return; }
    line(last, p, tool === 'eraser' ? -1 : hexToInt(S.color));
    last = p;
    render();
  });

  function endStroke() {
    if (!drawing) { return; }
    drawing = false;
    last = null;
    updateCode();
    save();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  /* ---------- панель ---------- */
  document.querySelectorAll('[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
  });

  document.querySelectorAll('[data-size]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-size');
      if (n === S.n) { return; }
      pushHistory();
      var old = S.n;
      S.frames = S.frames.map(function (f) {
        var out = new Array(n * n);
        for (var y = 0; y < n; y++) {
          for (var x = 0; x < n; x++) {
            out[y * n + x] = f[Math.floor(y * old / n) * old + Math.floor(x * old / n)];
          }
        }
        return out;
      });
      S.n = n;
      refreshAll();
    });
  });

  function toggle(id, key) {
    var b = $(id);
    b.addEventListener('click', function () {
      S[key] = !S[key];
      b.setAttribute('aria-pressed', S[key] ? 'true' : 'false');
    });
  }
  toggle('px-mx', 'mx');
  toggle('px-my', 'my');

  $('px-grid').addEventListener('change', function () { S.grid = this.checked; render(); save(); });
  $('px-undo').addEventListener('click', undo);
  $('px-redo').addEventListener('click', redo);
  $('px-clear').addEventListener('click', function () {
    pushHistory();
    S.frames[S.cur] = blank(S.n);
    refreshAll();
  });

  $('px-color').addEventListener('input', function () { setColor(this.value); });
  $('px-addcolor').addEventListener('click', function () {
    var c = S.color.toLowerCase();
    if (S.palette.map(function (x) { return x.toLowerCase(); }).indexOf(c) >= 0) { return; }
    if (S.palette.length >= MAX_PALETTE) { S.palette.shift(); }
    S.palette.push(c);
    buildPalette();
    save();
  });

  /* ---------- кадры ---------- */
  $('px-fadd').addEventListener('click', function () {
    if (S.frames.length >= MAX_FRAMES) { return; }
    pushHistory();
    S.frames.splice(S.cur + 1, 0, blank(S.n));
    S.cur++;
    refreshAll();
  });
  $('px-fdup').addEventListener('click', function () {
    if (S.frames.length >= MAX_FRAMES) { return; }
    pushHistory();
    S.frames.splice(S.cur + 1, 0, S.frames[S.cur].slice());
    S.cur++;
    refreshAll();
  });
  $('px-fdel').addEventListener('click', function () {
    if (S.frames.length <= 1) { return; }
    pushHistory();
    S.frames.splice(S.cur, 1);
    S.cur = Math.min(S.cur, S.frames.length - 1);
    refreshAll();
  });

  function fps() {
    var v = parseInt($('px-fps').value, 10);
    return Math.min(30, Math.max(1, isNaN(v) ? 6 : v));
  }

  function tick() {
    if (!playing) { return; }
    playIdx = (playIdx + 1) % S.frames.length;
    drawPreview(playIdx);
    playTimer = setTimeout(tick, 1000 / fps());
  }

  $('px-play').addEventListener('click', function () {
    playing = !playing;
    clearTimeout(playTimer);
    this.textContent = playing ? '■ Стоп' : '▶ Играть';
    if (playing) {
      playIdx = S.cur;
      playTimer = setTimeout(tick, 1000 / fps());
    } else {
      drawPreview(S.cur);
    }
  });

  /* ---------- трафареты ---------- */
  var STENCILS = {
    heart: {
      map: { '#': '#e43b44', w: '#f6757a' },
      rows: ['................', '..####....####..', '.#ww###..######.', '#wwww###########', '################',
        '################', '################', '.##############.', '..############..', '...##########...',
        '....########....', '.....######.....', '......####......', '.......##.......', '................', '................']
    },
    smile: {
      map: { y: '#fee761', k: '#262b44' },
      rows: ['.....yyyyyy.....', '...yyyyyyyyyy...', '..yyyyyyyyyyyy..', '.yyyykyyyykyyyy.', '.yyyykyyyykyyyy.',
        'yyyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', 'yyyyyyyyyyyyyyyy', 'yykyyyyyyyyyykyy', 'yyykyyyyyyyykyyy',
        '.yyykkkkkkkkyyy.', '.yyyykkkkkkyyyy.', '..yyyyyyyyyyyy..', '...yyyyyyyyyy...', '.....yyyyyy.....', '................']
    },
    mushroom: {
      map: { r: '#e43b44', w: '#ffffff', s: '#ead4aa' },
      rows: ['.....rrrrrr.....', '...rrrwwwrrrr...', '..rrwwwwwrrrrr..', '.rrrwwwwwrrwwrr.', '.rrrrwwwrrrwwrr.',
        'rrrrrrrrrrrrrrrr', 'rrwwrrrrrrrrwwrr', 'rwwwwrrrrrrwwwwr', 'rrwwrrrrrrrrwwrr', '.rrrrrrrrrrrrrr.',
        '.....ssssss.....', '....ssssssss....', '....ssssssss....', '....ssssssss....', '.....ssssss.....', '................']
    }
  };

  function swordRows() {
    var g = [];
    for (var i = 0; i < 16; i++) { g.push('.'.repeat(16).split('')); }
    function put(x, y, ch) { if (x >= 0 && y >= 0 && x < 16 && y < 16) { g[y][x] = ch; } }
    for (var i2 = 0; i2 <= 8; i2++) { put(14 - i2, 1 + i2, 'b'); put(13 - i2, 1 + i2, 'w'); }
    for (var k = -2; k <= 2; k++) { put(5 + k, 10 + k, 'g'); }
    put(4, 11, 'n'); put(3, 12, 'n'); put(2, 13, 'n'); put(1, 14, 'n');
    return g.map(function (r) { return r.join(''); });
  }
  STENCILS.sword = { map: { b: '#8b9bb4', w: '#ffffff', g: '#feae34', n: '#733e39' }, rows: swordRows() };

  $('px-stencil').addEventListener('change', function () {
    var st = STENCILS[this.value];
    this.value = '';
    if (!st) { return; }
    pushHistory();
    if (S.n !== 16) { S.n = 16; S.frames = [blank(16)]; S.cur = 0; }
    var f = blank(16);
    st.rows.forEach(function (row, y) {
      for (var x = 0; x < 16; x++) {
        var c = st.map[row.charAt(x)];
        if (c) { f[y * 16 + x] = hexToInt(c); }
      }
    });
    S.frames[S.cur] = f;
    refreshAll();
  });

  /* ---------- экспорт ---------- */
  function scaleVal() { return +$('px-scale').value || 8; }

  function frameCanvas(frames, scale) {
    var n = S.n;
    var c = document.createElement('canvas');
    c.width = n * scale * frames.length;
    c.height = n * scale;
    var cc = c.getContext('2d');
    frames.forEach(function (f, i) {
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var v = f[y * n + x];
          if (v >= 0) {
            cc.fillStyle = intToHex(v);
            cc.fillRect((i * n + x) * scale, y * scale, scale, scale);
          }
        }
      }
    });
    return c;
  }

  function downloadCanvas(c, name) {
    FV.clearError(error);
    c.toBlob(function (blob) {
      if (!blob) { FV.showError(error, 'Не удалось создать PNG: слишком большой размер.'); return; }
      FV.download(blob, name);
    }, 'image/png');
  }

  $('px-png').addEventListener('click', function () {
    downloadCanvas(frameCanvas([S.frames[S.cur]], scaleVal()), 'pixel-art.png');
  });
  $('px-sheet').addEventListener('click', function () {
    downloadCanvas(frameCanvas(S.frames, scaleVal()), 'pixel-art-sheet.png');
  });

  function lzw(minCode, idx) {
    var clear = 1 << minCode, eoi = clear + 1;
    var next = eoi + 1, size = minCode + 1;
    var dict = new Map();
    var out = [], cur = 0, nb = 0;
    function emit(code) {
      cur |= code << nb;
      nb += size;
      while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; }
    }
    emit(clear);
    var prefix = idx[0];
    for (var i = 1; i < idx.length; i++) {
      var k = idx[i];
      var key = (prefix << 8) | k;
      var hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        dict.clear();
        next = eoi + 1;
        size = minCode + 1;
      } else {
        if (next >= (1 << size)) { size++; }
        dict.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (nb > 0) { out.push(cur & 255); }
    return out;
  }

  function encodeGif(frames, n, scale, delayCs) {
    var map = new Map();
    var pal = [];
    frames.forEach(function (f) {
      f.forEach(function (v) {
        if (v >= 0 && !map.has(v) && pal.length < 255) { map.set(v, pal.length + 1); pal.push(v); }
      });
    });
    function nearest(v) {
      var r = v >> 16, g = (v >> 8) & 255, b = v & 255, best = 1, bd = Infinity;
      pal.forEach(function (p, i) {
        var d = Math.pow(r - (p >> 16), 2) + Math.pow(g - ((p >> 8) & 255), 2) + Math.pow(b - (p & 255), 2);
        if (d < bd) { bd = d; best = i + 1; }
      });
      return best;
    }
    function index(v) {
      if (v < 0) { return 0; }
      var i = map.get(v);
      return i === undefined ? nearest(v) : i;
    }
    var bits = 2;
    while ((1 << bits) < pal.length + 1) { bits++; }
    var W = n * scale;
    var b = [];
    function w16(v) { b.push(v & 255, (v >> 8) & 255); }
    'GIF89a'.split('').forEach(function (ch) { b.push(ch.charCodeAt(0)); });
    w16(W); w16(W);
    b.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
    b.push(0, 0, 0);
    for (var i = 0; i < pal.length; i++) { b.push(pal[i] >> 16, (pal[i] >> 8) & 255, pal[i] & 255); }
    for (var j = pal.length + 1; j < (1 << bits); j++) { b.push(0, 0, 0); }
    b.push(0x21, 0xFF, 0x0B);
    'NETSCAPE2.0'.split('').forEach(function (ch) { b.push(ch.charCodeAt(0)); });
    b.push(3, 1, 0, 0, 0);
    frames.forEach(function (f) {
      b.push(0x21, 0xF9, 4, (2 << 2) | 1);
      w16(delayCs);
      b.push(0, 0);
      b.push(0x2C);
      w16(0); w16(0); w16(W); w16(W);
      b.push(0, bits);
      var px = new Uint8Array(W * W);
      for (var y = 0; y < W; y++) {
        var row = Math.floor(y / scale) * n;
        for (var x = 0; x < W; x++) { px[y * W + x] = index(f[row + Math.floor(x / scale)]); }
      }
      var data = lzw(bits, px);
      for (var p = 0; p < data.length; p += 255) {
        var chunk = data.slice(p, p + 255);
        b.push(chunk.length);
        for (var q = 0; q < chunk.length; q++) { b.push(chunk[q]); }
      }
      b.push(0);
    });
    b.push(0x3B);
    return new Uint8Array(b);
  }

  $('px-gif').addEventListener('click', function () {
    FV.clearError(error);
    var scale = Math.min(scaleVal(), Math.max(1, Math.floor(1024 / S.n)));
    var bytes = encodeGif(S.frames, S.n, scale, Math.max(2, Math.round(100 / fps())));
    FV.download(new Blob([bytes], { type: 'image/gif' }), 'pixel-art.gif');
  });

  /* ---------- код ---------- */
  var EXT = { python: 'py', js: 'js', css: 'css', svg: 'svg', csv: 'csv' };

  function buildCode(fmt) {
    var n = S.n;
    var f = S.frames[S.cur];
    var rows = [];
    for (var y = 0; y < n; y++) {
      var r = [];
      for (var x = 0; x < n; x++) { r.push(f[y * n + x]); }
      rows.push(r);
    }
    var cell = function (v, none, q) { return v < 0 ? none : q + intToHex(v) + q; };
    if (fmt === 'python') {
      return 'from PIL import Image\n\nSIZE = ' + n + '\nSCALE = 16\npixels = [\n' +
        rows.map(function (r) { return '    [' + r.map(function (v) { return cell(v, 'None', '"'); }).join(', ') + '],'; }).join('\n') +
        '\n]\n\nimg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))\nfor y, row in enumerate(pixels):\n' +
        '    for x, c in enumerate(row):\n        if c:\n' +
        '            img.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))\n' +
        'img = img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)\nimg.save("pixel-art.png")\n';
    }
    if (fmt === 'js') {
      return 'const SIZE = ' + n + ';\nconst SCALE = 16;\nconst pixels = [\n' +
        rows.map(function (r) { return '  [' + r.map(function (v) { return cell(v, 'null', '"'); }).join(', ') + '],'; }).join('\n') +
        '\n];\n\nconst canvas = document.createElement("canvas");\ncanvas.width = canvas.height = SIZE * SCALE;\n' +
        'const ctx = canvas.getContext("2d");\npixels.forEach((row, y) => row.forEach((c, x) => {\n' +
        '  if (c) { ctx.fillStyle = c; ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE); }\n}));\ndocument.body.appendChild(canvas);\n';
    }
    if (fmt === 'css') {
      var sh = [];
      rows.forEach(function (r, y) { r.forEach(function (v, x) { if (v >= 0) { sh.push(x + 'px ' + y + 'px 0 ' + intToHex(v)); } }); });
      return '/* <div class="pixel-art"></div> — масштаб задаёт scale() */\n.pixel-art {\n  width: 1px;\n  height: 1px;\n' +
        '  transform: scale(16);\n  transform-origin: 0 0;\n  box-shadow:\n' +
        (sh.length ? '    ' + sh.join(',\n    ') : '    none') + ';\n}\n';
    }
    if (fmt === 'svg') {
      var rects = [];
      rows.forEach(function (r, y) {
        var x = 0;
        while (x < n) {
          if (r[x] < 0) { x++; continue; }
          var x2 = x;
          while (x2 + 1 < n && r[x2 + 1] === r[x]) { x2++; }
          rects.push('  <rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + intToHex(r[x]) + '"/>');
          x = x2 + 1;
        }
      });
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + n * 16 + '" height="' + n * 16 +
        '" shape-rendering="crispEdges">\n' + rects.join('\n') + '\n</svg>\n';
    }
    return rows.map(function (r) { return r.map(function (v) { return v < 0 ? '' : intToHex(v); }).join(','); }).join('\n') + '\n';
  }

  function updateCode() { $('px-code').value = buildCode($('px-fmt').value); }

  $('px-fmt').addEventListener('change', updateCode);
  $('px-copy').addEventListener('click', function () { FV.copyText($('px-code').value, this); });
  $('px-dlcode').addEventListener('click', function () {
    var fmt = $('px-fmt').value;
    FV.download($('px-code').value, 'pixel-art.' + EXT[fmt], fmt === 'svg' ? 'image/svg+xml' : 'text/plain;charset=utf-8');
  });

  /* ---------- клавиши ---------- */
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && t.type !== 'color' && t.type !== 'checkbox')) { return; }
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) { redo(); } else { undo(); } return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) { return; }
    if (k === 'p') { setTool('pencil'); }
    else if (k === 'e') { setTool('eraser'); }
    else if (k === 'g') { setTool('fill'); }
    else if (k === 'i') { setTool('picker'); }
    else if (k === 'h') { $('px-mx').click(); }
    else if (k === 'v') { $('px-my').click(); }
  });

  load();
  $('px-color').value = S.color;
  refreshAll();
})();
