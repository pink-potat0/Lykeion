// Fetches GET /api/lykeion-secrets and merges helius + solanaTracker into window.LYKEION_SECRETS (Vercel / .env).
// Sets window.__lykeionSecretsPromise — await this before reading LYKEION_SECRETS in inline scripts.
(function () {
  var base =
    typeof window !== "undefined" && window.LYKEION_API_BASE
      ? String(window.LYKEION_API_BASE).replace(/\/$/, "")
      : "";
  window.__lykeionSecretsPromise = fetch(base + "/api/lykeion-secrets", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (json) {
      if (json && typeof json === "object") {
        var patch = {};
        var h = String(json.helius || "").trim();
        var st = String(json.solanaTracker || "").trim();
        if (h) patch.helius = h;
        if (st) patch.solanaTracker = st;
        if (Object.keys(patch).length) {
          window.LYKEION_SECRETS = Object.assign(window.LYKEION_SECRETS || {}, patch);
        }
      }
    })
    .catch(function () {});
})();
