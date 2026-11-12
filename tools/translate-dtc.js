// DTC bazasını AI ilə Azərbaycan və rus dilinə tərcümə edir (build-dtc.js əvvəl işləməlidir).
// Nəticə: data/dtc-az.json, data/dtc-ru.json (davam edə bilər: tərcümə olunmuşları atlayır).
const fs = require('fs');
const E = process.env;
const KEY = E.AI_KEY || '';
const PROV = (E.PROVIDER || 'anthropic').toLowerCase();
const MODEL = E.MODEL || '';
const ENDPOINT = E.ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const LIMIT = parseInt(E.LIMIT || '0', 10) || 0;
const BATCH = parseInt(E.BATCH || '10', 10) || 10;
const PAR = parseInt(E.PAR || '3', 10) || 3;
const RETRY_MS = parseInt(E.RETRY_MS || '4000', 10);
const LANGS = (E.LANGS || 'az,ru').split(',').map(s => s.trim()).filter(Boolean);
const NAMES = { az: 'Azerbaijani', ru: 'Russian' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadBig() {
  const js = fs.readFileSync('www/js/dtc-data.js', 'utf8');
  const a = js.indexOf('window.DTC_BIG=') + 'window.DTC_BIG='.length;
  const b = js.indexOf(';\nwindow.DTC_BIG_N');
  return JSON.parse(js.slice(a, b));
}
async function call(prompt) {
  let url, headers, body;
  if (PROV === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' };
    body = { model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] };
  } else {
    url = ENDPOINT;
    headers = { 'content-type': 'application/json', authorization: 'Bearer ' + KEY };
    body = { model: MODEL, messages: [{ role: 'user', content: prompt }] };
  }
  const r = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 200));
  const d = JSON.parse(txt);
  return PROV === 'anthropic'
    ? (d.content || []).map(x => x.text || '').join('')
    : ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '');
}
function parseJson(t) {
  t = String(t).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('JSON tapılmadı');
  return JSON.parse(t.slice(i, j + 1));
}
function clean(src, out) {
  const ok = {};
  for (const code of Object.keys(src)) {
    const o = out && out[code], s = src[code];
    if (!o || typeof o.t !== 'string' || !o.t.trim() || typeof o.d !== 'string') continue;
    if (!Array.isArray(o.c) || o.c.length !== s.c.length || o.c.some(x => typeof x !== 'string')) continue;
    if (!Array.isArray(o.s) || o.s.length !== s.s.length || o.s.some(x => typeof x !== 'string')) continue;
    ok[code] = { t: o.t.trim(), d: o.d.trim(), c: o.c.map(x => x.trim()), s: o.s.map(x => x.trim()) };
  }
  return ok;
}
async function translate(lang, src) {
  const good = {};
  let pend = Object.keys(src);
  for (let a = 1; a <= 4 && pend.length; a++) {
    const part = {};
    pend.forEach(c => { part[c] = src[c]; });
    const prompt = 'Translate the string values of the following JSON from English to ' + NAMES[lang] + ' for an automotive diagnostic app (OBD-II trouble codes). ' +
      'Rules: keep the JSON structure and keys exactly; translate every string value; keep standard abbreviations and part names (O2, MAF, MAP, ECU, CAN, EGR, EVAP, VVT, MIL); keep code numbers; ' +
      'do not add or remove array items; use short natural technical language; add no explanations. Return ONLY valid JSON.\n' + JSON.stringify(part);
    try { Object.assign(good, clean(part, parseJson(await call(prompt)))); }
    catch (e) { console.error('  cəhd ' + a + ' alınmadı: ' + e.message); await sleep(RETRY_MS * a); }
    pend = pend.filter(c => !good[c]);
  }
  return good;
}
async function main() {
  if (!KEY || !MODEL) throw new Error('AI_KEY və MODEL tələb olunur');
  const big = loadBig();
  fs.mkdirSync('data', { recursive: true });
  for (const lang of LANGS) {
    if (!NAMES[lang]) continue;
    const file = 'data/dtc-' + lang + '.json';
    const done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    let todo = Object.keys(big).sort().filter(c => !done[c]);
    if (LIMIT) todo = todo.slice(0, LIMIT);
    console.log(lang + ': tərcümə ediləcək ' + todo.length);
    const batches = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    let idx = 0, ok = 0;
    const worker = async () => {
      while (idx < batches.length) {
        const my = batches[idx++], src = {};
        my.forEach(c => { src[c] = { t: big[c].t, d: big[c].d, c: big[c].c.map(x => x[0]), s: big[c].s }; });
        const res = await translate(lang, src);
        Object.assign(done, res); ok += Object.keys(res).length;
        fs.writeFileSync(file, JSON.stringify(done));
        console.log(lang + ': ' + ok + ' / ' + todo.length);
      }
    };
    await Promise.all(Array.from({ length: PAR }, worker));
  }
}
module.exports = { clean, parseJson, translate, main };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
