(function () {
  'use strict';

  var UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var LO = 'abcdefghijklmnopqrstuvwxyz';
  var DG = '0123456789';

  function cp(n) { return String.fromCodePoint(n); }

  // Диапазоны Mathematical Alphanumeric Symbols; «дыры» заменяются символами из других блоков.
  function math(upStart, loStart, digitStart, holes) {
    var map = {};
    for (var i = 0; i < 26; i++) {
      map[UP[i]] = cp(upStart + i);
      map[LO[i]] = cp(loStart + i);
    }
    if (digitStart) {
      for (var d = 0; d < 10; d++) { map[DG[d]] = cp(digitStart + d); }
    }
    if (holes) { Object.keys(holes).forEach(function (k) { map[k] = holes[k]; }); }
    return map;
  }

  function offset(chars, start) {
    var map = {};
    for (var i = 0; i < chars.length; i++) { map[chars[i]] = cp(start + i); }
    return map;
  }

  function merge() {
    var out = {};
    Array.prototype.slice.call(arguments).forEach(function (m) {
      Object.keys(m).forEach(function (k) { out[k] = m[k]; });
    });
    return out;
  }

  function fromPairs(from, to) {
    var map = {};
    var arr = Array.from(to);
    Array.from(from).forEach(function (c, i) { if (arr[i]) { map[c] = arr[i]; } });
    return map;
  }

  var STYLES = [
    { group: 'Математические', name: 'Жирный', map: math(0x1D400, 0x1D41A, 0x1D7CE) },
    { group: 'Математические', name: 'Курсив', map: math(0x1D434, 0x1D44E, 0, { h: '\u210E' }) },
    { group: 'Математические', name: 'Жирный курсив', map: math(0x1D468, 0x1D482, 0x1D7CE) },
    { group: 'Математические', name: 'Каллиграфия', map: math(0x1D49C, 0x1D4B6, 0, {
      B: '\u212C', E: '\u2130', F: '\u2131', H: '\u210B', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211B',
      e: '\u212F', g: '\u210A', o: '\u2134' }) },
    { group: 'Математические', name: 'Жирная каллиграфия', map: math(0x1D4D0, 0x1D4EA, 0x1D7CE) },
    { group: 'Математические', name: 'Фрактура', map: math(0x1D504, 0x1D51E, 0, {
      C: '\u212D', H: '\u210C', I: '\u2111', R: '\u211C', Z: '\u2128' }) },
    { group: 'Математические', name: 'Жирная фрактура', map: math(0x1D56C, 0x1D586, 0x1D7CE) },
    { group: 'Математические', name: 'Двойная линия', map: math(0x1D538, 0x1D552, 0x1D7D8, {
      C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124' }) },
    { group: 'Математические', name: 'Sans-serif', map: math(0x1D5A0, 0x1D5BA, 0x1D7E2) },
    { group: 'Математические', name: 'Sans-serif жирный', map: math(0x1D5D4, 0x1D5EE, 0x1D7EC) },
    { group: 'Математические', name: 'Sans-serif курсив', map: math(0x1D608, 0x1D622, 0x1D7E2) },
    { group: 'Математические', name: 'Sans-serif жирный курсив', map: math(0x1D63C, 0x1D656, 0x1D7EC) },
    { group: 'Математические', name: 'Моноширинный', map: math(0x1D670, 0x1D68A, 0x1D7F6) },

    { group: 'Символы в рамках', name: 'В кружках', map: merge(offset(UP, 0x24B6), offset(LO, 0x24D0),
      fromPairs('123456789', '\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468'), { 0: '\u24EA' }) },
    { group: 'Символы в рамках', name: 'В закрашенных кружках', map: merge(offset(UP, 0x1F150), offset(LO, 0x1F150),
      fromPairs('123456789', '\u2776\u2777\u2778\u2779\u277A\u277B\u277C\u277D\u277E'), { 0: '\u24FF' }) },
    { group: 'Символы в рамках', name: 'В квадратах', map: merge(offset(UP, 0x1F130), offset(LO, 0x1F130)) },
    { group: 'Символы в рамках', name: 'В закрашенных квадратах', map: merge(offset(UP, 0x1F170), offset(LO, 0x1F170)) },
    { group: 'Символы в рамках', name: 'В скобках', map: merge(offset(UP, 0x1F110), offset(LO, 0x249C)) },

    { group: 'Эстетичные', name: 'Полная ширина', map: merge(offset(UP, 0xFF21), offset(LO, 0xFF41), offset(DG, 0xFF10), { ' ': '\u3000' }) },
    { group: 'Эстетичные', name: 'Малые прописные', lower: true, map: fromPairs(LO, 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ') },
    { group: 'Эстетичные', name: 'Надстрочный', map: merge(fromPairs(LO, 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ'), fromPairs(DG, '⁰¹²³⁴⁵⁶⁷⁸⁹'),
      fromPairs(UP, 'ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾQᴿˢᵀᵁⱽᵂˣʸᶻ')) },
    { group: 'Эстетичные', name: 'Подстрочный', map: merge(fromPairs('aehijklmnoprstuvx', 'ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'), fromPairs(DG, '₀₁₂₃₄₅₆₇₈₉')) },
    { group: 'Эстетичные', name: 'Перевёрнутый', reverse: true, map: merge(
      fromPairs(LO, 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz'),
      fromPairs(UP, '∀ᗺƆᗡƎℲ⅁HIſ⋊⅂WNOԀΌᴚS⊥∩ΛMX⅄Z'),
      fromPairs(DG, '0ƖᄅƐㄣϛ9ㄥ86'),
      fromPairs('.,?!\'"()[]{}&_', '˙\'¿¡,„)(][}{⅋‾')) },

    { group: 'Декоративные линии', name: 'Зачёркнутый', combine: '\u0336' },
    { group: 'Декоративные линии', name: 'Подчёркнутый', combine: '\u0332' },
    { group: 'Декоративные линии', name: 'Двойное подчёркивание', combine: '\u0333' },
    { group: 'Декоративные линии', name: 'Косая черта', combine: '\u0338' },
    { group: 'Декоративные линии', name: 'Надчёркнутый', combine: '\u0305' },
    { group: 'Декоративные линии', name: 'Волнистый', combine: '\u0360' },
    { group: 'Декоративные линии', name: 'Точки под буквами', combine: '\u0323' },
    { group: 'Декоративные линии', name: 'Со звёздочками', wrapper: ['★ ', ' ★'] },
    { group: 'Декоративные линии', name: 'Лучи', wrapper: ['✦•·.·', '·.·•✦'] },
    { group: 'Декоративные линии', name: 'Стрелки', wrapper: ['➤ ', ' ◄'] }
  ];

  function transform(style, text) {
    var chars = Array.from(text);
    var out;
    if (style.combine) {
      out = chars.map(function (c) { return /\s/.test(c) ? c : c + style.combine; });
    } else if (style.wrapper) {
      return text ? style.wrapper[0] + text + style.wrapper[1] : '';
    } else {
      out = chars.map(function (c) { return style.map[c] || (style.lower && style.map[c.toLowerCase()]) || c; });
    }
    if (style.reverse) { out.reverse(); }
    return out.join('');
  }

  function $(id) { return document.getElementById(id); }

  var input = $('fx-input');
  var grid = $('fx-grid');
  var count = $('fx-count');
  var clearBtn = $('fx-clear');
  var toast = $('fx-toast');
  var filter = $('fx-filter');
  var cards = [];
  var toastTimer = null;

  var groups = [];
  STYLES.forEach(function (s) { if (groups.indexOf(s.group) === -1) { groups.push(s.group); } });

  groups.forEach(function (name) {
    var section = document.createElement('div');
    section.className = 'fx-group';
    section.setAttribute('data-group', name);
    var title = document.createElement('h3');
    title.className = 'fx-group-title';
    title.textContent = name;
    var list = document.createElement('div');
    list.className = 'fx-list';
    section.appendChild(title);
    section.appendChild(list);
    grid.appendChild(section);

    STYLES.filter(function (s) { return s.group === name; }).forEach(function (style) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'fx-card';
      card.setAttribute('aria-label', style.name + ' — нажмите, чтобы скопировать');
      var label = document.createElement('span');
      label.className = 'fx-card-label';
      label.textContent = style.name;
      var output = document.createElement('span');
      output.className = 'fx-card-output';
      var cta = document.createElement('span');
      cta.className = 'fx-card-cta';
      cta.textContent = 'Копировать';
      card.appendChild(label);
      card.appendChild(output);
      card.appendChild(cta);
      list.appendChild(card);
      cards.push({ style: style, card: card, output: output, cta: cta, section: section });

      card.addEventListener('click', function () { if (input.value) { copy(output.textContent, cta, style.name); } else { showToast('Введите текст для стилизации'); input.focus(); } });
    });
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1600);
  }

  function copy(text, cta, name) {
    if (!text) { return; }
    var done = function () {
      cta.textContent = 'Скопировано';
      showToast('Стиль «' + name + '» скопирован');
      setTimeout(function () { cta.textContent = 'Копировать'; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    document.body.removeChild(area);
  }

  function update() {
    var text = input.value;
    count.textContent = Array.from(text).length + ' / ' + input.maxLength;
    clearBtn.disabled = !text;
    var query = filter.value.trim().toLowerCase();
    var visible = {};
    cards.forEach(function (c) {
      c.output.textContent = text ? transform(c.style, text) : '';
      c.output.classList.toggle('fx-empty', !text);
      if (!text) { c.output.textContent = transform(c.style, 'Hello world'); }
      var show = !query || c.style.name.toLowerCase().indexOf(query) !== -1;
      c.card.hidden = !show;
      if (show) { visible[c.style.group] = true; }
    });
    Array.prototype.forEach.call(grid.querySelectorAll('.fx-group'), function (g) {
      g.hidden = !visible[g.getAttribute('data-group')];
    });
    $('fx-none').hidden = Object.keys(visible).length > 0;
  }

  input.addEventListener('input', update);
  filter.addEventListener('input', update);
  clearBtn.addEventListener('click', function () { input.value = ''; update(); input.focus(); });
  $('fx-sample').addEventListener('click', function () { input.value = 'Hello world'; update(); });

  input.value = 'Hello world';
  update();
})();
