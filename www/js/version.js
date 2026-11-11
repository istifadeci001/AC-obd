window.APP_VERSION = '1.3.0';
(function () {
  I18N.az.set_version_val = APP_VERSION + ' — Mərhələ 5';
  I18N.en.set_version_val = APP_VERSION + ' — Phase 5';
  var e = document.getElementById('appver');
  if (e) e.textContent = APP_VERSION;
})();
