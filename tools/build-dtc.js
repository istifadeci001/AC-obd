// Mənbə: obdex (CC0-1.0) https://github.com/foerbsnavi/obdex
// Build zamanı yükləyir və www/js/dtc-data.js faylını yaradır (yığcam format).
const fs = require('fs'), path = require('path');
// Mənbə (oflayn, repozitoriyada): data/obdex/generic/*.json  (OBDex, CC0-1.0)
// İstəyə görə: DTC_SRC=<fayl.json və ya https://...> ilə başqa mənbə göstərmək olar.
const ROOT = path.join(__dirname, '..');
const LOCAL = path.join(ROOT, 'data', 'obdex', 'generic');
const OUT = path.join(ROOT, 'www', 'js', 'dtc-data.js');
async function load() {
  const src = process.env.DTC_SRC;
  if (src && /^https?:\/\//i.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  if (src) return JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!fs.existsSync(LOCAL)) throw new Error('data/obdex/generic qovluğu yoxdur');
  let all = [];
  fs.readdirSync(LOCAL).filter(n => /^[PBCU][0-3]xxx\.json$/.test(n)).sort().forEach(n => {
    all = all.concat(JSON.parse(fs.readFileSync(path.join(LOCAL, n), 'utf8')));
  });
  return all;
}
function cut(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  const i = s.lastIndexOf('. ', n);
  return i > 80 ? s.slice(0, i + 1) : s.slice(0, n).trim() + '…';
}
function convert(arr) {
  const out = {};
  let n = 0;
  for (const c of arr) {
    if (!c || !/^[PBCU][0-3][0-9A-F]{3}$/.test(c.code)) continue;
    const t = c.title && c.title.en;
    if (!t) continue;
    out[c.code] = {
      t: t,
      d: cut(c.description && c.description.en, 380),
      c: (c.common_causes || []).slice(0, 5).map(x => [(x.label && x.label.en) || '', x.likelihood || '']),
      s: (c.symptoms || []).slice(0, 4).map(x => x.en || ''),
      f: c.flags ? [c.flags.mil ? 1 : 0, c.flags.emissions_relevant ? 1 : 0, c.flags.drive_cycle_required ? 1 : 0, c.flags.limp_mode_possible ? 1 : 0] : null,
      r: (c.related_codes || []).slice(0, 8),
      k: (c.affected_components || []).slice(0, 6),
      u: c.repair ? [c.repair.difficulty || '', c.repair.diy_possible ? 1 : 0] : null,
      w: (c.sources || [])[0] || '',
      v: c.reviewed || ''
    };
    n++;
  }
  return { out: out, n: n };
}
module.exports = { convert: convert };
if (require.main === module) {
  (async () => {
    const arr = await load();
    if (!Array.isArray(arr) || arr.length < 1000) throw new Error('Gözlənilməz format və ya az kod: ' + (arr && arr.length));
    const k = convert(arr);
    if (k.n < arr.length * 0.99) throw new Error('Çoxlu kod atıldı: ' + k.n + ' / ' + arr.length);
    const js = '// Mənbə: obdex (CC0-1.0) https://github.com/foerbsnavi/obdex\nwindow.DTC_BIG=' + JSON.stringify(k.out) + ';\nwindow.DTC_BIG_N=' + k.n + ';\n';
    fs.writeFileSync(OUT, js);
    console.log('DTC yazıldı:', k.n, 'ölçü KB:', Math.round(js.length / 1024));
  })().catch(e => { console.error('DTC yaradılmadı:', e.message); process.exit(1); });
}
