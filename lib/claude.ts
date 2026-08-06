/**
 * lib/claude.ts — Binalyst AI Agent
 * Using Kimi K2 (Hugging Face) — free, OpenAI-compatible.
 */

import OpenAI from 'openai'
import { BinanceClient, publicMarket, type BinanceCredentials } from './binance'
import {
  getMarketRankings, getTokenInfo, searchToken,
  getTokenAudit, getAddressInfo, getAddressTokenHoldings,
  getMemeRush, getAlphaTokens,
} from './skills/web3'

const kimi = new OpenAI({
  apiKey:  process.env.HUGGINGFACE_API_KEY!,
  baseURL: 'https://router.huggingface.co/v1',
})

const MODEL = 'moonshotai/Kimi-K2-Instruct'

export type AgentMode = 'assistant' | 'analyst' | 'trader' | 'educator'

const TOOLS: OpenAI.ChatCompletionTool[] = [
  { type: 'function', function: { name: 'get_price',         description: 'Get the current live price of any coin on Binance.', parameters: { type: 'object', properties: { symbol: { type: 'string', description: 'e.g. BTCUSDT' } }, required: ['symbol'] } } },
  { type: 'function', function: { name: 'get_top_movers',    description: 'Get the top gaining and losing coins on Binance in the last 24 hours.', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
  { type: 'function', function: { name: 'get_klines',        description: 'Get candlestick chart data for technical analysis.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string', description: '1m,5m,15m,1h,4h,1d' }, limit: { type: 'number' } }, required: ['symbol', 'interval'] } } },
  { type: 'function', function: { name: 'get_balances',      description: "Get the user's Binance wallet balances.", parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_open_orders',   description: "Get the user's open orders on Binance.", parameters: { type: 'object', properties: { symbol: { type: 'string' } } } } },
  { type: 'function', function: { name: 'skill_market_rank', description: 'Get crypto market rankings: trending, smart money, social hype, meme tokens.', parameters: { type: 'object', properties: { rankType: { type: 'string', enum: ['trending', 'smart_money', 'social_hype', 'meme', 'alpha'] }, chainId: { type: 'string' }, size: { type: 'number' } } } } },
  { type: 'function', function: { name: 'skill_token_info',  description: 'Look up on-chain token info: price, liquidity, market cap, holders.', parameters: { type: 'object', properties: { address: { type: 'string' }, keyword: { type: 'string' }, chainId: { type: 'string' } } } } },
  { type: 'function', function: { name: 'skill_token_audit', description: 'Security audit a token contract: rug pull, honeypot, ownership, liquidity lock.', parameters: { type: 'object', properties: { address: { type: 'string' }, chainId: { type: 'string' } }, required: ['address'] } } },
  { type: 'function', function: { name: 'skill_address_info',description: 'Analyze a wallet: token holdings, portfolio value, PnL, whale detection.', parameters: { type: 'object', properties: { address: { type: 'string' }, chainId: { type: 'string' } }, required: ['address'] } } },
  { type: 'function', function: { name: 'skill_meme_rush',   description: 'Discover trending meme tokens on Binance Web3 Pulse.', parameters: { type: 'object', properties: { sortBy: { type: 'string' }, chainId: { type: 'string' }, size: { type: 'number' } } } } },
  { type: 'function', function: { name: 'skill_alpha',       description: 'Get Binance Alpha token listings.', parameters: { type: 'object', properties: {} } } },
]

const SYSTEM: Record<AgentMode, string> = {
  assistant: `You are Binalyst, an elite AI assistant for Binance users. You have live access to Binance market data and Web3 Skills Hub. Use tools to get real data — never guess prices. Be concise and data-driven. Use **bold** for prices and key metrics.`,
  analyst:   `You are Binalyst's market analyst. Use skill_market_rank for trends, skill_token_info for fundamentals, skill_token_audit for risk. Structure: price → trend → on-chain signals → bull/bear cases.`,
  trader:    `You are Binalyst's trading assistant. Always validate before placing orders. Use skill_token_audit to check contract safety before recommending any token.`,
  educator:  `You are Binalyst Academy — a crypto educator. Use real examples and clear analogies. Use get_price for live data when discussing prices.`,
}

async function executeTool(name: string, args: any, credentials?: BinanceCredentials): Promise<any> {
  const binance = credentials ? new BinanceClient(credentials) : null
  switch (name) {
    case 'get_price': {
      const prices = await publicMarket.getPrices([args.symbol])
      return { symbol: args.symbol, price: prices[args.symbol] ?? 'not found' }
    }
    case 'get_top_movers':
      return await publicMarket.getTopMovers(args.limit ?? 10)
    case 'get_klines': {
      const klines = await publicMarket.getKlines(args.symbol, args.interval, args.limit ?? 50)
      const closes = klines.map((k: any) => parseFloat(k.close))
      return {
        symbol: args.symbol,
        currentPrice: closes[closes.length - 1],
        high: Math.max(...klines.map((k: any) => parseFloat(k.high))),
        low:  Math.min(...klines.map((k: any) => parseFloat(k.low))),
        change: ((closes[closes.length - 1] - closes[0]) / closes[0] * 100).toFixed(2) + '%',
      }
    }
    case 'get_balances':
      return binance ? await binance.getPortfolioValue() : { error: 'Connect your Binance API key.' }
    case 'get_open_orders':
      return binance ? await binance.getOpenOrders(args.symbol) : { error: 'Connect your Binance API key.' }
    case 'skill_market_rank':
      return await getMarketRankings({ rankType: args.rankType, chainId: args.chainId ?? '56', size: args.size ?? 20 })
    case 'skill_token_info':
      return args.keyword
        ? await searchToken({ keyword: args.keyword, chainId: args.chainId ?? '56' })
        : await getTokenInfo({ address: args.address, chainId: args.chainId ?? '56' })
    case 'skill_token_audit':
      return await getTokenAudit({ address: args.address, chainId: args.chainId ?? '56' })
    case 'skill_address_info': {
      const [info, holdings] = await Promise.allSettled([
        getAddressInfo({ address: args.address, chainId: args.chainId ?? '56' }),
        getAddressTokenHoldings({ address: args.address, chainId: args.chainId ?? '56' }),
      ])
      return {
        info:     info.status     === 'fulfilled' ? info.value     : null,
        holdings: holdings.status === 'fulfilled' ? holdings.value : [],
      }
    }
    case 'skill_meme_rush':
      return await getMemeRush({ chainId: args.chainId ?? '56', sortBy: args.sortBy ?? 'trending', size: args.size ?? 20 })
    case 'skill_alpha':
      return await getAlphaTokens()
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export interface AgentMessage { role: 'user' | 'assistant'; content: string }

export async function runAgent({
  messages, mode = 'assistant', credentials, onChunk,
}: {
  messages:          AgentMessage[]
  mode?:             AgentMode
  credentials?:      BinanceCredentials
  autoTradeEnabled?: boolean
  onChunk?:          (text: string) => void
}): Promise<{ text: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = []
  const history: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM[mode] },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  for (let i = 0; i < 8; i++) {
    const response = await kimi.chat.completions.create({
      model: MODEL,
      messages: history,
      tools: TOOLS,
      tool_choice: 'auto',
    })

    const msg  = response.choices[0].message
    history.push(msg as any)

    const text = msg.content ?? ''
    if (text && onChunk) onChunk(text)

    if (!msg.tool_calls?.length) return { text, toolsUsed }

    for (const tc of msg.tool_calls) {
      if (tc.type !== 'function') continue
      toolsUsed.push(tc.function.name)
      try {
        const args   = JSON.parse(tc.function.arguments)
        const result = await executeTool(tc.function.name, args, credentials)
        history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      } catch (err: any) {
        history.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) })
      }
    }
  }

  const finalText = history
    .filter(m => m.role === 'assistant')
    .map(m => m.content ?? '')
    .join('')
  return { text: finalText, toolsUsed }
}