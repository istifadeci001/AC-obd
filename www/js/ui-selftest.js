(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S;
  var res = null, running = false, skipped = '';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- kiçik test çərçivəsi ---------- */
  function Runner() {
    var self = this;
    self.groups = []; self.g = null; self.pass = 0; self.fail = 0;
    self.group = function (name) { self.g = { name: name, items: [] }; self.groups.push(self.g); };
    self.check = function (name, cond, extra) {
      var ok = !!cond;
      if (ok) self.pass++; else self.fail++;
      self.g.items.push({ name: name, ok: ok, extra: ok ? '' : String(extra === undefined ? '' : extra) });
    };
    self.eq = function (name, a, b, tol) {
      var ok = tol !== undefined ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b);
      self.check(name, ok, 'alındı ' + JSON.stringify(a) + ', gözlənilən ' + JSON.stringify(b));
    };
  }

  /* ---------- Qrup 1: modulların varlığı ---------- */
  function tModules(t) {
    t.group('Proqram modulları');
    ['Store', 'Log', 'LocalTime', 'PIDS', 'Formula', 'Transport', 'ELM', 'OBD', 'Adapter', 'Compat', 'AIRules', 'AIOnline', 'Session', 'LiveDiag', 'O2Diag', 'Fuel', 'Report', 'DTC_DB', 'DTCLang', 'I18N', 'GLOSS'].forEach(function (n) {
      t.check('Modul yüklənib: ' + n, window[n] !== undefined, 'tapılmadı: müvafiq .js faylı index.html-də yoxdur və ya xəta verib');
    });
    var fv = document.getElementById('appver');
    if (fv && window.APP_VERSION) t.check('Versiya: aşağıdakı yazı ' + APP_VERSION + ' ilə uyğundur', fv.textContent === APP_VERSION, fv.textContent);
  }

  /* ---------- Qrup 2: PID dekoderləri ---------- */
  function tPids(t) {
    t.group('PID dekoderləri (SAE J1979 düsturları)');
    var P = window.PIDS;
    t.eq('0C: 1A F8 -> 1726 rpm', P['0C'].dec([0x1A, 0xF8]).v, 1726, 0.01);
    t.eq('05: 7B -> 83 °C', P['05'].dec([0x7B]).v, 83);
    t.eq('06: 80 -> 0 %', P['06'].dec([0x80]).v, 0, 0.01);
    t.eq('06: 00 -> -100 %', P['06'].dec([0]).v, -100, 0.01);
    t.eq('10: 01 90 -> 4 g/s', P['10'].dec([1, 0x90]).v, 4, 0.001);
    t.eq('14: 5A -> 0.45 V', P['14'].dec([0x5A, 0x80]).v, 0.45, 0.001);
    t.eq('16: 64 -> 0.50 V', P['16'].dec([100, 0]).v, 0.5, 1e-9);
    t.eq('24: 80 00 -> lambda 1', P['24'].dec([0x80, 0, 0, 0]).v, 1, 0.001);
    t.eq('34: 80 00 -> lambda 1', P['34'].dec([0x80, 0, 0, 0]).v, 1, 0.001);
    t.eq('42: 3A 98 -> 15 V', P['42'].dec([0x3A, 0x98]).v, 15, 0.001);
    t.eq('3C: 0F A0 -> 360 °C', P['3C'].dec([0x0F, 0xA0]).v, 360, 0.01);
    t.eq('32: FF FC -> -1 Pa (işarəli)', P['32'].dec([0xFF, 0xFC]).v, -1, 0.001);
    t.eq('5E: 00 64 -> 5 L/saat', P['5E'].dec([0, 100]).v, 5, 0.001);
  }

  /* ---------- Qrup 3: Formula ---------- */
  function tFormula(t) {
    t.group('Fərdi PID düsturu (Formula)');
    var F = Formula.compile;
    t.eq('(A*256+B)/4', F('(A*256+B)/4')([0x1A, 0xF8]), 1726, 0.01);
    t.eq('A-40', F('A-40')([0x7B]), 83);
    t.eq('-A*2', F('-A*2')([5]), -10);
    var m = ''; try { F('A/0')([1]); } catch (e) { m = e.message; }
    t.eq('Sıfıra bölmə xəta verir', m, 'Sıfıra bölmə');
    m = ''; try { F('A+')([1]); } catch (e) { m = 'x'; }
    t.eq('Natamam düstur xəta verir', m, 'x');
    m = ''; try { F('alert(1)'); } catch (e) { m = 'x'; }
    t.eq('Təhlükəli mətn düstur kimi qəbul edilmir', m, 'x');
  }

  /* ---------- Qrup 4: DTC bazası ---------- */
  function tDtc(t) {
    t.group('Xəta kodu bazası');
    var d = DTC_DB['P0420'];
    t.check('P0420 bazada var və adı var', d && (d.az || d.en), JSON.stringify(d));
    var f = DTC_DB['P1FFF'];
    t.check('Bazada olmayan kod ailə üzrə ümumi izahla qaytarılır (yoxlanmamış kimi)', f && f.family === true || (f && f.big), JSON.stringify(f && { family: f.family }));
    t.check('Kod sayı > 0', (window.DTC_COUNT || 0) > 0, window.DTC_COUNT);
    t.check('Yanlış format (ABC) undefined qaytarır', DTC_DB['ABC'] === undefined, typeof DTC_DB['ABC']);
  }

  /* ---------- Qrup 5: yaddaş ---------- */
  function tStore(t) {
    t.group('Yaddaş (Store) və vaxt');
    var k = 'selftest_tmp';
    Store.set(k, { a: 1, b: 'ə' });
    var v = Store.get(k, null);
    t.eq('Yaz-oxu: obyekt saxlanır və geri oxunur', v, { a: 1, b: 'ə' });
    try { localStorage.removeItem('acobd:' + k); } catch (e) {}
    t.eq('Silindikdən sonra standart dəyər qaytarılır', Store.get(k, 'yox'), 'yox');
    t.check('LocalTime.full formatı YYYY-AA-GG SS:DD:SS', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(LocalTime.full('2026-11-14T09:13:46Z')), LocalTime.full('2026-11-14T09:13:46Z'));
    t.eq('LocalTime səhv tarixdə "—" qaytarır', LocalTime.full('xyz'), '—');
  }

  /* ---------- Qrup 6: AI qaydaları ---------- */
  function tRules(t) {
    t.group('Qayda əsaslı təhlil (AIRules)');
    var oldMap = Adapter.map;
    try {
      var sw = [];
      for (var i = 0; i < 22; i++) sw.push(i % 2 ? 0.8 : 0.1);
      var V = { '14': { hist: sw }, '15': { hist: sw } };
      Adapter.map = function () { return null; };
      var A = AIRules.analyze(V, null);
      t.check('Sensor mövqeyi bilinmir: katalizator hipotezi yoxdur', !A.hyps.some(function (h) { return h.key === 'cat'; }), JSON.stringify(A.hyps));
      Adapter.map = function () { return { scheme: '13', mask: 3 }; };
      A = AIRules.analyze(V, null);
      t.check('Mövqe təsdiqlənibsə katalizator hipotezi çıxır', A.hyps.some(function (h) { return h.key === 'cat'; }), JSON.stringify(A.hyps));
      var lean = { '06': { hist: [12, 12, 12, 12, 12, 12] }, '07': { hist: [11, 11, 11, 11, 11, 11] } };
      A = AIRules.analyze(lean, null);
      t.check('Müsbət korreksiya (+12 %): kasıb qarışıq anormallığı tapılır', A.anomalies.some(function (a) { return a.k === 'lean'; }), JSON.stringify(A.anomalies));
      A = AIRules.analyze({ '06': { hist: [1, 1, 1, 1, 1, 1] }, '07': { hist: [2, 2, 2, 2, 2, 2] } }, null);
      t.check('Normal korreksiya: anormallıq tapılmır', A.anomalies.length === 0, JSON.stringify(A.anomalies));
    } finally { Adapter.map = oldMap; }
  }

  /* ---------- Qrup 7: O2 / katalizator diaqnostikası ---------- */
  function tO2(t) {
    t.group('O2 / katalizator diaqnostikası');
    var O = O2Diag;
    function series(n, dt, fn) { var tt = [], v = []; for (var i = 0; i < n; i++) { tt.push(1e6 + i * dt * 1000); v.push(fn(i * dt)); } return { t: tt, v: v }; }
    function sq(lo, hi, f) { return function (s) { return (Math.floor(s * f * 2) % 2) ? hi : lo; }; }
    function flat(k) { return function () { return k; }; }
    function mkInp(o) {
      var reg = { cold: { sec: 0, ser: {} }, idle: { sec: 40, ser: {} }, r2500: { sec: 50, ser: {} } }, dt = o.dt || 0.3;
      reg.r2500.ser['14'] = series(160, dt, o.front25 || sq(0.1, 0.8, 1)); reg.r2500.ser['15'] = series(160, dt, o.rear25 || flat(0.65));
      reg.idle.ser['14'] = series(120, dt, o.frontI || sq(0.1, 0.8, 1)); reg.idle.ser['15'] = series(120, dt, o.rearI || flat(0.65));
      function tr(id, a, b) { reg.idle.ser[id] = series(60, 1, function () { return a; }); reg.r2500.ser[id] = series(60, 1, function () { return b; }); }
      tr('06', o.stI === undefined ? 1 : o.stI, o.st25 === undefined ? 1 : o.st25); tr('07', o.ltI === undefined ? 2 : o.ltI, o.lt25 === undefined ? 2 : o.lt25);
      reg.idle.ser['0C'] = series(60, 1, function (i) { return 800 + (o.rpmJit || 0) * Math.sin(i * 3); }); reg.r2500.ser['0C'] = series(60, 1, function () { return 2500; });
      reg.idle.ser['03'] = series(60, 1, function () { return 2; }); reg.r2500.ser['03'] = series(60, 1, function () { return 2; });
      var sup = ['14', '15', '13', '06', '07', '0C', '05', '0D', '03', '0B', '10'];
      return { sensors: o.ident || O.identify(sup, { scheme: '13', mask: 3 }), reg: reg, supported: o.sup || sup, codes: o.codes === undefined ? [] : o.codes, m06: o.m06 || null };
    }
    function R(a, k) { return a.results.filter(function (r) { return r.key === k; })[0]; }
    var id = O.identify(['14', '15', '24', '13'], { scheme: '13', mask: 3 });
    t.check('Genişzolaqlı B1S1 (24) darzolaqlıdan üstün tutulur', id.front.pid === '24' && id.front.kind === 'wide' && id.rear.pid === '15', JSON.stringify([id.front, id.rear]));
    id = O.identify(['14', '15'], null);
    t.check('Mövqe sxemi yoxdursa B1S1/B1S2 təyin edilmir', id.front === null && id.rear === null && id.issues.length > 0, JSON.stringify(id));
    id = O.identify(['15'], { scheme: '13', mask: 3 });
    t.check('Yalnız PID 15 varsa ön sensor yoxdur, başqa PID əvəz edilmir', id.front === null && id.rear && id.rear.pos === 'B1S2', JSON.stringify(id));
    id = O.identify(['14', '15'], { scheme: '13', mask: 2 });
    t.check('Maska B1S1-i göstərmirsə təsdiqlənmir', id.front === null, JSON.stringify(id.sensors));
    id = O.identify(['14', '16'], { scheme: '1D', mask: 15 });
    t.eq('1D sxemində PID 16 = B2S1', id.sensors.filter(function (x) { return x.pid === '16'; })[0].pos, 'B2S1');
    t.eq('Rejim: soyuq', O.classify({ rpm: 800, ect: 40, spd: 0, rpmRange: 50 }), 'cold');
    t.eq('Rejim: isti boş gediş', O.classify({ rpm: 800, ect: 90, spd: 0, rpmRange: 50 }), 'idle');
    t.eq('Rejim: sabit 2500', O.classify({ rpm: 2500, ect: 90, spd: 0, rpmRange: 60 }), 'r2500');
    t.eq('Rejim: hərəkətdə sayılmır', O.classify({ rpm: 2500, ect: 90, spd: 30, rpmRange: 60 }), 'moving');
    t.eq('Rejim: qeyri-sabit 2500 sayılmır', O.classify({ rpm: 2500, ect: 90, spd: 0, rpmRange: 400 }), 'other');
    var an = O.analyze(mkInp({}));
    t.check('Sağlam sistem: katalizator zəif görünmür', ['Əlamət tapılmadı', 'Aşağı'].indexOf(R(an, 'cat').level) >= 0, R(an, 'cat').level);
    t.check('Sağlam sistem: sensor nasazlığı əlaməti yoxdur', R(an, 'front').level === 'Əlamət tapılmadı' && R(an, 'rear').level === 'Əlamət tapılmadı', R(an, 'front').level + ' / ' + R(an, 'rear').level);
    an = O.analyze(mkInp({ rear25: sq(0.1, 0.8, 1), rearI: sq(0.1, 0.8, 1), codes: ['P0420'] }));
    t.check('Arxa sensor ön sensoru təqlid edir + P0420: katalizator Orta/Yüksək', ['Yüksək', 'Orta'].indexOf(R(an, 'cat').level) >= 0, R(an, 'cat').level);
    t.check('Məsləhət katalizatorun dəyişdirilməsini tövsiyə etmir', /tövsiyə etmir/.test(an.advice), an.advice);
    an = O.analyze(mkInp({ ident: O.identify(['14', '15'], null) }));
    t.check('Sxem yoxdur: katalizator "Müəyyən edilə bilmir"', R(an, 'cat').level === 'Müəyyən edilə bilmir' && R(an, 'cat').reasons.some(function (x) { return /PID 13\/1D/.test(x); }), JSON.stringify(R(an, 'cat').reasons));
    var kin = mkInp({ ident: O.identify(['15', '13', '44'], { scheme: '13', mask: 3 }), sup: ['15', '13', '44', '06', '07', '0C', '05', '03'] });
    delete kin.reg.idle.ser['14']; delete kin.reg.r2500.ser['14'];
    an = O.analyze(kin);
    t.check('Ön sensor PID-i yoxdur: ön sensor və katalizator "Müəyyən edilə bilmir"', R(an, 'front').level === 'Müəyyən edilə bilmir' && R(an, 'cat').level === 'Müəyyən edilə bilmir', R(an, 'front').level + ' / ' + R(an, 'cat').level);
    t.check('PID 44 (əmr edilən lambda) sensor əvəzi kimi istifadə edilmir', !/PID 44/.test(JSON.stringify(an.results)), '');
    an = O.analyze(mkInp({ front25: flat(0.45), frontI: flat(0.45), codes: ['P0134'] }));
    t.check('Ön sensor 0.45 V-da ilişib + P0134: Yüksək', R(an, 'front').level === 'Yüksək', R(an, 'front').level);
    t.check('Ön sensor nasazdırsa katalizator hökmü çıxmır', R(an, 'cat').level === 'Müəyyən edilə bilmir', R(an, 'cat').level);
    an = O.analyze(mkInp({ rear25: flat(0.85), rearI: flat(0.85), codes: ['P0137'] }));
    t.check('Arxa sensor yüksəkdə ilişib: Orta/Yüksək', ['Orta', 'Yüksək'].indexOf(R(an, 'rear').level) >= 0, R(an, 'rear').level);
    an = O.analyze(mkInp({ codes: ['P0301'] }));
    t.check('Misfire kodu: misfire Yüksək, katalizator bloklanır', R(an, 'mis').level === 'Yüksək' && R(an, 'cat').level === 'Müəyyən edilə bilmir', R(an, 'mis').level + ' / ' + R(an, 'cat').level);
    an = O.analyze(mkInp({ rpmJit: 200 }));
    t.check('Boş gedişdə RPM qeyri-sabit: misfire Orta+', ['Orta', 'Yüksək'].indexOf(R(an, 'mis').level) >= 0, R(an, 'mis').level);
    an = O.analyze(mkInp({ stI: 12, ltI: 10, st25: 2, lt25: 3 }));
    t.check('Kasıb qarışıq: qarışıq problemi Orta+', ['Orta', 'Yüksək'].indexOf(R(an, 'mix').level) >= 0, R(an, 'mix').level);
    t.check('Qarışıq problemi katalizator hökmünü bloklayır', R(an, 'cat').level === 'Müəyyən edilə bilmir', R(an, 'cat').level);
    t.check('Egzoz sızması heç vaxt "Yüksək" verilmir', R(an, 'leak').level !== 'Yüksək', R(an, 'leak').level);
    an = O.analyze(mkInp({ dt: 1.0, front25: sq(0.1, 0.8, 0.1), frontI: sq(0.1, 0.8, 0.1) }));
    t.check('Seyrək nümunə: yavaş reaksiya iddia edilmir, Fokus rejimi təklif edilir', !R(an, 'front').evidence.some(function (x) { return /yavaş reaksiya/.test(x); }) && an.missing.some(function (x) { return /Fokus/.test(x); }), JSON.stringify(an.missing));
    an = O.analyze(mkInp({ rear25: sq(0.2, 0.7, 1), rearI: sq(0.2, 0.7, 1), m06: { mid: 0x21, tests: [{ ok: false, v: 900, mn: 0, mx: 600 }] } }));
    t.check('Mode 06 katalizator testi uğursuz: sübuta daxil edilir', R(an, 'cat').evidence.some(function (x) { return /MID 21/.test(x); }), JSON.stringify(R(an, 'cat').evidence));
    an = O.analyze(mkInp({ codes: null }));
    t.check('Kodlar oxunmayıb: çatışmazlıq siyahısında göstərilir', an.missing.some(function (x) { return /Xəta kodları oxunmayıb/.test(x); }), '');
    var svg = O.svgChart({ now: 1e6 + 60000, win: 60, series: [{ color: '#fff', data: [{ t: 1e6 + 1000, v: 0.2 }, { t: 1e6 + 30000, v: 0.8 }] }], min: 0, max: 1, refs: [{ v: 0.45, l: '0.45 V' }] });
    t.check('Qrafik SVG qaytarır', /^<svg/.test(svg) && /polyline/.test(svg), svg.slice(0, 60));
    t.check('Boş qrafik "Məlumat yoxdur" yazır', /Məlumat yoxdur/.test(O.svgChart({ now: 1, series: [{ color: '#fff', data: [] }] })), '');
    t.check('Hesabat mətni "Müəyyən edilə bilmir" səbəbini göstərir', /Niyə müəyyən edilə bilmir/.test(O.reportText(O.analyze(kin), {})), '');
  }

  /* ---------- Qrup 8: adapter simulyasiyası (yalnız adapter qoşulu deyilsə) ---------- */
  async function tSim(t) {
    t.group('Adapter simulyasiyası (sahte ECU ilə)');
    var oldWrite = Transport.write, oldAdd = Log.add, oldProto = S.protocol, oldSupported = S.supported, oldValues = S.values;
    S.values = {}; S.sim = true; // saxta ECU məlumatı real göstəricilərə qarışmasın
    var script = function () { return null; };
    Log.add = function () {};
    Transport.write = async function (s) {
      var cmd = s.replace('\r', ''), r = script(cmd);
      if (r) (Array.isArray(r) ? r : [r]).forEach(function (p) { setTimeout(function () { ELM.onData(typeof p === 'string' ? p : p.d); }, p.delay || 4); });
    };
    try {
      ELM.abort('selftest');
      S.protocol = 'AUTO, ISO 15765-4 (CAN 11/500)';
      script = function (c) { return c === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null; };
      var r = await OBD.readDtcs('03');
      t.eq('Mode 03 CAN çox-çərçivə: P0133, P0420, P0171', r.codes, ['P0133', 'P0420', 'P0171']);
      script = function (c) { return c === '03' ? '43 00\r\r>' : null; };
      r = await OBD.readDtcs('03');
      t.eq('Kod yoxdur: ok=true və boş siyahı', [r.ok, r.codes], [true, []]);
      script = function (c) { return c === '07' ? 'NO DATA\r\r>' : null; };
      r = await OBD.readDtcs('07');
      t.eq('NO DATA: ok=false', r.ok, false);
      S.protocol = '';
      script = function (c) { return c === 'ATDP' ? 'AUTO\r\r>' : (c === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null); };
      r = await OBD.readDtcs('03');
      t.eq('Protokol bilinmirsə səhv kod oxunmur', [r.ok, r.codes], [false, []]);
      S.protocol = '';
      script = function (c) { return c === 'ATDP' ? 'AUTO, ISO 15765-4 (CAN 11/500)\r\r>' : (c === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null); };
      r = await OBD.readDtcs('03');
      t.eq('Protokol boşdursa ATDP ilə təyin edilir, kodlar düzgün', r.codes, ['P0133', 'P0420', 'P0171']);

      var vin = 'KNAFK4A60F5312777', hx = vin.split('').map(function (ch) { return ('0' + ch.charCodeAt(0).toString(16)).slice(-2).toUpperCase(); });
      var vr = '014\r0: 49 02 01 ' + hx.slice(0, 3).join(' ') + '\r1: ' + hx.slice(3, 10).join(' ') + '\r2: ' + hx.slice(10).join(' ');
      script = function (c) { return c === '0902' ? vr + '\r\r>' : null; };
      var v = await OBD.readVehicleInfo();
      t.eq('VIN düzgün oxunur', v.vin, vin);
      script = function (c) { return c === '0902' ? vr + '\r41 0C 1A F8\r\r>' : null; };
      v = await OBD.readVehicleInfo();
      t.eq('VIN-ə yad sətir qarışmır', v.vin, vin);
      script = function (c) { return c === '0902' ? '014\r0: 49 02 01 4F 4F 4F\r1: 31 32 33 34 35 36 37\r2: 38 39 30 31 32 33 34\r\r>' : null; };
      v = await OBD.readVehicleInfo();
      t.eq('Yanlış formatlı VIN (O hərfi) rədd edilir', v.vin, '');

      script = function (c) { return c === '06A1' ? '46 A1 01 81 FF F6 FF EC 00 14\r\r>' : null; };
      var m6 = await OBD.mode06Read(0xA1);
      t.eq('Mode 06 işarəli vahid: -10 hədlər daxilindədir', [m6.tests[0].v, m6.tests[0].ok], [-10, true]);
      script = function (c) { return c === '0601' ? '46 01 01 01 00 64 00 00 00 C8\r\r>' : null; };
      m6 = await OBD.mode06Read(1);
      t.eq('Mode 06 işarəsiz dəyər 100 [0..200] normal', m6.tests[0].ok, true);

      script = function (c) { return c === '0101' ? '41 01 82 07 65 00\r\r>' : null; };
      var rd = await OBD.readReadiness();
      t.eq('Readiness: MIL yanır, saxlanmış kod sayı 2', [rd.mil, rd.count], [true, 2]);

      // ELM: timeout-dan sonra cavab sürüşməsi olmamalıdır
      var resp = { '010C': '41 0C 1A F8', '010D': '41 0D 3C', '0105': '41 05 7B', '010F': '41 0F 41' }, busy = 0;
      Transport.write = async function (s) {
        var cmd = s.replace('\r', ''), now = Date.now(), st = Math.max(now, busy), d = cmd === '010C' ? 1900 : 150;
        busy = st + d;
        setTimeout(function () { ELM.onData(resp[cmd] + '\r\r>'); }, busy - now);
      };
      var out = [], cmds = ['010C', '010D', '0105', '010F'];
      for (var i = 0; i < cmds.length; i++) { try { out.push((await ELM.send(cmds[i], 1500)).join(' ')); } catch (e) { out.push('timeout'); } }
      t.eq('ELM: timeout-dan sonra hər əmr öz cavabını alır', out, ['timeout', '41 0D 3C', '41 05 7B', '41 0F 41']);
      await sleep(300);
    } finally {
      try { ELM.abort('selftest'); } catch (e) {}
      Transport.write = oldWrite; Log.add = oldAdd; S.protocol = oldProto; S.supported = oldSupported;
      S.values = oldValues; S.sim = false;
    }
  }

  async function runAll() {
    if (running) return;
    running = true; res = null; skipped = ''; render();
    await sleep(50);
    var t = new Runner();
    var groups = [tModules, tPids, tFormula, tDtc, tStore, tRules, tO2];
    for (var i = 0; i < groups.length; i++) {
      try { groups[i](t); } catch (e) { t.group('Xəta: ' + (groups[i].name || 'qrup')); t.check('Qrup icra olundu', false, e.message); }
    }
    if (S.state === 'idle' || S.state === 'error') {
      try { await tSim(t); } catch (e) { t.group('Xəta: adapter simulyasiyası'); t.check('Qrup icra olundu', false, e.message); }
    } else skipped = 'Adapter qoşuludur (' + S.state + '): sahte ECU ilə simulyasiya testləri real əlaqəni pozmamaq üçün keçildi. Onları görmək üçün adapteri ayırıb təkrar işlədin.';
    res = t; running = false;
    render();
  }

  function reportText() {
    if (!res) return '';
    var o = ['AC OBD özünü yoxlama', 'Versiya: ' + (window.APP_VERSION || '?'), 'Tarix: ' + LocalTime.full(new Date().toISOString()), 'Cihaz: ' + navigator.userAgent, 'Nəticə: ' + res.pass + ' keçdi, ' + res.fail + ' uğursuz'];
    if (skipped) o.push(skipped);
    res.groups.forEach(function (g) {
      o.push('', g.name);
      g.items.forEach(function (it) { o.push((it.ok ? '  OK    ' : '  XƏTA  ') + it.name + (it.ok ? '' : '  -> ' + it.extra)); });
    });
    return o.join('\n');
  }

  function render() {
    if (cur() !== 'selftest') return;
    var h = '<h2>Özünü yoxlama (Self-test)</h2>';
    h += '<div class="card"><p>Proqramın hesablama və təhlil hissələrini sahte (sintetik) məlumatla yoxlayır: PID dekoderləri, düstur, xəta kodu oxunuşu, VIN, O2/katalizator təhlili, qayda mühərriki. Bu <b>real avtomobil testi deyil</b>: avtomobilə heç nə göndərilmir və saxlanmış məlumat dəyişmir.</p>' +
      '<p class="sm">Adapter qoşulu olanda yalnız sahte ECU tələb etməyən testlər işləyir. Tam test üçün adapteri ayırın. Uğursuz test varsa nəticəni kopyalayıb göndərin.</p>' +
      '<button class="btn" data-st="run"' + (running ? ' disabled' : '') + '>' + (running ? 'İşləyir…' : '▶ Testləri işlət') + '</button>' +
      (res ? '<button class="btn alt" data-st="copy">Nəticəni kopyala</button><button class="btn alt" data-st="share">Nəticəni paylaş</button>' : '') + '<p class="sm" id="st-msg"></p></div>';
    if (res) {
      var ok = res.fail === 0;
      h += '<div class="card' + (ok ? '' : ' warn') + '"><div class="big ' + (ok ? 'ok' : 'bad') + '">' + res.pass + ' keçdi, ' + res.fail + ' uğursuz</div>' +
        (ok ? '<p class="ok">Yoxlanılan hissələr gözlənildiyi kimi işləyir. Bu, avtomobildə düzgün işləməsinin təsdiqi deyil.</p>' : '<p class="bad">Aşağıda qırmızı sətirlərə baxın.</p>') +
        (skipped ? '<p class="no">' + esc(skipped) + '</p>' : '') + '</div>';
      res.groups.forEach(function (g) {
        var bad = g.items.filter(function (i) { return !i.ok; }).length;
        h += '<details class="card"' + (bad ? ' open' : '') + '><summary><b>' + esc(g.name) + '</b> — <span class="' + (bad ? 'bad' : 'ok') + '">' + (g.items.length - bad) + '/' + g.items.length + '</span></summary>' +
          g.items.map(function (i) { return '<div class="row"><span>' + esc(i.name) + (i.ok ? '' : '<br><span class="sm bad">' + esc(i.extra) + '</span>') + '</span><span class="' + (i.ok ? 'ok' : 'bad') + '">' + (i.ok ? '✔' : '✖') + '</span></div>'; }).join('') + '</details>';
      });
    }
    view.innerHTML = h;
  }
  function msg(s) { var e = document.getElementById('st-msg'); if (e) e.textContent = s; }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-st]');
    if (!el) return;
    var a = el.getAttribute('data-st');
    if (a === 'run') runAll();
    else if (a === 'copy') msg(Session.copy(reportText()) ? 'Nəticə kopyalandı.' : 'Kopyalama alınmadı.');
    else if (a === 'share') Session.share(reportText(), 'AC OBD özünü yoxlama').then(function (r) { msg(r === 'copy' ? 'Nəticə kopyalandı.' : (r === 'fail' ? 'Paylaşmaq alınmadı.' : '')); });
  });

  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (dl && !dl.querySelector('a[href="#selftest"]')) {
      var a = document.createElement('a');
      a.href = '#selftest'; a.textContent = 'Özünü yoxlama (Self-test)';
      dl.appendChild(a);
    }
  }
  function apply() { if (cur() === 'selftest') { render(); window.scrollTo(0, 0); } addDrawer(); }
  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply);
  addDrawer();
  apply();
  window.SelfTest = { run: runAll, result: function () { return res; } };
})();

