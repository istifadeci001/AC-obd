// NÜMUNƏ BAZA: yalnız 6 kod. Tam baza sonrakı mərhələdə idxal və əllə yoxlama ilə əlavə olunacaq.
window.DTC_DB = {
  P0420: {
    en: 'Catalyst System Efficiency Below Threshold (Bank 1)',
    az: 'Katalizator sisteminin səmərəliliyi həddən aşağıdır (1-ci sıra)',
    causes: ['Köhnəlmiş və ya zədələnmiş katalizator', 'Arxa O2 sensorunun nasazlığı', 'Egzoz sistemində sızma', 'Mühərrikdə misfire', 'Qarışığın uzun müddət çox zəngin və ya kasıb olması'],
    symptoms: ['Check Engine lampası', 'Yanacaq sərfiyyatının artması', 'Bəzən güc itkisi', 'Egzozdan qoxu'],
    check: ['Əvvəlcə misfire və yanacaq korreksiyasını (STFT/LTFT) yoxlayın', 'Egzoz sızmasını yoxlayın', 'Ön və arxa O2 sensorunun davranışını müqayisə edin', 'Yalnız bundan sonra katalizatoru qiymətləndirin'],
    sensors: ['O2 sensor (ön)', 'O2 sensor (arxa)', 'STFT / LTFT'],
    related: ['P0430', 'P0171', 'P0172', 'P0300']
  },
  P0300: {
    en: 'Random/Multiple Cylinder Misfire Detected',
    az: 'Təsadüfi və ya bir neçə silindrdə yanma buraxma (misfire) aşkarlandı',
    causes: ['Köhnə şam və ya alışdırma sarğısı', 'Havanın sızması (vakuum)', 'Yanacaq təchizatı problemi', 'Kompressiyanın aşağı olması', 'EGR və ya digər klapan problemləri'],
    symptoms: ['Mühərrik titrəyir', 'Boş gedişdə qeyri-bərabər işləmə', 'Güc itkisi', 'Check Engine lampası (yanıb-sönə bilər)'],
    check: ['Freeze Frame-də RPM, yük, temperaturu yoxlayın', 'Şam və sarğıları yoxlayın', 'Vakuum sızmasını yoxlayın', 'Yanacaq korreksiyalarına baxın'],
    sensors: ['Crankshaft sensor', 'MAF / MAP', 'STFT / LTFT'],
    related: ['P0301', 'P0302', 'P0303', 'P0304', 'P0171']
  },
  P0171: {
    en: 'System Too Lean (Bank 1)',
    az: 'Qarışıq çox kasıbdır (1-ci sıra)',
    causes: ['Havanın sızması (vakuum şlanqları, giriş kollektoru)', 'MAF sensorunun çirklənməsi', 'Yanacaq təzyiqinin aşağı olması', 'Tıxanmış injektorlar', 'Egzoz sızması O2 sensorundan əvvəl'],
    symptoms: ['Güc itkisi', 'Qeyri-bərabər boş gediş', 'Gec işə düşmə'],
    check: ['LTFT və STFT-nin boş gedişdə və yüksək RPM-də fərqini müqayisə edin', 'Vakuum sızmasını yoxlayın', 'MAF göstəricisini real şəraitlə müqayisə edin'],
    sensors: ['MAF', 'MAP', 'O2 sensor', 'STFT / LTFT'],
    related: ['P0172', 'P0174', 'P0101', 'P0300']
  },
  P0172: {
    en: 'System Too Rich (Bank 1)',
    az: 'Qarışıq çox zəngindir (1-ci sıra)',
    causes: ['Çirkli və ya nasaz MAF sensoru', 'İnjektorun sızması', 'Yanacaq təzyiqinin yüksək olması', 'Havanın az daxil olması (tıxanmış hava filtri)', 'O2 sensorunun nasazlığı'],
    symptoms: ['Yanacaq sərfiyyatı artır', 'Egzozdan qara tüstü və ya yanacaq qoxusu', 'Qeyri-bərabər boş gediş'],
    check: ['STFT və LTFT mənfi tərəfə gedirmi yoxlayın', 'Hava filtrini yoxlayın', 'MAF göstəricilərini yoxlayın'],
    sensors: ['MAF', 'O2 sensor', 'Fuel pressure', 'STFT / LTFT'],
    related: ['P0171', 'P0175', 'P0101']
  },
  P0101: {
    en: 'Mass Air Flow (MAF) Circuit Range/Performance',
    az: 'Hava kütləsi sensoru (MAF) diapazondan və ya gözlənilən performansdan kənardır',
    causes: ['Çirklənmiş MAF sensoru', 'Giriş sistemində hava sızması', 'Tıxanmış hava filtri', 'Elektrik birləşmə problemi'],
    symptoms: ['Güc itkisi', 'Qeyri-bərabər boş gediş', 'Yanacaq sərfiyyatının dəyişməsi'],
    check: ['MAF qiymətini boş gedişdə və yüksək RPM-də izləyin', 'MAP, gaz və yük ilə müqayisə edin', 'Hava sızmasını yoxlayın'],
    sensors: ['MAF', 'MAP', 'Throttle position', 'Engine load'],
    related: ['P0171', 'P0172', 'P0102', 'P0103']
  },
  P0128: {
    en: 'Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)',
    az: 'Soyuducu mayenin temperaturu termostatın açılma temperaturundan aşağıdır',
    causes: ['Termostatın açıq qalması', 'Soyutma mayesi temperatur sensorunun nasazlığı', 'Soyuducu mayenin səviyyəsinin aşağı olması'],
    symptoms: ['Mühərrik gec qızır', 'Qızdırıcıdan zəif istilik', 'Yanacaq sərfiyyatının artması'],
    check: ['Soyuq startdan sonra temperaturun artım sürətini izləyin', 'Normal iş temperaturuna çatıb-çatmadığını yoxlayın', 'Maye səviyyəsini yoxlayın'],
    sensors: ['Coolant temperature'],
    related: ['P0115', 'P0116', 'P0117']
  }
};
