'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat, type ChatMode } from '@/hooks/useChat'
import { useStore } from '@/lib/store'

const MODES: { id: ChatMode; label: string; icon: string; desc: string }[] = [
  { id: 'assistant', label: 'Assistant', icon: '◈', desc: 'General Binance co-pilot' },
  { id: 'analyst',   label: 'Analyst',   icon: '◐', desc: 'Market analysis & TA' },
  { id: 'trader',    label: 'Trader',    icon: '⚡', desc: 'Execute & manage trades' },
  { id: 'educator',  label: 'Educator',  icon: '◉', desc: 'Learn crypto & Binance' },
]

const QUICK_ASKS = [
  'What is the current BTC price?',
  'Top gainers on Binance today?',
  'Any new Binance listings this week?',
  'Current Launchpool projects?',
  'What HODLer airdrops can I claim?',
  'Explain Binance Alpha in 2 minutes',
  'BTC funding rate on futures now?',
  'Give me a bull & bear case for ETH',
]

const TOOL_LABELS: Record<string, { label: string; color: string }> = {
  get_price:       { label: 'price lookup',    color: 'var(--yellow)' },
  get_top_movers:  { label: 'top movers',      color: 'var(--green)'  },
  get_klines:      { label: 'chart data',      color: '#3498db'       },
  get_order_book:  { label: 'order book',      color: '#9b59b6'       },
  get_balances:    { label: 'portfolio',        color: 'var(--green)'  },
  get_open_orders: { label: 'open orders',     color: '#e67e22'       },
  place_order:     { label: 'trade placed',    color: 'var(--red)'    },
  cancel_order:    { label: 'order cancelled', color: 'var(--red)'    },
  web_search:      { label: 'web search',      color: 'var(--text2)'  },
}

function fmtContent(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--yellow);font-weight:600">$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code style="font-family:monospace;background:var(--bg);padding:1px 5px;border-radius:3px;font-size:11px;color:var(--green)">$1</code>')
    .replace(/^#{1,3} (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--yellow);margin:10px 0 4px">$1</div>')
    .replace(/^[-*] (.+)$/gm, '<div style="display:flex;gap:6px;margin:2px 0"><span style="color:var(--yellow)">›</span><span>$1</span></div>')
    .replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>')
}

function ToolBadges({ tools }: { tools: string[] }) {
 const unique = Array.from(new Set(tools))
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {unique.map(t => {
        const info = TOOL_LABELS[t] ?? { label: t, color: 'var(--text3)' }
        return (
          <span key={t} className="mono text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: 'var(--bg3)', border: `1px solid ${info.color}40`, color: info.color }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: info.color, display: 'inline-block' }} />
            {info.label}
          </span>
        )
      })}
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  )
}

export default function ChatTab() {
  const { messages, streaming, send, clear, chatMode, setChatMode } = useChat()
  const { isConnected } = useStore()
  const [input, setInput] = useState('')
  const bottomRef         = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const currentMode       = MODES.find(m => m.id === chatMode) ?? MODES[0]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    send(text)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col border-r" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>

        <div className="px-3 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Mode</div>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setChatMode(m.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1 text-left transition-all"
              style={{
                background: chatMode === m.id ? 'var(--yellow-glow)' : 'transparent',
                border: chatMode === m.id ? '1px solid rgba(240,185,11,0.25)' : '1px solid transparent',
                color: chatMode === m.id ? 'var(--yellow)' : 'var(--text2)',
              }}>
              <span className="text-sm w-4 text-center">{m.icon}</span>
              <div>
                <div className="text-xs font-semibold">{m.label}</div>
                <div className="mono text-[9px]" style={{ color: chatMode === m.id ? 'rgba(240,185,11,0.6)' : 'var(--text3)' }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mono text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>Quick asks</div>
          {QUICK_ASKS.map((q, i) => (
            <button key={i} onClick={() => { if (!streaming) send(q) }} disabled={streaming}
              className="w-full text-left mono text-[10px] px-2.5 py-2 rounded-lg mb-1.5 leading-snug transition-all"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', opacity: streaming ? 0.5 : 1, cursor: streaming ? 'not-allowed' : 'pointer' }}>
              {q}
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="px-3 pb-3">
            <button onClick={clear} className="w-full mono text-[10px] py-2 rounded-lg transition-all"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)' }}>
              Clear conversation
            </button>
          </div>
        )}
      </div>

      {/* ── Chat ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-extrabold animate-float"
                style={{ background: 'var(--yellow)', color: '#000' }}>B</div>
              <div>
                <h2 className="text-xl font-extrabold mb-2" style={{ color: 'var(--text)' }}>Binalyst AI Assistant</h2>
                <p className="text-sm max-w-sm leading-relaxed" style={{ color: 'var(--text2)' }}>
                  Your intelligent Binance co-pilot. Ask about markets, listings, airdrops, trading strategies, or anything Binance.
                  {!isConnected && <span style={{ color: 'var(--yellow)' }}> Connect your API key in Settings for live portfolio data.</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {['Top movers now', 'New listings this week', 'Active Launchpool', 'HODLer airdrops', 'BTC analysis', 'How does Binance Earn work?'].map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="mono text-[11px] px-3 py-1.5 rounded-full transition-all"
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 animate-fade-up ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mono text-[10px] font-bold"
                style={{ background: msg.role === 'assistant' ? 'var(--yellow)' : 'var(--bg4)', color: msg.role === 'assistant' ? '#000' : 'var(--text2)' }}>
                {msg.role === 'assistant' ? 'B' : 'ME'}
              </div>
              <div className="flex flex-col max-w-[72%]" style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className="px-4 py-3 rounded-xl text-sm leading-relaxed"
                  style={{
                    background: msg.role === 'user' ? 'var(--yellow-glow)' : 'var(--bg2)',
                    border: msg.role === 'user' ? '1px solid rgba(240,185,11,0.2)' : '1px solid var(--border)',
                    color: 'var(--text)',
                    borderTopRightRadius: msg.role === 'user' ? 4 : undefined,
                    borderTopLeftRadius:  msg.role === 'assistant' ? 4 : undefined,
                  }}>
                  {msg.role === 'assistant' && msg.isStreaming && !msg.content
                    ? <TypingDots />
                    : <div dangerouslySetInnerHTML={{ __html: fmtContent(msg.content) }} />
                  }
                </div>
                {msg.role === 'assistant' && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <ToolBadges tools={msg.toolsUsed} />
                )}
                <div className="mono text-[9px] mt-1 px-1" style={{ color: 'var(--text3)' }}>
                  {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg2)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Mode:</span>
            <span className="mono text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--yellow-glow)', border: '1px solid rgba(240,185,11,0.25)', color: 'var(--yellow)' }}>
              {currentMode.icon} {currentMode.label}
            </span>
            {streaming && (
              <span className="mono text-[10px] flex items-center gap-1.5" style={{ color: 'var(--text3)' }}>
                <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin-slow" />
                thinking...
              </span>
            )}
          </div>
          <div className="flex gap-3 items-end">
            <textarea ref={inputRef} value={input} onChange={autoResize} onKeyDown={handleKey}
              disabled={streaming} rows={1}
              placeholder={`Ask anything about Binance, markets, crypto... (${currentMode.label} mode)`}
              className="flex-1 mono text-sm px-4 py-3 rounded-xl outline-none resize-none transition-all"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', maxHeight: 120, opacity: streaming ? 0.6 : 1 }}
              onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
            />
            <button onClick={handleSend} disabled={!input.trim() || streaming}
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all"
              style={{ background: input.trim() && !streaming ? 'var(--yellow)' : 'var(--bg4)', cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M3 10L17 3 10 17l-2-5-5-2z" fill={input.trim() && !streaming ? '#000' : 'var(--text3)'} />
              </svg>
            </button>
          </div>
          <div className="mono text-[10px] mt-2" style={{ color: 'var(--text3)' }}>
            Enter to send · Shift+Enter for newline · Powered by Claude + Binance live data
          </div>
        </div>
      </div>
    </div>
  )
}
