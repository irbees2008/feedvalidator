(function () {
  'use strict';
  var error = document.getElementById('image-converter-error');
  var fileInput = document.getElementById('imc-file');
  var formatSel = document.getElementById('imc-format');
  var quality = document.getElementById('imc-quality');
  var widthInput = document.getElementById('imc-width');
  var result = document.getElementById('imc-result');
  var preview = document.getElementById('imc-preview');
  var download = document.getElementById('imc-download');
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  var MAX_BYTES = 30 * 1024 * 1024;
  var current = null;
  var lastUrl = '';

  function size(n) { return n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(1) + ' КБ' : (n / 1048576).toFixed(2) + ' МБ'; }

  function convert() {
    FV.clearError(error);
    if (!current) { result.hidden = true; return; }
    var img = current.img;
    var type = formatSel.value;
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var maxW = parseInt(widthInput.value, 10);
    if (maxW > 0 && maxW < w) { h = Math.round(h * maxW / w); w = maxW; }
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(function (blob) {
      if (!blob || blob.type !== type) {
        result.hidden = true;
        FV.showError(error, 'Ваш браузер не умеет сохранять в выбранный формат. Попробуйте PNG или JPEG.');
        return;
      }
      if (lastUrl) { URL.revokeObjectURL(lastUrl); }
      lastUrl = URL.createObjectURL(blob);
      preview.src = lastUrl;
      download.href = lastUrl;
      download.setAttribute('download', current.name.replace(/\.[^.]+$/, '') + '.' + EXT[type]);
      document.getElementById('imc-info').textContent = current.name + ': ' + (img.naturalWidth || img.width) + '×' + (img.naturalHeight || img.height) +
        ' (' + size(current.size) + ') → ' + w + '×' + h + ' ' + EXT[type].toUpperCase() + ' (' + size(blob.size) + ')';
      result.hidden = false;
    }, type, parseInt(quality.value, 10) / 100);
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    FV.clearError(error);
    if (!f) { current = null; convert(); return; }
    if (!/^image\//.test(f.type)) { FV.showError(error, 'Выберите файл изображения.'); return; }
    if (f.size > MAX_BYTES) { FV.showError(error, 'Файл больше 30 МБ.'); return; }
    var url = URL.createObjectURL(f);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); current = { img: img, name: f.name, size: f.size }; convert(); };
    img.onerror = function () { URL.revokeObjectURL(url); current = null; result.hidden = true; FV.showError(error, 'Не удалось прочитать изображение.'); };
    img.src = url;
  });
  formatSel.addEventListener('change', convert);
  widthInput.addEventListener('input', FV.debounce(convert, 250));
  quality.addEventListener('input', function () {
    document.getElementById('imc-q-val').textContent = quality.value;
    convert();
  });
})();
