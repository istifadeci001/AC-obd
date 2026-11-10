window.Compat = (function () {
  var S = OBD.S, res = null, running = false, subs = [];
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function bytes(h) {
    var o = [];
    for (var i = 0; i + 1 < h.length; i += 2) { var n = parseInt(h.substr(i, 2), 16); if (isNaN(n)) break; o.push(n); }
    return o;
  }
  async function probe(cmd, prefix, t) {
    try {
      var r = await OBD.raw(cmd, t || 3000);
      var ok = r.msgs.filter(function (x) { return x.indexOf(prefix) === 0; })[0];
      if (ok) return { s: 'ok', hex: ok };
      var nrc = r.msgs.filter(function (x) { return x.indexOf('7F') === 0; })[0];
      if (nrc) return { s: 'unsup', d: 'ECU rədd etdi (' + nrc + ')' };
      var tx = r.txt.join(' ');
      if (/NODATA/.test(tx)) return { s: 'unsup', d: 'ECU cavab vermir (NO DATA)' };
      return { s: 'err', d: tx || 'cavab yoxdur' };
    } catch (e) { return { s: 'err', d: e.message }; }
  }
  async function run() {
    if (running || S.state !== 'ecu') return;
    running = true; emit();
    var r = {};
    r.dtc03 = await probe('03', '43');
    r.dtc07 = await probe('07', '47');
    r.dtc0a = await probe('0A', '4A');
    r.freeze = await probe('020000', '420000');
    r.ready = await probe('0101', '4101');
    r.m06 = await probe('0600', '4600', 5000);
    r.vin = await probe('0900', '4900');
    if (r.vin.s === 'ok') {
      var b = bytes(r.vin.hex.slice(4));
      r.vin.hasVin = !!(b[0] & 0x40);
      r.vin.hasCal = !!(b[0] & 0x10);
    }
    res = { r: r, t: new Date().toISOString() };
    running = false; emit();
  }
  function it(name, st, d) { return { name: name, st: st, d: d || '' }; }
  function list() {
    var r = res ? res.r : null, conn = S.state === 'ecu', out = [];
    function P(name, p, okT) {
      if (!r) return it(name, 'unk', conn ? (running ? 'Yoxlanılır…' : 'Yoxlanmayıb') : 'Adapter qoşulmayıb');
      if (p.s === 'ok') return it(name, 'ok', okT || '');
      if (p.s === 'unsup') return it(name, 'no', p.d);
      return it(name, 'unk', 'Cavab alınmadı: ' + p.d);
    }
    out.push(it('Panel (Dashboard)', 'ok'));
    out.push(it('Adapter qoşulması (Connect Adapter)', conn ? 'ok' : (S.state === 'elm' ? 'part' : 'unk'),
      conn ? 'BLE + ELM327 + ECU' : (S.state === 'elm' ? 'Adapter var, ECU cavab vermir' : 'Adapter qoşulmayıb')));
    out.push(it('Canlı göstəricilər (Live Data)', conn ? (S.supported.length ? 'ok' : 'no') : 'unk',
      conn ? S.supported.length + ' PID dəstəklənir' : 'Adapter qoşulmayıb'));
    if (r) {
      var oks = [], bad = [];
      [['03', r.dtc03], ['07', r.dtc07], ['0A', r.dtc0a]].forEach(function (x) { (x[1].s === 'ok' ? oks : bad).push('Mode ' + x[0]); });
      out.push(it('Xəta kodlarını oxumaq (Fault Codes)', oks.length ? 'ok' : 'no',
        (oks.length ? 'Oxunur: ' + oks.join(', ') : '') + (bad.length ? (oks.length ? '. ' : '') + 'Cavab yoxdur: ' + bad.join(', ') : '')));
    } else out.push(it('Xəta kodlarını oxumaq (Fault Codes)', 'unk', conn ? 'Yoxlanılır…' : 'Adapter qoşulmayıb'));
    out.push(it('Xəta kodlarını silmək (Mode 04)', 'unk', 'Sınanmır: silmə əmri yalnız sizin təsdiqinizlə göndərilir'));
    out.push(P('Freeze Frame (Mode 02)', r && r.freeze));
    out.push(P('Hazırlıq testləri (Readiness Monitor)', r && r.ready));
    out.push(P('Mode 06 (xam nəticələr)', r && r.m06));
    out.push(it('Mode 05 (O2 monitor)', /CAN/i.test(S.protocol || '') ? 'na' : 'unk',
      /CAN/i.test(S.protocol || '') ? 'CAN protokolunda mövcud deyil (Mode 06 əvəz edir)' : 'Protokol bilinmir'));
    if (r && r.vin.s === 'ok') {
      out.push(it('VIN oxumaq (Mode 09)', r.vin.hasVin ? 'ok' : 'no', r.vin.hasVin ? '' : 'ECU VIN-i dəstəkləmir'));
      out.push(it('Kalibrasiya ID (Mode 09)', r.vin.hasCal ? 'ok' : 'no', r.vin.hasCal ? '' : 'ECU dəstəkləmir'));
    } else out.push(P('VIN oxumaq (Mode 09)', r && r.vin));
    var o2 = ['14', '15', '24', '25'].filter(function (x) { return S.supported.indexOf(x) >= 0; });
    out.push(it('O2 / lambda göstəriciləri', conn ? (o2.length ? 'ok' : 'no') : 'unk',
      conn ? (o2.length ? 'Var: PID ' + o2.join(', ') : 'Bu avtomobil O2/lambda PID vermir') : 'Adapter qoşulmayıb'));
    out.push(it('Ağıllı diaqnostika (qaydalar, internetsiz)', 'ok', 'Canlı məlumat və kodlar olduqca dəqiqləşir'));
    out.push(it('AI canlı monitor (AI Live Monitor)', 'ok', 'Canlı oxuma işləməlidir'));
    out.push(it('Məlumat qeydi və CSV (Data Logging)', 'ok'));
    out.push(it('Hesabatlar (Reports)', 'part', 'Mətn hesabat var, PDF hələ yoxdur'));
    out.push(it('Fərdi PID (yalnız Mode 01)', 'ok'));
    out.push(it('AI izah (internet)', Store.get('ai_allow', false) ? 'ok' : 'unk', Store.get('ai_allow', false) ? 'İcazə verilib' : 'Söndürülüb və ya quraşdırılmayıb'));
    out.push(it('Qabaqcıl diaqnostika: ABS, SRS, TCM və s.', 'todo', 'Hələ yazılmayıb'));
    out.push(it('Kia/Hyundai Enhanced PID', 'todo', 'Hələ yazılmayıb, yoxlanmış mənbə lazımdır'));
    out.push(it('Klassik Bluetooth və Wi-Fi adapter', 'todo', 'Hələ yazılmayıb, native plugin və uyğun adapter lazımdır'));
    out.push(it('Kodlaşdırma, aktiv test, açar/immobilayzer', 'never', 'Planlaşdırılmır, KW903 ilə mümkün deyil'));
    return out;
  }
  function summary() {
    var c = { ok: 0, no: 0, unk: 0, todo: 0, other: 0 };
    list().forEach(function (x) {
      if (x.st === 'ok') c.ok++; else if (x.st === 'no') c.no++; else if (x.st === 'unk') c.unk++; else if (x.st === 'todo') c.todo++; else c.other++;
    });
    return c;
  }
  function note(key, label) {
    if (!res) return '';
    var p = res.r[key];
    if (p && p.s === 'unsup') return '<div class="card warn"><p>' + label + ': bu avtomobildə dəstəklənmir. ' + p.d + '</p></div>';
    return '';
  }
  OBD.on(function () {
    if (S.state === 'ecu' && !res && !running) setTimeout(run, 800);
    else if (S.state === 'idle' || S.state === 'error') res = null;
  });
  return { run: run, list: list, summary: summary, note: note, has: function () { return !!res; }, busy: function () { return running; }, on: function (f) { subs.push(f); } };
})();
