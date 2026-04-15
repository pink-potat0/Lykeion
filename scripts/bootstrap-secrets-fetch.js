// Fetches GET /api/lykeion-secrets and merges helius + solanaTracker into window.LYKEION_SECRETS (Vercel / .env).
// Sets window.__lykeionSecretsPromise — await this before reading LYKEION_SECRETS in inline scripts.
(function () {
  var base =
    typeof window !== "undefined" && window.LYKEION_API_BASE
      ? String(window.LYKEION_API_BASE).replace(/\/$/, "")
      : "";

  function mergeSecretsJson(json) {
    if (!json || typeof json !== "object") return;
    var patch = {};
    var h = String(json.helius || "").trim();
    var st = String(json.solanaTracker || "").trim();
    if (h) patch.helius = h;
    if (st) patch.solanaTracker = st;
    if (Object.keys(patch).length) {
      window.LYKEION_SECRETS = Object.assign(window.LYKEION_SECRETS || {}, patch);
    }
  }

  function fetchSecrets() {
    return fetch(base + "/api/lykeion-secrets", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) return {};
        return r.json();
      })
      .then(mergeSecretsJson);
  }

  // First load + one retry if Solana Tracker still missing (cold start / env race on Vercel).
  window.__lykeionSecretsPromise = fetchSecrets()
    .then(function () {
      var st = String((window.LYKEION_SECRETS && window.LYKEION_SECRETS.solanaTracker) || "").trim();
      if (!st) return fetchSecrets();
    })
    .catch(function () {});

  /** Call before search / migrated tab if keys might be stale. */
  window.refreshLykeionSecrets = function () {
    return fetchSecrets();
  };
})();
