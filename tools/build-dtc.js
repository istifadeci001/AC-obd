// Mənbə: obdex (CC0-1.0) https://github.com/foerbsnavi/obdex
// Build zamanı yükləyir və www/js/dtc-data.js faylını yaradır (yığcam format).
const fs = require('fs');
const SRC = process.env.DTC_SRC || 'https://foerbsnavi.github.io/OBDex/generic.min.json';
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
    const r = await fetch(SRC);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length < 1000) throw new Error('Gözlənilməz format');
    const k = convert(arr);
    const js = '// Mənbə: obdex (CC0-1.0) https://github.com/foerbsnavi/obdex\nwindow.DTC_BIG=' + JSON.stringify(k.out) + ';\nwindow.DTC_BIG_N=' + k.n + ';\n';
    fs.writeFileSync('www/js/dtc-data.js', js);
    console.log('DTC yazıldı:', k.n, 'ölçü KB:', Math.round(js.length / 1024));
  })().catch(e => { console.error('DTC yüklənmədi:', e.message); process.exit(1); });
}
