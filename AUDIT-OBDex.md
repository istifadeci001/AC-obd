# AC OBD + OBDex: audit qeydləri (avtomatik yoxlama nəticəsi, real avtomobil yoxlaması DEYİL)

## 1. OBDex məlumatı düzgün import olunub?
- 9 533 kod, təkrar yox, yanlış format yox, sınıq əlaqə yox; `data/obdex/generic/*.json` yüklənmiş `generic.json` ilə eynidir.
- Tətbiqin real `DTC_DB` axtarışı ilə 9 533 kodun hamısı tapılır (böyük/kiçik hərf fərqi yox).
- Başlıqlar 100% eynidir. 93 əl ilə yazılmış Azərbaycan girişi qorunur (merge `own` qaydası).
- Qeyd: `P0FFF` kodunda bayraq və səbəb yoxdur (OBDex-in özündə belədir).

## 2. DTC axtarışında məlumat itkisi VAR (tətbiqin öz çevirmə qaydaları ilə)
| Sahə | İtki |
|---|---|
| Təsvir (description) | **9 531 / 9 533 kod 380 simvola kəsilir.** Orta uzunluq 743 simvoldur, yəni mətnin təxminən yarısı düşür. Kəsmə cümlə sonunda edilir. |
| Simptomlar | 20 kodda 5-ci simptom düşür (təhlükəsizlik qeydləri düşmür). |
| Əlaqəli kodlar | 39 kodda 8-dən artıq olanlar düşür. |
| Mənbə (sources) | Yalnız birinci URL saxlanır (hamısında). |
| Almanca mətn, təmir xərci/saat | Mənbə JSON-da var, tətbiqin bazasına düşmür. |
Tam təsvirlər (limit 1200) üçün bazanın təsvir hissəsi 3,5 MB-dan 6,8 MB-a çıxır (`dtc-data.js` ≈ 12 MB). Limit `tools/build-dtc.js`-də `cut(..., 380)` sətrindədir.

## 3. PID dekoderləri
- 27 yeni PID, 54 000 təsadüfi bayt kombinasiyası ilə SAE J1979 üzrə **mənim əllə yazdığım** istinadla müqayisə edildi: 0 uyğunsuzluq. (İstinad rəsmi standart sənədi deyil, mənim biliyimdir; real ECU ilə təsdiq lazımdır.)
- **OBDex məlumatında səhv tapıldı:** PID 32 düsturu `((256A+B)/4) − 8192` verir; tətbiqin öz dekoderi (işarəli 16-bit / 4, J1979-a uyğun) fərqli nəticə verir (məs. `55 48` → tətbiq 5458 Pa, OBDex −2734 Pa). Tətbiqin öz PID-ləri üstün olduğu üçün OBDex-in bu düsturu **istifadə olunmur**. Bu, "tətbiqdə olan PID-ləri əvəz etmə" qaydasının niyə vacib olduğunu göstərir.
- Digər mövcud dekoderlər OBDex düsturları ilə uyğundur (14 505 nümunə).

## 4. Mövcud modullara təsir
Orijinaldan fərqlənən mövcud fayllar yalnız bunlardır: `tools/build-dtc.js`, `.github/workflows/build-apk.yml`, `package.json`, `www/js/dtc-data.js` (stub → baza), `www/index.html` (+2 sətir). `obd.js`, `elm.js`, `pids.js`, `ui-*.js`, `session.js`, `livediag.js`, `o2diag.js` və digərləri bayt-bayt eynidir.
Davranış təsiri: ECU-nun dəstəklədiyi 27 yeni PID canlı siyahıda görünür; "ECU dəstəkləmir" siyahısı da uzanır (session.js hesabatında).

## 5. Testlər nəyi yoxlayır
- `tests/run.js` (97): real modulları vm-də işlədir, adapter **skriptlə simulyasiya olunur** (hazır cavab sətirləri). Real funksiya yollarını yoxlayır, amma real ECU, vaxt, multi-frame, protokol fərqləri, adapter xüsusiyyətləri yoxdur.
- `tests/obdex-tests.js` (53): məlumatın quruluşu, DTC lookup, PID düsturlarının hesabı, yükləmə sırası, validatorun xətanı tutması. **Real avtomobili və telefonda performansı yoxlamır.**
- Yoxlanmayıb: 9 533 kodla telefonda açılış vaxtı/yaddaş; ui-dtc ekranının böyük bazada görünüşü; yeni PID-lərin real ECU cavabı.

## 6. KW903 ilə avtomobildə yoxlama siyahısı
1. Qoşul, VIN/Calibration ID oxu; "ECU dəstəkləyir" PID siyahısını yaz.
2. Yeni PID-lərdən ECU-nun dəstəklədiklərini canlı aç (məs. 21, 31, 4D, 4E, 5A, 61, 62, 84, A6); qiymətləri başqa skaner/cihaz göstəricisi ilə müqayisə et (odometr, məsafə, vaxt sayğacları xüsusilə).
3. Olmayan PID-də "NO DATA" davranışı: tətbiq donmamalı.
4. DTC oxu: saxlanılan/gözləyən kod üçün başlıq, təsvir, səbəblər, əlaqəli kodlar düzgün görünürmü.
5. Köhnə PID-lərin (0C, 0D, 05, 06/07, 10, 11, 42) dəyərləri əvvəlki kimi qalıb?
6. Telefonda: ilk açılış vaxtı, DTC axtarışı, yaddaş/çökmə.
