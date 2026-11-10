(function () {
  var base = AIRules.analyze;
  function lvl(s) { return s >= 4 ? 'Yüksək' : (s >= 2 ? 'Orta' : 'Aşağı'); }
  AIRules.analyze = function (V, dtc) {
    var A = base(V, dtc);
    try {
      V = V || {};
      var h = function (id) { return V[id] && V[id].hist ? V[id].hist : []; };
      if (h('14').length < 20 && h('24').length >= 20 && h('15').length >= 20) {
        var rr = Math.max.apply(null, h('15')) - Math.min.apply(null, h('15'));
        A.missing.push('Ön O2 gərginliyi (PID 14) yoxdur: avtomobil geniş diapazonlu lambda (PID 24) verir, ön/arxa müqayisə qaydası məhduddur');
        if (rr > 0.6) {
          var ev = 'Arxa O2 gərginliyi çox dəyişir (aralıq ' + rr.toFixed(2) + ' V), katalizatorun oksigen saxlamaması mümkündür. Hədd yoxlanmayıb';
          A.anomalies.push({ k: 'cat2', text: ev });
          var x = A.hyps.filter(function (y) { return y.key === 'cat'; })[0];
          if (x) { x.score += 1; x.ev.push(ev); x.level = lvl(x.score); }
          else A.hyps.push({ key: 'cat', score: 1, ev: [ev], level: lvl(1) });
          A.hyps.sort(function (a, b) { return b.score - a.score; });
        }
      }
    } catch (e) {}
    return A;
  };
})();
