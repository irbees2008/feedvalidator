(function () {
  'use strict';
  var error = document.getElementById('image-compressor-error');
  var fileInput = document.getElementById('imz-file');
  var formatSel = document.getElementById('imz-format');
  var quality = document.getElementById('imz-quality');
  var widthInput = document.getElementById('imz-width');
  var result = document.getElementById('imz-result');
  var tbody = document.getElementById('imz-table').querySelector('tbody');
  var MAX_BYTES = 30 * 1024 * 1024, MAX_FILES = 20;
  var items = [];
  var urls = [];
  var run = 0;

  function size(n) { return n < 1024 ? n + ' Б' : n < 1048576 ? (n / 1024).toFixed(1) + ' КБ' : (n / 1048576).toFixed(2) + ' МБ'; }

  function load(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('не удалось прочитать')); };
      img.src = url;
    });
  }

  function compress(file) {
    return load(file).then(function (img) {
      var type = formatSel.value;
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var maxW = parseInt(widthInput.value, 10);
      if (maxW > 0 && maxW < w) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob && blob.type === type) { resolve(blob); } else { reject(new Error('формат не поддерживается браузером')); }
        }, type, parseInt(quality.value, 10) / 100);
      });
    });
  }

  function render() {
    FV.clearError(error);
    var files = Array.prototype.slice.call(fileInput.files || []);
    var id = ++run;
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
    tbody.innerHTML = '';
    if (!files.length) { result.hidden = true; return; }
    if (files.length > MAX_FILES) { FV.showError(error, 'Выбрано больше ' + MAX_FILES + ' файлов — обработаны первые ' + MAX_FILES + '.'); files = files.slice(0, MAX_FILES); }
    result.hidden = false;
    var ext = formatSel.value === 'image/webp' ? 'webp' : 'jpg';
    files.reduce(function (chain, file) {
      return chain.then(function () {
        if (id !== run) { return; }
        var tr = document.createElement('tr');
        var name = FV.escapeHtml(file.name);
        if (!/^image\//.test(file.type) || file.size > MAX_BYTES) {
          tr.innerHTML = '<td>' + name + '</td><td colspan="4">пропущен: не изображение или больше 30 МБ</td>';
          tbody.appendChild(tr);
          return;
        }
        return compress(file).then(function (blob) {
          if (id !== run) { return; }
          var url = URL.createObjectURL(blob);
          urls.push(url);
          var saved = Math.round((1 - blob.size / file.size) * 100);
          tr.innerHTML = '<td>' + name + '</td><td>' + size(file.size) + '</td><td>' + size(blob.size) + '</td><td>' +
            (saved >= 0 ? '−' + saved + '%' : '<span class="fv-bad">+' + (-saved) + '% (больше оригинала)</span>') + '</td>' +
            '<td><a class="b64-seg-btn" href="' + url + '" download="' + FV.escapeHtml(file.name.replace(/\.[^.]+$/, '')) + '-min.' + ext + '">Скачать</a></td>';
          tbody.appendChild(tr);
        }, function (e) {
          tr.innerHTML = '<td>' + name + '</td><td colspan="4">ошибка: ' + FV.escapeHtml(e.message) + '</td>';
          tbody.appendChild(tr);
        });
      });
    }, Promise.resolve());
  }

  fileInput.addEventListener('change', render);
  formatSel.addEventListener('change', render);
  widthInput.addEventListener('input', FV.debounce(render, 300));
  quality.addEventListener('input', FV.debounce(function () {
    document.getElementById('imz-q-val').textContent = quality.value;
    render();
  }, 200));
  quality.addEventListener('input', function () { document.getElementById('imz-q-val').textContent = quality.value; });
})();
