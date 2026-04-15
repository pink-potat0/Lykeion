const SOLANA_ASSISTANT_SYSTEM_PROMPT = `You are Lykeion Assistant, the official AI for the Lykeion app. You are a Solana-focused cryptocurrency chat assistant. When asked your name or identity, say you are Lykeion Assistant. Provide accurate, clear answers to any questions about cryptocurrency, the Solana blockchain, or trading Solana ecosystem tokens, including Solana memecoins. Explain complex concepts in simple terms, offering educational guidance on Solana-specific topics and memecoin trading strategies.

For multi-part or complex queries, use step-by-step reasoning before delivering your answers. Always prioritize accuracy, transparency, and up-to-date knowledge. If recent context is provided in the prompt, treat it as higher-priority than older internal knowledge. If you are unsure, clearly say so instead of guessing. If you encounter unclear or ambiguous queries, ask clarifying questions as needed before answering. Continue assisting or follow up with the user until their objectives are fully met.

Instructions:
- Prioritize reasoning, explanation, and transparency prior to making any conclusions or recommendations.
- When teaching memecoin trading on Solana:
  - Clearly explain terminology, risks, and mechanics.
  - Illustrate processes step-by-step.
  - Use examples with placeholders like [example token], [trade amount], or [DEX name] for processes or trade examples.
- Avoid providing investment advice or making specific financial recommendations.
- Respect all constants, user guidelines, and training data timeframes/limitations.
- If external context is provided, do not answer with a knowledge-cutoff disclaimer. Use the context and clearly state uncertainty only for missing details.

Output Format:
- Default to concise answers. Keep it short unless the user asks for detail.
- If the user asks for a list (for example "give me 3"), respond as a compact numbered list with no long intro.
- Provide clear, concise, and educational responses.
- Use markdown formatting for clarity: bullets, numbered lists, section headings, and examples as needed.
- For step-by-step guides or explanations, use ordered or unordered lists.
- Use placeholders [like this] for generalizable examples.
- Keep responses conversational and accessible, suitable for both beginners and experienced users.`;

// Keys must not live in source control. Set window.LYKEION_SECRETS before this script loads, e.g. via a small gitignored local script, or use the Node server + OPENAI_API_KEY in .env for chat.
const OPENAI_API_KEY = (typeof window !== "undefined" && window.LYKEION_SECRETS && String(window.LYKEION_SECRETS.openai || "").trim()) || "";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEXSCREENER_API_BASE = "https://api.dexscreener.com/latest/dex";

function getHeliusKey() {
  return (typeof window !== "undefined" && window.LYKEION_SECRETS && String(window.LYKEION_SECRETS.helius || "").trim()) || "";
}

/** Public mainnet RPCs only — use for getBalance so balance works even if Helius RPC misbehaves. */
const PUBLIC_SOLANA_RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
];

function getSolanaRpcEndpoints() {
  const k = getHeliusKey();
  return [
    ...(k ? [`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(k)}`] : []),
    ...PUBLIC_SOLANA_RPC_ENDPOINTS,
  ];
}

async function solanaRpcCallPublic(method, params) {
  let lastError = null;
  for (const endpoint of PUBLIC_SOLANA_RPC_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "lykeion-wallet-pub",
          method,
          params,
        }),
      });
      if (!res.ok) {
        lastError = new Error(`RPC failed (${res.status})`);
        continue;
      }
      const data = await res.json();
      if (data?.error) {
        lastError = new Error(data.error?.message || "RPC error");
        continue;
      }
      return data?.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All public RPC endpoints failed");
}
const SOL_MINT = "So11111111111111111111111111111111111111112";
const HOT_TOKEN_MIN_MARKETCAP_USD = 100000;
const HOT_TOKEN_MIN_VOLUME_USD = 50000;
const HOT_TOKEN_MIN_LIQUIDITY_USD = 20000;

let currentUserId = null;
const conversationHistory = []; // {role: "user"|"assistant", content: string}

function normalizeTokenAddress(value) {
  return String(value || "")
    .trim()
    .replace(/^[^\w]+|[^\w]+$/g, "");
}

function uniqueNonEmpty(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function extractTokenAddressCandidates(text) {
  const source = String(text || "");
  const matches = source.match(/[1-9A-HJ-NP-Za-km-z]{32,64}/g) || [];
  const uniq = uniqueNonEmpty(matches.map(normalizeTokenAddress));
  // Prefer longest match (full Solana pubkey ~43–44 chars; avoids wrong 32-char substrings).
  uniq.sort((a, b) => b.length - a.length);
  return uniq;
}

function extractTokenAddress(text) {
  return extractTokenAddressCandidates(text)[0] || "";
}

function extractTickerCandidates(text) {
  const source = String(text || "");
  const candidates = [];
  const dollarMatches = source.match(/\$([a-zA-Z0-9]{2,12})\b/g) || [];
  dollarMatches.forEach((item) => candidates.push(item.replace("$", "").toUpperCase()));

  const atMatches = source.match(/@([a-zA-Z0-9]{2,12})\b/g) || [];
  atMatches.forEach((item) => candidates.push(item.replace("@", "").toUpperCase()));

  const keywordRegex = /\b(?:token|coin|ticker|symbol)\s*:?\s*([a-zA-Z0-9]{2,12})\b/gi;
  let keywordMatch = keywordRegex.exec(source);
  while (keywordMatch) {
    candidates.push(String(keywordMatch[1]).toUpperCase());
    keywordMatch = keywordRegex.exec(source);
  }

  const plain = source.trim();
  if (/^[a-zA-Z0-9]{2,12}$/.test(plain)) candidates.push(plain.toUpperCase());

  return uniqueNonEmpty(candidates);
}

function extractTickerSymbol(text) {
  return extractTickerCandidates(text)[0] || "";
}

function isLaunchpadVolumeIntent(userMessage) {
  const text = String(userMessage || "").toLowerCase();
  const explicitLaunchpadVolume =
    /\b(launchpad|launchpads)\b/.test(text) &&
    /\b(volume|stats|top|trenches)\b/.test(text) &&
    /\bsolana\b/.test(text);
  const trenchVolumePrompt = /\b(trenches|trench)\b.*\b(volume|stats|market)\b|\b(volume|stats|market)\b.*\b(trenches|trench)\b/.test(text);
  const marketPulsePrompt = /\b(how is|what is|show me)\b.*\b(market|volume)\b.*\b(today|now|right now)?\b/.test(text);
  const mentionsLaunchpads = /\b(pumpfun|pump\.fun|pump|bags|bags\.fm|bonk|letsbonk)\b/.test(text);
  return explicitLaunchpadVolume || trenchVolumePrompt || marketPulsePrompt || mentionsLaunchpads;
}

function normalizeLaunchpadName(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  if (
    raw === "pump" || raw === "pumpfun" || raw === "pump.fun" ||
    raw.includes("pump") || raw.includes("pumpswap")
  ) return "pumpfun";
  if (
    raw === "letsbonk" || raw === "bonk" ||
    raw.includes("bonk") || raw.includes("letsbonk")
  ) return "bonk";
  if (
    raw === "bags" || raw === "bagsfm" || raw === "bags.fm" ||
    raw.includes("bags")
  ) return "bags";
  return raw;
}

function getRequestedLaunchpadsFromPrompt(userMessage) {
  const text = String(userMessage || "").toLowerCase();
  const requested = [];
  const candidates = ["pumpfun", "pump.fun", "pump", "bags", "bags.fm", "bonk", "letsbonk"];
  for (const item of candidates) {
    if (text.includes(item)) {
      const normalized = normalizeLaunchpadName(item);
      if (normalized && !requested.includes(normalized)) requested.push(normalized);
    }
  }
  return requested;
}

function isTokenLookupIntent(userMessage) {
  if (isWalletAnalysisIntent(userMessage)) return false;
  return extractTokenAddressCandidates(userMessage).length > 0;
}

function isWalletAnalysisIntent(userMessage) {
  const text = String(userMessage || "").toLowerCase();
  const hasAddress = extractTokenAddressCandidates(text).length > 0;
  const hasWalletWord = /\b(wallet|walet|wlalet|walllet|address|addy|ca)\b/.test(text);
  const hasAnalysisWords =
    /\b(analy[sz]e|analysis|profit|pnl|balance|trade|trades|tx|transactions|winrate|roi|performance|history)\b/.test(text);
  const hasCommandStyle =
    /\b(check|scan|review|inspect|breakdown|lookup|track|watch|show|read)\b/.test(text);
  const walletPromptPatterns = [
    /\b(check|scan|analy[sz]e|review|inspect)\s+(this\s+)?(wallet|walet|wlalet|walllet)\b/,
    /\b(wallet|walet|wlalet|walllet)\s+(analysis|breakdown|check|scan|review)\b/,
    /\b(pnl|profit|balance|top\s*trades|trades|tx|transactions)\s+(for|of)\s+(this\s+)?(wallet|address)\b/,
    /\bwhat(?:'s| is)\s+(in|inside)\s+(this\s+)?(wallet|address)\b/,
    /\bhow\s+(is|did)\s+(this\s+)?(wallet|address)\s+(doing|perform|performed)\b/,
  ];
  const matchesWalletPattern = walletPromptPatterns.some((rx) => rx.test(text));

  // Strong routing rule: if user supplied a Solana address and the message looks wallet-ish,
  // force wallet analysis instead of token lookup.
  return (
    (hasAddress && (hasWalletWord || hasAnalysisWords || hasCommandStyle || matchesWalletPattern)) ||
    (hasWalletWord && (hasAnalysisWords || hasCommandStyle || matchesWalletPattern))
  );
}

function isHotTokensIntent(userMessage) {
  const text = String(userMessage || "").toLowerCase();
  const hasHotWords = /\b(hot|trending|trend|top|rank)\b/.test(text);
  const hasTokenWords = /\b(token|tokens|coins|coin)\b/.test(text);
  const hasSolana = /\bsolana|sol\b/.test(text);
  const mentionsWindow = /\b(24h|24 hr|24 hour|today|right now|rn|new)\b/.test(text);
  return (hasHotWords && hasTokenWords && hasSolana) || (hasTokenWords && hasSolana && mentionsWindow);
}

function isCapabilitiesIntent(userMessage) {
  const text = String(userMessage || "").toLowerCase().trim();
  if (!text) return false;
  return (
    /\bwhat can you do\b/.test(text) ||
    /\bwhat do you do\b/.test(text) ||
    /\bhelp me\b/.test(text) ||
    /\byour features\b/.test(text) ||
    /\bhow can you help\b/.test(text) ||
    /\bcommands\b/.test(text)
  );
}

function isNameIntent(userMessage) {
  const text = String(userMessage || "").toLowerCase().trim();
  return (
    /\bwhat is your name\b/.test(text) ||
    /\bwhat's your name\b/.test(text) ||
    /\bwho are you\b/.test(text) ||
    /^\s*your name\??\s*$/.test(text)
  );
}

function getCapabilitiesResponse() {
  return (
    "I can answer general Solana questions and also run these in-app features:\n\n" +
    "1. Solana Q&A: ask about wallets, trading terms, DEXs, memecoins, and blockchain concepts.\n" +
    "2. Token lookup by CA: send a Solana contract address and I return a token card with price, market cap, volume, links, and actions.\n" +
    "3. Live price widget: ask for prices like BTC, ETH, SOL, XRP, BNB, DOGE, TRX, USDT, USDC, and HYPE.\n" +
    "4. Wallet PnL analysis card: send a wallet address to get balance, 7D net PnL, and top token trades.\n" +
    "5. Bubble map shortcut: token cards include a Bubble Map button for holder-structure view.\n\n" +
    "Try: \"what is this token <ca>\", \"analyze wallet <address>\", \"price of SOL\", or any Solana question."
  );
}

function parseUsdNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatCompactUsd(value) {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsdPrecise(value) {
  if (!Number.isFinite(value)) return "N/A";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs >= 1) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (abs >= 0.01) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  }
  if (abs >= 0.000001) {
    return `$${value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  return `$${value.toExponential(4)}`;
}

function formatLaunchpadName(pair, pump) {
  if (pump) return "pump.fun";
  const raw = String(pair?.dexId || "").trim().toLowerCase();
  if (!raw) return "N/A";
  if (raw === "raydium") return "Raydium";
  if (raw === "meteora") return "Meteora";
  if (raw === "orca") return "Orca";
  if (raw.includes("pump")) return "pump.fun";
  if (raw.includes("jupiter")) return "Jupiter";
  return raw;
}

function extractReadableLore(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length > 40)
    .filter((line) => line.length < 280)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^(title:|url source:|markdown content:)/i.test(line))
    .filter((line) => !/^(home|login|sign up|privacy policy|terms of service)$/i.test(line));
  if (!lines.length) return "";
  return lines.slice(0, 5).join(" ");
}

async function fetchLoreFromWebLinks(links, tokenName, tokenSymbol, tokenAddress) {
  const urls = (Array.isArray(links) ? links : [])
    .map((item) => ({
      url: String(item?.url || "").trim(),
      label: String(item?.label || "Website").trim(),
    }))
    .filter((item) => item.url)
    .slice(0, 5);

  const sourcePriority = {
    "Twitter/X": 1,
    Telegram: 2,
    Instagram: 3,
    Discord: 4,
    Website: 5,
  };
  urls.sort((a, b) => (sourcePriority[a.label] || 99) - (sourcePriority[b.label] || 99));

  const sourceSnippets = [];
  for (const source of urls) {
    try {
      const proxied = `https://r.jina.ai/http://${source.url.replace(/^https?:\/\//i, "")}`;
      const res = await fetch(proxied);
      if (!res.ok) continue;
      const text = await res.text();
      const lore = extractReadableLore(text);
      if (lore) sourceSnippets.push(`[${source.label}] ${lore}`);
      if (sourceSnippets.length >= 3) break;
    } catch {}
  }

  if (sourceSnippets.length) {
    return sourceSnippets.join("\n");
  }
  return "";
}

async function polishLoreWithAI(rawLore, tokenName, tokenSymbol) {
  const input = String(rawLore || "").trim();
  if (!input) return "";
  try {
    const messages = [
      {
        role: "system",
        content:
          "You rewrite token lore strictly from provided linked-post snippets. " +
          "Output exactly 1-2 concise sentences. " +
          "Use only facts present in snippets; do not add outside info or assumptions. " +
          "If snippets are weak, say: 'Not enough clear details from linked posts.'",
      },
      {
        role: "user",
        content:
          `Token: ${tokenName || "Unknown"} (${tokenSymbol || "N/A"})\n\n` +
          `Raw source snippets:\n${input}\n\n` +
          "Return only the final 1-2 sentence lore text.",
      },
    ];
    const polished = await requestOpenAIReply(messages);
    return polished || input;
  } catch {
    return input;
  }
}

function dedupePairs(pairs) {
  const seen = new Set();
  const result = [];
  for (const pair of pairs || []) {
    const key = String(pair?.pairAddress || `${pair?.dexId || ""}:${pair?.baseToken?.address || ""}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(pair);
  }
  return result;
}

function addressesEqual(a, b) {
  return String(a || "").trim() === String(b || "").trim();
}

function filterPairsByTokenAddress(pairs, tokenAddress) {
  if (!tokenAddress) return pairs || [];
  return (pairs || []).filter((pair) =>
    addressesEqual(pair?.baseToken?.address, tokenAddress) ||
    addressesEqual(pair?.quoteToken?.address, tokenAddress)
  );
}

function toNumeric(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function pairCreatedWithinHours(pair, hours) {
  const created = toNumeric(pair?.pairCreatedAt);
  if (!created) return false;
  const ageMs = Date.now() - created;
  return ageMs >= 0 && ageMs <= hours * 60 * 60 * 1000;
}

async function fetchLaunchpadVolumeWidgetData(userMessage) {
  const requested = getRequestedLaunchpadsFromPrompt(userMessage);
  const launchpadOrder = requested.length ? requested : ["pumpfun", "bags", "bonk"];

  const sourceQueryByLaunchpad = {
    pumpfun: "pump.fun",
    bags: "bags",
    bonk: "letsbonk",
  };

  function formatChangePercent(current, previous) {
    const cur = toNumeric(current);
    const prev = toNumeric(previous);
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return "N/A";
    const pct = ((cur - prev) / prev) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
  }

  function formatCountCompact(value) {
    const num = toNumeric(value);
    if (!num) return "0";
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  }

  function getSnapshotStore() {
    try {
      const raw = localStorage.getItem("lykeion_trench_snapshots_v1") || localStorage.getItem("lyceum_trench_snapshots_v1");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeSnapshotStore(store) {
    try {
      localStorage.setItem("lykeion_trench_snapshots_v1", JSON.stringify(store.slice(-60)));
    } catch {}
  }

  function pickPreviousSnapshot(history) {
    if (!Array.isArray(history) || history.length === 0) return null;
    const targetTs = Date.now() - (24 * 60 * 60 * 1000);
    let best = null;
    let bestDiff = Infinity;
    for (const item of history) {
      const ts = toNumeric(item?.ts);
      if (!ts) continue;
      const diff = Math.abs(ts - targetTs);
      if (diff < bestDiff) {
        best = item;
        bestDiff = diff;
      }
    }
    return best || history[history.length - 1] || null;
  }

  async function fetchDexLaunchpadStats(launchpadId) {
    const query = sourceQueryByLaunchpad[launchpadId] || launchpadId;
    const res = await fetch(`${DEXSCREENER_API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (Array.isArray(data?.pairs) ? data.pairs : [])
      .filter((pair) => String(pair?.chainId || "").toLowerCase() === "solana")
      .filter((pair) => normalizeLaunchpadName(pair?.dexId || "") === launchpadId);
    if (!pairs.length) return null;

    let volume24h = 0;
    let traders24h = 0;
    let created24h = 0;
    let liquidity = 0;

    for (const pair of pairs) {
      volume24h += toNumeric(pair?.volume?.h24);
      const buys = toNumeric(pair?.txns?.h24?.buys);
      const sells = toNumeric(pair?.txns?.h24?.sells);
      traders24h += buys + sells;
      if (pairCreatedWithinHours(pair, 24)) created24h += 1;
      liquidity += toNumeric(pair?.liquidity?.usd);
    }

    return {
      id: launchpadId,
      volume24h,
      traders24h,
      created24h,
      graduated24h: 0,
      liquidity,
      poolsScanned: pairs.length,
    };
  }

  async function fetchGraduatedCountsFromSolanaTracker() {
    const apiKey = String(
      (window?.LYKEION_SECRETS && window.LYKEION_SECRETS.solanaTracker) ||
        window?.SOLANATRACKER_API_KEY ||
        ""
    ).trim();
    if (!apiKey) return {};
    const sinceIso = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
    const marketMap = {
      pumpfun: "pump.fun",
      bonk: "letsbonk.fun",
      bags: "bags.fun",
    };
    const entries = Object.entries(marketMap);
    const settled = await Promise.allSettled(entries.map(async ([id, market]) => {
      const url = `https://data.solanatracker.io/tokens/multi/graduated?limit=500&markets=${encodeURIComponent(market)}&minCreatedAt=${encodeURIComponent(sinceIso)}`;
      const res = await fetch(url, { headers: { "x-api-key": apiKey } });
      if (!res.ok) return [id, 0];
      const arr = await res.json();
      return [id, Array.isArray(arr) ? arr.length : 0];
    }));
    const out = {};
    settled.forEach((row) => {
      if (row.status === "fulfilled" && Array.isArray(row.value)) out[row.value[0]] = row.value[1];
    });
    return out;
  }

  const launchpadResults = await Promise.all(launchpadOrder.map((id) => fetchDexLaunchpadStats(id)));
  const launchpadMap = new Map();
  launchpadResults.forEach((row) => {
    if (row) launchpadMap.set(row.id, row);
  });
  if (!launchpadMap.size) return null;

  const graduatedCounts = await fetchGraduatedCountsFromSolanaTracker();
  launchpadMap.forEach((row) => {
    const grad = toNumeric(graduatedCounts[row.id]);
    row.graduated24h = grad || row.graduated24h || 0;
  });

  const currentSnapshot = {
    ts: Date.now(),
    launchpads: Array.from(launchpadMap.values()).map((lp) => ({
      id: lp.id,
      volume24h: lp.volume24h,
      traders24h: lp.traders24h,
      created24h: lp.created24h,
      graduated24h: lp.graduated24h,
    })),
  };

  const snapshotHistory = getSnapshotStore();
  const previous = pickPreviousSnapshot(snapshotHistory);
  snapshotHistory.push(currentSnapshot);
  writeSnapshotStore(snapshotHistory);

  const previousMap = new Map((previous?.launchpads || []).map((item) => [item.id, item]));

  const emojiById = { pumpfun: "💊", bonk: "🐶", bags: "💰" };
  const nameById = { pumpfun: "Pump", bonk: "LetsBonk", bags: "BAGS" };

  const launchpads = launchpadOrder
    .map((id) => launchpadMap.get(id))
    .filter(Boolean)
    .map((row) => {
      const prev = previousMap.get(row.id) || {};
      return {
        id: row.id,
        name: nameById[row.id] || row.id,
        emoji: emojiById[row.id] || "",
        shareChange: formatChangePercent(row.volume24h, prev.volume24h),
        volume24h: formatCompactUsd(row.volume24h),
        volumeChange: formatChangePercent(row.volume24h, prev.volume24h),
        traders: formatCountCompact(row.traders24h),
        tradersChange: formatChangePercent(row.traders24h, prev.traders24h),
        created24h: formatCountCompact(row.created24h),
        createdChange: formatChangePercent(row.created24h, prev.created24h),
        graduated: formatCountCompact(row.graduated24h),
        graduatedChange: formatChangePercent(row.graduated24h, prev.graduated24h),
      };
    });

  if (!launchpads.length) return null;

  const totals = Array.from(launchpadMap.values()).reduce((acc, lp) => ({
    volume: acc.volume + toNumeric(lp.volume24h),
    traders: acc.traders + toNumeric(lp.traders24h),
    created: acc.created + toNumeric(lp.created24h),
    graduated: acc.graduated + toNumeric(lp.graduated24h),
  }), { volume: 0, traders: 0, created: 0, graduated: 0 });

  const previousTotals = (previous?.launchpads || []).reduce((acc, lp) => ({
    volume: acc.volume + toNumeric(lp.volume24h),
    traders: acc.traders + toNumeric(lp.traders24h),
    created: acc.created + toNumeric(lp.created24h),
    graduated: acc.graduated + toNumeric(lp.graduated24h),
  }), { volume: 0, traders: 0, created: 0, graduated: 0 });

  return {
    kind: "launchpad_volume_widget",
    title: "Daily Trench Stats",
    timeframe: "24h",
    scannedPools: Array.from(launchpadMap.values()).reduce((sum, lp) => sum + toNumeric(lp.poolsScanned), 0),
    daily: {
      volume: formatCompactUsd(Array.from(launchpadMap.values()).reduce((sum, lp) => sum + toNumeric(lp.volume24h), 0)),
      volumeChange: formatChangePercent(totals.volume, previousTotals.volume),
      traders: formatCountCompact(totals.traders),
      tradersChange: formatChangePercent(totals.traders, previousTotals.traders),
      created: formatCountCompact(totals.created),
      createdChange: formatChangePercent(totals.created, previousTotals.created),
      graduated: formatCountCompact(totals.graduated),
      graduatedChange: formatChangePercent(totals.graduated, previousTotals.graduated),
    },
    launchpads,
    textSummary: launchpads
      .map((lp) => `${lp.name} ${lp.volume24h} (${lp.volumeChange})`)
      .join(" | "),
  };
}

async function fetchTopTokensForLaunchpad(launchpadId) {
  const id = normalizeLaunchpadName(launchpadId);
  if (!id) return [];
  const query = id === "bonk" ? "letsbonk" : id;
  const res = await fetch(`${DEXSCREENER_API_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  const pairs = (Array.isArray(data?.pairs) ? data.pairs : [])
    .filter((pair) => String(pair?.chainId || "").toLowerCase() === "solana")
    .filter((pair) => normalizeLaunchpadName(pair?.dexId || "") === id)
    .filter((pair) => pairCreatedWithinHours(pair, 24));

  const bestByToken = new Map();
  for (const pair of pairs) {
    const tokenAddress = String(pair?.baseToken?.address || "");
    if (!tokenAddress) continue;
    const current = bestByToken.get(tokenAddress);
    const vol = toNumeric(pair?.volume?.h24);
    if (!current || vol > toNumeric(current?.volume?.h24)) {
      bestByToken.set(tokenAddress, pair);
    }
  }

  return Array.from(bestByToken.values())
    .sort((a, b) => toNumeric(b?.volume?.h24) - toNumeric(a?.volume?.h24))
    .slice(0, 10)
    .map((pair) => ({
      symbol: pair?.baseToken?.symbol || "N/A",
      name: pair?.baseToken?.name || "Unknown",
      address: pair?.baseToken?.address || "",
      volume24h: formatCompactUsd(toNumeric(pair?.volume?.h24)),
      volumeRaw: toNumeric(pair?.volume?.h24),
      marketCap: formatCompactUsd(toNumeric(pair?.marketCap) || toNumeric(pair?.fdv)),
      marketCapRaw: toNumeric(pair?.marketCap) || toNumeric(pair?.fdv),
      liquidityRaw: toNumeric(pair?.liquidity?.usd),
      priceUsd: formatUsdPrecise(toNumeric(pair?.priceUsd)),
      pairUrl: pair?.url || "",
      imageUrl: pair?.info?.imageUrl || "",
      source: "Dexscreener",
    }));
}

async function solanaRpcCall(method, params) {
  let lastError = null;
  for (const endpoint of getSolanaRpcEndpoints()) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "lykeion-wallet",
          method,
          params,
        }),
      });
      if (!res.ok) {
        lastError = new Error(`RPC failed (${res.status})`);
        continue;
      }
      const data = await res.json();
      if (data?.error) {
        lastError = new Error(data.error?.message || "RPC error");
        continue;
      }
      return data?.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All RPC endpoints failed");
}

async function fetchSolUsdPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    if (!res.ok) return 0;
    const data = await res.json();
    return toNumeric(data?.solana?.usd);
  } catch {
    return 0;
  }
}

// ── Wallet analysis constants ────────────────────────────────────
const WALLET_TX_PAGES = 3;
const WALLET_TX_PER_PAGE = 100;

// ── Holdings via Helius DAS getAssetsByOwner ─────────────────────
async function fetchWalletHoldings(address) {
  const hk = getHeliusKey();
  if (!hk) return { holdings: [], solLamports: 0 };
  const url = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(hk)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "wallet-holdings",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: address,
          displayOptions: { showFungible: true, showNativeBalance: true },
          sortBy: { sortBy: "recent_action", sortDirection: "desc" },
          limit: 100,
        },
      }),
    });
    if (!res.ok) return { holdings: [], solLamports: 0 };
    const data = await res.json();
    if (data?.error) return { holdings: [], solLamports: 0 };
    const items = Array.isArray(data?.result?.items) ? data.result.items : [];
    const holdings = [];
    for (const a of items) {
      if (a.interface !== "FungibleToken" && a.interface !== "FungibleAsset") continue;
      const ti = a.token_info;
      if (!ti || !ti.balance || ti.balance <= 0) continue;
      const decimals = ti.decimals ?? 0;
      const amount = ti.balance / Math.pow(10, decimals);
      holdings.push({
        mint: a.id,
        name: a.content?.metadata?.name ?? "Unknown",
        symbol: a.content?.metadata?.symbol ?? "???",
        amount,
        valueUsd: ti.price_info?.total_price ?? null,
      });
    }
    // Helius returns nativeBalance under result — try multiple field paths
    const nb = data?.result?.nativeBalance ?? data?.result?.total?.nativeBalance;
    const solLamports = toNumeric(nb?.lamports ?? nb?.lamport ?? nb?.balance ?? 0);
    return { holdings, solLamports };
  } catch {
    return { holdings: [], solLamports: 0 };
  }
}

// ── Paginated enhanced transactions ─────────────────────────────
async function fetchAllWalletTransactions(address) {
  const hk = getHeliusKey();
  if (!hk) return [];
  const base = `https://api.helius.xyz/v0`;
  const all = [];
  let beforeSig;
  for (let page = 0; page < WALLET_TX_PAGES; page++) {
    let url =
      `${base}/addresses/${encodeURIComponent(address)}/transactions` +
      `?api-key=${encodeURIComponent(hk)}&limit=${WALLET_TX_PER_PAGE}`;
    if (beforeSig) url += `&before=${encodeURIComponent(beforeSig)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.transactions)
            ? data.transactions
            : [];
      if (!rows.length) break;
      all.push(...rows);
      beforeSig = rows[rows.length - 1].signature;
      if (rows.length < WALLET_TX_PER_PAGE) break;
    } catch {
      break;
    }
  }
  return all;
}

// ── Swap P&L computation ─────────────────────────────────────────
function parseSwaps(txs, walletAddress, holdings) {
  const map = new Map();

  const holdingNames = new Map();
  for (const h of holdings) holdingNames.set(h.mint, { name: h.name, symbol: h.symbol });

  function getOrCreate(mint) {
    let acc = map.get(mint);
    if (!acc) {
      const meta = holdingNames.get(mint);
      acc = { name: meta?.name ?? "Unknown", symbol: meta?.symbol ?? "???", totalBoughtSol: 0, totalSoldSol: 0, firstBuyMs: 0, lastActivityMs: 0 };
      map.set(mint, acc);
    }
    return acc;
  }

  function recordBuy(mint, solAmount, tsMs) {
    if (mint === SOL_MINT || solAmount <= 0) return;
    const acc = getOrCreate(mint);
    acc.totalBoughtSol += solAmount;
    if (acc.firstBuyMs === 0 || tsMs < acc.firstBuyMs) acc.firstBuyMs = tsMs;
    if (tsMs > acc.lastActivityMs) acc.lastActivityMs = tsMs;
  }

  function recordSell(mint, solAmount, tsMs) {
    if (mint === SOL_MINT || solAmount <= 0) return;
    const acc = getOrCreate(mint);
    acc.totalSoldSol += solAmount;
    if (tsMs > acc.lastActivityMs) acc.lastActivityMs = tsMs;
    if (acc.firstBuyMs === 0) acc.firstBuyMs = tsMs;
  }

  for (const tx of Array.isArray(txs) ? txs : []) {
    const tsRaw = toNumeric(tx.timestamp) || toNumeric(tx.blockTime) || 0;
    const tsMs = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
    let parsed = false;

    // Strategy 1: use events.swap (most accurate)
    if (tx.events?.swap) {
      const swap = tx.events.swap;
      let nativeInLam = swap.nativeInput ? Number(swap.nativeInput.amount) : 0;
      let nativeOutLam = swap.nativeOutput ? Number(swap.nativeOutput.amount) : 0;

      // Fall back to accountData / nativeTransfers when swap event lacks native amounts
      if (nativeInLam === 0 || nativeOutLam === 0) {
        let walletChangeLam = 0;
        if (tx.accountData) {
          const wd = tx.accountData.find((a) => a.account === walletAddress);
          if (wd) walletChangeLam = wd.nativeBalanceChange;
        }
        if (walletChangeLam === 0 && tx.nativeTransfers) {
          let solOut = 0, solIn = 0;
          for (const nt of tx.nativeTransfers) {
            if (nt.fromUserAccount === walletAddress && nt.amount > 0) solOut += nt.amount;
            if (nt.toUserAccount === walletAddress && nt.amount > 0) solIn += nt.amount;
          }
          walletChangeLam = solIn - solOut;
        }
        if (nativeInLam === 0 && walletChangeLam < 0) nativeInLam = Math.abs(walletChangeLam);
        if (nativeOutLam === 0 && walletChangeLam > 0) nativeOutLam = walletChangeLam;
      }

      if (nativeInLam > 0) {
        const solSpent = nativeInLam / 1e9;
        const tokenOutputs = Array.isArray(swap.tokenOutputs) ? swap.tokenOutputs : [];
        if (tokenOutputs.length > 0) {
          for (const tok of tokenOutputs) recordBuy(tok.mint, solSpent / tokenOutputs.length, tsMs);
          parsed = true;
        } else if (Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
          const tIn = tx.tokenTransfers.filter((tt) => tt.toUserAccount === walletAddress && tt.mint !== SOL_MINT && tt.tokenAmount > 0).map((tt) => tt.mint);
          if (tIn.length > 0) { for (const mint of tIn) recordBuy(mint, solSpent / tIn.length, tsMs); parsed = true; }
        }
      }

      if (nativeOutLam > 0) {
        const solReceived = nativeOutLam / 1e9;
        const tokenInputs = Array.isArray(swap.tokenInputs) ? swap.tokenInputs : [];
        if (tokenInputs.length > 0) {
          for (const tok of tokenInputs) recordSell(tok.mint, solReceived / tokenInputs.length, tsMs);
          parsed = true;
        } else if (Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
          const tOut = tx.tokenTransfers.filter((tt) => tt.fromUserAccount === walletAddress && tt.mint !== SOL_MINT && tt.tokenAmount > 0).map((tt) => tt.mint);
          if (tOut.length > 0) { for (const mint of tOut) recordSell(mint, solReceived / tOut.length, tsMs); parsed = true; }
        }
      }
    }

    // Strategy 2: infer from tokenTransfers + wallet SOL change
    if (!parsed && Array.isArray(tx.tokenTransfers) && tx.tokenTransfers.length > 0) {
      let walletSolChangeLam = 0;
      if (tx.accountData) {
        const wd = tx.accountData.find((a) => a.account === walletAddress);
        if (wd) walletSolChangeLam = wd.nativeBalanceChange;
      }
      if (walletSolChangeLam === 0) {
        let solOut = 0, solIn = 0;
        for (const nt of tx.nativeTransfers ?? []) {
          if (nt.fromUserAccount === walletAddress && nt.amount > 0) solOut += nt.amount;
          if (nt.toUserAccount === walletAddress && nt.amount > 0) solIn += nt.amount;
        }
        walletSolChangeLam = solIn - solOut;
      }
      const tokensIn = tx.tokenTransfers.filter((tt) => tt.mint !== SOL_MINT && tt.tokenAmount > 0 && tt.toUserAccount === walletAddress);
      const tokensOut = tx.tokenTransfers.filter((tt) => tt.mint !== SOL_MINT && tt.tokenAmount > 0 && tt.fromUserAccount === walletAddress);
      const solChangeSol = walletSolChangeLam / 1e9;

      // BUY: wallet lost SOL, received tokens (do not require tx.type === SWAP — Helius labels vary)
      if (solChangeSol < -0.005 && tokensIn.length > 0) {
        const spent = Math.abs(solChangeSol);
        for (const t of tokensIn) recordBuy(t.mint, spent / tokensIn.length, tsMs);
      }
      // SELL: wallet gained SOL, sent tokens
      if (solChangeSol > 0.005 && tokensOut.length > 0) {
        for (const t of tokensOut) recordSell(t.mint, solChangeSol / tokensOut.length, tsMs);
      }
    }
  }

  return map;
}

// ── DexScreener batch price + name fetch ─────────────────────────
async function fetchCurrentPricesAndNames(mints) {
  const prices = new Map();
  const names = new Map();
  if (!mints.length) return { prices, names };
  const BATCH = 25;
  for (let i = 0; i < mints.length; i += BATCH) {
    const chunk = mints.slice(i, i + BATCH);
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      for (const p of data) {
        if (p.chainId !== "solana") continue;
        const mint = p.baseToken?.address;
        if (!mint) continue;
        if (!prices.has(mint)) {
          const priceNative = p.priceNative ? Number(p.priceNative) : 0;
          const priceUsd = p.priceUsd ? Number(p.priceUsd) : 0;
          if (priceNative > 0 || priceUsd > 0) prices.set(mint, { priceNative, priceUsd });
        }
        if (!names.has(mint) && p.baseToken?.symbol) {
          names.set(mint, { name: p.baseToken.name ?? p.baseToken.symbol, symbol: p.baseToken.symbol });
        }
      }
    } catch {}
  }
  return { prices, names };
}

// ── Helius DAS getAssetBatch for missing token names ─────────────
async function fetchTokenMetadataBatch(mints) {
  const result = new Map();
  const hk = getHeliusKey();
  if (!hk || !mints.length) return result;
  const url = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(hk)}`;
  const BATCH = 50;
  for (let i = 0; i < mints.length; i += BATCH) {
    const chunk = mints.slice(i, i + BATCH);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "token-meta", method: "getAssetBatch", params: { ids: chunk } }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data?.result)) continue;
      for (const asset of data.result) {
        if (!asset.id || result.has(asset.id)) continue;
        const meta = asset.content?.metadata;
        if (meta?.name || meta?.symbol) result.set(asset.id, { name: meta.name ?? "Unknown", symbol: meta.symbol ?? "???" });
      }
    } catch {}
  }
  return result;
}

// ── Helius DAS getAsset — single token image ─────────────────────
async function fetchTokenImage(tokenAddress) {
  const hkImg = getHeliusKey();
  if (!tokenAddress || !hkImg) return "";
  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(hkImg)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "token-img", method: "getAsset", params: { id: tokenAddress } }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.result?.content?.links?.image || "";
  } catch {
    return "";
  }
}

// ── (removed legacy parseHeliusWeeklyTrades) ─────────────────────
function parseHeliusWeeklyTrades(wallet, txs, solUsd) {
  const since = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  let weekDeltaSol = 0;
  const tradeRows = [];
  const tokenSummaryMap = new Map();
  const STABLE_SYMBOLS = new Set(["USDC", "USDT", "USDH", "PYUSD"]);
  const STABLE_MINTS = new Set([
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  ]);

  function isTradeLike(tx) {
    const type = String(tx?.type || "").toUpperCase();
    if (tx?.events?.swap) return true;
    if (type.includes("SWAP") || type.includes("BUY") || type.includes("SELL") || type.includes("TRADE")) {
      return true;
    }
    const transfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
    let hasWalletTokenIn = false;
    let hasWalletTokenOut = false;
    for (const transfer of transfers) {
      const from = String(transfer?.fromUserAccount || "");
      const to = String(transfer?.toUserAccount || "");
      if (to === wallet) hasWalletTokenIn = true;
      if (from === wallet) hasWalletTokenOut = true;
      if (hasWalletTokenIn && hasWalletTokenOut) return true;
    }
    return false;
  }

  function getWalletNativeChangeLamports(tx) {
    const accountData = Array.isArray(tx?.accountData) ? tx.accountData : [];
    for (const row of accountData) {
      const account = String(row?.account || row?.accountAddress || "");
      if (account !== wallet) continue;
      const delta = toNumeric(row?.nativeBalanceChange);
      if (delta) return delta;
    }

    // Fallback to transfer-level aggregation when accountData is missing.
    let deltaLamports = 0;
    const transfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];
    for (const transfer of transfers) {
      const amount = toNumeric(transfer?.amount);
      const from = String(transfer?.fromUserAccount || transfer?.from || "");
      const to = String(transfer?.toUserAccount || transfer?.to || "");
      if (to === wallet) deltaLamports += amount;
      if (from === wallet) deltaLamports -= amount;
    }
    return deltaLamports;
  }

  function getTokenUiAmount(item) {
    const direct = toNumeric(item?.tokenAmount ?? item?.amount);
    if (direct > 0) return direct;
    const raw = item?.rawTokenAmount;
    const rawAmount = toNumeric(raw?.tokenAmount);
    if (rawAmount <= 0) return 0;
    const decimals = Math.max(0, Math.floor(toNumeric(raw?.decimals)));
    if (decimals > 0 && decimals <= 12) {
      return rawAmount / (10 ** decimals);
    }
    return rawAmount;
  }

  function isStableLike(symbol, mint) {
    const upper = String(symbol || "").trim().toUpperCase();
    const rawMint = String(mint || "").trim();
    return STABLE_SYMBOLS.has(upper) || STABLE_MINTS.has(rawMint);
  }

  function extractTokenLabelFromHeliusTx(tx) {
    const transfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
    const tokenVolumeCandidates = [];
    for (const transfer of transfers) {
      const from = String(transfer?.fromUserAccount || "");
      const to = String(transfer?.toUserAccount || "");
      if (from !== wallet && to !== wallet) continue;
      const symbol =
        String(
          transfer?.tokenSymbol ||
          transfer?.symbol ||
          transfer?.mint ||
          ""
        ).trim();
      if (!symbol) continue;
      const upper = symbol.toUpperCase();
      if (upper === "SOL" || upper === "WSOL" || STABLE_SYMBOLS.has(upper)) continue;
      const amount = Math.abs(getTokenUiAmount(transfer));
      tokenVolumeCandidates.push({
        symbol: symbol.length > 14 ? `${symbol.slice(0, 6)}...` : symbol,
        amount,
      });
    }
    tokenVolumeCandidates.sort((a, b) => b.amount - a.amount);
    if (tokenVolumeCandidates.length) return tokenVolumeCandidates[0].symbol;
    const txType = String(tx?.type || "").toUpperCase();
    if (txType.includes("BUY")) return "BUY";
    if (txType.includes("SELL")) return "SELL";
    if (txType.includes("SWAP")) return "SWAP";
    return "SOL";
  }

  function pickMintSymbol(transfer) {
    const symbol = String(transfer?.tokenSymbol || transfer?.symbol || "").trim();
    if (symbol) return symbol;
    const mint = String(transfer?.mint || "").trim();
    if (!mint) return "???";
    return `${mint.slice(0, 4)}...`;
  }

  function symbolFromMint(mint) {
    const value = String(mint || "").trim();
    if (!value) return "???";
    if (value === SOL_MINT) return "SOL";
    return `${value.slice(0, 4)}...`;
  }

  function getLargestTransfer(entries, key) {
    return entries
      .filter((entry) => toNumeric(entry?.[key]) > 0 && !entry?.stable)
      .sort((a, b) => toNumeric(b?.[key]) - toNumeric(a?.[key]))[0] || null;
  }

  function shouldTrackTokenLabel(label) {
    const value = String(label || "").trim().toUpperCase();
    if (!value) return false;
    return !["BUY", "SELL", "SWAP", "SOL", "WSOL", "???"].includes(value);
  }

  function accumulateTokenSummary(tokenKey, tokenLabel, side, solAmount) {
    const key = String(tokenKey || tokenLabel || "").trim();
    const amount = Math.abs(toNumeric(solAmount));
    if (!key || amount <= 0 || !shouldTrackTokenLabel(tokenLabel)) return;
    if (!tokenSummaryMap.has(key)) {
      tokenSummaryMap.set(key, {
        tokenLabel: String(tokenLabel || key),
        boughtSol: 0,
        soldSol: 0,
      });
    }
    const row = tokenSummaryMap.get(key);
    if (side === "BUY") row.boughtSol += amount;
    if (side === "SELL") row.soldSol += amount;
  }

  function buildTopTradeRowsFromSummary() {
    return Array.from(tokenSummaryMap.entries())
      .map(([key, row]) => {
        const boughtSol = Math.abs(toNumeric(row.boughtSol));
        const soldSol = Math.abs(toNumeric(row.soldSol));
        const pnlSol = soldSol - boughtSol;
        return {
          mint: key,
          tokenLabel: String(row.tokenLabel || "Unknown"),
          boughtSol,
          soldSol,
          pnlSol,
        };
      })
      .filter((row) => row.boughtSol > 0 || row.soldSol > 0)
      .sort((a, b) => {
        if (toNumeric(b.pnlSol) !== toNumeric(a.pnlSol)) return toNumeric(b.pnlSol) - toNumeric(a.pnlSol);
        if (toNumeric(b.soldSol) !== toNumeric(a.soldSol)) return toNumeric(b.soldSol) - toNumeric(a.soldSol);
        return toNumeric(b.boughtSol) - toNumeric(a.boughtSol);
      })
      .slice(0, 5);
  }

  function buildWalletTransferSummary(tx) {
    const transferMap = new Map();
    let sawDirectWalletTransfer = false;

    function touch(mint, symbol) {
      const key = String(mint || symbol || "");
      if (!key) return null;
      if (!transferMap.has(key)) {
        transferMap.set(key, {
          mint: String(mint || ""),
          symbol: symbol ? (symbol.length > 14 ? `${symbol.slice(0, 6)}...` : symbol) : symbolFromMint(mint),
          inAmount: 0,
          outAmount: 0,
          stable: isStableLike(symbol, mint),
        });
      }
      const row = transferMap.get(key);
      if ((!row.symbol || row.symbol === "???") && symbol) {
        row.symbol = symbol.length > 14 ? `${symbol.slice(0, 6)}...` : symbol;
      }
      row.stable = row.stable || isStableLike(symbol, mint);
      return row;
    }

    const tokenTransfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
    for (const transfer of tokenTransfers) {
      const from = String(transfer?.fromUserAccount || "");
      const to = String(transfer?.toUserAccount || "");
      if (from !== wallet && to !== wallet) continue;
      sawDirectWalletTransfer = true;
      const mint = String(transfer?.mint || "");
      if (!mint || mint === SOL_MINT) continue;
      const amount = Math.abs(getTokenUiAmount(transfer));
      if (amount <= 0) continue;
      const row = touch(mint, pickMintSymbol(transfer));
      if (!row) continue;
      if (to === wallet) row.inAmount += amount;
      if (from === wallet) row.outAmount += amount;
    }

    const swap = tx?.events?.swap;
    const swapInputs = Array.isArray(swap?.tokenInputs) ? swap.tokenInputs : [];
    const swapOutputs = Array.isArray(swap?.tokenOutputs) ? swap.tokenOutputs : [];

    if (!sawDirectWalletTransfer) {
      for (const input of swapInputs) {
        const userAccount = String(input?.userAccount || input?.fromUserAccount || "");
        if (userAccount && userAccount !== wallet) continue;
        const mint = String(input?.mint || "");
        if (!mint || mint === SOL_MINT) continue;
        const amount = Math.abs(getTokenUiAmount(input));
        if (amount <= 0) continue;
        const row = touch(mint, "");
        if (row) row.outAmount += amount;
      }

      for (const output of swapOutputs) {
        const userAccount = String(output?.userAccount || output?.toUserAccount || "");
        if (userAccount && userAccount !== wallet) continue;
        const mint = String(output?.mint || "");
        if (!mint || mint === SOL_MINT) continue;
        const amount = Math.abs(getTokenUiAmount(output));
        if (amount <= 0) continue;
        const row = touch(mint, "");
        if (row) row.inAmount += amount;
      }
    }

    return Array.from(transferMap.values());
  }

  for (const tx of Array.isArray(txs) ? txs : []) {
    const ts = toNumeric(tx?.timestamp);
    if (!ts) continue;
    if (!isTradeLike(tx)) continue;

    const deltaLamports = getWalletNativeChangeLamports(tx);
    const deltaSol = deltaLamports / 1e9;
    if (ts >= since) weekDeltaSol += deltaSol;

    const swap = tx?.events?.swap;
    let nativeInLam = swap?.nativeInput ? toNumeric(swap.nativeInput.amount) : 0;
    let nativeOutLam = swap?.nativeOutput ? toNumeric(swap.nativeOutput.amount) : 0;
    if (nativeInLam === 0 && deltaLamports < 0) nativeInLam = Math.abs(deltaLamports);
    if (nativeOutLam === 0 && deltaLamports > 0) nativeOutLam = Math.abs(deltaLamports);

    const summary = buildWalletTransferSummary(tx);
    const incomingToken = getLargestTransfer(summary, "inAmount");
    const outgoingToken = getLargestTransfer(summary, "outAmount");
    const stableSpentUsd = summary
      .filter((entry) => entry.stable)
      .reduce((sum, entry) => sum + toNumeric(entry.outAmount), 0);
    const stableReceivedUsd = summary
      .filter((entry) => entry.stable)
      .reduce((sum, entry) => sum + toNumeric(entry.inAmount), 0);

    const nativeSpentSol = nativeInLam > 0 ? nativeInLam / 1e9 : 0;
    const nativeReceivedSol = nativeOutLam > 0 ? nativeOutLam / 1e9 : 0;
    let side = "SWAP";
    let tokenEntry = incomingToken || outgoingToken;
    let tradeValueUsd = 0;
    let tradeValueSol = 0;

    if (nativeSpentSol > 0.000001) {
      side = "BUY";
      tokenEntry = incomingToken || tokenEntry;
      tradeValueSol = nativeSpentSol;
      tradeValueUsd = nativeSpentSol * solUsd;
    } else if (nativeReceivedSol > 0.000001) {
      side = "SELL";
      tokenEntry = outgoingToken || tokenEntry;
      tradeValueSol = nativeReceivedSol;
      tradeValueUsd = nativeReceivedSol * solUsd;
    } else if (stableSpentUsd > 0 && incomingToken) {
      side = "BUY";
      tokenEntry = incomingToken;
      tradeValueUsd = stableSpentUsd;
      tradeValueSol = solUsd > 0 ? stableSpentUsd / solUsd : 0;
    } else if (stableReceivedUsd > 0 && outgoingToken) {
      side = "SELL";
      tokenEntry = outgoingToken;
      tradeValueUsd = stableReceivedUsd;
      tradeValueSol = solUsd > 0 ? stableReceivedUsd / solUsd : 0;
    } else {
      tradeValueUsd = Math.max(stableSpentUsd, stableReceivedUsd, Math.abs(deltaSol) * solUsd);
      tradeValueSol = tradeValueUsd > 0 && solUsd > 0 ? tradeValueUsd / solUsd : Math.abs(deltaSol);
      if (deltaSol < -0.000001) {
        side = "BUY";
        tokenEntry = incomingToken || tokenEntry;
      } else if (deltaSol > 0.000001) {
        side = "SELL";
        tokenEntry = outgoingToken || tokenEntry;
      }
    }

    if (tradeValueUsd < 20) continue;

    const fallbackLabel = extractTokenLabelFromHeliusTx(tx);
    const tokenLabel =
      tokenEntry?.symbol && !isStableLike(tokenEntry?.symbol, tokenEntry?.mint)
        ? tokenEntry.symbol
        : fallbackLabel;
    const tokenKey = String(tokenEntry?.mint || tokenLabel || "").trim();

    accumulateTokenSummary(tokenKey, tokenLabel, side, tradeValueSol);

    tradeRows.push({
      signature: String(tx?.signature || ""),
      side,
      tokenLabel,
      tokenMint: String(tokenEntry?.mint || "").trim(),
      tradeValueSol,
      tradeValueUsd,
      deltaSol,
      deltaUsd: deltaSol * solUsd,
      time: new Date(ts * 1000).toISOString(),
      type: String(tx?.type || "").toUpperCase(),
    });
  }

  let topTrades = buildTopTradeRowsFromSummary();
  if (!topTrades.length) {
    const fallbackMap = new Map();
    for (const row of tradeRows) {
      const label = String(row?.tokenLabel || "").trim() || "Unknown";
      const key = String(row?.tokenMint || label || "").trim();
      if (!fallbackMap.has(key)) {
        fallbackMap.set(key, { mint: key, tokenLabel: label, boughtSol: 0, soldSol: 0 });
      }
      const target = fallbackMap.get(key);
      if (label !== "Unknown" && !label.includes("...") && target.tokenLabel !== label) {
        target.tokenLabel = label;
      }
      const size = Math.abs(toNumeric(row?.tradeValueSol));
      if (String(row?.side || "").toUpperCase() === "BUY") target.boughtSol += size;
      if (String(row?.side || "").toUpperCase() === "SELL") target.soldSol += size;
    }
    topTrades = Array.from(fallbackMap.values())
      .map((row) => ({
        mint: row.mint,
        tokenLabel: row.tokenLabel,
        boughtSol: Math.abs(toNumeric(row.boughtSol)),
        soldSol: Math.abs(toNumeric(row.soldSol)),
        pnlSol: Math.abs(toNumeric(row.soldSol)) - Math.abs(toNumeric(row.boughtSol)),
      }))
      .filter((row) => row.boughtSol > 0 || row.soldSol > 0)
      .sort((a, b) => toNumeric(b.pnlSol) - toNumeric(a.pnlSol))
      .slice(0, 5);
  }

  return { weekDeltaSol, topTrades };
}

function formatSignedUsd(value) {
  const num = toNumeric(value);
  if (!Number.isFinite(num)) return "N/A";
  const sign = num > 0 ? "+" : "";
  return `${sign}${formatCompactUsd(num)}`;
}

function formatSignedSol(value) {
  const num = toNumeric(value);
  if (!Number.isFinite(num)) return "N/A";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)} SOL`;
}

function formatSolAmount(value) {
  const num = Math.abs(toNumeric(value));
  if (!Number.isFinite(num)) return "N/A";
  return `${num.toFixed(2)} SOL`;
}

async function getWalletAnalysisPayload(userMessage) {
  if (!isWalletAnalysisIntent(userMessage)) return null;
  const wallet = extractTokenAddress(userMessage);
  if (!wallet) return null;

  const errorResult = (msg) => ({
    kind: "wallet_analysis_widget",
    wallet,
    balanceSol: "N/A",
    balanceUsd: "N/A",
    weekProfitUsd: "N/A",
    weekProfitSol: "N/A",
    topTrades: [],
    errorMessage: msg,
    textSummary: `Wallet ${wallet} | ${msg}`,
  });

  if (!getHeliusKey()) {
    return errorResult(
      "Wallet analysis needs a Helius API key. Set HELIUS_API_KEY in Vercel (or .env locally), or use window.LYKEION_SECRETS.helius via local-secrets.js. " +
        "Get a key at https://www.helius.dev/"
    );
  }

  try {
    // 1. Fetch holdings (with SOL balance) + all transactions in parallel
    const [holdingsResult, txs] = await Promise.all([
      fetchWalletHoldings(wallet),
      fetchAllWalletTransactions(wallet),
    ]);

    const { holdings, solLamports } = holdingsResult;

    // SOL balance: max(DAS, public RPC, full RPC chain) — public first avoids Helius-only quirks.
    let resolvedLamports = solLamports;
    try {
      const pubBal = await solanaRpcCallPublic("getBalance", [wallet, { commitment: "confirmed" }]);
      resolvedLamports = Math.max(resolvedLamports, toNumeric(pubBal?.value) || 0);
    } catch {}
    if (resolvedLamports <= 0) {
      try {
        const balResult = await solanaRpcCall("getBalance", [wallet, { commitment: "confirmed" }]);
        resolvedLamports = Math.max(resolvedLamports, toNumeric(balResult?.value) || 0);
      } catch {}
    }
    const currentSol = resolvedLamports / 1e9;

    // 2. Parse swaps using the two-strategy approach
    const swapMap = parseSwaps(txs, wallet, holdings);

    // 3. Fetch current prices + names from DexScreener for all mints
    const allMints = Array.from(new Set([
      ...holdings.map((h) => h.mint),
      ...Array.from(swapMap.keys()),
    ].filter((m) => m !== SOL_MINT)));

    const { prices, names: dexNames } = await fetchCurrentPricesAndNames(allMints.slice(0, 75));

    // 4. Resolve token names: DexScreener → holdings → Helius DAS batch
    const holdingNames = new Map(holdings.map((h) => [h.mint, { name: h.name, symbol: h.symbol }]));
    const missingNameMints = [];
    swapMap.forEach((acc, mint) => {
      if (acc.name !== "Unknown" && acc.symbol !== "???") return;
      const dex = dexNames.get(mint);
      if (dex) { acc.name = dex.name; acc.symbol = dex.symbol; return; }
      const held = holdingNames.get(mint);
      if (held && held.name !== "Unknown") { acc.name = held.name; acc.symbol = held.symbol; return; }
      missingNameMints.push(mint);
    });
    if (missingNameMints.length > 0) {
      const heliusNames = await fetchTokenMetadataBatch(missingNameMints.slice(0, 50));
      heliusNames.forEach((meta, mint) => {
        const acc = swapMap.get(mint);
        if (acc && acc.name === "Unknown") { acc.name = meta.name; acc.symbol = meta.symbol; }
      });
    }

    // 5. Build per-token PnL entries (realized + unrealized)
    const tokenPnl = [];
    swapMap.forEach((acc, mint) => {
      const holding = holdings.find((h) => h.mint === mint);
      const price = prices.get(mint);
      const holdingAmount = holding?.amount ?? 0;
      const currentValueSol = holdingAmount > 0 && price ? holdingAmount * price.priceNative : 0;
      const realizedPnl = acc.totalSoldSol - acc.totalBoughtSol;
      const totalPnl = realizedPnl + currentValueSol;
      tokenPnl.push({
        mint,
        symbol: acc.symbol !== "???" ? acc.symbol : acc.name,
        totalBoughtSol: acc.totalBoughtSol,
        totalSoldSol: acc.totalSoldSol,
        realizedPnl,
        currentValueSol,
        totalPnl,
      });
    });

    // Sort by total PnL descending
    tokenPnl.sort((a, b) => b.totalPnl - a.totalPnl);

    const topTrades = tokenPnl.slice(0, 5).map((t) => ({
      tokenLabel: t.symbol,
      boughtSol: formatSolAmount(t.totalBoughtSol),
      soldSol: formatSolAmount(t.totalSoldSol),
      pnlSol: formatSignedSol(t.totalPnl),
    }));

    const totalPnlSol = tokenPnl.reduce((sum, t) => sum + t.totalPnl, 0);
    const solUsd = prices.get(SOL_MINT)?.priceUsd ?? (await fetchSolUsdPrice());
    const currentUsd = currentSol * solUsd;

    if (!topTrades.length && currentSol <= 0) {
      const hint =
        txs.length === 0
          ? " No on-chain swaps were parsed from recent transactions (empty or unsupported tx format). Confirm the address and Helius key; the wallet may also have no token activity."
          : " No token PnL rows could be built from parsed swaps (try a wallet with recent DEX activity).";
      return errorResult(
        "No trade data to display. Balance is 0 SOL and no token trades were parsed." + hint
      );
    }

    return {
      kind: "wallet_analysis_widget",
      wallet,
      balanceSol: `${currentSol.toFixed(4)} SOL`,
      balanceUsd: formatCompactUsd(currentUsd),
      weekProfitUsd: formatSignedUsd(totalPnlSol * solUsd),
      weekProfitSol: formatSignedSol(totalPnlSol),
      topTrades,
      errorMessage: "",
      textSummary: `Wallet ${wallet} | Balance ${currentSol.toFixed(2)} SOL (${formatCompactUsd(currentUsd)}) | PnL ${formatSignedSol(totalPnlSol)}`,
    };
  } catch {
    return errorResult("Wallet analysis failed. Please try again.");
  }
}

async function fetchHotTokensWidgetData() {
  const launchpads = ["pumpfun", "bags", "bonk"];
  const all = [];
  for (const launchpad of launchpads) {
    const tokens = await fetchTopTokensForLaunchpad(launchpad);
    tokens.forEach((token) => {
      const marketCapValue = parseUsdNumber(token.marketCapRaw);
      const volumeValue = parseUsdNumber(token.volumeRaw);
      const liquidityValue = parseUsdNumber(token.liquidityRaw);
      const hasReliableNumbers =
        Number.isFinite(marketCapValue) &&
        Number.isFinite(volumeValue) &&
        Number.isFinite(liquidityValue) &&
        marketCapValue >= HOT_TOKEN_MIN_MARKETCAP_USD &&
        volumeValue >= HOT_TOKEN_MIN_VOLUME_USD &&
        liquidityValue >= HOT_TOKEN_MIN_LIQUIDITY_USD;
      if (!hasReliableNumbers) return;
      all.push({
        ...token,
        launchpad,
        marketCapRaw: Number.isFinite(marketCapValue) ? marketCapValue : 0,
        volumeRaw: Number.isFinite(volumeValue) ? volumeValue : 0,
        liquidityRaw: Number.isFinite(liquidityValue) ? liquidityValue : 0,
      });
    });
  }

  const byAddress = new Map();
  for (const token of all) {
    const key = String(token.address || "");
    if (!key) continue;
    const current = byAddress.get(key);
    if (!current) {
      byAddress.set(key, token);
      continue;
    }
    const better =
      token.volumeRaw > current.volumeRaw ||
      (token.volumeRaw === current.volumeRaw && token.marketCapRaw > current.marketCapRaw);
    if (better) byAddress.set(key, token);
  }

  const ranked = Array.from(byAddress.values())
    .sort((a, b) => {
      if (b.volumeRaw !== a.volumeRaw) return b.volumeRaw - a.volumeRaw;
      return b.marketCapRaw - a.marketCapRaw;
    })
    .slice(0, 12)
    .map((token) => ({
      symbol: token.symbol || "N/A",
      name: token.name || "Unknown",
      address: token.address || "",
      launchpad: token.launchpad,
      volume24h: token.volume24h || "N/A",
      marketCap: token.marketCap || "N/A",
      priceUsd: token.priceUsd || "N/A",
      pairUrl: token.pairUrl || "",
      imageUrl: token.imageUrl || "",
      source: token.source || "Dexscreener",
    }));

  if (!ranked.length) {
    return {
      kind: "hot_tokens_widget",
      title: "Hot Solana Tokens (launched <=24h)",
      timeframe: "24h",
      source: "Dexscreener (strict-filtered)",
      generatedAt: new Date().toISOString(),
      tokens: [],
      textSummary: "No reliable hot tokens found with strict filters.",
    };
  }
  return {
    kind: "hot_tokens_widget",
    title: "Hot Solana Tokens (launched <=24h)",
    timeframe: "24h",
    source: "Dexscreener (strict-filtered)",
    generatedAt: new Date().toISOString(),
    tokens: ranked,
    textSummary: ranked.slice(0, 5).map((t, i) => `${i + 1}) ${t.symbol}`).join(" | "),
  };
}

function pickBestSolanaPair(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const solPairs = pairs.filter((pair) => String(pair.chainId || "").toLowerCase() === "solana");
  if (!solPairs.length) return null;
  solPairs.sort((a, b) => {
    const aLiquidity = Number(a?.liquidity?.usd || 0);
    const bLiquidity = Number(b?.liquidity?.usd || 0);
    return bLiquidity - aLiquidity;
  });
  return solPairs[0] || null;
}

async function fetchDexscreenerTokenData(userMessage, tokenAddress, ticker) {
  const tokenAddresses = extractTokenAddressCandidates(userMessage);
  if (tokenAddress) tokenAddresses.unshift(tokenAddress);
  const tickers = extractTickerCandidates(userMessage);
  if (ticker) tickers.unshift(ticker);

  const normalizedAddresses = uniqueNonEmpty(tokenAddresses);
  const normalizedTickers = uniqueNonEmpty(tickers);

  // 1) Strict path: exact CA lookup only.
  if (normalizedAddresses.length > 0) {
    const tokenSettled = await Promise.allSettled(
      normalizedAddresses.map((address) =>
        fetch(`${DEXSCREENER_API_BASE}/tokens/${encodeURIComponent(address)}`).then((r) => r.ok ? r.json() : null)
      )
    );
    const tokenPairs = dedupePairs(tokenSettled
      .filter((entry) => entry.status === "fulfilled" && entry.value && Array.isArray(entry.value.pairs))
      .flatMap((entry) => entry.value.pairs));

    for (const address of normalizedAddresses) {
      const exactAddressPairs = filterPairsByTokenAddress(tokenPairs, address);
      const bestExact = pickBestSolanaPair(exactAddressPairs);
      if (bestExact) return bestExact;
    }

    // 2) Fallback to search by CA, but still require exact CA match.
    const searchSettled = await Promise.allSettled(
      normalizedAddresses.map((address) =>
        fetch(`${DEXSCREENER_API_BASE}/search?q=${encodeURIComponent(address)}`).then((r) => r.ok ? r.json() : null)
      )
    );
    const searchPairs = dedupePairs(searchSettled
      .filter((entry) => entry.status === "fulfilled" && entry.value && Array.isArray(entry.value.pairs))
      .flatMap((entry) => entry.value.pairs));

    for (const address of normalizedAddresses) {
      const exactSearchPairs = filterPairsByTokenAddress(searchPairs, address);
      const bestExactSearch = pickBestSolanaPair(exactSearchPairs);
      if (bestExactSearch) return bestExactSearch;
    }

    // Never return a non-exact pair when user supplied a CA.
    return null;
  }

  // If no CA is present (future-proof fallback), use symbol/message search.
  const requests = [];
  for (const symbol of normalizedTickers) {
    requests.push(fetch(`${DEXSCREENER_API_BASE}/search?q=${encodeURIComponent(symbol)}`).then((r) => r.ok ? r.json() : null));
  }
  requests.push(fetch(`${DEXSCREENER_API_BASE}/search?q=${encodeURIComponent(userMessage)}`).then((r) => r.ok ? r.json() : null));
  const settled = await Promise.allSettled(requests);
  const pairs = dedupePairs(
    settled
      .filter((entry) => entry.status === "fulfilled" && entry.value && Array.isArray(entry.value.pairs))
      .flatMap((entry) => entry.value.pairs)
  );
  return pickBestSolanaPair(pairs);
}

async function fetchPumpFunTokenData(tokenAddress) {
  if (!tokenAddress) return null;
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${encodeURIComponent(tokenAddress)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getTokenLookupPayload(userMessage) {
  const tokenAddress = extractTokenAddress(userMessage);
  const ticker = extractTickerSymbol(userMessage);
  if (!isTokenLookupIntent(userMessage)) return null;

  const [pair, pump, dasImage] = await Promise.all([
    fetchDexscreenerTokenData(userMessage, tokenAddress, ticker),
    fetchPumpFunTokenData(tokenAddress),
    tokenAddress ? fetchTokenImage(tokenAddress) : Promise.resolve(""),
  ]);

  if (!pair && !pump) {
    const attemptedLookup = tokenAddress || ticker || userMessage;
    return {
      kind: "token_info_widget",
      name: "Token not found",
      symbol: ticker || "N/A",
      address: tokenAddress || attemptedLookup,
      imageUrl: "",
      marketCap: "N/A",
      volume24h: "N/A",
      priceUsd: "N/A",
      dexId: "N/A",
      pairUrl: "",
      lore: "I checked Dexscreener/Pump.fun but could not find this token yet. It may be very new, delisted, or the address is invalid.",
      links: [],
      textSummary: `Token lookup: no Dexscreener/Pump.fun match for ${attemptedLookup}.`,
    };
  }

  const name = pair?.baseToken?.name || pump?.name || "Unknown token";
  const symbol = pair?.baseToken?.symbol || pump?.symbol || ticker || "N/A";
  const address = pair?.baseToken?.address || tokenAddress || pump?.mint || "";
  const marketCap = parseUsdNumber(pair?.marketCap) ?? parseUsdNumber(pair?.fdv) ?? parseUsdNumber(pump?.usd_market_cap);
  const volume24h = parseUsdNumber(pair?.volume?.h24);
  const priceUsd = parseUsdNumber(pair?.priceUsd);
  const imageUrl = pair?.info?.imageUrl || pump?.image_uri || dasImage || "";
  function classifyLink(url, explicitType) {
    const loweredUrl = String(url || "").toLowerCase();
    const t = String(explicitType || "").toLowerCase();
    if (t.includes("twitter") || loweredUrl.includes("x.com") || loweredUrl.includes("twitter.com")) return "Twitter/X";
    if (t.includes("telegram") || loweredUrl.includes("t.me")) return "Telegram";
    if (t.includes("instagram") || loweredUrl.includes("instagram.com")) return "Instagram";
    if (t.includes("discord") || loweredUrl.includes("discord.gg") || loweredUrl.includes("discord.com")) return "Discord";
    if (t.includes("website") || t.includes("site")) return "Website";
    return "Website";
  }

  const rawLinks = [];
  if (Array.isArray(pair?.info?.websites)) {
    pair.info.websites.forEach((item) => {
      if (item?.url) rawLinks.push({ url: item.url, label: classifyLink(item.url, item.label || item.type || "website") });
    });
  }
  if (Array.isArray(pair?.info?.socials)) {
    pair.info.socials.forEach((item) => {
      if (item?.url) rawLinks.push({ url: item.url, label: classifyLink(item.url, item.type) });
    });
  }
  if (pump?.twitter) rawLinks.push({ url: pump.twitter, label: "Twitter/X" });
  if (pump?.telegram) rawLinks.push({ url: pump.telegram, label: "Telegram" });
  if (pump?.website) rawLinks.push({ url: pump.website, label: "Website" });

  const seenLinks = new Set();
  const links = rawLinks.filter((item) => {
    const key = String(item.url || "");
    if (!key || seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  return {
    kind: "token_info_widget",
    name,
    symbol,
    address,
    imageUrl,
    marketCap: formatCompactUsd(marketCap),
    volume24h: formatCompactUsd(volume24h),
    priceUsd: formatUsdPrecise(priceUsd),
    dexId: formatLaunchpadName(pair, pump),
    pairUrl: pair?.url || "",
    lore: "",
    links: links.slice(0, 5),
    textSummary: `${name} (${symbol}) | Price: ${formatUsdPrecise(priceUsd)} | MCap: ${formatCompactUsd(marketCap)} | Vol 24h: ${formatCompactUsd(volume24h)}`,
  };
}

window.generateTokenLoreForWidget = async function generateTokenLoreForWidget(tokenPayload) {
  const token = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const name = String(token.name || "Unknown token");
  const symbol = String(token.symbol || "N/A");
  const address = String(token.address || "");
  const links = Array.isArray(token.links) ? token.links : [];

  const scrapedLore = await fetchLoreFromWebLinks(links, name, symbol, address);
  const fallbackLore = scrapedLore || "Could not find enough community/web text to generate lore for this token right now.";
  const polishedLore = await polishLoreWithAI(fallbackLore, name, symbol);
  return polishedLore || fallbackLore;
};

window.getTopTokensForLaunchpad = async function getTopTokensForLaunchpad(launchpadId) {
  return fetchTopTokensForLaunchpad(launchpadId);
};

async function requestOpenAIReply(messages) {
  const base =
    typeof window !== "undefined" && window.LYKEION_API_BASE
      ? String(window.LYKEION_API_BASE).replace(/\/$/, "")
      : "";
  const proxyUrl = `${base}/api/openai-chat`;

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const ct = response.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await response.json() : {};
    if (response.ok && typeof data.text === "string") {
      return data.text.trim();
    }
    if (!response.ok && data && typeof data.error === "string") {
      throw new Error(data.error);
    }
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (msg && !msg.includes("Failed to fetch") && !msg.includes("NetworkError")) {
      throw err;
    }
  }

  if (!OPENAI_API_KEY) {
    throw new Error(
      "OpenAI is not configured. Start the app with the Node server (npm run dev), set OPENAI_API_KEY in .env, " +
        "and open this page from the server URL (e.g. http://localhost:3000/pages/lykeion-ai.html). " +
        "Optional: set window.LYKEION_SECRETS.openai only for local browser-direct calls (not recommended for production)."
    );
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "gpt-4o-mini", messages }),
  });

  if (!response.ok) {
    let details = "";
    try {
      const errData = await response.json();
      if (errData && errData.error && typeof errData.error.message === "string") {
        details = errData.error.message;
      }
    } catch {}
    throw new Error(details || `OpenAI request failed (${response.status})`);
  }

  const data = await response.json();
  if (
    data && data.choices && data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
  ) {
    return data.choices[0].message.content.trim();
  }
  return "";
}

async function getBotResponse(userMessage) {
  if (isNameIntent(userMessage)) {
    return "I'm Lykeion Assistant.";
  }
  if (isCapabilitiesIntent(userMessage)) {
    return getCapabilitiesResponse();
  }
  const priceQuery = extractPriceQuery(userMessage);
  if (priceQuery) return getCryptoPriceResponse(priceQuery);
  if (isWalletAnalysisIntent(userMessage)) {
    const walletPayload = await getWalletAnalysisPayload(userMessage);
    if (walletPayload) return walletPayload;
  }
  if (isLaunchpadVolumeIntent(userMessage)) {
    const launchpadWidget = await fetchLaunchpadVolumeWidgetData(userMessage);
    if (launchpadWidget) return launchpadWidget;
  }
  const tokenPayload = await getTokenLookupPayload(userMessage);
  if (tokenPayload) return tokenPayload;

  // Fetch course context and fresh web context in parallel
  const [courseContext, freshContext] = await Promise.all([
    fetchCourseContext(userMessage),
    fetchFreshContext(userMessage),
  ]);

  const messages = [{ role: "system", content: SOLANA_ASSISTANT_SYSTEM_PROMPT }];

  if (courseContext) {
    messages.push({
      role: "system",
      content:
        "Relevant Lykeion course excerpts:\n" + courseContext + "\n\n" +
        "Treat this course context as high-priority when it matches the user question.",
    });
  }

  if (freshContext) {
    messages.push({
      role: "system",
      content:
        `Recent external context (fetched at ${new Date().toISOString()}):\n` +
        freshContext + "\n\nPrefer this recent context for current-events questions.",
    });
  }

  // Inject last 10 turns for multi-turn context, then the new user message
  messages.push(...conversationHistory.slice(-10));
  messages.push({ role: "user", content: userMessage });

  let firstReply = await requestOpenAIReply(messages);

  // Retry once with forced context if the reply sounds like a stale-knowledge fallback
  if (looksLikeKnowledgeCutoffReply(firstReply)) {
    const [forcedCourse, forcedFresh] = await Promise.all([
      fetchCourseContext(userMessage, true),
      fetchFreshContext(userMessage, true),
    ]);
    const retryFresh = forcedFresh || freshContext;
    const retryCourse = forcedCourse || courseContext;

    if (retryFresh || retryCourse) {
      const retryMessages = [{ role: "system", content: SOLANA_ASSISTANT_SYSTEM_PROMPT }];
      if (retryCourse) {
        retryMessages.push({
          role: "system",
          content:
            "Relevant Lykeion course excerpts:\n" + retryCourse + "\n\n" +
            "Prioritize these excerpts when they answer the question directly.",
        });
      }
      retryMessages.push({
        role: "system",
        content:
          `Verified external context (fetched at ${new Date().toISOString()}):\n` +
          (retryFresh || "No external web snippet available.") + "\n\n" +
          "Answer directly using this context. Do not include knowledge-cutoff disclaimers.",
      });
      retryMessages.push(...conversationHistory.slice(-10));
      retryMessages.push({ role: "user", content: userMessage });

      const retriedReply = await requestOpenAIReply(retryMessages);
      if (retriedReply) return retriedReply;
    }
  }

  return firstReply || "Sorry, I couldn't generate a response.";
}

function initLykeionChatUi() {
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const introContent = document.querySelector(".ai-container > .ai-message-content");
  let hasSentFirstMessage = false;

  if (!chatForm || !chatInput) return;

  // Auth: redirect if logged out, load history if logged in
  window.__firebaseReadyPromise
    .then(function () {
      firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
          window.location.href = "login.html";
          return;
        }
        currentUserId = user.uid;
        await loadChatHistory();
      });
    })
    .catch(function (err) {
      console.error("Firebase init failed:", err);
    });

  async function loadChatHistory() {
    if (!currentUserId) return;
    const history = await getChatHistory(currentUserId, 40);
    if (!history.length) return;

    if (introContent) introContent.style.display = "none";
    hasSentFirstMessage = true;

    for (const msg of history) {
      appendMessage(msg.message, msg.isUser ? "user" : "bot");
      conversationHistory.push({
        role: msg.isUser ? "user" : "assistant",
        content: msg.message,
      });
    }
  }

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleSend();
  });

  async function handleSend() {
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    if (!hasSentFirstMessage) {
      hasSentFirstMessage = true;
      if (introContent) introContent.style.display = "none";
    }

    appendMessage(userMessage, "user");
    conversationHistory.push({ role: "user", content: userMessage });
    if (currentUserId) saveChatMessage(currentUserId, userMessage, true);

    chatInput.value = "";
    setInputDisabled(true);

    const typingEl = appendTypingIndicator();
    try {
      const botMessage = await getBotResponse(userMessage);
      if (isPriceQuotePayload(botMessage)) {
        renderPriceWidget(typingEl, botMessage);
        conversationHistory.push({ role: "assistant", content: botMessage.textSummary || "Price snapshot." });
        if (currentUserId) saveChatMessage(currentUserId, botMessage.textSummary || "Price snapshot.", false);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      } else if (isWalletAnalysisPayload(botMessage)) {
        renderWalletAnalysisWidget(typingEl, botMessage);
        conversationHistory.push({ role: "assistant", content: botMessage.textSummary || `Wallet ${botMessage.wallet || ""}`.trim() });
        if (currentUserId) saveChatMessage(currentUserId, botMessage.textSummary || `Wallet ${botMessage.wallet || ""}`.trim(), false);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      } else if (isHotTokensPayload(botMessage)) {
        renderHotTokensWidget(typingEl, botMessage);
        conversationHistory.push({ role: "assistant", content: botMessage.textSummary || "Hot Solana tokens snapshot." });
        if (currentUserId) saveChatMessage(currentUserId, botMessage.textSummary || "Hot Solana tokens snapshot.", false);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      } else if (isLaunchpadVolumePayload(botMessage)) {
        renderLaunchpadVolumeWidget(typingEl, botMessage);
        conversationHistory.push({ role: "assistant", content: botMessage.textSummary || "Daily trench stats snapshot." });
        if (currentUserId) saveChatMessage(currentUserId, botMessage.textSummary || "Daily trench stats snapshot.", false);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      } else if (isTokenInfoPayload(botMessage)) {
        renderTokenWidget(typingEl, botMessage);
        conversationHistory.push({ role: "assistant", content: botMessage.textSummary });
        if (currentUserId) saveChatMessage(currentUserId, botMessage.textSummary, false);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      } else {
        const formatted = formatAssistantText(
          botMessage || "Sorry, I couldn't generate a response.",
          userMessage
        );
        conversationHistory.push({ role: "assistant", content: formatted });
        if (currentUserId) saveChatMessage(currentUserId, formatted, false);
        await typewriterToElement(typingEl, formatted);
        typingEl.classList.remove("typing");
        typingEl.classList.add("typewriter-done");
      }
    } catch (error) {
      console.error("Error fetching bot response:", error);
      const msg = (error && error.message) ||
        "Sorry, something went wrong. Please try again later (check the browser console).";
      await typewriterToElement(typingEl, formatAssistantText(msg, userMessage));
      typingEl.classList.remove("typing");
      typingEl.classList.add("typewriter-done");
    } finally {
      setInputDisabled(false);
      chatInput.focus();
    }
  }

  function setInputDisabled(isDisabled) {
    chatInput.disabled = isDisabled;
    if (sendBtn) sendBtn.disabled = isDisabled;
  }
}

// This script may be injected after DOMContentLoaded (via bootstrap-secrets-remote),
// so fire init immediately if the DOM is already parsed.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLykeionChatUi);
} else {
  initLykeionChatUi();
}
