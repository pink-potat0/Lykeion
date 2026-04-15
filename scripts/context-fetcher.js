const COURSE_FILE_PATH = "/pages/lycuem-course";
let courseTextCache = "";

function needsFreshContext(query) {
  const text = String(query || "").toLowerCase();
  return /(latest|today|current|recent|news|update|2025|2026|now|this week|right now)/.test(text);
}

function isFactualLookupQuery(query) {
  const text = String(query || "").toLowerCase().trim();
  if (!text) return false;
  return /^(what is|who is|what are|who are|are you familiar with|tell me about|explain)\b/.test(text);
}

function shouldFetchFreshContext(query) {
  return needsFreshContext(query) || isFactualLookupQuery(query);
}

function looksLikeKnowledgeCutoffReply(reply) {
  const text = String(reply || "").toLowerCase();
  return (
    text.includes("as of my last knowledge") ||
    text.includes("knowledge cutoff") ||
    text.includes("i'm not specifically familiar") ||
    text.includes("i'm not familiar") ||
    text.includes("i do not have real-time")
  );
}

async function getCourseText() {
  if (courseTextCache) return courseTextCache;
  try {
    const response = await fetch(COURSE_FILE_PATH, { cache: "no-store" });
    if (!response.ok) return "";
    const html = await response.text();
    const plain = html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[`"'{}[\]();=]/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    courseTextCache = plain;
    return courseTextCache;
  } catch {
    return "";
  }
}

function getQueryKeywords(query) {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "at", "with",
    "is", "are", "was", "were", "it", "this", "that", "be", "as", "i", "you",
    "me", "my", "your", "can", "could", "would", "should", "give", "list",
    "show", "tell", "about", "what", "who", "how", "do", "does", "did", "from",
  ]);
  return String(query || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function extractBestCourseSnippet(courseText, query) {
  if (!courseText) return "";
  const keywords = getQueryKeywords(query);
  if (keywords.length === 0) return "";

  const sentences = courseText
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s && s.length > 40 && s.length < 280);
  if (sentences.length === 0) return "";

  const scored = sentences
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      let score = 0;
      for (let i = 0; i < keywords.length; i += 1) {
        if (lower.includes(keywords[i])) score += 1;
      }
      return { sentence, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return "";
  return scored.slice(0, 5).map((item) => `- ${item.sentence}`).join("\n");
}

async function fetchCourseContext(query, forceFetch) {
  const maybeTradingToolsIntent =
    /terminal|terminals|bot|bots|tool|tools|platform|platforms|trade|trading/i.test(String(query || ""));
  if (!forceFetch && !isFactualLookupQuery(query) && !maybeTradingToolsIntent) return "";
  const courseText = await getCourseText();
  return extractBestCourseSnippet(courseText, query);
}

async function _fetchMarketSnapshot() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
  );
  if (!res.ok) return "";
  const market = await res.json();
  const parts = [
    market.solana ? `SOL ${formatUsd(market.solana.usd)} (${Number(market.solana.usd_24h_change || 0).toFixed(2)}% 24h)` : null,
    market.bitcoin ? `BTC ${formatUsd(market.bitcoin.usd)} (${Number(market.bitcoin.usd_24h_change || 0).toFixed(2)}% 24h)` : null,
    market.ethereum ? `ETH ${formatUsd(market.ethereum.usd)} (${Number(market.ethereum.usd_24h_change || 0).toFixed(2)}% 24h)` : null,
  ].filter(Boolean);
  return parts.length ? `Market snapshot: ${parts.join(" | ")}` : "";
}

async function _fetchDDGSummary(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const web = await res.json();
  return web && typeof web.AbstractText === "string" && web.AbstractText.trim()
    ? `Web summary: ${web.AbstractText.trim()}`
    : "";
}

async function _fetchWikiSummary(query) {
  const topic = String(query || "")
    .replace(/^(what is|who is|what are|who are|are you familiar with|tell me about|explain)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
  if (!topic) return "";
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
  if (!res.ok) return "";
  const wiki = await res.json();
  return wiki && typeof wiki.extract === "string" && wiki.extract.trim()
    ? `Wikipedia summary: ${wiki.extract.trim()}`
    : "";
}

async function fetchFreshContext(query, forceFetch) {
  if (!forceFetch && !shouldFetchFreshContext(query)) return "";

  const results = await Promise.allSettled([
    _fetchMarketSnapshot(),
    _fetchDDGSummary(query),
    _fetchWikiSummary(query),
  ]);

  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value)
    .join("\n");
}
