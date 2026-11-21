(function () {
  'use strict';
  var error = document.getElementById('plugin-checker-error');
  var zipEl = document.getElementById('pc-zip');
  var dirEl = document.getElementById('pc-dir');
  var result = document.getElementById('pc-result');
  var summary = document.getElementById('pc-summary');
  var list = document.getElementById('pc-issues');
  var tree = document.getElementById('pc-tree');

  var MAX_TOTAL = 20 * 1024 * 1024;
  var MAX_FILES = 3000;
  var MAX_TEXT = 1024 * 1024;
  var TEXT_EXT = /\.(php|inc|tpl|txt|ini|json|xml|html?|css|js|md|lng|sql|yml|yaml)$|(^|\/)(version|readme|license|changelog)[^/]*$/i;

  var REMOVED = [
    [/\bmysql_[a-z_]+\s*\(/g, 'Функции mysql_* удалены в PHP 7.0', 'Используйте mysqli или PDO.'],
    [/\b(ereg|eregi|ereg_replace|eregi_replace|split|spliti)\s*\(/g, 'Функции ereg*/split удалены в PHP 7.0', 'Используйте preg_* или explode.'],
    [/\beach\s*\(/g, 'Функция each() удалена в PHP 8.0', 'Замените на foreach.'],
    [/\bcreate_function\s*\(/g, 'create_function() удалена в PHP 8.0', 'Используйте анонимную функцию.'],
    [/\bget_magic_quotes_(gpc|runtime)\s*\(/g, 'get_magic_quotes_* удалены в PHP 8.0', 'Условие всегда ложно — удалите.'],
    [/\bmoney_format\s*\(/g, 'money_format() удалена в PHP 8.0', 'Используйте NumberFormatter.'],
    [/\butf8_(en|de)code\s*\(/g, 'utf8_encode/utf8_decode объявлены устаревшими в PHP 8.2', 'Используйте mb_convert_encoding.'],
    [/\$HTTP_(GET|POST|COOKIE|SERVER|SESSION|ENV|FILES)_VARS\b/g, '$HTTP_*_VARS удалены в PHP 5.4', 'Используйте $_GET, $_POST и т. д.'],
    [/preg_replace\s*\(\s*(['"])([^'"]*?)\/[a-z]*e[a-z]*\1/g, 'Модификатор /e в preg_replace удалён в PHP 7.0', 'Используйте preg_replace_callback.']
  ];

  var SUSPICIOUS = [
    [/\beval\s*\(/g, 'error', 'Вызов eval()', 'eval исполняет произвольный код; в плагинах это крайне подозрительно.'],
    [/\bassert\s*\(\s*\$/g, 'error', 'assert() с переменной', 'В старых версиях PHP assert выполнял строку как код.'],
    [/\b(system|exec|shell_exec|passthru|popen|proc_open|pcntl_exec)\s*\(/g, 'error', 'Запуск внешней команды', 'Плагину обычно не нужно выполнять команды ОС.'],
    [/`[^`\n]+`/g, 'warn', 'Возможный запуск команды через обратные кавычки', 'Если это не строка в коде, команда выполнится в оболочке.'],
    [/\bbase64_decode\s*\(/g, 'warn', 'base64_decode()', 'Часто используется для сокрытия кода. Проверьте, что именно декодируется.'],
    [/\b(gzinflate|gzuncompress|str_rot13)\s*\(/g, 'warn', 'Функция распаковки/обфускации', 'Типично для скрытого кода.'],
    [/\bunserialize\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/g, 'error', 'unserialize() пользовательских данных', 'Уязвимость десериализации (PHP Object Injection).'],
    [/\b(include|require)(_once)?\s*\(?\s*\$_(GET|POST|REQUEST|COOKIE)/g, 'error', 'include/require с пользовательскими данными', 'Локальное/удалённое включение файлов.'],
    [/\b(include|require)(_once)?\s*\(?\s*\$[A-Za-z_]\w*\s*[;)]/g, 'info', 'include/require с переменной', 'Убедитесь, что путь не приходит от пользователя.'],
    [/\bpreg_replace\s*\(\s*(['"]).*?\/[a-z]*e[a-z]*\1/g, 'error', 'preg_replace с модификатором /e', 'Выполняет результат как PHP-код.'],
    [/\b(file_get_contents|fopen|curl_init)\s*\(\s*\$_(GET|POST|REQUEST)/g, 'error', 'Обращение к адресу из пользовательских данных', 'Риск SSRF и чтения локальных файлов.'],
    [/\b(move_uploaded_file|file_put_contents)\s*\(/g, 'info', 'Запись файлов', 'Проверьте допустимые имена и расширения, запретите .php.'],
    [/\b(chmod)\s*\([^)]*0?777/g, 'warn', 'chmod 0777', 'Слишком широкие права на файл.'],
    [/\$_(GET|POST|REQUEST|COOKIE)\s*\[[^\]]+\]\s*[^;]{0,60}\b(mysql_query|mysqli_query|query)\s*\(/g, 'warn', 'Пользовательские данные рядом с SQL-запросом', 'Используйте подготовленные запросы или экранирование.'],
    [/\b(echo|print)\s+[^;]*\$_(GET|POST|REQUEST|COOKIE)\s*\[/g, 'warn', 'Вывод пользовательских данных без обработки', 'Экранируйте через htmlspecialchars.']
  ];

  function lineOfIn(text, pos) {
    var n = 1;
    for (var i = 0; i < pos && i < text.length; i++) { if (text.charCodeAt(i) === 10) { n++; } }
    return n;
  }

  // Заменяет комментарии пробелами, чтобы не искать функции в закомментированном коде.
  function stripComments(code) {
    return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|(^|[^&$])#[^\n]*/g, function (m, p1) {
      var keep = p1 || '';
      return keep + m.slice(keep.length).replace(/[^\n]/g, ' ');
    });
  }

  function u16(d, o) { return d.getUint16(o, true); }
  function u32(d, o) { return d.getUint32(o, true); }

  function readZip(buf) {
    var d = new DataView(buf);
    var eocd = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) { throw new Error('Это не ZIP-архив или он повреждён.'); }
    var count = u16(d, eocd + 10);
    var off = u32(d, eocd + 16);
    if (count > MAX_FILES * 2) { throw new Error('В архиве слишком много записей.'); }
    var entries = [];
    var dec = new TextDecoder('utf-8');
    for (var k = 0; k < count; k++) {
      if (off + 46 > buf.byteLength || u32(d, off) !== 0x02014b50) { throw new Error('Повреждён каталог ZIP.'); }
      var flags = u16(d, off + 8);
      var method = u16(d, off + 10);
      var csize = u32(d, off + 20);
      var usize = u32(d, off + 24);
      var nl = u16(d, off + 28);
      var el = u16(d, off + 30);
      var cl = u16(d, off + 32);
      var lo = u32(d, off + 42);
      var name = dec.decode(new Uint8Array(buf, off + 46, nl)).replace(/\\/g, '/');
      off += 46 + nl + el + cl;
      if (flags & 1) { throw new Error('Архив зашифрован — проверка невозможна.'); }
      entries.push({ path: name, size: usize, csize: csize, method: method, lo: lo, buf: buf });
    }
    return entries;
  }

  function zipRead(e) {
    var d = new DataView(e.buf);
    if (u32(d, e.lo) !== 0x04034b50) { return Promise.reject(new Error('Повреждён заголовок ' + e.path)); }
    var start = e.lo + 30 + u16(d, e.lo + 26) + u16(d, e.lo + 28);
    var bytes = new Uint8Array(e.buf, start, e.csize);
    if (e.method === 0) { return Promise.resolve(new TextDecoder('utf-8').decode(bytes)); }
    if (e.method !== 8) { return Promise.reject(new Error('Метод сжатия ' + e.method + ' не поддержан')); }
    if (typeof DecompressionStream === 'undefined') { return Promise.reject(new Error('Браузер не поддерживает распаковку ZIP')); }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) {
      if (ab.byteLength > MAX_TEXT * 2) { throw new Error('Файл слишком большой после распаковки'); }
      return new TextDecoder('utf-8').decode(ab);
    });
  }

  function analyze(files) {
    var issues = [];
    function add(sev, file, line, msg, hint) { issues.push({ sev: sev, file: file, line: line, msg: msg, hint: hint || '' }); }

    var names = files.map(function (f) { return f.path; });
    names.forEach(function (p) {
      if (/(^|\/)\.\.(\/|$)/.test(p) || /^\/|^[A-Za-z]:/.test(p)) { add('error', p, 0, 'Небезопасный путь в архиве', 'Путь выходит за пределы каталога (zip slip).'); }
    });

    // корень плагина: каталог с файлом version либо единственная верхняя папка
    var rootDir = null;
    var vf = files.filter(function (f) { return /(^|\/)version$/i.test(f.path); }).sort(function (a, b) { return a.path.split('/').length - b.path.split('/').length; })[0];
    if (vf) { rootDir = vf.path.replace(/version$/i, ''); }
    else {
      var tops = {};
      files.forEach(function (f) { var s = f.path.split('/'); tops[s.length > 1 ? s[0] : ''] = 1; });
      var tk = Object.keys(tops);
      rootDir = tk.length === 1 && tk[0] ? tk[0] + '/' : '';
    }
    var rel = files.map(function (f) { return { f: f, p: f.path.indexOf(rootDir) === 0 ? f.path.slice(rootDir.length) : null }; }).filter(function (x) { return x.p !== null; });
    var has = {};
    rel.forEach(function (x) { has[x.p.toLowerCase()] = x; });
    var folder = rootDir.replace(/\/$/, '').split('/').pop();

    return Promise.all(rel.map(function (x) {
      if (x.f.read && x.f.size <= MAX_TEXT && TEXT_EXT.test(x.p)) {
        return x.f.read().then(function (t) { x.text = t; }).catch(function (e) { add('warn', x.p, 0, 'Не удалось прочитать файл: ' + e.message, ''); });
      }
      return null;
    })).then(function () {
      var info = {};
      var vx = has['version'];
      if (!vx) {
        add('error', '', 0, 'Нет файла version', 'У плагина NGCMS должен быть файл version с описанием (id, name, version, file ...).');
      } else if (vx.text !== undefined) {
        vx.text.split(/\r?\n/).forEach(function (ln) {
          var m = /^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i.exec(ln);
          if (m) { info[m[1].toLowerCase()] = m[2]; }
        });
        ['id', 'name', 'version'].forEach(function (k) { if (!info[k]) { add('error', 'version', 0, 'В version не указано поле «' + k + '»', ''); } });
        ['description', 'author'].forEach(function (k) { if (!info[k]) { add('info', 'version', 0, 'В version не указано поле «' + k + '»', 'Рекомендуется заполнить для каталога плагинов.'); } });
        if (info.id && folder && info.id !== folder && rootDir) { add('warn', 'version', 0, 'id «' + info.id + '» не совпадает с именем папки «' + folder + '»', 'Папка плагина должна называться как его id.'); }
        if (info.id && !/^[a-z0-9_]+$/i.test(info.id)) { add('warn', 'version', 0, 'id плагина содержит недопустимые символы', 'Используйте латиницу, цифры и подчёркивание.'); }
        if (info.version && !/^\d+(\.\d+)*([-+._a-z0-9]*)$/i.test(info.version)) { add('info', 'version', 0, 'Нестандартный формат версии «' + info.version + '»', 'Лучше вида 1.0 или 1.2.3.'); }
        [['file', 'error'], ['config', 'warn'], ['install', 'warn'], ['deinstall', 'warn']].forEach(function (k) {
          var v = info[k[0]];
          if (v && !has[v.toLowerCase()]) { add(k[1], 'version', 0, 'Файл «' + v + '», указанный в поле ' + k[0] + ', не найден', ''); }
        });
        if (!info.file && info.id && !has[(info.id + '.php').toLowerCase()]) { add('warn', '', 0, 'Не найден главный файл ' + info.id + '.php', 'Укажите файл в поле file либо создайте ' + info.id + '.php.'); }
      }
      if (!rel.some(function (x) { return /^lang\//i.test(x.p); })) { add('info', '', 0, 'Нет каталога lang/', 'Вынесите строки интерфейса в языковые файлы.'); }
      if (!rel.some(function (x) { return /^readme/i.test(x.p); })) { add('info', '', 0, 'Нет файла readme', 'Описание установки и настройки поможет пользователям.'); }
      if (!rel.some(function (x) { return /^config\.php$/i.test(x.p); }) && !info.config) { add('info', '', 0, 'Нет config.php', 'Нужен, если у плагина есть страница настроек в админпанели.'); }

      rel.forEach(function (x) {
        var p = x.p;
        if (/\.(exe|dll|so|sh|bat|cmd|phar|msi)$/i.test(p)) { add('error', p, 0, 'Исполняемый файл в плагине', 'В плагинах не должно быть бинарников и скриптов оболочки.'); }
        if (/\.php\d?\.[a-z0-9]+$|\.(php\d|phtml|pht)$/i.test(p) && !/\.php$/i.test(p)) { add('warn', p, 0, 'Подозрительное расширение PHP-файла', 'Двойные расширения часто используют для обхода фильтров загрузки.'); }
        if (/(^|\/)\.(git|svn|idea|vscode|env)(\/|$)|\.(bak|old|orig|swp)$|~$/i.test(p)) { add('warn', p, 0, 'Служебный или резервный файл', 'Не включайте его в релиз.'); }
        if (/(^|\/)\.htaccess$/i.test(p)) { add('info', p, 0, 'Файл .htaccess', 'Убедитесь, что он не снижает защиту.'); }
        if (x.f.size > 5 * 1024 * 1024) { add('info', p, 0, 'Крупный файл (' + (x.f.size / 1048576).toFixed(1) + ' МБ)', ''); }
        if (x.text === undefined || !/\.(php|inc)$/i.test(p)) { return; }
        var t = x.text;
        if (t.charCodeAt(0) === 0xFEFF) { add('warn', p, 1, 'Файл начинается с BOM', 'BOM выводится до заголовков и ломает header()/сессии. Сохраните как UTF-8 без BOM.'); }
        if (!/^\s*<\?php/i.test(t.replace(/^\uFEFF/, '')) && /<\?(?!php|=|xml)/i.test(t)) { add('warn', p, lineOfIn(t, t.search(/<\?(?!php|=|xml)/i)), 'Короткий открывающий тег <?', 'Короткие теги зависят от short_open_tag; используйте <?php.'); }
        if (!/\bdefined\s*\(\s*['"]NGCMS['"]\s*\)/.test(t) && !/^config\.php$|^lang\//i.test(p) && /<\?php/i.test(t) && !/^\s*<\?php\s*(\/\*[\s\S]*?\*\/\s*)?(namespace|declare|return)\b/.test(t)) {
          add('info', p, 1, 'Нет защиты от прямого запуска', 'Принято начинать файл с: if (!defined(\'NGCMS\')) die(\'HAL\');');
        }
        if (/\?>\s*\n\s*\n+\s*$/.test(t) || /\?>\s{2,}$/.test(t)) { add('info', p, lineOfIn(t, t.length), 'Лишние пустые строки после ?>', 'Пробелы после закрывающего тега попадут в вывод. Закрывающий ?> в конце файла лучше опустить.'); }
        var code = stripComments(t);
        REMOVED.forEach(function (r) {
          r[0].lastIndex = 0;
          var m = r[0].exec(code);
          if (m) { add('warn', p, lineOfIn(code, m.index), r[1], r[2]); }
        });
        SUSPICIOUS.forEach(function (r) {
          r[0].lastIndex = 0;
          var m = r[0].exec(code);
          if (m) { add(r[1], p, lineOfIn(code, m.index), r[2], r[3]); }
        });
        var long = /['"][A-Za-z0-9+\/=]{400,}['"]/.exec(code);
        if (long) { add('warn', p, lineOfIn(code, long.index), 'Очень длинная строка base64', 'Возможно, закодированный код или встроенный файл.'); }
        if ((code.match(/\bchr\s*\(\s*\d+\s*\)/g) || []).length > 20) { add('warn', p, 1, 'Много вызовов chr(число)', 'Признак маскировки строк.'); }
      });

      var tn = {};
      rel.forEach(function (x) { tn[x.p] = x.f.size; });
      return { issues: issues, names: Object.keys(tn).sort(), sizes: tn, rootDir: rootDir, info: info };
    });
  }

  function show(r) {
    var order = { error: 0, warn: 1, info: 2 };
    r.issues.sort(function (a, b) { return order[a.sev] - order[b.sev]; });
    var cnt = { error: 0, warn: 0, info: 0 };
    var labels = { error: 'Ошибка', warn: 'Внимание', info: 'Совет' };
    list.innerHTML = '';
    r.issues.forEach(function (it) {
      cnt[it.sev]++;
      var li = document.createElement('li');
      li.className = 'sev-' + it.sev;
      li.innerHTML = '<strong>' + labels[it.sev] + ':</strong> ' + FV.escapeHtml(it.msg) +
        (it.file ? ' <span class="hint"><code>' + FV.escapeHtml(it.file) + (it.line ? ':' + it.line : '') + '</code></span>' : '') +
        (it.hint ? '<span class="hint">' + FV.escapeHtml(it.hint) + '</span>' : '');
      list.appendChild(li);
    });
    if (!r.issues.length) { list.innerHTML = '<li class="sev-info">Проблем не найдено.</li>'; }
    summary.textContent = 'Файлов: ' + r.names.length + '. Ошибок: ' + cnt.error + ', предупреждений: ' + cnt.warn + ', советов: ' + cnt.info + '.' +
      (r.info.id ? ' Плагин: ' + r.info.id + (r.info.version ? ' ' + r.info.version : '') + '.' : '');
    tree.textContent = r.names.slice(0, 500).map(function (n) { return n + '  (' + r.sizes[n] + ' Б)'; }).join('\n') + (r.names.length > 500 ? '\n…' : '');
    result.hidden = false;
  }

  function finish(files) {
    if (!files.length) { FV.showError(error, 'Файлы не найдены.'); return; }
    if (files.length > MAX_FILES) { FV.showError(error, 'Слишком много файлов (максимум ' + MAX_FILES + ').'); return; }
    var total = files.reduce(function (s, f) { return s + f.size; }, 0);
    if (total > MAX_TOTAL * 5) { FV.showError(error, 'Содержимое слишком большое.'); return; }
    analyze(files).then(show).catch(function (e) { FV.showError(error, 'Ошибка анализа: ' + e.message); });
  }

  zipEl.addEventListener('change', function () {
    FV.clearError(error);
    result.hidden = true;
    var f = zipEl.files[0];
    if (!f) { return; }
    if (f.size > MAX_TOTAL) { FV.showError(error, 'Архив больше 20 МБ.'); return; }
    f.arrayBuffer().then(function (buf) {
      var entries = readZip(buf).filter(function (e) { return e.path.slice(-1) !== '/'; });
      entries.forEach(function (e) { e.read = function () { return zipRead(e); }; });
      finish(entries);
    }).catch(function (e) { FV.showError(error, e.message); });
  });

  dirEl.addEventListener('change', function () {
    FV.clearError(error);
    result.hidden = true;
    var arr = Array.prototype.slice.call(dirEl.files || []);
    var total = arr.reduce(function (s, f) { return s + f.size; }, 0);
    if (total > MAX_TOTAL) { FV.showError(error, 'Папка больше 20 МБ.'); return; }
    var files = arr.map(function (f) {
      var path = (f.webkitRelativePath || f.name);
      return { path: path, size: f.size, read: function () { return f.text(); } };
    });
    finish(files);
  });
})();
