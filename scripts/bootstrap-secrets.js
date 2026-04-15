(function (w) {
  w.LYKEION_SECRETS = Object.assign(
    { openai: "", helius: "", solanaTracker: "" },
    w.LYKEION_SECRETS || {}
  );
})(typeof globalThis !== "undefined" ? globalThis : window);
