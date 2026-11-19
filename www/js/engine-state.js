// Mühərrik vəziyyəti: yalnız TƏZƏ (stale olmayan) RPM ilə təyin olunur. Saf məntiq: ELM/OBD-dən asılı deyil.
// Vəziyyətlər: UNKNOWN, KEY_ON, ENGINE_OFF, CRANKING, WARMUP, IDLE, DRIVING, RUNNING (işləyir, sürət məlum deyil).
//   RPM yoxdur/köhnədir      -> UNKNOWN (heç vaxt "işləyir" deyil)
//   RPM < 100                -> KEY_ON (mühərrik hələ işləməyib) və ya ENGINE_OFF (işləyib, sonra dayanıb)
//   100 ≤ RPM ≤ 400          -> CRANKING
//   RPM > 400, sürət > 0     -> DRIVING;   sürət = 0: ECT < 80 °C -> WARMUP, əks halda IDLE;   sürət yoxdur -> RUNNING
// Start və stop keçidləri Tracker ilə ayrıca qeydə alınır (təsdiq üçün ardıcıl 2 nümunə, ani sıçrayış keçid sayılmır).
window.EngineState = (function () {
  'use strict';
  var T = { OFF_BELOW: 100, CRANK_MAX: 400, WARM_BELOW: 80, STALE_MS: 8000, CONFIRM: 2 };
  var NAMES = {
    UNKNOWN: 'UNKNOWN: RPM oxunmur və ya köhnədir, rejim müəyyən edilmədi',
    KEY_ON: 'Açar ON, mühərrik söndürülü (hələ işləməyib)',
    ENGINE_OFF: 'Mühərrik dayandırılıb (ENGINE OFF)',
    CRANKING: 'Start / çevirmə (100–400 rpm)',
    WARMUP: 'İsinmə: mühərrik işləyir, boş gediş, ECT < 80 °C',
    IDLE: 'Boş gediş (sürət 0, ECT ≥ 80 °C)',
    DRIVING: 'Hərəkət (sürət > 0)',
    RUNNING: 'Mühərrik işləyir, sürət məlum deyil'
  };
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function isRunning(state) { return state === 'WARMUP' || state === 'IDLE' || state === 'DRIVING' || state === 'RUNNING'; }

  // x: { rpm, spd, clt }, dəyər yoxdursa (və ya köhnədirsə) null. hadRun: bu sessiyada mühərrik işləyibmi.
  function classify(x, hadRun) {
    var rpm = num(x && x.rpm), spd = num(x && x.spd), clt = num(x && x.clt);
    if (rpm === null || rpm < 0) return 'UNKNOWN';
    if (rpm < T.OFF_BELOW) return hadRun ? 'ENGINE_OFF' : 'KEY_ON';
    if (rpm <= T.CRANK_MAX) return 'CRANKING';
    if (spd === null) return 'RUNNING';
    if (spd > 0) return 'DRIVING';
    return (clt !== null && clt < T.WARM_BELOW) ? 'WARMUP' : 'IDLE';
  }

  // OBD.values (canlı qeydlər) üzrə cari vəziyyət. Köhnə (STALE_MS-dən köhnə), nodata, simulyasiya -> UNKNOWN.
  function fresh(V, id, now) {
    var r = V && V[id];
    if (!r || r.v === null || r.v === undefined || r.nodata || !r.t) return null;
    return (now - r.t) <= T.STALE_MS ? r.v : null;
  }
  function fromValues(V, now, sim) {
    now = now || Date.now();
    if (sim) return { state: 'UNKNOWN', running: false, reason: 'simulyasiya: real ECU məlumatı deyil' };
    var x = { rpm: fresh(V, '0C', now), spd: fresh(V, '0D', now), clt: fresh(V, '05', now) };
    var st = classify(x, false);
    return { state: st, running: isRunning(st), rpm: x.rpm, reason: st === 'UNKNOWN' ? 'RPM təzə deyil' : '' };
  }

  // Zaman sırası ilə nümunələri qəbul edib təsdiqlənmiş keçidləri yazır.
  function Tracker() { this.state = 'UNKNOWN'; this.hadRun = false; this.events = []; this._p = null; this._n = 0; this._last = null; }
  Tracker.prototype.update = function (t, x) {
    var raw = classify(x, this.hadRun);
    if (raw === 'UNKNOWN') {            // köhnə/yox: dərhal UNKNOWN, keçid yazılmır, əvvəlki təsdiqli vəziyyət saxlanır
      this.state = 'UNKNOWN'; this._p = null; this._n = 0; return this.state;
    }
    if (raw === this._last) { this._n = 0; this._p = null; this.state = raw; return raw; }
    if (this._p === raw) this._n++; else { this._p = raw; this._n = 1; }
    if (this._n >= T.CONFIRM || this._last === null) {
      var from = this._last;
      this._last = raw; this.state = raw; this._p = null; this._n = 0;
      if (from !== null) {
        var kind = 'STATE';
        if (raw === 'CRANKING') kind = 'CRANK';
        else if (isRunning(raw) && !isRunning(from)) kind = 'START';
        else if (!isRunning(raw) && isRunning(from) && (raw === 'ENGINE_OFF' || raw === 'KEY_ON')) kind = 'STOP';
        this.events.push({ t: t, from: from, to: raw, kind: kind });
      } else if (raw === 'CRANKING') this.events.push({ t: t, from: null, to: raw, kind: 'CRANK' });
      if (isRunning(raw)) this.hadRun = true;
    } else this.state = this._last;
    return this.state;
  };
  return { T: T, NAMES: NAMES, classify: classify, isRunning: isRunning, fromValues: fromValues, Tracker: Tracker };
})();
