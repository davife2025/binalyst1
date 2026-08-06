/**
 * lib/goat/client.ts — Session 2
 *
 * GoatClient — execution layer for the GOAT Network autonomous trading agent.
 * Same pattern as lib/twak/client.ts (BSC/PancakeSwap) but for GOAT Network.
 * Fully independent — no imports from lib/twak/.
 *
 * Execution path:
 *  BTC balance check → Uniswap V3 QuoterV2 (price quote) →
 *  SwapRouter02 (exactInputSingle) → receipt → trade record
 *
 * Mainnet-only for swaps (Uniswap V3 deployed mainnet only).
 * Testnet3: BTC transfers work, swaps return a dry-run simulation.
 */

import { ethers } from 'ethers'
import {
  GoatNetwork,
  GOAT_RPC, GOAT_RPC_BACKUP, GOAT_CHAIN_ID, GOAT_EXPLORER,
  GOAT_AGENT_DEFAULTS, UNISWAP_V3_CONTRACTS,
  WBTC_GOAT_MAINNET, USDC_GOAT_MAINNET,
} from './config'
import type { RiskProfile } from '../agentLoop'

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

const SWAP_ROUTER_ABI = [
  `function exactInputSingle(tuple(
    address tokenIn,
    address tokenOut,
    uint24  fee,
    address recipient,
    uint256 amountIn,
    uint256 amountOutMinimum,
    uint160 sqrtPriceLimitX96
  ) params) external payable returns (uint256 amountOut)`,
]

const QUOTER_V2_ABI = [
  `function quoteExactInputSingle(tuple(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint24  fee,
    uint160 sqrtPriceLimitX96
  ) params) external returns (
    uint256 amountOut,
    uint160 sqrtPriceX96After,
    uint32  initializedTicksCrossed,
    uint256 gasEstimate
  )`,
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GoatSwapParams {
  tokenIn:   string  // ERC-20 address (or 'BTC' for native)
  tokenOut:  string  // ERC-20 address
  amountIn:  number  // human-readable amount
  decimalsIn: number
  feeTier:   number  // Uniswap V3 fee: 500 | 3000 | 10000
  slippagePct: number
}

export interface GoatSwapResult {
  success:   boolean
  txHash:    string
  amountOut: number
  error?:    string
  simulated: boolean  // true on testnet3 (no DEX deployed)
}

export interface GoatGuardrailResult {
  allowed: boolean
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardrails (GOAT-specific, wraps RiskProfile)
// ─────────────────────────────────────────────────────────────────────────────

export function checkGoatGuardrails(params: {
  profile:       RiskProfile
  btcBalance:    number
  portfolioUSD:  number
  amountUSD:     number
  drawdownPct:   number
  todayTrades:   number
  network:       GoatNetwork
}): GoatGuardrailResult {
  const { profile, btcBalance, portfolioUSD, amountUSD, drawdownPct, todayTrades, network } = params

  if (btcBalance < GOAT_AGENT_DEFAULTS.MIN_BTC_GAS_RESERVE)
    return { allowed: false, reason: `BTC balance ${btcBalance.toFixed(8)} below gas reserve ${GOAT_AGENT_DEFAULTS.MIN_BTC_GAS_RESERVE}` }

  if (drawdownPct >= profile.maxDrawdownPct)
    return { allowed: false, reason: `Drawdown ${drawdownPct.toFixed(1)}% exceeds your ${profile.maxDrawdownPct}% limit` }

  if (todayTrades >= profile.maxDailyTrades)
    return { allowed: false, reason: `Daily trade limit ${profile.maxDailyTrades} reached` }

  const maxPositionUSD = portfolioUSD * (profile.maxPositionPct / 100)
  if (amountUSD > maxPositionUSD)
    return { allowed: false, reason: `Position $${amountUSD.toFixed(2)} exceeds ${profile.maxPositionPct}% cap ($${maxPositionUSD.toFixed(2)})` }

  return { allowed: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// GoatClient
// ─────────────────────────────────────────────────────────────────────────────

export class GoatClient {
  private provider: ethers.JsonRpcProvider
  private wallet:   ethers.Wallet
  public  address:  string
  public  network:  GoatNetwork

  constructor(privateKey: string, network: GoatNetwork = 'testnet3') {
    this.network  = network
    this.provider = new ethers.JsonRpcProvider(GOAT_RPC[network])
    this.wallet   = new ethers.Wallet(privateKey, this.provider)
    this.address  = this.wallet.address
  }

  getWallet(): ethers.Wallet { return this.wallet }
  getChainId(): number       { return GOAT_CHAIN_ID[this.network] }
  explorerTx(hash: string)   { return `${GOAT_EXPLORER[this.network]}/tx/${hash}` }

  // ── RPC fallback ────────────────────────────────────────────────────────────
  private async withFallback<T>(fn: (p: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    try {
      return await fn(this.provider)
    } catch {
      const backup = new ethers.JsonRpcProvider(GOAT_RPC_BACKUP[this.network])
      return fn(backup)
    }
  }

  // ── Balances ────────────────────────────────────────────────────────────────

  /** Native BTC balance (gas token, 18 decimals). */
  async getBTCBalance(): Promise<number> {
    const bal = await this.withFallback(p => p.getBalance(this.address))
    return parseFloat(ethers.formatEther(bal))
  }

  /** ERC-20 token balance. */
  async getTokenBalance(tokenAddress: string): Promise<{ balance: number; decimals: number; symbol: string }> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider)
    const [rawBal, decimals, symbol] = await Promise.all([
      contract.balanceOf(this.address) as Promise<bigint>,
      contract.decimals()              as Promise<number>,
      contract.symbol()                as Promise<string>,
    ])
    return { balance: parseFloat(ethers.formatUnits(rawBal, decimals)), decimals, symbol }
  }

  /** Summarised portfolio: BTC + any configured tokens. */
  async getPortfolio(): Promise<{ btc: number; tokens: Record<string, number> }> {
    const btc = await this.getBTCBalance()
    const tokens: Record<string, number> = {}

    // If mainnet and token addresses are configured, fetch them
    if (this.network === 'mainnet') {
      if (WBTC_GOAT_MAINNET) {
        const w = await this.getTokenBalance(WBTC_GOAT_MAINNET)
        tokens['WBTC'] = w.balance
      }
      if (USDC_GOAT_MAINNET) {
        const u = await this.getTokenBalance(USDC_GOAT_MAINNET)
        tokens['USDC'] = u.balance
      }
    }

    return { btc, tokens }
  }

  // ── BTC transfer ─────────────────────────────────────────────────────────────

  async sendBTC(to: string, amount: number): Promise<{ txHash: string; success: boolean; error?: string }> {
    try {
      const tx  = await this.wallet.sendTransaction({ to, value: ethers.parseEther(amount.toString()) })
      const rec = await tx.wait()
      return { txHash: rec?.hash ?? tx.hash, success: true }
    } catch (err: any) {
      return { txHash: '', success: false, error: err.message }
    }
  }

  // ── Uniswap V3 — quote ───────────────────────────────────────────────────────

  /**
   * Get an exact-input quote from Uniswap V3 QuoterV2 (mainnet only).
   * On testnet3 returns a simulated quote based on amountIn (no real price).
   */
  async getSwapQuote(params: GoatSwapParams): Promise<{ amountOut: number; simulated: boolean }> {
    if (this.network !== 'mainnet') {
      // testnet3: simulate with 1:1 minus slippage so the flow can be tested
      return { amountOut: params.amountIn * (1 - params.slippagePct / 100), simulated: true }
    }

    const quoter   = new ethers.Contract(UNISWAP_V3_CONTRACTS.quoterV2, QUOTER_V2_ABI, this.provider)
    const amountIn = ethers.parseUnits(params.amountIn.toString(), params.decimalsIn)

    const [amountOut] = await quoter.quoteExactInputSingle.staticCall({
      tokenIn:           params.tokenIn,
      tokenOut:          params.tokenOut,
      amountIn,
      fee:               params.feeTier,
      sqrtPriceLimitX96: 0,
    })

    // amountOut is in tokenOut's decimals — we don't know them here, return raw bigint as string
    // Caller is responsible for formatting with correct decimals
    return { amountOut: parseFloat(ethers.formatUnits(amountOut, 18)), simulated: false }
  }

  // ── Uniswap V3 — swap ────────────────────────────────────────────────────────

  /**
   * Execute an exactInputSingle swap on Uniswap V3 (mainnet only).
   * On testnet3, simulates the trade and returns a fake txHash so the
   * agent loop can be tested end-to-end without real funds.
   */
  async swap(params: GoatSwapParams): Promise<GoatSwapResult> {
    if (this.network !== 'mainnet') {
      return {
        success: true,
        txHash:  `sim_${Date.now().toString(16)}`,
        amountOut: params.amountIn * (1 - params.slippagePct / 100),
        simulated: true,
      }
    }

    try {
      const router   = new ethers.Contract(UNISWAP_V3_CONTRACTS.swapRouter02, SWAP_ROUTER_ABI, this.wallet)
      const amountIn = ethers.parseUnits(params.amountIn.toString(), params.decimalsIn)

      // Approve router if tokenIn is ERC-20 (not native BTC)
      if (params.tokenIn !== 'BTC') {
        const token = new ethers.Contract(params.tokenIn, ERC20_ABI, this.wallet)
        const allowance: bigint = await token.allowance(this.address, UNISWAP_V3_CONTRACTS.swapRouter02)
        if (allowance < amountIn) {
          const approveTx = await token.approve(UNISWAP_V3_CONTRACTS.swapRouter02, amountIn * BigInt(2), { gasLimit: 100_000 })
          await approveTx.wait()
        }
      }

      // Calculate minimum output with slippage
      const quote       = await this.getSwapQuote(params)
      const minAmountOut = quote.amountOut * (1 - params.slippagePct / 100)

      const tx = await router.exactInputSingle(
        {
          tokenIn:           params.tokenIn,
          tokenOut:          params.tokenOut,
          fee:               params.feeTier,
          recipient:         this.address,
          amountIn,
          amountOutMinimum:  ethers.parseUnits(minAmountOut.toFixed(6), 18),
          sqrtPriceLimitX96: 0,
        },
        { gasLimit: GOAT_AGENT_DEFAULTS.GAS_LIMIT_SWAP }
      )
      const rec = await tx.wait()

      return { success: true, txHash: rec.hash, amountOut: quote.amountOut, simulated: false }
    } catch (err: any) {
      console.error('[GoatClient.swap]', err.message)
      return { success: false, txHash: '', amountOut: 0, error: err.message, simulated: false }
    }
  }

  // ── Wallet helpers ────────────────────────────────────────────────────────────

  async signMessage(msg: string): Promise<string> {
    return this.wallet.signMessage(msg)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone wallet helpers (used by LiveAgentTab wallet setup)
// ─────────────────────────────────────────────────────────────────────────────

export function generateGoatWallet() {
  const w = ethers.Wallet.createRandom()
  return { address: w.address, privateKey: w.privateKey, mnemonic: w.mnemonic?.phrase ?? '' }
}

export function goatWalletFromPrivateKey(privateKey: string) {
  const pk = privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`
  const w  = new ethers.Wallet(pk)
  return { address: w.address, privateKey: w.privateKey }
}

export function goatWalletFromMnemonic(mnemonic: string) {
  const w = ethers.Wallet.fromPhrase(mnemonic.trim())
  return { address: w.address, privateKey: w.privateKey }
}

export async function encryptGoatPrivateKey(privateKey: string, password: string): Promise<string> {
  return new ethers.Wallet(privateKey).encrypt(password)
}

export async function decryptGoatPrivateKey(encryptedJson: string, password: string): Promise<string> {
  const w = await ethers.Wallet.fromEncryptedJson(encryptedJson, password)
  return w.privateKey
}
