export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row:    { id: string; email: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string }
        Insert: { id: string; email: string; display_name?: string | null; avatar_url?: string | null }
        Update: { email?: string; display_name?: string | null; avatar_url?: string | null; updated_at?: string }
      }
    user_settings: {
  Row: {
    id: string
    user_id: string
    binance_key_enc: string | null
    binance_sec_enc: string | null
    auto_trade: boolean
    chat_mode: string
    created_at: string
    updated_at: string
  }
  Insert: {
    user_id: string
    binance_key_enc?: string | null
    binance_sec_enc?: string | null
    auto_trade?: boolean
    chat_mode?: string
    updated_at?: string
  }
  Update: {
    binance_key_enc?: string | null
    binance_sec_enc?: string | null
    auto_trade?: boolean
    chat_mode?: string
    updated_at?: string
  }
}
      alerts: {
        Row:    { id: string; user_id: string; symbol: string; condition: 'above'|'below'; target: number; note: string | null; active: boolean; triggered_at: string | null; created_at: string }
        Insert: { user_id: string; symbol: string; condition: 'above'|'below'; target: number; note?: string | null }
        Update: { active?: boolean; triggered_at?: string | null }
      }
      agent_rules: {
        Row:    { id: string; user_id: string; name: string; symbol: string; trigger_type: string; trigger_value: number; action_type: string; active: boolean; last_triggered: string | null; created_at: string }
        Insert: { user_id: string; name: string; symbol: string; trigger_type: string; trigger_value: number; action_type: string }
        Update: { active?: boolean; last_triggered?: string | null }
      }
      trades: {
        Row: {
          id:               string
          user_id:          string
          chain:            string
          market_type:      string
          symbol:           string
          side:             string
          amount_usd:       number
          pnl_usd:          number
          tx_hash:          string | null
          status:           string
          dry_run:          boolean
          signal_score:     number | null
          regime:           string | null
          risk_preset:      string | null
          risk_drawdown:    number | null
          x402_payment_id:  string | null
          executed_at:      string
          created_at:       string
        }
        Insert: {
          user_id:          string
          chain:            string
          market_type:      string
          symbol:           string
          side:             string
          amount_usd:       number
          pnl_usd?:         number
          tx_hash?:         string | null
          status?:          string
          dry_run?:         boolean
          signal_score?:    number | null
          regime?:          string | null
          risk_preset?:     string | null
          risk_drawdown?:   number | null
          x402_payment_id?: string | null
          executed_at?:     string
        }
        Update: {
          pnl_usd?:         number
          status?:          string
          tx_hash?:         string | null
        }
      }
      square_posts: {
        Row:    { id: string; user_id: string; content: string; tags: string[]; status: 'draft'|'published'; square_id: string | null; published_at: string | null; created_at: string }
        Insert: { user_id: string; content: string; tags?: string[]; status?: 'draft'|'published'; square_id?: string | null; published_at?: string | null }
        Update: { status?: 'draft'|'published'; square_id?: string | null; published_at?: string | null }
      }
    }
  }
}
