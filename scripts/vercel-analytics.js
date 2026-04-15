(function () {
  if (typeof window === 'undefined') return;
  window.va =
    window.va ||
    function () {
      (window.vaq = window.vaq || []).push(arguments);
    };
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;
  var el = document.createElement('script');
  el.defer = true;
  // Hosted bundle works when the app is served entirely through Express/Vercel serverless (no local /_vercel/insights/script.js).
  el.src = 'https://va.vercel-scripts.com/v1/script.js';
  document.head.appendChild(el);
})();
