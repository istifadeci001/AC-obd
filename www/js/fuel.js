window.Fuel = (function () {
  var S = OBD.S, timer = null, ticks = 0, subs = [], T = null;
  (function () {
    var P = window.PIDS;
    var T = { 1: 'Benzin', 2: 'Metanol', 3: 'Etanol', 4: 'Dizel', 5: 'LPG', 6: 'CNG', 7: 'Propan', 8: 'Elektrik', 9: 'Bi-fuel benzin', 17: 'Hibrid benzin' };
    if (!P['51']) P['51'] = { az: 'Yanacaq növü', en: 'Fuel Type', unit: '', fix: 0, nochart: true, dec: function (b) { return { v: b[0], txt: T[b[0]] || ('kod ' + b[0]) }; } };
    if (!P['5E']) P['5E'] = { az: 'Yanacaq sərfi (ECU)', en: 'Engine Fuel Rate', unit: 'L/h', fix: 2, dec: function (b) { return { v: (b[0] * 256 + b[1]) / 20 }; } };
  })();
  var IDS = ['5E', '10', '44', '0B', '0F', '0C', '0D', '06', '07', '2F', '05', '51'];
  function cfg() { return Object.assign({ cap: 0, vd: 1.8, ve: 0.85, k: 1, dens: 745, afr: 14.7 }, Store.get('fuelcfg', {})); }
  function load() { return Object.assign({ L: 0, km: 0, sec: 0, lt: 0, ltn: 0 }, Store.get('fueltrip', {})); }
  function getT() { if (!T) T = load(); return T; }
  function fresh(id, age) { var r = OBD.values[id]; return r && r.v !== null && !r.nodata && r.t && Date.now() - r.t < (age || 4000) ? r.v : null; }
  function lam() { var l = fresh('44'); return l !== null && l > 0.5 && l < 2 ? l : 1; }
  function trimF() { return 1 + ((fresh('06') || 0) + (fresh('07') || 0)) / 100; }
  function estimate() {
    var c = cfg(), rate = fresh('5E'), g = null, m = '', conf = '', lph = null;
    if (rate !== null) { lph = rate; m = 'ECU yanacaq sərfi (PID 5E)'; conf = 'yüksək'; }
    else {
      var maf = fresh('10'), rpm = fresh('0C');
      if (maf !== null) { g = maf / (c.afr * lam()) * trimF(); m = 'MAF + yanacaq korreksiyası'; conf = 'orta'; }
      else {
        var map = fresh('0B'), iat = fresh('0F');
        if (map !== null && rpm !== null && iat !== null) {
          var air = (map * 1000 * (c.vd / 1000) * (rpm / 120) * c.ve) / (287 * (iat + 273.15)) * 1000;
          g = air / (c.afr * lam()) * trimF(); m = 'MAP/IAT/RPM modeli (VE=' + c.ve + ')'; conf = 'aşağı';
        }
      }
      if (g !== null) lph = g * 3600 / c.dens;
    }
    if (lph === null) return null;
    lph *= c.k;
    var spd = fresh('0D');
    return { lph: lph, method: m, conf: conf, spd: spd, lp100: (spd !== null && spd > 5) ? lph / spd * 100 : null };
  }
  function tick() {
    var e = estimate();
    if (!e) return;
    var t = getT();
    t.L += e.lph / 3600; t.sec += 1;
    if (e.spd !== null) t.km += e.spd / 3600;
    var lt = fresh('07'), ct = fresh('05');
    if (lt !== null && ct !== null && ct >= 80) { t.lt += lt; t.ltn++; }
    ticks++;
    if (ticks % 5 === 0) Store.set('fueltrip', t);
    subs.forEach(function (f) { try { f(); } catch (x) {} });
  }
  function running() { return !!timer; }
  function start() {
    if (S.state !== 'ecu') throw new Error('Real ECU-ya qoşulmamısınız.');
    var ids = IDS.filter(function (p) { return OBD.supported.indexOf(p) >= 0 && window.PIDS[p]; });
    ids.push('RV');
    T = null;
    OBD.startPoll(ids);
    clearInterval(timer); timer = setInterval(tick, 1000);
  }
  function stop() { clearInterval(timer); timer = null; Store.set('fueltrip', getT()); T = null; try { OBD.stopPoll(); } catch (e) {} }
  function tank() {
    var p = fresh('2F', 60000), c = cfg();
    if (p === null) return null;
    return { pct: p, L: c.cap ? p * c.cap / 100 : null };
  }
  function fill(liters, full) {
    var t = getT(), c = cfg(), fills = Store.get('fuelfills', []);
    var e = { t: new Date().toISOString(), added: liters, estL: t.L, km: t.km, ltft: t.ltn ? t.lt / t.ltn : null, full: !!full };
    if (full && t.L > 0.5 && c.k > 0) {
      var raw = t.L / c.k, nk = liters / raw;
      c.k = Math.max(0.6, Math.min(1.6, nk));
      Store.set('fuelcfg', c);
      e.newK = c.k;
    }
    fills.unshift(e);
    Store.set('fuelfills', fills.slice(0, 30));
    Store.set('fueltrip', { L: 0, km: 0, sec: 0, lt: 0, ltn: 0 });
    T = null;
    return e;
  }
  function quality() {
    var f = Store.get('fuelfills', []).filter(function (x) { return x.ltft !== null; });
    if (f.length < 2) return null;
    return { a: f[0].ltft, b: f[1].ltft, d: f[0].ltft - f[1].ltft };
  }
  return { IDS: IDS, cfg: cfg, estimate: estimate, start: start, stop: stop, running: running, trip: getT, tank: tank, fill: fill, quality: quality, on: function (f) { subs.push(f); }, tick: tick };
})();
