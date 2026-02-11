-- VocabApp Schema: words, books, storage
-- Run this in Supabase Dashboard → SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Words table ────────────────────────────────────────
CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  translation TEXT DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  example TEXT DEFAULT '',
  audio_url TEXT,
  category TEXT NOT NULL DEFAULT 'learning',
  -- SM-2 spaced repetition fields
  repetitions INTEGER NOT NULL DEFAULT 0,
  ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.50,
  interval_days INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate words per user
  UNIQUE(user_id, word)
);

-- ─── Books table ────────────────────────────────────────
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  current_page INTEGER NOT NULL DEFAULT 1,
  total_pages INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  pdf_storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────
CREATE INDEX idx_words_user_id ON words(user_id);
CREATE INDEX idx_words_next_review ON words(user_id, next_review_at);
CREATE INDEX idx_words_category ON words(user_id, category);
CREATE INDEX idx_books_user_id ON books(user_id);
CREATE INDEX idx_books_last_read ON books(user_id, last_read_at DESC);

-- ─── Updated_at trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_words_updated_at
  BEFORE UPDATE ON words
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Row Level Security ─────────────────────────────────
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;

-- Words RLS
CREATE POLICY "Users can view own words" ON words
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own words" ON words
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own words" ON words
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own words" ON words
  FOR DELETE USING (auth.uid() = user_id);

-- Books RLS
CREATE POLICY "Users can view own books" ON books
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own books" ON books
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own books" ON books
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own books" ON books
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Storage bucket for PDFs ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each user can only access their own folder
CREATE POLICY "Users can upload own PDFs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own PDFs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own PDFs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
