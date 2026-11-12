(function () {
  var prev = window.DTC_DB, B = window.DTC_BIG || {};
  var LV = { az: { high: 'yüksək', medium: 'orta', low: 'aşağı' }, ru: { high: 'высокая', medium: 'средняя', low: 'низкая' }, en: { high: 'high', medium: 'medium', low: 'low' } };
  var PR = { az: 'ehtimal', ru: 'вероятность', en: 'likelihood' };
  function merge(code, p) {
    var b = B[code];
    if (!b) return p;
    var lg = window.DTCLang ? DTCLang.get() : 'az';
    var tr = window.DTCLang ? DTCLang.tr() : null, x = tr && tr[code];
    var has = !!p && !p.family, own = has && lg === 'az';
    function lk(l) { return l ? ' (' + PR[lg] + ': ' + ((LV[lg] || LV.en)[l] || l) + ')' : ''; }
    var causesEn = b.c.map(function (y) { return y[0] + lk(y[1]); });
    var causesTr = x && x.c && x.c.length === b.c.length ? x.c.map(function (t, i) { return t + lk(b.c[i][1]); }) : null;
    return {
      en: b.t,
      az: own ? p.az : (x ? x.t : (lg === 'az' ? b.t + ' (İngilis texniki adı; Azərbaycan tərcüməsi yoxdur)' : b.t)),
      desc: x ? x.d : b.d,
      flags: b.f, diff: b.u, src: b.w, rev: b.v, big: true, translated: !!x, own: has, family: false,
      causes: (own && p.causes && p.causes.length) ? p.causes : (causesTr || causesEn),
      symptoms: (own && p.symptoms && p.symptoms.length) ? p.symptoms : (x && x.s && x.s.length === b.s.length ? x.s : b.s),
      check: (p && p.check) || [],
      sensors: (own && p.sensors && p.sensors.length) ? p.sensors : b.k.map(function (r) { return String(r).replace(/_/g, ' '); }),
      related: (own && p.related && p.related.length) ? p.related : b.r
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
