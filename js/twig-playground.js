(function () {
  'use strict';
  var error = document.getElementById('twig-playground-error');
  var tplEl = document.getElementById('tw-template');
  var dataEl = document.getElementById('tw-data');
  var exEl = document.getElementById('tw-example');
  var result = document.getElementById('tw-result');
  var preview = document.getElementById('tw-preview');
  var htmlOut = document.getElementById('tw-html');
  var warnEl = document.getElementById('tw-warn');
  var lastHtml = '';

  var LIMITS = { out: 1000000, loops: 20000, range: 10000 };
  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };

  function TwigError(msg, line) { this.message = msg; this.line = line || 0; }

  // ---------- Лексер шаблона ----------
  function lexTemplate(src) {
    var toks = [];
    var re = /\{\{-?|\{%-?|\{#/g;
    var pos = 0;
    var line = 1;
    var m;
    function addText(s) { if (s) { toks.push({ t: 'text', v: s, line: line }); line += (s.match(/\n/g) || []).length; } }
    while ((m = re.exec(src)) !== null) {
      addText(src.slice(pos, m.index));
      var open = m[0];
      var closeStr = open.charAt(1) === '{' ? '}}' : (open.charAt(1) === '%' ? '%}' : '#}');
      var end = src.indexOf(closeStr, re.lastIndex);
      if (end < 0) { throw new TwigError('Не закрыт блок ' + open, line); }
      var body = src.slice(re.lastIndex, end);
      var trimL = open.length === 3 && open.charAt(2) === '-';
      var trimR = body.charAt(body.length - 1) === '-';
      if (trimR) { body = body.slice(0, -1); }
      if (trimL && toks.length && toks[toks.length - 1].t === 'text') { toks[toks.length - 1].v = toks[toks.length - 1].v.replace(/\s+$/, ''); }
      if (open.charAt(1) !== '#') {
        toks.push({ t: open.charAt(1) === '{' ? 'var' : 'tag', v: body.trim(), line: line });
      }
      line += (body.match(/\n/g) || []).length;
      pos = end + 2;
      if (trimR) { var ws = /^\s+/.exec(src.slice(pos)); if (ws) { line += (ws[0].match(/\n/g) || []).length; pos += ws[0].length; } }
      re.lastIndex = pos;
    }
    addText(src.slice(pos));
    return toks;
  }

  // ---------- Лексер выражений ----------
  function lexExpr(src, line) {
    var toks = [];
    var re = /\s*(?:(\d+(?:\.\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|(\.\.|==|!=|<=|>=|\/\/|\*\*|\?\?|[-+*\/%~<>=!?:.,|()\[\]{}]))/y;
    var pos = 0;
    src = src.replace(/\s+$/, '');
    while (pos < src.length) {
      re.lastIndex = pos;
      var m = re.exec(src);
      if (!m) { throw new TwigError('Неожиданный символ «' + src.charAt(pos).trim() + src.slice(pos).trim().charAt(0) + '» в выражении', line); }
      pos = re.lastIndex;
      if (m[1] !== undefined) { toks.push({ k: 'num', v: parseFloat(m[1]) }); }
      else if (m[2] !== undefined) { toks.push({ k: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, '$1') }); }
      else if (m[3] !== undefined) { toks.push({ k: 'name', v: m[3] }); }
      else { toks.push({ k: 'op', v: m[4] }); }
    }
    return toks;
  }

  // ---------- Парсер выражений ----------
  function Parser(toks, line) { this.t = toks; this.i = 0; this.line = line; }
  var P = Parser.prototype;
  P.peek = function () { return this.t[this.i]; };
  P.next = function () { return this.t[this.i++]; };
  P.isOp = function (v) { var x = this.peek(); return x && x.k === 'op' && x.v === v; };
  P.isName = function (v) { var x = this.peek(); return x && x.k === 'name' && x.v === v; };
  P.expectOp = function (v) {
    if (!this.isOp(v)) { throw new TwigError('Ожидалось «' + v + '»', this.line); }
    this.i++;
  };
  P.end = function () { return this.i >= this.t.length; };

  P.parseExpr = function () { return this.ternary(); };
  P.ternary = function () {
    var c = this.coalesce();
    if (this.isOp('?')) {
      this.next();
      var a = this.isOp(':') ? null : this.ternary();
      var b = null;
      if (this.isOp(':')) { this.next(); b = this.ternary(); }
      return { n: 'tern', c: c, a: a, b: b };
    }
    return c;
  };
  P.coalesce = function () {
    var l = this.or();
    while (this.isOp('??')) { this.next(); l = { n: 'coal', l: l, r: this.or() }; }
    return l;
  };
  P.or = function () {
    var l = this.and();
    while (this.isName('or')) { this.next(); l = { n: 'or', l: l, r: this.and() }; }
    return l;
  };
  P.and = function () {
    var l = this.not();
    while (this.isName('and')) { this.next(); l = { n: 'and', l: l, r: this.not() }; }
    return l;
  };
  P.not = function () {
    if (this.isName('not')) { this.next(); return { n: 'not', e: this.not() }; }
    return this.compare();
  };
  P.compare = function () {
    var l = this.range();
    for (;;) {
      var x = this.peek();
      if (!x) { return l; }
      var op = null;
      if (x.k === 'op' && /^(==|!=|<=|>=|<|>)$/.test(x.v)) { op = x.v; this.next(); }
      else if (x.k === 'name' && x.v === 'in') { op = 'in'; this.next(); }
      else if (x.k === 'name' && x.v === 'not' && this.t[this.i + 1] && this.t[this.i + 1].v === 'in') { this.i += 2; op = 'notin'; }
      else if (x.k === 'name' && x.v === 'starts' && this.t[this.i + 1] && this.t[this.i + 1].v === 'with') { this.i += 2; op = 'starts'; }
      else if (x.k === 'name' && x.v === 'ends' && this.t[this.i + 1] && this.t[this.i + 1].v === 'with') { this.i += 2; op = 'ends'; }
      else if (x.k === 'name' && x.v === 'is') {
        this.next();
        var neg = false;
        if (this.isName('not')) { this.next(); neg = true; }
        var tn = this.next();
        if (!tn || tn.k !== 'name') { throw new TwigError('После «is» ожидался тест', this.line); }
        var name = tn.v;
        if (name === 'divisible' && this.peek() && this.peek().v === 'by') { this.next(); name = 'divisibleby'; }
        var arg = null;
        if (this.isOp('(')) { this.next(); arg = this.parseExpr(); this.expectOp(')'); }
        l = { n: 'test', e: l, name: name, arg: arg, neg: neg };
        continue;
      } else { return l; }
      l = { n: 'cmp', op: op, l: l, r: this.range() };
    }
  };
  P.range = function () {
    var l = this.add();
    if (this.isOp('..')) { this.next(); l = { n: 'range', l: l, r: this.add() }; }
    return l;
  };
  P.add = function () {
    var l = this.mul();
    while (this.isOp('+') || this.isOp('-') || this.isOp('~')) { var op = this.next().v; l = { n: 'bin', op: op, l: l, r: this.mul() }; }
    return l;
  };
  P.mul = function () {
    var l = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%') || this.isOp('**')) { var op = this.next().v; l = { n: 'bin', op: op, l: l, r: this.unary() }; }
    return l;
  };
  P.unary = function () {
    if (this.isOp('-')) { this.next(); return { n: 'neg', e: this.unary() }; }
    if (this.isOp('+')) { this.next(); return this.unary(); }
    return this.filterExpr();
  };
  P.filterExpr = function () {
    var e = this.postfix();
    while (this.isOp('|')) {
      this.next();
      var nt = this.next();
      if (!nt || nt.k !== 'name') { throw new TwigError('После «|» ожидалось имя фильтра', this.line); }
      var args = [];
      if (this.isOp('(')) { args = this.args(); }
      e = { n: 'filter', e: e, name: nt.v, args: args };
    }
    return e;
  };
  P.args = function () {
    var args = [];
    this.expectOp('(');
    while (!this.isOp(')')) {
      args.push(this.parseExpr());
      if (this.isOp(',')) { this.next(); } else { break; }
    }
    this.expectOp(')');
    return args;
  };
  P.postfix = function () {
    var e = this.primary();
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        var nt = this.next();
        if (!nt || (nt.k !== 'name' && nt.k !== 'num')) { throw new TwigError('После «.» ожидалось имя свойства', this.line); }
        e = { n: 'attr', e: e, key: { n: 'lit', v: nt.v } };
        if (this.isOp('(')) { throw new TwigError('Вызов методов не поддерживается: ' + nt.v + '()', this.line); }
      } else if (this.isOp('[')) {
        this.next();
        var k = this.parseExpr();
        this.expectOp(']');
        e = { n: 'attr', e: e, key: k };
      } else { return e; }
    }
  };
  P.primary = function () {
    var x = this.next();
    if (!x) { throw new TwigError('Неожиданный конец выражения', this.line); }
    if (x.k === 'num' || x.k === 'str') { return { n: 'lit', v: x.v }; }
    if (x.k === 'name') {
      if (x.v === 'true' || x.v === 'TRUE') { return { n: 'lit', v: true }; }
      if (x.v === 'false' || x.v === 'FALSE') { return { n: 'lit', v: false }; }
      if (x.v === 'null' || x.v === 'none' || x.v === 'NULL') { return { n: 'lit', v: null }; }
      if (this.isOp('(')) { return { n: 'call', name: x.v, args: this.args() }; }
      return { n: 'var', name: x.v };
    }
    if (x.v === '(') { var e = this.parseExpr(); this.expectOp(')'); return e; }
    if (x.v === '[') {
      var items = [];
      while (!this.isOp(']')) { items.push(this.parseExpr()); if (this.isOp(',')) { this.next(); } else { break; } }
      this.expectOp(']');
      return { n: 'arr', items: items };
    }
    if (x.v === '{') {
      var pairs = [];
      while (!this.isOp('}')) {
        var kt = this.next();
        var key;
        if (kt && (kt.k === 'str' || kt.k === 'num' || kt.k === 'name')) { key = { n: 'lit', v: kt.v }; } else { throw new TwigError('Некорректный ключ объекта', this.line); }
        this.expectOp(':');
        pairs.push([key, this.parseExpr()]);
        if (this.isOp(',')) { this.next(); } else { break; }
      }
      this.expectOp('}');
      return { n: 'obj', pairs: pairs };
    }
    throw new TwigError('Неожиданный токен «' + x.v + '»', this.line);
  };

  function parseExprString(src, line) {
    var p = new Parser(lexExpr(src, line), line);
    var e = p.parseExpr();
    if (!p.end()) { throw new TwigError('Лишний токен «' + p.peek().v + '» в выражении', line); }
    return e;
  }

  // ---------- Парсер шаблона ----------
  var UNSUPPORTED = { extends: 1, include: 1, block: 1, endblock: 1, macro: 1, endmacro: 1, import: 1, from: 1, embed: 1, endembed: 1, use: 1, apply: 1, endapply: 1, filter: 1, endfilter: 1, autoescape: 1, endautoescape: 1, spaceless: 1, endspaceless: 1, verbatim: 1, endverbatim: 1, with: 1, endwith: 1, sandbox: 1, endsandbox: 1, flush: 1, deprecated: 1, do: 1 };

  function parseTemplate(src) {
    var toks = lexTemplate(src);
    var root = [];
    var stack = [{ kind: 'root', body: root }];
    function top() { return stack[stack.length - 1]; }
    toks.forEach(function (t) {
      if (t.t === 'text') { top().body.push({ n: 'text', v: t.v }); return; }
      if (t.t === 'var') {
        if (!t.v) { throw new TwigError('Пустое выражение {{ }}', t.line); }
        top().body.push({ n: 'print', e: parseExprString(t.v, t.line), line: t.line });
        return;
      }
      var m = /^([a-z]+)\s*([\s\S]*)$/.exec(t.v);
      if (!m) { throw new TwigError('Пустой или некорректный тег {% %}', t.line); }
      var name = m[1];
      var rest = m[2];
      if (UNSUPPORTED[name]) { throw new TwigError('Тег «' + name + '» не поддерживается в песочнице', t.line); }
      if (name === 'if') {
        var node = { n: 'if', branches: [{ cond: parseExprString(rest, t.line), body: [] }], other: null };
        top().body.push(node);
        stack.push({ kind: 'if', node: node, body: node.branches[0].body, line: t.line });
      } else if (name === 'elseif' || name === 'else') {
        var f = top();
        if (f.kind === 'if') {
          if (name === 'elseif') {
            var br = { cond: parseExprString(rest, t.line), body: [] };
            f.node.branches.push(br);
            f.body = br.body;
          } else { f.node.other = []; f.body = f.node.other; }
        } else if (f.kind === 'for' && name === 'else') { f.node.other = []; f.body = f.node.other; }
        else { throw new TwigError('Тег «' + name + '» вне if/for', t.line); }
      } else if (name === 'endif' || name === 'endfor') {
        var kind = name.slice(3);
        if (top().kind !== kind) { throw new TwigError('Неожиданный {% ' + name + ' %}', t.line); }
        stack.pop();
      } else if (name === 'for') {
        var fm = /^([A-Za-z_]\w*)(?:\s*,\s*([A-Za-z_]\w*))?\s+in\s+([\s\S]+)$/.exec(rest);
        if (!fm) { throw new TwigError('Синтаксис: {% for item in items %}', t.line); }
        var fn = { n: 'for', key: fm[2] ? fm[1] : null, val: fm[2] || fm[1], e: parseExprString(fm[3], t.line), body: [], other: null };
        top().body.push(fn);
        stack.push({ kind: 'for', node: fn, body: fn.body, line: t.line });
      } else if (name === 'set') {
        var sm = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(rest);
        if (!sm) { throw new TwigError('Синтаксис: {% set имя = выражение %}', t.line); }
        top().body.push({ n: 'set', name: sm[1], e: parseExprString(sm[2], t.line) });
      } else {
        throw new TwigError('Неизвестный тег «' + name + '»', t.line);
      }
    });
    if (stack.length > 1) { throw new TwigError('Не закрыт {% ' + top().kind + ' %}', top().line); }
    return root;
  }

  // ---------- Вычисление ----------
  function isArr(v) { return Array.isArray(v); }
  function isObj(v) { return v !== null && typeof v === 'object' && !isArr(v); }
  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') { return false; }
    if (isArr(v)) { return v.length > 0; }
    if (isObj(v)) { return Object.keys(v).length > 0; }
    return true;
  }
  function str(v) {
    if (v === null || v === undefined || v === false) { return ''; }
    if (v === true) { return '1'; }
    if (isArr(v) || isObj(v)) { return 'Array'; }
    return String(v);
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function Safe(s) { this.s = s; }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function phpDate(fmt, v) {
    var d = v === 'now' || v === undefined || v === null || v === '' ? new Date() : (typeof v === 'number' ? new Date(v * 1000) : new Date(v));
    if (isNaN(d.getTime())) { return ''; }
    var map = { Y: d.getFullYear(), y: pad2(d.getFullYear() % 100), m: pad2(d.getMonth() + 1), n: d.getMonth() + 1, d: pad2(d.getDate()), j: d.getDate(), H: pad2(d.getHours()), i: pad2(d.getMinutes()), s: pad2(d.getSeconds()) };
    return String(fmt).replace(/[A-Za-z]/g, function (c) { return Object.prototype.hasOwnProperty.call(map, c) ? map[c] : c; });
  }

  var FILTERS = {
    upper: function (v) { return str(v).toUpperCase(); },
    lower: function (v) { return str(v).toLowerCase(); },
    capitalize: function (v) { v = str(v); return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); },
    title: function (v) { return str(v).toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); },
    trim: function (v) { return str(v).trim(); },
    length: function (v) { return isArr(v) ? v.length : (isObj(v) ? Object.keys(v).length : str(v).length); },
    reverse: function (v) { return isArr(v) ? v.slice().reverse() : str(v).split('').reverse().join(''); },
    join: function (v, sep) { return (isArr(v) ? v : (isObj(v) ? Object.keys(v).map(function (k) { return v[k]; }) : [])).map(str).join(sep === undefined ? '' : str(sep)); },
    split: function (v, sep) { return str(v).split(str(sep)); },
    first: function (v) { return isArr(v) ? v[0] : str(v).charAt(0); },
    last: function (v) { return isArr(v) ? v[v.length - 1] : str(v).slice(-1); },
    keys: function (v) { return isArr(v) ? v.map(function (x, i) { return i; }) : (isObj(v) ? Object.keys(v) : []); },
    abs: function (v) { return Math.abs(num(v)); },
    round: function (v, p) { var k = Math.pow(10, p || 0); return Math.round(num(v) * k) / k; },
    default: function (v, d) { return (v === undefined || v === null || v === '' || v === false || (isArr(v) && !v.length)) ? (d === undefined ? '' : d) : v; },
    replace: function (v, map) { var s = str(v); if (isObj(map)) { Object.keys(map).forEach(function (k) { s = s.split(k).join(str(map[k])); }); } return s; },
    nl2br: function (v) { return new Safe(escHtml(str(v)).replace(/\r?\n/g, '<br>')); },
    striptags: function (v) { return str(v).replace(/<[^>]*>/g, ''); },
    escape: function (v) { return v instanceof Safe ? v : new Safe(escHtml(str(v))); },
    raw: function (v) { return new Safe(v instanceof Safe ? v.s : str(v)); },
    number_format: function (v, dec, dp, ts) {
      dec = dec === undefined ? 0 : num(dec); dp = dp === undefined ? '.' : str(dp); ts = ts === undefined ? ',' : str(ts);
      var p = num(v).toFixed(dec).split('.');
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ts);
      return p.join(dec ? dp : '');
    },
    date: function (v, f) { return phpDate(f === undefined ? 'Y-m-d H:i' : f, v); },
    slice: function (v, a, b) { var s = isArr(v) ? v : str(v); return b === undefined ? s.slice(a) : s.slice(a, a + b); },
    sort: function (v) { return isArr(v) ? v.slice().sort() : v; },
    json_encode: function (v) { return JSON.stringify(v); },
    url_encode: function (v) { return encodeURIComponent(str(v)); },
    lines: function (v) { return str(v).split(/\r?\n/); },
    e: null
  };
  FILTERS.e = FILTERS.escape;

  var TESTS = {
    defined: function (v) { return v !== undefined; },
    null: function (v) { return v === null || v === undefined; },
    none: function (v) { return v === null || v === undefined; },
    empty: function (v) { return !truthy(v); },
    even: function (v) { return num(v) % 2 === 0; },
    odd: function (v) { return Math.abs(num(v)) % 2 === 1; },
    iterable: function (v) { return isArr(v) || isObj(v); },
    divisibleby: function (v, a) { return num(a) !== 0 && num(v) % num(a) === 0; },
    same: function (v, a) { return v === a; }
  };

  function looseEq(a, b) {
    if (isArr(a) || isObj(a) || isArr(b) || isObj(b)) { return JSON.stringify(a) === JSON.stringify(b); }
    if (a === null || a === undefined) { return b === null || b === undefined || b === '' || b === false; }
    if (typeof a === 'number' || typeof b === 'number') { return num(a) === num(b) && str(a) !== '' && str(b) !== ''; }
    return str(a) === str(b);
  }

  function Ctx(data, limits) {
    this.scopes = [data];
    this.out = '';
    this.loops = 0;
    this.warnings = [];
    this.unknown = {};
  }

  function lookup(ctx, name) {
    for (var i = ctx.scopes.length - 1; i >= 0; i--) {
      var s = ctx.scopes[i];
      if (Object.prototype.hasOwnProperty.call(s, name)) { return s[name]; }
    }
    if (!ctx.unknown[name]) { ctx.unknown[name] = 1; ctx.warnings.push('Переменная «' + name + '» не определена (выводится пустой текст)'); }
    return undefined;
  }

  function ev(n, ctx) {
    switch (n.n) {
      case 'lit': return n.v;
      case 'var': return lookup(ctx, n.name);
      case 'arr': return n.items.map(function (x) { return ev(x, ctx); });
      case 'obj': { var o = {}; n.pairs.forEach(function (p) { var k = str(ev(p[0], ctx)); if (!BAD_KEYS[k]) { o[k] = ev(p[1], ctx); } }); return o; }
      case 'attr': {
        var base = ev(n.e, ctx);
        var key = ev(n.key, ctx);
        if (base === null || base === undefined) { return undefined; }
        key = typeof key === 'number' ? key : str(key);
        if (BAD_KEYS[key]) { return undefined; }
        if (isArr(base)) { return typeof key === 'number' || /^\d+$/.test(key) ? base[+key] : undefined; }
        if (isObj(base)) { return Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined; }
        return undefined;
      }
      case 'tern': { var c = ev(n.c, ctx); return truthy(c) ? (n.a ? ev(n.a, ctx) : c) : (n.b ? ev(n.b, ctx) : ''); }
      case 'coal': { var l = ev(n.l, ctx); return l === undefined || l === null ? ev(n.r, ctx) : l; }
      case 'or': return truthy(ev(n.l, ctx)) || truthy(ev(n.r, ctx));
      case 'and': return truthy(ev(n.l, ctx)) && truthy(ev(n.r, ctx));
      case 'not': return !truthy(ev(n.e, ctx));
      case 'neg': return -num(ev(n.e, ctx));
      case 'cmp': {
        var a = ev(n.l, ctx);
        var b = ev(n.r, ctx);
        switch (n.op) {
          case '==': return looseEq(a, b);
          case '!=': return !looseEq(a, b);
          case '<': return a < b;
          case '>': return a > b;
          case '<=': return a <= b;
          case '>=': return a >= b;
          case 'in': return contains(b, a);
          case 'notin': return !contains(b, a);
          case 'starts': return str(a).indexOf(str(b)) === 0;
          case 'ends': { var sa = str(a); var sb = str(b); return sa.length >= sb.length && sa.slice(sa.length - sb.length) === sb; }
        }
        return false;
      }
      case 'range': {
        var from = Math.floor(num(ev(n.l, ctx)));
        var to = Math.floor(num(ev(n.r, ctx)));
        if (Math.abs(to - from) > LIMITS.range) { throw new TwigError('Диапазон слишком большой (максимум ' + LIMITS.range + ')', 0); }
        var r = [];
        var step = from <= to ? 1 : -1;
        for (var i = from; step > 0 ? i <= to : i >= to; i += step) { r.push(i); }
        return r;
      }
      case 'bin': {
        var x = ev(n.l, ctx);
        var y = ev(n.r, ctx);
        switch (n.op) {
          case '+': return num(x) + num(y);
          case '-': return num(x) - num(y);
          case '*': return num(x) * num(y);
          case '/': return num(y) === 0 ? 0 : num(x) / num(y);
          case '//': return num(y) === 0 ? 0 : Math.floor(num(x) / num(y));
          case '%': return num(y) === 0 ? 0 : num(x) % num(y);
          case '**': return Math.pow(num(x), Math.min(num(y), 100));
          case '~': return str(x) + str(y);
        }
        return null;
      }
      case 'test': {
        var tv;
        if (n.name === 'defined' && (n.e.n === 'var' || n.e.n === 'attr')) {
          var saveW = ctx.warnings.length;
          tv = ev(n.e, ctx);
          ctx.warnings.length = saveW;
          if (n.e.n === 'var') { delete ctx.unknown[n.e.name]; }
        } else { tv = ev(n.e, ctx); }
        var tf = TESTS[n.name];
        if (!tf) { throw new TwigError('Неизвестный тест «' + n.name + '»', 0); }
        var res = !!tf(tv, n.arg ? ev(n.arg, ctx) : undefined);
        return n.neg ? !res : res;
      }
      case 'filter': {
        var f = FILTERS[n.name];
        if (!f || !Object.prototype.hasOwnProperty.call(FILTERS, n.name)) { throw new TwigError('Неизвестный фильтр «' + n.name + '»', 0); }
        var v = ev(n.e, ctx);
        var args = n.args.map(function (a2) { return ev(a2, ctx); });
        return f.apply(null, [v].concat(args));
      }
      case 'call': {
        var av = n.args.map(function (a3) { return ev(a3, ctx); });
        if (n.name === 'range') {
          return ev({ n: 'range', l: { n: 'lit', v: av[0] }, r: { n: 'lit', v: av[1] } }, ctx);
        }
        if (n.name === 'max') { return Math.max.apply(null, isArr(av[0]) ? av[0] : av); }
        if (n.name === 'min') { return Math.min.apply(null, isArr(av[0]) ? av[0] : av); }
        if (n.name === 'date') { return phpDate('Y-m-d H:i', av[0]); }
        throw new TwigError('Функция «' + n.name + '» не поддерживается', 0);
      }
    }
    throw new TwigError('Внутренняя ошибка выражения', 0);
  }

  function contains(h, needle) {
    if (isArr(h)) { return h.some(function (x) { return looseEq(x, needle); }); }
    if (isObj(h)) { return Object.keys(h).some(function (k) { return looseEq(h[k], needle); }); }
    return str(h).indexOf(str(needle)) >= 0;
  }

  function emit(ctx, s) {
    ctx.out += s;
    if (ctx.out.length > LIMITS.out) { throw new TwigError('Результат превысил лимит ' + LIMITS.out + ' символов', 0); }
  }

  function run(body, ctx) {
    body.forEach(function (n) {
      switch (n.n) {
        case 'text': emit(ctx, n.v); break;
        case 'print': {
          var v;
          try { v = ev(n.e, ctx); } catch (e) { if (e instanceof TwigError && !e.line) { e.line = n.line; } throw e; }
          emit(ctx, v instanceof Safe ? v.s : escHtml(str(v)));
          break;
        }
        case 'set': ctx.scopes[ctx.scopes.length - 1][n.name] = ev(n.e, ctx); break;
        case 'if': {
          var done = false;
          for (var i = 0; i < n.branches.length; i++) {
            if (truthy(ev(n.branches[i].cond, ctx))) { run(n.branches[i].body, ctx); done = true; break; }
          }
          if (!done && n.other) { run(n.other, ctx); }
          break;
        }
        case 'for': {
          var coll = ev(n.e, ctx);
          var keys = isArr(coll) ? coll.map(function (x, i) { return i; }) : (isObj(coll) ? Object.keys(coll) : []);
          if (!keys.length) { if (n.other) { run(n.other, ctx); } break; }
          var scope = {};
          ctx.scopes.push(scope);
          keys.forEach(function (k, idx) {
            if (++ctx.loops > LIMITS.loops) { throw new TwigError('Слишком много итераций цикла (максимум ' + LIMITS.loops + ')', 0); }
            scope[n.val] = coll[k];
            if (n.key) { scope[n.key] = k; }
            scope.loop = { index: idx + 1, index0: idx, first: idx === 0, last: idx === keys.length - 1, length: keys.length, revindex: keys.length - idx, revindex0: keys.length - idx - 1 };
            run(n.body, ctx);
          });
          ctx.scopes.pop();
          break;
        }
      }
    });
  }

  function render(tpl, data) {
    var ast = parseTemplate(tpl);
    var ctx = new Ctx(data);
    run(ast, ctx);
    return { html: ctx.out, warnings: ctx.warnings };
  }

  // ---------- Интерфейс ----------
  var EXAMPLES = [
    { name: 'Переменные и фильтры', tpl: '<h2>{{ title|upper }}</h2>\n<p>Автор: {{ author.name|default("аноним") }}</p>\n<p>Дата: {{ ts|date("d.m.Y") }}</p>\n<p>Цена: {{ price|number_format(2, ",", " ") }} ₽</p>\n<p>Экранирование: {{ html }} / {{ html|raw }}</p>', data: { title: 'Новости сайта', author: { name: 'Иван' }, ts: 1700000000, price: 12345.678, html: '<b>жирный</b>' } },
    { name: 'Цикл for', tpl: '<ul>\n{% for n in news %}\n  <li class="{{ loop.first ? \'first\' : \'\' }}">{{ loop.index }}. {{ n.title }} ({{ n.views }})</li>\n{% else %}\n  <li>Новостей нет</li>\n{% endfor %}\n</ul>', data: { news: [{ title: 'Первая', views: 10 }, { title: 'Вторая', views: 25 }, { title: 'Третья', views: 3 }] } },
    { name: 'Условия if', tpl: '{% if user.admin %}\n  <b>Администратор</b>\n{% elseif user.name is defined %}\n  Привет, {{ user.name }}!\n{% else %}\n  Гость\n{% endif %}', data: { user: { name: 'Мария', admin: false } } },
    { name: 'set и выражения', tpl: '{% set total = items|length %}\n{% set names = items|join(", ") %}\n<p>Всего: {{ total }} — {{ names }}</p>\n<p>{{ total > 2 and "много" or "мало" }}; {{ (1..5)|join("-") }}</p>', data: { items: ['яблоко', 'груша', 'слива'] } }
  ];
  EXAMPLES.forEach(function (e, i) {
    var o = document.createElement('option');
    o.value = i;
    o.textContent = e.name;
    exEl.appendChild(o);
  });

  function load(i) {
    tplEl.value = EXAMPLES[i].tpl;
    dataEl.value = JSON.stringify(EXAMPLES[i].data, null, 2);
    go();
  }

  function go() {
    FV.clearError(error);
    warnEl.innerHTML = '';
    var data;
    try { data = dataEl.value.trim() ? JSON.parse(dataEl.value) : {}; } catch (e) { FV.showError(error, 'Данные: некорректный JSON — ' + e.message); result.hidden = true; return; }
    if (!isObj(data)) { FV.showError(error, 'Данные должны быть JSON-объектом.'); result.hidden = true; return; }
    if (tplEl.value.length > 200000) { FV.showError(error, 'Шаблон длиннее 200 000 символов.'); return; }
    try {
      var r = render(tplEl.value, data);
      lastHtml = r.html;
      preview.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;margin:8px">' + r.html;
      htmlOut.textContent = r.html;
      r.warnings.forEach(function (w) { var li = document.createElement('li'); li.className = 'sev-warn'; li.textContent = w; warnEl.appendChild(li); });
      result.hidden = false;
    } catch (e) {
      if (e instanceof TwigError) {
        FV.showError(error, (e.line ? 'Строка ' + e.line + ': ' : '') + e.message);
      } else { FV.showError(error, 'Ошибка выполнения: ' + e.message); }
      result.hidden = true;
    }
  }

  exEl.addEventListener('change', function () { load(+exEl.value); });
  tplEl.addEventListener('input', FV.debounce(go, 300));
  dataEl.addEventListener('input', FV.debounce(go, 300));
  document.getElementById('tw-run').addEventListener('click', go);
  document.getElementById('tw-copy').addEventListener('click', function () { FV.copyText(lastHtml); });
  load(0);
})();
