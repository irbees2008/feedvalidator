(function () {
  'use strict';

  var MAX_FILE = 10 * 1024 * 1024;
  var MAX_GIF_SIDE = 2000;
  var MAX_GIF_FRAMES = 1000;
  var MAX_GIF_PIXELS = 400 * 1000 * 1000;
  var PREVIEW_SIZES = [16, 32, 48, 64, 128];
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function $(id) { return document.getElementById(id); }

  function showError(node, message) {
    node.textContent = message;
    node.hidden = !message;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escJs(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3C').replace(/[\r\n]/g, '');
  }

  function normalizeBase(value) {
    var base = String(value || '').trim();
    if (!base) { base = '/images/favicon/'; }
    return base.charAt(base.length - 1) === '/' ? base : base + '/';
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(textarea, button) {
    var done = function () {
      var old = button.textContent;
      button.textContent = 'Скопировано';
      setTimeout(function () { button.textContent = old; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textarea.value).then(done, function () {});
      return;
    }
    textarea.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
  }

  function canvasBytes(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Не удалось создать PNG.')); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, 'image/png');
    });
  }

  /* ---------- ZIP (без сжатия) и ICO ---------- */

  var crcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var parts = [];
    var central = [];
    var offset = 0;

    files.forEach(function (file) {
      var name = enc.encode(file.name);
      var data = file.data;
      var crc = crc32(data);

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034B50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014B50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);

      offset += 30 + name.length + data.length;
    });

    var centralSize = central.reduce(function (sum, p) { return sum + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  function buildIco(entries) {
    var head = new DataView(new ArrayBuffer(6 + 16 * entries.length));
    head.setUint16(2, 1, true);
    head.setUint16(4, entries.length, true);
    var offset = head.byteLength;
    entries.forEach(function (entry, i) {
      var p = 6 + 16 * i;
      head.setUint8(p, entry.size >= 256 ? 0 : entry.size);
      head.setUint8(p + 1, entry.size >= 256 ? 0 : entry.size);
      head.setUint16(p + 4, 1, true);
      head.setUint16(p + 6, 32, true);
      head.setUint32(p + 8, entry.data.length, true);
      head.setUint32(p + 12, offset, true);
      offset += entry.data.length;
    });
    return new Blob([new Uint8Array(head.buffer)].concat(entries.map(function (e) { return e.data; })),
      { type: 'image/x-icon' });
  }

  /* ---------- декодер GIF ---------- */

  function lzwDecode(minSize, data, count) {
    var clear = 1 << minSize;
    var eoi = clear + 1;
    var out = new Uint8Array(count);
    var prefix = new Int16Array(4096);
    var suffix = new Uint8Array(4096);
    var stack = new Uint8Array(4097);
    var size = minSize + 1;
    var mask = (1 << size) - 1;
    var next = eoi + 1;
    var old = -1;
    var first = 0;
    var bits = 0;
    var acc = 0;
    var pos = 0;
    var o = 0;
    var i;

    for (i = 0; i < clear; i++) { suffix[i] = i; }

    while (o < count) {
      while (bits < size) {
        if (pos >= data.length) { return out; }
        acc |= data[pos++] << bits;
        bits += 8;
      }
      var code = acc & mask;
      acc >>>= size;
      bits -= size;

      if (code === clear) {
        size = minSize + 1;
        mask = (1 << size) - 1;
        next = eoi + 1;
        old = -1;
        continue;
      }
      if (code === eoi) { break; }
      if (old === -1) {
        out[o++] = suffix[code];
        old = code;
        first = code;
        continue;
      }

      var cur = code;
      var sp = 0;
      if (code >= next) {
        stack[sp++] = first;
        cur = old;
      }
      while (cur >= clear) {
        stack[sp++] = suffix[cur];
        cur = prefix[cur];
      }
      first = suffix[cur];
      stack[sp++] = first;

      if (next < 4096) {
        prefix[next] = old;
        suffix[next] = first;
        next++;
        if ((next & mask) === 0 && next < 4096) {
          size++;
          mask = (1 << size) - 1;
        }
      }
      old = code;
      while (sp > 0 && o < count) { out[o++] = stack[--sp]; }
    }
    return out;
  }

  function parseGif(bytes) {
    var p = 0;
    var sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      throw new Error('Файл не похож на GIF.');
    }
    var width = bytes[6] | (bytes[7] << 8);
    var height = bytes[8] | (bytes[9] << 8);
    var flags = bytes[10];
    p = 13;
    if (!width || !height || width > MAX_GIF_SIDE || height > MAX_GIF_SIDE) {
      throw new Error('Размер GIF должен быть не больше ' + MAX_GIF_SIDE + '×' + MAX_GIF_SIDE + ' px.');
    }
    var globalTable = null;
    if (flags & 0x80) {
      var gl = 3 * (1 << ((flags & 7) + 1));
      globalTable = bytes.subarray(p, p + gl);
      p += gl;
    }

    var frames = [];
    var gce = null;

    function skipBlocks() {
      while (p < bytes.length && bytes[p] !== 0) { p += bytes[p] + 1; }
      p++;
    }

    while (p < bytes.length) {
      var block = bytes[p++];
      if (block === 0x3B) { break; }
      if (block === 0x21) {
        var label = bytes[p++];
        if (label === 0xF9 && bytes[p] >= 4) {
          var packed = bytes[p + 1];
          gce = {
            disposal: (packed >> 2) & 7,
            transparent: (packed & 1) ? bytes[p + 4] : -1,
            delay: (bytes[p + 2] | (bytes[p + 3] << 8)) * 10
          };
        }
        skipBlocks();
      } else if (block === 0x2C) {
        var fx = bytes[p] | (bytes[p + 1] << 8);
        var fy = bytes[p + 2] | (bytes[p + 3] << 8);
        var fw = bytes[p + 4] | (bytes[p + 5] << 8);
        var fh = bytes[p + 6] | (bytes[p + 7] << 8);
        var fp = bytes[p + 8];
        p += 9;
        var table = globalTable;
        if (fp & 0x80) {
          var ll = 3 * (1 << ((fp & 7) + 1));
          table = bytes.subarray(p, p + ll);
          p += ll;
        }
        var minSize = bytes[p++];
        var chunks = [];
        var total = 0;
        while (p < bytes.length && bytes[p] !== 0) {
          var len = bytes[p];
          chunks.push(bytes.subarray(p + 1, p + 1 + len));
          total += len;
          p += len + 1;
        }
        p++;
        var data = new Uint8Array(total);
        var at = 0;
        chunks.forEach(function (c) { data.set(c, at); at += c.length; });

        frames.push({
          x: fx, y: fy, w: fw, h: fh, interlaced: !!(fp & 0x40), table: table, minSize: minSize, data: data,
          disposal: gce ? gce.disposal : 0,
          transparent: gce ? gce.transparent : -1,
          delay: gce && gce.delay ? gce.delay : 100
        });
        gce = null;
        if (frames.length > MAX_GIF_FRAMES) {
          throw new Error('В GIF слишком много кадров (максимум ' + MAX_GIF_FRAMES + ').');
        }
      } else {
        break;
      }
    }

    if (!frames.length) { throw new Error('В GIF не найдено ни одного кадра.'); }
    if (width * height * frames.length > MAX_GIF_PIXELS) {
      throw new Error('GIF слишком большой для обработки в браузере.');
    }
    return { width: width, height: height, frames: frames };
  }

  function pickIndexes(total, wanted) {
    if (total <= wanted) {
      return Array.apply(null, { length: total }).map(function (_, i) { return i; });
    }
    var list = [];
    for (var i = 0; i < wanted; i++) {
      list.push(Math.round(i * (total - 1) / (wanted - 1)));
    }
    return list;
  }

  // Собирает полные кадры с учётом прозрачности и способа удаления (disposal); возвращает canvas для выбранных.
  function composeFrames(gif, indexes) {
    var w = gif.width;
    var h = gif.height;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var buffer = new Uint8ClampedArray(w * h * 4);
    var wanted = {};
    indexes.forEach(function (i) { wanted[i] = true; });
    var result = {};

    var restore = null;
    var prev = null;

    gif.frames.forEach(function (frame, index) {
      if (prev) {
        if (prev.disposal === 2) {
          for (var cy = prev.y; cy < Math.min(prev.y + prev.h, h); cy++) {
            for (var cx = prev.x; cx < Math.min(prev.x + prev.w, w); cx++) {
              buffer.fill(0, (cy * w + cx) * 4, (cy * w + cx) * 4 + 4);
            }
          }
        } else if (prev.disposal === 3 && restore) {
          buffer.set(restore);
        }
      }
      restore = frame.disposal === 3 ? new Uint8ClampedArray(buffer) : null;

      var pixels = lzwDecode(frame.minSize, frame.data, frame.w * frame.h);
      var rows = [];
      var r;
      if (frame.interlaced) {
        [[0, 8], [4, 8], [2, 4], [1, 2]].forEach(function (pass) {
          for (r = pass[0]; r < frame.h; r += pass[1]) { rows.push(r); }
        });
      } else {
        for (r = 0; r < frame.h; r++) { rows.push(r); }
      }
      var table = frame.table;
      for (var line = 0; line < frame.h; line++) {
        var y = frame.y + rows[line];
        if (y >= h) { continue; }
        for (var x = 0; x < frame.w; x++) {
          var px = frame.x + x;
          var colour = pixels[line * frame.w + x];
          if (px >= w || colour === frame.transparent || !table) { continue; }
          var t = colour * 3;
          var d = (y * w + px) * 4;
          buffer[d] = table[t];
          buffer[d + 1] = table[t + 1];
          buffer[d + 2] = table[t + 2];
          buffer[d + 3] = 255;
        }
      }

      if (wanted[index]) {
        ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), w, h), 0, 0);
        var copy = document.createElement('canvas');
        copy.width = w;
        copy.height = h;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        result[index] = copy;
      }
      prev = frame;
    });

    return indexes.map(function (i) { return result[i]; });
  }

  function drawContain(ctx, source, sw, sh, x, y, w, h) {
    var scale = Math.min(w / sw, h / sh);
    var dw = sw * scale;
    var dh = sh * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  /* ---------- общие: вкладки ---------- */

  var panes = { static: $('fav-pane-static'), gif: $('fav-pane-gif') };
  var tabLinks = document.querySelectorAll('#fav-modes a[data-mode]');

  Array.prototype.forEach.call(tabLinks, function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var mode = link.getAttribute('data-mode');
      Array.prototype.forEach.call(tabLinks, function (other) {
        var active = other === link;
        other.parentNode.classList.toggle('active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      panes.static.hidden = mode !== 'static';
      panes.gif.hidden = mode !== 'gif';
    });
  });

  function bindDrop(zone, input, handler) {
    ['dragenter', 'dragover'].forEach(function (name) {
      zone.addEventListener(name, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      zone.addEventListener(name, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files[0]) { handler(e.dataTransfer.files[0]); }
    });
    input.addEventListener('change', function () {
      if (input.files[0]) { handler(input.files[0]); }
      input.value = '';
    });
  }

  /* ---------- генератор favicon ---------- */

  var st = {
    source: 'image', shape: 'rounded', image: null, imageW: 0, imageH: 0, imageUrl: null, busy: 0
  };

  var sEl = {
    padding: $('fav-padding'), paddingOut: $('fav-padding-out'), bg: $('fav-bg'), fg: $('fav-fg'),
    fgWrap: $('fav-fg-wrap'), transparent: $('fav-transparent'), text: $('fav-text'),
    textLabel: $('fav-text-label'), srcImage: $('fav-src-image'), srcText: $('fav-src-text'),
    sizes: $('fav-sizes'), tabIcon: $('fav-tab-icon'), error: $('fav-error'), html: $('fav-html'),
    zip: $('fav-zip'), ico: $('fav-ico'), copy: $('fav-copy'), reset: $('fav-reset'),
    fileInfo: $('fav-fileinfo'), drop: $('fav-drop'), file: $('fav-file')
  };

  function shapePath(ctx, size, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    } else if (shape === 'rounded') {
      var r = size * 0.22;
      ctx.moveTo(r, 0);
      ctx.arcTo(size, 0, size, size, r);
      ctx.arcTo(size, size, 0, size, r);
      ctx.arcTo(0, size, 0, 0, r);
      ctx.arcTo(0, 0, size, 0, r);
      ctx.closePath();
    } else {
      ctx.rect(0, 0, size, size);
    }
  }

  function isReady() {
    if (st.source === 'image') { return !!st.image; }
    return sEl.text.value.trim().length > 0;
  }

  function renderIcon(size, options) {
    options = options || {};
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var shape = options.shape || st.shape;
    var solid = options.opaque || !sEl.transparent.checked;

    ctx.save();
    shapePath(ctx, size, shape);
    ctx.clip();
    if (solid) {
      ctx.fillStyle = sEl.bg.value;
      ctx.fillRect(0, 0, size, size);
    }

    var inset = size * (parseInt(sEl.padding.value, 10) || 0) / 100;
    var inner = size - inset * 2;

    if (st.source === 'image' && st.image) {
      drawContain(ctx, st.image, st.imageW, st.imageH, inset, inset, inner, inner);
    } else if (st.source !== 'image') {
      var text = Array.from(sEl.text.value.trim()).slice(0, 3).join('');
      if (text) {
        var emoji = st.source === 'emoji';
        var length = Array.from(text).length;
        var factor = emoji ? 0.78 : (length === 1 ? 0.82 : (length === 2 ? 0.62 : 0.46));
        var px = inner * factor;
        var family = emoji ? EMOJI_FONT : 'Arial, "Helvetica Neue", sans-serif';
        var weight = emoji ? '' : 'bold ';
        ctx.font = weight + px + 'px ' + family;
        var width = ctx.measureText(text).width;
        if (width > inner) {
          px = px * inner / width;
          ctx.font = weight + px + 'px ' + family;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sEl.fg.value;
        ctx.fillText(text, size / 2, size / 2 + px * (emoji ? 0.06 : 0.04));
      }
    }
    ctx.restore();
    return canvas;
  }

  function staticHtml() {
    var color = sEl.bg.value;
    return [
      '<link rel="icon" href="/favicon.ico" sizes="48x48">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/site.webmanifest">',
      '<meta name="theme-color" content="' + escHtml(color) + '">'
    ].join('\n');
  }

  function refreshStatic() {
    var ready = isReady();
    sEl.paddingOut.textContent = sEl.padding.value + '%';
    sEl.sizes.textContent = '';
    if (ready) {
      PREVIEW_SIZES.forEach(function (size) {
        var item = document.createElement('figure');
        var canvas = renderIcon(size);
        item.appendChild(canvas);
        var caption = document.createElement('figcaption');
        caption.textContent = size + '×' + size;
        item.appendChild(caption);
        sEl.sizes.appendChild(item);
      });
      var tab = sEl.tabIcon.getContext('2d');
      tab.clearRect(0, 0, 16, 16);
      tab.drawImage(renderIcon(16), 0, 0);
    } else {
      sEl.tabIcon.getContext('2d').clearRect(0, 0, 16, 16);
      var hint = document.createElement('p');
      hint.className = 'fav-empty';
      hint.textContent = st.source === 'image'
        ? 'Выберите изображение — здесь появится предпросмотр.'
        : 'Введите текст — здесь появится предпросмотр.';
      sEl.sizes.appendChild(hint);
    }
    sEl.html.value = ready ? staticHtml() : '';
    sEl.zip.disabled = sEl.ico.disabled = sEl.copy.disabled = !ready;
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) { return; }
    scheduled = true;
    setTimeout(function () { scheduled = false; refreshStatic(); }, 0);
  }

  function setSource(source) {
    st.source = source;
    Array.prototype.forEach.call(document.querySelectorAll('#fav-sources [data-source]'), function (b) {
      var on = b.getAttribute('data-source') === source;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    sEl.srcImage.hidden = source !== 'image';
    sEl.srcText.hidden = source === 'image';
    sEl.fgWrap.hidden = source !== 'text';
    if (source === 'emoji') {
      sEl.text.value = '🚀';
      sEl.transparent.checked = true;
      sEl.textLabel.textContent = 'Эмодзи';
    } else if (source === 'text') {
      sEl.text.value = 'F';
      sEl.transparent.checked = false;
      sEl.textLabel.textContent = 'Текст (1–3 символа)';
    }
    schedule();
  }

  function setShape(shape) {
    st.shape = shape;
    Array.prototype.forEach.call(document.querySelectorAll('#fav-shapes [data-shape]'), function (b) {
      var on = b.getAttribute('data-shape') === shape;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    schedule();
  }

  function loadImage(file) {
    showError(sEl.error, '');
    if (!/^image\//.test(file.type)) {
      showError(sEl.error, 'Выберите файл изображения.');
      return;
    }
    if (file.size > MAX_FILE) {
      showError(sEl.error, 'Файл больше 10 МБ.');
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      if (st.imageUrl) { URL.revokeObjectURL(st.imageUrl); }
      st.imageUrl = url;
      st.image = img;
      st.imageW = img.naturalWidth || 512;
      st.imageH = img.naturalHeight || 512;
      sEl.fileInfo.textContent = file.name + ' · ' + st.imageW + '×' + st.imageH;
      schedule();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showError(sEl.error, 'Не удалось прочитать изображение.');
    };
    img.src = url;
  }

  async function buildStaticFiles() {
    var sizes = [16, 32, 48, 180, 192, 512];
    var png = {};
    var data = await Promise.all(sizes.map(function (s) {
      return canvasBytes(renderIcon(s, s === 180 ? { shape: 'square', opaque: true } : {}));
    }));
    sizes.forEach(function (s, i) { png[s] = data[i]; });
    var ico = buildIco([16, 32, 48].map(function (s) { return { size: s, data: png[s] }; }));
    var color = sEl.bg.value;
    var manifest = JSON.stringify({
      name: 'My Site',
      short_name: 'My Site',
      icons: [
        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
      ],
      theme_color: color,
      background_color: color,
      display: 'standalone'
    }, null, 2);
    var enc = new TextEncoder();
    return {
      ico: ico,
      files: [
        { name: 'favicon.ico', data: new Uint8Array(await ico.arrayBuffer()) },
        { name: 'favicon-16x16.png', data: png[16] },
        { name: 'favicon-32x32.png', data: png[32] },
        { name: 'favicon-48x48.png', data: png[48] },
        { name: 'apple-touch-icon.png', data: png[180] },
        { name: 'android-chrome-192x192.png', data: png[192] },
        { name: 'android-chrome-512x512.png', data: png[512] },
        { name: 'site.webmanifest', data: enc.encode(manifest) },
        { name: 'snippet.html', data: enc.encode(staticHtml() + '\n') }
      ]
    };
  }

  function guarded(button, task) {
    button.addEventListener('click', function () {
      if (button.disabled) { return; }
      showError(sEl.error, '');
      task().catch(function (e) { showError(sEl.error, e.message || 'Ошибка при создании файлов.'); });
    });
  }

  guarded(sEl.zip, async function () {
    var built = await buildStaticFiles();
    download(buildZip(built.files), 'favicon.zip');
  });
  guarded(sEl.ico, async function () {
    var built = await buildStaticFiles();
    download(built.ico, 'favicon.ico');
  });
  sEl.copy.addEventListener('click', function () { copyText(sEl.html, sEl.copy); });

  Array.prototype.forEach.call(document.querySelectorAll('#fav-sources [data-source]'), function (b) {
    b.addEventListener('click', function () { setSource(b.getAttribute('data-source')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#fav-shapes [data-shape]'), function (b) {
    b.addEventListener('click', function () { setShape(b.getAttribute('data-shape')); });
  });
  [sEl.padding, sEl.bg, sEl.fg, sEl.transparent, sEl.text].forEach(function (node) {
    node.addEventListener('input', function () {
      if (node === sEl.bg) { sEl.transparent.checked = false; }
      schedule();
    });
  });
  bindDrop(sEl.drop, sEl.file, loadImage);
  sEl.reset.addEventListener('click', function () {
    if (st.imageUrl) { URL.revokeObjectURL(st.imageUrl); }
    st.image = null;
    st.imageUrl = null;
    sEl.fileInfo.textContent = '';
    sEl.padding.value = 8;
    sEl.bg.value = '#1f65db';
    sEl.fg.value = '#ffffff';
    sEl.transparent.checked = true;
    showError(sEl.error, '');
    setSource('image');
    setShape('rounded');
  });

  /* ---------- GIF → PNG-кадры ---------- */

  var gEl = {
    frames: $('fav-frames'), size: $('fav-gsize'), interval: $('fav-interval'), base: $('fav-base'),
    drop: $('fav-gif-drop'), file: $('fav-gif-file'), info: $('fav-gif-info'), error: $('fav-gif-error'),
    strip: $('fav-strip'), zip: $('fav-gif-zip'), copy: $('fav-gif-copy'), live: $('fav-gif-live'),
    clear: $('fav-gif-clear'), html: $('fav-gif-html'), stats: $('fav-gif-stats'),
    anim: $('fav-gif-anim'), tab: $('fav-gif-tab')
  };

  var gs = { gif: null, name: '', frames: [], token: 0, timer: null, index: 0, touched: false, liveTimer: null, liveLink: null };

  function clamp(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) { return fallback; }
    return Math.min(max, Math.max(min, n));
  }

  function gifHtml(count) {
    var base = normalizeBase(gEl.base.value);
    var interval = clamp(gEl.interval.value, 30, 2000, 120);
    var size = clamp(gEl.size.value, 16, 64, 32);
    return [
      '<link id="animated-favicon" rel="icon" type="image/png" sizes="' + size + 'x' + size + '" href="' + escHtml(base) + 'frame-01.png">',
      '<script>',
      '(function () {',
      "    const base = '" + escJs(base) + "';",
      "    const favicon = document.getElementById('animated-favicon');",
      '    const frameUrls = Array.from({ length: ' + count + ' }, function (_, index) {',
      "        return base + 'frame-' + String(index + 1).padStart(2, '0') + '.png';",
      '    });',
      '',
      '    function loadFrame(url) {',
      '        return new Promise(function (resolve, reject) {',
      '            const image = new Image();',
      '            image.onload = function () {',
      "                const canvas = document.createElement('canvas');",
      '                canvas.width = image.naturalWidth;',
      '                canvas.height = image.naturalHeight;',
      "                canvas.getContext('2d').drawImage(image, 0, 0);",
      "                resolve(canvas.toDataURL('image/png'));",
      '            };',
      '            image.onerror = function () {',
      "                reject(new Error('Не удалось загрузить favicon: ' + url));",
      '            };',
      '            image.src = url;',
      '        });',
      '    }',
      '',
      '    Promise.all(frameUrls.map(loadFrame))',
      '        .then(function (frames) {',
      '            let frame = 0;',
      '            favicon.href = frames[frame];',
      '',
      '            window.setInterval(function () {',
      '                frame = (frame + 1) % frames.length;',
      '                favicon.href = frames[frame];',
      '            }, ' + interval + ');',
      '        })',
      '        .catch(function (error) {',
      "            console.error('Не удалось запустить анимацию favicon:', error);",
      '        });',
      '})();',
      '<\/script>'
    ].join('\n');
  }

  function stopPreview() {
    if (gs.timer) { clearInterval(gs.timer); gs.timer = null; }
  }

  function drawPreviewFrame() {
    var frame = gs.frames[gs.index];
    if (!frame) { return; }
    var a = gEl.anim.getContext('2d');
    a.clearRect(0, 0, gEl.anim.width, gEl.anim.height);
    a.imageSmoothingEnabled = false;
    a.drawImage(frame, 0, 0, gEl.anim.width, gEl.anim.height);
    var t = gEl.tab.getContext('2d');
    t.clearRect(0, 0, 16, 16);
    t.imageSmoothingEnabled = true;
    t.drawImage(frame, 0, 0, 16, 16);
  }

  function startPreview() {
    stopPreview();
    if (!gs.frames.length) { return; }
    gs.index = 0;
    drawPreviewFrame();
    gs.timer = setInterval(function () {
      gs.index = (gs.index + 1) % gs.frames.length;
      drawPreviewFrame();
    }, clamp(gEl.interval.value, 30, 2000, 120));
  }

  function stopLive() {
    if (gs.liveTimer) { clearInterval(gs.liveTimer); gs.liveTimer = null; }
    if (gs.liveLink) {
      gs.liveLink.href = gs.liveOriginal || 'favicon.ico';
      gs.liveLink = null;
    }
    gEl.live.textContent = 'Показать во вкладке';
  }

  function startLive() {
    var link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    gs.liveOriginal = link.getAttribute('href');
    link.removeAttribute('type');
    gs.liveLink = link;
    var urls = gs.frames.map(function (c) { return c.toDataURL('image/png'); });
    var i = 0;
    link.href = urls[0];
    gs.liveTimer = setInterval(function () {
      i = (i + 1) % urls.length;
      link.href = urls[i];
    }, clamp(gEl.interval.value, 30, 2000, 120));
    gEl.live.textContent = 'Остановить во вкладке';
  }

  function resetGifOutput() {
    stopPreview();
    stopLive();
    gs.frames = [];
    gEl.strip.textContent = '';
    gEl.html.value = '';
    gEl.stats.textContent = '';
    gEl.zip.disabled = gEl.copy.disabled = gEl.live.disabled = true;
    gEl.anim.getContext('2d').clearRect(0, 0, gEl.anim.width, gEl.anim.height);
    gEl.tab.getContext('2d').clearRect(0, 0, 16, 16);
  }

  function rebuildGif() {
    if (!gs.gif) { return; }
    var token = ++gs.token;
    showError(gEl.error, '');
    var wanted = clamp(gEl.frames.value, 2, 60, 30);
    var size = clamp(gEl.size.value, 16, 64, 32);
    var indexes = pickIndexes(gs.gif.frames.length, wanted);

    var full;
    try {
      full = composeFrames(gs.gif, indexes);
    } catch (e) {
      resetGifOutput();
      showError(gEl.error, 'Не удалось разобрать GIF: ' + (e.message || e));
      return;
    }
    if (token !== gs.token) { return; }

    var wasLive = !!gs.liveTimer;
    stopLive();
    gs.frames = full.map(function (source) {
      var c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      drawContain(c.getContext('2d'), source, source.width, source.height, 0, 0, size, size);
      return c;
    });

    gEl.strip.textContent = '';
    gs.frames.forEach(function (frame, i) {
      var item = document.createElement('figure');
      var thumb = document.createElement('canvas');
      thumb.width = size;
      thumb.height = size;
      thumb.getContext('2d').drawImage(frame, 0, 0);
      item.appendChild(thumb);
      var cap = document.createElement('figcaption');
      cap.textContent = pad2(i + 1);
      item.appendChild(cap);
      gEl.strip.appendChild(item);
    });

    gEl.html.value = gifHtml(gs.frames.length);
    gEl.zip.disabled = gEl.copy.disabled = gEl.live.disabled = false;
    var note = gs.gif.frames.length < wanted
      ? ' В GIF всего ' + gs.gif.frames.length + ' кадров, поэтому получилось меньше запрошенных ' + wanted + '.'
      : '';
    gEl.stats.textContent = 'Кадров в GIF: ' + gs.gif.frames.length + ', в результате: ' + gs.frames.length +
      ', размер ' + size + '×' + size + '.' + note;
    startPreview();
    if (wasLive) { startLive(); }
  }

  function suggestInterval() {
    if (!gs.gif || gs.touched) { return; }
    var total = gs.gif.frames.reduce(function (sum, f) { return sum + f.delay; }, 0);
    var count = Math.min(clamp(gEl.frames.value, 2, 60, 30), gs.gif.frames.length);
    gEl.interval.value = clamp(Math.round(total / count / 10) * 10, 30, 2000, 120);
  }

  function loadGif(file) {
    showError(gEl.error, '');
    if (file.size > MAX_FILE) {
      showError(gEl.error, 'Файл больше 10 МБ.');
      return;
    }
    file.arrayBuffer().then(function (buf) {
      var gif;
      try {
        gif = parseGif(new Uint8Array(buf));
      } catch (e) {
        resetGifOutput();
        gs.gif = null;
        gEl.info.textContent = '';
        showError(gEl.error, e.message || 'Не удалось прочитать GIF.');
        return;
      }
      gs.gif = gif;
      gs.name = file.name;
      gs.touched = false;
      gEl.info.textContent = file.name + ' · ' + gif.width + '×' + gif.height + ' · кадров: ' + gif.frames.length;
      suggestInterval();
      rebuildGif();
    }, function () {
      showError(gEl.error, 'Не удалось прочитать файл.');
    });
  }

  var gifTimer = null;
  function deferRebuild() {
    clearTimeout(gifTimer);
    gifTimer = setTimeout(function () { suggestInterval(); rebuildGif(); }, 250);
  }

  gEl.frames.addEventListener('input', deferRebuild);
  gEl.size.addEventListener('change', deferRebuild);
  gEl.interval.addEventListener('input', function () {
    gs.touched = true;
    if (gs.frames.length) {
      gEl.html.value = gifHtml(gs.frames.length);
      startPreview();
      if (gs.liveTimer) { stopLive(); startLive(); }
    }
  });
  gEl.base.addEventListener('input', function () {
    if (gs.frames.length) { gEl.html.value = gifHtml(gs.frames.length); }
  });
  bindDrop(gEl.drop, gEl.file, loadGif);

  gEl.zip.addEventListener('click', async function () {
    if (!gs.frames.length) { return; }
    showError(gEl.error, '');
    try {
      var enc = new TextEncoder();
      var files = (await Promise.all(gs.frames.map(canvasBytes))).map(function (data, i) {
        return { name: 'frame-' + pad2(i + 1) + '.png', data: data };
      });
      files.push({ name: 'snippet.html', data: enc.encode(gEl.html.value + '\n') });
      download(buildZip(files), 'animated-favicon-frames.zip');
    } catch (e) {
      showError(gEl.error, e.message || 'Не удалось создать архив.');
    }
  });
  gEl.copy.addEventListener('click', function () { copyText(gEl.html, gEl.copy); });
  gEl.live.addEventListener('click', function () {
    if (gs.liveTimer) { stopLive(); } else if (gs.frames.length) { startLive(); }
  });
  gEl.clear.addEventListener('click', function () {
    gs.gif = null;
    gs.token++;
    gEl.info.textContent = '';
    showError(gEl.error, '');
    resetGifOutput();
  });

  resetGifOutput();
  setSource('image');
})();
