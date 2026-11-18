// OBDex inteqrasiyası testləri (şəbəkə tələb etmir): node tests/obdex-tests.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), JS = path.join(ROOT, 'www', 'js');
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'OK    ' : 'XƏTA  ') + name + (cond ? '' : '   -> ' + extra));
}
const eq = (n, a, b, tol) => check(n, tol !== undefined ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b), 'alındı ' + JSON.stringify(a) + ', gözlənilən ' + JSON.stringify(b));
const J = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
function ctxWith(files, pre) {
  const ctx = { console, Math, Object, JSON, isFinite, isNaN, parseInt, parseFloat, String, Array, Number, Error, RegExp, Reflect, Proxy };
  ctx.window = ctx; vm.createContext(ctx);
  if (pre) pre(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

// ---- 1. Mənbə məlumatı və validator ----
const V = require('../tools/validate-data.js');
const codeSchema = J('schema/code.schema.json');
const fams = ['B0xxx', 'C0xxx', 'P0xxx', 'P2xxx', 'P3xxx', 'U0xxx', 'U3xxx'];
let src = []; fams.forEach(f => { src = src.concat(J('data/obdex/generic/' + f + '.json')); });
eq('Mənbədə 9533 DTC var', src.length, 9533);
check('Təkrarlanan kod yoxdur', new Set(src.map(c => c.code)).size === src.length, 'təkrar var');
const orig = console.log; let captured = '';
console.log = function (s) { captured += s + '\n'; };
const vr = V.run();
console.log = orig;
eq('validate-data.js uğurla keçir (çıxış kodu 0)', vr, 0);
// validator real xətanı tutmalıdır
function errsOf(c) { const e = []; V.validate(c, codeSchema, 'x', e); return e; }
const good = JSON.parse(JSON.stringify(src.find(c => c.code === 'P0420')));
eq('Düzgün kod: xəta yoxdur', errsOf(good).length, 0);
let bad = JSON.parse(JSON.stringify(good)); bad.code = 'X0420';
check('Yanlış kod formatı tutulur', errsOf(bad).length > 0, 'tutulmadı');
bad = JSON.parse(JSON.stringify(good)); delete bad.title.en;
check('İngilis başlığı olmayan kod tutulur', errsOf(bad).length > 0, 'tutulmadı');
bad = JSON.parse(JSON.stringify(good)); bad.naməlum = 1;
check('Naməlum sahə tutulur', errsOf(bad).length > 0, 'tutulmadı');
bad = JSON.parse(JSON.stringify(good)); bad.flags = { mil: 'bəli' };
check('Yanlış tip (flags.mil) tutulur', errsOf(bad).length > 0, 'tutulmadı');
bad = JSON.parse(JSON.stringify(good)); bad.repair = { difficulty: 'çox çətin' };
check('Yanlış enum (repair.difficulty) tutulur', errsOf(bad).length > 0, 'tutulmadı');

// ---- 2. dtc-data.js (commit edilən fayl məlumatla sinxrondur) ----
const bd = require('../tools/build-dtc.js');
const bigSrc = fs.readFileSync(path.join(JS, 'dtc-data.js'), 'utf8');
const dctx = {}; dctx.window = dctx; vm.createContext(dctx); vm.runInContext(bigSrc, dctx);
const BIG = dctx.DTC_BIG;
const N = dctx.DTC_BIG_N;
eq('DTC_BIG_N = 9533', N, 9533);
eq('DTC_BIG açarları = 9533', Object.keys(BIG).length, 9533);
const fresh = bd.convert(src).out;
check('www/js/dtc-data.js data/obdex ilə eynidir (köhnəlməyib; "npm run build:data")', JSON.stringify(fresh) === JSON.stringify(BIG), 'fərq var: node tools/build-dtc.js işlədin');
const p0420 = BIG.P0420;
check('P0420: başlıq, təsvir, səbəblər, bayraqlar var', p0420 && p0420.t && p0420.d && p0420.c.length && p0420.f && p0420.f.length === 4, JSON.stringify(p0420));
check('P2xxx koduna baxış işləyir (P2002)', !!BIG.P2002 && !!BIG.P2002.t, 'yoxdur');
check('U0xxx koduna baxış işləyir (U0100)', !!BIG.U0100 && /Lost Communication/i.test(BIG.U0100.t), BIG.U0100 && BIG.U0100.t);
check('U3xxx koduna baxış işləyir (U3000)', !!BIG.U3000, 'yoxdur');
check('Bütün əlaqəli kodlar bazada var', Object.keys(BIG).every(k => BIG[k].r.every(r => BIG[r])), 'sınıq əlaqə');
check('Bütün açarlar düzgün DTC formatındadır', Object.keys(BIG).every(k => /^[PBCU][0-3][0-9A-F]{3}$/.test(k)), 'səhv açar');
check('Təsvir 380 simvoldan uzun deyil (kəsmə işləyir)', Object.keys(BIG).every(k => BIG[k].d.length <= 381), 'uzun təsvir');

// dtc-merge ilə birlikdə: 6 əl ilə yazılmış az kod qorunur, yenilər İngilis başlığı alır
const mctx = ctxWith(['i18n.js', 'version.js', 'dtc-db.js', 'dtc-extra.js', 'dtc-data.js', 'dtc-merge.js'], c => {
  c.localStorage = { getItem() { return null; }, setItem() {} };
  c.document = { getElementById() { return null; } };
});
eq('dtc-merge: DTC_COUNT = 9533', mctx.DTC_COUNT, 9533);
check('dtc-merge: P2002 (yeni kod) oxunur', mctx.DTC_DB.P2002 && mctx.DTC_DB.P2002.en === BIG.P2002.t, JSON.stringify(mctx.DTC_DB.P2002 && mctx.DTC_DB.P2002.en));
check('dtc-merge: P0420 əl ilə yazılmış Azərbaycan mətnini saxlayır', /Katalizator/.test(mctx.DTC_DB.P0420.az), mctx.DTC_DB.P0420.az);

// ---- 3. PID-lər ----
const pb = require('../tools/build-pids.js');
const pidSrc = fs.readFileSync(path.join(JS, 'pid-data.js'), 'utf8');
const pctx = {}; pctx.window = pctx; vm.createContext(pctx); vm.runInContext(pidSrc, pctx);
const PD = pctx.PID_DATA;
check('www/js/pid-data.js data/obdex ilə eynidir (köhnəlməyib)', JSON.stringify(pb.build().out) === JSON.stringify(PD), 'node tools/build-pids.js işlədin');
eq('PID_DATA: 132 PID (119 Mode 01 + 13 Mode 09)', PD.length, 132);

const base = ctxWith(['formula.js', 'pids.js']);
const keepDec = {}; Object.keys(base.PIDS).forEach(k => { if (typeof base.PIDS[k].dec === 'function') keepDec[k] = base.PIDS[k].dec; });
// livediag.js (47, 2C, 2D, 52) və fuel.js (51) öz PID-lərini yükləmə anında, pid-extra.js-dən ƏVVƏL qeydə alır
const ctx = ctxWith(['formula.js', 'pids.js']);
['47', '2C', '2D', '52', '51'].forEach(k => { ctx.PIDS[k] = { az: 'daxili', en: 'builtin', unit: '', fix: 0, dec: () => ({ v: 0 }) }; });
['pid-data.js', 'pid-extra.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const P = ctx.PIDS;
check('Mövcud PID dekoderləri toxunulmazdır (' + Object.keys(keepDec).length + ' PID)', Object.keys(keepDec).every(k => P[k].dec.toString() === keepDec[k].toString() && !P[k].obdex), 'dəyişib');
eq('27 yeni PID əlavə olunub', ctx.PID_ADDED, 27);
check('Hər yeni PID-in Azərbaycan adı var', Object.keys(P).filter(k => P[k].obdex).every(k => P[k].az !== P[k].en), 'tərcümə yoxdur');
check('Çox-dəyərli PID-lər (24, 34, 78) qoşulmayıb', !('78' in P) && !P['24'].obdex, '');
check('Bitmap/enum PID-lər (01, 1C, 4F) qoşulmayıb', !('01' in P) && !('1C' in P) && !('4F' in P), '');
const D = (id, b) => P[id].dec(b).v;
eq('21: 01 02 -> 258 km', D('21', [1, 2]), 258);
eq('22: 00 64 -> 7.9 kPa', D('22', [0, 100]), 7.9, 1e-9);
eq('23: 01 00 -> 2560 kPa', D('23', [1, 0]), 2560);
eq('31: 00 0A -> 10 km', D('31', [0, 10]), 10);
eq('3D: 0F A0 -> 360 °C', D('3D', [0x0F, 0xA0]), 360, 1e-9);
eq('4C: FF -> 100 %', D('4C', [255]), 100, 1e-9);
eq('4D: 01 00 -> 256 min', D('4D', [1, 0]), 256);
eq('50: 0A 00 00 00 -> 100 g/s', D('50', [10, 0, 0, 0]), 100);
eq('54: 80 00 -> 1 Pa (işarəli)', D('54', [0x80, 0]), 1);
eq('59: 00 64 -> 1000 kPa', D('59', [0, 100]), 1000);
eq('5D: 6A 00 -> 2 °', D('5D', [0x6A, 0]), 2, 1e-9);
eq('61: 7D -> 0 %', D('61', [125]), 0);
eq('62: 00 -> -125 %', D('62', [0]), -125);
eq('84: 5A -> 50 °C', D('84', [90]), 50);
eq('9E: 00 32 -> 10 g/s', D('9E', [0, 50]), 10, 1e-9);
eq('A2: 00 40 -> 2 mg/stroke', D('A2', [0, 64]), 2, 1e-9);
eq('A6: 00 00 01 00 -> 25.6 km', D('A6', [0, 0, 1, 0]), 25.6, 1e-9);
// formula ↔ OBDex "range" ardıcıllığı: 0 və FF baytlarında dəyər elan olunmuş aralıqdan kənara çıxmır
let rangeBad = [];
PD.forEach(e => {
  if (!e.f || !e.r || !P[e.id] || !P[e.id].obdex) return;
  const lo = P[e.id].dec(new Array(e.b).fill(0)).v, hi = P[e.id].dec(new Array(e.b).fill(255)).v;
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  if (a < e.r[0] - 0.5 || b > e.r[1] + 70) rangeBad.push(e.id + ' ' + a + '..' + b + ' vs ' + e.r);
});
check('Yeni PID-lərin düsturu elan olunmuş aralıqla uyğundur', rangeBad.length === 0, rangeBad.join('; '));
// qısa cavab: xəta atmalı (obd.js bunu "nodata" kimi tutur)
let threw = false; try { P['22'].dec([1]); } catch (e) { threw = true; }
check('Qısa cavabda dekoder xəta atır (nodata kimi tutulur)', threw, 'atmadı');
// istifadəçinin fərdi PID-i üstünlük təşkil edir
const cctx = ctxWith(['formula.js', 'pids.js'], null);
cctx.PIDS['30'] = { az: 'Mənim', en: 'Mine', unit: 'x', fix: 2, custom: true, dec: () => ({ v: 7 }) };
['pid-data.js', 'pid-extra.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), cctx));
check('Fərdi PID (30) OBDex ilə əvəz olunmur', cctx.PIDS['30'].custom === true && cctx.PIDS['30'].dec([1]).v === 7, '');
// Mode 09 və meta
check('PID_META: 01:4F (dekodersiz) adı məlumdur', ctx.PID_META['01:4F'] && /equivalence/.test(ctx.PID_META['01:4F'].en) && !ctx.PID_META['01:4F'].decoded, '');
check('PID_META: 09:0A ECU adı və 09:06 CVN var', ctx.PID_META['09:0A'] && ctx.PID_META['09:06'], '');

// ---- 4. index.html sıralaması ----
const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
const order = ['js/pids.js', 'js/formula.js', 'js/livediag.js', 'js/o2diag.js', 'js/fuel.js', 'js/ui-tools.js', 'js/pid-data.js', 'js/pid-extra.js'].map(s => html.indexOf('src="' + s + '"'));
check('index.html: pid-data/pid-extra, pids/formula/livediag/fuel/ui-tools-dan SONRA yüklənir', order.every(i => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order));
check('index.html: dtc-data.js hələ də dtc-merge.js-dən əvvəl', html.indexOf('js/dtc-data.js') < html.indexOf('js/dtc-merge.js'), '');

console.log('\nOBDEX NƏTİCƏ: ' + pass + ' keçdi, ' + fail + ' uğursuz');
process.exit(fail ? 1 : 0);
