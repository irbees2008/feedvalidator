(function () {
  'use strict';
  var error = document.getElementById('sql-analyzer-error');
  var input = document.getElementById('sql-input');
  var result = document.getElementById('sql-result');
  var out = document.getElementById('sql-out');
  var issuesEl = document.getElementById('sql-issues');
  var formatted = '';

  var KEYWORDS = ('SELECT FROM WHERE AND OR NOT IN IS NULL LIKE BETWEEN EXISTS AS ON JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ' +
    'GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL DISTINCT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP TRUNCATE ' +
    'INDEX UNIQUE PRIMARY KEY FOREIGN REFERENCES DEFAULT AUTO_INCREMENT ASC DESC CASE WHEN THEN ELSE END IF REPLACE IGNORE DUPLICATE ' +
    'USING INTERVAL GRANT REVOKE DATABASE VIEW ADD COLUMN CONSTRAINT ENGINE CHARSET COLLATE SHOW DESCRIBE EXPLAIN WITH REGEXP RLIKE').split(' ');
  var KW = {};
  KEYWORDS.forEach(function (k) { KW[k] = true; });

  function tokenize(sql) {
    var tokens = [];
    var i = 0;
    var line = 1;
    var n = sql.length;
    function push(type, text, ln) { tokens.push({ type: type, text: text, line: ln }); }
    while (i < n) {
      var c = sql.charAt(i);
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      var ln = line;
      var start = i;
      if ((c === '-' && sql.charAt(i + 1) === '-' && /\s|^$/.test(sql.charAt(i + 2) || ' ')) || c === '#') {
        while (i < n && sql.charAt(i) !== '\n') { i++; }
        push('comment', sql.slice(start, i), ln);
        continue;
      }
      if (c === '/' && sql.charAt(i + 1) === '*') {
        var e = sql.indexOf('*/', i + 2);
        var closed = e >= 0;
        i = closed ? e + 2 : n;
        var body = sql.slice(start, i);
        line += (body.match(/\n/g) || []).length;
        push(closed ? 'comment' : 'badcomment', body, ln);
        continue;
      }
      if (c === '\'' || c === '"' || c === '`') {
        i++;
        var ok = false;
        while (i < n) {
          var d = sql.charAt(i);
          if (d === '\\' && c !== '`') { i += 2; continue; }
          if (d === c) {
            if (sql.charAt(i + 1) === c) { i += 2; continue; }
            i++; ok = true; break;
          }
          if (d === '\n') { line++; }
          i++;
        }
        push(ok ? (c === '`' ? 'ident' : 'string') : 'badstring', sql.slice(start, Math.min(i, n)), ln);
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql.charAt(i + 1)))) {
        while (i < n && /[0-9a-fA-Fx._]/.test(sql.charAt(i))) { i++; }
        push('number', sql.slice(start, i), ln);
        continue;
      }
      if (/[A-Za-z_@$\u0400-\u04FF]/.test(c)) {
        while (i < n && /[A-Za-z0-9_@$.\u0400-\u04FF]/.test(sql.charAt(i))) { i++; }
        var w = sql.slice(start, i);
        push(KW[w.toUpperCase()] ? 'keyword' : 'word', w, ln);
        continue;
      }
      var two = sql.substr(i, 2);
      if (['<=', '>=', '<>', '!=', '||', '&&', ':=', '<<', '>>'].indexOf(two) >= 0) { i += 2; push('op', two, ln); continue; }
      i++;
      push(/[(),;]/.test(c) ? c : 'op', c, ln);
    }
    return tokens;
  }

  var BREAK_BEFORE = { 'FROM': 1, 'WHERE': 1, 'HAVING': 1, 'LIMIT': 1, 'UNION': 1, 'VALUES': 1, 'SET': 1, 'JOIN': 1, 'ON': 0 };

  function format(tokens) {
    var out = [];
    var depth = 0;
    var parens = [];
    var clause = '';
    var lineStart = true;
    var prev = null;

    function nl(d) {
      while (out.length && out[out.length - 1] === ' ') { out.pop(); }
      out.push('\n' + new Array(d + 1).join('  '));
      lineStart = true;
    }
    function indent() { return parens.filter(function (p) { return p.sub; }).length; }
    function emit(html, plain) { out.push(html); lineStart = false; return plain; }

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var up = t.text.toUpperCase();
      var next = tokens[i + 1];
      var html = FV.escapeHtml(t.type === 'keyword' ? up : t.text);
      var cls = { keyword: 'fv-sql-kw', string: 'fv-sql-str', badstring: 'fv-sql-str', number: 'fv-sql-num', comment: 'fv-sql-cm', badcomment: 'fv-sql-cm' }[t.type];
      if (cls) { html = '<span class="' + cls + '">' + html + '</span>'; }
      var base = indent();

      if (t.type === 'keyword') {
        var brk = false;
        var extra = 0;
        if (up === 'SELECT' || up === 'INSERT' || up === 'UPDATE' || up === 'DELETE' || up === 'CREATE' || up === 'ALTER' || up === 'DROP' || up === 'TRUNCATE') {
          brk = !lineStart && !(prev && prev.text === '(') && !(prev && prev.type === 'keyword' && /^(UNION|ALL|DISTINCT|INTO)$/i.test(prev.text) && up === 'SELECT');
          if (up === 'SELECT' || up === 'INSERT' || up === 'UPDATE' || up === 'DELETE') { clause = up; }
        } else if (BREAK_BEFORE[up]) {
          brk = !(up === 'JOIN' && prev && prev.type === 'keyword' && /^(INNER|LEFT|RIGHT|FULL|CROSS|NATURAL|OUTER)$/i.test(prev.text));
          if (up !== 'JOIN') { clause = up; }
        } else if (/^(INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)$/.test(up) && !(prev && /^(NATURAL|LEFT|RIGHT|FULL)$/i.test(prev.text))) {
          brk = true;
        } else if ((up === 'GROUP' || up === 'ORDER') && next && /^BY$/i.test(next.text)) {
          brk = true; clause = up;
        } else if ((up === 'AND' || up === 'OR') && clause === 'WHERE') {
          brk = true; extra = 1;
        } else if (up === 'ON' && clause !== 'INSERT') {
          brk = true; extra = 1;
        }
        if (brk) { nl(base + extra); }
      }

      if (t.text === ',') {
        while (out.length && out[out.length - 1] === ' ') { out.pop(); }
        out.push(',');
        if (!parens.length || parens[parens.length - 1].sub) {
          if (/^(SELECT|SET|GROUP|ORDER)$/.test(clause)) { nl(base + 1); continue; }
        }
        out.push(' ');
        prev = t;
        continue;
      }
      if (t.text === ';') {
        while (out.length && out[out.length - 1] === ' ') { out.pop(); }
        out.push(';\n');
        lineStart = true;
        clause = '';
        parens = [];
        prev = t;
        continue;
      }
      if (t.text === '(') {
        var isFn = prev && prev.type === 'word';
        var sub = next && /^SELECT$/i.test(next.text);
        if (isFn) {
          while (out.length && out[out.length - 1] === ' ') { out.pop(); }
        }
        out.push('(');
        parens.push({ sub: sub });
        lineStart = false;
        if (sub) { nl(indent()); }
        prev = t;
        continue;
      }
      if (t.text === ')') {
        var p = parens.pop();
        if (p && p.sub) { nl(indent()); }
        while (out.length && out[out.length - 1] === ' ') { out.pop(); }
        out.push(')');
        out.push(' ');
        prev = t;
        continue;
      }
      out.push(html);
      lineStart = false;
      out.push(' ');
      prev = t;
    }
    return out.join('').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '');
  }

  function analyze(tokens) {
    var issues = [];
    function add(sev, line, msg, hint) { issues.push({ sev: sev, line: line, msg: msg, hint: hint || '' }); }

    var depth = 0;
    tokens.forEach(function (t) {
      if (t.text === '(') { depth++; }
      if (t.text === ')') { depth--; }
      if (t.type === 'badstring') { add('error', t.line, 'Не закрыта строка или обратная кавычка', 'Проверьте парность кавычек — это частый признак ошибки или инъекции.'); }
      if (t.type === 'badcomment') { add('error', t.line, 'Не закрыт комментарий /*', ''); }
    });
    if (depth !== 0) { add('error', tokens.length ? tokens[tokens.length - 1].line : 1, 'Несбалансированные скобки', ''); }

    var stmts = [];
    var cur = [];
    tokens.forEach(function (t) {
      if (t.text === ';') { if (cur.length) { stmts.push(cur); } cur = []; } else if (t.type !== 'comment') { cur.push(t); }
    });
    if (cur.length) { stmts.push(cur); }
    if (stmts.length > 1) { add('warn', stmts[1][0].line, 'Несколько запросов в одном тексте', 'Многие драйверы (например, mysqli_query) не выполняют их пачкой; пачка запросов — типичный след инъекции.'); }

    stmts.forEach(function (s) {
      var first = s[0].text.toUpperCase();
      var line = s[0].line;
      var words = s.map(function (t) { return t.text.toUpperCase(); });
      var has = function (w) { return words.indexOf(w) >= 0; };
      var idx = function (w) { return words.indexOf(w); };

      if ((first === 'DELETE' || first === 'UPDATE') && !has('WHERE')) {
        add('error', line, first + ' без WHERE затронет все строки таблицы', 'Добавьте условие WHERE или выполните сначала SELECT с тем же условием.');
      }
      if (first === 'DROP') { add('error', line, 'DROP удаляет объект безвозвратно', 'Сделайте резервную копию и убедитесь, что выбрана нужная база.'); }
      if (first === 'TRUNCATE') { add('error', line, 'TRUNCATE удаляет все строки без возможности отката', 'Для частичного удаления используйте DELETE с WHERE.'); }
      if (first === 'GRANT' || first === 'REVOKE') { add('warn', line, 'Изменение прав доступа', 'Давайте минимально необходимые привилегии, не ALL PRIVILEGES.'); }
      if (first === 'ALTER') { add('info', line, 'ALTER может блокировать таблицу на время выполнения', 'На больших таблицах выполняйте в период низкой нагрузки.'); }

      if (first === 'SELECT') {
        for (var i = 0; i < s.length; i++) {
          if (s[i].text === '*' && (i === 1 || s[i - 1].text === ',' || s[i - 1].text === '.' || (s[i - 1].text.toUpperCase() === 'DISTINCT'))) {
            add('warn', s[i].line, 'SELECT * выбирает все столбцы', 'Перечислите только нужные столбцы: меньше трафика, возможны покрывающие индексы.');
            break;
          }
        }
        if (has('ORDER') && /^RAND|^RANDOM/.test((words[words.indexOf('BY', idx('ORDER')) + 1] || ''))) {
          add('warn', line, 'ORDER BY RAND() сортирует всю таблицу', 'Для случайной выборки выберите случайный id заранее или используйте выборку по диапазону.');
        }
        if (has('ORDER') && !has('LIMIT')) { add('info', line, 'ORDER BY без LIMIT', 'Если нужна только часть строк — добавьте LIMIT.'); }
        if (has('UNION') && words[idx('UNION') + 1] !== 'ALL') { add('info', line, 'UNION без ALL удаляет дубликаты и сортирует результат', 'Если дубликаты невозможны или допустимы, используйте UNION ALL.'); }
        var fromI = idx('FROM');
        if (fromI >= 0) {
          var dd = 0;
          for (var j = fromI + 1; j < s.length; j++) {
            if (s[j].text === '(') { dd++; } else if (s[j].text === ')') { dd--; }
            if (dd === 0 && s[j].type === 'keyword' && /^(WHERE|GROUP|ORDER|HAVING|LIMIT|JOIN|INNER|LEFT|RIGHT|ON|UNION)$/i.test(s[j].text)) { break; }
            if (dd === 0 && s[j].text === ',') { add('info', s[j].line, 'Неявное соединение таблиц через запятую', 'Используйте явный JOIN ... ON — читаемее и проще не потерять условие связи.'); break; }
          }
        }
        if (has('WHERE') === false && has('FROM') && !has('LIMIT') && !has('GROUP') && !/COUNT|MAX|MIN|SUM|AVG/.test(words.join(' '))) {
          add('info', line, 'Выборка без WHERE и LIMIT', 'На большой таблице вернёт все строки.');
        }
        if (/\bNOT IN \( SELECT\b/.test(words.join(' '))) { add('info', line, 'NOT IN с подзапросом', 'При NULL в подзапросе результат пустой; лучше NOT EXISTS или LEFT JOIN ... IS NULL.'); }
      }

      for (var k = 0; k < s.length; k++) {
        var t = s[k];
        var u = t.text.toUpperCase();
        if (u === 'LIKE' && s[k + 1] && s[k + 1].type === 'string' && /^['"][%_]/.test(s[k + 1].text)) {
          add('warn', t.line, 'LIKE с подстановочным знаком в начале не использует индекс', 'Используйте полнотекстовый индекс (FULLTEXT) или ищите по префиксу.');
        }
        if (u === 'OR' && s[k + 1] && s[k + 2] && s[k + 3] && s[k + 1].type === 'number' && s[k + 2].text === '=' && s[k + 3].text === s[k + 1].text) {
          add('error', t.line, 'Условие OR ' + s[k + 1].text + '=' + s[k + 3].text + ' всегда истинно', 'Типичный признак SQL-инъекции. Используйте подготовленные запросы.');
        }
        if (/^(SLEEP|BENCHMARK|LOAD_FILE|XP_CMDSHELL|PG_SLEEP|WAITFOR)$/.test(u) && !(s[k - 1] && s[k - 1].text === '.')) {
          add('error', t.line, 'Подозрительная функция ' + u, 'Применяется в инъекциях для задержек, чтения файлов или выполнения команд.');
        }
        if (u === 'INTO' && s[k + 1] && /^(OUTFILE|DUMPFILE)$/i.test(s[k + 1].text)) {
          add('error', t.line, 'INTO ' + s[k + 1].text.toUpperCase() + ' записывает файл на сервер', 'Закройте привилегию FILE и параметр secure_file_priv.');
        }
        if (u === 'UNION' && s[k + 1] && /^(ALL|SELECT)$/i.test(s[k + 1].text) && first === 'SELECT' && /INFORMATION_SCHEMA/.test(words.join(' '))) {
          add('error', t.line, 'UNION SELECT из INFORMATION_SCHEMA', 'Характерно для разведки структуры БД при инъекции.');
        }
        if (u === 'WHERE' && s[k + 1] && s[k + 2] && /^[=]$/.test(s[k + 2].text) && s[k + 1].type === 'number' && s[k + 3] && s[k + 3].text === s[k + 1].text) {
          add('warn', t.line, 'Условие WHERE ' + s[k + 1].text + '=' + s[k + 3].text + ' всегда истинно', '');
        }
      }
    });

    tokens.forEach(function (t) {
      if (t.type === 'comment' && /^(--|#)/.test(t.text)) { /* однострочные комментарии допустимы */ }
    });
    var hasTail = tokens.some(function (t) { return t.type === 'comment' && /^(--|#)/.test(t.text); });
    if (hasTail && /(['"])\s*(--|#)/.test(input.value)) {
      add('warn', 1, 'Кавычка перед комментарием', 'Шаблон \' -- часто используют, чтобы обрезать остаток запроса при инъекции.');
    }

    var order = { error: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return order[a.sev] - order[b.sev] || a.line - b.line; });
    return issues;
  }

  function run() {
    FV.clearError(error);
    var sql = input.value;
    if (!sql.trim()) { result.hidden = true; return; }
    if (sql.length > 200000) { FV.showError(error, 'Запрос длиннее 200 000 символов.'); return; }
    var tokens = tokenize(sql);
    var html = format(tokens);
    out.innerHTML = html;
    formatted = out.textContent;
    var issues = analyze(tokens);
    issuesEl.innerHTML = '';
    if (!issues.length) {
      issuesEl.innerHTML = '<li class="sev-info">Явных проблем не найдено.</li>';
    }
    var labels = { error: 'Ошибка', warn: 'Внимание', info: 'Совет' };
    issues.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'sev-' + it.sev;
      li.innerHTML = '<span class="ln">стр. ' + it.line + '</span> <strong>' + labels[it.sev] + ':</strong> ' + FV.escapeHtml(it.msg) +
        (it.hint ? '<span class="hint">' + FV.escapeHtml(it.hint) + '</span>' : '');
      issuesEl.appendChild(li);
    });
    result.hidden = false;
  }

  document.getElementById('sql-run').addEventListener('click', run);
  document.getElementById('sql-min').addEventListener('click', function () {
    run();
    input.value = tokenize(input.value).filter(function (t) { return t.type !== 'comment'; }).map(function (t) { return t.text; }).join(' ')
      .replace(/ ([,;)])/g, '$1').replace(/\( /g, '(');
    run();
  });
  document.getElementById('sql-copy').addEventListener('click', function () { FV.copyText(formatted); });
  document.getElementById('sql-clear').addEventListener('click', function () { input.value = ''; result.hidden = true; });
  input.addEventListener('input', FV.debounce(run, 300));
  run();
})();
