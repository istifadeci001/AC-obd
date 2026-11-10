(function () {
  var D = window.DTC_DB;
  function X(c, en, az) { if (!D[c]) D[c] = { en: en, az: az, causes: [], symptoms: [], check: [], sensors: [], related: [], basic: true }; }
  X('P0016', 'Crankshaft/Camshaft Position Correlation (Bank 1 Sensor A)', 'Dirsəkli val və paylayıcı val vəziyyət uyğunsuzluğu');
  X('P0030', 'HO2S Heater Control Circuit (Bank 1 Sensor 1)', 'Ön O2 sensor qızdırıcısı dövrəsi (1-ci sıra)');
  X('P0036', 'HO2S Heater Control Circuit (Bank 1 Sensor 2)', 'Arxa O2 sensor qızdırıcısı dövrəsi (1-ci sıra)');
  X('P0087', 'Fuel Rail/System Pressure Too Low', 'Yanacaq rampası təzyiqi çox aşağıdır');
  X('P0102', 'MAF Circuit Low Input', 'MAF sensoru dövrəsi: aşağı siqnal');
  X('P0103', 'MAF Circuit High Input', 'MAF sensoru dövrəsi: yüksək siqnal');
  X('P0105', 'MAP/Barometric Pressure Circuit', 'MAP/barometrik təzyiq sensoru dövrəsi');
  X('P0106', 'MAP Range/Performance', 'MAP sensoru: diapazon/performans problemi');
  X('P0107', 'MAP Circuit Low Input', 'MAP sensoru dövrəsi: aşağı siqnal');
  X('P0108', 'MAP Circuit High Input', 'MAP sensoru dövrəsi: yüksək siqnal');
  X('P0112', 'IAT Circuit Low Input', 'Giriş havası temperatur sensoru: aşağı siqnal');
  X('P0113', 'IAT Circuit High Input', 'Giriş havası temperatur sensoru: yüksək siqnal');
  X('P0115', 'Engine Coolant Temperature Circuit', 'Soyuducu temperatur sensoru dövrəsi');
  X('P0116', 'ECT Range/Performance', 'Soyuducu temperatur sensoru: performans problemi');
  X('P0117', 'ECT Circuit Low Input', 'Soyuducu temperatur sensoru: aşağı siqnal');
  X('P0118', 'ECT Circuit High Input', 'Soyuducu temperatur sensoru: yüksək siqnal');
  X('P0121', 'Throttle Position Sensor A Range/Performance', 'Drossel sensoru A: performans problemi');
  X('P0122', 'Throttle Position Sensor A Circuit Low', 'Drossel sensoru A: aşağı siqnal');
  X('P0123', 'Throttle Position Sensor A Circuit High', 'Drossel sensoru A: yüksək siqnal');
  X('P0125', 'Insufficient Coolant Temperature for Closed Loop Fuel Control', 'Qapalı döngə üçün soyuducu temperaturu kifayət deyil');
  X('P0130', 'O2 Sensor Circuit (Bank 1 Sensor 1)', 'Ön O2 sensoru dövrəsi (1-ci sıra)');
  X('P0131', 'O2 Sensor Circuit Low Voltage (B1S1)', 'Ön O2 sensoru: aşağı gərginlik');
  X('P0132', 'O2 Sensor Circuit High Voltage (B1S1)', 'Ön O2 sensoru: yüksək gərginlik');
  X('P0133', 'O2 Sensor Circuit Slow Response (B1S1)', 'Ön O2 sensoru: yavaş reaksiya');
  X('P0134', 'O2 Sensor Circuit No Activity Detected (B1S1)', 'Ön O2 sensoru: aktivlik yoxdur');
  X('P0135', 'O2 Sensor Heater Circuit (B1S1)', 'Ön O2 sensoru qızdırıcı dövrəsi');
  X('P0136', 'O2 Sensor Circuit (Bank 1 Sensor 2)', 'Arxa O2 sensoru dövrəsi (1-ci sıra)');
  X('P0137', 'O2 Sensor Circuit Low Voltage (B1S2)', 'Arxa O2 sensoru: aşağı gərginlik');
  X('P0138', 'O2 Sensor Circuit High Voltage (B1S2)', 'Arxa O2 sensoru: yüksək gərginlik');
  X('P0139', 'O2 Sensor Circuit Slow Response (B1S2)', 'Arxa O2 sensoru: yavaş reaksiya');
  X('P0140', 'O2 Sensor Circuit No Activity Detected (B1S2)', 'Arxa O2 sensoru: aktivlik yoxdur');
  X('P0141', 'O2 Sensor Heater Circuit (B1S2)', 'Arxa O2 sensoru qızdırıcı dövrəsi');
  X('P0174', 'System Too Lean (Bank 2)', 'Qarışıq çox kasıbdır (2-ci sıra)');
  X('P0175', 'System Too Rich (Bank 2)', 'Qarışıq çox zəngindir (2-ci sıra)');
  X('P0201', 'Injector Circuit/Open - Cylinder 1', '1-ci silindr injektor dövrəsi');
  X('P0202', 'Injector Circuit/Open - Cylinder 2', '2-ci silindr injektor dövrəsi');
  X('P0203', 'Injector Circuit/Open - Cylinder 3', '3-cü silindr injektor dövrəsi');
  X('P0204', 'Injector Circuit/Open - Cylinder 4', '4-cü silindr injektor dövrəsi');
  X('P0217', 'Engine Overtemperature Condition', 'Mühərrikin həddindən artıq qızması');
  X('P0301', 'Cylinder 1 Misfire Detected', '1-ci silindrdə yanma buraxma (misfire)');
  X('P0302', 'Cylinder 2 Misfire Detected', '2-ci silindrdə yanma buraxma (misfire)');
  X('P0303', 'Cylinder 3 Misfire Detected', '3-cü silindrdə yanma buraxma (misfire)');
  X('P0304', 'Cylinder 4 Misfire Detected', '4-cü silindrdə yanma buraxma (misfire)');
  X('P0325', 'Knock Sensor 1 Circuit', 'Detonasiya sensoru 1 dövrəsi');
  X('P0335', 'Crankshaft Position Sensor A Circuit', 'Dirsəkli val sensoru A dövrəsi');
  X('P0336', 'Crankshaft Position Sensor A Range/Performance', 'Dirsəkli val sensoru A: performans problemi');
  X('P0340', 'Camshaft Position Sensor A Circuit (Bank 1)', 'Paylayıcı val sensoru A dövrəsi');
  X('P0341', 'Camshaft Position Sensor A Range/Performance (Bank 1)', 'Paylayıcı val sensoru A: performans problemi');
  X('P0351', 'Ignition Coil A Primary/Secondary Circuit', 'Alışdırma sarğısı A dövrəsi (1-ci silindr)');
  X('P0352', 'Ignition Coil B Primary/Secondary Circuit', 'Alışdırma sarğısı B dövrəsi (2-ci silindr)');
  X('P0353', 'Ignition Coil C Primary/Secondary Circuit', 'Alışdırma sarğısı C dövrəsi (3-cü silindr)');
  X('P0354', 'Ignition Coil D Primary/Secondary Circuit', 'Alışdırma sarğısı D dövrəsi (4-cü silindr)');
  X('P0401', 'EGR Flow Insufficient Detected', 'EGR axını kifayət deyil');
  X('P0402', 'EGR Flow Excessive Detected', 'EGR axını həddindən çoxdur');
  X('P0430', 'Catalyst System Efficiency Below Threshold (Bank 2)', 'Katalizator səmərəliliyi həddən aşağıdır (2-ci sıra)');
  X('P0441', 'EVAP System Incorrect Purge Flow', 'EVAP sistemi: təmizləmə axını düzgün deyil');
  X('P0442', 'EVAP System Leak Detected (small leak)', 'EVAP sistemində kiçik sızma');
  X('P0443', 'EVAP Purge Control Valve Circuit', 'EVAP təmizləmə klapanı dövrəsi');
  X('P0446', 'EVAP Vent Control Circuit', 'EVAP ventilyasiya klapanı dövrəsi');
  X('P0455', 'EVAP System Leak Detected (large leak)', 'EVAP sistemində böyük sızma (yanacaq qapağını yoxlayın)');
  X('P0456', 'EVAP System Leak Detected (very small leak)', 'EVAP sistemində çox kiçik sızma');
  X('P0457', 'EVAP System Leak Detected (fuel cap loose/off)', 'EVAP sızması: yanacaq qapağı boşdur və ya yoxdur');
  X('P0480', 'Cooling Fan 1 Control Circuit', 'Soyutma ventilyatoru 1 idarəetmə dövrəsi');
  X('P0500', 'Vehicle Speed Sensor A', 'Avtomobil sürət sensoru A');
  X('P0505', 'Idle Control System Malfunction', 'Boş gediş nəzarət sisteminin nasazlığı');
  X('P0506', 'Idle Control System RPM Lower Than Expected', 'Boş gediş dövrü gözləniləndən aşağıdır');
  X('P0507', 'Idle Control System RPM Higher Than Expected', 'Boş gediş dövrü gözləniləndən yüksəkdir');
  X('P0562', 'System Voltage Low', 'Sistem gərginliyi aşağıdır');
  X('P0563', 'System Voltage High', 'Sistem gərginliyi yüksəkdir');
  X('P0601', 'Internal Control Module Memory Check Sum Error', 'ECU daxili yaddaş yoxlama xətası');
  X('P0700', 'Transmission Control System Malfunction', 'Transmissiya idarəetmə sisteminin nasazlığı');
  X('P0715', 'Input/Turbine Speed Sensor Circuit', 'Giriş/turbina sürət sensoru dövrəsi');
  X('P0730', 'Incorrect Gear Ratio', 'Yanlış ötürmə nisbəti');
  X('P0741', 'Torque Converter Clutch Circuit Performance or Stuck Off', 'Hidrotransformator blokirovka debriyajı problemi');
  X('P2096', 'Post Catalyst Fuel Trim System Too Lean (Bank 1)', 'Katalizatordan sonra yanacaq korreksiyası: çox kasıb (1-ci sıra)');
  X('P2097', 'Post Catalyst Fuel Trim System Too Rich (Bank 1)', 'Katalizatordan sonra yanacaq korreksiyası: çox zəngin (1-ci sıra)');
  X('P2101', 'Throttle Actuator Control Motor Circuit Range/Performance', 'Drossel idarəetmə motoru: performans problemi');
  X('P2106', 'Throttle Actuator Control System - Forced Limited Power', 'Drossel sistemi: məcburi məhdud güc rejimi');
  X('P2119', 'Throttle Actuator Control Throttle Body Range/Performance', 'Drossel korpusu: performans problemi');
  X('P2135', 'Throttle/Pedal Position Sensor A/B Voltage Correlation', 'Drossel/pedal sensorları A/B gərginlik uyğunsuzluğu');
  X('P2187', 'System Too Lean at Idle (Bank 1)', 'Boş gedişdə qarışıq çox kasıbdır (1-ci sıra)');
  X('P2188', 'System Too Rich at Idle (Bank 1)', 'Boş gedişdə qarışıq çox zəngindir (1-ci sıra)');
  X('U0100', 'Lost Communication With ECM/PCM A', 'Mühərrik idarəetmə bloku (ECM) ilə rabitə itib');
  X('U0101', 'Lost Communication With TCM', 'Transmissiya bloku (TCM) ilə rabitə itib');
  X('U0121', 'Lost Communication With ABS Control Module', 'ABS bloku ilə rabitə itib');
  X('U0140', 'Lost Communication With Body Control Module', 'Kuzov idarəetmə bloku (BCM) ilə rabitə itib');
  X('U0155', 'Lost Communication With Instrument Panel Cluster', 'Cihaz paneli ilə rabitə itib');

  var SYS = {
    f: ['Yanacaq və hava ölçmə sistemi', 'Fuel & air metering', ['Sensor və ya onun naqili', 'Havanın sızması (vakuum)', 'Yanacaq təzyiqi, injektor, filtr'], ['Əlaqəli sensorun canlı göstəricisini və yanacaq korreksiyalarını (STFT/LTFT) yoxlayın', 'Sensor kontaktlarını və naqili gözlə yoxlayın']],
    i: ['Alışdırma sistemi və ya misfire', 'Ignition / misfire', ['Şam və ya alışdırma sarğısı', 'Yanacaq və ya hava problemi', 'Kompressiya'], ['Hansı silindrdə olduğunu müəyyən edin', 'Şam və sarğıları yoxlayın']],
    e: ['Əlavə emissiya nəzarəti (EVAP, EGR, katalizator)', 'Auxiliary emission controls', ['Klapan, şlanq və ya sızma', 'Sensor nasazlığı', 'Yanacaq qapağı (EVAP üçün)'], ['Əlaqəli klapan, şlanq və birləşmələri yoxlayın', 'Digər kodlarla birlikdə qiymətləndirin']],
    s: ['Sürət, boş gediş və köməkçi girişlər', 'Speed / idle / auxiliary inputs', ['Sensor və ya naqil', 'Drossel çirkliliyi', 'Elektrik birləşmələri'], ['Boş gedişdə RPM sabitliyini izləyin', 'Əlaqəli sensor göstəricisini yoxlayın']],
    c: ['Kompüter və çıxış dövrələri', 'Computer / output circuits', ['Elektrik qidalanması və ya massa', 'Naqil', 'ECU problemi (nadir)'], ['Akkumulyator gərginliyini və massa nöqtələrini yoxlayın', 'ECU-nu dəyişməzdən əvvəl bütün digər səbəbləri istisna edin']],
    t: ['Transmissiya', 'Transmission', ['Yağ səviyyəsi və ya keyfiyyəti', 'Solenoid və ya sensor', 'Mexaniki problem'], ['Transmissiya yağının səviyyəsini yoxlayın', 'Hansı sürətdə baş verdiyini qeyd edin']],
    n: ['Şəbəkə rabitəsi (CAN)', 'Network communication', ['Akkumulyator gərginliyi', 'Naqil və ya kontakt', 'Nasaz blok'], ['Akkumulyatoru və qoruyucuları yoxlayın', 'Hansı blokla rabitənin itdiyini müəyyən edin']],
    b: ['Kuzov sistemləri (Body)', 'Body systems', ['Sensor və ya naqil', 'Elektrik kontaktları'], ['Əlaqəli sistemin konnektorlarını yoxlayın']],
    h: ['Şassi sistemləri (ABS, əyləc, sükan, asqı)', 'Chassis systems', ['Sensor və ya naqil', 'Hidravlik və ya mexaniki problem'], ['Əlaqəli təkər sensorunu və kontaktları yoxlayın']],
    o: ['Digər sistem', 'Other system', [], ['Servis məlumatına baxın']]
  };
  function fam(code) {
    var t = code[0], d1 = code[1], d3 = code[2], g = (d1 === '0' || (t === 'P' && d1 === '2'));
    var k;
    if (t === 'U') k = 'n'; else if (t === 'B') k = 'b'; else if (t === 'C') k = 'h';
    else if ('012'.indexOf(d3) >= 0) k = 'f'; else if (d3 === '3') k = 'i'; else if (d3 === '4') k = 'e';
    else if (d3 === '5') k = 's'; else if (d3 === '6') k = 'c'; else if ('789'.indexOf(d3) >= 0) k = 't'; else k = 'o';
    var s = SYS[k];
    var kind = g ? 'SAE ümumi kodu' : 'istehsalçıya xas kod';
    return {
      en: 'Code family: ' + s[1] + (g ? ' (generic)' : ' (manufacturer specific)'),
      az: 'Ailə üzrə ümumi izah: ' + s[0] + ' (' + kind + '). Dəqiq kod izahı bazada yoxdur, yoxlanmış məlumat deyil.',
      causes: s[2], symptoms: [], check: s[3], sensors: [], related: [], family: true
    };
  }
  window.DTC_DB = new Proxy(D, {
    get: function (target, prop) {
      if (typeof prop === 'string') {
        if (prop in target) return target[prop];
        var u = prop.toUpperCase();
        if (/^[PBCU][0-3][0-9A-F]{3}$/.test(u)) return target[u] || fam(u);
      }
      return Reflect.get(target, prop);
    }
  });
})();
