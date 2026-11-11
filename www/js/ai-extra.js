(function () {
  var base = AIRules.analyze;
  function lvl(s) { return s >= 4 ? 'Yüksək' : (s >= 2 ? 'Orta' : 'Aşağı'); }
  var IDS = ['14', '15', '16', '17', '18', '19', '1A', '1B', '24', '25', '26', '27', '28', '29', '2A', '2B'];
  AIRules.analyze = function (V, dtc) {
    var A = base(V, dtc);
    try {
      var h = function (id) { return V && V[id] && V[id].hist ? V[id].hist : []; };
      var m = Adapter.map();
      if (!m || !m.scheme) { A.missing.push('O2 sensor mövqeləri (PID 13/1D) təsdiqlənməyib: ön/arxa müqayisəsi etibarlı deyil'); return A; }
      var rear = null;
      IDS.forEach(function (id) {
        var p = Adapter.pos(id);
        if (!rear && p && p.present && p.pos === 'B1S2' && Adapter.kind(id) === 'narrow') rear = id;
      });
      if (rear && h(rear).length >= 20) {
        var r = h(rear), rr = Math.max.apply(null, r) - Math.min.apply(null, r);
        if (rr > 0.6) {
          var ev = 'Arxa O2 (B1S2, PID ' + rear + ') gərginliyi çox dəyişir (aralıq ' + rr.toFixed(2) + ' V): katalizatorun oksigen saxlamaması mümkündür. Hədd yoxlanmayıb';
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
