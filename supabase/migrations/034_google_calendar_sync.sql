-- Migration 034: Add google_event_id and google_account_id to events
-- Run in Supabase SQL Editor

ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_account_id UUID REFERENCES user_google_accounts(id) ON DELETE SET NULL;