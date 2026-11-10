// "Виникли питання?" — small Telegram help card, bottom-right, ~35 s after page load.
// Telegram handle comes from app admin settings (/api/auth/config → contactTelegram).
(function () {
  var KEY = 'fa_help_closed', HIDE_DAYS = 3, DELAY = 35000, FALLBACK = 'sergii_slon';
  try {
    var t = +localStorage.getItem(KEY);
    if (t && Date.now() - t < HIDE_DAYS * 864e5) return;
  } catch (e) {}
  var api = /feedarte\.com$/.test(location.hostname) ? 'https://app.feedarte.com/api/auth/config' : 'http://localhost:3000/api/auth/config';
  var handle = fetch(api).then(function (r) { return r.json(); }).then(function (c) { return c.contactTelegram || FALLBACK; }).catch(function () { return FALLBACK; });
  var css =
    '.fa-help{position:fixed;right:20px;bottom:20px;z-index:80;width:320px;max-width:calc(100vw - 32px);padding:18px 18px 16px;border:1px solid var(--line2);border-radius:14px;background:var(--bg2);color:var(--ink);box-shadow:0 24px 60px -18px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif;opacity:0;transform:translateY(16px);transition:opacity .35s ease,transform .35s ease}' +
    '.fa-help.in{opacity:1;transform:none}' +
    '.fa-help b{display:block;font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0 28px 6px 0}' +
    '.fa-help p{margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--ink2)}' +
    '.fa-help a{display:flex;align-items:center;justify-content:center;gap:8px;height:42px;border-radius:9px;background:#229ED9;color:#fff;font-size:14px;font-weight:500;text-decoration:none}' +
    '.fa-help a:hover{background:#1c8cc2}' +
    '.fa-help button{position:absolute;top:10px;right:10px;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--ink3);font-size:18px;line-height:1;cursor:pointer}' +
    '.fa-help button:hover{background:var(--panel);color:var(--ink)}' +
    '.fa-help .dot{position:absolute;top:-4px;left:-4px;width:12px;height:12px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--bg)}' +
    '@media (max-width:640px){.fa-help{right:16px;left:16px;bottom:16px;width:auto}}' +
    '@media (prefers-reduced-motion:reduce){.fa-help{transition:none}}';
  setTimeout(function () {
    handle.then(function (h) {
      var st = document.createElement('style');
      st.textContent = css;
      document.head.appendChild(st);
      var el = document.createElement('aside');
      el.className = 'fa-help';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Допомога в Telegram');
      var text = 'Привіт! Маю питання щодо Feedarte.';
      el.innerHTML =
        '<span class="dot"></span><button type="button" aria-label="Закрити">×</button>' +
        '<b>Виникли питання?</b><p>Напишіть нам у Telegram — допоможемо підключити фід і налаштувати каталог.</p>' +
        '<a target="_blank" rel="noopener" href="https://t.me/' + encodeURIComponent(h) + '?text=' + encodeURIComponent(text) + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.6 19.9c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.2-8.3c.4-.4-.1-.6-.6-.2L6 13.4l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4Z"/></svg>' +
        'Написати в Telegram</a>';
      function close() {
        el.classList.remove('in');
        setTimeout(function () { el.remove(); }, 400);
        try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      }
      el.querySelector('button').addEventListener('click', close);
      el.querySelector('a').addEventListener('click', close);
      document.body.appendChild(el);
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    });
  }, DELAY);
})();
