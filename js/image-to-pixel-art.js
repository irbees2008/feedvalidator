(function () {
  'use strict';

  var error = document.getElementById('image-to-pixel-art-error');
  var fileInput = document.getElementById('ipx-file');
  var drop = document.getElementById('ipx-drop');
  var widthInput = document.getElementById('ipx-width');
  var paletteInput = document.getElementById('ipx-palette');
  var ditherInput = document.getElementById('ipx-dither');
  var scaleInput = document.getElementById('ipx-scale');
  var gridInput = document.getElementById('ipx-grid');
  var info = document.getElementById('ipx-info');
  var stage = document.getElementById('ipx-stage');
  var preview = document.getElementById('ipx-preview');
  var grid = document.getElementById('ipx-grid-overlay');
  var download = document.getElementById('ipx-download');
  var reset = document.getElementById('ipx-reset');
  var source = null;
  var loadId = 0;
  var outputWidth = 0;
  var outputHeight = 0;
  var renderCanvas = document.createElement('canvas');

  var palettes = {
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    gray: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
    retro: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070',
      '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
      '#f4f4f4', '#94b0c2', '#566c86', '#333c57']
  };
  var allowedTypes = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp'
  };
  var MAX_BYTES = 25 * 1024 * 1024;
  var MAX_SOURCE_PIXELS = 40000000;
  var MAX_SOURCE_SIDE = 20000;
  var MAX_GRID_HEIGHT = 512;
  var MAX_EXPORT_PIXELS = 8000000;

  function clamp(value) {
    return Math.max(0, Math.min(255, value));
  }

  function hexColor(value) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16)
    ];
  }

  function nearestColor(r, g, b, palette) {
    var best = palette[0];
    var bestDistance = Infinity;
    for (var i = 0; i < palette.length; i++) {
      var c = palette[i];
      var dr = r - c[0], dg = g - c[1], db = b - c[2];
      var distance = 30 * dr * dr + 59 * dg * dg + 11 * db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = c;
      }
    }
    return best;
  }

  function imageKind(bytes) {
    function textAt(offset, value) {
      for (var i = 0; i < value.length; i++) {
        if (bytes[offset + i] !== value.charCodeAt(i)) { return false; }
      }
      return true;
    }
    if (bytes.length >= 8 && bytes[0] === 137 && textAt(1, 'PNG\r\n\x1a\n')) { return 'png'; }
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { return 'jpeg'; }
    if (bytes.length >= 6 && (textAt(0, 'GIF87a') || textAt(0, 'GIF89a'))) { return 'gif'; }
    if (bytes.length >= 12 && textAt(0, 'RIFF') && textAt(8, 'WEBP')) { return 'webp'; }
    if (bytes.length >= 2 && textAt(0, 'BM')) { return 'bmp'; }
    return '';
  }

  function quantize(imageData, paletteName, useDither) {
    if (paletteName === 'original') { return imageData; }

    var palette = palettes[paletteName].map(hexColor);
    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;
    var rgb = new Float32Array(width * height * 3);
    for (var i = 0; i < width * height; i++) {
      rgb[i * 3] = data[i * 4];
      rgb[i * 3 + 1] = data[i * 4 + 1];
      rgb[i * 3 + 2] = data[i * 4 + 2];
    }

    function spread(x, y, factor, er, eg, eb) {
      if (x < 0 || x >= width || y >= height) { return; }
      var index = (y * width + x) * 3;
      rgb[index] += er * factor;
      rgb[index + 1] += eg * factor;
      rgb[index + 2] += eb * factor;
    }

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var pixel = y * width + x;
        var alpha = pixel * 4 + 3;
        if (data[alpha] < 128) {
          data[pixel * 4 + 3] = 0;
          continue;
        }
        data[alpha] = 255;

        var index = pixel * 3;
        var r = clamp(rgb[index]);
        var g = clamp(rgb[index + 1]);
        var b = clamp(rgb[index + 2]);
        var chosen = nearestColor(r, g, b, palette);
        data[pixel * 4] = chosen[0];
        data[pixel * 4 + 1] = chosen[1];
        data[pixel * 4 + 2] = chosen[2];
        if (!useDither) { continue; }

        var er = r - chosen[0], eg = g - chosen[1], eb = b - chosen[2];
        spread(x + 1, y, 7 / 16, er, eg, eb);
        spread(x - 1, y + 1, 3 / 16, er, eg, eb);
        spread(x, y + 1, 5 / 16, er, eg, eb);
        spread(x + 1, y + 1, 1 / 16, er, eg, eb);
      }
    }
    return imageData;
  }

  function setGrid() {
    grid.hidden = !gridInput.checked || !source;
    if (source) {
      grid.style.setProperty('--ipx-step-x', (100 / outputWidth) + '%');
      grid.style.setProperty('--ipx-step-y', (100 / outputHeight) + '%');
      grid.style.width = preview.clientWidth + 'px';
      grid.style.height = preview.clientHeight + 'px';
    }
  }

  function render() {
    updateDitherState();
    if (!source) { return; }
    var maxWidth = parseInt(widthInput.value, 10);
    if (!isFinite(maxWidth) || maxWidth < 8 || maxWidth > 128) {
      widthInput.setAttribute('aria-invalid', 'true');
      FV.showError(error, 'Ширина пиксельной сетки должна быть от 8 до 128 пикселей.');
      return;
    }
    widthInput.removeAttribute('aria-invalid');
    FV.clearError(error);

    var ratio = source.height / source.width;
    var w = maxWidth;
    var h = Math.max(1, Math.round(w * ratio));
    if (h > MAX_GRID_HEIGHT) {
      h = MAX_GRID_HEIGHT;
      w = Math.max(1, Math.round(h / ratio));
    }
    outputWidth = w;
    outputHeight = h;

    renderCanvas.width = w;
    renderCanvas.height = h;
    var context = renderCanvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, w, h);
    context.imageSmoothingEnabled = true;
    context.drawImage(source.image, 0, 0, w, h);
    var imageData = context.getImageData(0, 0, w, h);
    imageData = quantize(imageData, paletteInput.value, ditherInput.value === 'floyd');
    context.putImageData(imageData, 0, 0);

    preview.width = w;
    preview.height = h;
    preview.style.width = '100%';
    preview.style.height = 'auto';
    var previewContext = preview.getContext('2d');
    previewContext.clearRect(0, 0, w, h);
    previewContext.putImageData(imageData, 0, 0);
    stage.hidden = false;
    download.disabled = false;
    reset.disabled = false;
    var scale = parseInt(scaleInput.value, 10);
    var actualScale = Math.min(scale, Math.floor(Math.sqrt(MAX_EXPORT_PIXELS / (w * h))));
    actualScale = Math.max(1, actualScale);
    info.textContent = source.name + ' · ' + source.width + '×' + source.height + ' · сетка ' +
      w + '×' + h + ' · ' + paletteInput.options[paletteInput.selectedIndex].text +
      (actualScale < scale ? ' · масштаб PNG ограничен до ' + actualScale + '× для размера файла' : '');
    setGrid();
  }

  function updateDitherState() {
    ditherInput.disabled = paletteInput.value === 'original';
    if (ditherInput.disabled) { ditherInput.value = 'none'; }
  }

  function loadFile(file) {
    if (!file) { return; }
    var id = ++loadId;
    FV.clearError(error);
    if (file.size > MAX_BYTES) {
      FV.showError(error, 'Файл превышает лимит 25 МБ.');
      return;
    }

    file.slice(0, 12).arrayBuffer().then(function (buffer) {
      if (id !== loadId) { return; }
      var type = file.type.toLowerCase();
      var kind = imageKind(new Uint8Array(buffer));
      var knownType = !type || Object.prototype.hasOwnProperty.call(allowedTypes, type);
      if (!knownType || !kind || (type && allowedTypes[type] !== kind)) {
        FV.showError(error, 'Выберите настоящий растровый файл PNG, JPEG, WebP, GIF или BMP. SVG и другие форматы не поддерживаются.');
        return;
      }

      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        if (id !== loadId) { return; }
        var w = image.naturalWidth || image.width;
        var h = image.naturalHeight || image.height;
        if (!w || !h || w > MAX_SOURCE_SIDE || h > MAX_SOURCE_SIDE || w * h > MAX_SOURCE_PIXELS) {
          FV.showError(error, 'Размер изображения слишком велик. Максимум — 20 000 px по стороне и 40 мегапикселей.');
          return;
        }
        source = { image: image, name: file.name, width: w, height: h };
        render();
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        if (id === loadId) {
          FV.showError(error, 'Не удалось прочитать изображение. Попробуйте сохранить его в PNG, JPEG или WebP.');
        }
      };
      image.src = url;
    }, function () {
      if (id === loadId) { FV.showError(error, 'Не удалось прочитать файл.'); }
    });
  }

  function downloadPng() {
    if (!source) { return; }
    var requestedScale = parseInt(scaleInput.value, 10);
    var scale = Math.min(requestedScale, Math.floor(Math.sqrt(MAX_EXPORT_PIXELS / (outputWidth * outputHeight))));
    scale = Math.max(1, scale);
    var output = document.createElement('canvas');
    output.width = outputWidth * scale;
    output.height = outputHeight * scale;
    var context = output.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(renderCanvas, 0, 0, output.width, output.height);
    output.toBlob(function (blob) {
      if (!blob) {
        FV.showError(error, 'Не удалось подготовить PNG. Попробуйте выбрать меньший масштаб.');
        return;
      }
      FV.download(blob, 'pixel-art.png');
    }, 'image/png');
  }

  document.getElementById('ipx-choose').addEventListener('click', function (event) {
    event.stopPropagation();
    fileInput.click();
  });
  drop.addEventListener('click', function (event) {
    if (event.target !== document.getElementById('ipx-choose')) { fileInput.click(); }
  });
  drop.addEventListener('keydown', function (event) {
    if (event.target === drop && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', function () {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (name) {
    drop.addEventListener(name, function (event) {
      event.preventDefault();
      drop.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    drop.addEventListener(name, function (event) {
      event.preventDefault();
      drop.classList.remove('drag-over');
    });
  });
  drop.addEventListener('drop', function (event) {
    loadFile(event.dataTransfer.files[0]);
  });

  [widthInput, paletteInput, ditherInput, scaleInput].forEach(function (input) {
    input.addEventListener('input', render);
    input.addEventListener('change', render);
  });
  gridInput.addEventListener('change', setGrid);
  download.addEventListener('click', downloadPng);
  reset.addEventListener('click', function () {
    widthInput.value = '32';
    paletteInput.value = 'original';
    ditherInput.value = 'none';
    scaleInput.value = '8';
    gridInput.checked = false;
    render();
  });
  window.addEventListener('resize', FV.debounce(setGrid, 100));
  updateDitherState();
  FV.clearError(error);
})();
