(function () {
  'use strict';
  var error = document.getElementById('schema-validator-error');
  var esc = FV.escapeHtml;
  var source = 'url';

  // required — без них объект не соответствует типу; recommended — рекомендации поисковых систем
  var RULES = {
    Article: { required: ['headline'], recommended: ['author', 'datePublished', 'image'] },
    NewsArticle: { required: ['headline'], recommended: ['author', 'datePublished', 'image'] },
    BlogPosting: { required: ['headline'], recommended: ['author', 'datePublished', 'image'] },
    Product: { required: ['name'], recommended: ['image', 'description', 'offers', 'aggregateRating', 'review'] },
    Offer: { required: ['price', 'priceCurrency'], recommended: ['availability', 'url'] },
    Organization: { required: ['name'], recommended: ['url', 'logo', 'sameAs'] },
    LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHours', 'geo', 'image'] },
    Person: { required: ['name'], recommended: ['url', 'image', 'sameAs'] },
    WebSite: { required: ['url'], recommended: ['name', 'potentialAction'] },
    WebPage: { required: [], recommended: ['name', 'description'] },
    WebApplication: { required: ['name'], recommended: ['applicationCategory', 'operatingSystem', 'offers'] },
    SoftwareApplication: { required: ['name'], recommended: ['applicationCategory', 'operatingSystem', 'offers'] },
    BreadcrumbList: { required: ['itemListElement'], recommended: [] },
    ListItem: { required: ['position'], recommended: ['name', 'item'] },
    FAQPage: { required: ['mainEntity'], recommended: [] },
    Question: { required: ['name', 'acceptedAnswer'], recommended: [] },
    Answer: { required: ['text'], recommended: [] },
    Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'description', 'image', 'offers'] },
    Recipe: { required: ['name', 'image'], recommended: ['recipeIngredient', 'recipeInstructions', 'author'] },
    VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'contentUrl'] },
    ImageObject: { required: [], recommended: ['url', 'contentUrl'] },
    Review: { required: ['itemReviewed', 'reviewRating', 'author'], recommended: [] },
    AggregateRating: { required: ['ratingValue'], recommended: ['reviewCount', 'ratingCount'] },
    JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization'], recommended: ['validThrough', 'jobLocation'] },
    PostalAddress: { required: [], recommended: ['streetAddress', 'addressLocality', 'addressCountry'] }
  };

  function shortType(t) { return String(t).replace(/^https?:\/\/schema\.org\//i, ''); }
  function hasValue(v) {
    if (v === undefined || v === null) { return false; }
    if (typeof v === 'string') { return v.trim() !== ''; }
    if (Array.isArray(v)) { return v.length > 0; }
    return true;
  }

  function check(obj, path, issues) {
    var types = [].concat(obj['@type'] || obj.type || []).map(shortType);
    if (!types.length) { issues.push(['info', path, 'Нет @type — тип объекта не указан.']); }
    types.forEach(function (t) {
      var rule = RULES[t];
      if (!rule) { issues.push(['info', path, 'Тип «' + t + '» не входит во встроенный набор правил: проверена только структура.']); return; }
      rule.required.forEach(function (f) {
        if (!hasValue(obj[f])) { issues.push(['error', path, t + ': нет обязательного свойства «' + f + '».']); }
      });
      rule.recommended.forEach(function (f) {
        if (!hasValue(obj[f])) { issues.push(['warning', path, t + ': рекомендуется свойство «' + f + '».']); }
      });
    });
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (k.charAt(0) === '@') { return; }
      (Array.isArray(v) ? v : [v]).forEach(function (item, i) {
        if (item && typeof item === 'object' && !Array.isArray(item) && (item['@type'] || item.type)) {
          check(item, path + ' → ' + k + (Array.isArray(v) ? '[' + i + ']' : ''), issues);
        }
      });
    });
    if (obj['@context'] === undefined && path.indexOf('→') < 0) {
      issues.push(['warning', path, 'Нет @context (обычно https://schema.org).']);
    }
  }

  function flatten(data) {
    var list = [];
    (Array.isArray(data) ? data : [data]).forEach(function (d) {
      if (d && typeof d === 'object') {
        if (Array.isArray(d['@graph'])) {
          d['@graph'].forEach(function (g) { if (g && typeof g === 'object') { if (d['@context'] && !g['@context']) { g = Object.assign({ '@context': d['@context'] }, g); } list.push(g); } });
        } else { list.push(d); }
      }
    });
    return list;
  }

  function microdataItem(el) {
    var obj = { '@type': (el.getAttribute('itemtype') || '').split(/\s+/)[0], _format: 'Microdata' };
    var typeAttr = obj['@type'];
    if (typeAttr) { obj['@context'] = 'https://schema.org'; }
    (function walk(node) {
      Array.prototype.forEach.call(node.children, function (c) {
        var prop = c.getAttribute('itemprop');
        if (prop) {
          var val;
          if (c.hasAttribute('itemscope')) { val = microdataItem(c); }
          else if (c.hasAttribute('content')) { val = c.getAttribute('content'); }
          else if (/^(a|link)$/i.test(c.tagName)) { val = c.getAttribute('href'); }
          else if (/^(img|meta|source|video|audio)$/i.test(c.tagName)) { val = c.getAttribute('src') || c.getAttribute('content'); }
          else if (/^time$/i.test(c.tagName)) { val = c.getAttribute('datetime') || c.textContent.trim(); }
          else { val = c.textContent.trim(); }
          prop.split(/\s+/).forEach(function (p) {
            if (obj[p] === undefined) { obj[p] = val; } else { obj[p] = [].concat(obj[p], val); }
          });
          if (!c.hasAttribute('itemscope')) { walk(c); }
        } else if (!c.hasAttribute('itemscope')) { walk(c); }
      });
    })(el);
    return obj;
  }

  function rdfaItem(el) {
    var obj = { '@type': el.getAttribute('typeof'), _format: 'RDFa', '@context': 'https://schema.org' };
    Array.prototype.forEach.call(el.querySelectorAll('[property]'), function (c) {
      var closest = c.parentElement && c.parentElement.closest('[typeof]');
      if (closest !== el) { return; }
      var p = c.getAttribute('property').replace(/^schema:/, '');
      var val = c.getAttribute('content') || c.getAttribute('href') || c.getAttribute('src') || c.textContent.trim();
      obj[p] = obj[p] === undefined ? val : [].concat(obj[p], val);
    });
    return obj;
  }

  function extract(html) {
    var items = [], syntax = [];
    var trimmed = html.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      try { flatten(JSON.parse(trimmed)).forEach(function (o) { o._format = 'JSON-LD'; items.push(o); }); }
      catch (e) { syntax.push('JSON-LD: ' + e.message); }
      return { items: items, syntax: syntax };
    }
    var doc = new DOMParser().parseFromString(html, 'text/html');
    Array.prototype.forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'), function (s, i) {
      try { flatten(JSON.parse(s.textContent)).forEach(function (o) { o._format = 'JSON-LD'; items.push(o); }); }
      catch (e) { syntax.push('JSON-LD блок ' + (i + 1) + ': ' + e.message); }
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[itemscope][itemtype*="schema.org"]'), function (el) {
      var parentScope = el.parentElement && el.parentElement.closest('[itemscope]');
      if (!(parentScope && el.hasAttribute('itemprop'))) { items.push(microdataItem(el)); }
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[typeof]'), function (el) {
      var type = el.getAttribute('typeof');
      var vocab = el.closest('[vocab]');
      var isSchema = /^schema:/.test(type) || /schema\.org/.test(type) || (vocab && /schema\.org/.test(vocab.getAttribute('vocab')));
      var parent = el.parentElement && el.parentElement.closest('[typeof]');
      if (isSchema && !parent) { items.push(rdfaItem(el)); }
    });
    return { items: items, syntax: syntax };
  }

  var ICON = { error: 'Ошибка', warning: 'Рекомендация', info: 'Заметка' };

  function render(html, pageUrl) {
    var found = extract(html);
    var errors = 0, warnings = 0, out = '';
    var MAX_ITEMS = 50;
    var total = found.items.length;
    found.items = found.items.slice(0, MAX_ITEMS);
    found.syntax.forEach(function (m) { errors++; out += '<div class="fv-error">Синтаксическая ошибка. ' + esc(m) + '</div>'; });
    found.items.forEach(function (obj, i) {
      var issues = [];
      var label = [].concat(obj['@type'] || '—').map(shortType).join(', ');
      check(obj, label, issues);
      var show = {};
      Object.keys(obj).forEach(function (k) { if (k !== '_format') { show[k] = obj[k]; } });
      errors += issues.filter(function (x) { return x[0] === 'error'; }).length;
      warnings += issues.filter(function (x) { return x[0] === 'warning'; }).length;
      out += '<h3>' + (i + 1) + '. ' + esc(label) + ' <small>(' + obj._format + ')</small></h3>';
      out += issues.length
        ? '<ul>' + issues.map(function (x) { return '<li><strong>' + ICON[x[0]] + '.</strong> ' + esc(x[2]) + '</li>'; }).join('') + '</ul>'
        : '<p>Замечаний нет.</p>';
      out += '<pre class="fv-code">' + esc(JSON.stringify(show, null, 2)) + '</pre>';
    });
    document.getElementById('sc-summary').textContent = found.items.length || found.syntax.length
      ? 'Найдено объектов: ' + total + (total > MAX_ITEMS ? ' (показаны первые ' + MAX_ITEMS + ')' : '') + '. Ошибок: ' + errors + ', рекомендаций: ' + warnings + '.' + (pageUrl ? ' Страница: ' + pageUrl : '')
      : 'Структурированные данные не найдены.';
    document.getElementById('sc-items').innerHTML = out;
    document.getElementById('sc-result').hidden = false;
  }

  function run() {
    FV.clearError(error);
    document.getElementById('sc-result').hidden = true;
    if (source === 'html') {
      var html = document.getElementById('sc-html').value;
      if (!html.trim()) { FV.showError(error, 'Вставьте HTML или JSON-LD.'); return; }
      render(html, '');
      return;
    }
    var url = document.getElementById('sc-url').value.trim();
    if (!url) { FV.showError(error, 'Введите адрес страницы.'); return; }
    FV.postForm('page-fetch.cgi', { url: url }).then(function (d) {
      if (d.status !== 200) { FV.showError(error, 'Сервер ответил ' + d.status + ' ' + d.reason + '.'); return; }
      render(d.text, d.final_url);
    }).catch(function (e) { FV.showError(error, e.message); });
  }

  function setSource(next) {
    source = next;
    Array.prototype.forEach.call(document.querySelectorAll('[data-src]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-src') === next);
    });
    document.getElementById('sc-url-box').hidden = next !== 'url';
    document.getElementById('sc-html-box').hidden = next !== 'html';
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-src]'), function (b) {
    b.addEventListener('click', function () { setSource(b.getAttribute('data-src')); });
  });
  document.getElementById('sc-run').addEventListener('click', run);
  document.getElementById('sc-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { run(); } });
  document.getElementById('sc-example').addEventListener('click', function () {
    setSource('html');
    document.getElementById('sc-html').value = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Кружка","offers":{"@type":"Offer","price":"500"}}<\/script>\n<div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">NGCMS</span><a itemprop="url" href="https://ngcms.org">сайт</a></div>';
    run();
  });
})();
