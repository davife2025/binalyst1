'use client'

import { useEffect, useState } from 'react'
import RegimeIndicator     from '@/components/agent/RegimeIndicator'
import TechnicalSignalCard from '@/components/agent/TechnicalSignalCard'
import type { TechnicalSnapshot } from '@/lib/skills/bitget-technicals'

type RuleTrigger = 'price_above' | 'price_below' | 'change_pct_up' | 'change_pct_down'
type RuleAction  = 'alert' | 'analyze' | 'log'

type Rule = {
  id: string; name: string; symbol: string
  trigger: RuleTrigger; value: number; action: RuleAction
  active: boolean; createdAt: number; lastTriggered?: number
}

type LogEntry = {
  id: string; timestamp: number; rule: string; event: string
  status: 'triggered' | 'checked' | 'error'
}

const TRIGGER_LABELS: Record<RuleTrigger, string> = {
  price_above:     'Price goes above',
  price_below:     'Price goes below',
  change_pct_up:   '24h change exceeds +',
  change_pct_down: '24h change drops below -',
}

const ACTION_LABELS: Record<RuleAction, string> = {
  alert:   'Browser alert',
  analyze: '◈ AI analysis',
  log:     '📋 Log only',
}

const SK_RULES = 'binalyst_agent_rules'
const SK_LOG   = 'binalyst_agent_log'

function loadRules(): Rule[]    { try { return JSON.parse(localStorage.getItem(SK_RULES) || '[]') } catch { return [] } }
function loadLog(): LogEntry[]  { try { return JSON.parse(localStorage.getItem(SK_LOG) || '[]') } catch { return [] } }
function saveRules(r: Rule[])   { localStorage.setItem(SK_RULES, JSON.stringify(r)) }
function saveLog(l: LogEntry[]) { localStorage.setItem(SK_LOG, JSON.stringify(l.slice(0, 100))) }

export default function AgentTab() {
  const [techSnap, setTechSnap] = useState<TechnicalSnapshot | null>(null)
  const [rules,    setRules]   = useState<Rule[]>([])
  const [log,     setLog]     = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [name,    setName]    = useState('')
  const [symbol,  setSymbol]  = useState('BTC')
  const [trigger, setTrigger] = useState<RuleTrigger>('price_above')
  const [value,   setValue]   = useState('')
  const [action,  setAction]  = useState<RuleAction>('alert')

  useEffect(() => {
    setRules(loadRules()); setLog(loadLog())
    // Load BTC technicals for the live panel
    fetch('/api/technicals?symbol=BTC&interval=1h')
      .then(r => r.json())
      .then(d => { if (d.snapshot) setTechSnap(d.snapshot) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!rules.length) return
    const t = setInterval(() => runAgent(), 120000)
    return () => clearInterval(t)
  }, [rules])

  function addRule() {
    if (!name || !symbol || !value) return
    const rule: Rule = { id: crypto.randomUUID(), name, symbol: symbol.toUpperCase(), trigger, value: parseFloat(value), action, active: true, createdAt: Date.now() }
    const updated = [rule, ...rules]; setRules(updated); saveRules(updated)
    setName(''); setValue('')
  }

  function removeRule(id: string) { const u = rules.filter(r => r.id !== id); setRules(u); saveRules(u) }
  function toggleRule(id: string) { const u = rules.map(r => r.id === id ? { ...r, active: !r.active } : r); setRules(u); saveRules(u) }

  function pushLog(l: LogEntry[], e: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry[] {
    return [{ ...e, id: crypto.randomUUID(), timestamp: Date.now() }, ...l].slice(0, 100)
  }

  async function runAgent() {
    const active = rules.filter(r => r.active)
    if (!active.length) return
    setRunning(true)
    let newLog = [...log]
    try {
      const res = await fetch('/api/binance/market?action=movers&limit=50')
      const d   = await res.json()
      if (!d.success) throw new Error('Market data unavailable')

      const map: Record<string, { price: number; change: number }> = {}
      d.data.forEach((t: any) => { map[t.symbol.replace('USDT', '')] = { price: t.price, change: t.change } })

      for (const rule of active) {
        const mkt = map[rule.symbol]
        if (!mkt) { newLog = pushLog(newLog, { rule: rule.name, event: `${rule.symbol} not found`, status: 'error' }); continue }

        const fired =
          (rule.trigger === 'price_above'    && mkt.price  >= rule.value)  ||
          (rule.trigger === 'price_below'     && mkt.price  <= rule.value)  ||
          (rule.trigger === 'change_pct_up'   && mkt.change >= rule.value)  ||
          (rule.trigger === 'change_pct_down' && mkt.change <= -rule.value)

        const event = `${rule.symbol} @ $${mkt.price.toLocaleString()} (${mkt.change >= 0 ? '+' : ''}${mkt.change.toFixed(2)}%)`

        if (fired) {
          newLog = pushLog(newLog, { rule: rule.name, event: `⚡ FIRED — ${event}`, status: 'triggered' })
          if (rule.action === 'alert' && Notification.permission === 'granted') {
            new Notification(`🤖 Binalyst: ${rule.name}`, { body: event })
          }
          if (rule.action === 'analyze') {
            fetch('/api/ai/chat', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: [{ role: 'user', content: `Quick analysis: ${rule.symbol} just ${rule.trigger.replace(/_/g,' ')} ${rule.value}. ${event}. What does this signal?` }], mode: 'analyst' }),
            }).catch(() => {})
            newLog = pushLog(newLog, { rule: rule.name, event: `AI analysis triggered for ${rule.symbol}`, status: 'triggered' })
          }
          setRules(prev => { const u = prev.map(r => r.id === rule.id ? { ...r, lastTriggered: Date.now() } : r); saveRules(u); return u })
        } else {
          newLog = pushLog(newLog, { rule: rule.name, event: `Checked — ${event} · not triggered`, status: 'checked' })
        }
      }
    } catch (e: any) {
      newLog = pushLog(newLog, { rule: 'System', event: 'Agent error: ' + e.message, status: 'error' })
    }
    setLog(newLog); saveLog(newLog); setLastRun(new Date().toLocaleTimeString()); setRunning(false)
  }

  const activeCount    = rules.filter(r => r.active).length
  const triggeredToday = log.filter(l => l.status === 'triggered' && Date.now() - l.timestamp < 86400000).length

  return (
    <div className="flex-1 overflow-y-auto" style={{background:"var(--bg)"}}>
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold uppercase tracking-tight" style={{ color: 'var(--text)' }}>Autonomous <span style={{color:"var(--yellow)"}}>Agent</span></h2>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Rules engine · checks every 2 min{lastRun && ` · last run ${lastRun}`}</p>
        </div>
        <button onClick={() => runAgent()} disabled={running || !activeCount}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all"
          style={{ background: running ? 'var(--bg4)' : 'var(--yellow)', color: running ? 'var(--text3)' : '#000', cursor: running || !activeCount ? 'not-allowed' : 'pointer', opacity: !activeCount ? 0.4 : 1 }}>
          {running && <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
          {running ? 'Running...' : '▶ Run Now'}
        </button>
      </div>

      {/* ── Session M: Live regime + technical panel ─────────────────────── */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <RegimeIndicator symbol="BTC" interval="1h" />
        {techSnap
          ? <TechnicalSignalCard snapshot={techSnap} />
          : (
            <div className="rounded-md p-4 flex items-center justify-center mono text-xs"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
              Loading BTC technicals…
            </div>
          )
        }
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[['Total Rules', rules.length, 'var(--text)'], ['Active', activeCount, 'var(--green)'], ['Triggered Today', triggeredToday, 'var(--yellow)']].map(([l, v, c]: any) => (
          <div key={l} className="rounded-md p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{l}</div>
            <div className="mono text-2xl font-extrabold" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex flex-col gap-4">
          <div className="rounded-md p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--text3)' }}>New Rule</div>
            <div className="flex flex-col gap-3">
              {[{l:'Rule Name',v:name,s:setName,p:'BTC take-profit'},{l:'Coin',v:symbol,s:(v:string)=>setSymbol(v.toUpperCase()),p:'BTC'}].map(({l,v,s,p})=>(
                <div key={l} className="flex flex-col gap-1">
                  <span className="mono text-[9px] uppercase tracking-widest" style={{color:'var(--text3)'}}>{l}</span>
                  <input value={v} onChange={e=>s(e.target.value)} placeholder={p} className="mono text-sm px-3 py-2.5 rounded-md outline-none"
                    style={{background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text)'}}
                    onFocus={e=>(e.target.style.borderColor='var(--yellow)')} onBlur={e=>(e.target.style.borderColor='var(--border2)')} />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <span className="mono text-[9px] uppercase tracking-widest" style={{color:'var(--text3)'}}>When</span>
                <select value={trigger} onChange={e=>setTrigger(e.target.value as RuleTrigger)} className="mono text-xs px-3 py-2.5 rounded-md outline-none"
                  style={{background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text)'}}>
                  {Object.entries(TRIGGER_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="mono text-[9px] uppercase tracking-widest" style={{color:'var(--text3)'}}>{trigger.includes('change')?'Value (%)':'Price ($)'}</span>
                <input type="number" value={value} onChange={e=>setValue(e.target.value)} placeholder={trigger.includes('change')?'5':'100000'}
                  className="mono text-sm px-3 py-2.5 rounded-md outline-none"
                  style={{background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text)'}}
                  onFocus={e=>(e.target.style.borderColor='var(--yellow)')} onBlur={e=>(e.target.style.borderColor='var(--border2)')} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="mono text-[9px] uppercase tracking-widest" style={{color:'var(--text3)'}}>Then</span>
                <select value={action} onChange={e=>setAction(e.target.value as RuleAction)} className="mono text-xs px-3 py-2.5 rounded-md outline-none"
                  style={{background:'var(--bg3)',border:'1px solid var(--border2)',color:'var(--text)'}}>
                  {Object.entries(ACTION_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button onClick={addRule} className="py-2.5 rounded-md text-sm font-bold mt-1" style={{background:'var(--yellow)',color:'#000'}}>+ Add Rule</button>
            </div>
          </div>

          {rules.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="mono text-[10px] uppercase tracking-widest" style={{color:'var(--text3)'}}>Rules</div>
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 rounded-md px-4 py-3"
                  style={{background:'var(--bg2)',border:'1px solid var(--border)',opacity:rule.active?1:0.5}}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color:'var(--text)'}}>{rule.name}</div>
                    <div className="mono text-[10px] mt-0.5" style={{color:'var(--text3)'}}>
                      {rule.symbol} · {TRIGGER_LABELS[rule.trigger]} {rule.value}{rule.trigger.includes('change')?'%':' USD'} → {ACTION_LABELS[rule.action]}
                    </div>
                    {rule.lastTriggered && <div className="mono text-[9px] mt-0.5" style={{color:'var(--yellow)'}}>Last: {new Date(rule.lastTriggered).toLocaleTimeString()}</div>}
                  </div>
                  <button onClick={()=>toggleRule(rule.id)} className="w-8 h-4 rounded-full relative shrink-0 transition-all" style={{background:rule.active?'var(--green)':'var(--bg4)'}}>
                    <span className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{background:rule.active?'#000':'var(--text3)',left:rule.active?'18px':'2px'}} />
                  </button>
                  <button onClick={()=>removeRule(rule.id)} className="mono text-sm px-2 rounded" style={{color:'var(--text3)'}}
                    onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')} onMouseLeave={e=>(e.currentTarget.style.color='var(--text3)')}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="mono text-[10px] uppercase tracking-widest" style={{color:'var(--text3)'}}>Activity Log</div>
            {log.length > 0 && <button onClick={()=>{setLog([]);saveLog([])}} className="mono text-[9px] px-2 py-1 rounded" style={{color:'var(--text3)'}}>Clear</button>}
          </div>
          <div className="rounded-md overflow-hidden" style={{border:'1px solid var(--border)'}}>
            {log.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-3 text-center" style={{background:'var(--bg2)'}}>
                <div style={{width:32,height:32,borderRadius:"50%",border:"2px solid rgba(240,185,11,.22)",margin:"0 auto",opacity:.5}}/>
                <div className="mono text-xs" style={{color:'var(--text3)'}}>No activity yet.</div>
              </div>
            ) : (
              <div className="flex flex-col overflow-y-auto" style={{background:'var(--bg2)',maxHeight:420}}>
                {log.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3 border-b" style={{borderColor:'var(--border)'}}>
                    <span className="text-xs mt-0.5 shrink-0" style={{color:entry.status==='triggered'?'var(--yellow)':entry.status==='error'?'var(--red)':'var(--text3)'}}>
                      {entry.status==='triggered'?'⚡':entry.status==='error'?'✗':'○'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="mono text-[10px] font-bold mb-0.5" style={{color:entry.status==='triggered'?'var(--yellow)':'var(--text2)'}}>{entry.rule}</div>
                      <div className="mono text-[10px] leading-snug" style={{color:'var(--text3)'}}>{entry.event}</div>
                      <div className="mono text-[9px] mt-1" style={{color:'var(--text3)'}}>{new Date(entry.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}