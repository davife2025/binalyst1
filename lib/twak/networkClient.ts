/**
 * lib/twak/networkClient.ts
 * Network-aware TWAK client — BSC Mainnet or Testnet.
 * Used by: app/api/agent/portfolio/route.ts
 *           app/api/agent/status/route.ts
 *           app/api/agent/loop/route.ts
 *           app/api/agent/register/route.ts
 */

import { ethers }                 from 'ethers'
import { NETWORKS, type Network } from './networks'
import { ELIGIBLE_TOKENS }        from './client'

export class NetworkTWAKClient {
  private wallet:   ethers.Wallet
  private provider: ethers.JsonRpcProvider
  public  address:  string
  public  network:  Network
  private cfg:      typeof NETWORKS[Network]

  constructor(privateKey: string, network: Network = 'mainnet') {
    this.network  = network
    this.cfg      = NETWORKS[network]
    this.provider = new ethers.JsonRpcProvider(this.cfg.rpc)
    this.wallet   = new ethers.Wallet(privateKey, this.provider)
    this.address  = this.wallet.address
  }

  // ── Balances ────────────────────────────────────────────────────────────

  async getBNBBalance(): Promise<number> {
    const bal = await this.provider.getBalance(this.address)
    return parseFloat(ethers.formatEther(bal))
  }

  async getTokenBalance(tokenAddress: string, decimals = 18): Promise<number> {
    const abi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ]
    const contract = new ethers.Contract(tokenAddress, abi, this.provider)
    try {
      const [bal, dec] = await Promise.all([
        contract.balanceOf(this.address),
        contract.decimals().catch(() => decimals),
      ])
      return parseFloat(ethers.formatUnits(bal, dec))
    } catch {
      return 0
    }
  }

  async getUSDTBalance(): Promise<number> {
    return this.getTokenBalance(this.cfg.usdt)
  }

  // ── Competition registration ─────────────────────────────────────────────

  async registerForCompetition(): Promise<{
    txHash: string; success: boolean; message: string; network: Network
  }> {
    // On testnet — simulate registration (contract is mainnet only)
    if (this.cfg.isTestnet) {
      return {
        txHash:  '',
        success: true,
        message: 'Testnet: registration simulated. Register on mainnet before the competition deadline.',
        network: 'testnet',
      }
    }

    const abi = ['function register() external']
    const contract = new ethers.Contract(this.cfg.competitionContract, abi, this.wallet)
    try {
      const tx  = await contract.register({ gasLimit: 120000 })
      const rec = await tx.wait()
      return {
        txHash:  rec.hash,
        success: true,
        message: `Registered on BSC mainnet. Tx: ${rec.hash}`,
        network: 'mainnet',
      }
    } catch (err: any) {
      const msg = err?.reason || err?.message || 'Registration failed'
      if (msg.toLowerCase().includes('already')) {
        return { txHash: '', success: true, message: 'Already registered.', network: 'mainnet' }
      }
      if (msg.toLowerCase().includes('deadline') || msg.toLowerCase().includes('closed')) {
        return { txHash: '', success: false, message: 'Registration deadline has passed.', network: 'mainnet' }
      }
      return { txHash: '', success: false, message: msg, network: 'mainnet' }
    }
  }

  async isRegistered(): Promise<boolean> {
    if (this.cfg.isTestnet) return true
    const abi = ['function isRegistered(address) view returns (bool)']
    try {
      const contract = new ethers.Contract(this.cfg.competitionContract, abi, this.provider)
      return await contract.isRegistered(this.address)
    } catch { return false }
  }

  // ── Token operations ────────────────────────────────────────────────────

  async approveToken(tokenAddress: string, spender: string, amountWei: bigint): Promise<string> {
    const abi      = ['function approve(address spender, uint256 amount) returns (bool)']
    const contract = new ethers.Contract(tokenAddress, abi, this.wallet)
    const tx       = await contract.approve(spender, amountWei, { gasLimit: 100000 })
    const rec      = await tx.wait()
    return rec.hash
  }

  async swapExactTokensForTokens(params: {
    amountIn:     bigint
    amountOutMin: bigint
    path:         string[]
    deadline?:    number
  }): Promise<{ txHash: string; success: boolean; network: Network }> {
    const routerAbi = [
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    ]
    const router = new ethers.Contract(this.cfg.pancakeRouter, routerAbi, this.wallet)
    const dl     = params.deadline ?? Math.floor(Date.now() / 1000) + 300
    try {
      const tx  = await router.swapExactTokensForTokens(
        params.amountIn, params.amountOutMin, params.path,
        this.address, dl, { gasLimit: 400000 }
      )
      const rec = await tx.wait()
      return { txHash: rec.hash, success: true, network: this.network }
    } catch (err: any) {
      console.error(`[TWAK swap ${this.network}]`, err.message)
      return { txHash: '', success: false, network: this.network }
    }
  }

  // ── Price ───────────────────────────────────────────────────────────────

  async getTokenPriceUSDT(tokenAddress: string, decimals = 18): Promise<number> {
    const factoryAbi = ['function getPair(address,address) view returns (address)']
    const pairAbi    = [
      'function getReserves() view returns (uint112,uint112,uint32)',
      'function token0() view returns (address)',
    ]
    try {
      const factory  = new ethers.Contract(this.cfg.pancakeFactory, factoryAbi, this.provider)
      const pairAddr = await factory.getPair(tokenAddress, this.cfg.usdt)
      if (pairAddr === ethers.ZeroAddress) return 0
      const pair     = new ethers.Contract(pairAddr, pairAbi, this.provider)
      const [r0, r1] = await pair.getReserves()
      const token0   = await pair.token0()
      const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase()
      const tokenRes = isToken0 ? r0 : r1
      const usdtRes  = isToken0 ? r1 : r0
      return (
        parseFloat(ethers.formatUnits(usdtRes, 18)) /
        parseFloat(ethers.formatUnits(tokenRes, decimals))
      )
    } catch { return 0 }
  }

  async getAmountsOut(amountIn: bigint, path: string[]): Promise<bigint[]> {
    const routerAbi = [
      'function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)',
    ]
    try {
      const router  = new ethers.Contract(this.cfg.pancakeRouter, routerAbi, this.provider)
      const amounts = await router.getAmountsOut(amountIn, path)
      return amounts as bigint[]
    } catch {
      return [amountIn, amountIn]
    }
  }

  // ── Portfolio valuation ─────────────────────────────────────────────────

  async getPortfolioValueUSD(
    holdings: Array<{ symbol: string; address: string; decimals: number }>
  ): Promise<{
    items:    Array<{ symbol: string; balance: number; priceUSD: number; valueUSD: number }>
    totalUSD: number
  }> {
    const items = await Promise.all(
      holdings.map(async h => {
        const [balance, priceUSD] = await Promise.allSettled([
          this.getTokenBalance(h.address, h.decimals),
          this.getTokenPriceUSDT(h.address, h.decimals),
        ])
        const bal   = balance.status  === 'fulfilled' ? balance.value  : 0
        const price = priceUSD.status === 'fulfilled' ? priceUSD.value : 0
        return { symbol: h.symbol, balance: bal, priceUSD: price, valueUSD: bal * price }
      })
    )
    const totalUSD = items.reduce((s, i) => s + i.valueUSD, 0)
    return { items, totalUSD }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  explorerTx(txHash: string)    { return `${this.cfg.explorerTx}${txHash}` }
  explorerAddr(address: string) { return `${this.cfg.explorerAddress}${address}` }
  get networkName()              { return this.cfg.name }
  get isTestnet()                { return this.cfg.isTestnet }
  get usdtAddress()              { return this.cfg.usdt }
  get routerAddress()            { return this.cfg.pancakeRouter }

  async signMessage(message: string): Promise<string> {
    return this.wallet.signMessage(message)
  }
}
