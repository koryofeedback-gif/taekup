-- TaekUp Database Initialization Script
-- Run this on your Neon database to set up the required tables

-- Enable UUID extension (required for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create challenges table for Dojang Rivals feature
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_student_id VARCHAR(255) NOT NULL,
  from_student_name VARCHAR(255) NOT NULL,
  to_student_id VARCHAR(255) NOT NULL,
  to_student_name VARCHAR(255) NOT NULL,
  challenge_id VARCHAR(255) NOT NULL,
  challenge_name VARCHAR(255) NOT NULL,
  challenge_xp INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  from_score INTEGER,
  to_score INTEGER,
  winner_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_challenges_from_student ON challenges(from_student_id);
CREATE INDEX IF NOT EXISTS idx_challenges_to_student ON challenges(to_student_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_created_at ON challenges(created_at);

-- Add comments for documentation
COMMENT ON TABLE challenges IS 'Stores challenge battles between students in Dojang Rivals';
COMMENT ON COLUMN challenges.status IS 'pending, accepted, declined, completed';
