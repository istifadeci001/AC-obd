window.Formula = (function () {
  function parse(src) {
    var s = String(src).replace(/\s+/g, ''), i = 0;
    if (!s || s.length > 120) throw new Error('Düstur boşdur və ya çox uzundur');
    function peek() { return s[i]; }
    function num() {
      var m = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (!m) throw new Error('Rəqəm gözlənilirdi (simvol ' + (i + 1) + ')');
      i += m[0].length;
      return { t: 'n', v: parseFloat(m[0]) };
    }
    function prim() {
      var c = peek();
      if (c === '(') {
        i++;
        var e = expr();
        if (peek() !== ')') throw new Error('Mötərizə bağlanmayıb');
        i++;
        return e;
      }
      if (c === '-') { i++; return { t: 'u', a: prim() }; }
      if (c && /[A-H]/i.test(c)) { i++; return { t: 'b', k: c.toUpperCase().charCodeAt(0) - 65 }; }
      return num();
    }
    function term() {
      var l = prim();
      while (peek() === '*' || peek() === '/') { var o = s[i++]; l = { t: 'o', o: o, l: l, r: prim() }; }
      return l;
    }
    function expr() {
      var l = term();
      while (peek() === '+' || peek() === '-') { var o = s[i++]; l = { t: 'o', o: o, l: l, r: term() }; }
      return l;
    }
    var tree = expr();
    if (i < s.length) throw new Error('Gözlənilməz simvol: ' + s[i]);
    return tree;
  }
  function run(n, b) {
    if (n.t === 'n') return n.v;
    if (n.t === 'b') {
      if (n.k >= b.length) throw new Error('Bayt ' + String.fromCharCode(65 + n.k) + ' cavabda yoxdur');
      return b[n.k];
    }
    if (n.t === 'u') return -run(n.a, b);
    var l = run(n.l, b), r = run(n.r, b);
    if (n.o === '+') return l + r;
    if (n.o === '-') return l - r;
    if (n.o === '*') return l * r;
    if (r === 0) throw new Error('Sıfıra bölmə');
    return l / r;
  }
  return { compile: function (src) { var t = parse(src); return function (b) { return run(t, b); }; } };
})();
