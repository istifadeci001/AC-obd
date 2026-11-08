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
      if (k >= 0) {
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
      var b = parsePid(lines, pid);
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
    var rec = S.values[id] || (S.values[id] = { v: null, min: null, max: null, hist: [], nodata: false });
    if (id === 'RV') {
      var l = await ELM.send('ATRV', 2000);
      var m = /([\d.]+)\s*V/i.exec(l.join(' '));
      if (!m) { rec.nodata = true; return; }
      store(rec, { v: parseFloat(m[1]) });
      return;
    }
    var lines = await ELM.send('01' + id, 2500);
    var b = parsePid(lines, id);
    if (!b) { rec.nodata = true; return; }
    var r;
    try { r = p.dec(b); } catch (e) { r = null; }
    if (!r || !isFinite(r.v)) { rec.nodata = true; return; }
    store(rec, r);
  }

  function store(rec, r) {
    rec.v = r.v; rec.txt = r.txt; rec.nodata = false; rec.t = Date.now();
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
