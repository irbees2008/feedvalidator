(function () {
  'use strict';
  var error = document.getElementById('template-checker-error');
  var input = document.getElementById('tc-input');
  var knownEl = document.getElementById('tc-known');
  var result = document.getElementById('tc-result');
  var summary = document.getElementById('tc-summary');
  var list = document.getElementById('tc-issues');

  var FILTERS = ('abs batch capitalize column convert_encoding country_name currency_name currency_symbol data_uri date date_modify default e escape filter find first format_currency format_date ' +
    'format_datetime format_number format_time html_to_markdown inky_to_html inline_css join json_encode keys language_name last length locale_name lower map markdown_to_html merge nl2br number_format ' +
    'raw reduce replace reverse round slice sort spaceless split striptags timezone_name title trim u upper url_encode').split(' ');
  var TESTS = 'constant defined divisible empty even iterable null odd same none';
  var PAIRS = { if: 'endif', for: 'endfor', block: 'endblock', macro: 'endmacro', apply: 'endapply', autoescape: 'endautoescape', verbatim: 'endverbatim', spaceless: 'endspaceless', with: 'endwith', embed: 'endembed', sandbox: 'endsandbox', filter: 'endfilter', set: 'endset' };
  var CLOSERS = {};
  Object.keys(PAIRS).forEach(function (k) { CLOSERS[PAIRS[k]] = k; });
  var SINGLE = { extends: 1, include: 1, import: 1, from: 1, use: 1, do: 1, flush: 1, deprecated: 1, elseif: 1, else: 1 };
  var WORDS = { true: 1, false: 1, null: 1, none: 1, and: 1, or: 1, not: 1, in: 1, is: 1, if: 1, else: 1, as: 1, with: 1, only: 1, starts: 1, ends: 1, matches: 1, by: 1, same: 1, divisible: 1, defined: 1, empty: 1, even: 1, odd: 1, iterable: 1, constant: 1, loop: 1, _self: 1, _context: 1, _charset: 1, range: 1, max: 1, min: 1, cycle: 1, random: 1, date: 1, dump: 1, include: 1, source: 1, parent: 1, block: 1, attribute: 1, constant_fn: 1, b: 1 };
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };

  var issues;
  var lineStarts;

  function lineOf(pos) {
    var lo = 0;
    var hi = lineStarts.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) { lo = mid; } else { hi = mid - 1; } }
    return lo + 1;
  }

  function add(sev, pos, msg, hint) { issues.push({ sev: sev, line: lineOf(pos), msg: msg, hint: hint || '', pos: pos }); }

  function checkTwig(src, known) {
    var re = /\{\{-?|\{%-?|\{#/g;
    var m;
    var stack = [];
    var blank = src.split('');
    var declared = {};
    var used = [];
    var lastEnd = 0;

    function blankRange(a, b) { for (var i = a; i < b; i++) { if (blank[i] !== '\n') { blank[i] = ' '; } } }

    function scanExpr(expr, pos, scopeNames) {
      var stripped = expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
      if (/['"]/.test(stripped)) { add('error', pos, 'Не закрыта кавычка в выражении', ''); }
      var depth = 0;
      for (var i = 0; i < stripped.length; i++) {
        var ch = stripped.charAt(i);
        if (ch === '(' || ch === '[' || ch === '{') { depth++; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; }
        if (depth < 0) { break; }
      }
      if (depth !== 0) { add('error', pos, 'Несбалансированные скобки в выражении', ''); }
      stripped.replace(/\|\s*([A-Za-z_]\w*)/g, function (all, f) {
        if (f === 'safe') { add('error', pos, 'Фильтра «safe» нет в Twig', 'Используйте |raw — и только для доверенного HTML.'); }
        else if (f === 'raw') { add('info', pos, 'Фильтр |raw отключает экранирование', 'Убедитесь, что значение не приходит от пользователя — иначе XSS.'); }
        else if (FILTERS.indexOf(f) < 0) { add('warn', pos, 'Неизвестный стандартный фильтр «' + f + '»', 'Если это фильтр из плагина или расширения NGCMS — игнорируйте.'); }
      });
      stripped.replace(/\bis\s+(?:not\s+)?([A-Za-z_]\w*)/g, function (all, t) {
        if ((' ' + TESTS + ' ').indexOf(' ' + t + ' ') < 0) { add('warn', pos, 'Неизвестный тест «is ' + t + '»', ''); }
      });
      // корневые имена переменных: не после точки, не ключи объекта, не имена фильтров и функций
      var re2 = /(^|[^\w.$|'"])([A-Za-z_]\w*)(?!\w)\s*(\(|:)?/g;
      var mm;
      var clean = stripped.replace(/\|\s*[A-Za-z_]\w*/g, '|');
      while ((mm = re2.exec(clean)) !== null) {
        var name = mm[2];
        if (WORDS[name] || mm[3]) { continue; }
        if (/^(is|not|in)$/.test(name)) { continue; }
        used.push({ name: name, pos: pos, scope: scopeNames.slice() });
      }
    }

    while ((m = re.exec(src)) !== null) {
      var open = m[0];
      var kind = open.charAt(1);
      var close = kind === '{' ? '}}' : (kind === '%' ? '%}' : '#}');
      var end = src.indexOf(close, re.lastIndex);
      if (end < 0) {
        add('error', m.index, 'Не закрыт блок «' + open + '»', 'Ожидалось «' + close + '».');
        blankRange(m.index, src.length);
        break;
      }
      var body = src.slice(re.lastIndex, end);
      blankRange(m.index, end + 2);
      re.lastIndex = end + 2;
      var posInner = m.index;
      if (kind === '#') { continue; }
      body = body.replace(/^-|-$/g, '').trim();
      var scopeNames = [];
      stack.forEach(function (f) { scopeNames = scopeNames.concat(f.vars || []); });

      if (kind === '{') {
        if (!body) { add('error', posInner, 'Пустое выражение {{ }}', ''); continue; }
        scanExpr(body, posInner, scopeNames);
        continue;
      }
      var tm = /^([A-Za-z_]+)\b\s*([\s\S]*)$/.exec(body);
      if (!tm) { add('error', posInner, 'Пустой или некорректный тег {% %}', ''); continue; }
      var tag = tm[1];
      var rest = tm[2];

      if (CLOSERS[tag]) {
        var open2 = CLOSERS[tag];
        var found = -1;
        for (var i = stack.length - 1; i >= 0; i--) { if (stack[i].tag === open2) { found = i; break; } }
        if (found < 0) { add('error', posInner, 'Лишний {% ' + tag + ' %} без открывающего {% ' + open2 + ' %}', 'Удалите тег или добавьте открывающий.'); continue; }
        while (stack.length - 1 > found) {
          var lost = stack.pop();
          add('error', lost.pos, 'Не закрыт {% ' + lost.tag + ' %}', 'Ожидался {% ' + PAIRS[lost.tag] + ' %} до {% ' + tag + ' %} на строке ' + lineOf(posInner) + '.');
        }
        stack.pop();
        continue;
      }
      if (tag === 'else' || tag === 'elseif') {
        var tp = stack[stack.length - 1];
        if (!tp || (tp.tag !== 'if' && !(tp.tag === 'for' && tag === 'else'))) { add('error', posInner, 'Тег {% ' + tag + ' %} вне if' + (tag === 'else' ? '/for' : ''), ''); }
        else if (tag === 'elseif') { if (tp.sawElse) { add('error', posInner, '{% elseif %} после {% else %}', ''); } if (!rest) { add('error', posInner, 'У {% elseif %} нет условия', ''); } scanExpr(rest, posInner, scopeNames); }
        else { if (tp.sawElse) { add('error', posInner, 'Второй {% else %} в одном блоке', ''); } tp.sawElse = true; }
        continue;
      }
      if (PAIRS[tag]) {
        var frame = { tag: tag, pos: posInner, vars: [] };
        if (tag === 'if') {
          if (!rest) { add('error', posInner, 'У {% if %} нет условия', ''); } else { scanExpr(rest, posInner, scopeNames); }
        } else if (tag === 'for') {
          var fm = /^([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s+in\s+([\s\S]+)$/.exec(rest);
          if (!fm) { add('error', posInner, 'Некорректный синтаксис for', 'Правильно: {% for item in items %} или {% for key, item in items %}.'); }
          else { frame.vars = [fm[1]].concat(fm[2] ? [fm[2]] : []).concat(['loop']); scanExpr(fm[3].replace(/\s+if\s+[\s\S]*$/, ''), posInner, scopeNames); }
        } else if (tag === 'set') {
          var sm = /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=\s*([\s\S]+)$/.exec(rest);
          if (sm) {
            scanExpr(sm[2], posInner, scopeNames);
            sm[1].split(/\s*,\s*/).forEach(function (n) { declared[n] = 1; });
            continue; // set с = не требует endset
          }
          var bm = /^([A-Za-z_]\w*)$/.exec(rest);
          if (!bm) { add('error', posInner, 'Некорректный синтаксис set', 'Правильно: {% set имя = выражение %}.'); continue; }
          declared[bm[1]] = 1;
        } else if (tag === 'macro') {
          var mn = /^([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(rest);
          if (mn) { frame.vars = mn[2].split(',').map(function (s) { return s.replace(/=[\s\S]*$/, '').trim(); }).filter(Boolean); declared[mn[1]] = 1; }
        }
        stack.push(frame);
        continue;
      }
      if (SINGLE[tag]) {
        if (!rest && tag !== 'flush') { add('error', posInner, 'У {% ' + tag + ' %} нет аргументов', ''); }
        if (tag === 'include' || tag === 'extends') { scanExpr(rest.replace(/\s+(with|only|ignore missing)[\s\S]*$/, ''), posInner, scopeNames); }
        if (tag === 'import' || tag === 'from') {
          var am = /\bas\s+([A-Za-z_]\w*)/.exec(rest);
          if (am) { declared[am[1]] = 1; }
          rest.replace(/import\s+([\s\S]+)/, function (all, names) { names.split(',').forEach(function (n) { declared[n.replace(/\s+as\s+[\s\S]*/, '').trim()] = 1; }); });
        }
        continue;
      }
      add('error', posInner, 'Неизвестный тег «' + tag + '»', 'Проверьте написание. Теги плагинов NGCMS распознаются только если они зарегистрированы.');
    }
    stack.forEach(function (f) { add('error', f.pos, 'Не закрыт {% ' + f.tag + ' %}', 'Добавьте {% ' + PAIRS[f.tag] + ' %}.'); });

    var seen = {};
    used.forEach(function (u) {
      if (declared[u.name] || u.scope.indexOf(u.name) >= 0 || known[u.name] || seen[u.name]) { return; }
      seen[u.name] = 1;
      add('info', u.pos, 'Переменная «' + u.name + '» не объявлена и не входит в список известных', 'Если это переменная NGCMS — добавьте её в список. Иначе при выводе будет пустая строка.');
    });
    return blank.join('');
  }

  function checkHtml(text) {
    var stack = [];
    var ids = {};
    var re = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].indexOf('<!--') === 0) { continue; }
      var closing = !!m[1];
      var name = m[2].toLowerCase();
      if (!closing && /^(script|style)$/.test(name) && !/\/\s*$/.test(m[3])) {
        var endAt = text.toLowerCase().indexOf('</' + name, re.lastIndex);
        stack.push({ name: name, pos: m.index });
        re.lastIndex = endAt < 0 ? text.length : endAt;
        continue;
      }
      if (!closing) {
        if (name === 'img' && !/\balt\s*=/i.test(m[3])) { add('info', m.index, 'У <img> нет атрибута alt', 'Добавьте alt для доступности и SEO.'); }
        var idm = /\bid\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[3]);
        if (idm) {
          var idv = idm[2] || idm[3];
          if (ids[idv]) { add('warn', m.index, 'Повторяющийся id «' + idv + '»', 'Первое использование на строке ' + lineOf(ids[idv] - 1) + '.'); } else { ids[idv] = m.index + 1; }
        }
      }
      if (VOID[name]) {
        if (closing) { add('warn', m.index, 'Закрывающий тег </' + name + '> у пустого элемента', ''); }
        continue;
      }
      if (!closing) {
        if (!/\/\s*$/.test(m[3])) { stack.push({ name: name, pos: m.index }); }
        continue;
      }
      var idx = -1;
      for (var i = stack.length - 1; i >= 0; i--) { if (stack[i].name === name) { idx = i; break; } }
      if (idx < 0) { add('error', m.index, 'Лишний закрывающий тег </' + name + '>', 'Нет соответствующего открывающего тега.'); continue; }
      while (stack.length - 1 > idx) {
        var lost = stack.pop();
        if (!/^(p|li|dt|dd|tr|td|th|option|thead|tbody|tfoot)$/.test(lost.name)) {
          add('error', lost.pos, 'Не закрыт тег <' + lost.name + '>', 'Закрывающий </' + name + '> на строке ' + lineOf(m.index) + ' пришёл раньше.');
        }
      }
      stack.pop();
    }
    stack.forEach(function (f) {
      if (!/^(p|li|dt|dd|tr|td|th|option|thead|tbody|tfoot|html|body|head)$/.test(f.name)) {
        add('error', f.pos, 'Не закрыт тег <' + f.name + '>', 'Добавьте </' + f.name + '>. Если тег закрывается в другой ветке {% if %}, предупреждение можно игнорировать.');
      }
    });
  }

  function run() {
    FV.clearError(error);
    var src = input.value;
    if (!src.trim()) { result.hidden = true; return; }
    if (src.length > 500000) { FV.showError(error, 'Шаблон длиннее 500 000 символов.'); return; }
    issues = [];
    lineStarts = [0];
    for (var i = 0; i < src.length; i++) { if (src.charAt(i) === '\n') { lineStarts.push(i + 1); } }
    var known = {};
    knownEl.value.split(/[\s,;]+/).forEach(function (n) { if (n) { known[n] = 1; } });
    var htmlOnly = checkTwig(src, known);
    checkHtml(htmlOnly);

    var order = { error: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return a.line - b.line || order[a.sev] - order[b.sev]; });
    var cnt = { error: 0, warn: 0, info: 0 };
    list.innerHTML = '';
    var labels = { error: 'Ошибка', warn: 'Внимание', info: 'Совет' };
    var srcLines = src.split('\n');
    issues.forEach(function (it) {
      cnt[it.sev]++;
      var li = document.createElement('li');
      li.className = 'sev-' + it.sev;
      var code = (srcLines[it.line - 1] || '').trim();
      if (code.length > 100) { code = code.slice(0, 100) + '…'; }
      li.innerHTML = '<span class="ln">стр. ' + it.line + '</span> <strong>' + labels[it.sev] + ':</strong> ' + FV.escapeHtml(it.msg) +
        (it.hint ? '<span class="hint">' + FV.escapeHtml(it.hint) + '</span>' : '') +
        (code ? '<span class="hint"><code>' + FV.escapeHtml(code) + '</code></span>' : '');
      list.appendChild(li);
    });
    if (!issues.length) { list.innerHTML = '<li class="sev-info">Проблем не найдено.</li>'; }
    summary.textContent = 'Ошибок: ' + cnt.error + ', предупреждений: ' + cnt.warn + ', советов: ' + cnt.info + '. Строк: ' + srcLines.length + '.';
    result.hidden = false;
  }

  document.getElementById('tc-run').addEventListener('click', run);
  document.getElementById('tc-clear').addEventListener('click', function () { input.value = ''; result.hidden = true; });
  input.addEventListener('input', FV.debounce(run, 400));
  knownEl.addEventListener('input', FV.debounce(run, 400));
  run();
})();
