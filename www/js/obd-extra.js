(function () {
  var S = OBD.S;

  function clean(lines) {
    var out = [];
    (lines || []).forEach(function (l) {
      var s = String(l).replace(/\s/g, '').toUpperCase();
      var cont = false, m = /^([0-9A-F]):/.exec(s);
      if (m) { cont = m[1] !== '0'; s = s.slice(2); }
      else if (/^[0-9A-F]{3}$/.test(s)) return;
      out.push({ s: s, cont: cont });
    });
    return out;
  }
  function isTxt(s) { return /[G-Z?]/.test(s); }
  function txtOf(c) {
    return c.filter(function (e) { return isTxt(e.s); }).map(function (e) { return e.s; });
  }
  function msgs(c) {
    var m = [];
    c.forEach(function (e) {
      if (isTxt(e.s)) return;
      if (e.cont && m.length) m[m.length - 1] += e.s; else m.push(e.s);
    });
    return m;
  }
  function bytesOf(h) {
    var o = [];
    for (var i = 0; i + 1 < h.length; i += 2) {
      var n = parseInt(h.substr(i, 2), 16);
      if (isNaN(n)) break;
      o.push(n);
    }
    return o;
  }
  function hex2(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }
  function dtcName(b1, b2) {
    var t = ['P', 'C', 'B', 'U'][b1 >> 6];
    return t + ((b1 >> 4) & 3) + (b1 & 15).toString(16).toUpperCase() + ('0' + b2.toString(16)).slice(-2).toUpperCase();
  }
  function maskList(b, base) {
    var m = b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3], out = [];
    for (var i = 0; i < 32; i++) if (Math.floor(m / Math.pow(2, 31 - i)) % 2 === 1) out.push(base + i + 1);
    return out;
  }
  async function raw(cmd, t) {
    var c = clean(await ELM.send(cmd, t || 3000));
    return { msgs: msgs(c), txt: txtOf(c) };
  }
  async function readNum(pid) {
    var r = await raw('01' + pid, 3000);
    var f = r.msgs.filter(function (x) { return x.indexOf('41' + pid) === 0; })[0];
    if (!f) return null;
    var b = bytesOf(f.slice(4));
    return b.length ? b : null;
  }

  async function readDtcs(mode) {
    var r = await raw(mode, 9000);
    var resp = ('0' + (parseInt(mode, 16) + 0x40).toString(16)).slice(-2).toUpperCase();
    var isCan = /CAN/i.test(S.protocol || '');
    var got = false, codes = [];
    r.msgs.forEach(function (x) {
      if (x.indexOf(resp) !== 0) return;
      got = true;
      var h = x.slice(2);
      if (isCan) h = h.slice(2);
      var b = bytesOf(h);
      for (var i = 0; i + 1 < b.length; i += 2) {
        if (!b[i] && !b[i + 1]) continue;
        var n = dtcName(b[i], b[i + 1]);
        if (codes.indexOf(n) < 0) codes.push(n);
      }
    });
    if (!got) return { ok: false, codes: [], status: r.txt.length ? r.txt.join(' ') : 'cavab yoxdur' };
    return { ok: true, codes: codes, status: '' };
  }

  async function clearDtcs() {
    var r = await raw('04', 9000);
    var all = r.msgs.concat(r.txt).join(' ') || 'cavab yoxdur';
    if (r.msgs.some(function (x) { return x.indexOf('44') === 0; })) return { ok: true, nrc: '', raw: all };
    var n = r.msgs.filter(function (x) { return x.indexOf('7F04') === 0; })[0];
    return { ok: false, nrc: n ? n.slice(4, 6) : '', raw: all };
  }

  async function freezeSupported() {
    try {
      var r = await raw('020000', 4000);
      var f = r.msgs.filter(function (x) { return x.indexOf('420000') === 0; })[0];
      if (!f) return null;
      var b = bytesOf(f.slice(6));
      if (b.length < 4) return null;
      return maskList(b, 0).map(hex2);
    } catch (e) { return null; }
  }
  async function readFreeze() {
    var res = { dtc: null, pids: {}, status: '' };
    var r = await raw('020200', 6000);
    var f = r.msgs.filter(function (x) { return x.indexOf('4202') === 0; })[0];
    if (!f) { res.status = r.txt.join(' ') || 'cavab yoxdur'; return res; }
    var b = bytesOf(f.slice(6));
    if (b.length >= 2 && (b[0] || b[1])) res.dtc = dtcName(b[0], b[1]);
    if (!res.dtc) { res.status = 'Freeze Frame saxlanmayıb'; return res; }
    var sup = (await freezeSupported()) || S.supported;
    var want = ['04', '05', '06', '07', '0B', '0C', '0D', '0E', '0F', '10', '11'];
    for (var i = 0; i < want.length; i++) {
      var pid = want[i], p = window.PIDS[pid];
      if (!p || sup.indexOf(pid) < 0) continue;
      try {
        var q = await raw('02' + pid + '00', 4000);
        var pre = '42' + pid + '00';
        var g = q.msgs.filter(function (x) { return x.indexOf(pre) === 0; })[0];
        if (!g) continue;
        var d = p.dec(bytesOf(g.slice(6)));
        if (d && isFinite(d.v)) res.pids[pid] = { v: d.v };
      } catch (e) { Log.add('ERR', 'freeze ' + pid + ': ' + e.message); }
    }
    return res;
  }

  async function mode09(pid) {
    var r = await raw('09' + pid, 10000), pre = '49' + pid, b = [];
    r.msgs.forEach(function (s) {
      b = b.concat(bytesOf(s.indexOf(pre) === 0 ? s.slice(6) : s));
    });
    return b.filter(function (n) { return n >= 32 && n < 127; })
      .map(function (n) { return String.fromCharCode(n); }).join('');
  }
  async function readVehicleInfo() {
    var vin = '', cal = '';
    try { vin = await mode09('02'); } catch (e) { Log.add('ERR', 'VIN: ' + e.message); }
    try { cal = await mode09('04'); } catch (e) { Log.add('ERR', 'CAL: ' + e.message); }
    if (vin.length > 17) vin = vin.slice(-17);
    return { vin: vin, cal: cal };
  }

  function decodeVin(v) {
    v = String(v || '').toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null;
    var reg = { J: 'Yaponiya', K: 'Cənubi Koreya', L: 'Çin', '1': 'ABŞ', '4': 'ABŞ', '5': 'ABŞ', '2': 'Kanada', '3': 'Meksika', W: 'Almaniya', S: 'Böyük Britaniya', V: 'Fransa/İspaniya', Z: 'İtaliya' };
    var letters = 'ABCDEFGHJKLMNPRSTVWXY', c = v[9], i = letters.indexOf(c), yr = '';
    if (i >= 0) yr = (2010 + i) + ' və ya ' + (1980 + i);
    else if (/[1-9]/.test(c)) yr = (2000 + Number(c)) + ' və ya ' + (2030 + Number(c));
    return { region: reg[v[0]] || '—', year: yr || '—' };
  }

  async function readSpeed() { var b = await readNum('0D'); return b ? b[0] : null; }
  async function readRpm() { var b = await readNum('0C'); return b && b.length >= 2 ? (b[0] * 256 + b[1]) / 4 : null; }

  async function readReadiness() {
    var b = await readNum('01');
    if (!b || b.length < 4) return null;
    var A = b[0], B = b[1], C = b[2], D = b[3];
    var res = { mil: !!(A & 128), count: A & 127, diesel: !!(B & 8), items: [] };
    function add(name, sup, inc) { res.items.push({ name: name, sup: !!sup, done: sup ? !inc : null }); }
    add('Misfire (yanma buraxma)', B & 1, B & 16);
    add('Fuel System (yanacaq sistemi)', B & 2, B & 32);
    add('Components (komponentlər)', B & 4, B & 64);
    if (!res.diesel) {
      ['Catalyst (katalizator)', 'Heated Catalyst (isidilən katalizator)', 'EVAP (yanacaq buxarı)', 'Secondary Air (ikinci hava)', 'A/C Refrigerant (kondisioner)', 'O2 Sensor (oksigen sensoru)', 'O2 Sensor Heater (O2 qızdırıcı)', 'EGR/VVT']
        .forEach(function (n, k) { add(n, (C >> k) & 1, (D >> k) & 1); });
    }
    return res;
  }

  async function mode06List() {
    var out = [];
    for (var base = 0; base <= 0xE0; base += 0x20) {
      var id = hex2(base), r = await raw('06' + id, 5000);
      var f = r.msgs.filter(function (x) { return x.indexOf('46' + id) === 0; })[0];
      if (!f) break;
      var b = bytesOf(f.slice(4));
      if (b.length < 4) break;
      var l = maskList(b, base);
      out = out.concat(l.filter(function (x) { return x % 0x20 !== 0; }));
      if (l.indexOf(base + 0x20) < 0) break;
    }
    return out;
  }
  async function mode06Read(mid) {
    var id = hex2(mid), r = await raw('06' + id, 5000), tests = [];
    r.msgs.forEach(function (x) {
      if (x.indexOf('46' + id) !== 0) return;
      var b = bytesOf(x.slice(4));
      for (var i = 0; i + 7 < b.length; i += 8) {
        var v = b[i + 2] * 256 + b[i + 3], mn = b[i + 4] * 256 + b[i + 5], mx = b[i + 6] * 256 + b[i + 7];
        tests.push({ tid: b[i], unit: b[i + 1], v: v, mn: mn, mx: mx, ok: v >= mn && v <= mx });
      }
    });
    return { mid: mid, tests: tests };
  }

  OBD.raw = raw;
  OBD.readDtcs = readDtcs;
  OBD.clearDtcs = clearDtcs;
  OBD.readFreeze = readFreeze;
  OBD.readVehicleInfo = readVehicleInfo;
  OBD.decodeVin = decodeVin;
  OBD.readSpeed = readSpeed;
  OBD.readRpm = readRpm;
  OBD.readReadiness = readReadiness;
  OBD.mode06List = mode06List;
  OBD.mode06Read = mode06Read;
})();
