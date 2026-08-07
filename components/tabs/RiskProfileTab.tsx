'use client'
/**
 * components/tabs/RiskProfileTab.tsx — Session 3
 *
 * Risk Profile configuration tab.
 * Replaces the 'risk-profile' placeholder in app/page.tsx.
 *
 * Writes to BOTH stores:
 *  - useAgentStore (BSC agent) via setRiskProfile
 *  - useGoatStore  (GOAT agent) via setRiskProfile
 *
 * This means one risk profile config applies to whichever agent the user
 * is running. They can override per-agent in future sessions.
 */

import { useState }        from 'react'
import { useAgentStore }   from '@/lib/agentStore'
import { useGoatStore }    from '@/lib/goat/store'
import {
  RISK_PRESETS,
  type RiskProfile,
  type RiskPreset,
}                          from '@/lib/agentLoop'

// ─────────────────────────────────────────────────────────────────────────────
// Preset card data
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_META: Record<RiskPreset, {
  icon:        string
  color:       string
  borderColor: string
  tagline:     string
}> = {
  conservative: { icon: '', color: 'var(--blue)',  borderColor: '#3498db', tagline: 'Capital preservation first'   },
  moderate:     { icon: '', color: 'var(--yellow)', borderColor: '#F0B90B', tagline: 'Balanced risk and reward'      },
  aggressive:   { icon: '', color: 'var(--red)',    borderColor: '#F6465D', tagline: 'Maximum growth, higher risk'   },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step = 1, suffix = '', onChange,
}: {
  label: string; value: number; min: number; max: number
  step?: number; suffix?: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{label}</span>
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: 'var(--yellow)' }}
      />
      <div className="flex justify-between font-mono text-[9px] mt-1" style={{ color: 'var(--text3)' }}>
        <span>{min}{suffix}</span><span>{max}{suffix}</span>
      </div>
    </div>
  )
}

function GuardrailPreview({ profile }: { profile: RiskProfile }) {
  const rows = [
    { label: 'Max drawdown',    value: `${profile.maxDrawdownPct}%`,                 color: profile.maxDrawdownPct <= 5 ? 'var(--green)' : profile.maxDrawdownPct <= 15 ? 'var(--yellow)' : 'var(--red)' },
    { label: 'Max position',    value: `${profile.maxPositionPct}% of portfolio`,     color: 'var(--text)' },
    { label: 'Daily trade cap', value: `${profile.maxDailyTrades} trades`,            color: 'var(--text)' },
    { label: 'Stop-loss',       value: `${profile.stopLossType} @ ${profile.stopLossPct}%`, color: 'var(--text)' },
    { label: 'Slippage tol.',   value: `${profile.slippagePct}%`,                    color: 'var(--text)' },
  ]
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
          Active guardrails — applied to every agent cycle
        </span>
      </div>
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="font-mono text-[10px]" style={{ color: 'var(--text2)' }}>{r.label}</span>
          <span className="font-mono text-xs font-bold" style={{ color: r.color }}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function RiskProfileTab() {
  const bscStore  = useAgentStore()
  const goatStore = useGoatStore()

  // Read from GOAT store as the canonical source (Session 2 is the primary agent)
  const activeProfile = goatStore.riskProfile

  // Local edit state — starts from current profile
  const [draft,     setDraft]     = useState<RiskProfile>({ ...activeProfile })
  const [saved,     setSaved]     = useState(false)
  const [manualMode, setManualMode] = useState(false)

  function selectPreset(preset: RiskPreset) {
    setDraft({ ...RISK_PRESETS[preset] })
    setManualMode(false)
    setSaved(false)
  }

  function updateDraft(field: keyof RiskProfile, value: number | string) {
    setDraft(d => ({ ...d, preset: 'moderate', [field]: value }))
    setManualMode(true)
    setSaved(false)
  }

  function save() {
    // Write to both stores so whichever agent is running picks it up
    goatStore.setRiskProfile(draft)
    bscStore.setRiskProfile(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function reset() {
    const p = RISK_PRESETS[activeProfile.preset]
    setDraft({ ...p })
    setManualMode(false)
    setSaved(false)
  }

  const activePreset = Object.keys(RISK_PRESETS).find(
    k => !manualMode && RISK_PRESETS[k as RiskPreset].maxDrawdownPct === draft.maxDrawdownPct
      && RISK_PRESETS[k as RiskPreset].maxDailyTrades === draft.maxDailyTrades
  ) as RiskPreset | undefined

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">

      {/* Header */}
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Risk Profile</h2>
        <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
          Replaces all hardcoded competition guardrails — every agent cycle checks your profile.
          Applied to both BSC and GOAT Network agents.
        </p>
      </div>

      {/* Preset cards */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(RISK_PRESETS) as RiskPreset[]).map(preset => {
          const p    = RISK_PRESETS[preset]
          const meta = PRESET_META[preset]
          const isActive = !manualMode && activePreset === preset

          return (
            <button key={preset} onClick={() => selectPreset(preset)}
              className="rounded-xl p-4 text-left transition-all flex flex-col gap-2"
              style={{
                background:   isActive ? `${meta.borderColor}0f` : 'var(--bg2)',
                border:       `${isActive ? 2 : 1}px solid ${isActive ? meta.borderColor : 'var(--border)'}`,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = meta.borderColor }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)' }}>

              <div className="flex items-center justify-between">
                <span className="text-xl">{meta.icon}</span>
                {isActive && (
                  <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded"
                    style={{ background: meta.borderColor, color: '#000' }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <div>
                <div className="font-bold text-sm capitalize mb-0.5" style={{ color: meta.color }}>{preset}</div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>{meta.tagline}</div>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {[
                  { k: 'Max drawdown', v: `${p.maxDrawdownPct}%` },
                  { k: 'Position size', v: `${p.maxPositionPct}%` },
                  { k: 'Daily trades', v: `${p.maxDailyTrades}` },
                  { k: 'Stop-loss', v: `${p.stopLossType} ${p.stopLossPct}%` },
                ].map(row => (
                  <div key={row.k} className="flex items-center justify-between">
                    <span className="font-mono text-[9px]" style={{ color: 'var(--text3)' }}>{row.k}</span>
                    <span className="font-mono text-[9px] font-bold" style={{ color: 'var(--text2)' }}>{row.v}</span>
                  </div>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Manual override */}
      <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
            Manual override
          </div>
          {manualMode && (
            <span className="font-mono text-[9px] px-2 py-0.5 rounded" style={{ background: 'rgba(240,185,11,.12)', color: 'var(--yellow)', border: '1px solid rgba(240,185,11,.2)' }}>
              CUSTOM
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Slider
            label="Max drawdown (%)"
            value={draft.maxDrawdownPct}
            min={1} max={50}
            suffix="%"
            onChange={v => updateDraft('maxDrawdownPct', v)}
          />
          <Slider
            label="Max position size (% of portfolio)"
            value={draft.maxPositionPct}
            min={1} max={25}
            suffix="%"
            onChange={v => updateDraft('maxPositionPct', v)}
          />
          <Slider
            label="Daily trade limit"
            value={draft.maxDailyTrades}
            min={1} max={30}
            onChange={v => updateDraft('maxDailyTrades', Math.round(v))}
          />
          <Slider
            label="Stop-loss (%)"
            value={draft.stopLossPct}
            min={1} max={30}
            suffix="%"
            onChange={v => updateDraft('stopLossPct', v)}
          />
          <Slider
            label="Slippage tolerance (%)"
            value={draft.slippagePct}
            min={0.1} max={3} step={0.1}
            suffix="%"
            onChange={v => updateDraft('slippagePct', v)}
          />

          {/* Stop-loss type toggle */}
          <div>
            <div className="font-mono text-[10px] mb-2" style={{ color: 'var(--text3)' }}>Stop-loss type</div>
            <div className="flex gap-2">
              {(['hard', 'trailing'] as const).map(t => (
                <button key={t} onClick={() => updateDraft('stopLossType', t)}
                  className="font-mono text-[10px] px-3 py-1.5 rounded-full capitalize"
                  style={{
                    background: draft.stopLossType === t ? 'var(--yellow)' : 'var(--bg3)',
                    color:      draft.stopLossType === t ? '#000' : 'var(--text2)',
                    border:     '1px solid var(--border)',
                  }}>
                  {t}
                </button>
              ))}
            </div>
            <div className="font-mono text-[9px] mt-1.5" style={{ color: 'var(--text3)' }}>
              {draft.stopLossType === 'hard'
                ? 'Exit immediately when loss hits the % threshold'
                : 'Trails the highest price — locks in gains as price rises'}
            </div>
          </div>
        </div>
      </div>

      {/* Live guardrail preview */}
      <GuardrailPreview profile={draft} />

      {/* Warning for aggressive settings */}
      {draft.maxDrawdownPct > 20 && (
        <div className="rounded-lg px-4 py-3 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.06)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          ⚠ Max drawdown above 20% — the agent can lose a significant portion of your portfolio
          before auto-pausing. Make sure you understand the risk.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={save}
          className="font-mono text-xs font-bold px-6 py-2.5 rounded-lg"
          style={{ background: saved ? 'var(--green)' : 'var(--yellow)', color: '#000' }}>
          {saved ? '✓ Saved' : 'Save risk profile'}
        </button>
        <button onClick={reset}
          className="font-mono text-xs px-4 py-2.5 rounded-lg"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
          Reset to preset
        </button>
        <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Changes take effect on the next agent cycle
        </div>
      </div>
    </div>
  )
}
