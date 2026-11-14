window.LocalTime = (function () {
  function p(n) { return ('0' + n).slice(-2); }
  function full(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function time(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  return { full: full, time: time };
})();

window.Log = (function () {
  var lines = [], subs = [];
  function add(kind, msg) {
    var d = new Date();
    var ts = d.toTimeString().slice(0, 8) + '.' + ('00' + d.getMilliseconds()).slice(-3);
    lines.push(ts + ' ' + kind + ' ' + msg);
    if (lines.length > 400) lines.shift();
    subs.forEach(function (f) { try { f(); } catch (e) {} });
  }
  // paylaşmaq üçün: VIN sorğusunun (09 02) cavabı jurnaldan çıxarılır
  function safe(n) {
    var out = [], skip = false;
    lines.forEach(function (l) {
      if (/ TX /.test(l)) {
        skip = / TX 09 ?02\b/.test(l);
        if (skip) { out.push(l + '  (cavab VIN olduğu üçün gizlədildi)'); return; }
      } else if (skip && / RX /.test(l)) return;
      out.push(l);
    });
    return n ? out.slice(-n) : out;
  }
  return {
    safe: safe,
    safeText: function (n) { return safe(n).join('\n'); },
    add: add,
    all: function () { return lines.slice(); },
    text: function () { return lines.join('\n'); },
    on: function (f) { subs.push(f); },
    clear: function () { lines = []; subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  };
})();
