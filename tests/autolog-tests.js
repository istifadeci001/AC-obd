// AC OBD avtomatik testləri: node tests/run.js
// Brauzer və adapter olmadan işləyir (sahte Transport və localStorage ilə).
process.env.TZ = 'Asia/Baku';
const fs = require('fs'), vm = require('vm'), path = require('path');
const JS = path.join(__dirname, '..', 'www', 'js');
let pass = 0, fail = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function check(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'OK    ' : 'XƏTA  ') + name + (cond ? '' : '   -> ' + extra));
}
function eq(name, a, b, tol) {
  const ok = tol !== undefined ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b);
  check(name, ok, 'alındı ' + JSON.stringify(a) + ', gözlənilən ' + JSON.stringify(b));
}
function mk(files, withStore) {
  const ls = {
    s: {}, getItem(k) { return k in this.s ? this.s[k] : null; }, setItem(k, v) { this.s[k] = String(v); },
    removeItem(k) { delete this.s[k]; }, key(i) { return Object.keys(this.s)[i] || null; }, get length() { return Object.keys(this.s).length; }
  };
  const ctx = { console, Date, Math, Object, JSON, Promise, isFinite, isNaN, parseInt, parseFloat, String, Array, Number, Error, RegExp, setTimeout, clearTimeout, setInterval, clearInterval, Reflect, Proxy, localStorage: ls, navigator: {}, document: { getElementById() { return null; }, addEventListener() {} } };
  ctx.window = ctx; ctx.Transport = { scan() {}, write: async () => {} }; vm.createContext(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f + '.js'), 'utf8'), ctx, { filename: f }));
  return ctx;
}
function wire(ctx, script) { // sahte adapter
  ctx.sent = [];
  ctx.Transport = { write: async s => { const c = s.replace('\r', ''); ctx.sent.push(c); const r = script(c); if (r) (Array.isArray(r) ? r : [r]).forEach(p => setTimeout(() => ctx.ELM.onData(typeof p === 'string' ? p : p.d), p.delay || 4)); } };
}


// ---- AVTO-JURNAL TESTLƏRİ (ayrı dəst): node tests/autolog-tests.js ----
// DİQQƏT: aşağıdakı ssenari SAXTA (sintetik) məlumatdır, yalnız kodun məntiqini yoxlayır. Real avtomobil nəticəsi deyil.
(async () => {
  const LD = ['log', 'elm', 'store', 'pids', 'obd', 'obd-extra', 'adapter', 'ai-rules', 'session', 'livediag', 'o2diag'];
  const SUP = '01 03 04 05 06 07 0B 0C 0D 0E 0F 11 13 15 1C 1F 21 2E 2F 30 31 32 33 34 3C 3E 41 42 43 44 45 46 47 49 4A 4C 4D 4E 51 55 56'.split(' ');
  let c = mk(LD); const AL = c.AutoLog; AL.setAuto(false);
  // ===== I. Rejim təyini =====
  console.log('\n[I] Rejim təyini (classify)');
  const cl = AL.classify;
  eq('I1  RPM yoxdur -> UNKNOWN', cl(null, 0, 90), 'UNKNOWN/unk');
  eq('I2  RPM 0 -> açar ON', cl(0, null, 20), 'KEYON/unk');
  eq('I3  RPM 250 -> start', cl(250, null, 20), 'CRANK/unk');
  eq('I4  soyuq boş gediş', cl(900, 0, 20), 'IDLE/cold');
  eq('I5  isinən boş gediş', cl(900, 0, 60), 'IDLE/warm');
  eq('I6  isti boş gediş', cl(900, 0, 90), 'IDLE/hot');
  eq('I7  isti sürüş', cl(2000, 50, 90), 'DRIVE/hot');
  eq('I8  sürət məlum deyil -> RUNNOSPD (uydurulmur)', cl(900, null, 90), 'RUNNOSPD/hot');
  eq('I9  ECT məlum deyil -> unk', cl(900, 0, null), 'IDLE/unk');

  // ===== II. 20 dəqiqəlik jurnal (SİNTETİK ssenari) =====
  console.log('\n[II] 20 dəq ssenari: açar ON → start → soyuq boş gediş → isinmə → sürüş (sintetik)');
  const T0 = 1700000000000, s = AL.create(T0); s.supported = SUP.slice();
  const put = (sec, id, v) => AL.feed(s, id, v, T0 + sec * 1000);
  for (let t = 0; t <= 1200; t++) {
    let rpm, spd, ect;
    if (t < 60) { rpm = 0; spd = 0; ect = 18; }
    else if (t < 63) { rpm = 250; spd = 0; ect = 18; }
    else if (t < 400) { rpm = 1100 - (t - 63) * 0.5; spd = 0; ect = 18 + (t - 63) * 0.09; }      // soyuq boş gediş, ECT 18 → 48
    else if (t < 600) { rpm = 850; spd = 0; ect = 48 + (t - 400) * 0.16; }                        // isinir, ECT → 80
    else { rpm = 2000; spd = Math.min(80, (t - 600) * 0.5); ect = 88; }                           // sürüş
    put(t, '0C', rpm); put(t, '0D', spd); put(t, '05', ect); put(t, 'RV', t < 63 ? 12.4 : 14.0);
    if (t % 2 === 0) { put(t, '06', t % 4 ? 2 : -2); put(t, '07', 1.5); }
    if (t === 700) put(t, '15', 0.62);
  }
  s.t1 = T0 + 1200 * 1000; s.on = false;
  const an = AL.analyze(s), keys = an.phases.map(p => p.key);
  check('II1 fazalar ardıcıl: KEYON → CRANK → IDLE/cold → IDLE/warm → DRIVE/hot', keys[0] === 'KEYON/unk' && keys[1] === 'CRANK/unk' && keys.indexOf('IDLE/cold') === 2 && keys.indexOf('IDLE/warm') > 2 && keys[keys.length - 1] === 'DRIVE/hot', keys.join(' > '));
  eq('II2 fazalar boşluqsuz bütün 20 dəqiqəni əhatə edir', an.phases.reduce((a, p) => a + (p.b - p.a), 0), an.secs + 1);
  check('II3 faza sərhədləri düzgün: start ~60 s, soyuq boş gediş ~63 s-də başlayır', an.phases[1].a === 60 && an.phases[2].a === 63, an.phases.map(p => p.a).join());
  const ic = an.phases[2].st;
  check('II4 soyuq boş gediş: RPM orta məntiqli, ECT artır', ic['0C'] && ic['0C'].sum / ic['0C'].n > 850 && ic['0C'].sum / ic['0C'].n < 1100 && ic['05'].last > ic['05'].first, JSON.stringify(ic['05']));
  const dr = an.phases[an.phases.length - 1].st;
  eq('II5 sürüş fazası: maks sürət 80', dr['0D'].max, 80);
  check('II6 təxmini yol > 3 km', an.dist > 3 && an.dist < 20, an.dist);
  const ev = AL.events(s, an).map(e => e.s).join('\n');
  check('II7 hadisələr: start, ECT 50 və 80, ilk hərəkət', /Start \/ çevirmə/.test(ev) && /50 °C-ə çatdı/.test(ev) && /80 °C-ə çatdı/.test(ev) && /İlk hərəkət/.test(ev), ev.slice(0, 400));
  eq('II8 zaman sırası ≈ 240 sətir (hər 5 s)', [an.step, an.series.length], [5, 241]);
  // mətn
  s.snap.dtc = { t: 'x', stored: { ok: true, codes: [] }, pending: { ok: true, codes: ['P0420'] }, permanent: { ok: true, codes: ['P0420'] } };
  s.snap.adapter = { name: 'KONNWEI', elm: 'ELM327 v1.5', protocol: 'AUTO, ISO 15765-4 (CAN 11/500)', info: null, o2map: null };
  s.snap.vehicle = { vin: 'KNAFK4A60F5312777', cal: 'TYD0C18NA1' };
  const full = AL.build(s, 'full', { raw: false }), diag = AL.build(s, 'diag', { raw: false }), rawT = AL.build(s, 'full', { raw: true });
  check('II9 mətndə AI tapşırığı və bütün bölmələr', ['AI-YƏ TAPŞIRIQ', '1. SESSİYA', '2. XƏTA KODLARI', '5. FAZALAR', '6. ƏSAS HADİSƏLƏR', '7. ZAMAN SIRASI', '8. BÜTÜN PID-LƏR', '9. MODE 06', '10. MƏHDUDİYYƏTLƏR'].every(x => full.indexOf(x) >= 0), '');
  check('II10 faza adları mətndə (soyuq boş gediş, isti hərəkət)', /Boş gediş \(sürət 0\), soyuq/.test(full) && /Hərəkət \(sürət > 0\), isti/.test(full), '');
  check('II11 P0420 statusu mətndə (Gözləyən + Daimi), Saxlanmış yoxdur', /Gözləyən \(07\): P0420/.test(full) && /Daimi \(0A\): P0420/.test(full) && /Saxlanmış \(03\): yoxdur/.test(full), '');
  check('II12 VIN və adapter mətndə', /KNAFK4A60F5312777/.test(full) && /KONNWEI/.test(full), '');
  check('II13 kopya mətnində xam nümunə yoxdur, faylda var', full.indexOf('12. XAM NÜMUNƏLƏR') < 0 && rawT.indexOf('12. XAM NÜMUNƏLƏR') >= 0 && rawT.split('\n').length - full.split('\n').length >= s.ev.length, '');
  check('II14 diaqnostika mətni tam mətndən qısadır, eyni fazalarla', diag.length < full.length && /5\. FAZALAR/.test(diag), diag.length + ' < ' + full.length);
  check('II14b dəstəklənməyən PID-lər ayrıca, "nasazlıq deyil" qeydi ilə', /UNSUPPORTED \(nasazlıq deyil; \d+\): .*5C/.test(full), '');
  check('II15 simulyasiya/uydurma yoxdur: ölçülməyən PID "—" və ya UNKNOWN', /0F .*UNKNOWN/.test(full) && /11 .*UNKNOWN/.test(full), '');
  // PID statusları
  eq('II16 dəstəklənməyən PID -> UNSUPPORTED', AL.status(s, '5C', s.t1).st, 'UNSUPPORTED');
  eq('II17 dəstəklənir, heç oxunmayıb -> UNKNOWN', AL.status(s, '0F', s.t1).st, 'UNKNOWN');
  eq('II18 təzə oxunmuş -> REAL', AL.status(s, '0C', s.t1).st, 'REAL');
  eq('II19 sonuncu oxuma çoxdan -> STALE (PID 15 son oxuma 700 s)', AL.status(s, '15', s.t1).st, 'STALE');
  // RPM boşluğu -> UNKNOWN fazası
  const s2 = AL.create(T0); s2.supported = ['0C', '05'];
  for (let t = 0; t <= 40; t++) { AL.feed(s2, '05', 30, T0 + t * 1000); if (t < 15) AL.feed(s2, '0C', 900, T0 + t * 1000); }
  s2.t1 = T0 + 40000; s2.on = false;
  const k2 = AL.analyze(s2).phases.map(p => p.key);
  check('II20 RPM oxunmayanda faza UNKNOWN olur, uydurma rejim yoxdur', k2.indexOf('UNKNOWN/unk') >= 0, k2.join(' > '));
  c.OBD.S.sim = true; const before = s.ev.length; c.OBD.values['0C'] = { v: 5000, t: Date.now() + 5, n: 1 }; AL.setCurrent(s); s.on = true; AL.sample(); s.on = false;
  eq('II21 simulyasiya (S.sim) jurnala yazılmır', s.ev.length, before);
  c.OBD.S.sim = false;

  // ===== III. Canlı axın: qoşulma, avtomatik snapshot, sorğu arbitrajı, dayandırma, bərpa =====
  console.log('\n[III] Qoşulma axını (saxta adapterlə)');
  const k = mk(LD, true); let cnt = 0;
  const R = { '010C': '41 0C 0C 80', '010D': '41 0D 00', '0105': '41 05 82', '0104': '41 04 40', '0106': '41 06 80', '0107': '41 07 80', '03': '43 01 04 20', '07': '47 01 04 20', '0A': '4A 01 04 20' };
  wire(k, cmd => { cnt++; if (cmd === 'ATRV') return '12.6V\r\r>'; return (R[cmd] ? R[cmd] : 'NO DATA') + '\r\r>'; });
  k.OBD.S.supported.push(...'01 03 04 05 06 07 0C 0D'.split(' ')); k.OBD.S.state = 'ecu'; k.OBD.S.deviceName = 'KONNWEI'; k.OBD.S.protocol = 'AUTO, ISO 15765-4 (CAN 11/500)';
  k.AutoLog.setAuto(true); const sx = k.AutoLog.start(true);
  await sleep(4500);
  check('III1 avtomatik start: jurnal aktivdir və PID-lər oxunur', sx && sx.on && sx.cnt['0C'] && sx.cnt['0C'].n >= 2 && sx.cnt['05'], JSON.stringify(Object.keys(sx.cnt)));
  check('III2 snapshot: kodlar oxunub, 3 status ayrı', sx.snap.dtc && sx.snap.dtc.stored.codes[0] === 'P0420' && sx.snap.dtc.pending.codes[0] === 'P0420' && sx.snap.dtc.permanent.codes[0] === 'P0420', JSON.stringify(sx.snap.dtc && sx.snap.dtc.stored));
  check('III3 snapshot addımları jurnala yazılıb (a-dan z-yə)', ['dtc', 'vehicle', 'readiness', 'freeze', 'mode06'].every(n => sx.notes.some(x => x.k === 'snap' && x.s.indexOf(n) === 0)), sx.notes.map(x => x.s).join('; ').slice(0, 300));
  check('III4 ECU cavab verməyən (NO DATA) addımlar xəta yox, "oxundu/boş" kimi qeyd olunur', !sx.notes.some(x => /TypeError|undefined/.test(x.s)), '');
  const txt3 = k.AutoLog.build(sx, 'full', { raw: false });
  check('III5 hesabat qurulur və P0420 var', /P0420/.test(txt3) && /KONNWEI/.test(txt3), '');
  // başqa bölmə sorğunu dəyişəndə müdaxilə etmir
  k.OBD.startPoll(['0C']); await sleep(2200);
  check('III6 başqa bölmə sorğu siyahısını dəyişəndə avto-jurnal ona toxunmur', JSON.stringify(k.OBD.S.selected) === '["0C"]' && sx.notes.some(x => /başqa bölmə/i.test(x.s)), JSON.stringify(k.OBD.S.selected));
  k.AutoLog.takeOver(); await sleep(2200);
  check('III7 "sorğunu qaytar": avto-jurnal siyahını geri alır', k.OBD.S.selected.length > 1 && k.OBD.S.selected.indexOf('RV') >= 0, JSON.stringify(k.OBD.S.selected));
  // dayandırma
  k.AutoLog.stop(); const nStop = sx.ev.length; await sleep(1500);
  check('III8 dayandırdıqdan sonra jurnal avtomatik davam etmir', sx.on === false && sx.ev.length === nStop, sx.ev.length + ' vs ' + nStop);
  // saxlama və bərpa
  const saved = k.Store.get('autolog_last', null);
  check('III9 jurnal yaddaşa yazılıb', saved && saved.ev.length > 0 && saved.snap.dtc, '');
  k.AutoLog.setCurrent(null); const rs = k.AutoLog.restore();
  check('III10 bərpa: eyni nümunə sayı, "bərpa olunub" işarəsi', rs && rs.restored === true && rs.ev.length === saved.ev.length, rs && rs.ev.length);
  check('III11 bərpa olunmuş jurnaldan hesabat qurulur', /bərpa olunub/.test(k.AutoLog.build(rs, 'diag', {})), '');
  k.OBD.stopPoll();

  // ===== IV. Ekranlar (saxta DOM ilə yoxlama: yalnız render və düymələr) =====
  console.log('\n[IV] Ekranlar və düymələr (saxta DOM)');
  const ui = fs.readFileSync(path.join(JS, 'ui-tools.js'), 'utf8'); const uiSrc = ui.slice(ui.indexOf('// ===== Avto-jurnal ekranları'));
  const u = mk(LD); const view = { innerHTML: '' }, handlers = []; let copied = null, dlName = null;
  const dl = { children: [], querySelector() { return null; }, appendChild(x) { this.children.push(x); } };
  u.document = { getElementById: id => id === 'view' ? view : (id === 'drawerlist' ? dl : null), addEventListener: (t, f) => handlers.push(f), createElement: () => ({ style: {}, click() { dlName = this.download; }, select() {}, set value(v) {} }), body: { appendChild() {}, removeChild() {} }, execCommand: () => true };
  u.location = { hash: '#autolive' }; u.navigator = { clipboard: { writeText: async t => { copied = t; } } }; u.URL = { createObjectURL: () => 'blob:x' }; u.Blob = function () {}; u.MutationObserver = function () { this.observe = () => {}; }; u.addEventListener = () => {}; u.scrollTo = () => {};
  u.AutoLog.setAuto(false); u.AutoLog.setCurrent(s);
  require('vm').runInContext(uiSrc, u, { filename: 'ui-autolog' });
  check('IV1  "Canlı göstərici" ekranı render olunur: düymələr və bütün PID-lər', /Kopyala/.test(view.innerHTML) && /TXT yüklə/.test(view.innerHTML) && /Bütün PID-lər/.test(view.innerHTML) && /\[REAL\]/.test(view.innerHTML) && /\[UNKNOWN\]/.test(view.innerHTML) && /\[STALE\]/.test(view.innerHTML), view.innerHTML.slice(0, 200));
  u.location.hash = '#autodiag'; require('vm').runInContext("window.dispatchHashChange && 0", u);
  const hc = (u.__hc || null);
  const click = a => handlers.forEach(h => h({ target: { closest: () => ({ getAttribute: () => a }) } }));
  const render = u.eval ? null : null;
  click('copy'); await sleep(20);
  check('IV2  "Kopyala": jurnal mətni buferə düşür (AI tapşırığı ilə)', copied && /AI-YƏ TAPŞIRIQ/.test(copied) && /P0420/.test(copied) && copied.indexOf('12. XAM NÜMUNƏLƏR') < 0, copied && copied.slice(0, 80));
  click('dl');
  check('IV3  "TXT yüklə": .txt faylı yaradılır', /^AC-OBD-.*\.txt$/.test(dlName || ''), dlName);
  u.AutoLog.setCurrent(null); view.innerHTML = '';
  click('auto'); check('IV4  "Avto-başlat" açarı işləyir', u.AutoLog.auto() === true, '');
  click('auto'); check('IV5  "Avto-başlat" yenidən bağlanır', u.AutoLog.auto() === false, '');

  console.log('\nAVTO-JURNAL TESTLƏRİ: ' + pass + ' keçdi, ' + fail + ' uğursuz');
  process.exit(fail ? 1 : 0);
})();
