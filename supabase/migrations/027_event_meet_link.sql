-- Migration 027: Add meet_link and attendees to events
-- Run manually in Supabase SQL Editor

ALTER TABLE events ADD COLUMN IF NOT EXISTS meet_link TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;
