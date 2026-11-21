(function () {
  'use strict';

  var defaults = {
    title: 'Проверьте RSS-ленту — FEED Валидатор',
    description: 'Проверьте RSS и Atom, найдите ошибки в ленте и подготовьте её к публикации.',
    url: /^https?:$/.test(location.protocol) ? location.origin + '/' : 'https://example.com/',
    image: '',
    imageAlt: 'FEED Валидатор — проверка RSS и Atom',
    siteName: 'FEED Валидатор',
    type: 'website',
    card: 'summary_large_image',
    twitterSite: '',
    twitterCreator: ''
  };
  var inputIds = {
    title: 'og-title',
    description: 'og-description',
    url: 'og-url',
    image: 'og-image',
    imageAlt: 'og-image-alt',
    siteName: 'og-site-name',
    type: 'og-type',
    card: 'twitter-card',
    twitterSite: 'twitter-site',
    twitterCreator: 'twitter-creator'
  };
  var activeNetwork = 'facebook';

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeAttribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readValues() {
    var values = {};
    Object.keys(inputIds).forEach(function (key) {
      values[key] = byId(inputIds[key]).value.trim();
    });
    return values;
  }

  function tagLine(attribute, name, value) {
    return '<meta ' + attribute + '="' + name + '" content="' + escapeAttribute(value) + '">';
  }

  function generatedTags(values) {
    var lines = [];
    lines.push('<title>' + escapeAttribute(values.title) + '</title>');
    if (values.description) {
      lines.push(tagLine('name', 'description', values.description));
    }
    if (values.url) {
      lines.push('<link rel="canonical" href="' + escapeAttribute(values.url) + '">');
    }
    lines.push('');
    lines.push('<!-- Open Graph -->');
    lines.push(tagLine('property', 'og:title', values.title));
    if (values.description) {
      lines.push(tagLine('property', 'og:description', values.description));
    }
    lines.push(tagLine('property', 'og:type', values.type));
    if (values.url) {
      lines.push(tagLine('property', 'og:url', values.url));
    }
    if (values.image) {
      lines.push(tagLine('property', 'og:image', values.image));
    }
    if (values.imageAlt) {
      lines.push(tagLine('property', 'og:image:alt', values.imageAlt));
    }
    if (values.siteName) {
      lines.push(tagLine('property', 'og:site_name', values.siteName));
    }
    lines.push(tagLine('property', 'og:locale', 'ru_RU'));
    lines.push('');
    lines.push('<!-- X / Twitter -->');
    lines.push(tagLine('name', 'twitter:card', values.card));
    lines.push(tagLine('name', 'twitter:title', values.title));
    if (values.description) {
      lines.push(tagLine('name', 'twitter:description', values.description));
    }
    if (values.image) {
      lines.push(tagLine('name', 'twitter:image', values.image));
      if (values.imageAlt) {
        lines.push(tagLine('name', 'twitter:image:alt', values.imageAlt));
      }
    }
    if (values.twitterSite) {
      lines.push(tagLine('name', 'twitter:site', values.twitterSite));
    }
    if (values.twitterCreator) {
      lines.push(tagLine('name', 'twitter:creator', values.twitterCreator));
    }
    return lines.join('\n');
  }

  function safeWebUrl(value) {
    try {
      var parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function setImage(image, src, alt) {
    var parsed = safeWebUrl(src);
    if (!parsed) {
      image.removeAttribute('src');
      image.alt = '';
      image.hidden = true;
      return;
    }
    image.src = parsed.href;
    image.alt = alt;
    image.hidden = false;
  }

  function updatePreview(values) {
    var preview = byId('og-preview');
    preview.className = 'og-preview og-preview-' + activeNetwork;
    byId('og-preview-title').textContent = values.title || 'Заголовок карточки';
    byId('og-preview-description').textContent = values.description || 'Описание страницы будет показано здесь.';
    byId('og-preview-domain').textContent = (safeWebUrl(values.url) || { hostname: 'example.com' }).hostname.toUpperCase();
    setImage(byId('og-preview-image'), values.image, values.imageAlt);

    var titleLength = values.title.length;
    var descriptionLength = values.description.length;
    byId('og-title-count').textContent = titleLength + ' / 60';
    byId('og-description-count').textContent = descriptionLength + ' / 155';
    byId('og-title-count').className = titleLength > 60 ? 'over-limit' : '';
    byId('og-description-count').className = descriptionLength > 155 ? 'over-limit' : '';
    byId('og-code').textContent = generatedTags(values);
  }

  function addDescriptionRow(list, term, description) {
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = description;
    list.appendChild(dt);
    list.appendChild(dd);
  }

  function showScanResult(data) {
    var result = byId('og-scan-result');
    var issues = byId('og-issues');
    var tags = byId('og-tags');
    var url = byId('og-result-url');
    var image = byId('og-result-image');
    issues.textContent = '';
    tags.textContent = '';

    byId('og-result-title').textContent = data.title || 'Заголовок не найден';
    byId('og-result-description').textContent = data.description || 'Описание не найдено';
    url.href = data.url;
    url.textContent = data.url;
    setImage(image, data.image, data.open_graph['og:image:alt'] ? data.open_graph['og:image:alt'][0] : 'Изображение Open Graph');

    if (!data.issues.length) {
      var success = document.createElement('li');
      success.className = 'og-issue-success';
      success.textContent = 'Основные проверки пройдены. Рекомендуемые теги также присутствуют.';
      issues.appendChild(success);
    } else {
      data.issues.forEach(function (issue) {
        var item = document.createElement('li');
        item.className = 'og-issue-' + issue.level;
        var tag = document.createElement('code');
        tag.textContent = issue.tag;
        item.appendChild(tag);
        item.appendChild(document.createTextNode(' ' + issue.message));
        issues.appendChild(item);
      });
    }

    Object.keys(data.open_graph).sort().forEach(function (key) {
      data.open_graph[key].forEach(function (value) {
        addDescriptionRow(tags, key, value || '(пустое значение)');
      });
    });
    Object.keys(data.twitter).sort().forEach(function (key) {
      data.twitter[key].forEach(function (value) {
        addDescriptionRow(tags, key, value || '(пустое значение)');
      });
    });
    if (!Object.keys(data.open_graph).length && !Object.keys(data.twitter).length) {
      addDescriptionRow(tags, 'Результат', 'Мета-теги Open Graph и Twitter Card не найдены.');
    }

    result.hidden = false;
  }

  function scan(event) {
    event.preventDefault();
    var url = byId('og-scan-url').value.trim();
    var message = byId('og-scan-message');
    var submit = byId('og-scan-submit');
    var parsed = safeWebUrl(url);
    if (!parsed) {
      message.textContent = 'Введите корректный полный URL сайта, начинающийся с http:// или https://.';
      message.className = 'og-message og-message-error';
      message.hidden = false;
      return;
    }

    message.textContent = 'Загружаем страницу и проверяем метатеги…';
    message.className = 'og-message og-message-loading';
    message.hidden = false;
    byId('og-scan-result').hidden = true;
    submit.disabled = true;
    fetch('open-graph.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ url: parsed.href })
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) {
          throw new Error(body.error || 'Не удалось проверить страницу.');
        }
        return body;
      });
    }).then(function (data) {
      showScanResult(data);
      message.textContent = 'Проверка завершена для ' + data.url;
      message.className = 'og-message og-message-success';
    }).catch(function (error) {
      message.textContent = error.message || 'Не удалось связаться с сервером проверки.';
      message.className = 'og-message og-message-error';
    }).then(function () {
      submit.disabled = false;
    });
  }

  function copyTags() {
    var code = byId('og-code').textContent;
    var message = byId('og-copy-message');
    function copied() {
      message.textContent = 'HTML-теги скопированы.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(copied).catch(function () {
        message.textContent = 'Не удалось скопировать. Выделите и скопируйте код вручную.';
      });
      return;
    }
    var helper = document.createElement('textarea');
    helper.value = code;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    var copiedSuccessfully = document.execCommand('copy');
    document.body.removeChild(helper);
    message.textContent = copiedSuccessfully ? 'HTML-теги скопированы.' : 'Не удалось скопировать. Выделите код вручную.';
  }

  Object.keys(inputIds).forEach(function (key) {
    var input = byId(inputIds[key]);
    input.value = defaults[key];
    input.addEventListener('input', function () { updatePreview(readValues()); });
    input.addEventListener('change', function () { updatePreview(readValues()); });
  });
  document.querySelectorAll('.og-network-tabs [data-network]').forEach(function (button) {
    button.addEventListener('click', function () {
      activeNetwork = button.getAttribute('data-network');
      document.querySelectorAll('.og-network-tabs [data-network]').forEach(function (tab) {
        var active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      updatePreview(readValues());
    });
  });
  byId('og-reset').addEventListener('click', function () {
    Object.keys(inputIds).forEach(function (key) { byId(inputIds[key]).value = defaults[key]; });
    updatePreview(readValues());
  });
  byId('og-scan-form').addEventListener('submit', scan);
  byId('og-copy').addEventListener('click', copyTags);
  updatePreview(readValues());
}());
