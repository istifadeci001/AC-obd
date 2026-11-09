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
    o.push(L.date + ': ' + s.t.replace('T', ' ').slice(0, 19));
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
        o.push('  ' + (lang === 'en' ? p.en : p.az) + ': ' + s.freeze.pids[id].v.toFixed(p.fix) + ' ' + p.unit);
      });
    } else o.push('  ' + L.none);
    o.push('', L.live + ':');
    var ids = Object.keys(s.stats || {});
    if (!ids.length) o.push('  ' + L.none);
    ids.forEach(function (id) {
      var p = window.PIDS[id], x = s.stats[id];
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
