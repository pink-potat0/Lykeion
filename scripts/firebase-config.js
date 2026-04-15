// Loads Firebase web config from GET /api/firebase-config (Vercel / local server env vars).
// Pages must be served from the same origin as the server (not file://).
(function () {
  var base =
    typeof window !== "undefined" && window.LYKEION_API_BASE
      ? String(window.LYKEION_API_BASE).replace(/\/$/, "")
      : "";
  window.__firebaseReadyPromise = fetch(base + "/api/firebase-config", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            throw new Error((body && body.error) || "Firebase config HTTP " + r.status);
          });
      }
      return r.json();
    })
    .then(function (config) {
      if (!config || !config.apiKey) {
        throw new Error("Firebase config missing apiKey.");
      }
      Object.keys(config).forEach(function (k) {
        if (config[k] === "") delete config[k];
      });
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
    });
})();
