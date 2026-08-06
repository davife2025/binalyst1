'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'

const COMMANDS = [
  { cmd: '/price BTC',        desc: 'Get live price of any coin'       },
  { cmd: '/movers',           desc: 'Top 24h gainers and losers'        },
  { cmd: '/events',           desc: 'Upcoming Binance events'           },
  { cmd: '/audit 0x...',      desc: 'Contract security audit'           },
  { cmd: '/help',             desc: 'Show all available commands'       },
  { cmd: 'Ask anything',      desc: 'Natural language — just type'      },
]

function StatusDot({ ok }: { ok: boolean }) {
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ok ? 'var(--green)' : 'var(--text3)', animation: ok ? 'blink 2s infinite' : 'none' }} />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg3)' }}>
        <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>{title}</span>
      </div>
      <div className="p-4" style={{ background: 'var(--bg2)' }}>{children}</div>
    </div>
  )
}

export default function MessagingTab() {
  const { isConnected } = useStore()
  const [telegramToken, setTelegramToken] = useState('')
  const [gatewayUrl,    setGatewayUrl]    = useState('')
  const [ocSecret,      setOcSecret]      = useState('')
  const [saved,         setSaved]         = useState(false)
  const [testing,       setTesting]       = useState(false)
  const [testResult,    setTestResult]    = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    setTelegramToken(localStorage.getItem('binalyst_tg_token')  ?? '')
    setGatewayUrl(   localStorage.getItem('binalyst_oc_url')    ?? '')
    setOcSecret(     localStorage.getItem('binalyst_oc_secret') ?? '')
  }, [])

  function save() {
    localStorage.setItem('binalyst_tg_token',  telegramToken)
    localStorage.setItem('binalyst_oc_url',    gatewayUrl)
    localStorage.setItem('binalyst_oc_secret', ocSecret)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection() {
    if (!gatewayUrl) { setTestResult({ ok: false, msg: 'Enter Gateway URL first' }); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) setTestResult({ ok: true, msg: 'Gateway is online ✓' })
      else        setTestResult({ ok: false, msg: `Gateway returned ${res.status}` })
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach gateway — check URL and ensure it is running' })
    }
    setTesting(false)
  }

  const tgConnected = !!telegramToken
  const gwConnected = !!gatewayUrl

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">

      <div>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>Messaging Channels</h2>
        <p className="mono text-xs mt-1" style={{ color: 'var(--text3)' }}>
          Connect Telegram and WhatsApp via OpenClaw gateway — query Binalyst from your pocket
        </p>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'OpenClaw Gateway', ok: gwConnected },
          { label: 'Telegram Bot',     ok: tgConnected },
          { label: 'WhatsApp',         ok: false },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <StatusDot ok={s.ok} />
            <div className="mono text-xs font-bold" style={{ color: 'var(--text)' }}>{s.label}</div>
            <div className="mono text-[10px]" style={{ color: s.ok ? 'var(--green)' : 'var(--text3)' }}>
              {s.ok ? 'Connected' : 'Not set up'}
            </div>
          </div>
        ))}
      </div>

      {/* OpenClaw Setup */}
      <Section title="OpenClaw Gateway setup">
        <div className="flex flex-col gap-3">
          <div className="mono text-xs leading-relaxed p-3 rounded-lg" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>
            OpenClaw is a self-hosted gateway. Install it on any server or your local machine, then enter its URL below.
            <div className="mt-2 p-2 rounded" style={{ background: 'var(--bg4)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text)' }}>
              npm install -g openclaw@latest<br/>
              openclaw onboard --install-daemon<br/>
              openclaw gateway --port 18789
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Gateway URL</label>
            <input value={gatewayUrl} onChange={e => setGatewayUrl(e.target.value)}
              placeholder="http://your-server:18789"
              className="mono text-sm px-4 py-3 rounded-xl outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Shared secret (OPENCLAW_SECRET)</label>
            <input value={ocSecret} onChange={e => setOcSecret(e.target.value)} type="password"
              placeholder="Any secret string — must match your Vercel env var"
              className="mono text-sm px-4 py-3 rounded-xl outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>

          <div className="flex gap-2">
            <button onClick={testConnection} disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg mono text-xs transition-all"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: testing ? 'not-allowed' : 'pointer' }}>
              {testing && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />}
              {testing ? 'Testing...' : 'Test connection'}
            </button>
            {testResult && (
              <div className="mono text-[10px] px-3 py-2 rounded-lg flex items-center"
                style={{ background: testResult.ok ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)', color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                {testResult.msg}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Telegram */}
      <Section title="Telegram bot">
        <div className="flex flex-col gap-3">
          <div className="mono text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
            1. Open Telegram and message <span style={{ color: 'var(--yellow)' }}>@BotFather</span><br/>
            2. Send <span style={{ color: 'var(--yellow)' }}>/newbot</span> and follow the steps<br/>
            3. Copy the bot token and paste it below<br/>
            4. In your OpenClaw config, set the Telegram bot token and point webhook to:<br/>
            <span className="block mt-1 p-2 rounded mono text-[11px]" style={{ background: 'var(--bg4)', color: 'var(--text)' }}>
              https://binalyst.vercel.app/api/openclaw/message
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Telegram Bot Token</label>
            <input value={telegramToken} onChange={e => setTelegramToken(e.target.value)} type="password"
              placeholder="123456789:ABCdef..."
              className="mono text-sm px-4 py-3 rounded-xl outline-none"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
          </div>
        </div>
      </Section>

      {/* WhatsApp */}
      <Section title="WhatsApp (via OpenClaw)">
        <div className="mono text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
          WhatsApp pairing is handled by the OpenClaw gateway on your server.<br/><br/>
          After your gateway is running:<br/>
          1. Run <span style={{ color: 'var(--yellow)' }}>openclaw channels login</span> on your server<br/>
          2. Scan the QR code with WhatsApp (Settings → Linked Devices)<br/>
          3. The gateway will forward messages to Binalyst automatically
        </div>
        <div className="mt-3 mono text-xs p-3 rounded-lg" style={{ background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.2)', color: 'var(--yellow)' }}>
          ⚠ WhatsApp requires the OpenClaw gateway to be running on your own server — it cannot be cloud-only.
        </div>
      </Section>

      {/* Bot commands */}
      <Section title="Available bot commands">
        <div className="flex flex-col gap-0">
          {COMMANDS.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="mono text-xs font-bold" style={{ color: 'var(--yellow)' }}>{c.cmd}</span>
              <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{c.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Save */}
      <button onClick={save}
        className="py-3 rounded-xl mono text-sm font-bold transition-all"
        style={{ background: saved ? 'rgba(14,203,129,0.1)' : 'var(--yellow)', color: saved ? 'var(--green)' : '#000' }}>
        {saved ? '✓ Saved' : 'Save settings'}
      </button>

    </div>
  )
}
