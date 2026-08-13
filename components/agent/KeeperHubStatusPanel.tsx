'use client'

/**
 * components/agent/KeeperHubStatusPanel.tsx
 *
 * KeeperHub is the *execution layer* Binalyst signs and broadcasts through —
 * it is deliberately NOT modeled as a chain (it has no chainId/RPC/explorer
 * of its own; see lib/keeperhub/config.ts). This panel makes that status
 * legible on its own terms instead of folding it into the GOAT network pill:
 * "is KeeperHub live, and what is it doing for me on the chain I'm on"
 * rather than "which network am I on".
 *
 * Data sources:
 *  - GET /api/health → features.keeperhub_execution (server has a KEEPERHUB_API_KEY)
 *  - useGoatStore     → which chain KeeperHub is currently executing against,
 *                       and the most recent trade it settled (for a receipt link)
 */

import { useState, useEffect, useRef } from 'react'
import { useGoatStore } from '@/lib/goat/store'
import { GOAT_EXPLORER, GOAT_CHAIN_ID } from '@/lib/goat/config'

export default function KeeperHubStatusPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [open, setOpen]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { network, trades } = useGoatStore()
  const chainLabel = network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'
  const chainId    = GOAT_CHAIN_ID[network]
  const lastTrade  = trades[0]

  useEffect(() => {
    let cancelled = false
    fetch('/api/health').then(r => r.json()).then(d => {
      if (!cancelled) setEnabled(!!d?.features?.keeperhub_execution)
    }).catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [])

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const statusColor = enabled ? 'var(--green)' : 'var(--yellow)'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full mono text-[10px] font-bold transition-colors"
        style={{
          background: enabled ? 'rgba(14,203,129,0.08)' : 'rgba(240,185,11,0.08)',
          border:     `1px solid ${enabled ? 'rgba(14,203,129,0.2)' : 'rgba(240,185,11,0.2)'}`,
          color:      statusColor,
        }}>
        <span className="w-1.5 h-1.5 rounded-full"
          style={{ background: statusColor, animation: enabled ? 'blink 2s infinite' : 'none' }} />
        KeeperHub {enabled === null ? '…' : enabled ? 'ON' : 'OFF'}
        <span style={{ color: 'var(--text3)' }}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-72 rounded-lg z-50 p-3 mono text-[11px]"
          style={{
            background: 'var(--bg2)',
            border:     '1px solid var(--border)',
            boxShadow:  '0 8px 24px rgba(0,0,0,0.4)',
          }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold" style={{ color: 'var(--text)' }}>KeeperHub execution</span>
            <span style={{ color: statusColor }}>{enabled ? '● live' : '● not configured'}</span>
          </div>

          <p className="mb-3" style={{ color: 'var(--text3)', lineHeight: 1.5 }}>
            KeeperHub is the signer + reliability layer — it isn't a chain itself.
            It executes on whichever chain the agent is trading on.
          </p>

          <div className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text3)' }}>Executing on</span>
            <span style={{ color: 'var(--text)' }}>{chainLabel} ({chainId})</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: 'var(--text3)' }}>Signing</span>
            <span style={{ color: 'var(--text)' }}>{enabled ? 'KeeperHub org wallet' : 'Local key (dev fallback)'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: 'var(--text3)' }}>Gas</span>
            <span style={{ color: 'var(--text)' }}>{enabled ? 'Smart estimation + backoff' : '—'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: 'var(--text3)' }}>MEV protection</span>
            <span style={{ color: 'var(--text)' }}>{enabled ? 'Private routing' : '—'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span style={{ color: 'var(--text3)' }}>Gas sponsorship</span>
            <span style={{ color: 'var(--text)' }}>{enabled && network === 'mainnet' ? 'Available (mainnet)' : '—'}</span>
          </div>

          {lastTrade && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex justify-between py-1">
                <span style={{ color: 'var(--text3)' }}>Last execution</span>
                <span style={{
                  color: lastTrade.status === 'confirmed' ? 'var(--green)'
                       : lastTrade.status === 'failed'    ? 'var(--red)'
                       : 'var(--yellow)',
                }}>
                  {lastTrade.status}
                </span>
              </div>
              {lastTrade.txHash && !lastTrade.txHash.startsWith('dry_') && (
                <a
                  href={`${GOAT_EXPLORER[network]}/tx/${lastTrade.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="block truncate hover:underline"
                  style={{ color: 'var(--yellow)' }}>
                  {lastTrade.txHash} ↗
                </a>
              )}
            </div>
          )}

          <a
            href="https://docs.keeperhub.com/api/direct-execution"
            target="_blank" rel="noopener noreferrer"
            className="block mt-3 text-center py-1.5 rounded hover:opacity-80"
            style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            KeeperHub docs ↗
          </a>
        </div>
      )}
    </div>
  )
}
