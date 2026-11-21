'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ble = fs.readFileSync(path.join(root, 'src/ble-entry.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/build-apk.yml'), 'utf8');

assert.ok(pkg.dependencies && pkg.dependencies['@capacitor/filesystem'],
  '@capacitor/filesystem must be in production dependencies');
assert.ok(pkg.dependencies['@capacitor/filesystem'].startsWith('^6.'),
  'Filesystem major version must match Capacitor 6');
assert.ok(pkg.dependencies['@capacitor/core'].startsWith('^6.'),
  'Project must use Capacitor 6 for this integration');
assert.ok(ble.includes("from '@capacitor/filesystem'"),
  'BLE entry must import Filesystem');
assert.ok(pkg.scripts && pkg.scripts['build:ble'],
  'build:ble script must exist');
assert.ok(pkg.scripts && pkg.scripts['verify:ble'],
  'verify:ble script must exist');
assert.ok(fs.existsSync(path.join(root, 'tools/verify-ble-bundle.js')),
  'BLE bundle verifier must exist');

const installAt = workflow.indexOf('npm install --no-audit --no-fund');
const bleBuildAt = workflow.indexOf('npm run build:ble');
const verifyAt = workflow.indexOf('npm ls @capacitor/filesystem');
assert.ok(installAt >= 0 && verifyAt > installAt && bleBuildAt > verifyAt,
  'CI must install and verify Filesystem before building BLE');
assert.ok(workflow.includes('npm run verify:ble'), 'CI must verify the generated BLE bundle');
assert.strictEqual((workflow.match(/npm install --no-audit --no-fund/g) || []).length, 1,
  'CI should install dependencies once');
console.log('OK: BLE dependency and CI build order checks passed.');
