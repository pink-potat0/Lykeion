// After /api/lykeion-secrets (via bootstrap-secrets-fetch.js), load lykeion-ai.js.
(function () {
  function loadLykeionAi() {
    var s = document.createElement("script");
    s.src = "../scripts/lykeion-ai.js";
    s.async = false;
    document.body.appendChild(s);
  }
  var p = window.__lykeionSecretsPromise || Promise.resolve();
  p.finally(loadLykeionAi);
})();
