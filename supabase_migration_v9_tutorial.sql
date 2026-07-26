-- ============================================
-- PROVISIO migration: Onboarding tutorial flag
-- ============================================
-- Stores whether a user has seen the first-login tutorial.
-- Kept in the DB (not localStorage) so it does not repeat across devices.
-- Safe to re-run (IF NOT EXISTS). RLS on user_settings already protects it.
-- Run in Supabase SQL Editor.
-- ============================================

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT false;
