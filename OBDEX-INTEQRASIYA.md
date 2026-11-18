# OBDex → AC OBD inteqrasiyası

Bu arxiv **layihənin kökünə açılır** (mövcud faylların üzərinə). Tətbiqin mühərrik kodu (obd.js, elm.js, ui-*.js ...) dəyişməyib.

## Nə hara düşür

| Fayl / qovluq | Nə üçün |
|---|---|
| `data/obdex/generic/*.json` | 9 533 DTC (B0, C0, P0, P2, P3, U0, U3), OBDex YAML-dan JSON-a çevrilmiş **mənbə** |
| `data/obdex/pids/mode01.json`, `mode09.json` | 119 Mode 01 + 13 Mode 09 PID məlumatı |
| `data/obdex/LICENSE-DATA` | OBDex məlumat lisenziyası (CC0-1.0) |
| `data/pid-az.json` | Yeni PID-lər üçün Azərbaycan adları (əlavə edə bilərsiniz) |
| `schema/code.schema.json`, `schema/pid.schema.json` | Məlumat sxemləri (yoxlama üçün) |
| `tools/validate-data.js` | Sxem + təkrar + əlaqəli kod yoxlaması (paket tələb etmir) |
| `tools/build-dtc.js` | **Əvəz olunur**: artıq internetdən yox, `data/obdex`-dən oxuyur |
| `tools/build-pids.js` | PID-lərdən `www/js/pid-data.js` yaradır |
| `tools/import-obdex.py` | Gələcəkdə OBDex yenilənəndə YAML→JSON çevirici (PyYAML) |
| `www/js/dtc-data.js` | Hazır DTC bazası (8,7 MB), `npm run build:data` ilə yenilənir |
| `www/js/pid-data.js`, `www/js/pid-extra.js` | Yeni PID dekoderləri (27 əlavə PID) |
| `www/index.html` | **Əvəz olunur**: yalnız 2 sətir əlavə (`pid-data.js`, `pid-extra.js`, `ui-tools.js`-dən sonra) |
| `package.json` | **Əvəz olunur**: `test`, `build:data`, `validate:data` skriptləri əlavə |
| `.github/workflows/build-apk.yml` | **Əvəz olunur**: yoxlama + testlər + oflayn DTC/PID build |
| `tests/obdex-tests.js` | 53 yeni test |

## GitHub-da addımlar
1. Arxivi repo kökünə aç (mövcud fayllar üzərinə yazılsın).
2. `git add . && git commit -m "OBDex oflayn baza" && git push`
3. Actions işə düşür: məlumatı yoxlayır → testlər → DTC/PID qurur → APK.
4. Local yoxlama: `npm test`.

Qeyd: `data/obdex/generic/P0xxx.json` ~12 MB, `P2xxx.json` ~11 MB-dır (GitHub limiti 100 MB, xəbərdarlıq 50 MB, problem yoxdur).

## Nə qoşulmayıb (və niyə)
- **YAML fayllar, `tools/*.mjs`, `.github/` (OBDex-in), sayt faylları**: tələb olunmadı.
- **34 çox-dəyərli PID** (O2 sensorları 14–1B, 24–2B, 34–3B, 55–58, 64, 66, 67, 78, 79, 9D): düsturları mətn şəklindədir (iki dəyər bir PID-də). Tətbiqin öz O2 modulu bunları artıq idarə edir. Yalnız ad/vahid kimi `PID_META`-da saxlanır.
- **Bitmap/enum PID-lər** (01, 1C, 4F və s.): dekoder yoxdur, yalnız ad.
- **Mode 09**: VIN və Calibration ID tətbiqdə artıq oxunur. CVN (06) və ECU adı (0A) məlumatı `PID_META['09:0A']` kimi hazırdır, amma oxuma funksiyası əlavə edilməyib (bu, `obd-extra.js`-ə toxunmaq tələb edər).
- **DTC tərcümələri**: İngilis dilindədir; tətbiqdəki tərcümə bölməsi (AI) istifadə olunur. Əl ilə yazılmış 6 Azərbaycan mətni qorunur.

## Davranış qeydləri
- Yeni 27 PID yalnız ECU həmin PID-i dəstəklədikdə canlı siyahıda görünür.
- Tətbiqdə artıq olan PID-lərin dekoderləri **dəyişmir** (testlə təsdiqlənib).
- İstifadəçinin fərdi PID-i yeni PID ilə eyni nömrədədirsə, fərdi olan üstündür; sonradan həmin nömrəyə fərdi PID əlavə etmək daxili PID kimi rədd olunur.
- Qiymət/təmir məlumatları ümumi (generic) təxminlərdir, istehsalçı məlumatı deyil.

## OBDex-i sonradan yeniləmək
```
python3 tools/import-obdex.py /yol/OBDex-main
npm run validate:data && npm run build:data && npm test
```
