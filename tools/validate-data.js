#!/usr/bin/env node
// OBDex məlumatlarını (data/obdex/) schema/*.json ilə və əlavə qaydalarla yoxlayır.
// Heç bir xarici paket tələb etmir. Xəta olarsa 1 kodu ilə çıxır (build dayanır).
//   node tools/validate-data.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const J = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// JSON Schema-nın bu layihədə işlənən alt çoxluğu
function validate(v, s, at, errs) {
  const t = s.type;
  const isInt = x => typeof x === 'number' && Number.isInteger(x);
  if (t === 'object' && !(v && typeof v === 'object' && !Array.isArray(v))) return errs.push(at + ': obyekt olmalıdır');
  if (t === 'array' && !Array.isArray(v)) return errs.push(at + ': massiv olmalıdır');
  if (t === 'string' && typeof v !== 'string') return errs.push(at + ': mətn olmalıdır');
  if (t === 'boolean' && typeof v !== 'boolean') return errs.push(at + ': true/false olmalıdır');
  if (t === 'number' && (typeof v !== 'number' || !isFinite(v))) return errs.push(at + ': rəqəm olmalıdır');
  if (t === 'integer' && !isInt(v)) return errs.push(at + ': tam ədəd olmalıdır');
  if (s.enum && s.enum.indexOf(v) < 0) errs.push(at + ': icazəli dəyər deyil (' + JSON.stringify(v) + ')');
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(at + ': format uyğun deyil (' + v.slice(0, 40) + ')');
    if (s.minLength !== undefined && v.length < s.minLength) errs.push(at + ': çox qısadır');
    if (s.maxLength !== undefined && v.length > s.maxLength) errs.push(at + ': çox uzundur (' + v.length + ' > ' + s.maxLength + ')');
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) errs.push(at + ': minimumdan kiçikdir');
    if (s.maximum !== undefined && v > s.maximum) errs.push(at + ': maksimumdan böyükdür');
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errs.push(at + ': elementlər azdır');
    if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(at + ': elementlər çoxdur');
    if (s.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) errs.push(at + ': təkrarlanan element');
    if (s.items) v.forEach((x, i) => validate(x, s.items, at + '[' + i + ']', errs));
  }
  if (t === 'object') {
    (s.required || []).forEach(k => { if (!(k in v)) errs.push(at + ': "' + k + '" yoxdur'); });
    Object.keys(v).forEach(k => {
      let known = false;
      if (s.properties && s.properties[k]) { known = true; validate(v[k], s.properties[k], at + '.' + k, errs); }
      if (s.patternProperties) {
        Object.keys(s.patternProperties).forEach(p => {
          if (new RegExp(p).test(k)) { known = true; validate(v[k], s.patternProperties[p], at + '.' + k, errs); }
        });
      }
      if (!known && s.additionalProperties === false) errs.push(at + ': naməlum sahə "' + k + '"');
    });
  }
}

const FAMILIES = ['B0xxx', 'C0xxx', 'P0xxx', 'P2xxx', 'P3xxx', 'U0xxx', 'U3xxx'];
const CAT = { P: 'powertrain', B: 'body', C: 'chassis', U: 'network' };
const MAX_ERR = 30;

function run() {
  const codeSchema = J('schema/code.schema.json'), pidSchema = J('schema/pid.schema.json');
  const errs = [], warns = [], seen = new Map(), all = [];
  let total = 0;
  for (const fam of FAMILIES) {
    const p = 'data/obdex/generic/' + fam + '.json';
    if (!fs.existsSync(path.join(ROOT, p))) { errs.push('Fayl yoxdur: ' + p); continue; }
    const arr = J(p);
    if (!Array.isArray(arr)) { errs.push(p + ': massiv olmalıdır'); continue; }
    arr.forEach((c, i) => {
      const at = fam + '#' + i + (c && c.code ? ' ' + c.code : '');
      const e = [];
      validate(c, codeSchema, at, e);
      e.forEach(x => errs.push(x));
      if (!c || typeof c.code !== 'string') return;
      if (c.code.slice(0, 2) + 'xxx' !== fam) errs.push(at + ': kod bu fayla aid deyil (' + fam + ')');
      if (CAT[c.code[0]] && c.category !== CAT[c.code[0]]) errs.push(at + ': kateqoriya kodla uyğun deyil (' + c.category + ')');
      if (seen.has(c.code)) errs.push(at + ': təkrarlanan kod (ilk dəfə ' + seen.get(c.code) + ')');
      else seen.set(c.code, fam);
      if (!(c.title && c.title.en)) errs.push(at + ': ingilis başlığı yoxdur');
      if (c.repair && c.repair.estimated_cost_eur && c.repair.estimated_cost_eur[0] > c.repair.estimated_cost_eur[1]) errs.push(at + ': xərc aralığı tərsdir');
      if (c.repair && c.repair.estimated_hours && c.repair.estimated_hours[0] > c.repair.estimated_hours[1]) errs.push(at + ': saat aralığı tərsdir');
      all.push(c);
      total++;
    });
  }
  // əlaqəli kodlar mövcud olmalıdır
  let broken = 0;
  all.forEach(c => (c.related_codes || []).forEach(r => { if (!seen.has(r)) { broken++; if (broken <= 5) errs.push(c.code + ': mövcud olmayan əlaqəli kod ' + r); } }));
  // PID-lər
  const pidSeen = new Set();
  for (const f of ['mode01', 'mode09']) {
    const p = 'data/obdex/pids/' + f + '.json';
    if (!fs.existsSync(path.join(ROOT, p))) { errs.push('Fayl yoxdur: ' + p); continue; }
    J(p).forEach((x, i) => {
      const at = f + '#' + i + ' ' + (x && x.pid);
      const e = []; validate(x, pidSchema, at, e); e.forEach(y => errs.push(y));
      if (!x) return;
      if (x.mode !== f.slice(4)) errs.push(at + ': mode faylın adına uyğun deyil');
      const k = x.mode + ':' + x.pid;
      if (pidSeen.has(k)) errs.push(at + ': təkrarlanan PID'); else pidSeen.add(k);
    });
  }
  console.log('Yoxlanıldı: ' + total + ' DTC, ' + pidSeen.size + ' PID.');
  warns.forEach(w => console.log('  xəbərdarlıq: ' + w));
  if (errs.length) {
    console.error('XƏTA: ' + errs.length + ' problem tapıldı:');
    errs.slice(0, MAX_ERR).forEach(x => console.error('  - ' + x));
    if (errs.length > MAX_ERR) console.error('  ... və daha ' + (errs.length - MAX_ERR) + ' xəta');
    return 1;
  }
  console.log('OK: məlumat sxemə və qaydalara uyğundur.');
  return 0;
}
module.exports = { validate: validate, run: run };
if (require.main === module) process.exit(run());
