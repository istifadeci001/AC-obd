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
  function dtcName(b1, b2) {
    var t = ['P', 'C', 'B', 'U'][b1 >> 6];
    return t + ((b1 >> 4) & 3) + (b1 & 15).toString(16).toUpperCase() + ('0' + b2.toString(16)).slice(-2).toUpperCase();
  }

  async function readDtcs(mode) {
    var c = clean(await ELM.send(mode, 9000));
    var t = txtOf(c), m = msgs(c);
    var resp = ('0' + (parseInt(mode, 16) + 0x40).toString(16)).slice(-2).toUpperCase();
    var isCan = /CAN/i.test(S.protocol || '');
    var got = false, codes = [];
    m.forEach(function (x) {
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
    if (!got) return { ok: false, codes: [], status: t.length ? t.join(' ') : 'cavab yoxdur' };
    return { ok: true, codes: codes, status: '' };
  }

  async function clearDtcs() {
    var c = clean(await ELM.send('04', 9000));
    var m = msgs(c);
    var ok = m.some(function (x) { return x.indexOf('44') === 0; });
    return { ok: ok, text: ok ? '' : (txtOf(c).concat(m).join(' ') || 'cavab yoxdur') };
  }

  async function readFreeze() {
    var res = { dtc: null, pids: {}, status: '' };
    var c = clean(await ELM.send('020200', 6000));
    var m = msgs(c), t = txtOf(c);
    var f = m.filter(function (x) { return x.indexOf('4202') === 0; })[0];
    if (!f) { res.status = t.join(' ') || 'cavab yoxdur'; return res; }
    var b = bytesOf(f.slice(6));
    if (b.length >= 2 && (b[0] || b[1])) res.dtc = dtcName(b[0], b[1]);
    if (!res.dtc) { res.status = 'Freeze Frame saxlanmayıb'; return res; }
    var want = ['04', '05', '06', '07', '0B', '0C', '0D', '0E', '0F', '10', '11'];
    for (var i = 0; i < want.length; i++) {
      var pid = want[i], p = window.PIDS[pid];
      if (!p || S.supported.indexOf(pid) < 0) continue;
      try {
        var cc = msgs(clean(await ELM.send('02' + pid + '00', 4000)));
        var pre = '42' + pid + '00';
        var r = cc.filter(function (x) { return x.indexOf(pre) === 0; })[0];
        if (!r) continue;
        var d = p.dec(bytesOf(r.slice(8)));
        if (d && isFinite(d.v)) res.pids[pid] = { v: d.v };
      } catch (e) { Log.add('ERR', 'freeze ' + pid + ': ' + e.message); }
    }
    return res;
  }

  async function mode09(pid) {
    var c = clean(await ELM.send('09' + pid, 10000)), pre = '49' + pid, b = [];
    c.forEach(function (e) {
      if (isTxt(e.s)) return;
      var s = e.s.indexOf(pre) === 0 ? e.s.slice(6) : e.s;
      b = b.concat(bytesOf(s));
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

  OBD.readDtcs = readDtcs;
  OBD.clearDtcs = clearDtcs;
  OBD.readFreeze = readFreeze;
  OBD.readVehicleInfo = readVehicleInfo;
})();
