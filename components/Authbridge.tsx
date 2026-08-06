'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

/**
 * AuthBridge — handles Supabase OAuth hash fragments on page load.
 * When Google redirects back with #access_token=... in the URL,
 * Supabase picks it up automatically. This component just ensures
 * the session is established and redirects away from /login if needed.
 */
export default function AuthBridge() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Listen for auth state changes (fires when hash token is processed)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Clear the hash from URL and redirect to app
        router.replace('/')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return null
}