/**
 * lib/goat/client.ts — Session 2, re-platformed on KeeperHub
 *
 * GoatClient — trading client for the GOAT Network autonomous agent.
 * GOAT Network is still the *chain* the agent trades on (native BTC gas,
 * Uniswap V3 deployed on mainnet); KeeperHub is now the *execution layer*
 * that actually signs and broadcasts — see https://docs.keeperhub.com.
 *
 * Execution path:
 *  BTC balance check (read-only RPC) → Uniswap V3 QuoterV2 (price quote,
 *  read-only) → KeeperHub simulate → KeeperHub broadcast (signed by the
 *  org's KeeperHub-managed wallet, smart gas + MEV-protected private
 *  routing, audit-logged) → chain-verified receipt → trade record
 *
 * All reads (balances, quotes) stay on direct RPC — no wallet needed.
 * Native BTC transfers go through KeeperHub's Direct Execution API
 * (lib/keeperhub/client.ts) on *both* mainnet and testnet3 whenever
 * KEEPERHUB_API_KEY is configured — testnet3 is the intended place to
 * exercise real KeeperHub execution (simulate → broadcast → chain-verified
 * receipt) without mainnet funds at risk. Uniswap V3 swaps only go through
 * KeeperHub on mainnet, since Uniswap V3 is not deployed on GOAT testnet3
 * (see UNISWAP_V3_CONTRACTS note in ./config) — swaps simulate locally on
 * testnet3 regardless of KeeperHub configuration. When no KeeperHub key is
 * configured at all, both networks fall back to a local ethers dry-run
 * path (mainnet transfers are refused outright rather than locally signed).
 */

import { ethers } from 'ethers'
import {
  GoatNetwork,
  GOAT_RPC, GOAT_RPC_BACKUP, GOAT_CHAIN_ID, GOAT_EXPLORER,
  GOAT_AGENT_DEFAULTS, UNISWAP_V3_CONTRACTS,
  WBTC_GOAT_MAINNET, USDC_GOAT_MAINNET,
} from './config'
import type { RiskProfile } from '../agentLoop'
import { getKeeperHubClient, hasKeeperHub } from '../keeperhub/client'

// SwapRouter02.exactInputSingle ABI — passed to KeeperHub's contract-call
// endpoint so it can encode, gas-estimate, and (on mainnet) sign & send.
const SWAP_ROUTER02_ABI_JSON = JSON.stringify([{
  type: 'function',
  name: 'exactInputSingle',
  stateMutability: 'payable',
  inputs: [{
    name: 'params',
    type: 'tuple',
    components: [
      { name: 'tokenIn',           type: 'address' },
      { name: 'tokenOut',          type: 'address' },
      { name: 'fee',               type: 'uint24'  },
      { name: 'recipient',         type: 'address' },
      { name: 'amountIn',          type: 'uint256' },
      { name: 'amountOutMinimum',  type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
  }],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}])

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

  if (portfolioUSD < 1)
    return { allowed: false, reason: `Portfolio value $${portfolioUSD.toFixed(2)} too low or unavailable — check BTC price feed` }

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
  private wallet:   ethers.Wallet | null
  public  address:  string
  public  network:  GoatNetwork

  /**
   * `privateKey` is only used now for the testnet3 local dry-run fallback
   * and for deriving `address` client-side. Pass an empty string / omit
   * it and set `address` via `fromAddress()` once KeeperHub owns signing
   * end-to-end — the org wallet lives in KeeperHub, not in this process.
   */
  constructor(privateKey: string, network: GoatNetwork = 'testnet3') {
    this.network  = network
    this.provider = new ethers.JsonRpcProvider(GOAT_RPC[network])
    if (privateKey) {
      this.wallet  = new ethers.Wallet(privateKey, this.provider)
      this.address = this.wallet.address
    } else {
      this.wallet  = null
      this.address = ''
    }
  }

  /** Build a read-only client bound to a known address — no key needed. */
  static fromAddress(address: string, network: GoatNetwork = 'testnet3'): GoatClient {
    const c = new GoatClient('', network)
    c.address = address
    return c
  }

  getWallet(): ethers.Wallet | null { return this.wallet }
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

  /**
   * Send native BTC. Whenever KEEPERHUB_API_KEY is configured, this goes
   * through KeeperHub's Direct Execution API on *either* network — simulate
   * → broadcast → verified receipt, gas-estimated, MEV-protected, and
   * audit-logged — see lib/keeperhub/client.ts. This is what lets testnet3
   * be used to genuinely exercise KeeperHub (real testnet transaction,
   * real receipt) instead of only a local fake.
   *
   * Falls back to a local ethers signature only when no KeeperHub key is
   * configured (dev convenience) — on mainnet this fallback is refused
   * outright, since a locally-signed mainnet send would bypass KeeperHub's
   * gas/MEV/audit guarantees entirely; on testnet3 it's allowed since no
   * real value is at risk.
   */
  async sendBTC(to: string, amount: number, taskId = `sendbtc-${Date.now()}`): Promise<{ txHash: string; success: boolean; error?: string; keeperhub: boolean }> {
    if (hasKeeperHub()) {
      const kh = getKeeperHubClient()
      const out = await kh.safeTransfer(
        { chainId: GOAT_CHAIN_ID[this.network], recipientAddress: to, amount: amount.toString() },
        taskId
      )
      if (!out.success) return { txHash: '', success: false, error: out.error ?? 'KeeperHub transfer failed', keeperhub: true }
      return { txHash: out.status?.transactionHash ?? '', success: true, keeperhub: true }
    }

    if (this.network === 'mainnet') {
      return { txHash: '', success: false, error: 'KEEPERHUB_API_KEY not configured — mainnet transfers must go through KeeperHub', keeperhub: false }
    }

    // testnet3 dev fallback — only if a local wallet is present and no
    // KeeperHub key is configured. No real value at risk on testnet3.
    if (!this.wallet) return { txHash: '', success: false, error: 'No signer available for testnet3 dry-run send', keeperhub: false }
    try {
      const tx  = await this.wallet.sendTransaction({ to, value: ethers.parseEther(amount.toString()) })
      const rec = await tx.wait()
      return { txHash: rec?.hash ?? tx.hash, success: true, keeperhub: false }
    } catch (err: any) {
      return { txHash: '', success: false, error: err.message, keeperhub: false }
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
   * Execute an exactInputSingle swap on Uniswap V3 (mainnet only), signed
   * and broadcast entirely through KeeperHub — approval (if needed) and
   * the swap itself both go through KeeperHub's simulate → broadcast →
   * verified-receipt sequence, gas-estimated and MEV-protected on
   * KeeperHub's side, and recorded in KeeperHub's audit trail.
   *
   * On testnet3, simulates the trade locally and returns a fake txHash so
   * the agent loop can be exercised end-to-end without funds or a
   * KeeperHub key.
   */
  async swap(params: GoatSwapParams, taskId = `swap-${Date.now()}`): Promise<GoatSwapResult> {
    if (this.network !== 'mainnet') {
      return {
        success: true,
        txHash:  `sim_${Date.now().toString(16)}`,
        amountOut: params.amountIn * (1 - params.slippagePct / 100),
        simulated: true,
      }
    }

    if (!hasKeeperHub()) {
      return { success: false, txHash: '', amountOut: 0, simulated: false, error: 'KEEPERHUB_API_KEY not configured — mainnet swaps must go through KeeperHub' }
    }
    if (!this.address) {
      return { success: false, txHash: '', amountOut: 0, simulated: false, error: 'No recipient address set (call GoatClient.fromAddress or supply a wallet)' }
    }

    const kh        = getKeeperHubClient()
    const chainId   = GOAT_CHAIN_ID.mainnet
    const amountIn  = ethers.parseUnits(params.amountIn.toString(), params.decimalsIn)

    try {
      // Approve router if tokenIn is ERC-20 (not native BTC) — read
      // allowance directly from the chain (no signer needed), then let
      // KeeperHub sign + broadcast the approval if it's insufficient.
      if (params.tokenIn !== 'BTC') {
        const token = new ethers.Contract(params.tokenIn, ERC20_ABI, this.provider)
        const allowance: bigint = await token.allowance(this.address, UNISWAP_V3_CONTRACTS.swapRouter02)
        if (allowance < amountIn) {
          const approveArgs = JSON.stringify([UNISWAP_V3_CONTRACTS.swapRouter02, (amountIn * BigInt(2)).toString()])
          const approveOut  = await kh.safeContractCall({
            contractAddress: params.tokenIn,
            chainId,
            functionName:    'approve',
            functionArgs:    approveArgs,
            abi:             JSON.stringify([{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }]),
          }, `${taskId}-approve`)
          if (!approveOut.success) {
            return { success: false, txHash: '', amountOut: 0, simulated: false, error: `Approval failed: ${approveOut.error}` }
          }
        }
      }

      // Calculate minimum output with slippage (read-only quote)
      const quote        = await this.getSwapQuote(params)
      const minAmountOut = quote.amountOut * (1 - params.slippagePct / 100)

      const swapArgs = JSON.stringify([{
        tokenIn:           params.tokenIn,
        tokenOut:          params.tokenOut,
        fee:               params.feeTier,
        recipient:         this.address,
        amountIn:          amountIn.toString(),
        amountOutMinimum:  ethers.parseUnits(minAmountOut.toFixed(6), 18).toString(),
        sqrtPriceLimitX96: '0',
      }])

      const out = await kh.safeContractCall({
        contractAddress:    UNISWAP_V3_CONTRACTS.swapRouter02,
        chainId,
        functionName:       'exactInputSingle',
        functionArgs:       swapArgs,
        abi:                SWAP_ROUTER02_ABI_JSON,
        gasLimitMultiplier: '1.2',
      }, taskId)

      if (!out.success) {
        return { success: false, txHash: '', amountOut: 0, simulated: false, error: out.error ?? 'KeeperHub swap execution failed' }
      }
      return { success: true, txHash: out.status?.transactionHash ?? '', amountOut: quote.amountOut, simulated: false }
    } catch (err: any) {
      console.error('[GoatClient.swap]', err.message)
      return { success: false, txHash: '', amountOut: 0, error: err.message, simulated: false }
    }
  }

  // ── Wallet helpers ────────────────────────────────────────────────────────────

  async signMessage(msg: string): Promise<string> {
    if (!this.wallet) throw new Error('No local signer on this client (KeeperHub-backed clients cannot sign messages locally)')
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
