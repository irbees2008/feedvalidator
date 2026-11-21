(function () {
  'use strict';
  var error = document.getElementById('cron-generator-error');
  var input = document.getElementById('cron-input');
  var result = document.getElementById('cron-result');
  var presetSel = document.getElementById('cron-preset');
  var fields = [0, 1, 2, 3, 4].map(function (i) { return document.getElementById('cron-f' + i); });
  var RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  var NAMES = [null, null, null,
    { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },
    { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }];
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var PRESETS = [
    ['', 'Выбрать шаблон…'],
    ['* * * * *', 'Каждую минуту'],
    ['*/5 * * * *', 'Каждые 5 минут'],
    ['0 * * * *', 'Каждый час'],
    ['0 0 * * *', 'Каждый день в полночь'],
    ['30 9 * * 1-5', 'По будням в 09:30'],
    ['0 0 * * 0', 'Каждое воскресенье в полночь'],
    ['0 0 1 * *', 'Первого числа каждого месяца'],
    ['0 0 1 1 *', 'Раз в год, 1 января']
  ];

  PRESETS.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p[0];
    o.textContent = p[1] + (p[0] ? '  (' + p[0] + ')' : '');
    presetSel.appendChild(o);
  });

  function parseValue(tok, idx) {
    if (/^\d+$/.test(tok)) { return parseInt(tok, 10); }
    var names = NAMES[idx];
    if (names && names[tok.toLowerCase()] !== undefined) { return names[tok.toLowerCase()]; }
    throw new Error('Недопустимое значение «' + tok + '»');
  }

  function parseField(text, idx) {
    var min = RANGES[idx][0], max = RANGES[idx][1], set = {}, any = false;
    text.split(',').forEach(function (part) {
      if (!part) { throw new Error('Пустой элемент списка в поле ' + (idx + 1)); }
      var step = 1, range = part, m = part.split('/');
      if (m.length > 2) { throw new Error('Некорректный шаг «' + part + '»'); }
      if (m.length === 2) {
        if (!/^\d+$/.test(m[1]) || parseInt(m[1], 10) < 1) { throw new Error('Некорректный шаг «' + part + '»'); }
        step = parseInt(m[1], 10);
        range = m[0];
      }
      var lo, hi;
      if (range === '*') {
        lo = min; hi = idx === 4 ? 6 : max;
        if (m.length === 1) { any = true; }
      } else if (range.indexOf('-') > 0) {
        var r = range.split('-');
        if (r.length !== 2) { throw new Error('Некорректный диапазон «' + part + '»'); }
        lo = parseValue(r[0], idx); hi = parseValue(r[1], idx);
      } else {
        lo = parseValue(range, idx);
        hi = m.length === 2 ? max : lo;
      }
      if (lo < min || hi > max || lo > hi) {
        throw new Error('Значение «' + part + '» вне диапазона ' + min + '–' + max);
      }
      for (var v = lo; v <= hi; v += step) { set[idx === 4 && v === 7 ? 0 : v] = true; }
    });
    return { set: set, any: any || text === '*' };
  }

  function two(n) { return n < 10 ? '0' + n : String(n); }

  function keys(f) { return Object.keys(f.set).map(Number).sort(function (a, b) { return a - b; }); }

  function describe(parts, parsed) {
    var out = [];
    var min = parts[0], hour = parts[1];
    if (min === '*' && hour === '*') { out.push('Каждую минуту'); }
    else if (/^\*\/\d+$/.test(min) && hour === '*') { out.push('Каждые ' + min.slice(2) + ' мин.'); }
    else if (/^\d+$/.test(min) && hour === '*') { out.push('В ' + min + '-ю минуту каждого часа'); }
    else if (/^\d+$/.test(min) && /^\d+$/.test(hour)) { out.push('В ' + two(+hour) + ':' + two(+min)); }
    else {
      out.push('Минуты: ' + keys(parsed[0]).join(', ') + (hour === '*' ? '' : '; часы: ' + keys(parsed[1]).join(', ')));
    }
    if (!parsed[2].any) { out.push('числа месяца: ' + keys(parsed[2]).join(', ')); }
    if (!parsed[3].any) { out.push('месяцы: ' + keys(parsed[3]).map(function (m) { return MONTHS[m - 1]; }).join(', ')); }
    if (!parsed[4].any) { out.push('дни недели: ' + keys(parsed[4]).map(function (d) { return DAYS[d]; }).join(', ')); }
    if (parsed[2].any && parsed[3].any && parsed[4].any) { out.push('каждый день'); }
    return out.join(', ');
  }

  function nextRuns(parsed, count) {
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    var runs = [], limit = 60 * 24 * 366 * 2;
    for (var i = 0; i < limit && runs.length < count; i++, d.setMinutes(d.getMinutes() + 1)) {
      if (!parsed[0].set[d.getMinutes()] || !parsed[1].set[d.getHours()] || !parsed[3].set[d.getMonth() + 1]) { continue; }
      var domOk = parsed[2].set[d.getDate()], dowOk = parsed[4].set[d.getDay()];
      var dayOk = (!parsed[2].any && !parsed[4].any) ? (domOk || dowOk) : (domOk && dowOk);
      if (dayOk) { runs.push(new Date(d.getTime())); }
    }
    return runs;
  }

  function fmt(d) {
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function render(fromFields) {
    FV.clearError(error);
    var expr = fromFields ? fields.map(function (f) { return f.value.trim() || '*'; }).join(' ') : input.value.trim().replace(/\s+/g, ' ');
    if (fromFields) { input.value = expr; }
    var parts = expr.split(' ');
    if (parts.length !== 5) {
      result.hidden = true;
      FV.showError(error, 'Нужно ровно 5 полей: минуты, часы, день месяца, месяц, день недели.');
      return;
    }
    if (!fromFields) { parts.forEach(function (p, i) { fields[i].value = p; }); }
    var parsed;
    try {
      parsed = parts.map(function (p, i) { return parseField(p, i); });
    } catch (e) {
      result.hidden = true;
      FV.showError(error, e.message + '.');
      return;
    }
    var runs = nextRuns(parsed, 5);
    document.getElementById('cron-text').textContent = describe(parts, parsed) + '.';
    document.getElementById('cron-next').innerHTML = runs.length
      ? runs.map(function (d) { return '<li>' + FV.escapeHtml(fmt(d)) + '</li>'; }).join('')
      : '<li>В ближайшие два года запусков нет (например, 31 февраля).</li>';
    result.hidden = false;
  }

  input.addEventListener('input', FV.debounce(function () { render(false); }, 200));
  fields.forEach(function (f) { f.addEventListener('input', FV.debounce(function () { render(true); }, 200)); });
  presetSel.addEventListener('change', function () {
    if (presetSel.value) { input.value = presetSel.value; render(false); }
  });
  document.getElementById('cron-copy').addEventListener('click', function () { FV.copyText(input.value); });
  render(false);
})();
