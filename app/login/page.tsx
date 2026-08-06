'use client'

/**
 * app/login/page.tsx — UI Refresh
 * BNB brand aesthetic. All auth logic preserved exactly.
 */

import { useState } from 'react'
import { signIn }   from 'next-auth/react'
import { signUp, resetPassword } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'signup' | 'reset'

const LABELS: Record<Mode, string> = {
  login:  'Sign in',
  signup: 'Create account',
  reset:  'Reset password',
}

export default function LoginPage() {
  const router = useRouter()
  const [mode,       setMode]       = useState<Mode>('login')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [name,       setName]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [googleLoad, setGoogleLoad] = useState(false)
  const [guestLoad,  setGuestLoad]  = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [showPass,   setShowPass]   = useState(false)

  function resetState() { setError(''); setSuccess('') }

  async function loginWithGoogle() {
    setGoogleLoad(true); resetState()
    await signIn('google', { callbackUrl: '/' })
  }

  async function loginAsGuest() {
    setGuestLoad(true); resetState()
    const res = await signIn('credentials', { anonymous: 'true', redirect: false })
    if (res?.ok) router.push('/')
    else { setError('Guest login failed. Try again.'); setGuestLoad(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); resetState()
    try {
      if (mode === 'reset') {
        const { error } = await resetPassword(email)
        if (error) setError(error.message)
        else setSuccess('Check your email for a reset link.')
        setLoading(false); return
      }
      if (mode === 'signup') {
        const { error } = await signUp(email, password, name)
        if (error) { setError(error.message); setLoading(false); return }
      }
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.ok) router.push('/')
      else setError('Invalid email or password.')
    } catch { setError('Something went wrong.') }
    setLoading(false)
  }

  const inpStyle = {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 'var(--radius)',
    width: '100%', fontFamily: 'var(--font-space-mono)',
    fontSize: 13, padding: '10px 14px', outline: 'none',
  }
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.target.style.borderColor = 'var(--yellow)')
  const onBlur  = (e: React.FocusEvent<HTMLInputElement>) =>
    (e.target.style.borderColor = 'var(--border)')

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)', position: 'relative' }}>

      {/* BNB grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `linear-gradient(rgba(240,185,11,.04) 1px,transparent 1px),
                          linear-gradient(90deg,rgba(240,185,11,.04) 1px,transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      {/* Dot clusters */}
      <div style={{ position: 'fixed', top: 32, right: 80, pointerEvents: 'none', zIndex: 0,
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%',
            background: 'rgba(240,185,11,.28)', display: 'block' }} />
        ))}
      </div>
      <div style={{ position: 'fixed', bottom: 48, left: 48, pointerEvents: 'none', zIndex: 0,
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5 }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%',
            background: 'rgba(240,185,11,.22)', display: 'block' }} />
        ))}
      </div>

      <div className="relative w-full max-w-sm flex flex-col gap-5" style={{ zIndex: 1 }}>

        {/* Logo */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-md flex items-center justify-center font-black mx-auto mb-4"
            style={{ background: 'var(--yellow)', color: '#000', fontSize: 22, letterSpacing: '-.02em' }}>
            B
          </div>
          <h1 className="font-extrabold uppercase tracking-tight"
            style={{ fontSize: 22, color: 'var(--text)', letterSpacing: '-.01em' }}>
            Binal<span style={{ color: 'var(--yellow)' }}>yst</span>
          </h1>
          <p className="mono uppercase tracking-widest mt-1"
            style={{ fontSize: 8, color: 'var(--text3)', letterSpacing: '.12em' }}>
            AI-Powered Quant Trading
          </p>
        </div>

        {/* Card */}
        <div className="rounded-md flex flex-col gap-4"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '20px 20px' }}>

          <div className="mono uppercase tracking-widest font-bold"
            style={{ fontSize: 8, color: 'var(--text3)' }}>
            {LABELS[mode]}
          </div>

          {mode !== 'reset' && (
            <>
              {/* Google */}
              <button onClick={loginWithGoogle} disabled={googleLoad}
                className="flex items-center justify-center gap-3 font-semibold w-full transition-all"
                style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text)', cursor: googleLoad ? 'not-allowed' : 'pointer',
                  opacity: googleLoad ? 0.6 : 1, padding: '10px 14px', borderRadius: 'var(--radius)',
                  fontSize: 13,
                }}>
                {googleLoad ? (
                  <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {googleLoad ? 'Redirecting...' : 'Continue with Google'}
              </button>

              {/* Guest */}
              <button onClick={loginAsGuest} disabled={guestLoad}
                className="flex items-center justify-center gap-2 font-semibold w-full transition-all"
                style={{
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text2)', cursor: guestLoad ? 'not-allowed' : 'pointer',
                  opacity: guestLoad ? 0.6 : 1, padding: '10px 14px', borderRadius: 'var(--radius)',
                  fontSize: 13,
                }}>
                {guestLoad ? (
                  <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin-slow" />
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
                {guestLoad ? 'Loading...' : 'Continue as Guest'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="mono" style={{ fontSize: 9, color: 'var(--text3)' }}>or email</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
            </>
          )}

          {/* Email form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <label className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'var(--text3)' }}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" style={inpStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'var(--text3)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required style={inpStyle} onFocus={onFocus} onBlur={onBlur} />
            </div>

            {mode !== 'reset' && (
              <div className="flex flex-col gap-1.5">
                <label className="mono uppercase tracking-widest font-bold" style={{ fontSize: 8, color: 'var(--text3)' }}>Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    style={{ ...inpStyle, paddingRight: 52 }}
                    onFocus={onFocus} onBlur={onBlur} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 mono font-bold"
                    style={{ fontSize: 9, color: 'var(--text3)' }}>
                    {showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {mode === 'login' && (
                  <button type="button" onClick={() => { setMode('reset'); resetState() }}
                    className="mono self-end" style={{ fontSize: 9, color: 'var(--text3)' }}>
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mono rounded-md" style={{ fontSize: 11, padding: '8px 12px',
                background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.25)', color: 'var(--red)' }}>
                {error}
              </div>
            )}
            {success && (
              <div className="mono rounded-md" style={{ fontSize: 11, padding: '8px 12px',
                background: 'rgba(14,203,129,0.08)', border: '1px solid rgba(14,203,129,0.25)', color: 'var(--green)' }}>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="flex items-center justify-center gap-2 font-extrabold uppercase tracking-wider w-full"
              style={{
                background: 'var(--yellow)', color: '#000',
                opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
                padding: '11px 14px', borderRadius: 'var(--radius)',
                fontSize: 11, letterSpacing: '.08em', border: 'none',
              }}>
              {loading && <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin-slow" />}
              {loading ? 'Please wait...' : LABELS[mode]}
            </button>
          </form>

          {/* Mode switcher */}
          <div className="flex items-center justify-center gap-3 mono" style={{ fontSize: 11 }}>
            {mode !== 'login'  && (
              <button onClick={() => { setMode('login');  resetState() }}
                style={{ color: 'var(--text2)' }}>Sign in</button>
            )}
            {mode !== 'login' && mode !== 'signup' && (
              <span style={{ color: 'var(--text3)' }}>·</span>
            )}
            {mode !== 'signup' && (
              <button onClick={() => { setMode('signup'); resetState() }}
                style={{ color: 'var(--text2)' }}>Create account</button>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mono text-center" style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '.05em' }}>
          Guest sessions are temporary · Sign up to save your data
        </p>
      </div>
    </div>
  )
}