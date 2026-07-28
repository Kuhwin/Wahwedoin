-- Migration 043: Per-user timezone
-- Users may travel outside the default Barbados timezone. Each profile now
-- stores a timezone identifier (IANA name, e.g. "America/Barbados") used
-- when computing recurring event/task due dates, expanding calendar
-- recurrences, and sending events to Google Calendar.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Barbados';
