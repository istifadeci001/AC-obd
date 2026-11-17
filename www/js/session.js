window.Session = (function () {
  var S = OBD.S;
  var rec = { on: false, cols: [], rows: [], t0: 0, timer: null };
  var ctx = { dtc: null, freeze: null, vin: '', cal: '' };

  function tick() {
    if (!OBD.polling || OBD.state !== 'ecu') return;
    var row = [Math.round((Date.now() - rec.t0) / 1000)];
    rec.cols.forEach(function (id) {
      var r = OBD.values[id];
      row.push(r && r.v !== null && !r.nodata ? Number(r.v.toFixed(3)) : '');
    });
    rec.rows.push(row);
    if (rec.rows.length >= 1500) stop();
  }
  function start() {
    if (!OBD.polling) return false;
    rec.cols = OBD.selected.slice(); rec.rows = []; rec.t0 = Date.now(); rec.on = true;
    clearInterval(rec.timer);
    rec.timer = setInterval(tick, 1000);
    return true;
  }
  function stop() { clearInterval(rec.timer); rec.on = false; }

  function stats() {
    var o = {};
    Object.keys(OBD.values).forEach(function (id) {
      var r = OBD.values[id], p = window.PIDS[id];
      if (!r || !r.hist || !r.hist.length || !p || p.nochart) return;
      o[id] = { avg: r.hist.reduce(function (s, x) { return s + x; }, 0) / r.hist.length, min: r.min, max: r.max, n: r.hist.length };
    });
    return o;
  }
  function activeVehicle() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v;
  }

  function save(notes) {
    var id = 's' + Date.now();
    var s = {
      id: id, t: new Date().toISOString(), vehicle: activeVehicle(), vin: ctx.vin, cal: ctx.cal,
      dtc: ctx.dtc, freeze: ctx.freeze, stats: stats(), ai: AIRules.analyze(OBD.values, ctx.dtc),
      notes: notes || '', cols: rec.cols.slice(), n: rec.rows.length, elm: S.elmVersion, proto: S.protocol
    };
    var rowsOk = true;
    if (rec.rows.length) rowsOk = Store.set('rows:' + id, rec.rows);
    var list = Store.get('sessions', []);
    list.unshift(s);
    while (list.length > 10) {
      var old = list.pop();
      try { localStorage.removeItem('acobd:rows:' + old.id); } catch (e) {}
    }
    if (!Store.set('sessions', list)) return null;
    return { s: s, rowsOk: rowsOk };
  }
  function sessions() { return Store.get('sessions', []); }
  function rowsOf(id) { return Store.get('rows:' + id, []); }
  function del(id) {
    Store.set('sessions', sessions().filter(function (x) { return x.id !== id; }));
    try { localStorage.removeItem('acobd:rows:' + id); } catch (e) {}
  }
  function updateNotes(id, notes) {
    var l = sessions();
    l.forEach(function (x) { if (x.id === id) x.notes = notes; });
    Store.set('sessions', l);
  }

  function saveTest(label) {
    var l = Store.get('tests', []);
    l.unshift({ id: 't' + Date.now(), label: label || 'Test', t: new Date().toISOString(), stats: stats() });
    Store.set('tests', l.slice(0, 20));
  }
  function tests() { return Store.get('tests', []); }
  function compare(a, b) {
    var A = null, B = null;
    tests().forEach(function (x) { if (x.id === a) A = x; if (x.id === b) B = x; });
    if (!A || !B) return [];
    var rows = [];
    Object.keys(A.stats).forEach(function (id) {
      if (!B.stats[id]) return;
      rows.push({ id: id, a: A.stats[id].avg, b: B.stats[id].avg, d: B.stats[id].avg - A.stats[id].avg });
    });
    return rows;
  }

  function addEvent(ev) {
    var l = Store.get('events', []);
    l.unshift(ev);
    Store.set('events', l.slice(0, 100));
  }
  function events() { return Store.get('events', []); }
  function clearEvents() { Store.set('events', []); }

  function csv(cols, rows) {
    var head = ['time_s'].concat(cols.map(function (id) {
      var p = window.PIDS[id];
      return id + (p ? '_' + p.en.replace(/[^A-Za-z0-9]+/g, '_') : '');
    }));
    return head.join(',') + '\n' + rows.map(function (r) { return r.join(','); }).join('\n');
  }
  function currentCsv() { return csv(rec.cols, rec.rows); }

  function copy(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t); } catch (e) {}
    var a = document.createElement('textarea');
    a.value = t; document.body.appendChild(a); a.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(a);
    return ok;
  }
  async function share(text, title) {
    try {
      if (navigator.share) { await navigator.share({ title: title, text: text }); return 'share'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    return copy(text) ? 'copy' : 'fail';
  }

  var LB = {
    az: { title: 'AC OBD Diaqnostika Hesabatı', date: 'Tarix', veh: 'Avtomobil', vin: 'VIN', cal: 'Kalibrasiya ID', ecu: 'Adapter / Protokol',
      dtc: 'Xəta kodları', stored: 'Saxlanmış (03)', pending: 'Gözləyən (07)', perm: 'Daimi (0A)', none: 'yoxdur və ya oxunmayıb',
      fz: 'Freeze Frame', live: 'Canlı göstəricilər (orta / min / maks)', ai: 'Qaydalarla təhlil (qəti diaqnoz deyil)',
      notes: 'Qeydlər', foot: 'Hesabat real ECU məlumatlarına əsaslanır. Təhlil ehtimal xarakterlidir və qəti diaqnoz sayılmamalıdır.', rec: 'Qeyd olunmuş nümunə sayı' },
    en: { title: 'AC OBD Diagnostic Report', date: 'Date', veh: 'Vehicle', vin: 'VIN', cal: 'Calibration ID', ecu: 'Adapter / Protocol',
      dtc: 'Fault codes', stored: 'Stored (03)', pending: 'Pending (07)', perm: 'Permanent (0A)', none: 'none or not read',
      fz: 'Freeze Frame', live: 'Live data (avg / min / max)', ai: 'Rule-based analysis (not a definitive diagnosis) — text currently Azerbaijani only',
      notes: 'Notes', foot: 'This report is based on real ECU data. The analysis is probabilistic and must not be treated as a definitive diagnosis.', rec: 'Recorded samples' }
  };
  function reportText(s, lang) {
    var L = LB[lang] || LB.az, o = [];
    function codesOf(r) { return r ? (r.ok ? (r.codes.length ? r.codes.join(', ') : '-') : L.none) : L.none; }
    o.push(L.title, '='.repeat(L.title.length));
    o.push(L.date + ': ' + LocalTime.full(s.t));
    var v = s.vehicle;
    o.push(L.veh + ': ' + (v ? [v.make, v.model, v.year, v.engine, v.fuel, v.trans].filter(Boolean).join(' ') : '-'));
    o.push(L.vin + ': ' + (s.vin || '-'));
    o.push(L.cal + ': ' + (s.cal || '-'));
    o.push(L.ecu + ': ' + (s.elm || '-') + ' / ' + (s.proto || '-'));
    o.push('', L.dtc + ':');
    o.push('  ' + L.stored + ': ' + codesOf(s.dtc && s.dtc.stored));
    o.push('  ' + L.pending + ': ' + codesOf(s.dtc && s.dtc.pending));
    o.push('  ' + L.perm + ': ' + codesOf(s.dtc && s.dtc.permanent));
    o.push('', L.fz + ':');
    if (s.freeze && s.freeze.dtc) {
      o.push('  DTC: ' + s.freeze.dtc);
      Object.keys(s.freeze.pids).forEach(function (id) {
        var p = window.PIDS[id];
        if (!p) return;
        o.push('  ' + (lang === 'en' ? p.en : p.az) + ': ' + s.freeze.pids[id].v.toFixed(p.fix) + ' ' + p.unit);
      });
    } else o.push('  ' + L.none);
    o.push('', L.live + ':');
    var ids = Object.keys(s.stats || {});
    if (!ids.length) o.push('  ' + L.none);
    ids.forEach(function (id) {
      var p = window.PIDS[id], x = s.stats[id];
      if (!p) return;
      o.push('  ' + (lang === 'en' ? p.en : p.az) + ': ' + x.avg.toFixed(p.fix) + ' / ' + x.min.toFixed(p.fix) + ' / ' + x.max.toFixed(p.fix) + ' ' + p.unit);
    });
    if (s.n) o.push('  ' + L.rec + ': ' + s.n);
    o.push('', L.ai + ':');
    var a = s.ai;
    if (a) {
      a.symptoms.forEach(function (x) { o.push('  - ' + x); });
      a.anomalies.forEach(function (x) { o.push('  ! ' + x.text); });
      a.hyps.forEach(function (h) {
        o.push('  * ' + AIRules.name(h.key) + ' [' + h.level + ']');
        h.ev.forEach(function (e) { o.push('      ' + e); });
      });
      a.next.forEach(function (x) { o.push('  > ' + x); });
      a.safety.forEach(function (x) { o.push('  ⚠ ' + x); });
    }
    o.push('', L.notes + ': ' + (s.notes || '-'), '', L.foot);
    return o.join('\n');
  }

  return {
    ctx: ctx, start: start, stop: stop, isRec: function () { return rec.on; }, rowCount: function () { return rec.rows.length; },
    save: save, sessions: sessions, rowsOf: rowsOf, del: del, updateNotes: updateNotes,
    saveTest: saveTest, tests: tests, compare: compare,
    addEvent: addEvent, events: events, clearEvents: clearEvents,
    csv: csv, currentCsv: currentCsv, reportText: reportText, share: share, copy: copy
  };
})();

// DTC statuslarının (Saxlanmış 03 / Gözləyən 07 / Daimi 0A) ayrı saxlanması üçün ümumi köməkçi: Canlı hesabat, AI hesabatı və sessiya eyni məlumatı istifadə edir.
window.DtcStatus = (function () {
  var KEYS = ['stored', 'pending', 'permanent'], LAB = { stored: 'Saxlanmış (03)', pending: 'Gözləyən (07)', permanent: 'Daimi (0A)' };
  function summarize(d) {
    var out = { read: { stored: false, pending: false, permanent: false }, codes: { stored: [], pending: [], permanent: [] }, byCode: {}, all: [] };
    KEYS.forEach(function (k) {
      var r = d && d[k];
      if (!r || !r.ok) return;
      out.read[k] = true;
      (r.codes || []).forEach(function (c) {
        if (out.codes[k].indexOf(c) < 0) out.codes[k].push(c);
        (out.byCode[c] = out.byCode[c] || []).indexOf(k) < 0 && out.byCode[c].push(k);
        if (out.all.indexOf(c) < 0) out.all.push(c);
      });
    });
    return out;
  }
  function lines(d) {
    var s = summarize(d);
    return KEYS.map(function (k) { return LAB[k] + ': ' + (!s.read[k] ? 'oxunmayıb' : (s.codes[k].length ? s.codes[k].join(', ') : 'yoxdur')); });
  }
  function labelsOf(code, d) { var s = summarize(d); return (s.byCode[code] || []).map(function (k) { return LAB[k]; }); }
  return { KEYS: KEYS, LAB: LAB, summarize: summarize, lines: lines, labelsOf: labelsOf };
})();

// ===== AutoLog: adapter qoşulan kimi avtomatik tam jurnal (yalnız OXUMA: Mode 01/02/03/06/07/09/0A) =====
// Real ECU məlumatını hadisə kimi yazır (zaman damğası ilə), fazalara bölür, AI-yə yapışdırmaq üçün mətn hazırlayır.
window.AutoLog = (function () {
  'use strict';
  var FAST = ['0C', '0D', '05', '04', '11', '06', '07', '15', '34', '14', '24', '25', '0E', '0B', '10'];
  var MIDT = ['0F', '42', '1F', '33', '5C', '44', '3C', '3E', '03', '2F', '43', '46', '5E'];
  var STALE_MS = 8000, MAXEV = 120000, KEY = 'autolog_last', DTC_EVERY = 300000, ROT = 4;
  var cur = null, tick = 0, subs = [], ext = null, inner = false, autoOn = true;
  try { if (window.Store) autoOn = Store.get('autolog_auto', true) !== false; } catch (e) {}
  // Başqa bölmə (LiveDiag, Fuel, O2Diag, Canlı...) sorğu siyahısını dəyişsə, avto-jurnal ona müdaxilə etmir.
  if (window.OBD && !OBD.alWrapped) {
    ['startPoll', 'setSelected'].forEach(function (n) { var o = OBD[n]; OBD[n] = function (ids) { if (!inner) ext = { list: (ids || []).slice() }; return o.apply(OBD, arguments); }; });
    OBD.alWrapped = true;
  }

  function nowMs() { return Date.now(); }
  function P(id) { return (window.PIDS && window.PIDS[id]) || null; }
  function pname(id) { var p = P(id); return id === 'RV' ? 'Adapter gərginliyi (ATRV)' : (p ? (p.az || p.en || id) : id); }
  function punit(id) { var p = P(id); return id === 'RV' ? 'V' : (p && p.unit ? p.unit : ''); }
  function fmtv(id, v) { var p = P(id), d = p && p.fix !== undefined ? p.fix : 2; return v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toFixed(d); }
  function p2(n) { return ('0' + n).slice(-2); }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return p2(Math.floor(s / 60)) + ':' + p2(s % 60); }
  function clock(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  function create(t) {
    return { v: 1, t0: t, t1: null, on: true, ids: [], idx: {}, ev: [], notes: [], snap: {}, last: {}, cnt: {}, bad: {}, supported: [], dropped: 0, mine: null, yielded: false, idleSince: 0, prob: false, restored: false, lastDtc: t, rot: null, busy: false };
  }
  function note(s, k, text) { s.notes.push({ t: nowMs(), k: k, s: text }); emit(); }
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  // bir ölçmə yazılır (id, dəyər, mütləq vaxt)
  function feed(s, id, v, t) {
    if (v === null || v === undefined || !isFinite(v)) return;
    var i = s.idx[id];
    if (i === undefined) { i = s.ids.length; s.ids.push(id); s.idx[id] = i; }
    if (s.ev.length >= MAXEV) { var cut = Math.floor(MAXEV * 0.2); s.ev.splice(0, cut); s.dropped += cut; }
    s.ev.push([t - s.t0, i, v]);
    var c = s.cnt[id] || (s.cnt[id] = { n: 0, sum: 0, min: v, max: v, first: v, last: v, tl: t, tf: t });
    c.n++; c.sum += v; if (v < c.min) c.min = v; if (v > c.max) c.max = v; c.last = v; c.tl = t;
  }

  // OBD.values-dan yeni oxunanlar götürülür (başqa modul siyahını dəyişsə də itmir)
  function sample() {
    var s = cur; if (!s || !window.OBD) return;
    var S = OBD.S; if (S.sim) return;
    var vals = OBD.values;
    Object.keys(vals).forEach(function (id) {
      var r = vals[id];
      if (!r) return;
      if (r.invalid && r.bad !== s.bad[id]) { s.bad[id] = r.bad; note(s, 'invalid', 'PID ' + id + ' natamam/etibarsız cavab: ' + r.invalid); }
      if (!r.t || r.v === null || r.nodata || r.t === s.last[id]) return;
      s.last[id] = r.t; feed(s, id, r.v, r.t);
    });
  }

  function pick(list, sup) { return list.filter(function (x) { return sup.indexOf(x) >= 0 && P(x); }); }
  function same(a, b) { return !!a && !!b && a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

  function sched() {
    var s = cur; if (!s || !s.on || !window.OBD) return;
    var S = OBD.S; if (S.state !== 'ecu' || S.sim) return;
    var sup = S.supported;
    if (!s.rot) {
      var fast = pick(FAST, sup), mid = pick(MIDT, sup);
      var rest = sup.filter(function (x) { return fast.indexOf(x) < 0 && mid.indexOf(x) < 0 && P(x) && parseInt(x, 16) % 32 !== 0; });
      s.rot = { fast: fast, rest: mid.concat(rest), i: 0 };
    }
    if (S.polling && ext && same(S.selected, ext.list)) {
      if (!s.yielded) { s.yielded = true; note(s, 'sys', 'Sorğu siyahısını başqa bölmə dəyişdi (məs. Canlı diaqnostika): avto-jurnal sorğunu idarə etmir, oxunanları yazmağa davam edir.'); }
      return;
    }
    if (s.yielded && !S.polling) {
      s.idleSince = s.idleSince || nowMs();
      if (nowMs() - s.idleSince < 4000) return;
      s.yielded = false; s.idleSince = 0; ext = null; note(s, 'sys', 'Başqa bölmə bitdi: avto-jurnal sorğunu bərpa etdi.');
    } else if (s.yielded) return;
    var r = s.rot, list = r.fast.slice(), k;
    for (k = 0; k < ROT && r.rest.length; k++) { list.push(r.rest[r.i % r.rest.length]); r.i++; }
    list.push('RV');
    s.mine = list;
    inner = true; try { ext = null; if (!S.polling) OBD.startPoll(list); else OBD.setSelected(list); } finally { inner = false; }
  }

  async function step(s, name, fn) {
    try { s.snap[name] = await fn(); note(s, 'snap', name + ': oxundu'); }
    catch (e) { s.snap[name] = { error: String(e && e.message || e) }; note(s, 'snap', name + ': oxunmadı (' + (e && e.message || e) + ')'); }
  }
  async function readDtcAll(s) {
    var d = { t: new Date().toISOString() };
    d.stored = await OBD.readDtcs('03'); d.pending = await OBD.readDtcs('07'); d.permanent = await OBD.readDtcs('0A');
    s.snap.dtc = d; s.lastDtc = nowMs();
    if (window.Session && Session.ctx && !Session.ctx.dtc) Session.ctx.dtc = d;
    return d;
  }
  async function snapshot(s) {
    if (s.busy) return; s.busy = true;
    var S = OBD.S;
    s.snap.adapter = { name: S.deviceName || '', elm: S.elmVersion || '', protocol: S.protocol || '', info: window.Adapter && Adapter.info ? Adapter.info() : null, o2map: window.Adapter && Adapter.map ? Adapter.map() : null };
    s.supported = S.supported.slice();
    await step(s, 'dtc', function () { return readDtcAll(s); });
    await step(s, 'vehicle', function () { return OBD.readVehicleInfo(); });
    await step(s, 'readiness', function () { return OBD.readReadiness(); });
    await step(s, 'freeze', function () { return OBD.readFreeze(); });
    await step(s, 'mode06', async function () {
      var mids = await OBD.mode06List(), out = [];
      for (var i = 0; i < mids.length && i < 32; i++) { try { out.push(await OBD.mode06Read(mids[i])); } catch (e) { out.push({ mid: mids[i], error: e.message, tests: [] }); } }
      return { list: mids, reads: out };
    });
    await step(s, 'rawPids', async function () {
      var out = {};
      var ids = S.supported.filter(function (x) { return !P(x) && parseInt(x, 16) % 32 !== 0; });
      for (var i = 0; i < ids.length && i < 24; i++) { try { var r = await OBD.raw('01' + ids[i], 3000); out[ids[i]] = r.msgs.join(' | ') || r.txt.join(' '); } catch (e) { out[ids[i]] = 'ERR ' + e.message; } }
      return out;
    });
    s.busy = false; save();
  }

  function save() {
    var s = cur; if (!s || !window.Store) return;
    try {
      var o = { v: 1, t0: s.t0, t1: s.t1, ids: s.ids, ev: s.ev.slice(-30000), notes: s.notes.slice(-300), snap: s.snap, supported: s.supported, cnt: s.cnt, dropped: s.dropped, bad: s.bad };
      var j = JSON.stringify(o); if (j.length < 900000) Store.set(KEY, o);
    } catch (e) {}
  }
  function restore() {
    if (cur || !window.Store) return null;
    var o = Store.get(KEY, null);
    if (!o || !o.ev || !o.ev.length) return null;
    var s = create(o.t0); s.t1 = o.t1 || (o.t0 + (o.ev[o.ev.length - 1][0] || 0)); s.on = false; s.restored = true;
    s.ids = o.ids; s.ids.forEach(function (id, i) { s.idx[id] = i; }); s.ev = o.ev; s.notes = o.notes || []; s.snap = o.snap || {}; s.supported = o.supported || []; s.cnt = o.cnt || {}; s.dropped = o.dropped || 0; s.bad = o.bad || {};
    cur = s; return s;
  }

  function start(force) {
    if (!window.OBD || OBD.S.sim) return null;
    var S = OBD.S, t = nowMs();
    if (cur && cur.on && !force) return cur;
    if (cur && !force && !cur.restored && cur.t1 && t - cur.t1 < 120000) { cur.on = true; cur.t1 = null; note(cur, 'sys', 'Əlaqə bərpa olundu: eyni jurnal davam edir.'); return cur; }
    if (cur) save();
    cur = create(t);
    note(cur, 'sys', 'Avto-jurnal başladı (adapter qoşuldu: ' + (S.deviceName || 'adapter') + ', ' + (S.protocol || 'protokol bilinmir') + ').');
    cur.supported = S.supported.slice();
    snapshot(cur);
    return cur;
  }
  function stop() { if (cur && cur.on) { cur.on = false; cur.manual = true; cur.t1 = nowMs(); note(cur, 'sys', 'Jurnal istifadəçi tərəfindən dayandırıldı.'); save(); } }
  function takeOver() { ext = null; if (cur && cur.on) { cur.yielded = false; cur.mine = null; cur.idleSince = 0; note(cur, 'sys', 'Avto-jurnal sorğu siyahısını yenidən öz üzərinə götürdü.'); } }
  function resume() { if (cur && !cur.on && window.OBD && OBD.S.state === 'ecu') { cur.on = true; cur.manual = false; cur.t1 = null; note(cur, 'sys', 'Jurnal davam etdirildi.'); } }
  function clear() { cur = null; if (window.Store) try { Store.set(KEY, null); } catch (e) {} emit(); }

  function onObd(type) {
    if (!window.OBD) return;
    var S = OBD.S;
    if (type === 'value') return;
    if (S.sim) return;
    if (cur && cur.manual) return;
    if (!autoOn && !cur) return;
    if (S.state === 'ecu') { if (!cur || !cur.on) { if (!cur || !cur.restored) start(false); else start(true); } else if (cur.prob) { cur.prob = false; note(cur, 'sys', 'Əlaqə bərpa olundu.'); } }
    else if (cur && cur.on && (S.state === 'reconnecting' || S.state === 'elm')) { if (!cur.prob) { cur.prob = true; note(cur, 'sys', 'Əlaqə problemi: ' + S.state); } }
    else if (cur && cur.on && (S.state === 'idle' || S.state === 'error')) { sample(); cur.on = false; cur.t1 = nowMs(); note(cur, 'sys', 'Əlaqə kəsildi (' + S.state + (S.error ? ': ' + S.error : '') + ').'); save(); }
  }
  setInterval(function () {
    tick++;
    var s = cur; if (!s || !s.on) return;
    sample();
    if (tick % 3 === 0) sched();
    if (tick % 60 === 0) save();
    if (nowMs() - s.lastDtc > DTC_EVERY && !s.busy && window.OBD && OBD.S.state === 'ecu') { s.lastDtc = nowMs(); step(s, 'dtc', function () { return readDtcAll(s); }); }
  }, 500);
  if (window.OBD && OBD.on) OBD.on(onObd);

  // ---------- Analiz: saniyə-saniyə rejim, fazalar, statistika, hadisələr ----------
  function classify(rpm, spd, clt) {
    var th = clt === null ? 'unk' : (clt < 50 ? 'cold' : (clt < 80 ? 'warm' : 'hot')), base;
    if (rpm === null) { base = 'UNKNOWN'; th = 'unk'; }
    else if (rpm < 100) { base = 'KEYON'; th = 'unk'; }
    else if (rpm <= 400) { base = 'CRANK'; th = 'unk'; }
    else if (spd === null) base = 'RUNNOSPD';
    else if (spd === 0) base = 'IDLE';
    else base = 'DRIVE';
    return base + '/' + th;
  }
  var BASE = { KEYON: 'Açar ON, mühərrik söndürülü', CRANK: 'Start / çevirmə (100–400 rpm)', IDLE: 'Boş gediş (sürət 0)', DRIVE: 'Hərəkət (sürət > 0)', RUNNOSPD: 'Mühərrik işləyir, sürət məlum deyil', UNKNOWN: 'UNKNOWN: RPM oxunmur, rejim müəyyən edilə bilmir' };
  var TH = { cold: 'soyuq (<50 °C)', warm: 'isinir (50–79 °C)', hot: 'isti (≥80 °C)', unk: '' };
  function phaseName(key) { var a = key.split('/'); return BASE[a[0]] + (TH[a[1]] ? ', ' + TH[a[1]] : (a[1] === 'unk' && (a[0] === 'IDLE' || a[0] === 'DRIVE' || a[0] === 'RUNNOSPD') ? ', ECT məlum deyil' : '')); }

  function analyze(s) {
    var endT = (s.t1 || nowMs()) - s.t0, dur = Math.max(1000, endT), secs = Math.ceil(dur / 1000);
    var cols = ['0C', '0D', '05', '04', '06', '07', '34', '14', '15', '0B', '10', '0F', '42', 'RV'];
    var step = Math.max(5, Math.ceil(secs / 240 / 5) * 5);
    var curV = {}, p = 0, rows = [], series = [], dts = {}, lastT = {};
    function fresh(id, tms) { var c = curV[id]; return c && tms - c.t <= STALE_MS ? c.v : null; }
    for (var sec = 0; sec <= secs; sec++) {
      var tms = sec * 1000;
      while (p < s.ev.length && s.ev[p][0] <= tms) {
        var e = s.ev[p], id = s.ids[e[1]]; curV[id] = { v: e[2], t: e[0] };
        if (lastT[id] !== undefined) { var a = dts[id] || (dts[id] = []); a.push((e[0] - lastT[id]) / 1000); if (a.length > 400) a.shift(); }
        lastT[id] = e[0]; p++;
      }
      var rpm = fresh('0C', tms), spd = fresh('0D', tms), clt = fresh('05', tms);
      var key = classify(rpm, spd, clt);
      rows.push(key);
      if (sec % step === 0) series.push({ sec: sec, key: key, v: cols.map(function (c) { return fresh(c, tms); }) });
    }
    // fazalar
    var runs = [];
    rows.forEach(function (k, i) { var l = runs[runs.length - 1]; if (l && l.key === k) l.b = i + 1; else runs.push({ key: k, a: i, b: i + 1 }); });
    var out = [];
    runs.forEach(function (r) {
      var l = out[out.length - 1], keep = r.key.indexOf('CRANK') === 0 || (r.b - r.a) >= 6;
      if (!keep && l) l.b = r.b; else if (l && l.key === r.key) l.b = r.b; else out.push({ key: r.key, a: r.a, b: r.b });
    });
    var merged = [];
    out.forEach(function (r) { var l = merged[merged.length - 1]; if (l && l.key === r.key) l.b = r.b; else merged.push(r); });
    merged.forEach(function (ph) { ph.st = {}; ph.name = phaseName(ph.key); });
    // faza statistikası
    var q = 0;
    s.ev.forEach(function (e) {
      var t = e[0] / 1000, id = s.ids[e[1]];
      while (q < merged.length - 1 && t >= merged[q].b) q++;
      var ph = merged[q]; if (!ph || t < ph.a || t >= ph.b + 1) return;
      var x = ph.st[id] || (ph.st[id] = { n: 0, sum: 0, min: e[2], max: e[2], first: e[2], last: e[2], tmin: e[0], tmax: e[0] });
      x.n++; x.sum += e[2]; if (e[2] < x.min) { x.min = e[2]; x.tmin = e[0]; } if (e[2] > x.max) { x.max = e[2]; x.tmax = e[0]; } x.last = e[2];
    });
    // hərəkət: təxmini məsafə (sürətin inteqralı)
    var dist = 0, prev = null;
    s.ev.forEach(function (e) { if (s.ids[e[1]] !== '0D') return; if (prev) { var dt = Math.min(5, (e[0] - prev[0]) / 1000); dist += (prev[1] + e[2]) / 2 * dt / 3600; } prev = [e[0], e[2]]; });
    var dtMed = {}; Object.keys(dts).forEach(function (id) { dtMed[id] = med(dts[id]); });
    return { dur: dur, secs: secs, step: step, rows: rows, phases: merged, series: series, cols: cols, dist: dist, dtMed: dtMed };
  }

  function keyEvents(s, an) {
    var ev = [], seen = {}, i, t;
    function add(ms, txt) { ev.push({ ms: ms, s: txt }); }
    var run = false, runSince = 0;
    an.rows.forEach(function (k, sec) {
      var base = k.split('/')[0], th = k.split('/')[1];
      if (!seen.crank && base === 'CRANK') { seen.crank = 1; add(sec * 1000, 'Start / çevirmə aşkarlandı (RPM 100–400).'); }
      if (!run && (base === 'IDLE' || base === 'DRIVE' || base === 'RUNNOSPD')) { run = true; runSince = sec; if (!seen.eng) { seen.eng = 1; add(sec * 1000, 'Mühərrik işləməyə başladı (RPM > 400).'); } }
      if (run && base === 'KEYON' && sec - runSince > 30) { run = false; add(sec * 1000, 'RPM < 100: mühərrik dayandı (söndürüldü və ya sönüb).'); }
      if (base === 'DRIVE' && !seen.move) { seen.move = 1; add(sec * 1000, 'İlk hərəkət (sürət > 0).'); }
    });
    var cl = s.cnt['05']; if (cl) { var c50, c80; var cv = {}; s.ev.forEach(function (e) { if (s.ids[e[1]] === '05') { if (!c50 && e[2] >= 50) c50 = e; if (!c80 && e[2] >= 80) c80 = e; } }); if (c50) add(c50[0], 'ECT ilk dəfə 50 °C-ə çatdı (' + fmtv('05', c50[2]) + ').'); if (c80) add(c80[0], 'ECT ilk dəfə 80 °C-ə çatdı (' + fmtv('05', c80[2]) + ').'); }
    function ext(id, lab) { var c = s.cnt[id]; if (!c) return; var mn, mx; s.ev.forEach(function (e) { if (s.ids[e[1]] !== id) return; if (!mn || e[2] < mn[2]) mn = e; if (!mx || e[2] > mx[2]) mx = e; }); add(mx[0], lab + ' maksimum: ' + fmtv(id, mx[2]) + ' ' + punit(id)); if (mn[0] !== mx[0]) add(mn[0], lab + ' minimum: ' + fmtv(id, mn[2]) + ' ' + punit(id)); }
    ext('0D', 'Sürət'); ext('0C', 'RPM'); ext('06', 'STFT B1'); ext('07', 'LTFT B1'); ext(s.cnt['42'] ? '42' : 'RV', 'Gərginlik');
    s.notes.forEach(function (n) { add(n.t - s.t0, '[' + n.k + '] ' + n.s); });
    ev.sort(function (a, b) { return a.ms - b.ms; });
    return ev;
  }

  function pidStatus(s, id, tRef) {
    if (id !== 'RV' && s.supported.length && s.supported.indexOf(id) < 0) return { st: 'UNSUPPORTED', why: 'ECU dəstəkləmir (nasazlıq deyil)' };
    var c = s.cnt[id];
    if (!c) { if (s.bad[id]) return { st: 'INVALID', why: 'natamam/etibarsız cavab gəldi' }; return { st: 'UNKNOWN', why: P(id) || id === 'RV' ? 'jurnal dövründə etibarlı dəyər oxunmadı' : 'dekoder yoxdur (xam HEX bölməsinə baxın)' }; }
    if (tRef - c.tl > STALE_MS) return { st: 'STALE', why: 'son dəyər ' + Math.round((tRef - c.tl) / 1000) + ' s əvvəl oxunub' };
    return { st: 'REAL', why: '' };
  }

  // ---------- Mətn hesabatı ----------
  function build(s, kind, opts) {
    opts = opts || {};
    var an = analyze(s), L = [], tEnd = s.t1 || nowMs(), ev = keyEvents(s, an), sn = s.snap, full = kind !== 'diag';
    function H(t) { L.push(''); L.push('=== ' + t + ' ==='); }
    L.push('AC OBD: ' + (full ? 'CANLI GÖSTƏRİCİ, TAM AVTOMATİK JURNAL' : 'CANLI DİAQNOSTİKA JURNALI') + ' (AI üçün)');
    H('AI-YƏ TAPŞIRIQ');
    L.push('Aşağıda OBD2 adapteri ilə avtomobildən AVTOMATİK oxunmuş real məlumat var. Heç bir göstərici süni yaradılmayıb və ya simulyasiya edilməyib.');
    L.push('1) Jurnalı zaman ardıcıllığı ilə (fazalar: açar ON, start, soyuq boş gediş, isinmə, sürüş) analiz et. 2) Ən ehtimal olunan problemləri əsaslandırmaqla sırala. 3) Əmin olmadığın yerləri ayrıca yaz. 4) Yoxlama addımlarını prioritetlə ver. 5) Bu məlumat qəti diaqnoz deyil, ehtimal kimi izah et.');
    L.push('Qaydalar: UNSUPPORTED = ECU dəstəkləmir (nasazlıq deyil). STALE/UNKNOWN/INVALID = etibarlı dəyər yoxdur, onlardan nəticə çıxarma. Mode 06 üçün PASS/FAIL elan edilmir, yalnız xam dəyər və ECU limitləri verilir.');
    var gv = window.Store ? Store.get('garage', []) : [], av = window.Store ? Store.get('activeVehicle', null) : null, veh = '';
    gv.forEach(function (x) { if (x.id === av) veh = [x.make, x.model, x.year, x.engine].filter(Boolean).join(' '); });
    L.push('Avtomobil: ' + (veh || '[marka/model/il/mühərrik/yürüş: doldurun]') + '   Şikayət: [doldurun]');

    H('1. SESSİYA');
    L.push('Başlama: ' + (window.LocalTime ? LocalTime.full(new Date(s.t0).toISOString()) : new Date(s.t0).toISOString()) + ' | Müddət: ' + mmss(an.dur) + ' | Vəziyyət: ' + (s.on ? 'yazılır' : 'dayandırılıb') + (s.restored ? ' | əvvəlki sessiyadan bərpa olunub' : ''));
    L.push('Nümunə sayı: ' + s.ev.length + (s.dropped ? ' (+' + s.dropped + ' köhnə nümunə yaddaş limitinə görə atılıb)' : '') + ' | Təxmini yol (sürətin inteqralı): ' + an.dist.toFixed(2) + ' km');
    var ad = sn.adapter || {}, vi = sn.vehicle || {};
    L.push('Adapter: ' + (ad.name || '—') + ' | ELM: ' + (ad.elm || '—') + ' | Protokol: ' + (ad.protocol || '—'));
    if (ad.info) L.push('ATI: ' + (ad.info.ati || '—') + ' | STI: ' + (ad.info.sti || '—') + ' | AT@1: ' + (ad.info.at1 || '—'));
    if (ad.o2map) L.push('O2 sensor xəritəsi (PID ' + (ad.o2map.scheme || '—') + ', maska ' + ad.o2map.mask + ')');
    L.push('VIN (ECU-dan): ' + (vi.vin || (vi.error ? 'oxunmadı (' + vi.error + ')' : '—')) + ' | Kalibrasiya ID: ' + (vi.cal || '—'));

    H('2. XƏTA KODLARI (statuslar ayrı)');
    var d = sn.dtc;
    if (!d || d.error) L.push('Kodlar oxunmayıb' + (d && d.error ? ': ' + d.error : '') + '.');
    else {
      (window.DtcStatus ? DtcStatus.lines(d) : []).forEach(function (l) { L.push(l); });
      var all = window.DtcStatus ? DtcStatus.summarize(d).all : [];
      all.forEach(function (c) { var e = window.DTC_DB && DTC_DB[c]; L.push('  ' + c + ' [' + DtcStatus.labelsOf(c, d).join(' + ') + ']' + (e ? ': ' + (e.az || e.en || '') : '')); });
      L.push('Oxunma vaxtı: ' + d.t);
    }
    H('3. HAZIRLIQ TESTLƏRİ (Readiness)');
    var rd = sn.readiness;
    if (!rd || rd.error) L.push('Oxunmayıb' + (rd && rd.error ? ': ' + rd.error : '') + '.');
    else { L.push('MIL: ' + (rd.mil ? 'YANIR' : 'yanmır') + ' | Kod sayı: ' + rd.count); rd.items.forEach(function (x) { L.push('  ' + x.name + ': ' + (!x.sup ? 'dəstəklənmir' : (x.done ? 'tamamlanıb' : 'tamamlanmayıb'))); }); }
    H('4. FREEZE FRAME');
    var fz = sn.freeze;
    if (!fz || fz.error) L.push('Oxunmayıb.'); else if (!fz.dtc) L.push(fz.status || 'Freeze Frame saxlanmayıb.');
    else { L.push('Kod: ' + fz.dtc); Object.keys(fz.pids).forEach(function (k) { L.push('  ' + k + ' ' + pname(k) + ': ' + fmtv(k, fz.pids[k].v) + ' ' + punit(k)); }); }

    H('5. FAZALAR (zaman ardıcıllığı)');
    if (!an.phases.length) L.push('Məlumat yoxdur.');
    an.phases.forEach(function (ph, i) {
      L.push('');
      L.push('Faza ' + (i + 1) + ' [' + ph.key + ']: ' + ph.name);
      L.push('  Vaxt: ' + mmss(ph.a * 1000) + ' → ' + mmss(ph.b * 1000) + ' (' + mmss((ph.b - ph.a) * 1000) + ') | saat ' + clock(s.t0 + ph.a * 1000) + ' → ' + clock(s.t0 + ph.b * 1000));
      var ids = Object.keys(ph.st);
      if (!ids.length) L.push('  Bu fazada heç bir PID oxunmayıb.');
      (full ? ids : ids.filter(function (id) { return an.cols.indexOf(id) >= 0; })).sort().forEach(function (id) {
        var x = ph.st[id];
        L.push('  ' + id + ' ' + pname(id) + ': orta ' + fmtv(id, x.sum / x.n) + ' | min ' + fmtv(id, x.min) + ' | maks ' + fmtv(id, x.max) + ' | ilk ' + fmtv(id, x.first) + ' | son ' + fmtv(id, x.last) + ' ' + punit(id) + ' (n=' + x.n + ')');
      });
    });
    H('6. ƏSAS HADİSƏLƏR');
    ev.forEach(function (e) { L.push('[' + mmss(e.ms) + ' | ' + clock(s.t0 + e.ms) + '] ' + e.s); });
    H('7. ZAMAN SIRASI (hər ' + an.step + ' san; "—" = etibarlı təzə dəyər yoxdur)');
    L.push('vaxt | faza | ' + an.cols.map(function (c) { return c; }).join(' | '));
    an.series.forEach(function (r) { L.push(mmss(r.sec * 1000) + ' | ' + r.key + ' | ' + r.v.map(function (v, i) { return v === null ? '—' : fmtv(an.cols[i], v); }).join(' | ')); });

    H('8. BÜTÜN PID-LƏR (a dan z-yə): status və statistika');
    var tRef = s.on ? nowMs() : tEnd;
    var allIds = s.supported.slice(); Object.keys(s.cnt).forEach(function (id) { if (allIds.indexOf(id) < 0) allIds.push(id); });
    allIds.filter(function (id) { return parseInt(id, 16) % 32 !== 0 || isNaN(parseInt(id, 16)); }).sort().forEach(function (id) {
      var c = s.cnt[id], st = pidStatus(s, id, tRef);
      L.push(id + ' ' + pname(id) + ': ' + st.st + (st.why ? ' (' + st.why + ')' : '') + (c ? ' | son ' + fmtv(id, c.last) + ' ' + punit(id) + ' | orta ' + fmtv(id, c.sum / c.n) + ' | min ' + fmtv(id, c.min) + ' | maks ' + fmtv(id, c.max) + ' | oxuma ' + c.n + (an.dtMed[id] ? ' | median Δt ' + an.dtMed[id].toFixed(2) + ' s' : '') : ''));
    });
    var rp = sn.rawPids; if (rp && !rp.error && Object.keys(rp).length) { L.push(''); L.push('Dekoderi olmayan, ECU-nun dəstəklədiyi PID-lərin xam cavabı:'); Object.keys(rp).forEach(function (k) { L.push('  ' + k + ': ' + rp[k]); }); }
    L.push('ECU-nun dəstəklədiyi PID-lər (' + s.supported.length + '): ' + (s.supported.join(' ') || '—'));
    if (s.supported.length) { var uns = Object.keys(window.PIDS || {}).filter(function (x) { return /^[0-9A-F]{2}$/.test(x) && s.supported.indexOf(x) < 0 && parseInt(x, 16) % 32 !== 0; }).sort(); L.push('ECU dəstəkləmir, UNSUPPORTED (nasazlıq deyil; ' + uns.length + '): ' + (uns.join(' ') || '—')); }

    H('9. MODE 06 (xam, PASS/FAIL elan edilmir)');
    var m6 = sn.mode06;
    if (!m6 || m6.error) L.push('Oxunmayıb' + (m6 && m6.error ? ': ' + m6.error : '') + '.');
    else {
      L.push('Dəstəklənən MID-lər: ' + m6.list.map(function (x) { return ('0' + x.toString(16)).slice(-2).toUpperCase(); }).join(' '));
      m6.reads.forEach(function (r) {
        var nm = r.midName ? ' (' + r.midName + ')' : '';
        L.push('MID ' + ('0' + r.mid.toString(16)).slice(-2).toUpperCase() + nm + ':' + (r.error ? ' xəta ' + r.error : ''));
        (r.tests || []).forEach(function (t) { L.push('  TID ' + ('0' + t.tid.toString(16)).slice(-2).toUpperCase() + ' UASID ' + ('0' + (t.uasid !== undefined ? t.uasid : t.unit).toString(16)).slice(-2).toUpperCase() + ' | dəyər ' + t.v + ' | limit ' + t.mn + '…' + t.mx + ' | ' + (t.limit === 'IN' ? 'ECU limitləri daxilində' : t.limit === 'OUT' ? 'ECU limitlərindən kənarda' : 'müqayisə edilmir') + ' | ' + (t.status || 'UNKNOWN') + (t.mapped ? '' : ' (TID xəritələnməyib)') + (t.flags && t.flags.length ? ' | ' + t.flags.join(', ') : '') + ' | xam: ' + (t.rawHex || '—')); });
        (r.notes || []).forEach(function (n) { L.push('  qeyd: ' + n); });
      });
    }
    H('10. MƏHDUDİYYƏTLƏR');
    L.push('Bu jurnal yalnız adapterin ECU-dan oxuya bildiyi məlumatdır. PID-lər növbə ilə oxunduğu üçün nümunələr eyni anda ölçülməyib; median Δt cədvəldədir. Mode 06 TID-ləri (0x80–0xFF) istehsalçıya məxsusdur və təsdiqlənmiş xəritə olmadan şərh olunmur.');
    if (an.rows.indexOf && an.rows.some(function (k) { return k.indexOf('UNKNOWN') === 0; })) L.push('Bəzi saniyələrdə RPM oxunmayıb: həmin vaxt rejim UNKNOWN sayılıb.');
    if (window.Log && Log.safe) { H('11. ADAPTER JURNALI (son ' + (full ? 120 : 60) + ' sətir)'); L.push(Log.safe(full ? 120 : 60).join('\n')); }
    if (opts.raw) {
      H('12. XAM NÜMUNƏLƏR (CSV: saniyə, PID, dəyər)');
      s.ev.forEach(function (e) { L.push((e[0] / 1000).toFixed(2) + ',' + s.ids[e[1]] + ',' + e[2]); });
    } else if (full) L.push('\n(Xam nümunələr bu mətndə yoxdur: "TXT yüklə" faylına əlavə olunur.)');
    return L.join('\n');
  }

  return {
    start: start, stop: stop, resume: resume, takeOver: takeOver,
    setAuto: function (v) { autoOn = !!v; try { if (window.Store) Store.set('autolog_auto', autoOn); } catch (e) {} }, auto: function () { return autoOn; }, clear: clear, restore: restore, sample: sample, snapshot: function () { if (cur) snapshot(cur); },
    session: function () { return cur; }, analyze: analyze, events: keyEvents, build: build, status: pidStatus, classify: classify,
    on: function (f) { subs.push(f); }, create: create, feed: feed, setCurrent: function (s) { cur = s; }
  };
})();
