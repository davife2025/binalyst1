'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center" style={{ minHeight: 200 }}>
          <div className="text-3xl">⚠</div>
          <div>
            <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>Something went wrong</div>
            <div className="mono text-xs" style={{ color: 'var(--text3)' }}>{this.state.message}</div>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mono text-xs px-4 py-2 rounded-lg"
            style={{ background: 'var(--yellow)', color: '#000' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
