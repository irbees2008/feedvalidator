(function () {
  'use strict';
  var error = document.getElementById('robots-txt-validator-error');
  var urlInput = document.getElementById('rb-url');
  var input = document.getElementById('rb-input');
  var count = document.getElementById('rb-count');
  var loadBtn = document.getElementById('rb-load');
  var resultBox = document.getElementById('rb-result');
  var summary = document.getElementById('rb-summary');
  var issuesBody = document.getElementById('rb-issues');
  var groupsBody = document.getElementById('rb-groups');
  var sitemapsList = document.getElementById('rb-sitemaps');
  var SAMPLE = 'User-agent: *\nDisallow: /admin/\nDisallow: private\nAllow: /admin/public/\nCrawl-delay: 5\n\nUser-agent: Googlebot\nDisallow:\n\nDisallow: /orphan/\nNoindex: /old/\nSitemap: /sitemap.xml\nSitemap: https://example.com/sitemap.xml\n';
  var KNOWN = ['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay', 'host', 'clean-param'];
  var LEVEL = { bad: 'Ошибка', warn: 'Внимание', info: 'Совет' };
  var COLOR = { bad: '#b4234a', warn: '#a06a00', info: '#667085' };

  function esc(v) { return FV.escapeHtml(v); }

  function analyse(text) {
    var issues = [], groups = [], sitemaps = [], current = null, lastWasAgent = false;
    function issue(line, level, msg) { issues.push({ line: line, level: level, msg: msg }); }

    if (text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); issue(1, 'warn', 'Файл начинается с BOM — уберите его, некоторые роботы читают первую строку неверно.'); }
    if (new Blob([text]).size > 512000) { issue(0, 'warn', 'Размер файла больше 500 КБ — Google игнорирует остальное.'); }

    text.split(/\r\n|\r|\n/).forEach(function (raw, idx) {
      var n = idx + 1;
      var line = raw.replace(/#.*$/, '').trim();
      if (!line) { return; }
      var pos = line.indexOf(':');
      if (pos < 1) { issue(n, 'bad', 'Нет двоеточия: «' + raw.trim() + '».'); return; }
      var name = line.slice(0, pos).trim().toLowerCase();
      var value = line.slice(pos + 1).trim();

      if (KNOWN.indexOf(name) < 0) {
        issue(n, 'warn', 'Неизвестная директива «' + line.slice(0, pos).trim() + '»' + (name === 'noindex' ? ' — Noindex в robots.txt не поддерживается, используйте мета-тег.' : '.'));
        return;
      }
      if (name === 'user-agent') {
        if (!value) { issue(n, 'bad', 'Пустое значение User-agent.'); return; }
        if (!lastWasAgent || !current) {
          current = { agents: [], disallow: [], allow: [], other: [], line: n };
          groups.push(current);
        }
        current.agents.push(value);
        lastWasAgent = true;
        return;
      }
      lastWasAgent = false;
      if (name === 'sitemap') {
        sitemaps.push(value);
        if (!/^https?:\/\/[^\s/]+/i.test(value)) { issue(n, 'bad', 'Sitemap должен быть полным адресом с http:// или https://: «' + value + '».'); }
        return;
      }
      if (name === 'host' || name === 'clean-param') {
        issue(n, 'info', 'Директива ' + line.slice(0, pos).trim() + ' поддерживается не всеми поисковыми системами.');
        return;
      }
      if (!current) { issue(n, 'bad', 'Директива ' + line.slice(0, pos).trim() + ' стоит до User-agent и будет проигнорирована.'); return; }

      if (name === 'crawl-delay') {
        current.other.push('Crawl-delay: ' + value);
        if (!/^\d+(\.\d+)?$/.test(value)) { issue(n, 'bad', 'Crawl-delay должен быть числом: «' + value + '».'); }
        else { issue(n, 'info', 'Crawl-delay игнорируется Google; Яндекс его не учитывает, настройка скорости задаётся в Вебмастере.'); }
        return;
      }
      var list = name === 'allow' ? current.allow : current.disallow;
      list.push(value);
      if (value && value.charAt(0) !== '/' && value.charAt(0) !== '*') {
        issue(n, 'bad', 'Путь в ' + line.slice(0, pos).trim() + ' должен начинаться с «/» или «*»: «' + value + '».');
      }
      if (/\s/.test(value)) { issue(n, 'warn', 'В пути есть пробел: «' + value + '».'); }
      if (name === 'disallow' && value === '/' && current.agents.indexOf('*') >= 0) {
        issue(n, 'warn', 'Disallow: / для User-agent: * закрывает весь сайт от обхода.');
      }
    });

    var seen = {};
    groups.forEach(function (g) {
      g.agents.forEach(function (a) {
        var key = a.toLowerCase();
        if (seen[key]) { issue(g.line, 'warn', 'User-agent «' + a + '» описан в нескольких группах — правила могут объединяться непредсказуемо.'); }
        seen[key] = true;
      });
    });
    if (!groups.length) { issue(0, 'bad', 'Не найдено ни одной группы User-agent.'); }
    if (!sitemaps.length) { issue(0, 'info', 'Директива Sitemap не найдена — добавьте адрес карты сайта.'); }
    issues.sort(function (a, b) { return a.line - b.line; });
    return { issues: issues, groups: groups, sitemaps: sitemaps };
  }

  function cell(list) {
    return list.length ? list.map(function (v) { return '<code>' + (v ? esc(v) : '(пусто)') + '</code>'; }).join('<br>') : '<span class="md-empty">—</span>';
  }

  function render(r) {
    var c = { bad: 0, warn: 0, info: 0 };
    r.issues.forEach(function (i) { c[i.level]++; });
    summary.className = 'fv-result' + (c.bad || c.warn ? '' : ' ok');
    summary.textContent = 'Групп User-agent: ' + r.groups.length + ', Sitemap: ' + r.sitemaps.length + '. Ошибок: ' + c.bad + ', предупреждений: ' + c.warn + ', советов: ' + c.info + '.';
    issuesBody.innerHTML = r.issues.length ? r.issues.map(function (i) {
      return '<tr><td>' + (i.line || '—') + '</td><td style="color:' + COLOR[i.level] + '"><strong>' + LEVEL[i.level] + '</strong></td><td>' + esc(i.msg) + '</td></tr>';
    }).join('') : '<tr><td colspan="3">Проблем не найдено.</td></tr>';
    groupsBody.innerHTML = r.groups.length ? r.groups.map(function (g) {
      return '<tr><td>' + g.agents.map(function (a) { return '<code>' + esc(a) + '</code>'; }).join('<br>') + '</td><td>' + cell(g.disallow) + '</td><td>' + cell(g.allow) + '</td><td>' + cell(g.other) + '</td></tr>';
    }).join('') : '<tr><td colspan="4">Нет групп.</td></tr>';
    sitemapsList.innerHTML = r.sitemaps.length ? r.sitemaps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') : '<li class="md-empty">Не указан</li>';
    resultBox.hidden = false;
  }

  function run() {
    resultBox.hidden = true;
    if (!input.value.trim()) { FV.showError(error, 'Вставьте содержимое robots.txt или загрузите файл по адресу.'); return; }
    FV.clearError(error);
    render(analyse(input.value));
  }

  function load() {
    var url = urlInput.value.trim();
    FV.clearError(error);
    if (!url) { FV.showError(error, 'Введите адрес сайта.'); return; }
    loadBtn.disabled = true;
    loadBtn.textContent = 'Загрузка…';
    FV.postForm('robots-fetch.cgi', { url: url }).then(function (r) {
      if (r.status !== 200) {
        FV.showError(error, 'Сервер ответил ' + r.status + ' ' + r.reason + ' для ' + r.final_url + (r.status === 404 ? ' — файла robots.txt нет.' : '.'));
        return;
      }
      input.value = r.text;
      update();
      run();
      if (r.truncated) { FV.showError(error, 'Файл больше 512 КБ, загружена только его часть.'); }
    }).catch(function (e) {
      FV.showError(error, e.message || 'Не удалось загрузить файл.');
    }).then(function () {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Загрузить';
    });
  }

  function update() { count.textContent = input.value.length ? input.value.length + ' симв.' : ''; }

  loadBtn.addEventListener('click', load);
  urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { load(); } });
  document.getElementById('rb-run').addEventListener('click', run);
  document.getElementById('rb-sample').addEventListener('click', function () { input.value = SAMPLE; update(); run(); });
  document.getElementById('rb-clear').addEventListener('click', function () {
    input.value = '';
    resultBox.hidden = true;
    FV.clearError(error);
    update();
  });
  input.addEventListener('input', update);
  update();
})();
