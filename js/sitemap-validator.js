(function () {
  'use strict';
  var error = document.getElementById('sitemap-validator-error');
  var urlInput = document.getElementById('sm-url');
  var input = document.getElementById('sm-input');
  var count = document.getElementById('sm-count');
  var loadBtn = document.getElementById('sm-load');
  var resultBox = document.getElementById('sm-result');
  var summary = document.getElementById('sm-summary');
  var issuesBody = document.getElementById('sm-issues');
  var nestedWrap = document.getElementById('sm-nested-wrap');
  var nestedBody = document.getElementById('sm-nested');
  var nestedBtn = document.getElementById('sm-nested-run');
  var NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
  var FREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
  var W3C = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$|^\d{4}-\d{2}$|^\d{4}$/;
  var LEVEL = { bad: 'Ошибка', warn: 'Внимание', info: 'Совет' };
  var COLOR = { bad: '#b4234a', warn: '#a06a00', info: '#667085' };
  var SAMPLE = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc><lastmod>2026-11-03</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n  <url><loc>https://example.com/about</loc><lastmod>03.11.2026</lastmod><priority>1.5</priority></url>\n  <url><loc>https://example.com/about</loc></url>\n  <url><loc>/relative</loc><changefreq>sometimes</changefreq></url>\n  <url><lastmod>2026-01-01</lastmod></url>\n</urlset>';
  var nestedUrls = [];

  function esc(v) { return FV.escapeHtml(v); }

  function children(el, name) {
    return Array.prototype.filter.call(el.children, function (c) { return c.localName === name; });
  }

  function text(el, name) {
    var c = children(el, name)[0];
    return c ? c.textContent.trim() : null;
  }

  function validDate(v) {
    if (!W3C.test(v)) { return false; }
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);
    if (!m || !m[2]) { return true; }
    var mo = Number(m[2]), d = m[3] ? Number(m[3]) : 1;
    return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Number(m[1]), mo, 0).getDate();
  }

  function checkUrl(loc, label, issue, hosts) {
    if (!loc) { issue(label, 'bad', 'Нет обязательного элемента loc.'); return false; }
    var u;
    try { u = new URL(loc); } catch (e) { u = null; }
    if (!u || !/^https?:$/.test(u.protocol)) { issue(label, 'bad', 'loc должен быть полным http(s)-адресом: «' + loc + '».'); return false; }
    if (loc.length > 2048) { issue(label, 'bad', 'loc длиннее 2048 символов.'); }
    if (/\s/.test(loc)) { issue(label, 'bad', 'В loc есть пробелы.'); }
    if (u.protocol === 'http:') { issue(label, 'info', 'Адрес с http:// — проверьте, не нужен ли https://.'); }
    hosts[u.host] = (hosts[u.host] || 0) + 1;
    return true;
  }

  function analyse(xml) {
    var issues = [], info = { type: '', entries: 0, nested: [] };
    function issue(where, level, msg) { issues.push({ where: where, level: level, msg: msg }); }

    if (new Blob([xml]).size > 52428800) { issue('Файл', 'bad', 'Размер больше 50 МБ — лимит протокола.'); }
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var perr = doc.getElementsByTagName('parsererror')[0];
    if (perr) {
      issue('XML', 'bad', 'XML содержит ошибки: ' + perr.textContent.trim().split('\n')[0].slice(0, 200));
      return { issues: issues, info: info };
    }
    var root = doc.documentElement;
    if (root.namespaceURI !== NS) { issue('Корень', 'bad', 'Неверное или отсутствующее пространство имён (нужно ' + NS + ').'); }

    var isIndex = root.localName === 'sitemapindex';
    if (!isIndex && root.localName !== 'urlset') {
      issue('Корень', 'bad', 'Корневой элемент должен быть urlset или sitemapindex, найден «' + root.localName + '».');
      return { issues: issues, info: info };
    }
    info.type = isIndex ? 'Sitemap Index' : 'Sitemap';
    var entries = children(root, isIndex ? 'sitemap' : 'url');
    info.entries = entries.length;
    if (!entries.length) { issue('Корень', 'bad', 'Нет записей ' + (isIndex ? 'sitemap' : 'url') + '.'); }
    if (entries.length > 50000) { issue('Корень', 'bad', 'Больше 50 000 записей (' + entries.length + ') — лимит протокола.'); }

    var seen = {}, hosts = {}, dup = 0;
    entries.forEach(function (el, i) {
      var label = '#' + (i + 1);
      var loc = text(el, 'loc');
      var ok = checkUrl(loc, label, issue, hosts);
      if (ok) {
        if (seen[loc]) { dup++; issue(label, 'warn', 'Дубликат адреса «' + loc + '» (первая запись #' + seen[loc] + ').'); }
        else { seen[loc] = i + 1; }
        if (isIndex) { info.nested.push(loc); }
      }
      var lm = text(el, 'lastmod');
      if (lm !== null && !validDate(lm)) { issue(label, 'bad', 'lastmod не в формате W3C (ГГГГ-ММ-ДД): «' + lm + '».'); }
      else if (lm && new Date(lm) > new Date(Date.now() + 86400000)) { issue(label, 'warn', 'lastmod в будущем: «' + lm + '».'); }
      if (!isIndex) {
        var cf = text(el, 'changefreq');
        if (cf !== null && FREQ.indexOf(cf) < 0) { issue(label, 'warn', 'Недопустимое changefreq «' + cf + '».'); }
        var pr = text(el, 'priority');
        if (pr !== null && !(/^\d(\.\d+)?$/.test(pr) && Number(pr) >= 0 && Number(pr) <= 1)) { issue(label, 'warn', 'priority должен быть числом от 0.0 до 1.0: «' + pr + '».'); }
      }
    });
    var hostNames = Object.keys(hosts);
    if (hostNames.length > 1) { issue('Хосты', 'warn', 'Адреса относятся к разным хостам: ' + hostNames.join(', ') + '. Sitemap должен описывать один сайт.'); }
    info.hosts = hostNames.length;
    info.dup = dup;
    return { issues: issues, info: info };
  }

  function render(r) {
    var c = { bad: 0, warn: 0, info: 0 };
    r.issues.forEach(function (i) { c[i.level]++; });
    summary.className = 'fv-result' + (c.bad || c.warn ? '' : ' ok');
    summary.textContent = (r.info.type ? r.info.type + ': записей ' + r.info.entries + '. ' : '') +
      'Ошибок: ' + c.bad + ', предупреждений: ' + c.warn + ', советов: ' + c.info + '.';
    issuesBody.innerHTML = r.issues.length ? r.issues.slice(0, 500).map(function (i) {
      return '<tr><td>' + esc(i.where) + '</td><td style="color:' + COLOR[i.level] + '"><strong>' + LEVEL[i.level] + '</strong></td><td>' + esc(i.msg) + '</td></tr>';
    }).join('') : '<tr><td colspan="3">Проблем не найдено.</td></tr>';
    if (r.issues.length > 500) { issuesBody.innerHTML += '<tr><td colspan="3">Показаны первые 500 из ' + r.issues.length + '.</td></tr>'; }
    nestedUrls = r.info.nested;
    nestedWrap.hidden = !nestedUrls.length;
    nestedBody.innerHTML = nestedUrls.map(function (u) { return '<tr><td>' + esc(u) + '</td><td class="sm-st">—</td></tr>'; }).join('');
    resultBox.hidden = false;
  }

  function run() {
    resultBox.hidden = true;
    if (!input.value.trim()) { FV.showError(error, 'Вставьте XML, выберите файл или загрузите Sitemap по адресу.'); return; }
    FV.clearError(error);
    render(analyse(input.value));
  }

  function load() {
    var url = urlInput.value.trim();
    FV.clearError(error);
    if (!url) { FV.showError(error, 'Введите адрес Sitemap.'); return; }
    loadBtn.disabled = true;
    loadBtn.textContent = 'Загрузка…';
    FV.postForm('sitemap-fetch.cgi', { url: url }).then(function (r) {
      if (r.status !== 200) { FV.showError(error, 'Сервер ответил ' + r.status + ' ' + r.reason + ' для ' + r.final_url + '.'); return; }
      input.value = r.text;
      update();
      run();
      if (r.truncated) { FV.showError(error, 'Файл больше 2 МБ, загружена только его часть — проверка может быть неполной.'); }
    }).catch(function (e) {
      FV.showError(error, e.message || 'Не удалось загрузить Sitemap.');
    }).then(function () {
      loadBtn.disabled = false;
      loadBtn.textContent = 'Загрузить';
    });
  }

  function checkNested() {
    var cells = nestedBody.querySelectorAll('.sm-st');
    nestedBtn.disabled = true;
    var chain = Promise.resolve();
    nestedUrls.slice(0, 10).forEach(function (u, i) {
      chain = chain.then(function () {
        cells[i].textContent = 'Проверяется…';
        return FV.postForm('http-status.cgi', { url: u, method: 'HEAD' }).then(function (r) {
          cells[i].textContent = r.status + ' ' + r.reason + (r.redirect_count ? ' (редиректов: ' + r.redirect_count + ')' : '');
          cells[i].style.color = r.status === 200 ? '#1b6b3a' : '#b4234a';
        }).catch(function (e) {
          cells[i].textContent = e.message;
          cells[i].style.color = '#b4234a';
        });
      });
    });
    chain.then(function () { nestedBtn.disabled = false; });
  }

  function update() { count.textContent = input.value.length ? input.value.length + ' симв.' : ''; }

  loadBtn.addEventListener('click', load);
  urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { load(); } });
  nestedBtn.addEventListener('click', checkNested);
  document.getElementById('sm-run').addEventListener('click', run);
  document.getElementById('sm-file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) { return; }
    if (f.size > 52428800) { FV.showError(error, 'Файл больше 50 МБ.'); return; }
    var reader = new FileReader();
    reader.onload = function () { input.value = reader.result; update(); run(); };
    reader.readAsText(f);
    e.target.value = '';
  });
  document.getElementById('sm-sample').addEventListener('click', function () { input.value = SAMPLE; update(); run(); });
  document.getElementById('sm-clear').addEventListener('click', function () {
    input.value = '';
    resultBox.hidden = true;
    FV.clearError(error);
    update();
  });
  input.addEventListener('input', update);
  update();
})();
