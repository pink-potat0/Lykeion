function _chatContainer() {
  return document.getElementById("chat-container");
}

function isPriceQuotePayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "price_quote_widget");
}

function isTokenInfoPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "token_info_widget");
}

function isLaunchpadVolumePayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "launchpad_volume_widget");
}

function isHotTokensPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "hot_tokens_widget");
}

function isWalletAnalysisPayload(value) {
  return Boolean(value && typeof value === "object" && value.kind === "wallet_analysis_widget");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendMessage(message, sender) {
  const container = _chatContainer();
  if (!container) return null;
  const el = document.createElement("div");
  el.classList.add("message", sender);
  el.textContent = message;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function appendTypingIndicator() {
  const container = _chatContainer();
  if (!container) return null;
  const el = document.createElement("div");
  el.classList.add("message", "bot", "typing");
  el.innerHTML = `
    <span class="typing-dots" aria-label="Assistant is typing">
      <span></span><span></span><span></span>
    </span>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderPriceWidget(element, quote) {
  if (!element || !quote) return;
  const container = _chatContainer();
  const changeClass =
    quote.changeDirection === "up" ? "price-up" :
    quote.changeDirection === "down" ? "price-down" : "price-flat";
  const safeName = escapeHtml(quote.assetName || quote.symbol || "Asset");
  const safeSymbol = escapeHtml(quote.symbol || "");
  const safePrice = escapeHtml(quote.priceUsd || "N/A");
  const safeChange = escapeHtml(quote.change24h || "N/A");
  const safeImage = quote.imageUrl ? escapeHtml(quote.imageUrl) : "";

  element.classList.add("price-quote-widget");
  element.innerHTML = `
    <div class="price-widget-header">
      ${safeImage ? `<img class="price-widget-image" src="${safeImage}" alt="${safeName} logo" loading="lazy" />` : ""}
      <div class="price-widget-title-wrap">
        <span class="price-asset">${safeName}</span>
        <span class="price-symbol">${safeSymbol}/USD</span>
      </div>
    </div>
    <div class="price-main-row">
      <span class="price-value">${safePrice}</span>
      <span class="price-change ${changeClass}">${safeChange}</span>
    </div>
  `;
  if (container) container.scrollTop = container.scrollHeight;
}

function openBubbleMapModal(tokenAddress, tokenName) {
  const existing = document.getElementById("bubble-map-modal");
  if (existing) existing.remove();

  const safeName = escapeHtml(tokenName || tokenAddress);
  const iframeSrc = `https://app.insightx.network/atlas/solana/${tokenAddress}`;

  const modal = document.createElement("div");
  modal.id = "bubble-map-modal";
  modal.className = "bubble-map-modal-overlay";
  modal.innerHTML = `
    <div class="bubble-map-modal-box">
      <div class="bubble-map-modal-header">
        <span class="bubble-map-modal-title">Bubble Map · ${safeName}</span>
        <button class="bubble-map-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="bubble-map-modal-body">
        <iframe
          src="${iframeSrc}"
          allow="clipboard-write"
          allowfullscreen
          class="bubble-map-iframe"
          title="Bubble Map for ${safeName}"
        ></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("is-open"));

  const close = () => {
    modal.classList.remove("is-open");
    setTimeout(() => modal.remove(), 220);
  };

  modal.querySelector(".bubble-map-modal-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  });
}

function renderTokenWidget(element, token) {
  if (!element || !token) return;
  const container = _chatContainer();
  const safeName = escapeHtml(token.name || "Unknown token");
  const safeSymbol = escapeHtml(token.symbol || "N/A");
  const safeAddress = escapeHtml(token.address || "N/A");
  const safePrice = escapeHtml(token.priceUsd || "N/A");
  const safeMarketCap = escapeHtml(token.marketCap || "N/A");
  const safeVol = escapeHtml(token.volume24h || "N/A");
  const safeDex = escapeHtml(token.dexId || "N/A");
  const safeLore = escapeHtml(token.lore || "");
  const safeImage = token.imageUrl ? escapeHtml(token.imageUrl) : "";
  const safePairUrl = token.pairUrl ? escapeHtml(token.pairUrl) : "";
  const safeLinks = Array.isArray(token.links) ? token.links.slice(0, 5) : [];
  const rawAddress = String(token.address || "").trim();
  const tradeUrl = rawAddress ? `https://trade.padre.gg/trade/solana/${encodeURIComponent(rawAddress)}?rk=ppotato` : "";

  element.classList.add("token-info-widget");
  element.innerHTML = `
    <div class="token-widget-header">
      ${safeImage ? `<img class="token-widget-image" src="${safeImage}" alt="${safeName} logo" loading="lazy" />` : ""}
      <div class="token-widget-title-wrap">
        <span class="token-widget-name">${safeName}</span>
        <span class="token-widget-symbol">${safeSymbol}</span>
      </div>
    </div>
    <div class="token-widget-grid">
      <div><span class="token-key">Price</span><span class="token-value">${safePrice}</span></div>
      <div><span class="token-key">Market Cap</span><span class="token-value">${safeMarketCap}</span></div>
      <div><span class="token-key">Volume (24h)</span><span class="token-value">${safeVol}</span></div>
      <div><span class="token-key">Launchpad</span><span class="token-value">${safeDex}</span></div>
    </div>
    <div class="token-widget-address">${safeAddress}</div>
    <div class="token-widget-lore${safeLore ? "" : " is-empty"}">${safeLore}</div>
    <button class="token-generate-lore-btn" type="button">Generate lore</button>
    <div class="token-widget-actions">
      ${rawAddress ? `<button class="token-bubble-map-btn" type="button">Bubble Map</button>` : ""}
    </div>
    <div class="token-widget-links">
      ${safePairUrl ? `<a href="${safePairUrl}" target="_blank" rel="noopener noreferrer">Dexscreener</a>` : ""}
      ${tradeUrl ? `<a href="${tradeUrl}" target="_blank" rel="noopener noreferrer" class="token-trade-link">Trade</a>` : ""}
      ${safeLinks
        .map((link) => {
          const url = escapeHtml(link?.url || "");
          if (!url) return "";
          const label = escapeHtml(link?.label || "Website");
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        })
        .join("")}
    </div>
  `;

  const loreBtn = element.querySelector(".token-generate-lore-btn");
  const loreEl = element.querySelector(".token-widget-lore");
  if (loreBtn && loreEl) {
    loreBtn.addEventListener("click", async () => {
      loreBtn.disabled = true;
      loreBtn.textContent = "Generating lore...";
      try {
        if (typeof window.generateTokenLoreForWidget !== "function") {
          throw new Error("Lore generator unavailable");
        }
        const generated = await window.generateTokenLoreForWidget(token);
        loreEl.textContent = String(generated || "No lore could be generated.");
        loreEl.classList.remove("is-empty");
        loreBtn.textContent = "Lore generated";
      } catch {
        loreEl.textContent = "Could not generate lore right now. Try again.";
        loreEl.classList.remove("is-empty");
        loreBtn.disabled = false;
        loreBtn.textContent = "Generate lore";
      }
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  const bubbleBtn = element.querySelector(".token-bubble-map-btn");
  if (bubbleBtn && rawAddress) {
    bubbleBtn.addEventListener("click", () => openBubbleMapModal(rawAddress, token.name || token.symbol));
  }

  if (container) container.scrollTop = container.scrollHeight;
}

function renderLaunchpadVolumeWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const launchpads = Array.isArray(payload.launchpads) ? payload.launchpads : [];
  const daily = payload.daily && typeof payload.daily === "object" ? payload.daily : null;
  const hasDaily = Boolean(daily);
  const renderDaily = hasDaily
    ? `
      <div class="launchpad-daily">
        <div class="launchpad-daily-title">🟣 Daily Trench Stats</div>
        <div>├ Volume: ${escapeHtml(daily.volume || "N/A")} (${escapeHtml(daily.volumeChange || "N/A")})</div>
        <div>├ Traders: ${escapeHtml(daily.traders || "N/A")} (${escapeHtml(daily.tradersChange || "N/A")})</div>
        <div>├ Created: ${escapeHtml(daily.created || "N/A")} (${escapeHtml(daily.createdChange || "N/A")})</div>
        <div>└ Graduated: ${escapeHtml(daily.graduated || "N/A")} (${escapeHtml(daily.graduatedChange || "N/A")})</div>
      </div>
    `
    : "";

  element.classList.add("launchpad-volume-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">${escapeHtml(payload.title || "Launchpad volume snapshot")}</div>
    <div class="launchpad-widget-subtitle">${payload.scannedPools ? `Scanned pools: ${escapeHtml(String(payload.scannedPools))} · ` : ""}Window: ${escapeHtml(payload.timeframe || "24h")}</div>
    ${renderDaily}
    <div class="launchpad-list">
      ${launchpads.map((lp, index) => `
        <div class="launchpad-item" data-launchpad-id="${escapeHtml(lp.id)}">
          <div class="launchpad-item-head">
            <span class="launchpad-rank">#${index + 1}</span>
            <span class="launchpad-name">${escapeHtml(lp.emoji || "")} ${escapeHtml(lp.name)} ${lp.shareChange ? `(${escapeHtml(lp.shareChange)})` : ""}</span>
          </div>
          <div class="launchpad-stats">
            <span>Volume: ${escapeHtml(lp.volume24h || "N/A")} ${lp.volumeChange ? `(${escapeHtml(lp.volumeChange)})` : ""}</span>
            <span>Traders: ${escapeHtml(lp.traders || "N/A")} ${lp.tradersChange ? `(${escapeHtml(lp.tradersChange)})` : ""}</span>
            <span>Created: ${escapeHtml(String(lp.created24h || "N/A"))} ${lp.createdChange ? `(${escapeHtml(lp.createdChange)})` : ""}</span>
            <span>Graduated: ${escapeHtml(String(lp.graduated || "N/A"))} ${lp.graduatedChange ? `(${escapeHtml(lp.graduatedChange)})` : ""} ${escapeHtml(lp.graduatedEmoji || "")}</span>
          </div>
          <button class="launchpad-load-btn" type="button">Top 10 tokens (last 24h)</button>
          <div class="launchpad-tokens"></div>
        </div>
      `).join("")}
    </div>
  `;

  const buttons = element.querySelectorAll(".launchpad-load-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const launchpadItem = btn.closest(".launchpad-item");
      if (!launchpadItem) return;
      const launchpadId = launchpadItem.getAttribute("data-launchpad-id");
      const tokensEl = launchpadItem.querySelector(".launchpad-tokens");
      if (!launchpadId || !tokensEl) return;
      btn.disabled = true;
      btn.textContent = "Loading...";
      tokensEl.innerHTML = "";
      try {
        if (typeof window.getTopTokensForLaunchpad !== "function") {
          throw new Error("Launchpad loader unavailable");
        }
        const tokens = await window.getTopTokensForLaunchpad(launchpadId);
        if (!Array.isArray(tokens) || !tokens.length) {
          tokensEl.innerHTML = `<div class="launchpad-no-tokens">No 24h token data found for this launchpad.</div>`;
        } else {
          tokensEl.innerHTML = `
            <ol class="launchpad-token-list launchpad-token-cards">
              ${tokens.map((token, i) => `
                <li class="launchpad-token-card">
                  <div class="launchpad-token-card-head">
                    <span class="launchpad-token-rank">#${i + 1}</span>
                    <div class="launchpad-token-main">
                      ${token.imageUrl
                        ? `<img class="launchpad-token-icon" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.symbol)} icon" loading="lazy" />`
                        : `<span class="launchpad-token-icon-fallback">${escapeHtml(String(token.symbol || "?").slice(0, 1))}</span>`
                      }
                      <div class="launchpad-token-name-wrap">
                        <span class="launchpad-token-name">${escapeHtml(token.symbol)} · ${escapeHtml(token.name)}</span>
                        <span class="launchpad-token-meta">Vol ${escapeHtml(token.volume24h)} · Price ${escapeHtml(token.priceUsd)}</span>
                      </div>
                    </div>
                  </div>
                  ${token.pairUrl ? `<a href="${escapeHtml(token.pairUrl)}" target="_blank" rel="noopener noreferrer">View chart</a>` : ""}
                </li>
              `).join("")}
            </ol>
          `;
        }
        btn.textContent = "Loaded";
      } catch {
        tokensEl.innerHTML = `<div class="launchpad-no-tokens">Could not load tokens right now.</div>`;
        btn.disabled = false;
        btn.textContent = "Top 10 tokens (last 24h)";
      }
      if (container) container.scrollTop = container.scrollHeight;
    });
  });

  if (container) container.scrollTop = container.scrollHeight;
}

function renderHotTokensWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  const generated = payload.generatedAt ? new Date(payload.generatedAt).toLocaleTimeString() : "";
  element.classList.add("hot-tokens-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">${escapeHtml(payload.title || "Hot Solana tokens")}</div>
    <div class="launchpad-widget-subtitle">Window: ${escapeHtml(payload.timeframe || "24h")} · Ranked by volume then market cap · Source: ${escapeHtml(payload.source || "N/A")}${generated ? ` · Updated: ${escapeHtml(generated)}` : ""}</div>
    ${tokens.length ? "" : `<div class="launchpad-no-tokens">No reliable tokens matched strict market cap/volume filters right now.</div>`}
    <ol class="launchpad-token-list launchpad-token-cards">
      ${tokens.map((token, i) => `
        <li class="launchpad-token-card">
          <div class="launchpad-token-card-head">
            <span class="launchpad-token-rank">#${i + 1}</span>
            <div class="launchpad-token-main">
              ${token.imageUrl
                ? `<img class="launchpad-token-icon" src="${escapeHtml(token.imageUrl)}" alt="${escapeHtml(token.symbol)} icon" loading="lazy" />`
                : `<span class="launchpad-token-icon-fallback">${escapeHtml(String(token.symbol || "?").slice(0, 1))}</span>`
              }
              <div class="launchpad-token-name-wrap">
                <span class="launchpad-token-name">${escapeHtml(token.symbol)} · ${escapeHtml(token.name)}</span>
                <span class="launchpad-token-meta">${escapeHtml(token.launchpad || "launchpad")} · Vol ${escapeHtml(token.volume24h)} · MC ${escapeHtml(token.marketCap)}</span>
              </div>
            </div>
          </div>
          ${token.pairUrl ? `<a href="${escapeHtml(token.pairUrl)}" target="_blank" rel="noopener noreferrer">Trade in terminal / view chart</a>` : ""}
        </li>
      `).join("")}
    </ol>
  `;
  if (container) container.scrollTop = container.scrollHeight;
}

function renderWalletAnalysisWidget(element, payload) {
  if (!element || !payload) return;
  const container = _chatContainer();
  const trades = Array.isArray(payload.topTrades) ? payload.topTrades : [];
  const netSol = String(payload.weekProfitSol || "");
  const netClass = netSol.trim().startsWith("-") ? "wallet-net-down" : "wallet-net-up";
  element.classList.add("wallet-analysis-widget");
  element.innerHTML = `
    <div class="launchpad-widget-title">Solana Wallet Analysis</div>
    <div class="launchpad-widget-subtitle">${escapeHtml(payload.wallet || "")}</div>
    ${payload.errorMessage ? `<div class="wallet-analysis-error">${escapeHtml(payload.errorMessage)}</div>` : ""}
    <div class="wallet-balance-block">
      <span class="token-key">Balance</span>
      <span class="wallet-balance-usd">${escapeHtml(payload.balanceUsd || "N/A")}</span>
      <span class="wallet-balance-sol">${escapeHtml(payload.balanceSol || "N/A")}</span>
    </div>
    <div class="wallet-net-block ${netClass}">
      <span class="token-key">7D Net</span>
      <span class="wallet-net-usd">${escapeHtml(payload.weekProfitUsd || "N/A")}</span>
      <span class="wallet-net-sol">${escapeHtml(payload.weekProfitSol || "N/A")}</span>
    </div>
    <div class="wallet-trades-title">Top Trades</div>
    <div class="wallet-trades-table" role="table" aria-label="Top wallet trades">
      <div class="wallet-trades-row wallet-trades-head" role="row">
        <span role="columnheader">Token</span>
        <span role="columnheader">Bought</span>
        <span role="columnheader">Sold</span>
        <span role="columnheader">P&amp;L</span>
      </div>
      ${trades.map((trade) => {
        const pnlText = String(trade.pnlSol || "N/A");
        const pnlClass = pnlText.trim().startsWith("-") ? "wallet-pnl-down" : "wallet-pnl-up";
        return `
          <div class="wallet-trades-row" role="row">
            <span class="wallet-trade-token" role="cell">${escapeHtml(trade.tokenLabel || "SOL")}</span>
            <span class="wallet-trade-value" role="cell">${escapeHtml(trade.boughtSol || "0.0000 SOL")}</span>
            <span class="wallet-trade-value" role="cell">${escapeHtml(trade.soldSol || "0.0000 SOL")}</span>
            <span class="wallet-trade-pnl ${pnlClass}" role="cell">${escapeHtml(pnlText)}</span>
          </div>
        `;
      }).join("")}
    </div>
    ${trades.length ? "" : `<div class="wallet-analysis-error">No token trade summaries were found in the last 7 days for this wallet.</div>`}
  `;
  if (container) container.scrollTop = container.scrollHeight;
}

function getTypewriterDelay(length) {
  if (length > 1400) return 1;
  if (length > 800) return 2;
  if (length > 450) return 4;
  if (length > 250) return 7;
  return 12;
}

async function typewriterToElement(element, text) {
  if (!element) return;
  const container = _chatContainer();
  element.textContent = "";
  const safeText = String(text || "");
  const delayMs = getTypewriterDelay(safeText.length);
  for (let i = 0; i < safeText.length; i += 1) {
    element.textContent += safeText[i];
    if (container) container.scrollTop = container.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function stripMarkdownNoise(text) {
  let value = String(text || "");
  value = value.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  value = value.replace(/^\s*[-*]\s+/gm, "• ");
  value = value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  value = value.replace(/^\s*>\s?/gm, "");
  value = value.replace(/\n{3,}/g, "\n\n");
  return value.trim();
}

function enforceConciseResponse(text, userMessage) {
  const input = String(text || "").trim();
  if (!input) return "";
  const query = String(userMessage || "").toLowerCase();
  const isCapabilitiesPrompt =
    /\bwhat can you do\b/.test(query) ||
    /\bwhat do you do\b/.test(query) ||
    /\byour features\b/.test(query) ||
    /\bhow can you help\b/.test(query);
  const asksComparisonOrGuide =
    /\b(vs|versus|difference|compare|how to|guide|steps?|explain|why|pros|cons|strategy|breakdown)\b/.test(query);
  const wantsList = /(list|give me\s+\d+|top\s+\d+|name\s+\d+)/.test(query);
  const wantsLongForm = /(explain|deep dive|in detail|step by step|comprehensive|everything you know|full guide|breakdown|all about)/.test(query);
  const wantsLongList = /(list out|all the|top \d+|best \d+|steps|strategies|reasons)/.test(query);
  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^(\d+\.\s+|[•\-]\s+)/.test(l));

  if (isCapabilitiesPrompt) {
    return input;
  }

  if ((wantsList || wantsLongList) && numbered.length >= 2) {
    const limit = wantsLongList ? 10 : 6;
    return numbered
      .slice(0, limit)
      .map((l, i) => `${i + 1}. ${l.replace(/^(\d+\.\s+|[•\-]\s+)/, "")}`)
      .join("\n");
  }

  if (wantsLongForm || asksComparisonOrGuide) {
    return input;
  }

  const sentences = input.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  // Keep answers concise by default, but avoid over-truncating useful detail.
  if (sentences && sentences.length > 8 && input.length > 1200 && !wantsLongForm && !wantsLongList) {
    return sentences.slice(0, 4).join(" ").trim();
  }

  return input;
}

function formatAssistantText(text, userMessage) {
  let value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value) return "";

  value = stripMarkdownNoise(value);
  value = enforceConciseResponse(value, userMessage);
  value = value.replace(/\n{3,}/g, "\n\n");

  const hasStructuredBlocks =
    /(^|\n)\s*([-*]\s+|\d+\.\s+)/m.test(value) || value.includes("\n\n");

  if (!hasStructuredBlocks && value.length > 280) {
    const sentences = value.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
    if (sentences && sentences.length > 2) {
      const paragraphs = [];
      for (let i = 0; i < sentences.length; i += 2) {
        paragraphs.push(sentences.slice(i, i + 2).join(" ").trim());
      }
      value = paragraphs.join("\n\n");
    }
  }

  return value;
}
