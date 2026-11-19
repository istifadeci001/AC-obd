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
  async function raw(cmd, t, tries) {
    var l = tries ? await ELM.sendRetry(cmd, t || 3000, tries) : await ELM.send(cmd, t || 3000);
    var c = clean(l);
    return { msgs: msgs(c), txt: txtOf(c) };
  }
  // Eyni PID-ə bir neçə ECU cavab verə bilər. ATH0 ilə ECU ünvanı görünmür və sıra sabit deyil (real jurnalda
  // 0101 cavabları növbə ilə dəyişirdi), ona görə birinci sətri götürmək əvəzinə HAMISINI qaytarırıq.
  async function readAll(pid, tries) {
    var r = await raw('01' + pid, 3000, tries), out = [];
    r.msgs.forEach(function (x) {
      if (x.indexOf('41' + pid) !== 0) return;
      var b = bytesOf(x.slice(4));
      if (b.length) out.push({ b: b, hex: x });
    });
    return out;
  }
  function bits(n) { var c = 0; while (n) { c += n & 1; n >>= 1; } return c; }
  // PID 01: mühərrik ECU-su ən çox monitor dəstəkləyəndir (B bit0–2 + C). Bərabərlikdə seçim edilmir (ambiguous).
  function monCount(b) { return bits((b[1] || 0) & 7) + bits(b[2] || 0); }
  async function readNum(pid) {
    var r = await raw('01' + pid, 3000);
    var f = r.msgs.filter(function (x) { return x.indexOf('41' + pid) === 0; })[0];
    if (!f) return null;
    var b = bytesOf(f.slice(4));
    return b.length ? b : null;
  }

  // protokol bilinmirsə CAN sayğac baytı kod kimi oxunar (səhv kodlar). Əvvəl protokolu dəqiqləşdiririk.
  async function protoKind() {
    var unk = function () { return !S.protocol || /^\s*AUTO\s*,?\s*$/i.test(S.protocol); };
    if (unk()) {
      try { var dp = await ELM.send('ATDP', 2500); S.protocol = dp.join(' '); } catch (e) {}
    }
    if (unk()) return 'unknown';
    return /CAN|15765/i.test(S.protocol) ? 'can' : 'other';
  }
  async function readDtcs(mode) {
    var kind = await protoKind();
    if (kind === 'unknown') return { ok: false, codes: [], status: 'protokol bilinmir, kodlar səhv oxunmasın deyə oxuma edilmədi' };
    var r = await raw(mode, 9000, 1);
    var resp = ('0' + (parseInt(mode, 16) + 0x40).toString(16)).slice(-2).toUpperCase();
    var isCan = kind === 'can';
    var got = false, codes = [], reported = [], t = new Date().toISOString();
    r.msgs.forEach(function (x) {
      if (x.indexOf(resp) !== 0) return;
      got = true;
      var h = x.slice(2);
      if (isCan) { reported.push(parseInt(h.slice(0, 2), 16)); h = h.slice(2); }
      var b = bytesOf(h);
      for (var i = 0; i + 1 < b.length; i += 2) {
        if (!b[i] && !b[i + 1]) continue;
        var n = dtcName(b[i], b[i + 1]);
        if (codes.indexOf(n) < 0) codes.push(n);
      }
    });
    if (!got) return { ok: false, codes: [], status: r.txt.length ? r.txt.join(' ') : 'cavab yoxdur', t: t, mode: mode, count: 0, raw: r.msgs.slice() };
    // count = bu statusda tapılan fərqli kodların sayı; reported = ECU-ların bildirdiyi sayğac (CAN), hər ECU üçün ayrı.
    var sum = reported.reduce(function (a, n) { return a + (isNaN(n) ? 0 : n); }, 0);
    return { ok: true, codes: codes, status: '', t: t, mode: mode, count: codes.length, reported: reported, consistent: !reported.length || sum === codes.length, raw: r.msgs.slice() };
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
      var best = null, bn = -1;
      r.msgs.filter(function (x) { return x.indexOf('420000') === 0; }).forEach(function (x) {
        var b = bytesOf(x.slice(6));
        if (b.length < 4) return;
        var n = maskList(b, 0).length;
        if (n > bn) { bn = n; best = b; }
      });
      if (!best) return null;
      return maskList(best, 0).map(hex2);
    } catch (e) { return null; }
  }
  async function readFreeze() {
    var res = { dtc: null, pids: {}, status: '' };
    var r = await raw('020200', 6000);
    // Bir neçə ECU cavab verə bilər (biri "DTC yoxdur" = 0000): sıraya yox, DTC-si olan cavaba baxırıq.
    var fc = r.msgs.filter(function (x) { return x.indexOf('4202') === 0; });
    var f = fc.filter(function (x) { var q = bytesOf(x.slice(6)); return q.length >= 2 && (q[0] || q[1]); })[0] || fc[0];
    res.t = new Date().toISOString();
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
    var r = await raw('09' + pid, 5000), pre = '49' + pid, b = [];
    r.msgs.forEach(function (s) {
      if (s.indexOf(pre) !== 0) return; // başqa cavab sətirləri VIN-ə qarışmasın
      b = b.concat(bytesOf(s.slice(6)));
    });
    return b.filter(function (n) { return n >= 32 && n < 127; })
      .map(function (n) { return String.fromCharCode(n); }).join('');
  }
  async function readVehicleInfo() {
    var vin = '', cal = '';
    try { vin = await mode09('02'); } catch (e) { Log.add('ERR', 'VIN: ' + e.message); }
    try { cal = await mode09('04'); } catch (e) { Log.add('ERR', 'CAL: ' + e.message); }
    if (vin.length > 17) vin = vin.slice(-17);
    vin = vin.toUpperCase();
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { Log.add('ERR', 'VIN formatı yanlışdır (' + vin.length + ' simvol), qəbul edilmədi'); vin = ''; }
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
    var cands = await readAll('01', 1);
    cands = cands.filter(function (c) { return c.b.length >= 4; });
    if (!cands.length) return null;
    var info = cands.map(function (c) { return { hex: c.hex, mil: !!(c.b[0] & 128), count: c.b[0] & 127, mon: monCount(c.b) }; });
    var sel = 0, tie = false;
    cands.forEach(function (c, i) { if (info[i].mon > info[sel].mon) sel = i; });
    cands.forEach(function (c, i) { if (i !== sel && info[i].mon === info[sel].mon && cands[i].hex !== cands[sel].hex) tie = true; });
    var b = cands[sel].b;
    var A = b[0], B = b[1], C = b[2], D = b[3];
    // MIL = PID 01-in A baytının 7-ci biti; DTC sayı = A bit0–6 (seçilmiş mühərrik ECU-su üçün)
    var res = { mil: !!(A & 128), count: A & 127, diesel: !!(B & 8), items: [], t: new Date().toISOString(), source: 'PID01', ecus: cands.length, selected: sel, ambiguous: tie, candidates: info, raw: cands[sel].hex };
    function add(name, sup, inc) { res.items.push({ name: name, sup: !!sup, done: sup ? !inc : null }); }
    add('Misfire (yanma buraxma)', B & 1, B & 16);
    add('Fuel System (yanacaq sistemi)', B & 2, B & 32);
    add('Components (komponentlər)', B & 4, B & 64);
    if (res.diesel) {
      ['NMHC katalizator', 'NOx/SCR işləmə sonrası', null, 'Təzyiq artırma (boost)', null, 'Egzoz qaz sensoru', 'PM filtri', 'EGR/VVT']
        .forEach(function (n, k) { if (n) add(n, (C >> k) & 1, (D >> k) & 1); });
    } else {
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
        // J1979: UASID >= 0x80 işarəli (signed) 16-bit dəyərdir
        var sg = b[i + 1] >= 0x80;
        var u16 = function (h, l) { var n = h * 256 + l; return sg && n > 32767 ? n - 65536 : n; };
        var v = u16(b[i + 2], b[i + 3]), mn = u16(b[i + 4], b[i + 5]), mx = u16(b[i + 6], b[i + 7]);
        tests.push({ tid: b[i], unit: b[i + 1], v: v, mn: mn, mx: mx, signed: sg, ok: v >= mn && v <= mx });
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
  OBD.readAll = readAll;
  OBD.mode06List = mode06List;
  // obd.js (əvvəl yüklənir) düzgün 9-baytlıq (MID təkrarlanan) parseri OBD.mode06Read kimi qoyub. Köhnə 8-baytlıq
  // variant yalnız yeni parser YOXDURsa ehtiyat kimi qalır; əks halda çoxqeydli cavablar səhv dekod olunurdu.
  if (!OBD.parse06) OBD.mode06Read = mode06Read;
  OBD.mode06Legacy = mode06Read;
})();
