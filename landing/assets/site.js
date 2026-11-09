// theme toggle shared with landing + app (cookie on .feedarte.com)
(function () {
  var b = document.getElementById('theme-btn');
  if (!b) return;
  b.addEventListener('click', function () {
    var r = document.documentElement, light = r.getAttribute('data-theme') !== 'light';
    if (light) r.setAttribute('data-theme', 'light'); else r.removeAttribute('data-theme');
    var t = light ? 'light' : 'dark';
    try { localStorage.setItem('fa_theme', t); } catch (e) {}
    var d = location.hostname.slice(-12) === 'feedarte.com' ? '; domain=.feedarte.com' : '';
    document.cookie = 'fa_theme=' + t + '; path=/; max-age=31536000; samesite=lax' + d;
  });
})();
