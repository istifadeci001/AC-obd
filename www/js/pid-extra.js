// OBDex (CC0-1.0) əsasında əlavə Mode 01 PID dekoderləri.
// Yalnız tətbiqdə HƏLƏ OLMAYAN və TƏK düsturlu PID-lər əlavə olunur. Əl ilə yoxlanmış mövcud
// dekoderlər (pids.js) və istifadəçinin fərdi PID-ləri dəyişmir. Düstur Formula ilə (eval yoxdur) işlənir.
// Verilənlər: www/js/pid-data.js (tools/build-pids.js yaradır).
(function () {
  'use strict';
  var D = window.PID_DATA, P = window.PIDS, F = window.Formula;
  var meta = (window.PID_META = {});
  window.PID_ADDED = 0;
  if (!D || !P || !F) return;
  D.forEach(function (e) {
    meta[e.m + ':' + e.id] = { en: e.en, de: e.de, az: e.az || '', unit: e.u, bytes: e.b, range: e.r || null, decoded: false };
    if (e.m !== '01' || !e.f || P[e.id]) return;
    var fn;
    try { fn = F.compile(e.f); } catch (x) { return; }
    P[e.id] = { az: e.az || e.en, en: e.en, unit: e.u, fix: e.x || 0, obdex: true, dec: function (b) { return { v: fn(b) }; } };
    meta['01:' + e.id].decoded = true;
    window.PID_ADDED++;
  });
})();
