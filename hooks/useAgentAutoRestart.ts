'use client'
/**
 * hooks/useAgentAutoRestart.ts — Session 13
 *
 * Detects if the GOAT agent was running before a page reload and
 * automatically restarts it within 5 seconds, showing a countdown toast.
 *
 * How it works:
 * - useGoatAgentLoop.startLoop() sets localStorage key 'goat-agent-running'
 * - useGoatAgentLoop.stopLoop() clears it
 * - On mount, this hook checks that key and auto-restarts if set
 *
 * Mount this hook once in the root layout or app/page.tsx.
 */

import { useEffect, useState, useRef } from 'react'
import { useGoatStore }                from '@/lib/goat/store'
import { useGoatAgentLoop }            from '@/hooks/useGoatAgentLoop'

const STORAGE_KEY    = 'goat-agent-running'
const RESTART_DELAY  = 5_000

export function useAgentAutoRestart() {
  const { isWalletLoaded, privateKey } = useGoatStore()
  const { startLoop, isActive }        = useGoatAgentLoop()

  const [countdown,  setCountdown]  = useState<number | null>(null)
  const [dismissed,  setDismissed]  = useState(false)
  const timerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const cdRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isWalletLoaded || !privateKey) return
    if (isActive) return   // already running

    const wasRunning = localStorage.getItem(STORAGE_KEY) === 'true'
    if (!wasRunning || dismissed) return

    // Start countdown
    setCountdown(Math.round(RESTART_DELAY / 1000))
    cdRef.current = setInterval(() => setCountdown(c => (c ?? 1) - 1), 1000)

    timerRef.current = setTimeout(async () => {
      if (cdRef.current)  clearInterval(cdRef.current)
      if (!dismissed) {
        await startLoop()
      }
      setCountdown(null)
    }, RESTART_DELAY)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (cdRef.current)    clearInterval(cdRef.current)
    }
  }, [isWalletLoaded, privateKey, dismissed])

  function dismiss() {
    setDismissed(true)
    setCountdown(null)
    localStorage.removeItem(STORAGE_KEY)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (cdRef.current)    clearInterval(cdRef.current)
  }

  return { countdown, dismiss }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — call these from useGoatAgentLoop
// ─────────────────────────────────────────────────────────────────────────────

export function markAgentRunning()  { localStorage.setItem(STORAGE_KEY, 'true')  }
export function markAgentStopped()  { localStorage.removeItem(STORAGE_KEY)        }
