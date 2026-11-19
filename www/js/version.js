window.APP_VERSION = '1.6.0';
(function () {
  I18N.az.set_version_val = APP_VERSION;
  I18N.en.set_version_val = APP_VERSION;
  var e = document.getElementById('appver');
  if (e) e.textContent = APP_VERSION;
})();
