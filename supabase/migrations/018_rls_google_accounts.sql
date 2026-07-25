-- Enable RLS on user_google_accounts (idempotent)
ALTER TABLE user_google_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own linked accounts" ON user_google_accounts;
DROP POLICY IF EXISTS "Users can insert own linked accounts" ON user_google_accounts;
DROP POLICY IF EXISTS "Users can update own linked accounts" ON user_google_accounts;
DROP POLICY IF EXISTS "Users can delete own linked accounts" ON user_google_accounts;

-- Users can view their own linked accounts
CREATE POLICY "Users can view own linked accounts"
ON user_google_accounts
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own linked accounts
CREATE POLICY "Users can insert own linked accounts"
ON user_google_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own linked accounts
CREATE POLICY "Users can update own linked accounts"
ON user_google_accounts
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own linked accounts
CREATE POLICY "Users can delete own linked accounts"
ON user_google_accounts
FOR DELETE
USING (auth.uid() = user_id);
