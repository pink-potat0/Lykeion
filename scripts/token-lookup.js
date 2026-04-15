// Solana base58 alphabet excludes: 0, O, I, l (ambiguous chars)
const SOLANA_ADDRESS_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

function extractSolanaAddress(message) {
  const match = String(message || "").match(SOLANA_ADDRESS_RE);
  return match ? match[1] : null;
}

function formatLargeNum(value) {
  if (value === null || value === undefined || typeof value !== "number" || isNaN(value)) return "N/A";
  if (value >= 1_000_000_000) return "$" + (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return "$" + (value / 1_000).toFixed(2) + "K";
  return "$" + value.toFixed(2);
}

function formatTokenPrice(priceUsd) {
  const n = parseFloat(priceUsd);
  if (isNaN(n)) return "N/A";
  if (n < 0.000001) return "$" + n.toExponential(3);
  if (n < 0.01) return "$" + n.toFixed(8);
  if (n < 1) return "$" + n.toFixed(6);
  return "$" + n.toFixed(4);
}

async function fetchDexScreenerToken(address) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.pairs || !data.pairs.length) return null;

    // Prefer Solana pairs, fall back to any chain
    const solanaPairs = data.pairs.filter((p) => p.chainId === "solana");
    const pool = solanaPairs.length ? solanaPairs : data.pairs;

    // Pick the pair with highest liquidity as the "main" market
    return pool.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  } catch {
    return null;
  }
}

async function fetchPumpFunToken(address) {
  try {
    const res = await fetch(
      `https://frontend-api.pump.fun/coins/${encodeURIComponent(address)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Validate it's a real coin response
    return data && (data.mint || data.symbol) ? data : null;
  } catch {
    // CORS or network failure — graceful no-op
    return null;
  }
}

async function lookupSolanaToken(address) {
  const [dexResult, pumpResult] = await Promise.allSettled([
    fetchDexScreenerToken(address),
    fetchPumpFunToken(address),
  ]);

  const dexData = dexResult.status === "fulfilled" ? dexResult.value : null;
  const pumpData = pumpResult.status === "fulfilled" ? pumpResult.value : null;

  if (!dexData && !pumpData) return null;

  return { dexData, pumpData, address };
}

function buildTokenContextString(tokenInfo) {
  if (!tokenInfo) return "";
  const { dexData, pumpData, address } = tokenInfo;
  const lines = [];

  const name = dexData?.baseToken?.name || pumpData?.name || "Unknown";
  const symbol = dexData?.baseToken?.symbol || pumpData?.symbol || "???";
  lines.push(`Token: ${name} ($${symbol})`);
  lines.push(`Contract: ${address}`);

  if (dexData) {
    if (dexData.priceUsd) lines.push(`Price: ${formatTokenPrice(dexData.priceUsd)}`);
    const mcap = dexData.marketCap || dexData.fdv;
    if (mcap) lines.push(`Market Cap: ${formatLargeNum(mcap)}`);
    if (dexData.volume?.h24) lines.push(`24h Volume: ${formatLargeNum(dexData.volume.h24)}`);
    if (dexData.priceChange?.h24 !== undefined)
      lines.push(`24h Change: ${dexData.priceChange.h24.toFixed(2)}%`);
    if (dexData.liquidity?.usd) lines.push(`Liquidity: ${formatLargeNum(dexData.liquidity.usd)}`);
    if (dexData.dexId) lines.push(`Listed on: ${dexData.dexId}`);
    if (dexData.url) lines.push(`Chart: ${dexData.url}`);
  }

  if (pumpData) {
    if (pumpData.description) lines.push(`Lore/Description: ${pumpData.description}`);
    if (typeof pumpData.complete === "boolean")
      lines.push(`Bonding curve: ${pumpData.complete ? "Completed — graduated to Raydium" : "Still on pump.fun bonding curve"}`);
    if (pumpData.twitter) lines.push(`Twitter: @${pumpData.twitter}`);
    if (pumpData.telegram) lines.push(`Telegram: ${pumpData.telegram}`);
    if (pumpData.website) lines.push(`Website: ${pumpData.website}`);
  }

  return lines.join("\n");
}
