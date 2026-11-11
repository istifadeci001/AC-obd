(function () {
  var prev = window.DTC_DB, B = window.DTC_BIG || {};
  var LV = { high: 'yüksək', medium: 'orta', low: 'aşağı' };
  function merge(code, p) {
    var b = B[code];
    if (!b) return p;
    var has = !!p && !p.family;
    function pick(own, alt) { return (has && own && own.length) ? own : alt; }
    return {
      en: b.t,
      az: has ? p.az : b.t + ' (İngilis texniki adı; Azərbaycan tərcüməsi yoxdur)',
      desc: b.d, flags: b.f, diff: b.u, src: b.w, rev: b.v, big: true, translated: has, family: false,
      causes: pick(p && p.causes, b.c.map(function (x) { return x[0] + (x[1] ? ' (ehtimal: ' + (LV[x[1]] || x[1]) + ')' : ''); })),
      symptoms: pick(p && p.symptoms, b.s),
      check: (p && p.check) || [],
      sensors: pick(p && p.sensors, b.k.map(function (x) { return String(x).replace(/_/g, ' '); })),
      related: pick(p && p.related, b.r)
    };
  }
  window.DTC_DB = new Proxy(prev, {
    get: function (t, prop) {
      var v = Reflect.get(t, prop);
      if (typeof prop === 'string') {
        var u = prop.toUpperCase();
        if (B[u]) return merge(u, v);
      }
      return v;
    }
  });
  window.DTC_COUNT = Object.keys(B).length || Object.keys(prev).length;
})();
