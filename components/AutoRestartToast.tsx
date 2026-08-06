'use client'
/**
 * components/AutoRestartToast.tsx — Session 13
 *
 * Shows a toast notification when the agent is about to auto-restart
 * after a page reload. Mount once in the root layout or app/page.tsx.
 *
 * Usage:
 *   <AutoRestartToast />
 */

import { useAgentAutoRestart } from '@/hooks/useAgentAutoRestart'

export default function AutoRestartToast() {
  const { countdown, dismiss } = useAgentAutoRestart()

  if (countdown === null) return null

  return (
    <div
      className="fixed bottom-20 left-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl"
      style={{
        transform:  'translateX(-50%)',
        background: 'var(--bg2)',
        border:     '1px solid rgba(14,203,129,.3)',
        minWidth:   280,
      }}>
      <span className="w-2 h-2 rounded-full shrink-0"
        style={{ background: 'var(--green)', animation: 'blink 1s infinite' }} />
      <div className="flex-1">
        <div className="font-mono text-xs font-bold" style={{ color: 'var(--green)' }}>
          Restarting agent in {countdown}s
        </div>
        <div className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>
          Agent was running before reload
        </div>
      </div>
      <button
        onClick={dismiss}
        className="font-mono text-[10px] px-2.5 py-1 rounded-lg shrink-0"
        style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
        Cancel
      </button>
    </div>
  )
}
