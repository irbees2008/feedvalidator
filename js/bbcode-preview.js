(function () {
  'use strict';
  var error = document.getElementById('bbcode-preview-error');
  var input = document.getElementById('bb-input');
  var profileEl = document.getElementById('bb-profile');
  var output = document.getElementById('bb-output');
  var htmlEl = document.getElementById('bb-html');
  var warnEl = document.getElementById('bb-warn');

  var ALIGN = { left: 'left', center: 'center', right: 'right', justify: 'justify' };

  function esc(s) { return FV.escapeHtml(s); }

  function safeUrl(u) {
    u = String(u).trim();
    if (/^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(u) && !/^\/\//.test(u)) { return u; }
    return null;
  }

  function safeColor(c) {
    c = String(c).trim();
    return /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c) ? c : null;
  }

  // Определения тегов: open(arg, ctx) / close; raw — содержимое не разбирается.
  function tagDefs(profile) {
    var d = {
      b: { open: function () { return '<strong>'; }, close: '</strong>' },
      i: { open: function () { return '<em>'; }, close: '</em>' },
      u: { open: function () { return '<span style="text-decoration:underline">'; }, close: '</span>' },
      s: { open: function () { return '<del>'; }, close: '</del>' },
      url: {
        open: function (arg, inner) {
          var u = safeUrl(arg || inner);
          return u ? '<a href="' + esc(u) + '" rel="nofollow noopener" target="_blank">' : '<a>';
        },
        close: '</a>', needInner: true
      },
      email: {
        open: function (arg, inner) {
          var m = String(arg || inner).trim();
          return /^[^\s@<>"']+@[^\s@<>"']+$/.test(m) ? '<a href="mailto:' + esc(m) + '">' : '<a>';
        },
        close: '</a>', needInner: true
      },
      img: { raw: true, render: function (arg, inner) {
        var u = safeUrl(inner);
        return u ? '<img src="' + esc(u) + '" alt="" style="max-width:100%">' : esc('[img]' + inner + '[/img]');
      } },
      code: { raw: true, render: function (arg, inner) { return '<pre class="fv-bb-code"><code>' + esc(inner.replace(/^\r?\n/, '')) + '</code></pre>'; } },
      quote: {
        open: function (arg) {
          return '<blockquote class="fv-bb-quote">' + (arg ? '<div class="fv-bb-qhead">' + esc(arg) + ' пишет:</div>' : '');
        },
        close: '</blockquote>'
      },
      color: {
        open: function (arg) {
          var c = safeColor(arg || '');
          return c ? '<span style="color:' + esc(c) + '">' : '<span>';
        },
        close: '</span>'
      },
      size: {
        open: function (arg) {
          var n = parseInt(arg, 10);
          if (!(n >= 1 && n <= 7)) { return '<span>'; }
          return '<span style="font-size:' + [0.7, 0.85, 1, 1.2, 1.5, 1.9, 2.4][n - 1] + 'em">';
        },
        close: '</span>'
      },
      list: {
        open: function (arg) { return arg ? '<ol' + (/^[aA]$/.test(arg) ? ' type="' + arg + '"' : '') + '>' : '<ul>'; },
        close: function (arg) { return arg ? '</ol>' : '</ul>'; },
        list: true
      }
    };
    if (profile === 'ngcms') {
      d.spoiler = {
        open: function (arg) { return '<details class="fv-bb-spoiler"><summary>' + esc(arg || 'Спойлер') + '</summary>'; },
        close: '</details>'
      };
      d.hide = { open: function () { return '<div class="fv-bb-hide"><em>Скрытый текст (виден авторизованным):</em> '; }, close: '</div>' };
      d.acronym = {
        open: function (arg) { return '<abbr title="' + esc(arg || '') + '">'; },
        close: '</abbr>'
      };
      Object.keys(ALIGN).forEach(function (k) {
        d[k] = { open: function () { return '<div style="text-align:' + ALIGN[k] + '">'; }, close: '</div>' };
      });
    }
    return d;
  }

  function render(src, profile) {
    var defs = tagDefs(profile);
    var warnings = [];
    var re = /\[(\/)?([a-z*]+)(?:=([^\]]*))?\]/gi;
    var out = '';
    var stack = [];
    var pos = 0;
    var m;

    function text(s) { return esc(s).replace(/\r?\n/g, '<br>'); }

    while ((m = re.exec(src)) !== null) {
      var closing = !!m[1];
      var name = m[2].toLowerCase();
      var arg = m[3];
      var def = defs[name];

      if (name === '*' && !closing) {
        out += text(src.slice(pos, m.index));
        pos = re.lastIndex;
        var top = stack[stack.length - 1];
        if (top && top.name === 'list') {
          if (top.item) { out += '</li>'; }
          out += '<li>';
          top.item = true;
        } else {
          warnings.push('[*] вне [list] (позиция ' + m.index + ')');
          out += text(m[0]);
        }
        continue;
      }
      if (!def) { continue; }

      out += text(src.slice(pos, m.index));
      pos = re.lastIndex;

      if (!closing && def.raw) {
        var endRe = new RegExp('\\[/' + name + '\\]', 'i');
        var rest = src.slice(pos);
        var em = endRe.exec(rest);
        var inner = em ? rest.slice(0, em.index) : rest;
        if (!em) { warnings.push('Не закрыт тег [' + name + ']'); }
        out += def.render(arg, inner);
        pos += inner.length + (em ? em[0].length : 0);
        re.lastIndex = pos;
        continue;
      }

      if (!closing) {
        var inner2 = '';
        if (def.needInner) {
          var e2 = new RegExp('\\[/' + name + '\\]', 'i').exec(src.slice(pos));
          inner2 = e2 ? src.slice(pos, pos + e2.index).replace(/\[[^\]]*\]/g, '') : '';
        }
        out += def.open(arg, inner2);
        stack.push({ name: name, def: def, arg: arg, item: false });
      } else {
        var idx = -1;
        for (var i = stack.length - 1; i >= 0; i--) { if (stack[i].name === name) { idx = i; break; } }
        if (idx < 0) {
          warnings.push('Лишний закрывающий тег [/' + name + '] (позиция ' + m.index + ')');
          out += text(m[0]);
          continue;
        }
        while (stack.length - 1 > idx) { warnings.push('Тег [' + stack[stack.length - 1].name + '] закрыт автоматически'); out += closeTag(stack.pop()); }
        out += closeTag(stack.pop());
      }
    }
    out += text(src.slice(pos));
    while (stack.length) { warnings.push('Не закрыт тег [' + stack[stack.length - 1].name + ']'); out += closeTag(stack.pop()); }
    out = out.replace(/(<(?:ul|ol)[^>]*>)(?:<br>)+/g, '$1').replace(/(?:<br>)+(<\/li>)/g, '$1').replace(/(<\/li>)(?:<br>)+(?=<li>|<\/(?:ul|ol)>)/g, '$1');
    return { html: out, warnings: warnings };
  }

  function closeTag(t) {
    var c = typeof t.def.close === 'function' ? t.def.close(t.arg) : t.def.close;
    return (t.item ? '</li>' : '') + c;
  }

  function update() {
    FV.clearError(error);
    if (input.value.length > 200000) { FV.showError(error, 'Текст длиннее 200 000 символов.'); return; }
    var r = render(input.value, profileEl.value);
    output.innerHTML = r.html;
    htmlEl.value = r.html;
    warnEl.textContent = r.warnings.length ? 'Предупреждения: ' + r.warnings.slice(0, 10).join('; ') : '';
  }

  input.addEventListener('input', FV.debounce(update, 150));
  profileEl.addEventListener('change', update);
  document.getElementById('bb-copy').addEventListener('click', function () { FV.copyText(htmlEl.value); });
  document.getElementById('bb-clear').addEventListener('click', function () { input.value = ''; update(); });
  update();
})();
