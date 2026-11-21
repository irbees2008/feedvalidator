(function () {
  'use strict';
  var input = document.getElementById('docs-search');
  var status = document.getElementById('docs-search-status');
  if (!input || !status) { return; }

  var messages = Array.prototype.slice.call(document.querySelectorAll('[data-doc-message]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-doc-section]'));

  function filter() {
    var query = input.value.trim().toLocaleLowerCase();
    var visible = 0;
    messages.forEach(function (item) {
      var matches = !query || item.getAttribute('data-search').indexOf(query) !== -1;
      item.hidden = !matches;
      if (matches) { visible++; }
    });
    sections.forEach(function (section) {
      var hasVisible = !!section.querySelector('[data-doc-message]:not([hidden])');
      section.hidden = !hasVisible;
      if (query && hasVisible) { section.open = true; }
    });
    status.textContent = query ? 'Найдено сообщений: ' + visible : '';
  }

  input.addEventListener('input', filter);
})();
