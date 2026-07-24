-- Team invitations table
CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'member', 'viewer')) DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  UNIQUE(team_id, email)
);
CREATE INDEX IF NOT EXISTS idx_team_invites_email ON team_invites(email);
CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);

-- Calendar links (users paste their Google Calendar iCal URL)
CREATE TABLE IF NOT EXISTS calendar_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'My Calendar',
  ical_url TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_links_team ON calendar_links(team_id);
CREATE INDEX IF NOT EXISTS idx_calendar_links_user ON calendar_links(user_id);

-- RLS
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_links ENABLE ROW LEVEL SECURITY;

-- Team invites: team members can view invites for their teams
CREATE POLICY "Team members can view invites"
  ON team_invites FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Team owners/admins can create invites
CREATE POLICY "Team admins can create invites"
  ON team_invites FOR INSERT TO authenticated
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Team admins can delete invites
CREATE POLICY "Team admins can delete invites"
  ON team_invites FOR DELETE TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Anyone can view calendar links for their teams
CREATE POLICY "Team members can view calendar links"
  ON calendar_links FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Users can manage their own calendar links
CREATE POLICY "Users can manage own calendar links"
  ON calendar_links FOR ALL TO authenticated
  USING (user_id = auth.uid());
