// Copy to local-secrets.js (gitignored). In pages that need keys, add before bootstrap-secrets.js:
// <script src="../scripts/local-secrets.js"></script>
window.LYKEION_SECRETS = Object.assign({}, window.LYKEION_SECRETS || {}, {
  openai: "",
  helius: "",
  solanaTracker: "",
});
