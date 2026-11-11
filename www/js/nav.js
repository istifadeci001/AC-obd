(function () {
  'use strict';
  var stack = [cur()], popping = false, presses = 0, timer = null;
  function cur() { return (location.hash || '#dashboard').slice(1) || 'dashboard'; }
  function toast(t) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:96px;z-index:70;padding:11px;border-radius:12px;font-size:13px;color:#fff;background:#1e293b;text-align:center;border:1px solid #334155';
    d.textContent = t;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1800);
  }
  window.addEventListener('hashchange', function () {
    if (popping) { popping = false; return; }
    var c = cur();
    if (stack[stack.length - 1] !== c) { stack.push(c); if (stack.length > 60) stack.shift(); }
  });
  function back() {
    var dr = document.getElementById('drawer');
    if (dr && dr.classList.contains('open')) { dr.classList.remove('open'); return; }
    var w = document.getElementById('welcome');
    if (w && w.style.display === 'flex') { w.style.display = 'none'; return; }
    if (stack.length > 1) {
      stack.pop();
      popping = true;
      setTimeout(function () { popping = false; }, 400);
      location.hash = '#' + stack[stack.length - 1];
      presses = 0;
      return;
    }
    presses++;
    clearTimeout(timer);
    timer = setTimeout(function () { presses = 0; }, 3000);
    if (presses >= 3) { try { window.CapApp.exitApp(); } catch (e) {} return; }
    toast('Çıxmaq üçün geri düyməsinə yenə ' + (3 - presses) + ' dəfə basın');
  }
  window.AppNav = { back: back };
  if (window.CapApp && window.CapApp.addListener) window.CapApp.addListener('backButton', back);
})();
