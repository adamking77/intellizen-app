-- Store document body directly in Supabase instead of on disk
ALTER TABLE vault_files ADD COLUMN IF NOT EXISTS content text;
