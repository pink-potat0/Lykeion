const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize OpenAI (fail gracefully so server still starts)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('OPENAI_API_KEY is missing. /api/chat will return 500 until it is set.');
}

// Solana tools/functions that the AI can call
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_price',
      description: 'Get the current price of a Solana token by symbol (e.g., SOL, USDC, BONK) or contract address (mint address)',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Token symbol (SOL, USDC, BONK) or contract address (mint address)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_token',
      description: 'Analyze a Solana token by its contract address (mint address). Returns price, volume, liquidity, holders, and risk assessment.',
      parameters: {
        type: 'object',
        properties: {
          mint: {
            type: 'string',
            description: 'The contract address (mint address) of the token to analyze',
          },
        },
        required: ['mint'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_swap_quote',
      description: 'Get a swap quote for trading between two tokens on Solana. Returns expected output amount, route, slippage, and fees. Does NOT execute the swap.',
      parameters: {
        type: 'object',
        properties: {
          inputMint: {
            type: 'string',
            description: 'The contract address (mint) of the input token. Use "So11111111111111111111111111111111111111112" for SOL',
          },
          outputMint: {
            type: 'string',
            description: 'The contract address (mint) of the output token. Use "So11111111111111111111111111111111111111112" for SOL',
          },
          amount: {
            type: 'string',
            description: 'The amount to swap (in the input token\'s smallest unit, e.g., lamports for SOL)',
          },
          slippageBps: {
            type: 'number',
            description: 'Slippage tolerance in basis points (100 = 1%). Default is 50 (0.5%)',
            default: 50,
          },
        },
        required: ['inputMint', 'outputMint', 'amount'],
      },
    },
  },
];

// System prompt for the AI
const SYSTEM_PROMPT = `You are a helpful Solana trading assistant. Your role is to:

1. Answer questions about Solana, trading, memecoins, and DeFi
2. Help users check token prices
3. Analyze tokens by contract address
4. Get swap quotes (but NEVER execute trades without explicit user confirmation)
5. Explain trading concepts in simple terms

IMPORTANT RULES:
- Always verify contract addresses before providing information
- When getting swap quotes, explain what will happen but ask for confirmation before executing
- Never execute transactions directly - always require user confirmation
- If a user asks to buy/sell, get a quote first and show them the details
- Be honest about risks, especially with memecoins
- Use the tools available to get real data, don't make up prices or information

Be friendly, helpful, and educational.`;

// Implement the actual tool functions
async function executeTool(toolName, args) {
  switch (toolName) {
    case 'get_price':
      return await getPrice(args.query);
    
    case 'analyze_token':
      return await analyzeToken(args.mint);
    
    case 'get_swap_quote':
      return await getSwapQuote(args.inputMint, args.outputMint, args.amount, args.slippageBps || 50);
    
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Tool implementations
async function getPrice(query) {
  try {
    // Check if it's a common token symbol
    const symbolMap = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    };

    const mint = symbolMap[query.toUpperCase()] || query;

    // Use Jupiter API for price
    const response = await fetch(`https://price.jup.ag/v4/price?ids=${mint}`);
    const data = await response.json();

    if (data.data && data.data[mint]) {
      const priceData = data.data[mint];
      return {
        success: true,
        symbol: query,
        mint: mint,
        price: priceData.price,
        priceUsd: `$${priceData.price.toFixed(6)}`,
      };
    }

    // Fallback to CoinGecko for SOL
    if (query.toUpperCase() === 'SOL') {
      const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const cgData = await cgResponse.json();
      if (cgData.solana) {
        return {
          success: true,
          symbol: 'SOL',
          price: cgData.solana.usd,
          priceUsd: `$${cgData.solana.usd.toFixed(2)}`,
        };
      }
    }

    return {
      success: false,
      error: 'Price not found. Please check the token symbol or contract address.',
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching price: ${error.message}`,
    };
  }
}

async function analyzeToken(mint) {
  try {
    // Get price first
    const priceData = await getPrice(mint);
    
    // Get token info from Jupiter
    const response = await fetch(`https://token.jup.ag/strict`);
    const tokens = await response.json();
    const token = tokens.find(t => t.address === mint);

    // Basic analysis
    const analysis = {
      success: true,
      mint: mint,
      price: priceData.success ? priceData.priceUsd : 'N/A',
      name: token?.name || 'Unknown',
      symbol: token?.symbol || 'Unknown',
      decimals: token?.decimals || 9,
      warning: 'This is a basic analysis. Always do your own research (DYOR) before trading.',
      riskLevel: 'Unknown - Insufficient data',
    };

    // Add risk assessment based on available data
    if (!token) {
      analysis.riskLevel = 'High - Token not found in Jupiter registry';
      analysis.warning += ' Token may be new or potentially risky.';
    }

    return analysis;
  } catch (error) {
    return {
      success: false,
      error: `Error analyzing token: ${error.message}`,
    };
  }
}

async function getSwapQuote(inputMint, outputMint, amount, slippageBps) {
  try {
    // Use Jupiter API for swap quotes
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    const response = await fetch(quoteUrl);
    const data = await response.json();

    if (data.error) {
      return {
        success: false,
        error: data.error,
      };
    }

    return {
      success: true,
      inputMint: inputMint,
      outputMint: outputMint,
      inputAmount: data.inAmount,
      outputAmount: data.outAmount,
      outputAmountFormatted: (parseInt(data.outAmount) / Math.pow(10, 9)).toFixed(6), // Assuming 9 decimals
      priceImpact: data.priceImpactPct ? `${data.priceImpactPct}%` : 'N/A',
      route: data.routePlan || [],
      slippage: `${slippageBps / 100}%`,
      fees: '~$0.0025 (Solana network fee)',
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting swap quote: ${error.message}`,
    };
  }
}

function normalizePumpfunToken(coin) {
  if (!coin || typeof coin !== 'object') return null;
  const createdTimestamp =
    coin.created_timestamp ||
    coin.creationTime ||
    coin.createdTimestamp ||
    coin.createdAt ||
    coin.created_at ||
    null;
  return {
    mint: coin.mint || coin.coinMint || null,
    symbol: coin.symbol || coin.ticker || null,
    name: coin.name || null,
    image_uri: coin.image_uri || coin.imageUrl || null,
    usd_market_cap: coin.usd_market_cap || coin.usdMarketCap || coin.market_cap || coin.marketCap || null,
    volume_24h: coin.volume_24h || coin.volume24h || coin.total_volume || coin.volume || null,
    created_timestamp: createdTimestamp,
    twitter: coin.twitter || null,
    website: coin.website || coin.websiteUrl || coin.web || null,
    telegram: coin.telegram || coin.telegramUrl || coin.tg || null,
  };
}

function parsePumpfunTimestampMs(value) {
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      value = asNumber;
    } else {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  let timestamp = Number(value);
  if (timestamp > 0 && timestamp < 1000000000000) {
    timestamp *= 1000;
  }

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return timestamp;
}

function dedupePumpfunTokens(tokens) {
  const seen = new Set();
  return tokens.filter((token) => {
    const mint = String(token?.mint || '').trim();
    if (!mint || seen.has(mint)) return false;
    seen.add(mint);
    return true;
  });
}

function filterPumpfunTokens(tokens, options = {}) {
  const minMarketCap = Number(options.minMarketCap);
  const maxMarketCap = Number(options.maxMarketCap);
  const maxAgeSeconds = Number(options.maxAgeSeconds);
  const nowMs = Date.now();

  return tokens.filter((token) => {
    const createdMs = parsePumpfunTimestampMs(token?.created_timestamp);
    if (!createdMs) return false;

    const marketCap = Number(token?.usd_market_cap || token?.market_cap);
    if (Number.isFinite(minMarketCap) && (!Number.isFinite(marketCap) || marketCap < minMarketCap)) {
      return false;
    }
    if (Number.isFinite(maxMarketCap) && (!Number.isFinite(marketCap) || marketCap > maxMarketCap)) {
      return false;
    }

    if (Number.isFinite(maxAgeSeconds)) {
      const ageSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
      if (ageSeconds > maxAgeSeconds) return false;
    }

    return true;
  });
}

async function fetchLatestPumpfunTokens(limit = 120) {
  const requested = Math.max(1, Math.min(300, Number(limit) || 120));
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(requested / pageSize));
  const endpointBuilders = [
    (offset) => `https://frontend-api-v3.pump.fun/coins?offset=${offset}&limit=${pageSize}&sort=created_timestamp&order=DESC&includeNsfw=false`,
    (offset) => `https://advanced-api-v2.pump.fun/coins/list?offset=${offset}&limit=${pageSize}`,
  ];

  for (const buildUrl of endpointBuilders) {
    const allTokens = [];
    for (let page = 0; page < pageCount; page += 1) {
      const offset = page * pageSize;
      try {
        const response = await fetch(buildUrl(offset));
        if (!response.ok) break;
        const payload = await response.json();
        const rawTokens = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.coins)
            ? payload.coins
            : [];
        const normalizedTokens = rawTokens
          .map(normalizePumpfunToken)
          .filter((token) => token && token.mint && token.symbol && token.name);

        if (!normalizedTokens.length) break;
        allTokens.push(...normalizedTokens);

        if (rawTokens.length < pageSize) break;
      } catch {
        break;
      }
    }

    if (allTokens.length) {
      return dedupePumpfunTokens(allTokens).sort((a, b) => {
        const aCreated = parsePumpfunTimestampMs(a.created_timestamp) || 0;
        const bCreated = parsePumpfunTimestampMs(b.created_timestamp) || 0;
        return bCreated - aCreated;
      });
    }
  }

  return [];
}

// Proxy for lykeion-ai.js (browser): uses server OPENAI_API_KEY so the client never needs a key.
app.post('/api/openai-chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (!openai) {
      return res.status(500).json({
        error: 'Server is missing OPENAI_API_KEY. Add it in .env (local) or Vercel environment variables.',
      });
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    res.json({ text });
  } catch (error) {
    console.error('openai-chat error:', error);
    res.status(500).json({
      error: error.message || 'OpenAI request failed',
    });
  }
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!openai) {
      return res.status(500).json({
        error: 'Server is missing OPENAI_API_KEY. Create a .env file in the project root with OPENAI_API_KEY=... and restart the server.'
      });
    }

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini for cost efficiency, can upgrade to gpt-4o
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });

    const assistantMessage = completion.choices[0].message;
    let finalResponse = assistantMessage.content || '';
    let requiresConfirmation = false;
    let confirmationData = null;

    // If the model wants to call a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCalls = assistantMessage.tool_calls;
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolName, toolArgs);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result),
        });
      }

      // Second API call with tool results
      const secondMessages = [
        ...messages,
        assistantMessage,
        ...toolResults,
      ];

      const secondCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: secondMessages,
        tools: tools,
        tool_choice: 'auto',
      });

      const secondMessage = secondCompletion.choices[0].message;
      finalResponse = secondMessage.content || '';

      // Check if this is a swap request that needs confirmation
      if (toolCalls.some(tc => tc.function.name === 'get_swap_quote')) {
        const swapCall = toolCalls.find(tc => tc.function.name === 'get_swap_quote');
        if (swapCall) {
          const swapArgs = JSON.parse(swapCall.function.arguments);
          const swapResult = toolResults.find(tr => tr.name === 'get_swap_quote');
          if (swapResult && JSON.parse(swapResult.content).success) {
            requiresConfirmation = true;
            confirmationData = {
              action: 'swap',
              inputMint: swapArgs.inputMint,
              outputMint: swapArgs.outputMint,
              amount: swapArgs.amount,
              ...JSON.parse(swapResult.content),
            };
          }
        }
      }
    }

    res.json({
      response: finalResponse,
      requiresConfirmation: requiresConfirmation,
      confirmationData: confirmationData,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while processing your request',
    });
  }
});

app.get('/api/pumpfun/new', async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit) || 120;
    const tokens = await fetchLatestPumpfunTokens(requestedLimit);
    if (!tokens.length) {
      return res.status(503).json({ error: 'Unable to fetch Pump.fun tokens right now', tokens: [] });
    }

    const filteredTokens = filterPumpfunTokens(tokens, {
      minMarketCap: req.query.minMarketCap,
      maxMarketCap: req.query.maxMarketCap,
      maxAgeSeconds: req.query.maxAgeSeconds,
    }).slice(0, Math.max(1, Math.min(50, requestedLimit)));

    res.json({ tokens: filteredTokens });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Pump.fun fetch failed', tokens: [] });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Vercel serverless runs this file without listening; local dev uses app.listen.
module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Make sure to set OPENAI_API_KEY in your .env file`);
  });
}
