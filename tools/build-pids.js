#!/usr/bin/env node
// data/obdex/pids/*.json + data/pid-az.json  ->  www/js/pid-data.js
// Yalnız TƏK düsturlu PID-lər dekoder üçün işarələnir (f sahəsi). Çox-dəyərli PID-lər
// (məs. O2 sensorlarının gərginlik+trim cütü) yalnız ad/vahid məlumatı kimi saxlanılır.
// Düstur tətbiqin öz təhlükəsiz mühərriki ilə (www/js/formula.js, eval yoxdur) yoxlanılır.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(ROOT, 'www', 'js', 'formula.js'));
const F = window.Formula;
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// Düsturun nəticə dəqiqliyi: hər baytın 1 vahid dəyişməsinin ən kiçik təsiri -> onluq rəqəm sayı
function decimals(fn, n) {
  const base = new Array(n).fill(0), v0 = fn(base);
  let step = Infinity;
  for (let i = 0; i < n; i++) {
    const b = base.slice(); b[i] = 1;
    const d = Math.abs(fn(b) - v0);
    if (d > 1e-12 && d < step) step = d;
  }
  if (!isFinite(step)) return 0;
  return Math.max(0, Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)));
}

function build() {
  const az = rd('data/pid-az.json');
  const out = [], skipped = [];
  [['01', 'data/obdex/pids/mode01.json'], ['09', 'data/obdex/pids/mode09.json']].forEach(function (pair) {
    rd(pair[1]).forEach(function (p) {
      const e = { id: p.pid, m: pair[0], en: p.name.en, de: p.name.de || '', u: p.unit || '', b: p.bytes };
      if (pair[0] === '01' && az[p.pid]) e.az = az[p.pid];
      if (p.range) e.r = p.range;
      if (pair[0] === '01' && p.formula) {
        if (/[;]/.test(p.formula) || /[;]/.test(p.unit || '')) skipped.push(p.pid + ' (çox-dəyərli)');
        else {
          try {
            const fn = F.compile(p.formula);
            e.x = decimals(fn, p.bytes);
            fn(new Array(p.bytes).fill(255));
            e.f = p.formula;
          } catch (err) { skipped.push(p.pid + ' (' + err.message + ')'); }
        }
      }
      out.push(e);
    });
  });
  return { out: out, skipped: skipped };
}
module.exports = { build: build, decimals: decimals };
if (require.main === module) {
  const r = build();
  const js = '// Mənbə: obdex (CC0-1.0) https://github.com/foerbsnavi/obdex\n// Yaradılıb: node tools/build-pids.js (əllə dəyişməyin)\nwindow.PID_DATA=' +
    JSON.stringify(r.out) + ';\nwindow.PID_N=' + r.out.length + ';\n';
  fs.writeFileSync(path.join(ROOT, 'www', 'js', 'pid-data.js'), js);
  console.log('PID yazıldı:', r.out.length, '| dekoderli:', r.out.filter(x => x.f).length, '| ölçü KB:', Math.round(js.length / 1024));
  if (r.skipped.length) console.log('Dekodersiz (yalnız ad/vahid):', r.skipped.join(', '));
}
