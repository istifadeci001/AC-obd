'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'www', 'js', 'ble.js');
if (!fs.existsSync(file)) throw new Error('www/js/ble.js yaradılmayıb; npm run build:ble icra edilməlidir');
const code = fs.readFileSync(file, 'utf8');
if (code.length < 5000) throw new Error('BLE bundle gözləniləndən çox kiçikdir; fallback fayl build nəticəsi kimi qəbul edilmir');
for (const token of ['ACOBDFiles', 'appendText', 'saveText', 'BleClient', 'CapApp']) {
  if (!code.includes(token)) throw new Error('BLE bundle-də tələb olunan inteqrasiya yoxdur: ' + token);
}
if (/window\.BleClient\s*=\s*window\.BleClient\s*\|\|\s*\{\}/.test(code)) {
  throw new Error('Köhnə BLE fallback bundle kimi build nəticəsinə düşüb');
}
console.log('OK: generated BLE bundle contains Bluetooth LE, App and Filesystem bridges (' + code.length + ' bytes).');
