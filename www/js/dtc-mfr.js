/* Offline lookup helper. Reads only the bundled static data; no network, storage or dynamic code. */
(function (root) {
  'use strict';
  var DATA = root.DTC_MFR_DATA || {};
  var ALIASES = {
    'KIA MOTORS': 'KIA', 'KIA MOTORS COMPANY': 'KIA',
    'CHEVROLET': 'CHEVY',
    'VW': 'VOLKSWAGEN', 'VOLKSWAGEN AG': 'VOLKSWAGEN',
    'MERCEDES BENZ': 'MERCEDES', 'MERCEDES-BENZ': 'MERCEDES',
    'GENERAL MOTORS': 'GM', 'GENERAL MOTORS CORPORATION': 'GM'
  };

  function normalizeMake(value) {
    var make = String(value || '').trim().toUpperCase();
    if (!make || make.length > 80) return '';
    make = make.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(DATA, make)) return make;
    if (ALIASES[make]) return ALIASES[make];
    var reduced = make.replace(/\b(MOTOR|MOTORS|COMPANY|CORP|CORPORATION|CO|AG)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(DATA, reduced)) return reduced;
    return ALIASES[reduced] || '';
  }

  function lookup(code, make) {
    var normalizedCode = String(code || '').trim().toUpperCase();
    if (!/^[PBCU][0-9A-F]{4}$/.test(normalizedCode)) return null;
    var manufacturer = normalizeMake(make);
    if (!manufacturer || !Object.prototype.hasOwnProperty.call(DATA, manufacturer)) return null;
    var codes = DATA[manufacturer];
    if (!codes || !Object.prototype.hasOwnProperty.call(codes, normalizedCode)) return null;
    var description = codes[normalizedCode];
    if (typeof description !== 'string' || !description.trim()) return null;
    return {
      code: normalizedCode,
      manufacturer: manufacturer,
      description: description,
      locale: 'en',
      source: 'DTC Database'
    };
  }

  var definitionCount = 0;
  Object.keys(DATA).forEach(function (make) {
    definitionCount += Object.keys(DATA[make] || {}).length;
  });

  root.DTCManufacturer = {
    lookup: lookup,
    normalizeMake: normalizeMake,
    getStats: function () {
      return { manufacturers: Object.keys(DATA).length, definitions: definitionCount };
    }
  };
})(window);
