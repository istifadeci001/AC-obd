#!/usr/bin/env node
// AC OBD: bütün CSS və JS faylını TƏK bir HTML faylına yığır (göndərmək və yoxlamaq üçün).
// İstifadə:
//   node tools/bundle.js                 -> dist/AC-OBD-single.html
//        (böyük DTC bazası və BLE kitabxanası çıxarılır: fayl kiçik qalır, kod tam daxildir)
//   node tools/bundle.js --full          -> ble.js, dtc-data.js, tərcümələr və ikon da daxil (varsa)
//   node tools/bundle.js --out fayl.html -> başqa ad/yer
// Hər fayl öz data-file etiketi ilə ayrıca <script>/<style> blokundadır, ona görə geri bölmək mümkündür.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WWW = path.join(ROOT, 'www');
const FULL = process.argv.includes('--full');
const oi = process.argv.indexOf('--out');
const OUT = oi > 0 && process.argv[oi + 1] ? path.resolve(process.argv[oi + 1]) : path.join(ROOT, 'dist', 'AC-OBD-single.html');
const read = f => fs.readFileSync(f, 'utf8');
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
// </script, </style və <!-- HTML-ni pozmasın deyə JS/CSS-də eyni mənalı \u-yazılışı ilə əvəz olunur (geri çevirmək mümkündür)
const safe = s => s.replace(/<\/(script|style)/gi, '<\\u002F$1').replace(/<!--/g, '<\\u0021--');
const files = [], notes = [];

function inlineJs(src, body, attrs) {
  files.push({ path: 'www/' + src, bytes: Buffer.byteLength(body) });
  return '<script data-file="www/' + src + '"' + (attrs || '') + '>\n' + safe(body) + '\n</script>';
}
const STUB = {
  'js/ble.js': 'window.BleClient=window.BleClient||{};window.CapApp=window.CapApp||{addListener:function(){}};',
  'js/dtc-data.js': 'window.DTC_BIG={};window.DTC_BIG_N=0;'
};

let html = read(path.join(WWW, 'index.html'));

// CSS
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, function (m, href) {
  const f = path.join(WWW, href);
  if (!fs.existsSync(f)) { notes.push('CSS tapılmadı: ' + href); return '<!-- CSS tapılmadı: ' + href + ' -->'; }
  const body = read(f);
  files.push({ path: 'www/' + href, bytes: Buffer.byteLength(body) });
  return '<style data-file="www/' + href + '">\n' + safe(body) + '\n</style>';
});

// JS (index.html-dəki sıra saxlanılır)
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  const f = path.join(WWW, src), exists = fs.existsSync(f);
  let pre = '';
  if (src === 'js/dtc-lang.js' && FULL) {
    ['az', 'ru'].forEach(function (l) {
      const df = path.join(WWW, 'data', 'dtc-' + l + '.js');
      if (fs.existsSync(df)) pre += inlineJs('data/dtc-' + l + '.js', read(df)) + '\n';
      else notes.push('Tərcümə faylı yoxdur: data/dtc-' + l + '.js');
    });
  }
  if (STUB[src] && (!FULL || !exists)) {
    notes.push(src + (FULL ? ' tapılmadı (build zamanı yaranır), ' : ' çıxarıldı, ') + 'boş əvəzedici qoyuldu');
    return pre + '<script data-file="www/' + src + '" data-stub="1">\n' + STUB[src] + '\n</script>';
  }
  if (!exists) { notes.push('JS tapılmadı: ' + src); return pre + '<!-- JS tapılmadı: ' + src + ' -->'; }
  return pre + inlineJs(src, read(f));
});

// İkon (yalnız --full)
if (FULL) {
  const ic = path.join(WWW, 'icon.jpg');
  if (fs.existsSync(ic)) {
    const uri = 'data:image/jpeg;base64,' + fs.readFileSync(ic).toString('base64');
    html = html.split('src="icon.jpg"').join('src="' + uri + '"').split('href="icon.jpg"').join('href="' + uri + '"');
  } else notes.push('icon.jpg tapılmadı');
}

// Proqramın hissəsi olmayan mənbə faylları (yalnız oxumaq üçün, işə düşmür)
const extra = [];
['package.json', 'capacitor.config.json', '.gitignore'].forEach(function (n) { if (fs.existsSync(path.join(ROOT, n))) extra.push(path.join(ROOT, n)); });
['src', 'tools', 'tests', path.join('.github', 'workflows')].forEach(function (d) {
  const dd = path.join(ROOT, d);
  if (fs.existsSync(dd)) fs.readdirSync(dd).sort().forEach(function (n) { const p = path.join(dd, n); if (fs.statSync(p).isFile() && /\.(js|json|yml|yaml|md)$/.test(n)) extra.push(p); });
});
let extraHtml = '';
extra.forEach(function (p) {
  const body = read(p);
  files.push({ path: rel(p), bytes: Buffer.byteLength(body) });
  extraHtml += '<script type="text/plain" data-file="' + rel(p) + '">\n' + safe(body) + '\n</script>\n';
});
const ver = (html.match(/id="appver">([^<]*)</) || [])[1] || '?';
const head = '<!--\n  AC OBD bir fayllı paket (versiya ' + ver + ', ' + new Date().toISOString() + ')\n  Rejim: ' + (FULL ? 'tam' : 'yığcam (BLE kitabxanası və böyük DTC bazası çıxarılıb)') + '\n  Fayllar (' + files.length + '):\n' +
  files.map(function (x) { return '    ' + x.path + '  ' + x.bytes + ' bayt'; }).join('\n') + '\n' +
  (notes.length ? '  Qeydlər:\n' + notes.map(function (x) { return '    - ' + x; }).join('\n') + '\n' : '') + '-->\n';
html = head + html.replace('</body>', '<!-- Aşağıdakılar proqramın hissəsi deyil: mənbə faylları (işə düşmür) -->\n' + extraHtml + '</body>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('Yazıldı: ' + OUT + ' (' + Math.round(Buffer.byteLength(html) / 1024) + ' KB, ' + files.length + ' fayl)');
notes.forEach(function (x) { console.log('  qeyd: ' + x); });
