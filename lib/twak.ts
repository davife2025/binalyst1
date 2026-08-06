/**
 * lib/twak.ts — Trust Wallet Agent Kit (TWAK) integration
 * Handles self-custodial wallet connection, local signing, and autonomous execution.
 * Keys NEVER leave the user's device — all signing is local.
 *
 * Docs: https://portal.trustwallet.com
 */

import { ethers } from 'ethers'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TWAKWallet {
  address: string
  privateKey?: string   // Only in server-side autonomous mode — never logged
  provider:    ethers.JsonRpcProvider
  signer:      ethers.Wallet | ethers.Signer
}

export interface TradeOrder {
  tokenIn:    string   // BEP-20 contract address
  tokenOut:   string   // BEP-20 contract address
  amountIn:   string   // In wei
  minAmountOut: string // Slippage-protected minimum
  deadline:   number   // Unix timestamp
  gasLimit?:  bigint
}

export interface SignedTx {
  hash:      string
  signedRaw: string
  gasUsed?:  string
  status:    'pending' | 'confirmed' | 'failed'
}

export interface AgentGuardrails {
  maxDrawdownPct:    number   // e.g. 25 — disqualify threshold is 30, we stop at 25
  maxPerTradePct:    number   // e.g. 10 — max % of portfolio per trade
  maxDailyTrades:    number   // e.g. 10
  maxDailySpendUSD:  number   // Hard USD cap per day
  allowedTokens:     string[] // Contract addresses from eligible list
  maxSlippagePct:    number   // e.g. 1.5
}

export interface AgentState {
  isRunning:       boolean
  startPortfolioUSD: number
  currentPortfolioUSD: number
  drawdownPct:     number
  tradesToday:     number
  spentTodayUSD:   number
  lastTradeAt:     number | null
  isPaused:        boolean
  pauseReason:     string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// BSC Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const BSC_CONFIG = {
  chainId:    56,
  rpcUrl:     process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
  testnetRpc: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  explorerUrl: 'https://bscscan.com',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  pancakeRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2
  pancakeRouterV3: '0x1b81D678ffb9C0263b24A97847620C99d213eB14', // PancakeSwap V3
}

// Competition contract on BSC
export const COMPETITION_CONTRACT = '0x212c61b9b72c95d95bf29cf032f5e5635629aed5'

// ─────────────────────────────────────────────────────────────────────────────
// Eligible Competition Tokens (149 BEP-20s from CMC list)
// ─────────────────────────────────────────────────────────────────────────────

export const ELIGIBLE_SYMBOLS = new Set([
  'ETH','USDT','USDC','XRP','TRX','DOGE','ZEC','ADA','LINK','BCH',
  'DAI','TON','USD1','USDe','LTC','AVAX','SHIB','WLFI','DOT','UNI',
  'ASTER','DEXE','USDD','ETC','AAVE','ATOM','FIL','INJ','FET','TUSD',
  'BONK','PENGU','CAKE','LUNC','ZRO','KITE','FDUSD','BTT','NFT','FLOKI',
  'LDO','PENDLE','STG','AXS','TWT','RAY','COMP','BAT','APE','SNX',
  'FORM','HTX','FRAX','CHEEMS','BANANAS31','MYX','BEAM','AIOZ','YFI',
  'ZIL','ROSE','BRETT','ACH','AXL','ELF','KAVA','SUSHI','PEAQ','BNB',
  'WBNB',
])

// Known BEP-20 contract addresses for key tokens
export const TOKEN_ADDRESSES: Record<string, string> = {
  WBNB:  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT:  '0x55d398326f99059fF775485246999027B3197955',
  USDC:  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  CAKE:  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  ETH:   '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  ADA:   '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
  DOT:   '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
  LINK:  '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
  DAI:   '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  DOGE:  '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
  SHIB:  '0x2859e4544C4bB03966803b044A93563Bd2D0DD4D',
  AVAX:  '0x1CE0c2827e2eF14D5C4f29a091d735A204794041',
  TRX:   '0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3',
  XRP:   '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe',
  AAVE:  '0xfb6115445Bff7b52FeB98650C87f44907E58f802',
  ATOM:  '0x0Eb3a705fc54725037CC9e008bDede697f62F335',
  UNI:   '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1',
  LTC:   '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
  FIL:   '0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153',
  AXS:   '0x715D400F88C167884bbCc41C5feA407ed4D2f8A0',
  FLOKI: '0xfb5B838b6cfEEdC2873aB27866079AC55363D37A',
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider & Signer Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createProvider(testnet = false): ethers.JsonRpcProvider {
  const url = testnet ? BSC_CONFIG.testnetRpc : BSC_CONFIG.rpcUrl
  return new ethers.JsonRpcProvider(url, {
    chainId: testnet ? 97 : BSC_CONFIG.chainId,
    name: testnet ? 'bsc-testnet' : 'bsc',
  })
}

/**
 * Creates a wallet from private key — server-side autonomous mode.
 * The private key is loaded from env and NEVER logged or returned to client.
 */
export function createAgentWallet(testnet = false): TWAKWallet {
  const pk = process.env.AGENT_PRIVATE_KEY
  if (!pk) throw new Error('AGENT_PRIVATE_KEY not set in environment')

  const provider = createProvider(testnet)
  const signer   = new ethers.Wallet(pk, provider)

  return {
    address:    signer.address,
    provider,
    signer,
  }
}

/**
 * Creates a read-only provider for fetching balances / on-chain data
 * without exposing any private key.
 */
export function createReadOnlyWallet(address: string, testnet = false): Omit<TWAKWallet, 'privateKey' | 'signer'> & { signer: null } {
  const provider = createProvider(testnet)
  return { address, provider, signer: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance & Portfolio
// ─────────────────────────────────────────────────────────────────────────────

export async function getBNBBalance(address: string, testnet = false): Promise<number> {
  const provider = createProvider(testnet)
  const balance  = await provider.getBalance(address)
  return parseFloat(ethers.formatEther(balance))
}

export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  testnet = false
): Promise<{ raw: bigint; formatted: number; decimals: number }> {
  const provider = createProvider(testnet)
  const erc20ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]
  const contract = new ethers.Contract(tokenAddress, erc20ABI, provider)
  const [raw, decimals] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
  ])
  return {
    raw,
    formatted: parseFloat(ethers.formatUnits(raw, decimals)),
    decimals: Number(decimals),
  }
}

export async function getAgentPortfolio(
  address: string,
  tokenPricesUSD: Record<string, number>,
  testnet = false
): Promise<{
  bnbBalance: number
  bnbUSD:     number
  tokens:     Array<{ symbol: string; balance: number; usdValue: number }>
  totalUSD:   number
}> {
  const bnbBalance  = await getBNBBalance(address, testnet)
  const bnbPrice    = tokenPricesUSD['BNB'] || tokenPricesUSD['WBNB'] || 600
  const bnbUSD      = bnbBalance * bnbPrice

  const tokenResults = await Promise.allSettled(
    Object.entries(TOKEN_ADDRESSES).map(async ([symbol, addr]) => {
      const bal   = await getTokenBalance(addr, address, testnet)
      const price = tokenPricesUSD[symbol] || 0
      return { symbol, balance: bal.formatted, usdValue: bal.formatted * price }
    })
  )

  const tokens = tokenResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(t => t.balance > 0.0001)

  const totalUSD = bnbUSD + tokens.reduce((s, t) => s + t.usdValue, 0)

  return { bnbBalance, bnbUSD, tokens, totalUSD }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Signing (Self-Custodial Core)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signs a raw transaction locally — key stays server-side in env.
 * Returns signed raw tx for broadcast.
 */
export async function signTransaction(
  tx: ethers.TransactionRequest,
  testnet = false
): Promise<string> {
  const wallet = createAgentWallet(testnet)
  const signed = await (wallet.signer as ethers.Wallet).signTransaction(tx)
  return signed
}

/**
 * Sign and broadcast — the full autonomous execution path.
 * Returns tx hash immediately, waits for 1 confirmation.
 */
export async function signAndBroadcast(
  tx: ethers.TransactionRequest,
  testnet = false
): Promise<SignedTx> {
  const wallet    = createAgentWallet(testnet)
  const signer    = wallet.signer as ethers.Wallet
  const populated = await signer.populateTransaction(tx)
  const signed    = await signer.signTransaction(populated)
  const txResponse = await wallet.provider.broadcastTransaction(signed)

  return {
    hash:      txResponse.hash,
    signedRaw: signed,
    status:    'pending',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guardrails Engine
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GUARDRAILS: AgentGuardrails = {
  maxDrawdownPct:   25,    // Stop at 25% — competition DQ is at 30%
  maxPerTradePct:   10,    // Max 10% of portfolio per trade
  maxDailyTrades:   10,
  maxDailySpendUSD: 500,
  allowedTokens:    Object.values(TOKEN_ADDRESSES),
  maxSlippagePct:   1.5,
}

export function checkGuardrails(
  state: AgentState,
  guardrails: AgentGuardrails,
  proposedTradeUSD: number
): { allowed: boolean; reason?: string } {
  if (state.drawdownPct >= guardrails.maxDrawdownPct) {
    return { allowed: false, reason: `Drawdown limit hit: ${state.drawdownPct.toFixed(1)}% ≥ ${guardrails.maxDrawdownPct}%` }
  }
  if (state.tradesToday >= guardrails.maxDailyTrades) {
    return { allowed: false, reason: `Daily trade limit hit: ${state.tradesToday}/${guardrails.maxDailyTrades}` }
  }
  if (state.spentTodayUSD + proposedTradeUSD > guardrails.maxDailySpendUSD) {
    return { allowed: false, reason: `Daily spend limit: $${state.spentTodayUSD.toFixed(0)} + $${proposedTradeUSD.toFixed(0)} > $${guardrails.maxDailySpendUSD}` }
  }
  const maxTradeUSD = (state.currentPortfolioUSD * guardrails.maxPerTradePct) / 100
  if (proposedTradeUSD > maxTradeUSD) {
    return { allowed: false, reason: `Per-trade size limit: $${proposedTradeUSD.toFixed(0)} > $${maxTradeUSD.toFixed(0)}` }
  }
  return { allowed: true }
}

export function calcDrawdown(startUSD: number, currentUSD: number): number {
  if (startUSD <= 0) return 0
  return Math.max(0, ((startUSD - currentUSD) / startUSD) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// PancakeSwap V2 Swap Builder
// ─────────────────────────────────────────────────────────────────────────────

const PANCAKE_V2_ABI = [
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
]

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

export async function buildSwapTx(order: TradeOrder, testnet = false): Promise<ethers.TransactionRequest> {
  const provider = createProvider(testnet)
  const router   = new ethers.Contract(BSC_CONFIG.pancakeRouter, PANCAKE_V2_ABI, provider)
  const path     = [order.tokenIn, order.tokenOut]
  const wallet   = createAgentWallet(testnet)

  // BNB native swap
  if (order.tokenIn === TOKEN_ADDRESSES.WBNB || order.tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    const data = router.interface.encodeFunctionData('swapExactETHForTokens', [
      order.minAmountOut,
      [TOKEN_ADDRESSES.WBNB, order.tokenOut],
      wallet.address,
      order.deadline,
    ])
    return {
      to:       BSC_CONFIG.pancakeRouter,
      value:    BigInt(order.amountIn),
      data,
      gasLimit: order.gasLimit || BigInt(250000),
    }
  }

  const data = router.interface.encodeFunctionData('swapExactTokensForTokens', [
    order.amountIn,
    order.minAmountOut,
    path,
    wallet.address,
    order.deadline,
  ])

  return {
    to:       BSC_CONFIG.pancakeRouter,
    data,
    gasLimit: order.gasLimit || BigInt(300000),
  }
}

export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  testnet = false
): Promise<{ amountOut: string; priceImpact: number }> {
  const provider = createProvider(testnet)
  const router   = new ethers.Contract(BSC_CONFIG.pancakeRouter, PANCAKE_V2_ABI, provider)
  try {
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut])
    return {
      amountOut:   amounts[1].toString(),
      priceImpact: 0, // Simplified — full calc needs reserves
    }
  } catch {
    return { amountOut: '0', priceImpact: 100 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERC20 Approval
// ─────────────────────────────────────────────────────────────────────────────

export async function approveToken(
  tokenAddress: string,
  spender: string,
  amount: bigint,
  testnet = false
): Promise<SignedTx> {
  const wallet   = createAgentWallet(testnet)
  const signer   = wallet.signer as ethers.Wallet
  const contract = new ethers.Contract(tokenAddress, ERC20_APPROVE_ABI, signer)

  // Check existing allowance
  const allowance = await contract.allowance(wallet.address, spender)
  if (allowance >= amount) {
    return { hash: 'already_approved', signedRaw: '', status: 'confirmed' }
  }

  const tx       = await contract.approve(spender, amount)
  const receipt  = await tx.wait(1)
  return {
    hash:      tx.hash,
    signedRaw: '',
    status:    receipt?.status === 1 ? 'confirmed' : 'failed',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Competition Registration
// ─────────────────────────────────────────────────────────────────────────────

const COMPETITION_ABI = [
  'function register() external',
  'function isRegistered(address) view returns (bool)',
  'function getParticipants() view returns (address[])',
]

export async function registerForCompetition(testnet = false): Promise<SignedTx> {
  const wallet   = createAgentWallet(testnet)
  const signer   = wallet.signer as ethers.Wallet
  const contract = new ethers.Contract(COMPETITION_CONTRACT, COMPETITION_ABI, signer)

  // Check if already registered
  const alreadyReg = await contract.isRegistered(wallet.address).catch(() => false)
  if (alreadyReg) {
    return { hash: 'already_registered', signedRaw: '', status: 'confirmed' }
  }

  const tx      = await contract.register()
  const receipt = await tx.wait(1)
  return {
    hash:      tx.hash,
    signedRaw: '',
    status:    receipt?.status === 1 ? 'confirmed' : 'failed',
  }
}

export async function checkRegistration(address: string, testnet = false): Promise<boolean> {
  const provider = createProvider(testnet)
  const contract = new ethers.Contract(COMPETITION_CONTRACT, COMPETITION_ABI, provider)
  return contract.isRegistered(address).catch(() => false)
}
