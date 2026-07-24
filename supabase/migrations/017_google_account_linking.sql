-- Store multiple Google accounts linked to a single Wah We Doin user
CREATE TABLE IF NOT EXISTS user_google_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, google_user_id)
);

ALTER TABLE user_google_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own linked accounts
CREATE POLICY "Users can view own linked accounts"
  ON user_google_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own linked accounts"
  ON user_google_accounts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own linked accounts"
  ON user_google_accounts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own linked accounts"
  ON user_google_accounts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_ugoogle_user ON user_google_accounts(user_id);
CREATE INDEX idx_ugoogle_email ON user_google_accounts(email);
