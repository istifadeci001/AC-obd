const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'www/js/dtc-mfr-data.js'), 'utf8'), sandbox, { timeout: 3000 });
vm.runInContext(fs.readFileSync(path.join(root, 'www/js/dtc-mfr.js'), 'utf8'), sandbox, { timeout: 3000 });
const api = sandbox.window.DTCManufacturer;
assert.ok(api, 'manufacturer DTC lookup API should load');
assert.strictEqual(api.getStats().manufacturers, 32);
assert.strictEqual(api.getStats().definitions, 6770);
assert.strictEqual(api.getStats().uniqueCodes, 926);
assert.strictEqual(api.normalizeMake('Kia Motors'), 'KIA');
assert.strictEqual(api.normalizeMake('VW'), 'VOLKSWAGEN');
assert.strictEqual(api.normalizeMake('Mercedes-Benz'), 'MERCEDES');
assert.strictEqual(api.lookup('P1102', 'Kia').description, 'HO2S11 Heater Circuit High Voltage');
assert.strictEqual(api.lookup('P1102', 'Kia Motors').manufacturer, 'KIA');
assert.strictEqual(api.lookup('P0420', 'Kia'), null, 'no Kia-specific P0420 must be invented');
assert.strictEqual(api.lookup('P0420', 'Audi').manufacturer, 'AUDI');
assert.strictEqual(api.lookup('P1102', 'Hyundai'), null, 'unsupported make must not fall back to another manufacturer');
assert.strictEqual(api.lookup('<script>', 'Kia'), null, 'invalid code must be rejected');
assert.strictEqual(api.lookup('P1102', 'Unknown Make'), null, 'unknown make must not guess');

const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const dataScript = html.indexOf('js/dtc-mfr-data.js');
const helperScript = html.indexOf('js/dtc-mfr.js');
const appScript = html.indexOf('js/app.js');
const detailScript = html.indexOf('js/ui-dtc.js');
assert.ok(dataScript >= 0 && helperScript >= 0, 'manufacturer database and helper must be loaded');
assert.ok(dataScript < helperScript && helperScript < appScript, 'manufacturer scripts must load before app.js');
assert.ok(helperScript < detailScript, 'manufacturer helper must load before DTC detail UI');
const dashboard = fs.readFileSync(path.join(root, 'www/js/ui-dash.js'), 'utf8');
assert.ok(dashboard.includes('DTCManufacturer') && dashboard.includes('mfrStats.definitions'),
  'dashboard must display manufacturer definitions separately from generic DTC count');

console.log('OK: manufacturer DTC lookup, runtime loading and dashboard checks passed.');
