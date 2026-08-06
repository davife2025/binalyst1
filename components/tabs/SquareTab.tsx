'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

const MAX_CHARS = 2000
const SUGGESTED_TAGS = ['BTC','ETH','BNB','SOL','Crypto','DeFi','Web3','Altcoins','Trading','Binance','Alpha','Launchpool','HODL','Bullish','Bearish']
const TONES = [
  { id: 'analytical',  label: 'Analytical',  desc: 'Data-driven' },
  { id: 'bullish',     label: 'Bullish',     desc: 'Hype energy' },
  { id: 'bearish',     label: 'Bearish',     desc: 'Risk-aware'  },
  { id: 'educational', label: 'Educational', desc: 'Teach & explain' },
  { id: 'casual',      label: 'Casual',      desc: 'Relaxed vibe' },
]

type Post = { id: string; content: string; tags: string[]; publishedAt: number; status: 'published'|'draft'; postId?: string }

const SK = 'binalyst_square_history'
function loadHistory(): Post[] { try { return JSON.parse(localStorage.getItem(SK) || '[]') } catch { return [] } }
function saveHistory(p: Post[]) { localStorage.setItem(SK, JSON.stringify(p)) }

function timeAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function SquareTab() {
  const { isConnected, apiKey, apiSecret } = useStore()

  const [content,    setContent]    = useState('')
  const [tags,       setTags]       = useState<string[]>([])
  const [tagInput,   setTagInput]   = useState('')
  const [publishing, setPublishing] = useState(false)
  const [result,     setResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [topic,      setTopic]      = useState('')
  const [tone,       setTone]       = useState('analytical')
  const [generating, setGenerating] = useState(false)
  const [history,    setHistory]    = useState<Post[]>([])
  const [view,       setView]       = useState<'compose'|'history'|'feed'>('compose')
  const [feed,       setFeed]       = useState<any[]>([])
  const [feedLoad,   setFeedLoad]   = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setHistory(loadHistory()) }, [])
  useEffect(() => { if (view === 'feed' && !feed.length) loadFeed() }, [view])

  async function generateDraft() {
    if (!topic.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Write a Binance Square post about: "${topic}". Tone: ${tone}. Max 280 chars for main text, end with 2-4 hashtags on a new line starting with #, sound like a real crypto trader. Return ONLY the post + hashtags.` }],
          mode: 'assistant',
        }),
      })
      const reader = res.body?.getReader(); const dec = new TextDecoder(); let draft = ''
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n').filter(l => l.startsWith('data: '))) {
          try { const j = JSON.parse(line.slice(6)); if (j.type === 'text') draft += j.text } catch {}
        }
      }
      const lines = draft.trim().split('\n')
      const hi = lines.findIndex(l => l.includes('#'))
      let body = draft.trim(), extracted: string[] = []
      if (hi > 0) {
        body = lines.slice(0, hi).join('\n').trim()
        extracted = lines.slice(hi).join(' ').match(/#\w+/g)?.map(t => t.slice(1)) ?? []
      }
      setContent(body)
      if (extracted.length) setTags(prev => Array.from(new Set([...prev, ...extracted])))
      setTimeout(() => taRef.current?.focus(), 100)
    } catch (e: any) { setResult({ ok: false, msg: e.message }) }
    setGenerating(false)
  }

  async function publish() {
    if (!content.trim() || !isConnected) return
    setPublishing(true); setResult(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey)    headers['x-binance-key']    = apiKey
      if (apiSecret) headers['x-binance-secret'] = apiSecret
      const res  = await fetch('/api/skills/square', {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'publish', content, tags }),
      })
      const d = await res.json()
      if (d.success) {
        setResult({ ok: true, msg: d.data?.message || 'Published to Binance Square!' })
        const post: Post = { id: crypto.randomUUID(), content, tags, publishedAt: Date.now(), status: 'published', postId: d.data?.postId }
        const updated = [post, ...history]; setHistory(updated); saveHistory(updated)
        setContent(''); setTags([])
      } else {
        setResult({ ok: false, msg: d.error || d.data?.message || 'Publish failed' })
      }
    } catch (e: any) { setResult({ ok: false, msg: e.message }) }
    setPublishing(false)
  }

  function saveDraft() {
    if (!content.trim()) return
    const d: Post = { id: crypto.randomUUID(), content, tags, publishedAt: Date.now(), status: 'draft' }
    const u = [d, ...history]; setHistory(u); saveHistory(u)
    setResult({ ok: true, msg: 'Draft saved.' })
  }

  async function loadFeed() {
    setFeedLoad(true)
    try {
      const res = await fetch('/api/skills/square', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'feed', size: 15 }) })
      const d   = await res.json()
      if (d.success) setFeed(Array.isArray(d.data) ? d.data : [])
    } catch {}
    setFeedLoad(false)
  }

  function addTag(tag: string) {
    const c = tag.replace(/^#/, '').trim()
    if (!c || tags.includes(c) || tags.length >= 5) return
    setTags(p => [...p, c]); setTagInput('')
  }
  function removeTag(tag: string) { setTags(p => p.filter(t => t !== tag)) }
  function onTagKey(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInput.trim()) { e.preventDefault(); addTag(tagInput) }
  }

  const remaining = MAX_CHARS - content.length
  const canPublish = !!content.trim() && isConnected && !publishing

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            Binance Square
            <span className="mono text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(240,185,11,0.1)', color: 'var(--yellow)' }}>square-post skill</span>
          </h2>
          <p className="mono text-xs mt-1" style={{ color: 'var(--text3)' }}>Compose and publish posts to your Binance Square profile</p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['compose','history','feed'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className="px-4 py-2 mono text-xs font-bold transition-all capitalize"
              style={{ background: view === v ? 'var(--yellow)' : 'transparent', color: view === v ? '#000' : 'var(--text2)' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── COMPOSE ── */}
      {view === 'compose' && (
        <div className="flex flex-col gap-5">

          {/* AI Generator */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>◈ AI Draft Generator</div>
            <div className="flex flex-col gap-3">
              <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateDraft()}
                placeholder="Topic — e.g. BTC breaking $100k, Binance Launchpool strategies..."
                className="mono text-sm px-3 py-2.5 rounded-lg outline-none"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--yellow)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')} />
              <div className="flex gap-2 flex-wrap">
                {TONES.map(t => (
                  <button key={t.id} onClick={() => setTone(t.id)}
                    className="mono text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: tone === t.id ? 'var(--yellow)' : 'var(--bg3)', color: tone === t.id ? '#000' : 'var(--text2)', border: tone === t.id ? 'none' : '1px solid var(--border)' }}>
                    {t.label}
                    <span className="ml-1 opacity-60 text-[9px]">{t.desc}</span>
                  </button>
                ))}
              </div>
              <button onClick={generateDraft} disabled={!topic.trim() || generating}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ background: topic.trim() && !generating ? 'var(--yellow-glow)' : 'var(--bg3)', color: topic.trim() && !generating ? 'var(--yellow)' : 'var(--text3)', border: `1px solid ${topic.trim() && !generating ? 'rgba(240,185,11,0.3)' : 'var(--border)'}`, cursor: topic.trim() && !generating ? 'pointer' : 'not-allowed' }}>
                {generating && <span className="w-4 h-4 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'rgba(240,185,11,0.3)', borderTopColor: 'var(--yellow)' }} />}
                {generating ? 'Generating...' : '◈ Generate AI Draft'}
              </button>
            </div>
          </div>

          {/* Composer */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg3)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm shrink-0" style={{ background: 'var(--yellow)', color: '#000' }}>B</div>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Your Binance Square Post</div>
                <div className="mono text-[9px]" style={{ color: isConnected ? 'var(--green)' : 'var(--text3)' }}>
                  {isConnected ? 'Connected — ready to publish' : 'Connect API key in Settings to publish'}
                </div>
              </div>
              <div className="ml-auto mono text-xs" style={{ color: remaining < 100 ? 'var(--red)' : remaining < 300 ? 'var(--yellow)' : 'var(--text3)' }}>
                {remaining}
              </div>
            </div>

            <div style={{ background: 'var(--bg2)' }}>
              <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="What's happening in crypto? Share your analysis, alpha, or market insights..."
                rows={6} className="w-full mono text-sm px-4 py-4 outline-none resize-none leading-relaxed"
                style={{ background: 'transparent', color: 'var(--text)', borderBottom: '0.5px solid var(--border)' }} />

              {/* Tags */}
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="mono text-xs flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--yellow-glow)', border: '1px solid rgba(240,185,11,0.25)', color: 'var(--yellow)' }}>
                      #{tag}
                      <button onClick={() => removeTag(tag)} style={{ color: 'rgba(240,185,11,0.5)', lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                  {tags.length < 5 && (
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={onTagKey}
                      placeholder="+ tag" className="mono text-xs px-2 py-0.5 rounded-full outline-none"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', minWidth: 70 }} />
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.filter(t => !tags.includes(t)).slice(0, 9).map(tag => (
                    <button key={tag} onClick={() => addTag(tag)}
                      className="mono text-[9px] px-2 py-0.5 rounded-full transition-all"
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--yellow)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--yellow)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <button onClick={saveDraft} disabled={!content.trim()} className="mono text-xs px-4 py-2 rounded-lg"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', opacity: content.trim() ? 1 : 0.4, cursor: content.trim() ? 'pointer' : 'not-allowed' }}>
                  Save draft
                </button>
                <button onClick={() => { setContent(''); setTags([]); setResult(null) }} className="mono text-xs px-4 py-2 rounded-lg"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', opacity: content ? 1 : 0.4, cursor: content ? 'pointer' : 'not-allowed' }}>
                  Clear
                </button>
                <div className="flex-1" />
                {!isConnected && <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>Connect API key to publish</span>}
                <button onClick={publish} disabled={!canPublish}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{ background: canPublish ? 'var(--yellow)' : 'var(--bg4)', color: canPublish ? '#000' : 'var(--text3)', cursor: canPublish ? 'pointer' : 'not-allowed' }}>
                  {publishing && <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
                  {publishing ? 'Publishing...' : 'Publish to Square'}
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div className="rounded-xl p-4 mono text-xs animate-fade-up"
              style={{ background: result.ok ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)', border: `1px solid ${result.ok ? 'rgba(14,203,129,0.25)' : 'rgba(246,70,93,0.25)'}`, color: result.ok ? 'var(--green)' : 'var(--red)' }}>
              {result.msg}
            </div>
          )}

          {/* Preview */}
          {content && (
            <div className="rounded-xl p-5" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--text3)' }}>Preview</div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0" style={{ background: 'var(--yellow)', color: '#000' }}>B</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>You</span>
                    <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>just now</span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap mb-2" style={{ color: 'var(--text)' }}>{content}</div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map(t => <span key={t} className="mono text-[10px]" style={{ color: 'var(--yellow)' }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <div className="flex flex-col gap-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="text-4xl opacity-30">◎</div>
              <div className="font-bold" style={{ color: 'var(--text)' }}>No posts yet</div>
              <div className="mono text-xs" style={{ color: 'var(--text3)' }}>Posts and drafts will appear here.</div>
            </div>
          ) : history.map(p => (
            <div key={p.id} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="mono text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: p.status === 'published' ? 'rgba(14,203,129,0.1)' : 'var(--bg3)', color: p.status === 'published' ? 'var(--green)' : 'var(--text3)' }}>
                  {p.status}
                </span>
                <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>{timeAgo(p.publishedAt)}</span>
                {p.postId && <span className="mono text-[9px]" style={{ color: 'var(--text3)' }}>ID: {p.postId}</span>}
              </div>
              <div className="text-sm leading-relaxed mb-2" style={{ color: 'var(--text)' }}>{p.content}</div>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.tags.map(t => <span key={t} className="mono text-[10px]" style={{ color: 'var(--yellow)' }}>#{t}</span>)}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setContent(p.content); setTags(p.tags); setView('compose') }}
                  className="mono text-[10px] px-3 py-1 rounded-lg"
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  Edit & repost
                </button>
                <button onClick={() => { const u = history.filter(x => x.id !== p.id); setHistory(u); saveHistory(u) }}
                  className="mono text-[10px] px-3 py-1 rounded-lg"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FEED ── */}
      {view === 'feed' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Hot on Binance Square</span>
            <button onClick={loadFeed} disabled={feedLoad} className="mono text-xs px-3 py-1.5 rounded-lg flex items-center gap-2"
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
              {feedLoad && <span className="w-3 h-3 rounded-full border-2 animate-spin-slow" style={{ borderColor: 'var(--border2)', borderTopColor: 'var(--yellow)' }} />}
              {feedLoad ? 'Loading...' : '↺ Refresh'}
            </button>
          </div>
          {feed.length === 0 && !feedLoad ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="text-4xl opacity-30">◎</div>
              <div className="font-bold" style={{ color: 'var(--text)' }}>No feed data</div>
              <div className="mono text-xs" style={{ color: 'var(--text3)' }}>Click Refresh to load posts from Binance Square.</div>
            </div>
          ) : feed.map((p: any, i: number) => (
            <div key={p.id ?? i} className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center mono text-[10px] font-bold shrink-0" style={{ background: 'var(--bg4)', color: 'var(--text2)' }}>
                  {(p.author?.name ?? p.nickname ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{p.author?.name ?? p.nickname ?? 'Anonymous'}</div>
                  {p.createdAt && <div className="mono text-[9px]" style={{ color: 'var(--text3)' }}>{timeAgo(p.createdAt)}</div>}
                </div>
                <div className="flex items-center gap-3">
                  {p.likeCount    !== undefined && <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>♥ {p.likeCount}</span>}
                  {p.commentCount !== undefined && <span className="mono text-[10px]" style={{ color: 'var(--text3)' }}>💬 {p.commentCount}</span>}
                </div>
              </div>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
                {(p.content ?? p.text ?? '').slice(0, 300)}{(p.content ?? p.text ?? '').length > 300 ? '...' : ''}
              </div>
              {p.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.tags.slice(0, 4).map((t: any) => (
                    <span key={t} className="mono text-[9px]" style={{ color: 'var(--yellow)' }}>#{typeof t === 'string' ? t : t.name}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
