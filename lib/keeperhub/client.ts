/**
 * lib/keeperhub/client.ts
 *
 * Thin wrapper around KeeperHub's Direct Execution API.
 * Docs: https://docs.keeperhub.com/api/direct-execution
 *
 * This is Binalyst's onchain execution layer. It replaces raw
 * ethers.Wallet signing: KeeperHub holds the org wallet, estimates gas,
 * routes privately (MEV protection), signs, broadcasts, and returns a
 * chain-verified receipt. Every write follows KeeperHub's documented
 * "Safe First-Write Sequence":
 *
 *   1. simulate: true            → catch reverts / bad ABI / insufficient funds
 *   2. remove simulate, add an   → broadcast exactly the body that was
 *      Idempotency-Key               inspected in step 1
 *   3. poll GET /status          → treat `receipts[].verified` as the
 *                                    authoritative on-chain proof
 *
 * Used by:
 *  - lib/goat/client.ts          (swap + BTC transfer execution)
 *  - app/api/goat/loop/route.ts  (agent trading loop)
 *  - app/api/keeperhub/*         (status polling, audit trail)
 */

import { createHash } from 'node:crypto'
import { KEEPERHUB_API_BASE, KEEPERHUB_DEFAULTS } from './config'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KeeperHubExecutionResult {
  executionId?:      string
  status:             'completed' | 'failed' | 'pending' | 'running' | 'simulated'
  transactionHash?:   string
  transactionLink?:   string
  sponsored?:         boolean
  result?:            unknown
  error?:             string
  wouldRevert?:       boolean
  revertReason?:      string
  code?:              string
  idempotentReplay?:  boolean
}

export interface KeeperHubStatus extends KeeperHubExecutionResult {
  receipts: Array<{
    hash:            string
    chainId:         number
    verified:        boolean
    receiptStatus:   'success' | 'reverted' | 'safe_inner_failure' | 'not_found' | 'timeout'
    blockNumber?:    number
    gasUsed?:        string
    verifiedAt?:     string
  }>
  gasUsedWei?: string
  createdAt?:  string
  completedAt?: string
}

interface TransferParams {
  chainId:            number
  recipientAddress:   string
  amount:              string   // human-readable, e.g. "0.1"
  tokenAddress?:       string   // omit for native transfer
  gasLimitMultiplier?: string
}

interface ContractCallParams {
  contractAddress:     string
  chainId:              number
  functionName:         string
  functionArgs?:         string  // JSON array string, e.g. '["0x...","1000"]'
  abi?:                  string  // JSON string; auto-fetched from explorer if omitted
  value?:                string  // native value in ether units, for payable fns
  gasLimitMultiplier?:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency key — per docs' "Choosing a stable key"
// ─────────────────────────────────────────────────────────────────────────────

function canonicalAmount(raw: string): string {
  let s = raw.trim()
  if (s === '' || /^[+-]/.test(s)) return '0'
  if (!s.includes('.')) s = s + '.0'
  let [whole, frac] = s.split('.')
  whole = whole.replace(/^0+(?=\d)/, '')
  if (whole === '') whole = '0'
  frac = frac.replace(/0+$/, '')
  return frac === '' ? whole : `${whole}.${frac}`
}

function canonicalPart(v: string | undefined): string {
  if (v === undefined) return ''
  return v.trim().replace(/%/g, '%25').replace(/\|/g, '%7C')
}

/**
 * Build a stable Idempotency-Key from work-identifying fields, so a retried
 * request (dropped connection, client timeout) replays instead of double-
 * executing. taskId should include a time bucket for recurring work
 * (e.g. `goat-loop-BTC-2026-08-12T14:00`), per KeeperHub docs.
 */
export function buildIdempotencyKey(params: {
  taskId:            string
  chainId:            number | string
  recipientAddress?:  string
  amount?:            string
  tokenAddress?:      string
}): string {
  const parts = [
    canonicalPart(params.taskId),
    canonicalPart(String(params.chainId)),
    canonicalPart(params.recipientAddress?.toLowerCase()),
    canonicalPart(params.amount !== undefined ? canonicalAmount(params.amount) : undefined),
    canonicalPart(params.tokenAddress?.toLowerCase()),
  ]
  const joined = parts.join('|')
  return createHash('sha256').update(joined, 'utf8').digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// KeeperHubClient
// ─────────────────────────────────────────────────────────────────────────────

export class KeeperHubClient {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error('KeeperHub API key required (KEEPERHUB_API_KEY)')
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>,
    opts: { idempotencyKey?: string } = {}
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const headers: Record<string, string> = {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${this.apiKey}`,
    }
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

    const res  = await fetch(`${KEEPERHUB_API_BASE}${path}`, {
      method: 'POST',
      headers,
      body:   JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as T
    return { ok: res.ok, status: res.status, data }
  }

  // ── Transfer (native or ERC-20) ────────────────────────────────────────────

  async simulateTransfer(params: TransferParams): Promise<KeeperHubExecutionResult> {
    const { data } = await this.request<KeeperHubExecutionResult>('/api/execute/transfer', {
      ...params, simulate: true,
    })
    return data
  }

  async transfer(
    params: TransferParams,
    idempotencyKey: string
  ): Promise<KeeperHubExecutionResult> {
    const { data } = await this.request<KeeperHubExecutionResult>(
      '/api/execute/transfer', params, { idempotencyKey }
    )
    return data
  }

  // ── Contract call ────────────────────────────────────────────────────────

  async simulateContractCall(params: ContractCallParams): Promise<KeeperHubExecutionResult> {
    const { data } = await this.request<KeeperHubExecutionResult>('/api/execute/contract-call', {
      ...params, simulate: true,
    })
    return data
  }

  async contractCall(
    params: ContractCallParams,
    idempotencyKey: string
  ): Promise<KeeperHubExecutionResult> {
    const { data } = await this.request<KeeperHubExecutionResult>(
      '/api/execute/contract-call', params, { idempotencyKey }
    )
    return data
  }

  // ── Check-and-execute (conditional write) ───────────────────────────────

  async checkAndExecute(
    params: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<KeeperHubExecutionResult> {
    const { data } = await this.request<KeeperHubExecutionResult>(
      '/api/execute/check-and-execute', params, { idempotencyKey }
    )
    return data
  }

  // ── Status polling ──────────────────────────────────────────────────────

  async getExecutionStatus(executionId: string): Promise<KeeperHubStatus> {
    const res  = await fetch(`${KEEPERHUB_API_BASE}/api/execute/${executionId}/status`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return (await res.json()) as KeeperHubStatus
  }

  /** Poll until the execution reaches a terminal state or the timeout elapses. */
  async pollUntilSettled(
    executionId: string,
    timeoutMs = KEEPERHUB_DEFAULTS.POLL_TIMEOUT_MS
  ): Promise<KeeperHubStatus> {
    const deadline = Date.now() + timeoutMs
    let waitMs     = KEEPERHUB_DEFAULTS.POLL_INTERVAL_MS_FALLBACK

    while (Date.now() < deadline) {
      const res = await fetch(`${KEEPERHUB_API_BASE}/api/execute/${executionId}/status`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      const status = (await res.json()) as KeeperHubStatus
      const hint   = res.headers.get('X-Poll-Interval-Hint')

      if (status.status === 'completed' || status.status === 'failed') return status
      waitMs = hint ? Math.max(0, parseInt(hint, 10)) * 1000 : waitMs
      await new Promise(r => setTimeout(r, waitMs || KEEPERHUB_DEFAULTS.POLL_INTERVAL_MS_FALLBACK))
    }
    throw new Error(`KeeperHub execution ${executionId} did not settle within ${timeoutMs}ms`)
  }

  // ── Safe first-write helpers (simulate → broadcast → verify) ───────────────

  /**
   * Transfer funds through KeeperHub's documented safe sequence: simulate,
   * then (only if it wouldn't revert) broadcast with an idempotency key,
   * then poll for a chain-verified receipt.
   */
  async safeTransfer(
    params: TransferParams,
    taskId: string
  ): Promise<{ success: boolean; status: KeeperHubStatus | null; simulated?: KeeperHubExecutionResult; error?: string }> {
    const sim = await this.simulateTransfer(params)
    if (sim.wouldRevert) {
      return { success: false, status: null, simulated: sim, error: sim.revertReason ?? sim.error ?? 'Simulation reverted' }
    }

    const key = buildIdempotencyKey({
      taskId, chainId: params.chainId, recipientAddress: params.recipientAddress,
      amount: params.amount, tokenAddress: params.tokenAddress,
    })
    const broadcast = await this.transfer(params, key)
    if (!broadcast.executionId) {
      return { success: false, status: null, error: broadcast.error ?? 'No executionId returned' }
    }
    const settled = await this.pollUntilSettled(broadcast.executionId)
    const verified = settled.receipts.length > 0 && settled.receipts.every(r => r.verified)
    return { success: settled.status === 'completed' && verified, status: settled }
  }

  /**
   * Same safe sequence for an arbitrary contract write (used for the
   * Uniswap V3 SwapRouter02 `exactInputSingle` call).
   */
  async safeContractCall(
    params: ContractCallParams,
    taskId: string
  ): Promise<{ success: boolean; status: KeeperHubStatus | null; simulated?: KeeperHubExecutionResult; error?: string }> {
    const sim = await this.simulateContractCall(params)
    if (sim.wouldRevert) {
      return { success: false, status: null, simulated: sim, error: sim.revertReason ?? sim.error ?? 'Simulation reverted' }
    }

    const key = buildIdempotencyKey({
      taskId, chainId: params.chainId, recipientAddress: params.contractAddress,
      amount: params.value ?? '0',
    })
    const broadcast = await this.contractCall(params, key)
    if (!broadcast.executionId) {
      return { success: false, status: null, error: broadcast.error ?? 'No executionId returned' }
    }
    const settled = await this.pollUntilSettled(broadcast.executionId)
    const verified = settled.receipts.length > 0 && settled.receipts.every(r => r.verified)
    return { success: settled.status === 'completed' && verified, status: settled }
  }
}

let cached: KeeperHubClient | null = null

/** Singleton accessor — throws if KEEPERHUB_API_KEY isn't configured. */
export function getKeeperHubClient(): KeeperHubClient {
  if (cached) return cached
  const key = process.env.KEEPERHUB_API_KEY
  if (!key) throw new Error('KEEPERHUB_API_KEY is not set — see .env.example')
  cached = new KeeperHubClient(key)
  return cached
}

export function hasKeeperHub(): boolean {
  return !!process.env.KEEPERHUB_API_KEY
}
