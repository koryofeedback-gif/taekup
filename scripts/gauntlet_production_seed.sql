-- =====================================================
-- WARRIOR'S GAUNTLET - Production Database Setup
-- Run this SQL against your Neon production database
-- =====================================================

-- Step 1: Create the day enum type (if not exists)
DO $$ BEGIN
    CREATE TYPE gauntlet_day AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create gauntlet_challenges table
CREATE TABLE IF NOT EXISTS gauntlet_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week gauntlet_day NOT NULL,
    day_theme VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '⚔️',
    score_type VARCHAR(20) NOT NULL DEFAULT 'REPS',
    sort_order VARCHAR(4) NOT NULL DEFAULT 'DESC',
    target_value INTEGER,
    demo_video_url TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add demo_video_url column if table already exists
ALTER TABLE gauntlet_challenges ADD COLUMN IF NOT EXISTS demo_video_url TEXT;

-- Step 3: Create gauntlet_submissions table
CREATE TABLE IF NOT EXISTS gauntlet_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES gauntlet_challenges(id),
    student_id UUID NOT NULL,
    week_number INTEGER NOT NULL,
    score DECIMAL(10,2) NOT NULL,
    proof_type VARCHAR(10) NOT NULL DEFAULT 'TRUST',
    local_xp_awarded INTEGER NOT NULL DEFAULT 0,
    global_points_awarded INTEGER NOT NULL DEFAULT 0,
    is_personal_best BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create gauntlet_personal_bests table
CREATE TABLE IF NOT EXISTS gauntlet_personal_bests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES gauntlet_challenges(id),
    student_id UUID NOT NULL,
    best_score DECIMAL(10,2) NOT NULL,
    has_video_proof BOOLEAN DEFAULT false,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(challenge_id, student_id)
);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gauntlet_submissions_student ON gauntlet_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_gauntlet_submissions_week ON gauntlet_submissions(week_number);
CREATE INDEX IF NOT EXISTS idx_gauntlet_pb_student ON gauntlet_personal_bests(student_id);

-- Step 6: Seed the 14 Gauntlet Challenges (2 per day)
-- Clear existing challenges first (optional - remove if you want to keep existing)
DELETE FROM gauntlet_challenges;

INSERT INTO gauntlet_challenges (day_of_week, day_theme, name, description, icon, score_type, sort_order, target_value, is_active, display_order) VALUES
-- MONDAY - Engine
('MONDAY', 'Engine', 'Burpee AMRAP (7 min)', 'Complete as many burpees as possible in 7 minutes. Full extension at top, chest to floor at bottom.', '🔥', 'REPS', 'DESC', 7, true, 1),
('MONDAY', 'Engine', 'Dead Hang Pull-Ups', 'Maximum pull-ups from dead hang position. Full arm extension between each rep.', '💪', 'REPS', 'DESC', NULL, true, 2),

-- TUESDAY - Foundation
('TUESDAY', 'Foundation', 'Hindu Squats (100 reps)', 'Complete 100 Hindu squats as fast as possible. Heels lift, arms swing naturally.', '🏋️', 'TIME', 'ASC', 100, true, 1),
('TUESDAY', 'Foundation', 'Knuckle Push-Ups (2 min)', 'Maximum push-ups on knuckles in 2 minutes. Full lockout at top.', '👊', 'REPS', 'DESC', 2, true, 2),

-- WEDNESDAY - Evasion
('WEDNESDAY', 'Evasion', 'Shuttle Runs (Suicide Mile)', 'Complete the suicide mile pattern as fast as possible. Touch the line each time.', '🏃', 'TIME', 'ASC', NULL, true, 1),
('WEDNESDAY', 'Evasion', 'Hardstyle Plank', 'Hold the hardstyle plank as long as possible. Maximum tension, fists clenched, quads squeezed.', '🧘', 'TIME', 'DESC', NULL, true, 2),

-- THURSDAY - Explosion
('THURSDAY', 'Explosion', 'Broad Jumps (Max Dist)', 'Maximum single broad jump distance. Measure from takeoff to heel landing.', '🦘', 'DISTANCE', 'DESC', NULL, true, 1),
('THURSDAY', 'Explosion', 'Hanging Leg Raises (to 50)', 'Complete 50 hanging leg raises in as few sets as possible. Legs to bar each rep.', '🎯', 'SETS', 'ASC', 50, true, 2),

-- FRIDAY - Animal
('FRIDAY', 'Animal', 'Bear Crawl (5 min)', 'Maximum distance bear crawling in 5 minutes. Keep hips low, opposite hand-foot movement.', '🐻', 'DISTANCE', 'DESC', 5, true, 1),
('FRIDAY', 'Animal', 'Wall Sit', 'Maximum wall sit hold time. Thighs parallel to ground, back flat against wall.', '🧱', 'TIME', 'DESC', NULL, true, 2),

-- SATURDAY - Defense
('SATURDAY', 'Defense', 'The Sprawl (Tabata Score)', 'Complete sprawls in Tabata format (20s work / 10s rest x 8). Total reps count.', '🤼', 'REPS', 'DESC', 8, true, 1),
('SATURDAY', 'Defense', 'Walking Lunges (400m)', 'Complete 400m of walking lunges as fast as possible. Knee touches ground each rep.', '🚶', 'TIME', 'ASC', 400, true, 2),

-- SUNDAY - Flow
('SUNDAY', 'Flow', 'Jump Rope (Misses in 10m)', 'Jump rope for 10 minutes. Count total misses. Fewer misses = better score.', '⭕', 'COUNT', 'ASC', 10, true, 1),
('SUNDAY', 'Flow', 'Wrestlers Bridge', 'Maximum time holding the wrestlers bridge position. Head and feet only touching ground.', '🌉', 'TIME', 'DESC', NULL, true, 2);

-- Verify the seed
SELECT day_of_week, day_theme, name, score_type, sort_order FROM gauntlet_challenges ORDER BY 
    CASE day_of_week 
        WHEN 'MONDAY' THEN 1 
        WHEN 'TUESDAY' THEN 2 
        WHEN 'WEDNESDAY' THEN 3 
        WHEN 'THURSDAY' THEN 4 
        WHEN 'FRIDAY' THEN 5 
        WHEN 'SATURDAY' THEN 6 
        WHEN 'SUNDAY' THEN 7 
    END, display_order;
