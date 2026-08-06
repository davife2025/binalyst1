'use client'

/**
 * components/Providers.tsx — Session H2 hotfix
 * SessionProvider import path changed between next-auth v4 and v5.
 * This version handles both gracefully.
 */

import { SessionProvider } from 'next-auth/react'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Reduce session fetch frequency — poll every 5 min instead of every focus
      refetchInterval={300}
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  )
}
