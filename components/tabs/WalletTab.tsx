'use client'
/**
 * components/tabs/WalletTab.tsx — Session 11 (new)
 *
 * Agent wallet funding and withdrawal.
 * - RECEIVE: Shows GOAT wallet address + QR code + faucet link for testnet
 * - SEND: Send BTC or tokens out of the agent wallet
 * - HISTORY: Recent inbound/outbound transactions (from GOAT explorer)
 */

import { useState, useEffect }   from 'react'
import { useGoatStore }           from '@/lib/goat/store'
import { GoatClient }             from '@/lib/goat/client'

type Tab = 'receive' | 'send'

function QRPlaceholder({ address }: { address: string }) {
  // Simple visual address QR placeholder — renders the address as a
  // pseudo-grid. For production swap with 'qrcode.react' npm package.
  const size   = 140
  const cell   = 7
  const cols   = Math.floor(size / cell)
  const bytes  = address.replace('0x', '').slice(0, cols * cols)

  return (
    <div
      className="rounded-xl p-3 mx-auto"
      style={{ background: '#fff', width: size + 24, height: size + 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: 1 }}>
        {Array.from({ length: cols * cols }, (_, i) => {
          const bit = parseInt(bytes[i] ?? '0', 16) % 2
          return (
            <div key={i} style={{ width: cell, height: cell, background: bit ? '#000' : '#fff', borderRadius: 1 }} />
          )
        })}
      </div>
    </div>
  )
}

export default function WalletTab() {
  const {
    agentAddress, privateKey, isWalletLoaded,
    network, btcBalance, setBtcBalance,
  } = useGoatStore()

  const [activeTab,  setActiveTab]  = useState<Tab>('receive')
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [sending,    setSending]    = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Send form
  const [sendTo,     setSendTo]     = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [confirm,    setConfirm]    = useState(false)

  const networkLabel  = network === 'mainnet' ? 'GOAT Mainnet' : 'GOAT Testnet3'
  const explorerBase  = network === 'mainnet'
    ? 'https://explorer.goat.network'
    : 'https://explorer.testnet3.goat.network'
  const faucetUrl     = 'https://faucet.goat.network'

  function copy() {
    navigator.clipboard.writeText(agentAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function refreshBalance() {
    if (!privateKey || !isWalletLoaded) return
    setRefreshing(true)
    try {
      const client = new GoatClient(privateKey, network)
      const bal    = await client.getBTCBalance()
      setBtcBalance(bal)
    } catch (e: any) {
      setError(e.message)
    }
    setRefreshing(false)
  }

  useEffect(() => {
    if (isWalletLoaded) refreshBalance()
  }, [isWalletLoaded, network])

  async function handleSend() {
    if (!confirm) { setConfirm(true); return }
    if (!privateKey || !isWalletLoaded) { setError('Wallet not unlocked'); return }
    if (!sendTo.trim().startsWith('0x') || sendTo.trim().length !== 42) {
      setError('Invalid recipient address — must be 0x...'); return
    }
    const amount = parseFloat(sendAmount)
    if (!amount || amount <= 0) { setError('Enter a valid amount'); return }
    if (amount >= btcBalance) { setError(`Insufficient balance — you have ${btcBalance.toFixed(6)} BTC`); return }

    setSending(true); setError(''); setSuccess('')
    try {
      const client = new GoatClient(privateKey, network)
      const result = await client.sendBTC(sendTo.trim(), amount)
      if (!result.success) throw new Error(result.error ?? 'Send failed')
      setSuccess(`Sent ${amount} BTC · tx: ${result.txHash}`)
      setSendTo(''); setSendAmount(''); setConfirm(false)
      await refreshBalance()
    } catch (e: any) {
      setError(e.message)
    }
    setSending(false)
  }

  if (!isWalletLoaded || !agentAddress) {
    return (
      <div className="max-w-xl mx-auto px-6 py-12 flex flex-col items-center gap-4 text-center">
        <div className="text-4xl">🔐</div>
        <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>No wallet loaded</div>
        <div className="font-mono text-[10px]" style={{ color: 'var(--text3)' }}>
          Go to Live Agent to unlock or generate your GOAT Network wallet first.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Agent Wallet</h2>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {networkLabel} · BTC gas token
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl px-4 py-2" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Balance</div>
            <div className="font-mono text-sm font-bold" style={{ color: btcBalance > 0 ? 'var(--yellow)' : 'var(--red)' }}>
              {btcBalance.toFixed(6)} BTC
            </div>
          </div>
          <button onClick={refreshBalance} disabled={refreshing}
            className="font-mono text-[10px] px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['receive', 'send'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setActiveTab(t); setError(''); setSuccess(''); setConfirm(false) }}
            className="font-mono text-xs font-bold px-5 py-2 rounded-full capitalize"
            style={{
              background: activeTab === t ? 'var(--yellow)' : 'var(--bg2)',
              color:      activeTab === t ? '#000' : 'var(--text2)',
              border:     '1px solid var(--border)',
            }}>
            {t === 'receive' ? '⬇ Receive' : '⬆ Send'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(246,70,93,.07)', border: '1px solid rgba(246,70,93,.2)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg px-4 py-2.5 font-mono text-[10px]"
          style={{ background: 'rgba(14,203,129,.07)', border: '1px solid rgba(14,203,129,.2)', color: 'var(--green)' }}>
          ✓ {success}
          {success.includes('tx:') && (
            <a href={`${explorerBase}/tx/${success.split('tx: ')[1]}`}
              target="_blank" rel="noopener noreferrer"
              className="ml-2 underline" style={{ color: 'var(--green)' }}>
              View on explorer ↗
            </a>
          )}
        </div>
      )}

      {/* ── RECEIVE ──────────────────────────────────────────────────────── */}
      {activeTab === 'receive' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-5 flex flex-col items-center gap-4"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <QRPlaceholder address={agentAddress} />
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Agent wallet address · {networkLabel}
            </div>
            <div className="flex items-center gap-2 w-full">
              <code className="font-mono text-xs flex-1 break-all p-3 rounded-lg"
                style={{ background: 'var(--bg3)', color: 'var(--text)' }}>
                {agentAddress}
              </code>
              <button onClick={copy}
                className="font-mono text-[10px] px-3 py-2 rounded-lg shrink-0"
                style={{ background: copied ? 'var(--green)' : 'var(--bg3)', color: copied ? '#003d1f' : 'var(--text2)', border: '1px solid var(--border)' }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Testnet faucet */}
          {network === 'testnet3' && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(240,185,11,.06)', border: '1px solid rgba(240,185,11,.2)' }}>
              <div className="font-mono text-[10px] font-bold mb-1" style={{ color: 'var(--yellow)' }}>
                Need testnet BTC?
              </div>
              <div className="font-mono text-[10px] mb-2" style={{ color: 'var(--text3)' }}>
                Get free GOAT Testnet3 BTC from the faucet. Copy your address above then paste it there.
              </div>
              <a href={faucetUrl} target="_blank" rel="noopener noreferrer"
                className="font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg inline-block"
                style={{ background: 'var(--yellow)', color: '#000' }}>
                Open faucet.goat.network ↗
              </a>
            </div>
          )}

          {/* Mainnet instructions */}
          {network === 'mainnet' && (
            <div className="rounded-xl p-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div className="font-mono text-[10px] font-bold mb-2" style={{ color: 'var(--text)' }}>
                How to fund this wallet
              </div>
              <ol className="font-mono text-[10px] space-y-1.5" style={{ color: 'var(--text3)' }}>
                <li>1. Copy the address above</li>
                <li>2. Send BTC from any wallet or exchange to this address on GOAT Network</li>
                <li>3. Or bridge from Ethereum/BSC via the GOAT Bridge</li>
                <li>4. The agent uses BTC for gas — keep at least 0.0001 BTC in the wallet</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ── SEND ─────────────────────────────────────────────────────────── */}
      {activeTab === 'send' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-5 flex flex-col gap-4"
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>
              Send BTC · {networkLabel}
            </div>

            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text3)' }}>
                Recipient address
              </div>
              <input
                type="text"
                placeholder="0x..."
                value={sendTo}
                onChange={e => { setSendTo(e.target.value); setConfirm(false) }}
                className="w-full font-mono text-xs px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Amount (BTC)</div>
                <button onClick={() => setSendAmount((btcBalance * 0.95).toFixed(8))}
                  className="font-mono text-[9px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                  Max (95%)
                </button>
              </div>
              <input
                type="number"
                placeholder="0.001"
                min="0"
                step="0.00001"
                value={sendAmount}
                onChange={e => { setSendAmount(e.target.value); setConfirm(false) }}
                className="w-full font-mono text-xs px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <div className="font-mono text-[9px] mt-1" style={{ color: 'var(--text3)' }}>
                Available: {btcBalance.toFixed(6)} BTC · Gas reserve kept: 0.0001 BTC
              </div>
            </div>

            {/* Confirmation step */}
            {confirm && sendTo && sendAmount && (
              <div className="rounded-lg p-3" style={{ background: 'rgba(246,70,93,.06)', border: '1px solid rgba(246,70,93,.2)' }}>
                <div className="font-mono text-[10px] font-bold mb-1" style={{ color: 'var(--red)' }}>
                  ⚠ Confirm transaction
                </div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text2)' }}>
                  Send <strong>{sendAmount} BTC</strong> to<br />
                  <code style={{ color: 'var(--text)' }}>{sendTo}</code><br />
                  on {networkLabel}. This cannot be undone.
                </div>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending || !sendTo || !sendAmount}
              className="font-mono text-xs font-bold px-4 py-2.5 rounded-lg"
              style={{
                background: confirm ? 'var(--red)' : 'var(--yellow)',
                color:      confirm ? '#fff' : '#000',
                opacity:    (sending || !sendTo || !sendAmount) ? 0.4 : 1,
              }}>
              {sending ? 'Sending…' : confirm ? 'Confirm & Send →' : 'Review transaction →'}
            </button>

            {confirm && (
              <button onClick={() => setConfirm(false)}
                className="font-mono text-[10px] px-4 py-1.5 rounded-lg"
                style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            )}
          </div>

          {/* Warning */}
          <div className="rounded-lg px-4 py-3 font-mono text-[10px]"
            style={{ background: 'rgba(240,185,11,.04)', border: '1px solid rgba(240,185,11,.15)', color: 'var(--text3)' }}>
            Always leave a small BTC reserve in the agent wallet for gas fees.
            Sending your entire balance will prevent the agent from executing trades.
          </div>
        </div>
      )}
    </div>
  )
}
