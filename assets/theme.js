/* Shared light/dark toggle. The <head> of each page sets data-theme
   before paint; this only wires the button and keeps it labelled. */
(function () {
  var KEY = 'indi_theme';
  var root = document.documentElement;

  // Light is the default for anyone who has not chosen: no data-theme
  // attribute means light, and the OS preference is not consulted.
  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function label(btn) {
    var next = current() === 'dark' ? 'LIGHT' : 'DARK';
    var span = btn.querySelector('[data-theme-label]');
    if (span) span.textContent = next;
    btn.setAttribute('aria-label', 'Switch to ' + next.toLowerCase() + ' theme');
  }
  function init() {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    Array.prototype.forEach.call(btns, function (btn) {
      label(btn);
      btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        Array.prototype.forEach.call(btns, label);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
