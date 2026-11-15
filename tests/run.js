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

(async () => {
  // ---------- 1. PID dekoderləri ----------
  console.log('\n[1] PID dekoderləri');
  let c = mk(['pids']); const P = c.PIDS;
  eq('0C: 1AF8 -> 1726 rpm', P['0C'].dec([0x1A, 0xF8]).v, 1726, 0.01);
  eq('05: 7B -> 83 C', P['05'].dec([0x7B]).v, 83);
  eq('06: 80 -> 0 %', P['06'].dec([0x80]).v, 0, 0.01);
  eq('06: 00 -> -100 %', P['06'].dec([0]).v, -100, 0.01);
  eq('10: 0190 -> 4 g/s', P['10'].dec([1, 0x90]).v, 4, 0.001);
  eq('14: 5A -> 0.45 V', P['14'].dec([0x5A, 0x80]).v, 0.45, 0.001);
  eq('24: 8000 -> lambda 1', P['24'].dec([0x80, 0, 0, 0]).v, 1, 0.001);
  eq('42: 3A98 -> 15 V', P['42'].dec([0x3A, 0x98]).v, 15, 0.001);
  eq('3C: 0FA0 -> 360 C', P['3C'].dec([0x0F, 0xA0]).v, 360, 0.01);
  eq('32: FFFC -> -1 Pa', P['32'].dec([0xFF, 0xFC]).v, -1, 0.001);
  eq('5E: 0064 -> 5 L/h', P['5E'].dec([0, 100]).v, 5, 0.001);

  // ---------- 2. Formula ----------
  console.log('\n[2] Formula');
  c = mk(['formula']); const F = c.Formula.compile;
  eq('(A*256+B)/4', F('(A*256+B)/4')([0x1A, 0xF8]), 1726, 0.01);
  eq('A-40', F('A-40')([0x7B]), 83);
  eq('-A*2', F('-A*2')([5]), -10);
  let m = ''; try { F('A/0')([1]); } catch (e) { m = e.message; } eq('sıfıra bölmə xəta verir', m, 'Sıfıra bölmə');
  m = ''; try { F('A+')([1]); } catch (e) { m = 'x'; } eq('natamam düstur xəta verir', m, 'x');

  // ---------- 3. ELM: timeout-dan sonra sürüşmə olmur ----------
  console.log('\n[3] ELM resinxronizasiya');
  c = mk(['log', 'elm']);
  const resp = { '010C': '41 0C 1A F8', '010D': '41 0D 3C', '0105': '41 05 7B', '010F': '41 0F 41' };
  let busy = 0;
  c.Transport = { write: async s => { const cmd = s.replace('\r', ''); const now = Date.now(), st = Math.max(now, busy), d = cmd === '010C' ? 1900 : 150; busy = st + d; setTimeout(() => c.ELM.onData(resp[cmd] + '\r\r>'), busy - now); } };
  const out = [];
  for (const cmd of ['010C', '010D', '0105', '010F']) { try { out.push((await c.ELM.send(cmd, 1500)).join(' ')); } catch (e) { out.push('timeout'); } }
  eq('timeout-dan sonra hər əmr öz cavabını alır', out, ['timeout', '41 0D 3C', '41 05 7B', '41 0F 41']);

  // ---------- 4. DTC / VIN / Mode 06 ----------
  console.log('\n[4] DTC, VIN, Mode 06 oxunuşu');
  c = mk(['log', 'elm', 'pids', 'obd', 'obd-extra']);
  c.OBD.S.protocol = 'AUTO, ISO 15765-4 (CAN 11/500)';
  wire(c, cmd => cmd === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null);
  let r = await c.OBD.readDtcs('03');
  eq('Mode 03 CAN çox-çərçivə: P0133, P0420, P0171', r.codes, ['P0133', 'P0420', 'P0171']);
  wire(c, cmd => cmd === '03' ? '43 00\r\r>' : null); r = await c.OBD.readDtcs('03');
  eq('Kod yoxdur', [r.ok, r.codes], [true, []]);
  wire(c, cmd => cmd === '07' ? 'NO DATA\r\r>' : null); r = await c.OBD.readDtcs('07');
  eq('NO DATA -> ok:false', r.ok, false);
  c.OBD.S.protocol = ''; c.sent = [];
  wire(c, cmd => cmd === 'ATDP' ? 'AUTO\r\r>' : (cmd === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null));
  r = await c.OBD.readDtcs('03');
  eq('Protokol bilinmirsə səhv kod oxunmur', [r.ok, r.codes], [false, []]);
  c.OBD.S.protocol = '';
  wire(c, cmd => cmd === 'ATDP' ? 'AUTO, ISO 15765-4 (CAN 11/500)\r\r>' : (cmd === '03' ? '0A\r0: 43 03 01 33\r1: 04 20 01 71 00\r\r>' : null));
  r = await c.OBD.readDtcs('03');
  eq('Protokol boşdursa ATDP ilə təyin edilir, kodlar düzgün', r.codes, ['P0133', 'P0420', 'P0171']);

  const vin = 'KNAFK4A60F5312777', hx = [...vin].map(ch => ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  const vinResp = '014\r0: 49 02 01 ' + hx.slice(0, 3).join(' ') + '\r1: ' + hx.slice(3, 10).join(' ') + '\r2: ' + hx.slice(10).join(' ');
  wire(c, cmd => cmd === '0902' ? vinResp + '\r\r>' : null);
  let v = await c.OBD.readVehicleInfo(); eq('VIN düzgün oxunur', v.vin, vin);
  wire(c, cmd => cmd === '0902' ? vinResp + '\r41 0C 1A F8\r\r>' : null);
  v = await c.OBD.readVehicleInfo(); eq('VIN-ə yad sətir qarışmır', v.vin, vin);
  wire(c, cmd => cmd === '0902' ? '014\r0: 49 02 01 4F 4F 4F\r1: 31 32 33 34 35 36 37\r2: 38 39 30 31 32 33 34\r\r>' : null);
  v = await c.OBD.readVehicleInfo(); eq('Yanlış formatlı VIN (O hərfi) rədd edilir', v.vin, '');

  // Mode 06 işarəli dəyər: -10 [-20..20] normal olmalıdır
  wire(c, cmd => cmd === '06A1' ? '46 A1 01 81 FF F6 FF EC 00 14\r\r>' : null);
  const m6 = await c.OBD.mode06Read(0xA1);
  eq('Mode 06 işarəli vahid: -10 hədlər daxilindədir', [m6.tests[0].v, m6.tests[0].ok], [-10, true]);
  wire(c, cmd => cmd === '0601' ? '46 01 01 01 00 64 00 00 00 C8\r\r>' : null);
  const m6b = await c.OBD.mode06Read(1);
  eq('Mode 06 işarəsiz dəyər 100 [0..200] normal', m6b.tests[0].ok, true);

  // Hazırlıq (readiness): benzin və dizel
  wire(c, cmd => cmd === '0101' ? '41 01 82 07 65 00\r\r>' : null);
  let rd = await c.OBD.readReadiness();
  eq('Readiness: MIL yanır, say=2', [rd.mil, rd.count], [true, 2]);
  wire(c, cmd => cmd === '0101' ? '41 01 00 0F 53 00\r\r>' : null);
  rd = await c.OBD.readReadiness();
  check('Readiness dizel: testlər göstərilir', rd.diesel && rd.items.length > 3, JSON.stringify(rd));

  // ---------- 5. Sorğu dövrü: PID prefiksi və köhnə dəyər ----------
  console.log('\n[5] Canlı oxuma');
  c = mk(['log', 'elm', 'pids', 'obd']);
  wire(c, cmd => cmd === '010C' ? '41 0C 1A F8\r\r>' : null);
  c.OBD.S.state = 'ecu'; c.OBD.startPoll(['0C']); await sleep(250); c.OBD.stopPoll();
  eq('010C -> 1726 rpm oxundu', c.OBD.values['0C'] && c.OBD.values['0C'].v, 1726, 0.01);
  wire(c, cmd => cmd === '010C' ? '41 0D 3C\r\r>' : null);
  c.OBD.S.state = 'ecu'; c.OBD.startPoll(['0C']); await sleep(250); c.OBD.stopPoll();
  check('Başqa PID-in cavabı RPM kimi qəbul edilmir (nodata)', c.OBD.values['0C'] && c.OBD.values['0C'].nodata === true, JSON.stringify(c.OBD.values['0C']));

  // ---------- 6. Jurnaldan VIN gizlədilir, yerli vaxt ----------
  console.log('\n[6] Log və vaxt');
  c = mk(['log']);
  c.Log.add('TX', '0902'); c.Log.add('RX', '"0: 49 02 01 4B 4E 41"'); c.Log.add('RX', '"1: 46 4B"'); c.Log.add('TX', '010C'); c.Log.add('RX', '"410C1AF8"');
  const safe = c.Log.safeText();
  check('VIN cavabı gizlədilib', !/49 02 01|4B 4E 41/.test(safe) && /410C1AF8/.test(safe), safe);
  eq('UTC -> yerli vaxt (Bakı UTC+4)', c.LocalTime.full('2026-11-14T09:13:46Z'), '2026-11-14 13:13:46');

  // ---------- 7. Yanacaq kalibrasiyası ----------
  console.log('\n[7] Yanacaq');
  c = mk(['log', 'store', 'pids', 'obd', 'fuel']);
  c.Store.set('fueltrip', { L: 10, km: 100, sec: 0, lt: 0, ltn: 0 });
  let f1 = c.Fuel.fill(40, true);
  check('İlk tam dolum yalnız başlanğıc nöqtəsidir (kalibrasiya yoxdur)', !f1.newK && /başlanğıc/.test(f1.note), JSON.stringify(f1));
  c.Store.set('fueltrip', { L: 10, km: 100, sec: 0, lt: 0, ltn: 0 }); c.Store.set('fuelcfg', { k: 1 });
  f1 = c.Fuel.fill(8, true); eq('Tam dolum: 8 L real / 10 L hesab -> k=0.8', f1.newK, 0.8, 1e-9);
  c.Store.set('fueltrip', { L: 10, km: 100, sec: 0, lt: 0, ltn: 0 });
  c.Fuel.fill(3, false);
  eq('Yarımçıq dolum səfəri sıfırlamır', c.Store.get('fueltrip', {}).L, 10);
  f1 = c.Fuel.fill(5, true); eq('Yarımçıq + tam: (3+5)/(10/0.8) = 0.64', f1.newK, 0.64, 1e-9);
  c.Store.set('fueltrip', { L: 10, km: 5, sec: 0, lt: 0, ltn: 0 });
  f1 = c.Fuel.fill(8, true); check('20 km-dən az sürüşdə kalibrasiya aparılmır', !f1.newK && /20 km/.test(f1.note), JSON.stringify(f1));
  c.Store.set('fueltrip', { L: 1, km: 50, sec: 0, lt: 0, ltn: 0 }); c.Store.set('fuelcfg', { k: 1 });
  f1 = c.Fuel.fill(30, true); check('Həddən çox fərq: əmsal 1.6-a kəsilir və xəbərdarlıq göstərilir', f1.newK === 1.6 && f1.clamped, JSON.stringify(f1));

  // ---------- 8. LiveDiag PID seçimi ----------
  console.log('\n[8] Canlı diaqnostika');
  c = mk(['log', 'store', 'pids', 'obd', 'adapter', 'ai-rules', 'session', 'livediag']);
  c.OBD.S.state = 'ecu';
  c.OBD.S.supported.push(...'01 03 04 05 06 07 0B 0C 0D 0E 0F 11 13 15 1C 1F 21 2E 2F 30 31 32 33 34 3C 3E 41 42 43 44 45 46 47 49 4A 4C 4D 4E 51 55 56'.split(' '));
  c.OBD.startPoll = () => {};
  c.LiveDiag.start(60); const ld = c.LiveDiag.state();
  ['0C', '0D', '05', '06', '07'].forEach(id => check('LiveDiag sorğulayır: PID ' + id, ld.ids.indexOf(id) >= 0, ld.ids.join(',')));
  check('LiveDiag limiti: ən çox 14 PID + RV', ld.ids.length <= 15, ld.ids.length);
  check('Sorğulanmayanlar siyahısı saxlanır', Array.isArray(ld.skipped), '');
  c.OBD.S.state = 'ecu';
  c.LiveDiag.stop(false);

  // ---------- 9. Hesabat: gərginlik və DTC ----------
  console.log('\n[9] Hesabat');
  c = mk(['log', 'store', 'pids', 'obd', 'report']);
  const now = Date.now(), h42 = [9.6, 11.8, 12.3].concat(Array(40).fill(14.1)), hr = Array(43).fill(800);
  c.OBD.values['42'] = { v: 14.1, min: 9.6, max: 14.4, hist: h42, t: now, nodata: false };
  c.OBD.values['0C'] = { v: 800, min: 700, max: 900, hist: hr, t: now, nodata: false };
  c.OBD.values['1F'] = { v: 400, min: 1, max: 400, hist: [1, 400], t: now, nodata: false };
  c.Session = { ctx: { dtc: { t: new Date().toISOString(), stored: { ok: true, codes: ['P0420'] }, pending: { ok: true, codes: [] }, permanent: { ok: false, codes: [], status: 'NODATA' } }, freeze: null } };
  c.DTC_DB = { P0420: { en: 'Catalyst System Efficiency Below Threshold (Bank 1)' } };
  let rep = c.Report.build();
  check('Starter dövrü "şarj aşağıdır" yalançı həyəcanı vermir', !/şarj aşağıdır/.test(rep), '');
  check('Hesabatda P0420 var', /Saxlanmış \(03\): P0420/.test(rep), '');
  check('Köhnə "DTC OXUNMUR" mətni yoxdur', !/OXUNMUR/.test(rep), '');
  c.OBD.values['42'].hist = Array(40).fill(12.2).concat(Array(5).fill(12.1)); c.OBD.values['42'].v = 12.1;
  rep = c.Report.build();
  check('Mühərrik işləyərkən real aşağı gərginlik tutulur', /şarj aşağıdır/.test(rep), '');

  // ---------- 10. AI qaydaları: O2 mövqesi təsdiqlənməyibsə katalizator ehtimalı yoxdur ----------
  console.log('\n[10] AI qaydaları');
  c = mk(['log', 'store', 'pids', 'obd', 'adapter', 'ai-rules']);
  const sw = [0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8, 0.1, 0.8];
  const V = { '14': { hist: sw }, '15': { hist: sw } };
  let A = c.AIRules.analyze(V, null);
  check('Sensor mövqeyi bilinmir: "cat" hipotezi yoxdur', !A.hyps.some(h => h.key === 'cat'), JSON.stringify(A.hyps));
  c.Adapter.map = () => ({ scheme: '13', mask: 3 });
  A = c.AIRules.analyze(V, null);
  check('Mövqe təsdiqlənibsə "cat" hipotezi çıxır', A.hyps.some(h => h.key === 'cat'), JSON.stringify(A.hyps));

  // ---------- 11. DTC çevirmə faylı: boş təsvir qəbul edilmir ----------
  console.log('\n[11] DTC tərcümə yoxlaması');
  const tr = require(path.join(__dirname, '..', 'tools', 'translate-dtc.js'));
  const src = { P0420: { t: 'Cat', d: 'Long text', c: ['a', 'b'], s: ['x'] } };
  eq('Boş təsvir rədd edilir', Object.keys(tr.clean(src, { P0420: { t: 'K', d: '', c: ['a', 'b'], s: ['x'] } })).length, 0);
  eq('Boş səbəb rədd edilir', Object.keys(tr.clean(src, { P0420: { t: 'K', d: 'T', c: ['a', ''], s: ['x'] } })).length, 0);
  eq('Düzgün tərcümə qəbul edilir', Object.keys(tr.clean(src, { P0420: { t: 'K', d: 'T', c: ['a', 'b'], s: ['x'] } })).length, 1);

  // ---------- 12. O2 / katalizator differensial diaqnostikası ----------
  console.log('\n[12] O2 / katalizator diaqnostikası');
  c = mk(['log', 'store', 'pids', 'obd', 'elm', 'obd-extra', 'adapter', 'o2diag']);
  const O = c.O2Diag;
  const series = (n, dt, fn) => { const t = [], v = []; for (let i = 0; i < n; i++) { t.push(1e6 + i * dt * 1000); v.push(fn(i * dt)); } return { t, v }; };
  const sq = (lo, hi, f) => s => ((Math.floor(s * f * 2) % 2) ? hi : lo);
  const flat = k => () => k;
  const mkInp = o => {
    const reg = { cold: { sec: 0, ser: {} }, idle: { sec: 40, ser: {} }, r2500: { sec: 50, ser: {} } }, dt = o.dt || 0.3;
    reg.r2500.ser['14'] = series(160, dt, o.front25 || sq(0.1, 0.8, 1)); reg.r2500.ser['15'] = series(160, dt, o.rear25 || flat(0.65));
    reg.idle.ser['14'] = series(120, dt, o.frontI || sq(0.1, 0.8, 1)); reg.idle.ser['15'] = series(120, dt, o.rearI || flat(0.65));
    const tr = (id, a, b) => { reg.idle.ser[id] = series(60, 1, () => a); reg.r2500.ser[id] = series(60, 1, () => b); };
    tr('06', o.stI === undefined ? 1 : o.stI, o.st25 === undefined ? 1 : o.st25); tr('07', o.ltI === undefined ? 2 : o.ltI, o.lt25 === undefined ? 2 : o.lt25);
    reg.idle.ser['0C'] = series(60, 1, i => 800 + (o.rpmJit || 0) * Math.sin(i * 3)); reg.r2500.ser['0C'] = series(60, 1, () => 2500);
    reg.idle.ser['03'] = series(60, 1, () => 2); reg.r2500.ser['03'] = series(60, 1, () => 2);
    const sup = ['14', '15', '13', '06', '07', '0C', '05', '0D', '03', '0B', '10'];
    return { sensors: o.ident || O.identify(sup, { scheme: '13', mask: 3 }), reg, supported: o.sup || sup, codes: o.codes === undefined ? [] : o.codes, m06: o.m06 || null };
  };
  const RR = (a, k) => a.results.find(r => r.key === k);
  let id = O.identify(['14', '15', '24', '13'], { scheme: '13', mask: 3 });
  check('Genişzolaqlı B1S1 (24) darzolaqlıdan üstün tutulur', id.front.pid === '24' && id.front.kind === 'wide' && id.rear.pid === '15', JSON.stringify([id.front, id.rear]));
  id = O.identify(['14', '15'], null); check('Mövqe sxemi yoxdursa B1S1/B1S2 təyin edilmir', id.front === null && id.rear === null && id.issues.length > 0, JSON.stringify(id));
  id = O.identify(['15'], { scheme: '13', mask: 3 }); check('Yalnız PID 15 varsa ön sensor yoxdur, başqa PID əvəz edilmir', id.front === null && id.rear && id.rear.pos === 'B1S2', JSON.stringify(id));
  id = O.identify(['14', '15'], { scheme: '13', mask: 2 }); check('Maska B1S1-i göstərmirsə təsdiqlənmir', id.front === null, JSON.stringify(id.sensors));
  id = O.identify(['14', '16'], { scheme: '1D', mask: 15 }); eq('1D sxemində PID 16 = B2S1', id.sensors.find(x => x.pid === '16').pos, 'B2S1');
  eq('Rejim: soyuq', O.classify({ rpm: 800, ect: 40, spd: 0, rpmRange: 50 }), 'cold');
  eq('Rejim: isti boş gediş', O.classify({ rpm: 800, ect: 90, spd: 0, rpmRange: 50 }), 'idle');
  eq('Rejim: sabit 2500', O.classify({ rpm: 2500, ect: 90, spd: 0, rpmRange: 60 }), 'r2500');
  eq('Rejim: hərəkətdə sayılmır', O.classify({ rpm: 2500, ect: 90, spd: 30, rpmRange: 60 }), 'moving');
  eq('Rejim: qeyri-sabit 2500 sayılmır', O.classify({ rpm: 2500, ect: 90, spd: 0, rpmRange: 400 }), 'other');
  let an = O.analyze(mkInp({}));
  check('Sağlam sistem: katalizator zəif görünmür', ['Əlamət tapılmadı', 'Aşağı'].includes(RR(an, 'cat').level), RR(an, 'cat').level);
  check('Sağlam sistem: sensor nasazlığı əlaməti yoxdur', RR(an, 'front').level === 'Əlamət tapılmadı' && RR(an, 'rear').level === 'Əlamət tapılmadı', RR(an, 'front').level + RR(an, 'rear').level);
  an = O.analyze(mkInp({ rear25: sq(0.1, 0.8, 1), rearI: sq(0.1, 0.8, 1), codes: ['P0420'] }));
  check('Arxa sensor ön sensoru təqlid edir + P0420: katalizator Orta/Yüksək', ['Yüksək', 'Orta'].includes(RR(an, 'cat').level), RR(an, 'cat').level + JSON.stringify(RR(an, 'cat').reasons));
  check('Advice katalizatorun dəyişdirilməsini tövsiyə etmir', /tövsiyə etmir/.test(an.advice), an.advice);
  an = O.analyze(mkInp({ ident: O.identify(['14', '15'], null) }));
  check('Sxem yoxdur: katalizator Müəyyən edilə bilmir', RR(an, 'cat').level === 'Müəyyən edilə bilmir' && RR(an, 'cat').reasons.some(x => /PID 13\/1D/.test(x)), JSON.stringify(RR(an, 'cat')));
  let kin = mkInp({ ident: O.identify(['15', '13', '44'], { scheme: '13', mask: 3 }), sup: ['15', '13', '44', '06', '07', '0C', '05', '03'] }); delete kin.reg.idle.ser['14']; delete kin.reg.r2500.ser['14'];
  an = O.analyze(kin);
  check('Ön sensor PID-i yoxdur: ön sensor və katalizator Müəyyən edilə bilmir', RR(an, 'front').level === 'Müəyyən edilə bilmir' && RR(an, 'cat').level === 'Müəyyən edilə bilmir', RR(an, 'front').level + RR(an, 'cat').level);
  check('PID 44 (əmr edilən lambda) sensor əvəzi kimi istifadə edilmir', !/PID 44/.test(JSON.stringify(an.results)) && RR(an, 'front').reasons.some(x => /istifadə edilmir/.test(x)), JSON.stringify(RR(an, 'front').reasons));
  an = O.analyze(mkInp({ front25: flat(0.45), frontI: flat(0.45), codes: ['P0134'] }));
  check('Ön sensor 0.45 V-da ilişib + P0134: Yüksək', RR(an, 'front').level === 'Yüksək', RR(an, 'front').level);
  check('Ön sensor nasazdırsa katalizator hökmü çıxmır', RR(an, 'cat').level === 'Müəyyən edilə bilmir' && RR(an, 'cat').reasons.some(x => /Ön sensor/.test(x)), JSON.stringify(RR(an, 'cat').reasons));
  an = O.analyze(mkInp({ rear25: flat(0.85), rearI: flat(0.85), codes: ['P0137'] }));
  check('Arxa sensor yüksəkdə ilişib: Orta/Yüksək', ['Orta', 'Yüksək'].includes(RR(an, 'rear').level), RR(an, 'rear').level);
  an = O.analyze(mkInp({ codes: ['P0301'] }));
  check('Misfire kodu: misfire Yüksək, katalizator bloklanır', RR(an, 'mis').level === 'Yüksək' && RR(an, 'cat').level === 'Müəyyən edilə bilmir', RR(an, 'mis').level + RR(an, 'cat').level);
  an = O.analyze(mkInp({ rpmJit: 200 })); check('Boş gedişdə RPM qeyri-sabit: misfire Orta+', ['Orta', 'Yüksək'].includes(RR(an, 'mis').level), RR(an, 'mis').level);
  an = O.analyze(mkInp({ stI: 12, ltI: 10, st25: 2, lt25: 3 }));
  check('Kasıb qarışıq: qarışıq problemi Orta+', ['Orta', 'Yüksək'].includes(RR(an, 'mix').level), RR(an, 'mix').level);
  check('Qarışıq problemi katalizator hökmünü bloklayır', RR(an, 'cat').level === 'Müəyyən edilə bilmir', RR(an, 'cat').level);
  check('Egzoz sızması heç vaxt Yüksək verilmir', RR(an, 'leak').level !== 'Yüksək', RR(an, 'leak').level);
  an = O.analyze(mkInp({ dt: 1.0, front25: sq(0.1, 0.8, 0.1), frontI: sq(0.1, 0.8, 0.1) }));
  check('Seyrək nümunə: yavaş reaksiya iddia edilmir, Fokus rejimi təklif edilir', !RR(an, 'front').evidence.some(x => /yavaş reaksiya/.test(x)) && an.missing.some(x => /Fokus/.test(x)), JSON.stringify(an.missing));
  an = O.analyze(mkInp({ rear25: sq(0.2, 0.7, 1), rearI: sq(0.2, 0.7, 1), m06: { mid: 0x21, tests: [{ ok: false, v: 900, mn: 0, mx: 600 }] } }));
  check('Mode 06 katalizator testi uğursuz: sübuta daxil edilir', RR(an, 'cat').evidence.some(x => /MID 21/.test(x)), JSON.stringify(RR(an, 'cat')));
  an = O.analyze(mkInp({ codes: null })); check('Kodlar oxunmayıb: çatışmazlıq siyahısında', an.missing.some(x => /Xəta kodları oxunmayıb/.test(x)), '');
  const svg = O.svgChart({ now: 1e6 + 60000, win: 60, series: [{ color: '#fff', data: [{ t: 1e6 + 1000, v: 0.2 }, { t: 1e6 + 30000, v: 0.8 }] }], min: 0, max: 1, refs: [{ v: 0.45, l: '0.45 V' }] });
  check('Qrafik SVG qaytarır', /^<svg/.test(svg) && /polyline/.test(svg), svg.slice(0, 60));
  check('Boş qrafik "Məlumat yoxdur" yazır', /Məlumat yoxdur/.test(O.svgChart({ now: 1, series: [{ color: '#fff', data: [] }] })), '');
  eq('PID 16 gərginlik (100/200 = 0.5 V)', c.PIDS['16'].dec([100, 0]).v, 0.5, 1e-9);
  eq('PID 26 lambda 8000 -> 1', c.PIDS['26'].dec([0x80, 0, 0, 0]).v, 1, 1e-9);
  eq('PID 34 lambda 8000 -> 1', c.PIDS['34'].dec([0x80, 0, 0, 0]).v, 1, 1e-9);
  check('Hesabat mətni "Müəyyən edilə bilmir" səbəbini göstərir', /Niyə müəyyən edilə bilmir/.test(O.reportText(O.analyze(kin), {})), '');
  // canlı yığım (sahte adapter ilə)
  let nn = 0;
  c.Transport.write = async s => { const cmd = s.replace('\r', ''); nn++; const Rm = { '010C': '41 0C 27 10', '0105': '41 05 82', '010D': '41 0D 00', '0106': '41 06 80', '0107': '41 07 80', '0104': '41 04 40', '0103': '41 03 02 00', '0115': '41 15 82 FF' }; let rs = Rm[cmd]; if (cmd === '0114') rs = '41 14 ' + ((nn % 4 < 2) ? '14' : 'A0') + ' FF'; if (rs) setTimeout(() => c.ELM.onData(rs + '\r\r>'), 3); };
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push('13', '14', '15', '0C', '05', '0D', '06', '07', '04', '03'); c.Adapter.map = () => ({ scheme: '13', mask: 3 });
  O.start(false); await sleep(4500);
  const li = O.collect();
  check('Canlı yığım: 2500 rpm rejimi toplanır, ön sensor dekodlanır', li.reg.r2500.sec >= 2 && li.reg.r2500.ser['14'] && li.reg.r2500.ser['14'].v.length > 20 && li.reg.r2500.ser['14'].v.some(v => v < 0.2) && li.reg.r2500.ser['14'].v.some(v => v > 0.7), JSON.stringify([li.reg.r2500.sec, O.state().cur]));
  check('Canlı yığım: boş gediş rejiminə yanlış nümunə düşmür', Object.keys(li.reg.idle.ser).length === 0, Object.keys(li.reg.idle.ser).join());
  O.setFocus(true); eq('Fokus rejimi: yalnız O2 və RPM sorğulanır', O.state().ids, ['14', '15', '0C']);
  await sleep(500);
  const la = O.analyze(O.collect());
  check('Qısa test (<30 s): katalizator qiymətləndirilmir', RR(la, 'cat').level === 'Müəyyən edilə bilmir', RR(la, 'cat').level);
  check('Fokus rejimi hesabatda qeyd olunur', la.notes.some(x => /Fokus/.test(x)), JSON.stringify(la.notes));
  O.stop(); eq('Test dayandırılır', O.state().on, false);

  c = mk(['log', 'store', 'pids', 'obd', 'compat']);
  c.OBD.S.state = 'ecu'; c.OBD.S.supported.push('34', '0C');
  const cl = c.Compat.list().find(x => /O2 \/ lambda/.test(x.name));
  check('Dəstək yoxlaması: PID 34 (genişzolaqlı) O2 kimi tanınır', cl && cl.st === 'ok', JSON.stringify(cl));
  check('Dəstək yoxlaması: katalizator modulu real avtomobildə təsdiqlənməmiş kimi göstərilir', c.Compat.list().some(x => /katalizator differensial/.test(x.name) && x.st === 'part'), '');

  console.log('\nNƏTİCƏ: ' + pass + ' keçdi, ' + fail + ' uğursuz');
  process.exit(fail ? 1 : 0);
})();
