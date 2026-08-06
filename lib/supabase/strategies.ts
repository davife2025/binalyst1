/**
 * lib/supabase/strategies.ts — Session 12
 *
 * Persist user strategies to Supabase so they survive browser refresh.
 * Strategies are synced bi-directionally: Zustand (fast local state)
 * ↔ Supabase (persistent remote state).
 */

import { createServerClient } from '@/lib/supabase'

export interface StrategyRow {
  id:              string
  user_id:         string
  name:            string
  text:            string
  rules:           object[]
  market_type:     string
  is_active:       boolean
  backtest_result: object | null
  created_at:      string
  updated_at:      string
}

export interface StrategyInsert {
  user_id:         string
  name:            string
  text:            string
  rules?:          object[]
  market_type?:    string
  is_active?:      boolean
  backtest_result?: object | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

export async function saveStrategy(s: StrategyInsert): Promise<StrategyRow | null> {
  try {
    const db = createServerClient()
    const { data, error } = await (db.from('strategies') as any)
      .insert({ ...s, rules: s.rules ?? [], market_type: s.market_type ?? 'crypto' })
      .select('*')
      .single()
    if (error) { console.error('[strategies.save]', error.message); return null }
    return data as StrategyRow
  } catch (e: any) { console.error('[strategies.save]', e.message); return null }
}

export async function updateStrategy(id: string, updates: Partial<StrategyInsert>): Promise<boolean> {
  try {
    const db = createServerClient()
    const { error } = await (db.from('strategies') as any).update(updates).eq('id', id)
    if (error) { console.error('[strategies.update]', error.message); return false }
    return true
  } catch (e: any) { console.error('[strategies.update]', e.message); return false }
}

export async function deleteStrategy(id: string): Promise<boolean> {
  try {
    const db = createServerClient()
    const { error } = await db.from('strategies').delete().eq('id', id)
    if (error) { console.error('[strategies.delete]', error.message); return false }
    return true
  } catch (e: any) { console.error('[strategies.delete]', e.message); return false }
}

export async function setActiveStrategy(userId: string, id: string): Promise<boolean> {
  try {
    const db = createServerClient()
    // Deactivate all, then activate the chosen one
    await (db.from('strategies') as any).update({ is_active: false }).eq('user_id', userId)
    const { error } = await (db.from('strategies') as any).update({ is_active: true }).eq('id', id)
    if (error) { console.error('[strategies.setActive]', error.message); return false }
    return true
  } catch (e: any) { console.error('[strategies.setActive]', e.message); return false }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getStrategies(userId: string): Promise<StrategyRow[]> {
  try {
    const db = createServerClient()
    const { data, error } = await (db.from('strategies') as any)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) { console.error('[strategies.get]', error.message); return [] }
    return (data ?? []) as StrategyRow[]
  } catch (e: any) { console.error('[strategies.get]', e.message); return [] }
}

export async function getActiveStrategy(userId: string): Promise<StrategyRow | null> {
  try {
    const db = createServerClient()
    const { data, error } = await (db.from('strategies') as any)
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()
    if (error) return null
    return data as StrategyRow
  } catch { return null }
}