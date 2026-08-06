/**
 * lib/binance.ts
 * Core Binance API wrapper for OpenClaw.
 * Handles REST calls, signature generation, and response normalization.
 * All user API keys pass through here — never logged, never stored in plaintext.
 */

import crypto from 'crypto'
import axios, { AxiosInstance } from 'axios'

const BASE_URL = 'https://api.binance.com'
const BASE_URL_FUTURES = 'https://fapi.binance.com'
const TESTNET_URL = 'https://testnet.binance.vision'

export interface BinanceCredentials {
  apiKey: string
  apiSecret: string
  testnet?: boolean
}

export interface OrderParams {
  symbol: string           // e.g. BTCUSDT
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT_LIMIT'
  quantity?: number
  quoteOrderQty?: number   // for MARKET buys by USDT amount
  price?: number           // required for LIMIT
  stopPrice?: number       // required for STOP_LOSS_LIMIT
  timeInForce?: 'GTC' | 'IOC' | 'FOK'
  newClientOrderId?: string
}

export interface AccountInfo {
  makerCommission: number
  takerCommission: number
  canTrade: boolean
  canWithdraw: boolean
  canDeposit: boolean
  balances: Array<{
    asset: string
    free: string
    locked: string
  }>
  accountType: string
}

export interface TickerPrice {
  symbol: string
  price: string
  priceChangePercent?: string
}

export interface Kline {
  openTime: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  closeTime: number
}

// ─────────────────────────────────────────────────────────────────────────────
// BinanceClient — instantiated per request with user credentials
// ─────────────────────────────────────────────────────────────────────────────
export class BinanceClient {
  private apiKey: string
  private apiSecret: string
  private http: AxiosInstance
  private httpFutures: AxiosInstance

  constructor(credentials: BinanceCredentials) {
    this.apiKey = credentials.apiKey
    this.apiSecret = credentials.apiSecret

    const baseURL = credentials.testnet ? TESTNET_URL : BASE_URL

    this.http = axios.create({
      baseURL,
      headers: { 'X-MBX-APIKEY': this.apiKey },
      timeout: 10_000,
    })

    this.httpFutures = axios.create({
      baseURL: BASE_URL_FUTURES,
      headers: { 'X-MBX-APIKEY': this.apiKey },
      timeout: 10_000,
    })
  }

  // ── Signature ──────────────────────────────────────────────────────────────
  private sign(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex')
  }

  private buildQuery(params: Record<string, string | number | boolean>): string {
    const timestamp = Date.now()
    const p = { ...params, timestamp }
    const qs = Object.entries(p)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    const signature = this.sign(qs)
    return `${qs}&signature=${signature}`
  }

  // ── Account ────────────────────────────────────────────────────────────────
  async getAccount(): Promise<AccountInfo> {
    const qs = this.buildQuery({ recvWindow: 5000 })
    const { data } = await this.http.get(`/api/v3/account?${qs}`)
    return data
  }

  async getBalances(): Promise<Array<{ asset: string; free: number; locked: number; total: number }>> {
    const account = await this.getAccount()
    return account.balances
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }))
      .sort((a, b) => b.total - a.total)
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    const params: Record<string, string | number> = { recvWindow: 5000 }
    if (symbol) params.symbol = symbol
    const qs = this.buildQuery(params)
    const { data } = await this.http.get(`/api/v3/openOrders?${qs}`)
    return data
  }

  async getOrderHistory(symbol: string, limit = 20): Promise<any[]> {
    const qs = this.buildQuery({ symbol, limit, recvWindow: 5000 })
    const { data } = await this.http.get(`/api/v3/allOrders?${qs}`)
    return data
  }

  // ── Trading ────────────────────────────────────────────────────────────────
  async placeOrder(order: OrderParams): Promise<any> {
    const params: Record<string, string | number> = {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      recvWindow: 5000,
    }

    if (order.quantity) params.quantity = order.quantity
    if (order.quoteOrderQty) params.quoteOrderQty = order.quoteOrderQty
    if (order.price) params.price = order.price
    if (order.stopPrice) params.stopPrice = order.stopPrice
    if (order.timeInForce) params.timeInForce = order.timeInForce
    if (order.newClientOrderId) params.newClientOrderId = order.newClientOrderId

    const qs = this.buildQuery(params)
    const { data } = await this.http.post(`/api/v3/order?${qs}`)
    return data
  }

  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    const qs = this.buildQuery({ symbol, orderId, recvWindow: 5000 })
    const { data } = await this.http.delete(`/api/v3/order?${qs}`)
    return data
  }

  async cancelAllOrders(symbol: string): Promise<any> {
    const qs = this.buildQuery({ symbol, recvWindow: 5000 })
    const { data } = await this.http.delete(`/api/v3/openOrders?${qs}`)
    return data
  }

  // ── Test order (dry-run, no execution) ────────────────────────────────────
  async testOrder(order: OrderParams): Promise<{ valid: boolean; message: string }> {
    const params: Record<string, string | number> = {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      recvWindow: 5000,
    }
    if (order.quantity) params.quantity = order.quantity
    if (order.quoteOrderQty) params.quoteOrderQty = order.quoteOrderQty
    if (order.price) params.price = order.price
    if (order.timeInForce) params.timeInForce = order.timeInForce

    const qs = this.buildQuery(params)
    try {
      await this.http.post(`/api/v3/order/test?${qs}`)
      return { valid: true, message: 'Order is valid and would execute successfully.' }
    } catch (err: any) {
      return { valid: false, message: err?.response?.data?.msg || 'Invalid order parameters.' }
    }
  }

  // ── Market Data (no auth required, but using same client for convenience) ──
  async getPrice(symbol: string): Promise<number> {
    const { data } = await this.http.get(`/api/v3/ticker/price?symbol=${symbol}`)
    return parseFloat(data.price)
  }

  async get24hrTicker(symbol?: string): Promise<any> {
    const url = symbol
      ? `/api/v3/ticker/24hr?symbol=${symbol}`
      : `/api/v3/ticker/24hr`
    const { data } = await this.http.get(url)
    return data
  }

  async getOrderBook(symbol: string, limit = 10): Promise<{ bids: string[][]; asks: string[][] }> {
    const { data } = await this.http.get(`/api/v3/depth?symbol=${symbol}&limit=${limit}`)
    return data
  }

  async getKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
    const { data } = await this.http.get(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    )
    return data.map((k: any[]) => ({
      openTime: k[0],
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
      closeTime: k[6],
    }))
  }

  async getExchangeInfo(symbol?: string): Promise<any> {
    const url = symbol
      ? `/api/v3/exchangeInfo?symbol=${symbol}`
      : `/api/v3/exchangeInfo`
    const { data } = await this.http.get(url)
    return data
  }

  // ── Portfolio Valuation ────────────────────────────────────────────────────
  async getPortfolioValue(): Promise<{
    balances: Array<{ asset: string; qty: number; usdValue: number }>
    totalUSD: number
  }> {
    const balances = await this.getBalances()
    const stablecoins = new Set(['USDT', 'BUSD', 'USDC', 'FDUSD', 'TUSD'])

    const valued = await Promise.allSettled(
      balances.map(async b => {
        if (stablecoins.has(b.asset)) {
          return { asset: b.asset, qty: b.total, usdValue: b.total }
        }
        try {
          const price = await this.getPrice(`${b.asset}USDT`)
          return { asset: b.asset, qty: b.total, usdValue: b.total * price }
        } catch {
          return { asset: b.asset, qty: b.total, usdValue: 0 }
        }
      })
    )

    const result = valued
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(b => b.usdValue > 0.01)
      .sort((a, b) => b.usdValue - a.usdValue)

    const totalUSD = result.reduce((s, b) => s + b.usdValue, 0)
    return { balances: result, totalUSD }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public market data — no API key required
// ─────────────────────────────────────────────────────────────────────────────
export const publicMarket = {
  async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {}
    await Promise.allSettled(
      symbols.map(async sym => {
        try {
          const { data } = await axios.get(
            `${BASE_URL}/api/v3/ticker/price?symbol=${sym}`
          )
          results[sym] = parseFloat(data.price)
        } catch {}
      })
    )
    return results
  },

  async getTopMovers(limit = 10): Promise<any[]> {
    const { data } = await axios.get(`${BASE_URL}/api/v3/ticker/24hr`)
    return (data as any[])
      .filter(t => t.symbol.endsWith('USDT'))
      .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
      .slice(0, limit)
      .map(t => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume),
      }))
  },

  async getKlines(symbol: string, interval = '1h', limit = 100): Promise<Kline[]> {
    const { data } = await axios.get(
      `${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    )
    return data.map((k: any[]) => ({
      openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4],
      volume: k[5], closeTime: k[6],
    }))
  },

  async getServerTime(): Promise<number> {
    const { data } = await axios.get(`${BASE_URL}/api/v3/time`)
    return data.serverTime
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential encryption — keys stored encrypted in KV, decrypted per request
// ─────────────────────────────────────────────────────────────────────────────
const ENC_SECRET = process.env.ENCRYPTION_SECRET || 'openclaw_default_secret_32chars!!'

export function encryptCredentials(apiKey: string, apiSecret: string): string {
  const CryptoJS = require('crypto-js')
  const payload = JSON.stringify({ apiKey, apiSecret })
  return CryptoJS.AES.encrypt(payload, ENC_SECRET).toString()
}

export function decryptCredentials(encrypted: string): BinanceCredentials {
  const CryptoJS = require('crypto-js')
  const bytes = CryptoJS.AES.decrypt(encrypted, ENC_SECRET)
  const payload = JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
  return payload
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — extract credentials from request headers (set by frontend)
// ─────────────────────────────────────────────────────────────────────────────
export function getCredentialsFromHeaders(headers: Headers): BinanceCredentials | null {
  const apiKey = headers.get('x-binance-key')
  const apiSecret = headers.get('x-binance-secret')
  if (!apiKey || !apiSecret) return null
  return { apiKey, apiSecret }
}
