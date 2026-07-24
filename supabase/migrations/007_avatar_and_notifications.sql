-- Add avatar_url to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create avatars storage bucket
-- Run this in Supabase SQL Editor:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
--   ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload to their own folder
-- CREATE POLICY "Users can upload avatars"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policy: anyone can view avatars
-- CREATE POLICY "Anyone can view avatars"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'avatars');

-- Storage policy: users can update their own avatars
-- CREATE POLICY "Users can update own avatars"
--   ON storage.objects FOR UPDATE TO authenticated
--   USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policy: users can delete their own avatars
-- CREATE POLICY "Users can delete own avatars"
--   ON storage.objects FOR DELETE TO authenticated
--   USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
