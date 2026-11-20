// Düzəliş testləri. Şəbəkə/adapter tələb etmir: node tests/fix-tests.js
// Etiketlər:  [REAL-FRAME] = real ECU-dan jurnalda (Avto.txt, KONNWEI/ELM327 v1.5 klonu, açar ON, mühərrik söndürülü) yazılmış
//                            DƏYİŞMƏMİŞ çərçivələr. Test onları adapterdən gəlmiş kimi emal edir; bu real avtomobil testi DEYİL.
//             [SIM]        = süni/simulyasiya ssenari. Heç vaxt real məlumat kimi təqdim edilmir və real göstəricilərə yazılmır.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'www', 'js');
let pass = 0, fail = 0, real = 0, sim = 0;
function check(name, cond, extra) { if (cond) pass++; else fail++; console.log((cond ? 'OK    ' : 'XƏTA  ') + name + (cond ? '' : '   -> ' + extra)); }
const eq = (n, a, b, tol) => check(n, tol !== undefined ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b), 'alındı ' + JSON.stringify(a) + ', gözlənilən ' + JSON.stringify(b));
const R = n => '[REAL-FRAME] ' + n, S = n => '[SIM] ' + n;

// Yükləmə sırası index.html-dən götürülür (testlər real tətbiqdəki sıra ilə işləsin; köhnə testlər bunu etmirdi).
const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
const ORDER = [...html.matchAll(/<script src="js\/([a-z0-9\-]+)\.js"><\/script>/g)].map(m => m[1]);
const NEED = ['log', 'store', 'pids', 'engine-state', 'elm', 'obd', 'obd-extra', 'adapter', 'formula', 'ai-rules', 'session', 'o2diag'];
function mk() {
  const ls = { s: {}, getItem(k) { return k in this.s ? this.s[k] : null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; }, key(i) { return Object.keys(this.s)[i] || null; }, get length() { return Object.keys(this.s).length; } };
  const ctx = { console, Date, Math, Object, JSON, Promise, isFinite, isNaN, parseInt, parseFloat, String, Array, Number, Error, RegExp, setTimeout, clearTimeout, setInterval, clearInterval, Reflect, Proxy, localStorage: ls, navigator: {}, document: { getElementById() { return null; }, addEventListener() {} } };
  ctx.window = ctx; ctx.Transport = { scan() {}, write: async () => {} }; vm.createContext(ctx);
  ORDER.filter(f => NEED.indexOf(f) >= 0).forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f + '.js'), 'utf8'), ctx, { filename: f }));
  return ctx;
}
// sahte adapter: script(cmd) -> sətir və ya sətirlər massivi (hər biri ayrı BLE parçası)
function wire(ctx, script) {
  ctx.sent = [];
  ctx.Transport = { write: async s => { const c = s.replace('\r', ''); ctx.sent.push(c); const r = script(c); if (r) (Array.isArray(r) ? r : [r]).forEach(p => setTimeout(() => ctx.ELM.onData(typeof p === 'string' ? p : p.d), p.delay || 2)); } };
}
const ISO = ' 15765-4';
const nl = a => a.join('\r') + '\r\r>';

(async () => {
  const c = mk();
  check('Yükləmə sırası index.html-dən alındı (obd < obd-extra < session)', ORDER.indexOf('obd') < ORDER.indexOf('obd-extra') && ORDER.indexOf('obd-extra') < ORDER.indexOf('session'), ORDER.join(','));

  // ================= 1. MODE 06 =================
  console.log('\n[1] Mode 06 parser');
  const M01 = ['01C', '0:460184040000', '1:000003E8018B84', '2:00000000038401', '3:8C847FFF04197F', '4:FFAAAAAAAAAAAA'];
  const M21 = ['00A', '0:4621B40300A7', '1:00000063AAAAAA'];
  const M35 = ['037', '0:4635C3030000', '1:0000119335E11C', '2:07E90151FFFF35', '3:F003000000000B', '4:B835C403000000', '5:00119335E21C06', '6:E20151FFFF35F1', '7:03000000000BB8'];
  wire(c, cmd => cmd === '0601' ? nl(M01) : cmd === '0621' ? nl(M21) : cmd === '0635' ? nl(M35) : null);
  check(R('OBD.mode06Read yeni (9 baytlıq) parserdir, köhnə 8 baytlıq onu əvəz etməyib'), c.OBD.mode06Read !== c.OBD.mode06Legacy && typeof c.OBD.parse06 === 'function', 'köhnə parser aktivdir');
  let m = await c.OBD.mode06Read(1);
  eq(R('MID 01: 3 qeyd (4-cü saxta qeyd yoxdur)'), m.tests.length, 3);
  eq(R('MID 01 qeyd 1: TID 84, UASID 04, dəyər 0, min 0, maks 1000'), [m.tests[0].tid, m.tests[0].uasid, m.tests[0].v, m.tests[0].mn, m.tests[0].mx], [0x84, 4, 0, 0, 1000]);
  eq(R('MID 01 qeyd 2: TID 8B, UASID 84, maks 900 (bayt sırası big-endian)'), [m.tests[1].tid, m.tests[1].uasid, m.tests[1].mx], [0x8B, 0x84, 900]);
  eq(R('MID 01 qeyd 3: TID 8C, UASID 84, min 1049, maks 32767'), [m.tests[2].tid, m.tests[2].mn, m.tests[2].mx], [0x8C, 1049, 32767]);
  check(R('MID 01: TID 7F/UASID FF və -21846 (0xAAAA) nəticə kimi çıxmır'), !m.tests.some(t => t.tid === 0x7F || t.v === -21846 || t.mn === -21846 || t.mx === -21846), JSON.stringify(m.tests.map(t => t.tid)));
  check(R('MID 01: xam HEX saxlanır (mesaj + hər test)'), m.raw.length === 1 && m.raw[0].length === 56 && m.tests.every(t => /^[0-9A-F ]+$/.test(t.rawHex)), JSON.stringify(m.raw));
  check(R('MID 01: xəritəsiz TID-lər UNKNOWN, PASS/FAIL yoxdur'), m.tests.every(t => t.status === 'UNKNOWN'), JSON.stringify(m.tests.map(t => t.status)));
  m = await c.OBD.mode06Read(0x21);
  eq(R('MID 21 (tək qeyd): dəyər 167, hədd 0…99, hədd XARİCİNDƏ, status UNKNOWN'), [m.tests.length, m.tests[0].v, m.tests[0].mn, m.tests[0].mx, m.tests[0].limit, m.tests[0].status], [1, 167, 0, 99, 'OUT', 'UNKNOWN']);
  m = await c.OBD.mode06Read(0x35);
  eq(R('MID 35: 6 qeyd, TID ardıcıllığı C3 E1 F0 C4 E2 F1'), m.tests.map(t => t.tid.toString(16).toUpperCase()), ['C3', 'E1', 'F0', 'C4', 'E2', 'F1']);
  eq(R('MID 35 qeyd 2: dəyər 2025, min 337, maks 65535'), [m.tests[1].v, m.tests[1].mn, m.tests[1].mx], [2025, 337, 65535]);
  check(R('MID 35: ISO-TP uzunluğu (0x37) ilə tam uyğun, natamam qeyd yoxdur'), m.notes.length === 0, JSON.stringify(m.notes));
  check(R('MID 35: xəritəsiz test üçün FAIL/PASS çıxarılmır (limit OUT olsa belə)'), m.tests.every(t => t.status === 'UNKNOWN'), '');
  // işarəli/işarəsiz
  wire(c, cmd => cmd === '06A1' ? '46 A1 01 81 FF F6 FF EC 00 14\r\r>' : cmd === '0602' ? '46 02 05 80 00 64 00 00 00 C8\r\r>' : cmd === '0603' ? '46 03 05 FF 80 00 00 00 FF FF\r\r>' : cmd === '0604' ? '46 04 05 01 80 00 00 00 FF FF\r\r>' : cmd === '0605' ? '46 05 05 83 80 00 80 00 7F FF\r\r>' : null);
  m = await c.OBD.mode06Read(0xA1);
  eq(S('UASID 81 işarəli: -10 [-20…20]'), [m.tests[0].v, m.tests[0].mn, m.tests[0].mx, m.tests[0].limit], [-10, -20, 20, 'IN']);
  m = await c.OBD.mode06Read(2);
  check(S('UASID 80 rezerv: işarəsiz oxunur (100), hədd müqayisə edilmir, bayraq var'), m.tests[0].v === 100 && m.tests[0].limit === 'NA' && m.tests[0].flags.some(f => /rezerv/.test(f)), JSON.stringify(m.tests[0]));
  m = await c.OBD.mode06Read(3);
  check(S('UASID FF rezerv: 0x8000 işarəsiz = 32768 (işarəli -32768 DEYİL), hədd müqayisə edilmir'), m.tests[0].v === 32768 && m.tests[0].limit === 'NA', JSON.stringify(m.tests[0]));
  m = await c.OBD.mode06Read(4);
  eq(S('UASID 01 işarəsiz: 0x8000 = 32768'), m.tests[0].v, 32768);
  m = await c.OBD.mode06Read(5);
  eq(S('UASID 83 işarəli: 0x8000 = -32768, min -32768, maks 32767'), [m.tests[0].v, m.tests[0].mn, m.tests[0].mx], [-32768, -32768, 32767]);
  wire(c, cmd => cmd === '0601' ? '46 01 84 04 00 00 00 00 03 E8 AA AA AA AA AA AA AA AA AA\r\r>' : null);
  m = await c.OBD.mode06Read(1);
  check(S('Uzunluq sətri olmayan cavabda sonluq 0xAA doldurucusu kəsilir, ondan test çıxmır'), m.tests.length === 1 && m.tests[0].tid === 0x84 && m.tests[0].decodeConf === 'orta', JSON.stringify([m.tests.length, m.notes]));
  wire(c, cmd => cmd === '0601' ? '7F 06 12\r\r>' : null);
  m = await c.OBD.mode06Read(1);
  check(S('Mənfi cavab: test yoxdur, xam HEX/qeyd saxlanır, xəta atmır'), m.tests.length === 0, JSON.stringify(m));
  const bad = [c.Mode06.fmt(undefined), c.Mode06.fmt({}), c.Mode06.fmt({ limit: 'XYZ' })].map(x => JSON.stringify(x)).join('');
  check('Mode06.fmt: boş/naməlum nəticədə "undefined" çıxmır, UNKNOWN/RAW göstərilir', !/undefined/.test(bad) && /UNKNOWN/.test(bad), bad);
  const uiTools = fs.readFileSync(path.join(JS, 'ui-tools.js'), 'utf8');
  check('ui-tools Mode 06 ekranı Mode06.fmt istifadə edir və xam HEX göstərir', /Mode06\.fmt/.test(uiTools) && /RAW: /.test(uiTools), '');

  // ================= 2. DTC və MIL =================
  console.log('\n[2] DTC, MIL, çoxlu ECU');
  const ECU_A = '410100040000', ECU_B = '41018107E500';
  for (const order of [[ECU_A, ECU_B], [ECU_B, ECU_A]]) {
    wire(c, cmd => cmd === '0101' ? nl(order) : null);
    const rd = await c.OBD.readReadiness();
    eq(R('PID 01 (' + (order[0] === ECU_A ? 'A,B' : 'B,A') + ' sırası): mühərrik ECU-su seçilir, MIL YANIR, say 1'), [rd.mil, rd.count, rd.ecus, rd.ambiguous, rd.raw], [true, 1, 2, false, ECU_B]);
  }
  wire(c, cmd => cmd === '0101' ? nl([ECU_A, ECU_B]) : null);
  let rd = await c.OBD.readReadiness();
  const cat = rd.items.find(x => /Catalyst/.test(x.name)), evap = rd.items.find(x => /EVAP/.test(x.name)), hc = rd.items.find(x => /Heated/.test(x.name));
  eq(R('PID 01: katalizator dəstəklənir+tamamlanıb, EVAP dəstəklənir+tamamlanıb, isidilən katalizator dəstəklənmir'), [cat.sup, cat.done, evap.sup, evap.done, hc.sup], [true, true, true, true, false]);
  check(R('PID 01: oxunma vaxtı (ISO) və namizədlər saxlanır'), /^\d{4}-\d\d-\d\dT/.test(rd.t) && rd.candidates.length === 2 && rd.candidates.some(x => !x.mil), JSON.stringify(rd.candidates));
  wire(c, cmd => cmd === '0101' ? nl(['41 01 80 07 E5 00']) : null);
  rd = await c.OBD.readReadiness();
  eq(S('MIL biti = A bit 7 (A=0x80): MIL ON, say 0 (bit 0–6)'), [rd.mil, rd.count], [true, 0]);
  wire(c, cmd => cmd === '0101' ? nl(['41 01 7F 07 E5 00']) : null);
  rd = await c.OBD.readReadiness();
  eq(S('A=0x7F: MIL söndürülü, say 127 (MIL biti ilə sayğac qarışmır)'), [rd.mil, rd.count], [false, 127]);
  wire(c, cmd => cmd === '0101' ? nl(['41 01 81 07 65 00', '41 01 00 07 65 00']) : null);
  rd = await c.OBD.readReadiness();
  eq(S('Bərabər monitor sayı olan iki ECU: ambiguous=true, namizədlər saxlanır'), [rd.ambiguous, rd.candidates.length], [true, 2]);

  c.OBD.S.protocol = 'ISO 15765-4 (CAN 11/500)';
  const DT = { '03': ['43010420', '4300'], '07': ['47010420', '4700'], '0A': ['4A010420', '4A00'] };
  for (const swap of [false, true]) {
    wire(c, cmd => DT[cmd] ? nl(swap ? DT[cmd].slice().reverse() : DT[cmd]) : null);
    const st = await c.OBD.readDtcs('03'), pe = await c.OBD.readDtcs('07'), pm = await c.OBD.readDtcs('0A');
    eq(R('Mode 03/07/0A (' + (swap ? 'tərs' : 'düz') + ' sıra): hər status ayrıca P0420'), [st.codes, pe.codes, pm.codes], [['P0420'], ['P0420'], ['P0420']]);
    eq(R('Mode 03: ECU-ların bildirdiyi say ayrıca (1 və 0), uyğun'), [st.count, st.consistent, (st.reported || []).slice().sort()], [1, true, [0, 1]]);
    check(R('Hər status oxunma vaxtı və xam cavabı saxlayır'), [st, pe, pm].every(x => /^\d{4}-/.test(x.t) && x.raw.length === 2), JSON.stringify(st));
  }
  const dd = { stored: await c.OBD.readDtcs('03'), pending: await c.OBD.readDtcs('07'), permanent: await c.OBD.readDtcs('0A') };
  eq(R('DtcStatus.counts: hər status ayrıca 1/1/1 (cəm 3 deyil)'), c.DtcStatus.counts(dd), { stored: 1, pending: 1, permanent: 1 });
  check('DtcStatus.countLine: üç statusun sayı ayrı yazılır', /Saxlanmış \(03\): 1 kod \| Gözləyən \(07\): 1 kod \| Daimi \(0A\): 1 kod/.test(c.DtcStatus.countLine(dd)), c.DtcStatus.countLine(dd));
  eq(S('Oxunmayan status "oxunmayıb" sayılır (0 deyil)'), c.DtcStatus.counts({ stored: dd.stored }), { stored: 1, pending: null, permanent: null });
  wire(c, cmd => cmd === '03' ? nl(['43020420']) : null);
  let x3 = await c.OBD.readDtcs('03');
  eq(S('ECU 2 kod bildirir, 1 kod oxunub: consistent=false'), [x3.count, x3.consistent], [1, false]);
  wire(c, cmd => cmd === '03' ? 'NO DATA\r\r>' : null);
  x3 = await c.OBD.readDtcs('03');
  check(S('NO DATA: ok=false (kod yoxdur kimi YOX), status mətni var'), x3.ok === false && /NO ?DATA/.test(x3.status), JSON.stringify(x3));

  // freeze frame: DTC-si olan ECU cavabı seçilir
  const FZ = { '020000': ['4200007E3A8001', '4200007E3E8003'], '020200': ['4202000420', '4202000000'], '020400': ['420400CC'], '020500': ['42050081'], '020C00': ['420C001684'], '020D00': ['420D0048'], '020B00': ['420B004F'], '020F00': ['420F0047'], '020600': ['42060080'], '020700': ['42070080'], '020E00': ['420E009E'], '021100': ['42110033'], '021000': null };
  for (const swap of [false, true]) {
    wire(c, cmd => FZ[cmd] ? nl(swap ? FZ[cmd].slice().reverse() : FZ[cmd]) : null);
    c.OBD.S.supported = [];
    const fz = await c.OBD.readFreeze();
    eq(R('Freeze frame (' + (swap ? 'tərs' : 'düz') + ' sıra): kod P0420 (DTC-si olan ECU seçilir)'), fz.dtc, 'P0420');
    eq(R('Freeze frame: RPM 1441, sürət 72, soyuducu 89'), [fz.pids['0C'] && fz.pids['0C'].v, fz.pids['0D'] && fz.pids['0D'].v, fz.pids['05'] && fz.pids['05'].v], [1441, 72, 89]);
    check(R('Freeze frame oxunma vaxtı saxlanır'), /^\d{4}-/.test(fz.t), fz.t);
  }

  // hesabat: müxtəlif vaxtlı snapshot-lar qarışmır, köhnə məlumat işarələnir
  const t0 = Date.now() - 3600 * 1000, s = c.AutoLog.create(t0);
  s.t1 = t0 + 60000; s.on = false; s.supported = ['0C', '0D', '05']; s.snap.dtc = { t: new Date(t0 + 1000).toISOString(), stored: dd.stored, pending: dd.pending, permanent: dd.permanent };
  s.snap.readiness = Object.assign({}, rd, { t: new Date(t0 + 2000).toISOString() });
  s.snap.freeze = { dtc: 'P0420', pids: { '0C': { v: 1441 } }, t: new Date(t0 + 3000).toISOString() };
  c.AutoLog.feed(s, '0C', 0, t0 + 1000);
  const txt = c.AutoLog.build(s, 'full', {});
  check(S('Hesabat: DTC sayı hər status üçün ayrıca yazılır'), /Say \(statuslar ayrıca\): Saxlanmış \(03\): 1 kod \| Gözləyən \(07\): 1 kod \| Daimi \(0A\): 1 kod/.test(txt), '');
  check(S('Hesabat: 1 saat əvvəlki snapshot "KÖHNƏ" işarələnir (cari vəziyyət kimi təqdim edilmir)'), (txt.match(/KÖHNƏ: cari vəziyyət deyil/g) || []).length >= 3, (txt.match(/KÖHNƏ/g) || []).length + '');
  check(S('Hesabat: MIL mənbəyi PID 01 bit 7 kimi göstərilir, namizəd ECU-lar siyahıdadır'), /MIL \(PID 01, A baytı bit 7\)/.test(txt) && /ECU namizədi 1/.test(txt) && /ECU namizədi 2/.test(txt), '');
  check(S('Hesabat: freeze frame "cari vəziyyət deyil" qeydi ilə'), /ANIN saxlanmış göstəricisidir, cari vəziyyət deyil/.test(txt), '');
  check(S('Hesabat: "undefined" sözü yoxdur'), !/undefined/.test(txt), (txt.match(/.{20}undefined.{20}/) || [''])[0]);

  // ================= 3. Mühərrik vəziyyəti =================
  console.log('\n[3] Engine state');
  const E = c.EngineState, cl = (rpm, spd, clt, had) => E.classify({ rpm: rpm, spd: spd, clt: clt }, had);
  eq(R('RPM=0, mühərrik işləməyib -> KEY_ON, işləyir DEYİL'), [cl(0, 0, 22, false), E.isRunning(cl(0, 0, 22, false))], ['KEY_ON', false]);
  eq(S('RPM=0, əvvəl işləyib -> ENGINE_OFF'), cl(0, 0, 80, true), 'ENGINE_OFF');
  eq(S('RPM yoxdur/köhnə (null) -> UNKNOWN'), [cl(null, 0, 90, true), cl(undefined, 0, 90, true), cl(NaN, null, null, false)], ['UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  eq(S('RPM 99 -> söndürülü; 100 -> CRANKING; 400 -> CRANKING; 401 -> işləyir'), [cl(99, 0, 20, false), cl(100, 0, 20, false), cl(400, 0, 20, false), cl(401, 0, 20, false)], ['KEY_ON', 'CRANKING', 'CRANKING', 'WARMUP']);
  eq(S('RPM 800, sürət 0, ECT 40 -> WARMUP; ECT 90 -> IDLE; ECT bilinmir -> IDLE'), [cl(800, 0, 40, true), cl(800, 0, 90, true), cl(800, 0, null, true)], ['WARMUP', 'IDLE', 'IDLE']);
  eq(S('RPM 2000, sürət 60 -> DRIVING; sürət yoxdur -> RUNNING'), [cl(2000, 60, 90, true), cl(2000, null, 90, true)], ['DRIVING', 'RUNNING']);
  eq(S('Dayanmış avtomobildə 2500–3000 rpm -> STATIONARY_REV'), [cl(2500, 0, 90, true), cl(3000, 0, 90, true), E.isRunning(cl(2800, 0, 90, true))], ['STATIONARY_REV', 'STATIONARY_REV', true]);
  const now = 1000000, V0 = { '0C': { v: 0, t: now - 500 }, '0D': { v: 0, t: now - 500 }, '05': { v: 22, t: now - 500 } };
  eq(R('OBD.values (RPM=0, təzə): mühərrik işləmir'), [E.fromValues(V0, now).state, E.fromValues(V0, now).running], ['KEY_ON', false]);
  eq(S('RPM dəyəri 20 s köhnədir -> UNKNOWN (işləyir DEYİL)'), [E.fromValues({ '0C': { v: 2500, t: now - 20000 } }, now).state, E.fromValues({ '0C': { v: 2500, t: now - 20000 } }, now).running], ['UNKNOWN', false]);
  eq(S('nodata=true -> UNKNOWN'), E.fromValues({ '0C': { v: 2500, t: now, nodata: true } }, now).state, 'UNKNOWN');
  eq(S('Simulyasiya (S.sim) real vəziyyət kimi qəbul edilmir'), E.fromValues({ '0C': { v: 2500, t: now } }, now, true).state, 'UNKNOWN');
  const tr = new E.Tracker();
  [[0, 0], [1, 0], [2, 250], [3, 260], [4, 800], [5, 820], [6, 810], [7, 3000], [8, 3000], [9, 0], [10, 0], [11, 0], [12, 0], [13, 700], [14, 700], [15, 700]].forEach(p => tr.update(p[0], { rpm: p[1], spd: p[1] > 2000 ? 50 : 0, clt: 85 }));
  eq(S('Tracker: çevirmə, start, hərəkət, stop, təkrar start ayrı hadisələr'), tr.events.map(e => e.kind + ':' + e.to), ['CRANK:CRANKING', 'START:IDLE', 'STATE:DRIVING', 'STOP:ENGINE_OFF', 'START:IDLE']);
  const tr2 = new E.Tracker(); tr2.update(0, { rpm: 800, spd: 0, clt: 90 }); tr2.update(1, { rpm: 800, spd: 0, clt: 90 }); tr2.update(2, { rpm: 0, spd: 0, clt: 90 }); tr2.update(3, { rpm: 800, spd: 0, clt: 90 });
  eq(S('Tracker: tək nümunəlik RPM=0 sıçrayışı stop sayılmır'), tr2.events.length, 0);
  tr2.update(4, { rpm: null }); eq(S('Tracker: RPM köhnəlibsə UNKNOWN, keçid yazılmır'), [tr2.state, tr2.events.length], ['UNKNOWN', 0]);
  // session fazaları (real tətbiqdəki analyze/keyEvents)
  const sess = c.AutoLog.create(0); sess.t1 = 61000; sess.on = false;
  for (let sec = 0; sec <= 60; sec++) {
    const t = sec * 1000; let rpm = sec < 10 ? 0 : sec < 14 ? 250 : sec < 30 ? 800 : sec < 40 ? 0 : sec < 50 ? 700 : 0;
    if (sec >= 55 && sec <= 56) continue;                      // 2 saniyə məlumat yoxdur
    c.AutoLog.feed(sess, '0C', rpm, t); c.AutoLog.feed(sess, '0D', 0, t); c.AutoLog.feed(sess, '05', 85, t);
  }
  const an = c.AutoLog.analyze(sess), evs = c.AutoLog.events(sess, an).map(e => e.s);
  const names = an.phases.map(p => p.key.split('/')[0]);
  check(S('Session fazaları: KEYON → CRANK → IDLE → OFF → IDLE → OFF ardıcıllığı'), JSON.stringify(names.filter((v, i, a) => a[i - 1] !== v)) === JSON.stringify(['KEYON', 'CRANK', 'IDLE', 'OFF', 'IDLE', 'OFF']), JSON.stringify(names));
  check(S('Session hadisələri: iki START və iki STOP ayrıca yazılır'), evs.filter(x => /^START: mühərrik işə düşdü/.test(x)).length === 2 && evs.filter(x => /^STOP:/.test(x)).length === 2 && evs.some(x => /^START: çevirmə/.test(x)), JSON.stringify(evs));
  check(S('Session: RPM=0 fazası "işləyir" adı daşımır'), an.phases.filter(p => /^(KEYON|OFF)/.test(p.key)).every(p => !/işləyir/.test(p.name) || /söndürülü|dayandırılıb/.test(p.name)), JSON.stringify(an.phases.map(p => p.name)));

  // ================= 4. PID 15 / 34 / mühərrik söndürülü =================
  console.log('\n[4] PID 15 / PID 34 və mühərrik söndürülü sensorlar');
  const P = c.PIDS;
  eq(R('PID 15: 55 FF -> 0.425 V (A/200), B=FF trim istifadə olunmur'), [P['15'].dec([0x55, 0xFF]).v, P['15'].dec([0x55, 0xFF]).aux], [0.425, undefined]);
  eq(R('PID 15: 54 FF -> 0.420 V'), P['15'].dec([0x54, 0xFF]).v, 0.42, 1e-9);
  eq(S('PID 15: B != FF -> qısamüddətli trim = B*100/128 - 100'), P['15'].dec([0x80, 0x90]).aux.trim, 12.5, 1e-9);
  eq(S('PID 15: sərhədlər 00 -> 0 V, FF -> 1.275 V'), [P['15'].dec([0, 0xFF]).v, P['15'].dec([0xFF, 0xFF]).v], [0, 1.275]);
  c.OBD.S.supported = ['34']; c.OBD.S.sim = false;
  const o2 = c.PIDS['34'] || (vm.runInContext("window.Adapter && 1", c), null);
  const p34 = c.PIDS['34']; check('PID 34 dekoderi mövcuddur (o2diag/adapter ilə)', !!p34, 'yoxdur');
  if (p34) {
    const d = p34.dec([0x80, 0x10, 0x80, 0x00]);
    eq(R('PID 34: 80 10 80 00 -> λ = (256A+B)/32768 = 1.0005'), d.v, 1.00048828125, 1e-9);
    eq(R('PID 34: cərəyan = (256C+D)/256 − 128 = 0 mA'), [d.aux.cur, d.aux.curUnit], [0, 'mA']);
    eq(S('PID 34: C,D = 00 00 -> −128 mA; FF FF -> +127.996 mA'), [p34.dec([0x80, 0, 0, 0]).aux.cur, p34.dec([0x80, 0, 0xFF, 0xFF]).aux.cur], [-128, 127.99609375]);
    eq(S('PID 34: λ=2.0 üçün FF FF'), p34.dec([0xFF, 0xFF, 0x80, 0]).v, 65535 / 32768, 1e-12);
    check(S('PID 34: natamam (2 bayt) cavabdan nəticə çıxarılmır (invalid)'), p34.dec([0x80, 0x10]).invalid && p34.dec([0x80, 0x10]).v === null, JSON.stringify(p34.dec([0x80, 0x10])));
  }
  // AIRules: mühərrik söndürülü ikən real O2/trim göstəriciləri nəticə üçün istifadə edilmir
  const nowT = Date.now(), flat = n => Array.from({ length: n }, () => 0.42);
  const mkRec = (v, hist) => ({ v: v, t: nowT, hist: hist, nodata: false });
  const Voff = { '0C': mkRec(0, Array(30).fill(0)), '0D': mkRec(0, Array(30).fill(0)), '05': mkRec(22, Array(30).fill(22)), '14': mkRec(0.42, flat(30)), '15': mkRec(0.42, flat(30)), '06': mkRec(0, Array(30).fill(0)), '07': mkRec(12, Array(30).fill(12)) };
  let ai = c.AIRules.analyze(Voff, null);
  check(R('AIRules, mühərrik söndürülü (RPM=0, təzə): "Ön O2 az dəyişir" və trim qaydaları işləmir'), !ai.anomalies.some(a => a.k === 'o2f' || a.k === 'lean') && ai.hyps.length === 0, JSON.stringify(ai.anomalies));
  check(R('AIRules, mühərrik söndürülü: səbəb "missing" siyahısında göstərilir'), ai.missing.some(m => /Mühərrik işləmir/.test(m)), JSON.stringify(ai.missing));
  const Vstale = JSON.parse(JSON.stringify(Voff)); Vstale['0C'] = { v: 2500, t: nowT - 60000, hist: Array(30).fill(2500), nodata: false };
  ai = c.AIRules.analyze(Vstale, null);
  check(S('AIRules, RPM 60 s köhnədir (UNKNOWN): sensor qaydaları işləmir'), !ai.anomalies.some(a => a.k === 'lean' || a.k === 'o2f'), JSON.stringify(ai.anomalies));
  const Vrun = JSON.parse(JSON.stringify(Voff)); Vrun['0C'] = mkRec(2500, Array(30).fill(2500)); Vrun['0D'] = mkRec(0, Array(30).fill(0)); Vrun['05'] = mkRec(90, Array(30).fill(90));
  ai = c.AIRules.analyze(Vrun, null);
  check(S('AIRules, mühərrik işləyir (təzə RPM 2500): qaydalar işləyir (lean və o2f aşkarlanır)'), ai.anomalies.some(a => a.k === 'lean') && ai.anomalies.some(a => a.k === 'o2f'), JSON.stringify(ai.anomalies));

  // ================= 5. Adapter növbəsi =================
  console.log('\n[5] Adapter idarəçiliyi (vahid növbə)');
  const q = mk(); const log = [];
  q.Transport = { write: async s => { const cmd = s.replace('\r', ''); log.push('TX ' + cmd); setTimeout(() => { log.push('RX ' + cmd); q.ELM.onData('OK ' + cmd + '\r\r>'); }, 5); } };
  const a1 = q.ELM.send('0101', 500), a2 = q.ELM.send('0105', 500), a3 = q.ELM.send('010C', 500);
  const exc = q.ELM.exclusive(async tx => { const r = []; r.push((await tx.send('ATSH7E0', 500)).join()); r.push((await tx.send('0100', 500)).join()); r.push((await tx.send('ATSH7DF', 500)).join()); return r; });
  const a4 = q.ELM.send('010D', 500);
  await Promise.all([a1, a2, a3, exc, a4]);
  check(S('Sorğular paralel çağırılsa da adapterə ardıcıl gedir (TX/RX növbələşir)'), log.every((l, i) => (i % 2 === 0) === /^TX/.test(l)), log.join(' | '));
  const iEx = log.indexOf('TX ATSH7E0'), jEx = log.indexOf('RX ATSH7DF');
  check(S('exclusive: ATSH7E0 … ATSH7DF ardıcıllığı arasına başqa bölmənin sorğusu girmir'), iEx > 0 && jEx > iEx && log.slice(iEx, jEx + 1).filter(l => /^TX/.test(l)).length === 3, log.slice(iEx, jEx + 1).join(' | '));
  eq(S('exclusive nəticəni qaytarır'), (await exc), ['OK ATSH7E0', 'OK 0100', 'OK ATSH7DF']);
  // abort: gözləyən və növbədəki sorğular ləğv edilir
  const ab = mk(); const sent = [];
  ab.Transport = { write: async s => { sent.push(s.replace('\r', '')); } };
  const b1 = ab.ELM.send('0101', 2000).catch(e => 'ERR:' + e.message), b2 = ab.ELM.send('0105', 2000).catch(e => 'ERR:' + e.message), b3 = ab.ELM.send('010C', 2000).catch(e => 'ERR:' + e.message);
  await new Promise(r => setTimeout(r, 20)); ab.ELM.abort('disconnected');
  eq(S('Disconnect/abort: gözləyən və növbədəki sorğular ləğv olunur'), await Promise.all([b1, b2, b3]), ['ERR:disconnected', 'ERR:abort', 'ERR:abort']);
  eq(S('Abort-dan sonra növbədəki sorğular adapterə GÖNDƏRİLMİR'), sent, ['0101']);
  const after = ab.ELM.send('0100', 100).catch(e => 'ERR:' + e.message); await new Promise(r => setTimeout(r, 10));
  check(S('Abort-dan sonrakı YENİ sorğu işləyir (növbə bloklanmır)'), sent.indexOf('0100') >= 0, JSON.stringify(sent)); ab.ELM.onData('41 00 80 00 00 01\r\r>'); eq(S('Yeni sorğu cavab alır'), await after, ['41 00 80 00 00 01']);
  // timeout + gecikmiş cavab növbəti sorğunu pozmur
  const to = mk(); let n = 0;
  to.Transport = { write: async s => { const cmd = s.replace('\r', ''); n++; if (cmd === '0101' && n === 1) setTimeout(() => to.ELM.onData('41 01 AA\r\r>'), 120); else setTimeout(() => to.ELM.onData('41 05 3E\r\r>'), 5); } };
  const t1 = await to.ELM.send('0101', 40).catch(e => 'ERR:' + e.message);
  const t2 = await to.ELM.send('0105', 500).catch(e => 'ERR:' + e.message);
  eq(S('Timeout sonrası gecikmiş cavab növbəti sorğuya verilmir'), [t1, t2], ['ERR:timeout', ['41 05 3E']]);
  // retry: yalnız şin/adapter xətasında; NO DATA təkrar edilmir
  const rt = mk(); const seq = ['BUFFER FULL', 'BUFFER FULL', '41 01 81 07 E5 00']; let k = 0;
  rt.Transport = { write: async () => { const r = seq[Math.min(k++, seq.length - 1)]; setTimeout(() => rt.ELM.onData(r + '\r\r>'), 3); } };
  eq(S('sendRetry: BUFFER FULL -> təkrar -> nəticə (tries=2)'), [await rt.ELM.sendRetry('0101', 300, 2), k], [['41 01 81 07 E5 00'], 3]);
  const nd = mk(); let k2 = 0; nd.Transport = { write: async () => { k2++; setTimeout(() => nd.ELM.onData('NO DATA\r\r>'), 3); } };
  eq(S('sendRetry: NO DATA təkrar edilmir (real cavabdır)'), [await nd.ELM.sendRetry('0148', 300, 3), k2], [['NO DATA'], 1]);
  const tt = mk(); let k3 = 0; tt.Transport = { write: async () => { k3++; if (k3 === 2) setTimeout(() => tt.ELM.onData('41 05 3E\r\r>'), 3); } };
  eq(S('sendRetry: timeout -> 1 təkrar -> nəticə'), [await tt.ELM.sendRetry('0105', 60, 1), k3], [['41 05 3E'], 2]);
  const dead = mk(); dead.Transport = { write: async () => {} };
  eq(S('sendRetry: hər cəhd timeout olarsa xəta atılır (məhdud sayda)'), await dead.ELM.sendRetry('0105', 30, 1).catch(e => 'ERR:' + e.message), 'ERR:timeout');
  // simulyasiya real göstəricilərə düşmür
  const sm = mk(); sm.OBD.S.sim = true;
  sm.OBD.S.state = 'ecu'; sm.OBD.S.supported = ['0C']; sm.OBD.S.selected = ['0C'];
  sm.Transport = { write: async () => { setTimeout(() => sm.ELM.onData('41 0C 1A F8\r\r>'), 3); } };
  sm.OBD.startPoll(['0C']); await new Promise(r => setTimeout(r, 60)); sm.OBD.stopPoll();
  check(S('Simulyasiya rejimi: dəyər OBD.values-a (real göstəricilərə) yazılmır'), !sm.OBD.values['0C'] || sm.OBD.values['0C'].v === null, JSON.stringify(sm.OBD.values['0C']));
  eq(S('Simulyasiya rejimi: PID statusu INVALID (real ECU göstəricisi deyil)'), sm.OBD.statusOf('0C').status, 'INVALID');

  console.log('\nDÜZƏLİŞ TESTLƏRİ: ' + pass + ' keçdi, ' + fail + ' uğursuz');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST XƏTASI', e); process.exit(2); });
