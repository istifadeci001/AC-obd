window.OBD = (function () {
  var subs = [];
  var S = {
    state: 'idle', deviceId: null, deviceName: '', elmVersion: '', protocol: '',
    supported: [], values: {}, selected: [], polling: false, rate: 0,
    error: '', warns: [], user: false, reconnecting: false
  };
  var loopRunning = false;

  function emit(t) { subs.forEach(function (f) { try { f(t); } catch (e) {} }); }
  function setState(s) { S.state = s; Log.add('STATE', s); emit('state'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hex2(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }

  function parsePid(lines, pid) {
    var want = '41' + pid.toUpperCase();
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].replace(/\s/g, '').toUpperCase();
      var k = s.indexOf(want);
      if (k === 0) {
        var h = s.substr(k + 4), out = [];
        for (var j = 0; j + 1 < h.length; j += 2) {
          var n = parseInt(h.substr(j, 2), 16);
          if (isNaN(n)) break;
          out.push(n);
        }
        return out;
      }
    }
    return null;
  }

  // Bir neçə ECU (7E8 mühərrik, 7E9 ötürmə) eyni 0100/0120 sorğusuna cavab verə bilər; cavab sırası sabit deyil.
  // Dəstək maskası üçün ən çox PID bildirən (mühərrik) cavab seçilir ki, nəticə sıradan asılı olmasın.
  function parseMaskBest(lines, pid) {
    var want = '41' + pid.toUpperCase(), best = null, bestN = -1;
    for (var i = 0; i < lines.length; i++) {
      var one = parsePid([lines[i]], pid);
      if (!one || one.length < 4) continue;
      var n = 0;
      for (var j = 0; j < 4; j++) for (var k = 0; k < 8; k++) if (one[j] & (1 << k)) n++;
      if (n > bestN) { bestN = n; best = one; }
    }
    return best;
  }

  function candidates(services) {
    var STD = /^0000(1800|1801|180a)/i, chars = [];
    services.forEach(function (s) {
      if (STD.test(s.uuid)) return;
      (s.characteristics || []).forEach(function (c) {
        chars.push({ svc: s.uuid, uuid: c.uuid, p: c.properties || {} });
      });
    });
    var W = chars.filter(function (c) { return c.p.write || c.p.writeWithoutResponse; });
    var N = chars.filter(function (c) { return c.p.notify || c.p.indicate; });
    var pairs = [];
    W.forEach(function (w) { N.forEach(function (n) { pairs.push({ w: w, n: n, same: w.svc === n.svc }); }); });
    pairs.sort(function (a, b) { return (b.same ? 1 : 0) - (a.same ? 1 : 0); });
    return pairs;
  }

  async function probe(services) {
    services.forEach(function (s) {
      Log.add('GATT', 'xidmət ' + s.uuid);
      (s.characteristics || []).forEach(function (c) {
        var p = c.properties || {}, f = [];
        ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].forEach(function (k) { if (p[k]) f.push(k); });
        Log.add('GATT', '   xarakt. ' + c.uuid + ' [' + f.join(',') + ']');
      });
    });
    var pairs = candidates(services);
    if (!pairs.length) throw new Error('Yazıla bilən və bildiriş verən xarakteristika tapılmadı');
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      Transport.bind(p.w.svc, p.w.uuid, p.n.svc, p.n.uuid, p.w.p.writeWithoutResponse);
      Log.add('PROBE', 'yaz=' + p.w.uuid + ' oxu=' + p.n.uuid);
      try {
        await Transport.startNotify(ELM.onData);
        var lines = await ELM.send('ATZ', 4000);
        var s = lines.join(' ');
        if (/ELM|STN|OBD/i.test(s)) { S.elmVersion = s; return true; }
        Log.add('PROBE', 'uyğun cavab deyil: ' + s);
      } catch (e) {
        Log.add('PROBE', 'alınmadı: ' + e.message);
      }
      await Transport.stopNotify();
    }
    return false;
  }

  async function init() {
    var cmds = ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'];
    S.warns = [];
    for (var i = 0; i < cmds.length; i++) {
      var lines = await ELM.send(cmds[i], 2500);
      var s = lines.join(' ');
      if (!/OK/i.test(s)) S.warns.push(cmds[i] + ' → ' + (s || 'cavab yoxdur'));
    }
  }

  async function detectEcu() {
    var supported = [], base = 0;
    while (true) {
      var pid = hex2(base);
      var lines = await ELM.send('01' + pid, base === 0 ? 15000 : 3000);
      var b = parseMaskBest(lines, pid);
      if (!b || b.length < 4) {
        if (base === 0) {
          S.error = 'ECU cavab vermir: ' + (lines.join(' ') || 'cavab yoxdur') + '. Açarın ON vəziyyətdə olduğunu yoxlayın.';
          S.supported = [];
          return false;
        }
        break;
      }
      var mask = b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3];
      for (var i = 0; i < 32; i++) {
        if (Math.floor(mask / Math.pow(2, 31 - i)) % 2 === 1) supported.push(base + i + 1);
      }
      if (supported.indexOf(base + 0x20) < 0 || base >= 0xA0) break;
      base += 0x20;
    }
    S.supported = supported.filter(function (p) { return p % 0x20 !== 0; }).map(hex2);
    try {
      var dp = await ELM.send('ATDP', 2500);
      S.protocol = dp.join(' ');
    } catch (e) {}
    S.error = '';
    return true;
  }

  async function connect(id, name) {
    S.user = false; S.deviceId = id; S.deviceName = name || id;
    // başqa avtomobil ola bilər: əvvəlki avtomobilin kodları və VIN qalmasın
    if (window.Session) { Session.ctx.dtc = null; Session.ctx.freeze = null; Session.ctx.vin = ''; Session.ctx.cal = ''; }
    S.error = ''; S.elmVersion = ''; S.protocol = ''; S.supported = []; S.values = {};
    setState('connecting');
    try {
      var services = await Transport.connect(id, onDisconnect);
      setState('probing');
      var ok = await probe(services);
      if (!ok) throw new Error('Adapter ELM327 cavabı vermədi (heç bir xarakteristika cütü işləmədi)');
      await init();
      var ecu = await detectEcu();
      if (ecu) { defaultSelection(); setState('ecu'); }
      else setState('elm');
    } catch (e) {
      Log.add('ERR', e.message);
      S.error = e.message;
      setState('error');
      try { await Transport.disconnect(); } catch (x) {}
    }
  }

  async function retryEcu() {
    try {
      setState('probing');
      var ok = await detectEcu();
      if (ok) { defaultSelection(); setState('ecu'); } else setState('elm');
    } catch (e) { S.error = e.message; setState('elm'); }
  }

  function defaultSelection() {
    var pref = ['0C', '0D', '05', '04', '11', '0F', '10', '0B', '06', '07'];
    S.selected = pref.filter(function (p) { return S.supported.indexOf(p) >= 0 && window.PIDS[p]; });
    S.selected.push('RV');
  }

  async function disconnect() {
    S.user = true; S.polling = false;
    ELM.abort('user');
    await Transport.disconnect();
    S.deviceName = ''; S.elmVersion = ''; S.protocol = ''; S.supported = []; S.error = '';
    setState('idle');
  }

  async function onDisconnect() {
    if (S.user || S.state === 'idle' || S.reconnecting) return;
    var was = S.polling;
    S.polling = false;
    ELM.abort('disconnected');
    S.reconnecting = true;
    setState('reconnecting');
    for (var n = 1; n <= 5; n++) {
      await sleep(1500 * n);
      if (S.user) break;
      try {
        await Transport.reconnect();
        await Transport.startNotify();
        await ELM.send('ATZ', 4000);
        await init();
        var ok = await detectEcu();
        if (ok) {
          S.reconnecting = false;
          setState('ecu');
          if (was) startPoll(S.selected);
          return;
        }
      } catch (e) { Log.add('ERR', 'yenidən qoşulma ' + n + ': ' + e.message); }
    }
    S.reconnecting = false;
    if (!S.user) { S.error = 'Bağlantı bərpa olunmadı'; setState('error'); }
  }

  async function readOne(id) {
    var p = window.PIDS[id];
    var rec = S.values[id] || (S.values[id] = { v: null, min: null, max: null, hist: [], nodata: false, n: 0, bad: 0, nd: 0, invalid: '', ts: [], aux: null });
    if (id === 'RV') {
      var l = await ELM.send('ATRV', 2000);
      var m = /([\d.]+)\s*V/i.exec(l.join(' '));
      if (!m) { rec.nodata = true; rec.nd = (rec.nd || 0) + 1; return; }
      store(rec, { v: parseFloat(m[1]) });
      return;
    }
    var lines = await ELM.send('01' + id, 2500);
    var b = parsePid(lines, id);
    if (!b) { rec.nodata = true; rec.nd = (rec.nd || 0) + 1; return; }
    var r;
    try { r = p.dec(b); } catch (e) { r = null; }
    if (r && r.invalid) { rec.nodata = true; rec.invalid = String(r.invalid); rec.bad = (rec.bad || 0) + 1; return; }
    if (!r || !isFinite(r.v)) { rec.nodata = true; rec.nd = (rec.nd || 0) + 1; return; }
    store(rec, r);
  }

  function store(rec, r) {
    if (S.sim) return; // simulyasiya (selftest) məlumatı real göstəricilərə düşmür
    rec.v = r.v; rec.txt = r.txt; rec.nodata = false; rec.t = Date.now();
    rec.invalid = ''; rec.n = (rec.n || 0) + 1; rec.aux = r.aux || null;
    rec.ts = rec.ts || []; rec.ts.push(rec.t); if (rec.ts.length > 120) rec.ts.shift();
    if (rec.min === null || r.v < rec.min) rec.min = r.v;
    if (rec.max === null || r.v > rec.max) rec.max = r.v;
    rec.hist.push(r.v);
    if (rec.hist.length > 240) rec.hist.shift();
  }

  async function pollLoop() {
    if (loopRunning) return;
    loopRunning = true;
    var fails = 0, cnt = 0, t0 = Date.now();
    while (S.polling && S.state === 'ecu') {
      var list = S.selected.slice();
      if (!list.length) { await sleep(300); continue; }
      for (var i = 0; i < list.length; i++) {
        if (!S.polling || S.state !== 'ecu') break;
        try { await readOne(list[i]); fails = 0; }
        catch (e) { fails++; }
        cnt++;
        var now = Date.now();
        if (now - t0 >= 2000) { S.rate = cnt * 1000 / (now - t0); cnt = 0; t0 = now; }
        emit('value');
        if (fails >= 8) {
          Log.add('ERR', 'ardıcıl 8 cavabsız sorğu, oxuma dayandı');
          S.polling = false; S.error = 'Adapter cavab vermir';
          setState('elm');
          break;
        }
      }
    }
    loopRunning = false;
    emit('state');
  }

  function startPoll(ids) {
    if (S.state !== 'ecu') return;
    S.selected = ids.slice();
    S.values = {};
    S.polling = true; S.rate = 0;
    pollLoop();
    emit('state');
  }
  function stopPoll() { S.polling = false; emit('state'); }
  function setSelected(ids) { S.selected = ids.slice(); emit('state'); }

  return {
    S: S,
    get state() { return S.state; },
    get values() { return S.values; },
    get selected() { return S.selected; },
    get supported() { return S.supported; },
    get polling() { return S.polling; },
    get rate() { return S.rate; },
    on: function (f) { subs.push(f); },
    scan: Transport.scan,
    connect: connect, disconnect: disconnect, retryEcu: retryEcu,
    startPoll: startPoll, stopPoll: stopPoll, setSelected: setSelected
  };
})();

// AC OBD: Mode 06 etibarlı dekodlaşdırma + xam log. Əlavə moduldur: OBD.mode06Read-i eyni formatda əvəz edir.
// obd-extra.js-dən SONRA yüklənməlidir.
(function () {
  'use strict';
  var RAW = [], MAXRAW = 3000;
  function hex(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }
  function hexs(a) { return a.map(hex).join(' '); }
  function bytes(h) { var o = []; for (var i = 0; i + 1 < h.length; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o; }
  function s16(n) { return n > 32767 ? n - 65536 : n; }

  // Bütün ELM cavabları (Mode 01 daxil) böyük, ayrıca jurnalda saxlanır. Log (400 sətir) bunu itirir.
  window.RawLog = {
    add: function (cmd, lines) { RAW.push({ t: new Date().toISOString(), cmd: cmd, lines: lines }); if (RAW.length > MAXRAW) RAW.shift(); },
    all: function () { return RAW.slice(); },
    clear: function () { RAW = []; },
    text: function () { return RAW.map(function (e) { return e.t + ' TX ' + e.cmd + '\n' + (e.lines || []).map(function (l) { return '    RX ' + l; }).join('\n'); }).join('\n'); }
  };
  if (window.ELM && !ELM.rawWrapped) {
    var orig = ELM.send;
    ELM.send = function (cmd, t) {
      return orig(cmd, t).then(function (l) { RawLog.add(cmd, l); return l; }, function (e) { RawLog.add(cmd, ['ERR ' + e.message]); throw e; });
    };
    ELM.rawWrapped = true;
  }

  // ISO-TP: "01C" uzunluq sətri + "N:" çərçivələr. Padding uzunluğa görə kəsilir (təxminlə yox).
  function reassemble(lines) {
    var msgs = [], cur = null, len = null;
    function flush() {
      if (cur === null) return;
      var h = cur, complete = true;
      if (len !== null) { complete = h.length >= len * 2; h = h.slice(0, len * 2); }
      msgs.push({ hex: h, len: len, complete: complete });
      cur = null; len = null;
    }
    (lines || []).forEach(function (l) {
      var s = String(l).replace(/\s/g, '').toUpperCase(), m;
      if (!s || /[G-Z?]/.test(s)) return;
      if (/^[0-9A-F]{3}$/.test(s)) { flush(); len = parseInt(s, 16); cur = ''; return; }
      m = /^[0-9A-F]:([0-9A-F]*)$/.exec(s);
      if (m) { if (cur === null) cur = ''; cur += m[1]; return; }
      flush(); cur = s; flush();
    });
    flush();
    return msgs;
  }

  function layoutOf(p, mid) {
    var i, ok = p.length >= 9 && p.length % 9 === 0;
    if (ok) { for (i = 0; i < p.length; i += 9) if (p[i] !== mid) ok = false; if (ok) return 'mid9'; }
    if (p.length >= 9 && (p.length - 1) % 8 === 0 && p[0] === mid) return 'mid1';
    return null;
  }

  // Yalnız təsdiqlənmiş istehsalçı/standart xəritələr bura əlavə edilir: açar "MID:TID:UASID".
  // Dəyər: { name, failIfOut: true }. Boş olduqda heç bir test PASS/FAIL sayılmır (UNKNOWN qalır).
  var MAP = {};
  var MID_NAME = { 0x01: 'O2 sensor monitoru B1S1', 0x02: 'O2 sensor monitoru B1S2', 0x21: 'Katalizator monitoru B1' };

  function decode(mid, d, trimmed, m, k) {
    var tid = d[0], ua = d[1], sg = ua >= 0x80;
    var rv = d[2] * 256 + d[3], rmn = d[4] * 256 + d[5], rmx = d[6] * 256 + d[7];
    var cv = sg ? s16(rv) : rv, cmn = sg ? s16(rmn) : rmn, cmx = sg ? s16(rmx) : rmx;
    var flags = [];
    if (rv === 0xAAAA || rmn === 0xAAAA || rmx === 0xAAAA) flags.push('0xAAAA doldurucu');
    if (rv === 0xFFFF) flags.push('dəyər 0xFFFF (xüsusi)');
    if (rv === 0x7FFF) flags.push('dəyər 0x7FFF (xüsusi)');
    var inv = cmn > cmx;
    if (inv) flags.push('min > maks: dekodlaşdırma şübhəli');
    var limit = (flags.length || inv) ? 'NA' : ((cv >= cmn && cv <= cmx) ? 'IN' : 'OUT');
    var map = MAP[hex(mid) + ':' + hex(tid) + ':' + hex(ua)] || null, status = 'UNKNOWN';
    if (map && limit !== 'NA') status = (limit === 'IN') ? 'PASS' : (map.failIfOut ? 'FAIL' : 'UNKNOWN');
    return {
      mid: mid, tid: tid, unit: ua, uasid: ua, v: cv, mn: cmn, mx: cmx, signed: sg,
      ok: cv >= cmn && cv <= cmx,            // köhnə sahə (yalnız hədlər arası), nəticə deyil
      limit: limit, status: status, flags: flags, name: map ? map.name : null,
      mapped: !!map, ecu: null,               // ATH0 olduğu üçün ECU ünvanı məlum deyil
      rawHex: hex(mid) + ' ' + hexs(d), rawVal: hex(d[2]) + hex(d[3]), rawMin: hex(d[4]) + hex(d[5]), rawMax: hex(d[6]) + hex(d[7]),
      decodeConf: trimmed ? 'orta' : (m.len !== null ? 'yüksək' : 'yüksək (tək çərçivə)')
    };
  }

  function parse06(lines, mid) {
    var M = hex(mid), res = { mid: mid, midName: MID_NAME[mid] || null, tests: [], notes: [], layout: null };
    reassemble(lines).forEach(function (m) {
      if (m.hex.indexOf('46' + M) !== 0) return;
      var p = bytes(m.hex).slice(1), trimmed = false, lay = layoutOf(p, mid);
      if (!m.complete) res.notes.push('Natamam ISO-TP mesajı');
      if (!lay && m.len === null) {
        var c = p.slice(); while (c.length && c[c.length - 1] === 0xAA) c.pop();
        lay = layoutOf(c, mid); if (lay) { p = c; trimmed = true; }
      }
      if (!lay) { res.notes.push('Struktur uyğun gəlmir, dekodlaşdırılmadı: ' + hexs(p)); return; }
      res.layout = lay;
      var n = lay === 'mid9' ? p.length / 9 : (p.length - 1) / 8;
      for (var i = 0; i < n; i++) {
        var s = lay === 'mid9' ? i * 9 + 1 : 1 + i * 8;
        res.tests.push(decode(mid, p.slice(s, s + 8), trimmed, m, i));
      }
    });
    return res;
  }

  async function mode06Read(mid) {
    var cmd = '06' + hex(mid), lines = await ELM.send(cmd, 5000);
    var r = parse06(lines, mid);
    r.cmd = cmd; r.rawLines = lines.slice(); r.t = new Date().toISOString();
    return r;
  }
  window.Mode06 = { parse: parse06, reassemble: reassemble, MAP: MAP };
  if (window.OBD) { OBD.parse06 = parse06; OBD.mode06Read = mode06Read; }
})();

// ---- PID statusları (REAL/STALE/UNSUPPORTED/INVALID/UNKNOWN) və sensorlar arası zaman fərqi ----
(function () {
  'use strict';
  var STALE_MS = 8000, MAX_DT = 0.4;
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function dts(ts) { var d = []; for (var i = 1; i < ts.length; i++) d.push((ts[i] - ts[i - 1]) / 1000); return d; }
  function statusOf(id, now) {
    now = now || Date.now();
    var S = OBD.S, r = OBD.values[id];
    if (S.sim) return { status: 'INVALID', reason: 'simulyasiya/saxta məlumat: real ECU göstəricisi deyil', n: 0, bad: 0, nodata: 0, age: null };
    if (id !== 'RV' && OBD.supported && OBD.supported.length && OBD.supported.indexOf(id) < 0) return { status: 'UNSUPPORTED', reason: 'ECU bu PID-i dəstəkləmir (nasazlıq deyil)', n: 0, bad: 0, nodata: 0, age: null };
    if (!r) return { status: 'UNKNOWN', reason: 'hələ sorğulanmayıb', n: 0, bad: 0, nodata: 0, age: null };
    var n = r.n || 0, o = { n: n, bad: r.bad || 0, nodata: r.nd || 0, age: r.t ? (now - r.t) / 1000 : null };
    if (r.invalid) { o.status = 'INVALID'; o.reason = r.invalid; return o; }
    if (!n || r.v === null) { o.status = 'UNKNOWN'; o.reason = 'ECU-dan etibarlı cavab gəlməyib'; return o; }
    if (r.nodata || now - r.t > STALE_MS) { o.status = 'STALE'; o.reason = r.nodata ? 'son sorğuya cavab gəlmədi, göstərilən dəyər köhnədir' : 'dəyər ' + Math.round((now - r.t) / 1000) + ' s əvvəl oxunub'; return o; }
    o.status = 'REAL'; o.reason = ''; return o;
  }
  // a və b PID-lərinin median Δt-si və aralarındakı median zaman fərqi; tezlik kifayət etmirsə valid=false
  function timing(a, b) {
    var ra = OBD.values[a], rb = OBD.values[b], ta = (ra && ra.ts) || [], tb = (rb && rb.ts) || [];
    var o = { a: a, b: b, dtA: med(dts(ta)), dtB: med(dts(tb)), lag: null, nA: ta.length, nB: tb.length, maxDt: MAX_DT, valid: false, reason: '' };
    if (ta.length < 8 || tb.length < 8) { o.reason = 'nümunə sayı kifayət deyil (hər sensor üçün ≥8 lazımdır)'; return o; }
    o.lag = med(ta.map(function (t) { var best = Infinity; tb.forEach(function (u) { var d = Math.abs(u - t); if (d < best) best = d; }); return best / 1000; }));
    if (o.dtA > MAX_DT || o.dtB > MAX_DT) o.reason = 'median Δt > ' + MAX_DT.toFixed(2) + ' s: tezlik kifayət etmir, müqayisə etibarsızdır';
    else o.valid = true;
    return o;
  }
  OBD.statusOf = statusOf; OBD.timing = timing; OBD.med = med;
})();

