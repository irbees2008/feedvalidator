(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var error = $('ia-error');
  var fileInput = $('ia-file');
  var choose = $('ia-choose');
  var drop = $('ia-drop');
  var preview = $('ia-preview');
  var empty = $('ia-empty');
  var download = $('ia-download');
  var play = $('ia-play');
  var speed = $('ia-speed');
  var sizeInput = $('ia-size');
  var status = $('ia-status');
  var MAX_BYTES = 25 * 1024 * 1024;
  var MAX_PIXELS = 40000000;
  var FRAME_COUNT = 30;
  var current = null;
  var paused = false;
  var pausedAt = 0;
  var startAt = 0;
  var animationFrame = 0;

  function effect() {
    return document.querySelector('input[name="ia-effect"]:checked').value;
  }

  function duration() {
    return FRAME_COUNT * parseInt(speed.value, 10);
  }

  function progress(now) {
    var elapsed = paused ? pausedAt : now - startAt;
    return (elapsed % duration()) / duration();
  }

  function renderFrame(canvas, image, kind, t) {
    var size = canvas.width;
    var ctx = canvas.getContext('2d');
    var imageWidth = image.naturalWidth || image.width;
    var imageHeight = image.naturalHeight || image.height;
    var fit = Math.min(size * 0.84 / imageWidth, size * 0.84 / imageHeight);
    var width = imageWidth * fit;
    var height = imageHeight * fit;
    var wave = Math.sin(t * Math.PI * 2);
    var cosine = Math.cos(t * Math.PI * 2);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    if (kind === 'horizontal') {
      ctx.scale(Math.sign(cosine || 1) * Math.max(0.025, Math.abs(cosine)), 1);
    } else if (kind === 'vertical') {
      ctx.scale(1, Math.sign(cosine || 1) * Math.max(0.025, Math.abs(cosine)));
    } else if (kind === 'pulse') {
      var pulse = 0.84 + 0.2 * (1 - cosine) / 2;
      ctx.scale(pulse, pulse);
    } else if (kind === 'spin') {
      ctx.rotate(t * Math.PI * 2);
    } else if (kind === 'swing') {
      ctx.rotate(wave * 0.3);
    } else if (kind === 'bounce') {
      ctx.translate(0, -Math.abs(wave) * size * 0.12);
    }
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawPreview(now) {
    if (!current) { return; }
    renderFrame(preview, current.image, effect(), progress(now));
    animationFrame = window.requestAnimationFrame(drawPreview);
  }

  function setSize() {
    var size = parseInt(sizeInput.value, 10);
    preview.width = size;
    preview.height = size;
    if (current) { renderFrame(preview, current.image, effect(), progress(performance.now())); }
  }

  function loadFile(file) {
    FV.clearError(error);
    if (!file) { return; }
    if (!/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type)) {
      FV.showError(error, 'Выберите изображение в формате PNG, JPEG, WebP, GIF или BMP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      FV.showError(error, 'Файл больше 25 МБ.');
      return;
    }

    var url = URL.createObjectURL(file);
    var image = new Image();
    image.onload = function () {
      URL.revokeObjectURL(url);
      if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
        FV.showError(error, 'Изображение слишком большое. Максимальный размер — 40 мегапикселей.');
        return;
      }
      current = { image: image, name: file.name };
      $('ia-file-name').textContent = file.name + ' · ' + image.naturalWidth + ' × ' + image.naturalHeight;
      empty.hidden = true;
      preview.hidden = false;
      play.disabled = false;
      download.disabled = false;
      paused = false;
      pausedAt = 0;
      startAt = performance.now();
      play.textContent = 'Пауза';
      play.setAttribute('aria-pressed', 'false');
      setSize();
      if (!animationFrame) { animationFrame = window.requestAnimationFrame(drawPreview); }
      $('ia-info').textContent = '30 кадров · бесконечный цикл · ' + sizeInput.value + ' × ' + sizeInput.value + ' px';
    };
    image.onerror = function () {
      URL.revokeObjectURL(url);
      FV.showError(error, 'Не удалось прочитать изображение. Попробуйте выбрать другой файл.');
    };
    image.src = url;
  }

  function lzw(minCode, indices) {
    var clear = 1 << minCode;
    var end = clear + 1;
    var next = end + 1;
    var codeSize = minCode + 1;
    var dictionary = new Map();
    var output = [];
    var bits = 0;
    var buffer = 0;

    function emit(code) {
      buffer |= code << bits;
      bits += codeSize;
      while (bits >= 8) {
        output.push(buffer & 255);
        buffer >>>= 8;
        bits -= 8;
      }
    }

    emit(clear);
    var prefix = indices[0];
    for (var i = 1; i < indices.length; i++) {
      var value = indices[i];
      var key = (prefix << 8) | value;
      var known = dictionary.get(key);
      if (known !== undefined) {
        prefix = known;
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        dictionary.clear();
        next = end + 1;
        codeSize = minCode + 1;
      } else {
        if (next >= (1 << codeSize)) { codeSize++; }
        dictionary.set(key, next++);
      }
      prefix = value;
    }
    emit(prefix);
    emit(end);
    if (bits) { output.push(buffer & 255); }
    return output;
  }

  function encodeGif() {
    var size = parseInt(sizeInput.value, 10);
    var frameCanvas = document.createElement('canvas');
    frameCanvas.width = size;
    frameCanvas.height = size;
    var ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
    var bytes = [];
    var delay = Math.max(2, Math.round(parseInt(speed.value, 10) / 10));

    function write16(value) { bytes.push(value & 255, (value >> 8) & 255); }

    'GIF89a'.split('').forEach(function (character) { bytes.push(character.charCodeAt(0)); });
    write16(size);
    write16(size);
    bytes.push(0xF7, 0, 0);
    bytes.push(0, 0, 0);
    for (var paletteIndex = 1; paletteIndex < 253; paletteIndex++) {
      var color = paletteIndex - 1;
      var red = Math.floor(color / 42);
      var green = Math.floor((color % 42) / 6);
      var blue = color % 6;
      bytes.push(red * 51, Math.round(green * 255 / 6), blue * 51);
    }
    for (var unused = 253; unused < 256; unused++) { bytes.push(0, 0, 0); }

    bytes.push(0x21, 0xFF, 0x0B);
    'NETSCAPE2.0'.split('').forEach(function (character) { bytes.push(character.charCodeAt(0)); });
    bytes.push(3, 1, 0, 0, 0);

    for (var frame = 0; frame < FRAME_COUNT; frame++) {
      renderFrame(frameCanvas, current.image, effect(), frame / FRAME_COUNT);
      var pixels = ctx.getImageData(0, 0, size, size).data;
      var indices = new Uint8Array(size * size);
      for (var pixel = 0; pixel < indices.length; pixel++) {
        var offset = pixel * 4;
        if (pixels[offset + 3] < 128) {
          indices[pixel] = 0;
        } else {
          var r = Math.round(pixels[offset] * 5 / 255);
          var g = Math.round(pixels[offset + 1] * 6 / 255);
          var b = Math.round(pixels[offset + 2] * 5 / 255);
          indices[pixel] = 1 + r * 42 + g * 6 + b;
        }
      }

      bytes.push(0x21, 0xF9, 4, 9);
      write16(delay);
      bytes.push(0, 0);
      bytes.push(0x2C);
      write16(0);
      write16(0);
      write16(size);
      write16(size);
      bytes.push(0, 8);

      var compressed = lzw(8, indices);
      for (var offset = 0; offset < compressed.length; offset += 255) {
        var length = Math.min(255, compressed.length - offset);
        bytes.push(length);
        for (var chunkIndex = 0; chunkIndex < length; chunkIndex++) {
          bytes.push(compressed[offset + chunkIndex]);
        }
      }
      bytes.push(0);
    }
    bytes.push(0x3B);
    return new Uint8Array(bytes);
  }

  choose.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { loadFile(fileInput.files[0]); });
  drop.addEventListener('dragover', function (event) {
    event.preventDefault();
    drop.classList.add('is-dragging');
  });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-dragging'); });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    drop.classList.remove('is-dragging');
    loadFile(event.dataTransfer.files[0]);
  });

  document.querySelectorAll('input[name="ia-effect"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (current) { renderFrame(preview, current.image, effect(), progress(performance.now())); }
    });
  });
  sizeInput.addEventListener('change', function () {
    setSize();
    $('ia-info').textContent = '30 кадров · бесконечный цикл · ' + sizeInput.value + ' × ' + sizeInput.value + ' px';
  });
  speed.addEventListener('input', function () {
    $('ia-speed-value').textContent = speed.value;
    if (!paused) { startAt = performance.now() - progress(performance.now()) * duration(); }
  });
  play.addEventListener('click', function () {
    if (!current) { return; }
    paused = !paused;
    if (paused) {
      pausedAt = progress(performance.now()) * duration();
      play.textContent = 'Продолжить';
      play.setAttribute('aria-pressed', 'true');
    } else {
      startAt = performance.now() - pausedAt;
      play.textContent = 'Пауза';
      play.setAttribute('aria-pressed', 'false');
    }
  });
  download.addEventListener('click', function () {
    if (!current) { return; }
    download.disabled = true;
    status.textContent = 'Создаём GIF…';
    try {
      var bytes = encodeGif();
      var name = current.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '-') || 'animation';
      FV.download(new Blob([bytes], { type: 'image/gif' }), name + '-animation.gif');
      status.textContent = 'Готово: 30 кадров, ' + sizeInput.value + ' × ' + sizeInput.value + ' px.';
    } catch (exception) {
      status.textContent = '';
      FV.showError(error, 'Не удалось создать GIF. Попробуйте уменьшить размер кадра.');
      throw exception;
    } finally {
      download.disabled = false;
    }
  });

  preview.hidden = true;
})();
