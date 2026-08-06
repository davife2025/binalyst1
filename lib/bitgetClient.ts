/**
 * lib/bitgetClient.ts
 * Session O — Bitget API client
 *
 * Covers:
 *   Account   — balance, positions, sub-accounts
 *   Market    — ticker, depth, klines
 *   Skill Hub — technical-analysis, sentiment-analyst, market-intel,
 *               news-briefing, macro-analyst
 *   Trading   — place/cancel order, open orders, order history
 *
 * All requests are server-side only (API key never exposed to browser).
 * The browser calls /api/bitget/* routes which proxy to this client.
 */

import axios, { AxiosInstance } from 'axios'
import crypto from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE     = 'https://api.bitget.com'
const SKILL    = 'https://api.bitget.com/api/v2/mix/skill'

export interface BitgetCredentials {
  apiKey:     string
  secretKey:  string
  passphrase: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature
// ─────────────────────────────────────────────────────────────────────────────

function sign(
  timestamp:  string,
  method:     string,
  path:       string,
  body:       string,
  secretKey:  string,
): string {
  const msg = `${timestamp}${method.toUpperCase()}${path}${body}`
  return crypto.createHmac('sha256', secretKey).update(msg).digest('base64')
}

function headers(
  creds:     BitgetCredentials,
  method:    string,
  path:      string,
  body = '',
) {
  const ts  = Date.now().toString()
  const sig = sign(ts, method, path, body, creds.secretKey)
  return {
    'ACCESS-KEY':        creds.apiKey,
    'ACCESS-SIGN':       sig,
    'ACCESS-TIMESTAMP':  ts,
    'ACCESS-PASSPHRASE': creds.passphrase,
    'Content-Type':      'application/json',
    'locale':            'en-US',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BitgetClient class
// ─────────────────────────────────────────────────────────────────────────────

export class BitgetClient {
  private creds: BitgetCredentials

  constructor(creds: BitgetCredentials) {
    this.creds = creds
  }

  private async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    const qs  = params ? '?' + new URLSearchParams(params as any).toString() : ''
    const fullPath = path + qs
    const res = await axios.get(`${BASE}${fullPath}`, {
      headers: headers(this.creds, 'GET', fullPath),
      timeout: 12_000,
    })
    return res.data
  }

  private async post<T = any>(path: string, body: any): Promise<T> {
    const bodyStr = JSON.stringify(body)
    const res = await axios.post(`${BASE}${path}`, bodyStr, {
      headers: headers(this.creds, 'POST', path, bodyStr),
      timeout: 12_000,
    })
    return res.data
  }

  // ── Account ───────────────────────────────────────────────────────────────

  async getAccountAssets(productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/account/accounts', { productType })
  }

  async getSpotAccountAssets() {
    return this.get('/api/v2/spot/account/assets')
  }

  async getAccountInfo() {
    return this.get('/api/v2/user/info')
  }

  async getPositions(productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/position/all-position', { productType })
  }

  async getSubAccounts() {
    return this.get('/api/v2/user/virtual-subaccount-list')
  }

  // ── Market ────────────────────────────────────────────────────────────────

  async getTicker(symbol: string, productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/market/ticker', { symbol, productType })
  }

  async getKlines(symbol: string, granularity = '1H', limit = 100, productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/market/candles', { symbol, granularity, limit, productType })
  }

  async getOrderbook(symbol: string, productType = 'USDT-FUTURES', limit = 20) {
    return this.get('/api/v2/mix/market/merge-depth', { symbol, productType, limit })
  }

  async getFundingRate(symbol: string, productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/market/current-fund-rate', { symbol, productType })
  }

  // ── Trading ───────────────────────────────────────────────────────────────

  async placeOrder(params: {
    symbol:      string
    productType: string
    marginMode:  string
    marginCoin:  string
    side:        string
    orderType:   string
    size:        string
    price?:      string
    tradeSide?:  string
  }) {
    return this.post('/api/v2/mix/order/place-order', params)
  }

  async cancelOrder(symbol: string, orderId: string, productType = 'USDT-FUTURES') {
    return this.post('/api/v2/mix/order/cancel-order', { symbol, orderId, productType })
  }

  async getOpenOrders(symbol: string, productType = 'USDT-FUTURES') {
    return this.get('/api/v2/mix/order/orders-pending', { symbol, productType })
  }

  async getOrderHistory(symbol: string, productType = 'USDT-FUTURES', limit = 50) {
    return this.get('/api/v2/mix/order/history', { symbol, productType, limit })
  }

  // ── Skill Hub: technical-analysis ─────────────────────────────────────────

  async getTechnicalAnalysis(symbol: string, granularity = '1H') {
    // Falls back to local computation if Skill Hub not available
    try {
      return await this.get('/api/v2/mix/market/technical-analysis', {
        symbol: `${symbol.replace('USDT', '')}USDT_UMCBL`,
        granularity,
      })
    } catch {
      return { code: 'FALLBACK', msg: 'Using local computation' }
    }
  }

  // ── Skill Hub: sentiment-analyst ──────────────────────────────────────────

  async getSentiment(symbol = 'BTCUSDT') {
    try {
      return await this.get('/api/v2/mix/market/sentiment', { symbol })
    } catch {
      return { code: 'FALLBACK', data: null }
    }
  }

  // ── Skill Hub: market-intel ───────────────────────────────────────────────

  async getMarketIntel() {
    try {
      return await this.get('/api/v2/mix/market/intel')
    } catch {
      return { code: 'FALLBACK', data: null }
    }
  }

  // ── Skill Hub: news-briefing ──────────────────────────────────────────────

  async getNewsBriefing(keyword?: string) {
    try {
      return await this.get('/api/v2/mix/market/news', keyword ? { keyword } : {})
    } catch {
      return { code: 'FALLBACK', data: null }
    }
  }

  // ── Skill Hub: macro-analyst ──────────────────────────────────────────────

  async getMacroAnalysis() {
    try {
      return await this.get('/api/v2/mix/market/macro')
    } catch {
      return { code: 'FALLBACK', data: null }
    }
  }

  // ── Validate credentials ──────────────────────────────────────────────────

  async validateCredentials(): Promise<{ valid: boolean; uid?: string; error?: string }> {
    try {
      const data = await this.getAccountInfo()
      if (data?.code === '00000') {
        return { valid: true, uid: data.data?.userId ?? data.data?.uid }
      }
      return { valid: false, error: data?.msg ?? 'Invalid credentials' }
    } catch (e: any) {
      return { valid: false, error: e.message ?? 'Connection failed' }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — builds client from env vars (server-side)
// ─────────────────────────────────────────────────────────────────────────────

export function bitgetClientFromEnv(): BitgetClient | null {
  const apiKey     = process.env.BITGET_API_KEY
  const secretKey  = process.env.BITGET_SECRET_KEY
  const passphrase = process.env.BITGET_PASSPHRASE
  if (!apiKey || !secretKey || !passphrase) return null
  return new BitgetClient({ apiKey, secretKey, passphrase })
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Hub metadata — for the Tools UI
// ─────────────────────────────────────────────────────────────────────────────

export const BITGET_SKILLS = [
  {
    id:       'technical-analysis',
    name:     'Technical Analysis',
    icon:     '📊',
    desc:     '23 indicators across 6 categories — RSI, MACD, Bollinger Bands, ADX, EMA, OBV, Stoch, ATR, CCI, Williams %R, MFI, CMF, VWAP, pivot points',
    endpoint: 'getTechnicalAnalysis',
    params:   ['symbol', 'granularity'],
    badge:    'Session J',
  },
  {
    id:       'sentiment-analyst',
    name:     'Sentiment Analyst',
    icon:     '🧭',
    desc:     'Funding rates, long/short ratios, open interest, Fear & Greed, social sentiment scores across major exchanges',
    endpoint: 'getSentiment',
    params:   ['symbol'],
    badge:    null,
  },
  {
    id:       'market-intel',
    name:     'Market Intel',
    icon:     '🔭',
    desc:     'ETF inflows/outflows, whale wallet activity, DeFi TVL, institutional positioning, BTC dominance signals',
    endpoint: 'getMarketIntel',
    params:   [],
    badge:    null,
  },
  {
    id:       'news-briefing',
    name:     'News Briefing',
    icon:     '📰',
    desc:     'Real-time news aggregation, narrative synthesis, keyword search, sentiment tagging on headlines',
    endpoint: 'getNewsBriefing',
    params:   ['keyword?'],
    badge:    null,
  },
  {
    id:       'macro-analyst',
    name:     'Macro Analyst',
    icon:     '🌐',
    desc:     'Fed policy signals, BTC vs DXY/Nasdaq/Gold correlation, macro regime classification, rate cycle positioning',
    endpoint: 'getMacroAnalysis',
    params:   [],
    badge:    null,
  },
] as const

export const BITGET_TRADING_APIS = [
  { category: 'Account',  apis: ['Get Account Assets', 'Get Spot Assets', 'Get Positions', 'Get Sub-Accounts', 'Account Info'] },
  { category: 'Market',   apis: ['Get Ticker', 'Get Klines', 'Get Orderbook', 'Get Funding Rate', 'Get Open Interest'] },
  { category: 'Trading',  apis: ['Place Order', 'Cancel Order', 'Get Open Orders', 'Get Order History', 'Batch Orders'] },
  { category: 'Strategy', apis: ['TWAP Order', 'Iceberg Order', 'Stop-Loss Order', 'Take-Profit Order', 'Grid Strategy'] },
] as const
