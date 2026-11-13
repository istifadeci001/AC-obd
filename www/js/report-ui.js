(function () {
  var view = document.getElementById('view');
  if (!view || !window.Report) return;
  function add() {
    var c = (location.hash || '#dashboard').slice(1);
    if (c !== 'connect' && c !== 'live') return;
    if (document.getElementById('rp-msg')) return;
    var d = document.createElement('div');
    d.innerHTML = Report.card();
    view.appendChild(d);
  }
  new MutationObserver(add).observe(view, { childList: true });
  window.addEventListener('hashchange', function () { setTimeout(add, 50); });
  add();
})();
