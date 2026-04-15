const COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";
const DEXSCREENER_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
const CRYPTO_ICON_BASE_URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color";

function formatUsd(value) {
  if (!Number.isFinite(value)) return "N/A";
  if (value !== 0 && Math.abs(value) < 0.00000001) {
    return `$${value.toExponential(4)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 8 : 2,
  }).format(value);
}

function cleanCoinIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w.\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coinNameToSymbol(name) {
  const map = {
    bitcoin: "BTC", ethereum: "ETH", solana: "SOL",
    "usd coin": "USDC", usdc: "USDC", tether: "USDT",
    ripple: "XRP", bnb: "BNB", dogecoin: "DOGE", cardano: "ADA",
    tron: "TRX", avalanche: "AVAX", sui: "SUI", pepe: "PEPE",
    hyperliquid: "HYPE", hype: "HYPE",
    bonk: "BONK", wif: "WIF", "dogwifhat": "WIF", "dog wif hat": "WIF",
    jupiter: "JUP", jup: "JUP", raydium: "RAY", ray: "RAY",
    orca: "ORCA", pyth: "PYTH", "pyth network": "PYTH",
    jito: "JTO", "jito governance token": "JTO", wormhole: "W",
    tensor: "TNSR", "drift protocol": "DRIFT", drift: "DRIFT",
    helium: "HNT", render: "RENDER", "render token": "RENDER",
    "book of meme": "BOME", bome: "BOME", popcat: "POPCAT",
    mew: "MEW", wen: "WEN", "cat in a dogs world": "MEW",
    bonkbot: "BONK", marinadestakedsol: "MSOL",
    "marinade staked sol": "MSOL", lido: "STSOL",
    "lido staked sol": "STSOL", "world liberty financial": "WLFI",
    wlfi: "WLFI", "pump.fun": "PUMP", pumpfun: "PUMP", pump: "PUMP",
    "official trump": "TRUMP", trump: "TRUMP", fartcoin: "FARTCOIN",
  };
  return map[name] || null;
}

function coinNameToGeckoId(nameOrSymbol) {
  const key = String(nameOrSymbol || "").toLowerCase().trim();
  const map = {
    bitcoin: "bitcoin", btc: "bitcoin",
    ethereum: "ethereum", eth: "ethereum",
    solana: "solana", sol: "solana",
    "usd coin": "usd-coin", usdc: "usd-coin",
    tether: "tether", usdt: "tether",
    ripple: "ripple", xrp: "ripple",
    bnb: "binancecoin", binance: "binancecoin",
    dogecoin: "dogecoin", doge: "dogecoin",
    cardano: "cardano", ada: "cardano",
    tron: "tron", trx: "tron",
    hyperliquid: "hyperliquid", hype: "hyperliquid",
    avalanche: "avalanche-2", avax: "avalanche-2",
    sui: "sui", pepe: "pepe",
    bonk: "bonk",
    wif: "dogwifcoin", "dogwifhat": "dogwifcoin", "dog wif hat": "dogwifcoin",
    jupiter: "jupiter-exchange-solana", jup: "jupiter-exchange-solana",
    raydium: "raydium", ray: "raydium",
    orca: "orca",
    pyth: "pyth-network", "pyth network": "pyth-network",
    jito: "jito-governance-token", jto: "jito-governance-token",
    wormhole: "wormhole", w: "wormhole",
    tensor: "tensor", tnsr: "tensor",
    drift: "drift-protocol", "drift protocol": "drift-protocol",
    helium: "helium", hnt: "helium",
    render: "render-token", "render token": "render-token",
    "book of meme": "book-of-meme", bome: "book-of-meme",
    popcat: "popcat",
    mew: "cat-in-a-dogs-world", "cat in a dogs world": "cat-in-a-dogs-world",
    wen: "wen-4",
    msol: "msol", "marinade staked sol": "msol",
    stsol: "lido-staked-sol", "lido staked sol": "lido-staked-sol",
    "world liberty financial": "world-liberty-financial",
    wlfi: "world-liberty-financial",
    "pump.fun": "pump-fun", pumpfun: "pump-fun", pump: "pump-fun",
    trump: "official-trump", trumpcoin: "official-trump",
    fartcoin: "fartcoin",
  };
  return map[key] || "";
}

function getSymbolFallbackImage(symbol) {
  const key = String(symbol || "").toLowerCase().trim();
  if (!key || key.length > 12) return "";
  return `${CRYPTO_ICON_BASE_URL}/${encodeURIComponent(key)}.png`;
}

function extractPriceQuery(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const patterns = [
    /(?:price\s+of|price\s+for)\s+([a-z0-9.\- ]{2,30})/i,
    /(?:what(?:'s| is)\s+the\s+price\s+of)\s+([a-z0-9.\- ]{2,30})/i,
    /(?:what(?:'s| is)\s+([a-z0-9.\- ]{2,30})\s+price)\??/i,
    /(?:how\s+much\s+is)\s+([a-z0-9.\- ]{2,30})/i,
    /^([a-z0-9.\-]{2,15})\s+price\??$/i,
    /(?:price)\s+([a-z0-9.\- ]{2,30})/i,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return cleanCoinIdentifier(match[1]);
  }

  return null;
}

function formatAssetName(identifier, geckoId, symbol) {
  const byId = {
    bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana",
    tether: "Tether", ripple: "Ripple", binancecoin: "BNB",
    dogecoin: "Dogecoin", cardano: "Cardano", tron: "Tron",
    hyperliquid: "Hyperliquid",
    "avalanche-2": "Avalanche", sui: "Sui", pepe: "Pepe",
    bonk: "Bonk", dogwifcoin: "Dogwifhat",
  };
  if (geckoId && byId[geckoId]) return byId[geckoId];
  const raw = String(identifier || symbol || "").trim();
  if (!raw) return "Asset";
  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function getCoinGeckoPriceResponse(identifier, symbol) {
  const geckoId = coinNameToGeckoId(identifier) || coinNameToGeckoId(symbol);
  if (!geckoId) return "";

  try {
    const url =
      `${COINGECKO_SIMPLE_PRICE_URL}?ids=${encodeURIComponent(geckoId)}` +
      "&vs_currencies=usd&include_24hr_change=true&include_market_cap=true";
    const response = await fetch(url);
    if (!response.ok) return "";
    const payload = await response.json();
    const quote = payload && payload[geckoId] ? payload[geckoId] : null;
    if (!quote || typeof quote.usd !== "number") return "";
    let imageUrl = "";

    try {
      const marketRes = await fetch(
        `${COINGECKO_MARKETS_URL}?vs_currency=usd&ids=${encodeURIComponent(geckoId)}&per_page=1&page=1&sparkline=false`
      );
      if (marketRes.ok) {
        const marketData = await marketRes.json();
        if (Array.isArray(marketData) && marketData[0] && typeof marketData[0].image === "string") {
          imageUrl = marketData[0].image;
        }
      }
    } catch {}

    const prettySymbol = symbol || identifier.toUpperCase();
    const assetName = formatAssetName(identifier, geckoId, prettySymbol);
    const price = formatUsd(quote.usd);
    const change24h =
      typeof quote.usd_24h_change === "number"
        ? `${Math.abs(quote.usd_24h_change).toFixed(1)}%`
        : "N/A";
    const changeDirection =
      typeof quote.usd_24h_change !== "number"
        ? "flat"
        : quote.usd_24h_change > 0
          ? "up"
          : quote.usd_24h_change < 0
            ? "down"
            : "flat";

    return {
      kind: "price_quote_widget",
      assetName,
      symbol: String(prettySymbol).toUpperCase(),
      priceUsd: price,
      change24h,
      changeDirection,
      imageUrl: imageUrl || getSymbolFallbackImage(prettySymbol),
    };
  } catch {
    return "";
  }
}

function pickBestSolanaPairByLiquidity(pairs, expectedSymbol) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const expected = String(expectedSymbol || "").toUpperCase();
  const solPairs = pairs.filter((pair) => String(pair?.chainId || "").toLowerCase() === "solana");
  const scoped = expected
    ? solPairs.filter((pair) =>
      String(pair?.baseToken?.symbol || "").toUpperCase() === expected ||
      String(pair?.quoteToken?.symbol || "").toUpperCase() === expected
    )
    : solPairs;
  const target = scoped.length ? scoped : solPairs;
  if (!target.length) return null;
  target.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  return target[0];
}

async function getDexScreenerPriceResponse(identifier, symbol) {
  try {
    const query = encodeURIComponent(symbol || identifier);
    const response = await fetch(`${DEXSCREENER_SEARCH_URL}?q=${query}`);
    if (!response.ok) return "";
    const payload = await response.json();
    const bestPair = pickBestSolanaPairByLiquidity(payload?.pairs || [], symbol);
    if (!bestPair) return "";

    const pairPrice = Number(bestPair?.priceUsd);
    if (!Number.isFinite(pairPrice)) return "";
    const h24 = Number(bestPair?.priceChange?.h24);
    const changeDirection =
      !Number.isFinite(h24) ? "flat" : h24 > 0 ? "up" : h24 < 0 ? "down" : "flat";
    const prettySymbol = String(bestPair?.baseToken?.symbol || symbol || identifier).toUpperCase();
    const assetName = String(bestPair?.baseToken?.name || identifier || prettySymbol);

    return {
      kind: "price_quote_widget",
      assetName,
      symbol: prettySymbol,
      priceUsd: formatUsd(pairPrice),
      change24h: Number.isFinite(h24) ? `${Math.abs(h24).toFixed(1)}%` : "N/A",
      changeDirection,
      imageUrl: bestPair?.info?.imageUrl || getSymbolFallbackImage(prettySymbol),
    };
  } catch {
    return "";
  }
}

async function getCryptoPriceResponse(identifier) {
  const maybeSymbol = identifier.toUpperCase().replace(/\s+/g, "");
  const mappedSymbol = coinNameToSymbol(identifier);
  const symbol = mappedSymbol || maybeSymbol;

  const geckoResponse = await getCoinGeckoPriceResponse(identifier, symbol);
  if (geckoResponse) return geckoResponse;

  const dexResponse = await getDexScreenerPriceResponse(identifier, symbol);
  if (dexResponse) return dexResponse;

  return `I couldn't find live price data for "${identifier}". Try a ticker symbol like BTC, ETH, or SOL.`;
}
