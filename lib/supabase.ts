import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://placeholder.supabase.co'
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON)

export function createServerClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SVC, {
    auth: { persistSession: false }
  })
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { session: data.session, user: data.user, error }
}

export async function signUp(email: string, password: string, name?: string) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: name ?? email.split('@')[0] } },
  })
  return { session: data.session, user: data.user, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })
  return { error }
}

// ── User settings ─────────────────────────────────────────────────────────────
export async function getUserSettings(userId: string) {
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  return data
}

export async function upsertUserSettings(userId: string, settings: {
  binance_key_enc?: string
  binance_sec_enc?: string
  auto_trade?:      boolean
  chat_mode?:       string
}) {
  const { error } = await supabase
    .from('user_settings')
   .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() } as any)
  return { error }
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export async function getUserAlerts(userId: string) {
  const { data } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createAlert(userId: string, alert: {
  symbol: string; condition: 'above'|'below'; target: number; note?: string
}) {
  const { data, error } = await supabase
    .from('alerts')
    .insert({ user_id: userId, ...alert } as any)
    .select()
    .single()
  return { data, error }
}

export async function deleteAlert(id: string) {
  const { error } = await supabase.from('alerts').delete().eq('id', id)
  return { error }
}

// ── Agent rules ───────────────────────────────────────────────────────────────
export async function getAgentRules(userId: string) {
  const { data } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createAgentRule(userId: string, rule: {
  name: string; symbol: string; trigger_type: string; trigger_value: number; action_type: string
}) {
  const { data, error } = await supabase
    .from('agent_rules')
    .insert({ user_id: userId, ...rule } as any)
    .select()
    .single()
  return { data, error }
}

export async function deleteAgentRule(id: string) {
  const { error } = await supabase.from('agent_rules').delete().eq('id', id)
  return { error }
}

// ── Square posts ──────────────────────────────────────────────────────────────
export async function getSquarePosts(userId: string) {
  const { data } = await supabase
    .from('square_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function saveSquarePost(userId: string, post: {
  content: string; tags: string[]; status: 'draft'|'published'; square_id?: string
}) {
  const { data, error } = await supabase
    .from('square_posts')
    .insert({
      user_id: userId, ...post,
      published_at: post.status === 'published' ? new Date().toISOString() : null,
    } as any)
    .select()
    .single()
  return { data, error }
}
