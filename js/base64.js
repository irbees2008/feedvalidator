(function () {
  'use strict';

  var MAX_FILE = 10 * 1024 * 1024;
  var HEX_LIMIT = 512;
  var SAMPLE = 'Привет, мир! Hello, world! 👋';

  var CHARSETS = {
    'utf-8': { name: 'UTF-8', single: false },
    'utf-16le': { name: 'UTF-16 LE', single: false },
    'windows-1251': { name: 'Windows-1251', single: true },
    'windows-1252': { name: 'Windows-1252', single: true }
  };

  var SIGNATURES = [
    { type: 'image/png', sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
    { type: 'image/jpeg', sig: [0xFF, 0xD8, 0xFF] },
    { type: 'image/gif', sig: [0x47, 0x49, 0x46, 0x38] },
    { type: 'application/pdf', sig: [0x25, 0x50, 0x44, 0x46, 0x2D] },
    { type: 'application/zip', sig: [0x50, 0x4B, 0x03, 0x04] },
    { type: 'application/gzip', sig: [0x1F, 0x8B, 0x08] },
    { type: 'application/x-7z-compressed', sig: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
    { type: 'image/x-icon', sig: [0x00, 0x00, 0x01, 0x00] }
  ];

  var EXTENSIONS = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
    'image/bmp': 'bmp', 'image/avif': 'avif', 'application/pdf': 'pdf',
    'application/zip': 'zip', 'application/gzip': 'gz', 'application/x-7z-compressed': '7z',
    'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml',
    'text/plain': 'txt', 'text/html': 'html', 'text/css': 'css',
    'application/octet-stream': 'bin'
  };

  var PREVIEWABLE = /^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|bmp|avif)$/;

  var EXAMPLES = {
    hello: { mode: 'decode', value: 'SGVsbG8gV29ybGQ=' },
    json: { mode: 'encode', value: '{"role":"student","active":true}' },
    dataurl: {
      mode: 'decode',
      value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen8GVAAAAAASUVORK5CYII='
    },
    urlsafe: { mode: 'encode', value: ">>??'>>", urlsafe: true }
  };

  function $(id) { return document.getElementById(id); }

  var el = {
    input: $('b64-input'),
    output: $('b64-output'),
    inputLabel: $('b64-input-label'),
    outputLabel: $('b64-output-label'),
    inputGroup: $('b64-input-group'),
    fileGroup: $('b64-file-group'),
    dropzone: $('b64-dropzone'),
    file: $('b64-file'),
    fileInfo: $('b64-fileinfo'),
    load: $('b64-load'),
    loadBtn: $('b64-load-btn'),
    charset: $('b64-charset'),
    charsetWrap: $('b64-charset-wrap'),
    wrap: $('b64-wrap'),
    urlsafe: $('b64-urlsafe'),
    datauri: $('b64-datauri'),
    error: $('b64-error'),
    stats: $('b64-stats'),
    badge: $('b64-badge'),
    filebox: $('b64-filebox'),
    preview: $('b64-preview'),
    fileType: $('b64-file-type'),
    fileSize: $('b64-file-size'),
    copy: $('b64-copy'),
    download: $('b64-download'),
    swap: $('b64-swap'),
    sample: $('b64-sample'),
    clear: $('b64-clear')
  };

  var modeLinks = document.querySelectorAll('#b64-modes a[data-mode]');
  var sourceBtns = document.querySelectorAll('#b64-sources [data-source]');

  var state = { mode: 'encode', source: 'text', file: null, download: null, previewUrl: null };
  var reverseMaps = {};

  /* ---------- байты и Base64 ---------- */

  function toBase64(bytes) {
    var parts = [];
    var chunk = 0x6000;
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(''));
  }

  function fromBase64(data) {
    var binary;
    try {
      binary = atob(data);
    } catch (e) {
      throw new Error('Не удалось декодировать строку: она не является корректным Base64.');
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function reverseMap(label) {
    if (reverseMaps[label]) {
      return reverseMaps[label];
    }
    var all = new Uint8Array(256);
    for (var i = 0; i < 256; i++) {
      all[i] = i;
    }
    var chars = new TextDecoder(label).decode(all);
    var map = {};
    for (var j = 0; j < chars.length; j++) {
      if (!(chars.charAt(j) in map)) {
        map[chars.charAt(j)] = j;
      }
    }
    reverseMaps[label] = map;
    return map;
  }

  function encodeText(text, charset) {
    if (charset === 'utf-8') {
      return new TextEncoder().encode(text);
    }
    if (charset === 'utf-16le') {
      var u16 = new Uint8Array(text.length * 2);
      for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);
        u16[2 * i] = code & 0xFF;
        u16[2 * i + 1] = code >> 8;
      }
      return u16;
    }
    var map = reverseMap(charset);
    var out = [];
    Array.from(text).forEach(function (ch) {
      if (!(ch in map)) {
        throw new Error('Символ «' + ch + '» нельзя представить в кодировке ' + CHARSETS[charset].name + '. Выберите UTF-8.');
      }
      out.push(map[ch]);
    });
    return Uint8Array.from(out);
  }

  function detectType(bytes) {
    for (var i = 0; i < SIGNATURES.length; i++) {
      var sig = SIGNATURES[i].sig;
      var ok = bytes.length >= sig.length;
      for (var j = 0; ok && j < sig.length; j++) {
        ok = bytes[j] === sig[j];
      }
      if (ok) {
        return SIGNATURES[i].type;
      }
    }
    var riff = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (riff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
    return '';
  }

  function isTextMime(mime) {
    return /^text\/|json|xml|javascript|svg/.test(mime);
  }

  function extensionFor(mime) {
    if (EXTENSIONS[mime]) {
      return EXTENSIONS[mime];
    }
    var sub = (mime.split('/')[1] || '').replace(/[^a-z0-9].*$/i, '');
    return sub || 'bin';
  }

  function parseInput(value) {
    var data = value.trim();
    var mime = '';
    var match = data.match(/^data:([^;,]*)((?:;[^,]*)?),/i);
    if (match) {
      mime = match[1].toLowerCase();
      if (!/;base64/i.test(match[2])) {
        throw new Error('Поддерживаются только data-URL с параметром base64.');
      }
      data = data.slice(match[0].length);
    }
    data = data.replace(/\s+/g, '');
    if (!data) {
      return { bytes: new Uint8Array(0), mime: mime };
    }
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) {
      throw new Error('Строка содержит недопустимые для Base64 символы.');
    }
    data = data.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (data.length % 4 === 1) {
      throw new Error('Некорректная длина строки Base64.');
    }
    while (data.length % 4) {
      data += '=';
    }
    return { bytes: fromBase64(data), mime: mime };
  }

  /* ---------- вывод ---------- */

  function formatSize(n) {
    if (n < 1024) {
      return n + ' Б';
    }
    if (n < 1024 * 1024) {
      return (n / 1024).toFixed(1).replace('.', ',') + ' КБ';
    }
    return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ';
  }

  function hexDump(bytes) {
    var n = Math.min(bytes.length, HEX_LIMIT);
    var lines = [];
    for (var i = 0; i < n; i += 16) {
      var row = [];
      for (var j = 0; j < 16 && i + j < n; j++) {
        row.push(('0' + bytes[i + j].toString(16)).slice(-2));
      }
      lines.push(('00000000' + i.toString(16)).slice(-8) + '  ' + row.join(' '));
    }
    if (bytes.length > n) {
      lines.push('… ещё ' + (bytes.length - n) + ' байт (скачайте файл, чтобы получить всё)');
    }
    return lines.join('\n');
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = !message;
  }

  function setBadge(text) {
    el.badge.textContent = text;
    el.badge.hidden = !text;
  }

  function releasePreview() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
    el.preview.hidden = true;
    el.preview.removeAttribute('src');
  }

  function reset() {
    el.output.value = '';
    el.stats.textContent = '';
    el.filebox.hidden = true;
    setBadge('');
    releasePreview();
    state.download = null;
    syncButtons();
  }

  function syncButtons() {
    el.copy.disabled = !el.output.value;
    el.download.disabled = !state.download;
  }

  function showFileBox(bytes, mime) {
    el.fileType.textContent = mime + ' (.' + extensionFor(mime) + ')';
    el.fileSize.textContent = formatSize(bytes.length) + ' (' + bytes.length + ' байт)';
    el.filebox.hidden = false;
    if (PREVIEWABLE.test(mime)) {
      state.previewUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      el.preview.src = state.previewUrl;
      el.preview.hidden = false;
    }
  }

  function wrapLines(text, width) {
    var lines = [];
    for (var i = 0; i < text.length; i += width) {
      lines.push(text.slice(i, i + width));
    }
    return lines.join('\r\n');
  }

  function textMime(charset) {
    return 'text/plain;charset=' + charset;
  }

  /* ---------- основная логика ---------- */

  function compute() {
    reset();
    showError('');
    try {
      if (state.mode === 'encode') {
        computeEncode();
      } else {
        computeDecode();
      }
    } catch (e) {
      el.output.value = '';
      state.download = null;
      showError(e.message);
    }
    syncButtons();
  }

  function computeEncode() {
    var bytes;
    var mime;
    var fileName = 'base64';
    if (state.source === 'text') {
      if (!el.input.value) {
        return;
      }
      bytes = encodeText(el.input.value, el.charset.value);
      mime = textMime(el.charset.value);
    } else {
      if (!state.file) {
        return;
      }
      bytes = state.file.bytes;
      mime = state.file.type || detectType(bytes) || 'application/octet-stream';
      fileName = state.file.name;
    }

    var result = toBase64(bytes);
    if (el.datauri.checked) {
      result = 'data:' + mime + ';base64,' + result;
    } else {
      if (el.urlsafe.checked) {
        result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      var width = parseInt(el.wrap.value, 10);
      if (width) {
        result = wrapLines(result, width);
      }
    }
    el.output.value = result;
    state.download = { name: fileName + '.b64.txt', type: 'text/plain', data: result, binary: false };

    var growth = bytes.length ? Math.round((result.length / bytes.length - 1) * 100) : 0;
    el.stats.textContent = 'Вход: ' + formatSize(bytes.length) + ' · Результат: ' + formatSize(result.length) +
      (bytes.length ? ' (' + (growth >= 0 ? '+' : '') + growth + '%)' : '');
    setBadge(el.datauri.checked ? 'data-URL' : (el.urlsafe.checked ? 'Base64URL' : 'Base64'));
  }

  function computeDecode() {
    var text = el.input.value;
    if (!text.trim()) {
      return;
    }
    var parsed = parseInput(text);
    var bytes = parsed.bytes;
    var detected = detectType(bytes);
    var mime = detected || parsed.mime;
    var decoded = null;

    var forcedBinary = detected || (parsed.mime && !isTextMime(parsed.mime));
    if (!forcedBinary) {
      try {
        decoded = new TextDecoder(el.charset.value, { fatal: true }).decode(bytes);
      } catch (e) {
        decoded = null;
      }
    }

    el.stats.textContent = 'Вход: ' + text.length + ' симв. · Данные: ' + formatSize(bytes.length);

    if (decoded !== null) {
      el.output.value = decoded;
      state.download = { name: 'decoded.txt', type: 'text/plain;charset=utf-8', data: decoded, binary: false };
      setBadge('Текст · ' + CHARSETS[el.charset.value].name);
      return;
    }

    mime = mime || 'application/octet-stream';
    el.output.value = hexDump(bytes);
    state.download = { name: 'decoded.' + extensionFor(mime), type: mime, data: bytes, binary: true };
    setBadge('Файл · hex');
    showFileBox(bytes, mime);
  }

  /* ---------- интерфейс ---------- */

  function applyView() {
    var encode = state.mode === 'encode';
    var fileSource = encode && state.source === 'file';

    Array.prototype.forEach.call(modeLinks, function (link) {
      var active = link.getAttribute('data-mode') === state.mode;
      link.parentNode.className = active ? 'active' : '';
      link.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Array.prototype.forEach.call(sourceBtns, function (btn) {
      var active = btn.getAttribute('data-source') === state.source;
      btn.className = 'b64-seg-btn' + (active ? ' active' : '');
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.b64-only-encode'), function (node) {
      node.hidden = !encode;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.b64-only-decode'), function (node) {
      node.hidden = encode;
    });

    el.inputGroup.hidden = fileSource;
    el.fileGroup.hidden = !fileSource;
    el.charsetWrap.hidden = fileSource;

    el.inputLabel.textContent = encode ? 'Текст' : 'Строка Base64 или data-URL';
    el.outputLabel.textContent = encode ? 'Результат Base64' : 'Результат';
    el.input.placeholder = encode
      ? 'Введите или вставьте текст для кодирования…'
      : 'Вставьте строку Base64 или data-URL для декодирования…';

    var dataUri = el.datauri.checked;
    el.urlsafe.disabled = dataUri;
    el.wrap.disabled = dataUri;
  }

  function setMode(mode) {
    state.mode = mode;
    applyView();
    compute();
  }

  function setSource(source) {
    state.source = source;
    applyView();
    compute();
  }

  function handleFile(file) {
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE) {
      showError('Файл слишком большой: ' + formatSize(file.size) + '. Максимум — ' + formatSize(MAX_FILE) + '.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      state.file = { name: file.name, type: file.type, bytes: new Uint8Array(reader.result) };
      el.fileInfo.textContent = file.name + ' · ' + formatSize(file.size);
      el.file.value = '';
      compute();
    };
    reader.onerror = function () {
      showError('Не удалось прочитать файл.');
    };
    reader.readAsArrayBuffer(file);
  }

  function download() {
    var item = state.download;
    if (!item) {
      return;
    }
    var url = URL.createObjectURL(new Blob([item.data], { type: item.type }));
    var link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copy() {
    if (!el.output.value) {
      return;
    }
    var done = function () {
      var old = el.copy.textContent;
      el.copy.textContent = 'Скопировано ✓';
      setTimeout(function () { el.copy.textContent = old; }, 1500);
    };
    var fallback = function () {
      el.output.select();
      document.execCommand('copy');
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.output.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  function swap() {
    if (!el.output.value || (state.download && state.download.binary)) {
      showError('Нечего переносить: результат пуст или это двоичные данные.');
      return;
    }
    var value = el.output.value;
    var next = state.mode === 'encode' ? 'decode' : 'encode';
    state.source = 'text';
    el.input.value = value;
    setMode(next);
  }

  function clearAll() {
    el.input.value = '';
    state.file = null;
    el.file.value = '';
    el.fileInfo.textContent = '';
    compute();
    el.input.focus();
  }

  function loadExample(name) {
    var example = EXAMPLES[name];
    if (!example) {
      return;
    }
    state.mode = example.mode;
    state.source = 'text';
    el.charset.value = 'utf-8';
    el.datauri.checked = false;
    el.urlsafe.checked = !!example.urlsafe;
    el.wrap.value = '0';
    el.input.value = example.value;
    applyView();
    compute();
    document.getElementById('b64-tool').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function loadSample() {
    if (state.mode === 'encode') {
      state.source = 'text';
      el.charset.value = 'utf-8';
      el.input.value = SAMPLE;
    } else {
      el.charset.value = 'utf-8';
      el.input.value = toBase64(new TextEncoder().encode(SAMPLE));
    }
    applyView();
    compute();
  }

  /* ---------- события ---------- */

  Array.prototype.forEach.call(modeLinks, function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      setMode(link.getAttribute('data-mode'));
    });
  });

  Array.prototype.forEach.call(sourceBtns, function (btn) {
    btn.addEventListener('click', function () {
      setSource(btn.getAttribute('data-source'));
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (btn) {
    btn.addEventListener('click', function () {
      loadExample(btn.getAttribute('data-example'));
    });
  });

  el.input.addEventListener('input', compute);
  el.charset.addEventListener('change', compute);
  el.wrap.addEventListener('change', compute);
  el.urlsafe.addEventListener('change', compute);
  el.datauri.addEventListener('change', function () {
    applyView();
    compute();
  });

  el.file.addEventListener('change', function () {
    handleFile(el.file.files[0]);
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    el.dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      el.dropzone.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    el.dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      el.dropzone.classList.remove('is-over');
    });
  });
  el.dropzone.addEventListener('drop', function (event) {
    handleFile(event.dataTransfer && event.dataTransfer.files[0]);
  });

  el.loadBtn.addEventListener('click', function () {
    el.load.click();
  });
  el.load.addEventListener('change', function () {
    var file = el.load.files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE) {
      showError('Файл слишком большой: ' + formatSize(file.size) + '. Максимум — ' + formatSize(MAX_FILE) + '.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      el.input.value = String(reader.result);
      el.load.value = '';
      compute();
    };
    reader.onerror = function () {
      showError('Не удалось прочитать файл.');
    };
    reader.readAsText(file);
  });

  el.copy.addEventListener('click', copy);
  el.download.addEventListener('click', download);
  el.swap.addEventListener('click', swap);
  el.sample.addEventListener('click', loadSample);
  el.clear.addEventListener('click', clearAll);

  applyView();
  syncButtons();
}());
