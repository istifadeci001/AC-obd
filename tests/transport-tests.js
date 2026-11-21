'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../www/js/transport.js'), 'utf8');
let calls = [], failConnect = false, services = [{ uuid: 'service', characteristics: [] }];
const ble = {
  initialize: async () => { calls.push('initialize'); },
  requestLEScan: async (opts, cb) => { calls.push('scan:start'); cb({ device: { deviceId: 'dev1' }, localName: 'ELM327', rssi: -50 }); },
  stopLEScan: async () => { calls.push('scan:stop'); },
  connect: async (id) => { calls.push('connect:' + id); if (failConnect) throw new Error('connect failed'); },
  disconnect: async (id) => { calls.push('disconnect:' + id); },
  getServices: async () => services
};
const context = { window: { BleClient: ble }, Log: { add: () => {} }, setTimeout, Promise, String, Uint8Array, DataView };
vm.runInNewContext(source, context);
(async () => {
  const T = context.window.Transport;
  let found = null;
  await T.scan(x => { found = x; }, 1000);
  assert.strictEqual(found.id, 'dev1');
  assert.ok(calls.includes('scan:stop'), 'scan must always stop');
  assert.strictEqual(calls.filter(x => x === 'initialize').length, 1, 'BLE initialize must be idempotent');
  const got = await T.connect('dev1');
  assert.strictEqual(got.length, 1);
  failConnect = true;
  await assert.rejects(() => T.connect('bad'), /connect failed/);
  assert.ok(calls.includes('disconnect:bad'), 'failed connection must be cleaned up');
  await assert.rejects(() => T.reconnect(), /adapter ID-si yoxdur/);
  console.log('Transport tests: 6 checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
