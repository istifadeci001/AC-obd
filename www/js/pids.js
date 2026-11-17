// Standart SAE J1979 Mode 01 düsturları. Ref aralıqları ümumi məlumatdır, istehsalçı dəyəri deyil.
window.PIDS = (function () {
  var P = {};
  function w(b) { return b[0] * 256 + b[1]; }
  function s16(n) { return n > 32767 ? n - 65536 : n; }
  function add(id, az, en, unit, fix, dec, extra) {
    P[id] = Object.assign({ az: az, en: en, unit: unit, fix: fix, dec: dec }, extra || {});
  }
  var TRIM = { warn: [-10, 10], ref: 'Ümumi aralıq: təxminən ±10 % (istehsalçı dəyəri deyil)' };
  add('03', 'Yanacaq sisteminin vəziyyəti', 'Fuel System Status', '', 0, function (b) {
    var m = { 1: 'Open loop (soyuq)', 2: 'Closed loop', 4: 'Open loop (yük/yavaşlama)', 8: 'Open loop (nasazlıq)', 16: 'Closed loop (O2 nasaz)' };
    return { v: b[0], txt: m[b[0]] || ('kod ' + b[0]) };
  }, { nochart: true });
  add('04', 'Hesablanmış mühərrik yükü', 'Calculated Engine Load', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('05', 'Soyuducu temperaturu', 'Coolant Temperature', '°C', 0, function (b) { return { v: b[0] - 40 }; },
    { ref: 'İsti mühərrikdə adətən ~85–105 °C (ümumi, istehsalçı dəyəri deyil)' });
  add('06', 'STFT (1-ci sıra)', 'Short Term Fuel Trim B1', '%', 1, function (b) { return { v: b[0] * 100 / 128 - 100 }; }, TRIM);
  add('07', 'LTFT (1-ci sıra)', 'Long Term Fuel Trim B1', '%', 1, function (b) { return { v: b[0] * 100 / 128 - 100 }; }, TRIM);
  add('08', 'STFT (2-ci sıra)', 'Short Term Fuel Trim B2', '%', 1, function (b) { return { v: b[0] * 100 / 128 - 100 }; }, TRIM);
  add('09', 'LTFT (2-ci sıra)', 'Long Term Fuel Trim B2', '%', 1, function (b) { return { v: b[0] * 100 / 128 - 100 }; }, TRIM);
  add('0A', 'Yanacaq təzyiqi', 'Fuel Pressure', 'kPa', 0, function (b) { return { v: b[0] * 3 }; });
  add('0B', 'Giriş kollektoru təzyiqi', 'Intake Manifold Pressure (MAP)', 'kPa', 0, function (b) { return { v: b[0] }; });
  add('0C', 'Mühərrik dövrü', 'Engine RPM', 'rpm', 0, function (b) { return { v: w(b) / 4 }; });
  add('0D', 'Avtomobil sürəti', 'Vehicle Speed', 'km/h', 0, function (b) { return { v: b[0] }; });
  add('0E', 'Alışdırma qabağı bucağı', 'Ignition Timing Advance', '°', 1, function (b) { return { v: b[0] / 2 - 64 }; });
  add('0F', 'Giriş havası temperaturu', 'Intake Air Temperature', '°C', 0, function (b) { return { v: b[0] - 40 }; });
  add('10', 'Hava sərfi (MAF)', 'Mass Air Flow', 'g/s', 2, function (b) { return { v: w(b) / 100 }; });
  add('11', 'Drossel mövqeyi', 'Throttle Position', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('14', 'O2 sensor 1-ci sıra, sensor 1', 'O2 Sensor B1S1 Voltage', 'V', 3, function (b) { return { v: b[0] / 200 }; });
  add('15', 'O2 sensor 1-ci sıra, sensor 2', 'O2 Sensor B1S2 Voltage', 'V', 3, function (b) { return { v: b[0] / 200 }; });
  add('1F', 'Mühərrikin işləmə vaxtı', 'Run Time Since Start', 's', 0, function (b) { return { v: w(b) }; });
  add('24', 'Lambda B1S1 (geniş diapazon)', 'Lambda B1S1 (wide range)', 'λ', 3, function (b) { return { v: w(b) * 2 / 65536 }; });
  add('25', 'Lambda B1S2 (geniş diapazon)', 'Lambda B1S2 (wide range)', 'λ', 3, function (b) { return { v: w(b) * 2 / 65536 }; });
  add('2E', 'Evap təmizləmə klapanı', 'Commanded Evap Purge', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('2F', 'Yanacaq səviyyəsi', 'Fuel Level', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('32', 'Evap sistem təzyiqi', 'Evap System Vapor Pressure', 'Pa', 0, function (b) { return { v: s16(w(b)) / 4 }; });
  add('33', 'Barometrik təzyiq', 'Barometric Pressure', 'kPa', 0, function (b) { return { v: b[0] }; });
  add('3C', 'Katalizator temp. B1S1', 'Catalyst Temp B1S1', '°C', 0, function (b) { return { v: w(b) / 10 - 40 }; });
  add('3E', 'Katalizator temp. B1S2', 'Catalyst Temp B1S2', '°C', 0, function (b) { return { v: w(b) / 10 - 40 }; });
  add('42', 'Nəzarət modulunun gərginliyi', 'Control Module Voltage', 'V', 2, function (b) { return { v: w(b) / 1000 }; });
  add('43', 'Mütləq yük', 'Absolute Load Value', '%', 1, function (b) { return { v: w(b) * 100 / 255 }; });
  add('44', 'Əmr olunan lambda', 'Commanded Equivalence Ratio', 'λ', 3, function (b) { return { v: w(b) / 32768 }; });
  add('45', 'Nisbi drossel mövqeyi', 'Relative Throttle Position', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('46', 'Xarici hava temperaturu', 'Ambient Air Temperature', '°C', 0, function (b) { return { v: b[0] - 40 }; });
  add('49', 'Gaz pedalı D', 'Accelerator Pedal Position D', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('4A', 'Gaz pedalı E', 'Accelerator Pedal Position E', '%', 1, function (b) { return { v: b[0] * 100 / 255 }; });
  add('5C', 'Yağ temperaturu', 'Engine Oil Temperature', '°C', 0, function (b) { return { v: b[0] - 40 }; });
  add('5E', 'Yanacaq sərfi', 'Engine Fuel Rate', 'L/h', 2, function (b) { return { v: w(b) / 20 }; });
  P['RV'] = { az: 'Adapter gərginliyi (ATRV)', en: 'Adapter Voltage (ATRV)', unit: 'V', fix: 1, special: true,
    ref: 'Adapterin OBD portunda ölçdüyü gərginlik, ECU-dan deyil' };
  return P;
})();
