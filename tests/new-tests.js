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


// ---- YENİ TESTLƏR (97 köhnə testdən ayrı): node tests/new-tests.js ----
(async () => {
  const FULL = ['log', 'store', 'pids', 'obd', 'elm', 'obd-extra', 'adapter', 'o2diag'];
  const SUP = '01 03 04 05 06 07 0B 0C 0D 0E 0F 11 13 15 1C 1F 21 2E 2F 30 31 32 33 34 3C 3E 41 42 43 44 45 46 47 49 4A 4C 4D 4E 51 55 56'.split(' ');
  const LD = ['log', 'elm', 'store', 'pids', 'obd', 'obd-extra', 'adapter', 'ai-rules', 'session', 'livediag', 'o2diag'];
  const setMap = async k => { wire(k, cmd => cmd === 'ATI' ? 'ELM327 v1.5\r\r>' : cmd === '0113' ? '41 13 03\r\r>' : (cmd === 'STI' || cmd === 'AT@1') ? '?\r\r>' : null); await k.Adapter.run(); };
  let c;

  // ===== A. PID 34 (4 bayt: lambda + cərəyan) =====
  console.log('\n[A] PID 34 dekodlaşdırma');
  c = mk(FULL); let d34 = c.PIDS['34'].dec;
  eq('A1  4 bayt: lambda (7FE0 -> 0.99902)', d34([0x7F, 0xE0, 0x80, 0x00]).v, 0.999023, 1e-5);
  eq('A2  4 bayt: cərəyan 8000 -> 0 mA', d34([0x7F, 0xE0, 0x80, 0x00]).aux.cur, 0, 1e-9);
  eq('A3  cərəyan 9000 -> +16 mA', d34([0x7F, 0xE0, 0x90, 0x00]).aux.cur, 16, 1e-9);
  eq('A4  cərəyan 7000 -> -16 mA', d34([0x7F, 0xE0, 0x70, 0x00]).aux.cur, -16, 1e-9);
  eq('A5  lambda cərəyandan asılı deyil', d34([0x7F, 0xE0, 0x00, 0x00]).v, d34([0x7F, 0xE0, 0xFF, 0xFF]).v, 1e-12);
  let r2 = d34([0x7F, 0xE0]);   check('A6  2 baytlıq cavab: INVALID, lambda yoxdur', r2.v === null && /natamam/.test(r2.invalid), JSON.stringify(r2));
  let r3 = d34([0x7F, 0xE0, 0x80]); check('A7  3 baytlıq cavab: INVALID, lambda yoxdur', r3.v === null && /3 bayt/.test(r3.invalid), JSON.stringify(r3));
  check('A8  boş cavab: INVALID', d34([]).v === null && !!d34([]).invalid, '');
  eq('A9  5 baytlıq cavab: ilk 4 bayt götürülür', d34([0x7F, 0xE0, 0x80, 0x00, 0xFF]).v, 0.999023, 1e-5);
  // OBD boru kəməri
  c = mk(FULL);
  wire(c, cmd => cmd === '0134' ? '41 34 7F E0 80 00\r\r>' : null);
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push('34'); c.OBD.startPoll(['34']); await sleep(250); c.OBD.stopPoll();
  let v34 = c.OBD.values['34'];
  check('A10 canlı: 4 bayt oxunur, lambda və cərəyan ayrı saxlanır', v34 && Math.abs(v34.v - 0.999) < 0.001 && v34.aux && v34.aux.cur === 0 && v34.n >= 1, JSON.stringify(v34 && { v: v34.v, aux: v34.aux, n: v34.n }));
  eq('A11 canlı: status REAL', c.OBD.statusOf('34').status, 'REAL');
  wire(c, cmd => cmd === '0134' ? '41 34 7F E0\r\r>' : null);
  c = mk(FULL); wire(c, cmd => cmd === '0134' ? '41 34 7F E0\r\r>' : null);
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push('34'); c.OBD.startPoll(['34']); await sleep(250); c.OBD.stopPoll();
  v34 = c.OBD.values['34'];
  check('A12 canlı: natamam cavabdan lambda çıxarılmır (v=null, n=0)', v34 && v34.v === null && v34.n === 0 && v34.bad >= 1, JSON.stringify(v34 && { v: v34.v, n: v34.n, bad: v34.bad }));
  eq('A13 canlı: natamam cavab -> INVALID', c.OBD.statusOf('34').status, 'INVALID');

  // ===== B. PID statusları =====
  console.log('\n[B] Vahid PID status modeli');
  c = mk(FULL); c.OBD.S.supported.push('0C', '3C', '3E'); const now = Date.now();
  eq('B1  dəstəklənməyən PID -> UNSUPPORTED', c.OBD.statusOf('0E').status, 'UNSUPPORTED');
  check('B2  UNSUPPORTED səbəbi "nasazlıq deyil" deyir', /nasazlıq deyil/.test(c.OBD.statusOf('0E').reason), c.OBD.statusOf('0E').reason);
  eq('B3  dəstəklənir, hələ sorğulanmayıb -> UNKNOWN', c.OBD.statusOf('3C').status, 'UNKNOWN');
  c.OBD.values['0C'] = { v: 800, min: 800, max: 800, hist: [800], t: now, n: 3, nodata: false };
  eq('B4  təzə etibarlı dəyər -> REAL', c.OBD.statusOf('0C', now).status, 'REAL');
  eq('B5  20 s köhnə dəyər -> STALE', c.OBD.statusOf('0C', now + 20000).status, 'STALE');
  c.OBD.values['0C'].nodata = true;
  eq('B6  son sorğuya cavab yoxdur -> STALE (real kimi göstərilmir)', c.OBD.statusOf('0C', now).status, 'STALE');
  c.OBD.values['3E'] = { v: null, hist: [], t: 0, n: 0, nd: 4, nodata: true };
  eq('B7  heç vaxt etibarlı cavab gəlməyib -> UNKNOWN', c.OBD.statusOf('3E').status, 'UNKNOWN');
  c.OBD.values['3C'] = { v: null, hist: [], t: 0, n: 0, bad: 2, invalid: 'natamam cavab', nodata: true };
  eq('B8  natamam cavab -> INVALID', c.OBD.statusOf('3C').status, 'INVALID');
  c.OBD.S.sim = true;
  eq('B9  simulyasiya rejimində heç bir PID REAL deyil', c.OBD.statusOf('0C', now).status, 'INVALID');
  c = mk(FULL); wire(c, cmd => cmd === '010C' ? '41 0C 1A F8\r\r>' : null);
  c.OBD.S.state = 'ecu'; c.OBD.S.sim = true; c.OBD.startPoll(['0C']); await sleep(250); c.OBD.stopPoll();
  check('B10 simulyasiya məlumatı OBD.values-ə yazılmır', !c.OBD.values['0C'] || c.OBD.values['0C'].v === null, JSON.stringify(c.OBD.values['0C']));

  // ===== C. DTC statusları =====
  console.log('\n[C] DTC statusları ayrı');
  const D1 = { t: 'x', stored: { ok: true, codes: [] }, pending: { ok: true, codes: ['P0420'] }, permanent: { ok: true, codes: ['P0420'] } };
  c = mk(['log', 'store', 'pids', 'obd', 'adapter', 'ai-rules', 'session']);
  let sm = c.DtcStatus.summarize(D1);
  eq('C1  P0420 statusları: gözləyən + daimi', sm.byCode.P0420, ['pending', 'permanent']);
  eq('C2  Saxlanmış siyahı boşdur (oxunub)', [sm.read.stored, sm.codes.stored], [true, []]);
  sm = c.DtcStatus.summarize({ stored: { ok: true, codes: ['P0420'] }, pending: { ok: true, codes: [] }, permanent: { ok: false, codes: [] } });
  eq('C3  yalnız saxlanmış: byCode = [stored]', sm.byCode.P0420, ['stored']);
  check('C4  oxunmayan növ "oxunmayıb" yazılır', c.DtcStatus.lines({ permanent: { ok: false, codes: [] } }).some(l => /Daimi \(0A\): oxunmayıb/.test(l)), '');
  check('C5  məlumat yoxdursa hamısı oxunmayıb', c.DtcStatus.lines(null).every(l => /oxunmayıb/.test(l)), '');
  eq('C6  statusların etiketi', c.DtcStatus.labelsOf('P0420', D1), ['Gözləyən (07)', 'Daimi (0A)']);
  // LiveDiag hesabatı
  c = mk(LD);
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push(...SUP); c.OBD.startPoll = () => {}; c.Session.ctx.dtc = D1;
  c.LiveDiag.start(60); c.LiveDiag.stop(false);
  let txt = c.LiveDiag.text(c.LiveDiag.state().rep, { veh: '', vin: '' });
  check('C7  Canlı hesabat: Gözləyən (07): P0420', /Gözləyən \(07\): P0420/.test(txt), '');
  check('C8  Canlı hesabat: Daimi (0A): P0420', /Daimi \(0A\): P0420/.test(txt), '');
  check('C9  Canlı hesabat: Saxlanmış (03): yoxdur', /Saxlanmış \(03\): yoxdur/.test(txt), '');
  check('C10 Canlı hesabat: P0420 statusu dəqiq', /P0420 statusu: Gözləyən \(07\) \+ Daimi \(0A\)/.test(txt), '');
  check('C11 Problemlər siyahısında status var', /P0420 \[Gözləyən \(07\) \+ Daimi \(0A\)\]/.test(txt), '');
  // AI hesabatı (Report)
  c = mk(['log', 'store', 'pids', 'obd', 'adapter', 'ai-rules', 'session', 'report']);
  c.Session.ctx.dtc = D1; c.DTC_DB = {};
  check('C12 AI hesabatı: eyni status məlumatı', /P0420 statusu: Gözləyən \(07\) \+ Daimi \(0A\)/.test(c.Report.build()), '');

  // ===== D. Katalizator temperaturu =====
  console.log('\n[D] Katalizator temperaturu (PID 3C / 3E)');
  c = mk(LD);
  eq('D1  3C: 0FA0 -> 360 °C', c.PIDS['3C'].dec([0x0F, 0xA0]).v, 360, 1e-9);
  eq('D2  3E: 1194 -> 410 °C', c.PIDS['3E'].dec([0x11, 0x94]).v, 410, 1e-9);
  eq('D3  3C: 0000 -> -40 °C', c.PIDS['3C'].dec([0, 0]).v, -40, 1e-9);
  const stage = (ctx, sup) => { ctx.OBD.S.state = 'ecu'; ctx.OBD.S.supported.push(...sup); ctx.OBD.startPoll = () => {}; ctx.LiveDiag.start(60); return ctx.LiveDiag.state(); };
  let st = stage(c, SUP); const t0 = Date.now();
  st.acc['3C'] = { n: 10, sum: 3600, min: 350, max: 370, v: 360, t: t0 }; st.acc['3E'] = { n: 10, sum: 4100, min: 400, max: 420, v: 410, t: t0 };
  c.LiveDiag.stop(false); let rep = st.rep;
  check('D4  Sensor 1 və Sensor 2 ayrıca', rep.cat.s1 && rep.cat.s2 && rep.cat.s1.avg === 360 && rep.cat.s2.avg === 410, JSON.stringify(rep.cat));
  eq('D5  fərq avtomatik: S2 − S1 = 50', rep.cat.delta, 50, 1e-9);
  txt = c.LiveDiag.text(rep, {});
  check('D6  mətn: yalnız əlavə sübut, sağlam/nasaz deyil', /yalnız əlavə sübut/.test(txt) && /sağlam\/nasaz kimi qiymətləndirilmir/.test(txt) && /Fərq \(Sensor 2 − Sensor 1\): 50 °C/.test(txt), txt.slice(-600));
  check('D7  temperatura görə heç bir sağlam/nasaz hökmü yoxdur', !rep.items.some(i => (i.id === '3C' || i.id === '3E') && (i.verdict === c.LiveDiag.V.N || i.verdict === c.LiveDiag.V.P)), JSON.stringify(rep.items.filter(i => i.id === '3C').map(i => i.verdict)));
  c = mk(LD); st = stage(c, SUP);
  st.acc['3C'] = { n: 6, sum: 2160, min: 350, max: 370, v: 360, t: Date.now() }; c.LiveDiag.stop(false);
  check('D8  yalnız Sensor 1 oxunubsa fərq hesablanmır', st.rep.cat.s2 === null && st.rep.cat.delta === null && /hesablanmadı/.test(c.LiveDiag.text(st.rep, {})), JSON.stringify(st.rep.cat));
  c = mk(LD); st = stage(c, SUP.filter(x => x !== '3C' && x !== '3E')); c.LiveDiag.stop(false);
  check('D9  ECU 3C/3E dəstəkləmir: UNSUPPORTED, problem deyil', st.rep.pidStatus.filter(x => x.id === '3C' || x.id === '3E').every(x => x.status === 'UNSUPPORTED') && !st.rep.probs.some(p => /3C|3E/.test(p.title)), JSON.stringify(st.rep.probs.map(p => p.title)));

  // ===== E. PID prioritetləri, sorğulanmayanlar =====
  console.log('\n[E] PID prioritetləri və hesabat statusları');
  c = mk(LD); st = stage(c, SUP);
  eq('E1  ilk 6 əsas PID', st.ids.slice(0, 6), ['0C', '0D', '05', '06', '07', '04']);
  check('E2  34, 3C və 3E sorğu siyahısındadır', ['34', '3C', '3E', '15'].every(x => st.ids.indexOf(x) >= 0), st.ids.join());
  check('E3  limit: ən çox 14 PID + RV', st.ids.length <= 15, st.ids.length);
  c.LiveDiag.stop(false);
  check('E4  yük limiti səbəbilə sorğulanmayan PID problem kimi göstərilmir', !st.rep.probs.some(p => /sorğulanmayan/.test(p.title)), JSON.stringify(st.rep.probs.map(p => p.title)));
  check('E5  sorğulanmayan PID: UNKNOWN (nasazlıq deyil)', st.skipped.length === 0 || st.rep.pidStatus.filter(x => st.skipped.indexOf(x.id) >= 0).every(x => x.status === 'UNKNOWN' && /nasazlıq deyil/.test(x.reason)), '');
  txt = c.LiveDiag.text(st.rep, {});
  check('E6  hesabatda PID statusları var', /PID statusları \(test sonunda/.test(txt) && /(UNKNOWN|REAL|STALE|UNSUPPORTED|INVALID)/.test(txt), '');

  // ===== F. RPM sabitlik filtri (boş gediş) =====
  console.log('\n[F] Yeni RPM filtri');
  const run = async (rpmFn) => {
    const k = mk(LD); let n = 0;
    wire(k, cmd => cmd === '010C' ? '41 0C ' + rpmFn(n++) + '\r\r>' : cmd === '010D' ? '41 0D 00\r\r>' : cmd === '0105' ? '41 05 82\r\r>' : cmd === 'ATRV' ? '12.6V\r\r>' : null);
    k.OBD.S.state = 'ecu'; k.OBD.S.supported.push('0C', '0D', '05'); k.LiveDiag.start(60); await sleep(1500);
    const s2 = k.LiveDiag.state(), idle = s2.b.idle['0C']; k.LiveDiag.stop(false); return idle ? idle.n : 0;
  };
  const hx = rpm => { const w = rpm * 4; return ('0' + (w >> 8).toString(16)).slice(-2).toUpperCase() + ' ' + ('0' + (w & 255).toString(16)).slice(-2).toUpperCase(); };
  const nStable = await run(() => hx(800));
  const nRev = await run(i => hx(i % 2 ? 1300 : 800));
  check('F1  sabit 800 rpm: boş gediş nümunələri toplanır', nStable > 0, nStable);
  eq('F2  qaza basma (800↔1300): boş gediş nümunəsi toplanmır', nRev, 0);

  // ===== G. Zaman fərqi, Δt və tezlik =====
  console.log('\n[G] Zaman damğası, median Δt, tezlik filtri');
  c = mk(LD);
  const series = (t0, dt, n) => Array.from({ length: n }, (_, i) => t0 + Math.round(i * dt * 1000));
  c.OBD.values['34'] = { v: 1, hist: [], ts: series(1000, 0.2, 14), n: 14 }; c.OBD.values['15'] = { v: 0.5, hist: [], ts: series(1100, 0.2, 14), n: 14 };
  let tm = c.OBD.timing('34', '15');
  check('G1  median Δt hər sensor üçün hesablanır', Math.abs(tm.dtA - 0.2) < 1e-9 && Math.abs(tm.dtB - 0.2) < 1e-9, JSON.stringify(tm));
  eq('G2  sensorlar arası median zaman fərqi 0.1 s', tm.lag, 0.1, 1e-9);
  check('G3  tezlik kifayətdir (Δt 0.2 ≤ 0.4): müqayisə etibarlıdır', tm.valid === true, JSON.stringify(tm));
  c.OBD.values['34'].ts = series(1000, 1.5, 14); c.OBD.values['15'].ts = series(1100, 1.5, 14); tm = c.OBD.timing('34', '15');
  check('G4  Δt 1.5 s: müqayisə ETİBARSIZ', tm.valid === false && /Δt/.test(tm.reason), JSON.stringify(tm));
  c.OBD.values['34'].ts = series(1000, 0.2, 5); tm = c.OBD.timing('34', '15');
  check('G5  nümunə sayı az (<8): ETİBARSIZ', tm.valid === false && /nümunə/.test(tm.reason), JSON.stringify(tm));
  // LiveDiag hesabatında
  st = stage(c, SUP); c.OBD.values['34'] = { v: 1, hist: [], ts: series(1000, 1.5, 14), n: 14 }; c.OBD.values['15'] = { v: 0.5, hist: [], ts: series(1100, 1.5, 14), n: 14 };
  await setMap(c);
  st.acc['15'] = { n: 30, sum: 18, min: 0.5, max: 0.7, v: 0.6, t: Date.now() }; st.b.steady['15'] = { n: 30, sum: 18, min: 0.5, max: 0.7 }; st.b.hot['15'] = { n: 30, sum: 18, min: 0.5, max: 0.7 };
  c.LiveDiag.stop(false); rep = st.rep; txt = c.LiveDiag.text(rep, {});
  check('G6  hesabatda median Δt və zaman fərqi göstərilir', /Median Δt: PID 34 = 1\.50 s, PID 15 = 1\.50 s/.test(txt) && /zaman fərqi: 0\.10 s/.test(txt), txt.match(/Median[^\n]*/) );
  check('G7  hesabatda "ETİBARSIZ" və Fokus tövsiyəsi', /ETİBARSIZ/.test(txt) && /Fokus rejimi/.test(txt) && rep.focusAdvice === true, '');
  const it15 = rep.items.find(i => i.id === '15');
  check('G8  tezlik kifayət etmirsə B1S2 "normal" elan edilmir', it15 && it15.verdict !== c.LiveDiag.V.N, JSON.stringify(it15 && it15.verdict));
  // B1S2 sabit sürət filtri
  c = mk(LD); st = stage(c, SUP); await setMap(c);
  st.acc['15'] = { n: 30, sum: 9, min: 0, max: 0.87, v: 0.3, t: Date.now() }; st.b.hot['15'] = { n: 30, sum: 9, min: 0, max: 0.87 };
  c.LiveDiag.stop(false); const i15 = st.rep.items.find(x => x.id === '15');
  check('G9  sabit sürətli nümunə yoxdur: B1S2 hökmü "məlumat kifayət deyil" (yavaşlama 0 V-i sayılmır)', i15 && i15.verdict === c.LiveDiag.V.U && /sabit sürət/.test(i15.rng || i15.note || ''), JSON.stringify(i15 && { v: i15.verdict, rng: i15.rng }));

  // ===== H. Fokus / Ümumi rejim ayrılığı =====
  console.log('\n[H] Fokus və Ümumi rejim qarışmır');
  c = mk(FULL); c.Transport.write = async s => { const cmd = s.replace('\r', ''); const R = { '010C': '41 0C 27 10', '0105': '41 05 82', '010D': '41 0D 00', '0114': '41 14 80 FF', '0115': '41 15 82 FF' }; if (R[cmd]) setTimeout(() => c.ELM.onData(R[cmd] + '\r\r>'), 4); };
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push('13', '14', '15', '0C', '05', '0D'); c.Adapter.map = () => ({ scheme: '13', mask: 3 });
  const O = c.O2Diag; O.start(false); O.setFocus(true);
  check('H1  nümunə toplanmamış rejim dəyişməsi sıfırlama yaratmır', !O.state().modeReset, '');
  O.setFocus(false); await sleep(2500);
  const before = O.state().rpmH.length; O.setFocus(true);
  check('H2  nümunədən sonra rejim dəyişəndə: köhnə nümunələr arxivləşir', O.state().modeReset === true && O.state().archive && O.state().archive.focus === false, JSON.stringify(O.state().archive && { f: O.state().archive.focus }));
  check('H3  yeni rejimin sayğacı sıfırdan başlayır (qarışma yoxdur)', O.state().rpmH.length < before && before > 0, before + ' -> ' + O.state().rpmH.length);
  const an = O.analyze(O.collect());
  check('H4  nəticədə "arxivləşdirilib" qeydi var', an.notes.some(x => /arxivləşdirilib/.test(x)), JSON.stringify(an.notes));
  O.stop();

  console.log('\nYENİ TESTLƏR NƏTİCƏSİ: ' + pass + ' keçdi, ' + fail + ' uğursuz');
  process.exit(fail ? 1 : 0);
})();
