const FORMAT_BY_EXTENSION = {
  eot: 'eot',
  otf: 'otf',
  svg: 'svg',
  ttf: 'ttf',
  woff: 'woff',
  woff2: 'woff2'
};
const OUTPUT_TYPES = {
  ttf: { mime: 'font/ttf', format: 'truetype' },
  woff: { mime: 'font/woff', format: 'woff' },
  woff2: { mime: 'font/woff2', format: 'woff2' },
  eot: { mime: 'application/vnd.ms-fontobject', format: 'embedded-opentype' },
  svg: { mime: 'image/svg+xml', format: 'svg' }
};
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const WASM_URL = 'https://cdn.jsdelivr.net/npm/fonteditor-core@2.6.3/woff2/woff2.wasm';

const errorBox = document.getElementById('fonts-error');
const catalogSelect = document.getElementById('font-catalog');
const fileInput = document.getElementById('font-file');
const familyInput = document.getElementById('font-family');
const weightSelect = document.getElementById('font-weight');
const styleSelect = document.getElementById('font-style');
const sampleInput = document.getElementById('font-sample');
const preview = document.getElementById('font-preview');
const sourceInfo = document.getElementById('font-source-info');
const convertButton = document.getElementById('font-convert');
const convertStatus = document.getElementById('font-convert-status');
const results = document.getElementById('font-convert-results');
const cssCode = document.getElementById('font-css-code');

let currentSource = null;
let currentFontFace = null;
let fontLibraryPromise = null;
let woff2Promise = null;

function showError(message) {
  FV.showError(errorBox, message);
}

function clearError() {
  FV.clearError(errorBox);
}

function extensionOf(name) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function familyFromName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'SiteFont';
}

function quoteCss(value) {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\f]/g, ' ') + "'";
}

function siteFontPath(name) {
  return '/' + name.replace(/^\/+/, '').split('/').map(function (part) {
    return encodeURIComponent(part).replace(/'/g, '%27');
  }).join('/');
}

function updateCss() {
  const family = familyInput.value.trim() || 'SiteFont';
  const sourcePath = currentSource ? currentSource.url : 'fonts/site-font';
  const stem = sourcePath.replace(/\.[^.]+$/, '');
  const familyCss = quoteCss(family);
  const weight = weightSelect.value;
  const style = styleSelect.value;
  const css = "@font-face {\n" +
    '  font-family: ' + familyCss + ';\n' +
    "  src: url('" + siteFontPath(stem + '.woff2') + "') format('woff2'),\n" +
    "       url('" + siteFontPath(stem + '.woff') + "') format('woff');\n" +
    '  font-weight: ' + weight + ';\n' +
    '  font-style: ' + style + ';\n' +
    '  font-display: swap;\n' +
    '}\n\nbody {\n  font-family: ' + familyCss + ', Arial, sans-serif;\n}';
  cssCode.textContent = css;
  preview.style.fontFamily = family ? quoteCss(family) + ', Arial, sans-serif' : '';
  preview.style.fontWeight = weight;
  preview.style.fontStyle = style;
  preview.textContent = sampleInput.value;
}

function loadFontLibrary() {
  if (!fontLibraryPromise) {
    fontLibraryPromise = import('https://cdn.jsdelivr.net/npm/fonteditor-core@2.6.3/+esm')
      .then(function (library) {
        return library;
      })
      .catch(function (error) {
        fontLibraryPromise = null;
        throw new Error('Не удалось загрузить библиотеку конвертации. Проверьте подключение к интернету и повторите попытку.');
      });
  }
  return fontLibraryPromise;
}

function initWoff2(library) {
  if (!woff2Promise) {
    woff2Promise = new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        reject(new Error('Не удалось загрузить модуль WOFF2 за 30 секунд. Проверьте подключение к CDN и повторите попытку.'));
      }, 30000);
      library.woff2.init(WASM_URL).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (error) {
        clearTimeout(timer);
        reject(error);
      });
    }).catch(function (error) {
      woff2Promise = null;
      throw error;
    });
  }
  return woff2Promise;
}

function showResults(items) {
  results.replaceChildren();
  items.forEach(function (item) {
    const li = document.createElement('li');
    li.textContent = item;
    results.appendChild(li);
  });
  results.hidden = items.length === 0;
}

function setSource(name, format, buffer, size, url) {
  if (currentFontFace) {
    document.fonts.delete(currentFontFace);
    currentFontFace = null;
  }
  currentSource = { name: name, format: format, buffer: buffer, size: size, url: url || 'fonts/' + name.split('/').pop() };
  familyInput.value = familyFromName(name.split('/').pop());
  fileInput.value = '';
  clearError();
  convertButton.disabled = false;
  convertStatus.textContent = '';
  showResults([]);
  sourceInfo.textContent = name + ' · ' + (size / 1024).toFixed(1) + ' КБ · ' + format.toUpperCase();
  updateCss();
  loadPreview();
}

async function loadPreview() {
  const source = currentSource;
  if (!source || !window.FontFace) {
    return;
  }
  try {
    const face = new FontFace(familyInput.value.trim() || 'SiteFont', source.buffer.slice(0), {
      weight: weightSelect.value,
      style: styleSelect.value
    });
    await face.load();
    if (source !== currentSource) {
      return;
    }
    if (currentFontFace) {
      document.fonts.delete(currentFontFace);
    }
    currentFontFace = face;
    document.fonts.add(face);
    preview.style.fontFamily = quoteCss(face.family) + ', Arial, sans-serif';
    sourceInfo.textContent = source.name + ' · ' + (source.size / 1024).toFixed(1) +
      ' КБ · ' + source.format.toUpperCase() + ' · предпросмотр загружен';
  } catch (error) {
    if (source !== currentSource) {
      return;
    }
    sourceInfo.textContent = source.name + ' · ' + (source.size / 1024).toFixed(1) +
      ' КБ · предпросмотр этого формата не поддерживается браузером';
  }
}

async function loadCatalog() {
  try {
    const response = await fetch('fonts/catalog.txt', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Каталог не найден (' + response.status + ').');
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.fonts)) {
      throw new Error('Файл каталога имеет неверный формат.');
    }
    catalogSelect.replaceChildren(new Option('Выберите шрифт', ''));
    data.fonts.forEach(function (font) {
      if (typeof font.name !== 'string' || typeof font.url !== 'string' ||
          !font.url.startsWith('/fonts/') || font.url.split('/').includes('..') ||
          !FORMAT_BY_EXTENSION[font.format]) {
        return;
      }
      const option = new Option(font.name + ' (' + font.format.toUpperCase() + ')', font.url);
      option.dataset.format = font.format;
      catalogSelect.appendChild(option);
    });
    document.getElementById('font-catalog-status').textContent = data.fonts.length
      ? 'В каталоге файлов: ' + data.fonts.length
      : 'Каталог пока пуст. Добавьте файлы в fonts/ и пересоберите его скриптом.';
  } catch (error) {
    catalogSelect.replaceChildren(new Option('Каталог недоступен', ''));
    document.getElementById('font-catalog-status').textContent =
      'Не удалось прочитать fonts/catalog.txt. Проверьте, что каталог создан скриптом.';
  }
}

async function loadCatalogFont() {
  if (!catalogSelect.value) {
    return;
  }
  clearError();
  convertButton.disabled = true;
  try {
    const response = await fetch(catalogSelect.value, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Не удалось загрузить файл шрифта (' + response.status + ').');
    }
    const blob = await response.blob();
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error('Размер файла превышает 30 МБ.');
    }
    const buffer = await blob.arrayBuffer();
    const format = catalogSelect.selectedOptions[0].dataset.format;
    setSource(catalogSelect.options[catalogSelect.selectedIndex].text.replace(/ \([A-Z0-9]+\)$/, ''), format, buffer, blob.size, catalogSelect.value);
  } catch (error) {
    showError(error.message);
    convertButton.disabled = !currentSource;
  }
}

async function loadUploadedFont() {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    return;
  }
  clearError();
  const format = FORMAT_BY_EXTENSION[extensionOf(file.name)];
  if (!format) {
    showError('Поддерживаются только файлы TTF, OTF, WOFF, WOFF2, EOT и SVG Font.');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError('Размер файла превышает 30 МБ.');
    return;
  }
  try {
    setSource(file.name, format, await file.arrayBuffer(), file.size);
    catalogSelect.value = '';
  } catch (error) {
    showError('Не удалось прочитать файл шрифта.');
  }
}

async function convertFonts() {
  clearError();
  if (!currentSource) {
    showError('Сначала выберите файл шрифта.');
    return;
  }
  const selectedTypes = Array.from(document.querySelectorAll('input[name="font-format"]:checked'))
    .map(function (input) { return input.value; });
  if (!selectedTypes.length) {
    showError('Выберите хотя бы один формат результата.');
    return;
  }
  convertButton.disabled = true;
  convertStatus.textContent = 'Загрузка конвертера…';
  showResults([]);
  const messages = [];
  try {
    const library = await loadFontLibrary();
    const needsWoff2 = currentSource.format === 'woff2' || selectedTypes.includes('woff2');
    if (needsWoff2) {
      convertStatus.textContent = 'Подготовка WOFF2…';
      await initWoff2(library);
    }
    const sourceData = currentSource.format === 'svg'
      ? new TextDecoder().decode(currentSource.buffer)
      : currentSource.buffer;
    const font = library.createFont(sourceData, { type: currentSource.format });
    for (const type of selectedTypes) {
      try {
        const output = font.write({ type: type });
        const blob = new Blob([output], { type: OUTPUT_TYPES[type].mime });
        const stem = currentSource.name.split('/').pop().replace(/\.[^.]+$/, '');
        FV.download(blob, stem + '.' + type, OUTPUT_TYPES[type].mime);
        messages.push(type.toUpperCase() + ': файл скачан.');
      } catch (error) {
        messages.push(type.toUpperCase() + ': формат не поддержан для этого файла (' + error.message + ').');
      }
    }
    showResults(messages);
    convertStatus.textContent = messages.some(function (message) { return message.includes('скачан'); })
      ? 'Готово. Файлы сформированы на устройстве.'
      : 'Не удалось создать файлы в выбранных форматах.';
  } catch (error) {
    showError(error.message || 'Не удалось обработать файл шрифта.');
    convertStatus.textContent = '';
  } finally {
    convertButton.disabled = false;
  }
}

catalogSelect.addEventListener('change', loadCatalogFont);
fileInput.addEventListener('change', loadUploadedFont);
convertButton.addEventListener('click', convertFonts);
familyInput.addEventListener('input', updateCss);
weightSelect.addEventListener('change', function () {
  updateCss();
  loadPreview();
});
styleSelect.addEventListener('change', function () {
  updateCss();
  loadPreview();
});
sampleInput.addEventListener('input', updateCss);
document.getElementById('font-copy-css').addEventListener('click', function (event) {
  FV.copyText(cssCode.textContent, event.currentTarget);
});

updateCss();
loadCatalog();
