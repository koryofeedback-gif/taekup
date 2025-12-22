import express, { type Express, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { storage } from './storage';
import { stripeService } from './stripeService';
import { getStripePublishableKey, getUncachableStripeClient } from './stripeClient';
import { generateTaekBotResponse, generateClassPlan, generateWelcomeEmail, generateVideoFeedback, generateDailyChallenge } from './aiService';
import emailService from './services/emailService';
import * as emailAutomation from './services/emailAutomationService';
import { db } from './db';
import { sql } from 'drizzle-orm';
import s3Storage from './services/s3StorageService';

let cachedProducts: any[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// =====================================================
// UNIFIED XP SERVICE - Single source of truth for XP
// =====================================================
// All XP awards go through this function to ensure students.total_xp is always accurate
async function awardXP(studentId: string, xpAmount: number, source: 'arena' | 'home_dojo' | 'mystery' | 'family' | 'content' | 'pvp' | 'video', metadata?: object): Promise<{ success: boolean; newTotal: number }> {
  if (!studentId || xpAmount <= 0) {
    return { success: false, newTotal: 0 };
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    console.warn('[XP] Invalid student ID format:', studentId);
    return { success: false, newTotal: 0 };
  }
  
  try {
    // Atomically increment total_xp and return the new value
    const result = await db.execute(sql`
      UPDATE students 
      SET total_xp = COALESCE(total_xp, 0) + ${xpAmount}, updated_at = NOW()
      WHERE id = ${studentId}::uuid
      RETURNING total_xp
    `);
    
    const newTotal = (result as any[])[0]?.total_xp || 0;
    console.log(`[XP] Awarded ${xpAmount} XP to student ${studentId} (source: ${source}) -> new total: ${newTotal}`);
    
    return { success: true, newTotal };
  } catch (error) {
    console.error('[XP] Failed to award XP:', error);
    return { success: false, newTotal: 0 };
  }
}

// Get student's current total XP from database (single source of truth)
async function getStudentXP(studentId: string): Promise<number> {
  if (!studentId) return 0;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return 0;
  
  try {
    const result = await db.execute(sql`
      SELECT total_xp FROM students WHERE id = ${studentId}::uuid
    `);
    return (result as any[])[0]?.total_xp || 0;
  } catch (error) {
    console.error('[XP] Failed to get XP:', error);
    return 0;
  }
}

// Generate deterministic UUID from challenge type string (since challenges are hardcoded, not in DB)
function generateChallengeUUID(challengeType: string): string {
  const hash = crypto.createHash('sha256').update(`taekup-challenge-${challengeType}`).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

export function registerRoutes(app: Express) {
  app.post('/api/signup', async (req: Request, res: Response) => {
    try {
      const { clubName, email, password, country } = req.body;

      if (!clubName || !email || !password) {
        return res.status(400).json({ error: 'Club name, email, and password are required' });
      }

      const existingClub = await db.execute(
        sql`SELECT id FROM clubs WHERE owner_email = ${email}`
      );

      if ((existingClub as any[]).length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      const clubResult = await db.execute(sql`
        INSERT INTO clubs (name, owner_email, country, trial_start, trial_end, trial_status, status, created_at)
        VALUES (${clubName}, ${email}, ${country || 'US'}, NOW(), ${trialEnd.toISOString()}::timestamptz, 'active', 'active', NOW())
        RETURNING id, name, owner_email, trial_start, trial_end
      `);

      const club = (clubResult as any[])[0];

      await db.execute(sql`
        INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
        VALUES (${email}, ${passwordHash}, 'owner', ${club.id}, true, NOW())
        ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, club_id = ${club.id}
      `);

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
        VALUES ('club_signup', 'New Club Signup', ${'New club signup: ' + clubName}, ${JSON.stringify({ clubId: club.id, email, country })}::jsonb, NOW())
      `);

      await emailAutomation.sendWelcomeEmailAuto(club.id, email, clubName, clubName);

      console.log('[Signup] New club created:', club.id, clubName);

      return res.status(201).json({
        success: true,
        club: {
          id: club.id,
          name: club.name,
          email: club.owner_email,
          trialStart: club.trial_start,
          trialEnd: club.trial_end
        }
      });

    } catch (error: any) {
      console.error('[Signup] Error:', error.message);
      console.error('[Signup] Full error:', error);
      console.error('[Signup] Request body:', req.body);
      return res.status(500).json({ error: 'Failed to create account. Please try again.', details: error.message });
    }
  });

  app.post('/api/verify-password', (req: Request, res: Response) => {
    const sitePassword = process.env.SITE_PASSWORD;
    
    if (!sitePassword) {
      return res.json({ valid: true });
    }

    const { password } = req.body || {};

    if (password === sitePassword) {
      return res.json({ valid: true });
    }

    return res.status(401).json({ valid: false, error: 'Incorrect password' });
  });

  app.post('/api/club/save-wizard-data', async (req: Request, res: Response) => {
    try {
      const { clubId, wizardData } = req.body;
      
      if (!clubId || !wizardData) {
        return res.status(400).json({ error: 'Club ID and wizard data are required' });
      }

      await db.execute(sql`
        UPDATE clubs 
        SET wizard_data = ${JSON.stringify(wizardData)}::jsonb,
            updated_at = NOW()
        WHERE id = ${clubId}::uuid
      `);

      // Try to update onboarding_progress (may not exist on all databases)
      try {
        await db.execute(sql`
          INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
          VALUES (${clubId}::uuid, true, NOW())
          ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true
        `);
      } catch (onboardingErr: any) {
        console.log('[Wizard] onboarding_progress table may not exist, continuing:', onboardingErr);
      }

      // Create user accounts for coaches
      const coaches = wizardData.coaches || [];
      for (const coach of coaches) {
        if (coach.email) {
          try {
            const coachEmail = coach.email.toLowerCase().trim();
            const tempPassword = coach.password || crypto.randomBytes(8).toString('hex');
            const passwordHash = await bcrypt.hash(tempPassword, 10);
            
            // Check if user already exists
            const existingUser = await db.execute(sql`
              SELECT id FROM users WHERE email = ${coachEmail} LIMIT 1
            `);
            
            let userId;
            if ((existingUser as any[]).length > 0) {
              userId = (existingUser as any[])[0].id;
              await db.execute(sql`
                UPDATE users SET 
                  password_hash = ${passwordHash},
                  name = ${coach.name},
                  club_id = ${clubId}::uuid,
                  role = 'coach',
                  updated_at = NOW()
                WHERE id = ${userId}::uuid
              `);
            } else {
              const userResult = await db.execute(sql`
                INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
                VALUES (${coachEmail}, ${passwordHash}, ${coach.name}, 'coach', ${clubId}::uuid, true, NOW())
                RETURNING id
              `);
              userId = (userResult as any[])[0]?.id;
            }
            
            const existingCoach = await db.execute(sql`
              SELECT id FROM coaches WHERE club_id = ${clubId}::uuid AND email = ${coachEmail} LIMIT 1
            `);
            
            if ((existingCoach as any[]).length > 0) {
              await db.execute(sql`
                UPDATE coaches SET user_id = ${userId}::uuid, name = ${coach.name}, is_active = true, updated_at = NOW()
                WHERE id = ${(existingCoach as any[])[0].id}::uuid
              `);
            } else {
              await db.execute(sql`
                INSERT INTO coaches (club_id, user_id, name, email, is_active, created_at)
                VALUES (${clubId}::uuid, ${userId}::uuid, ${coach.name}, ${coachEmail}, true, NOW())
              `);
            }
            console.log('[Wizard] Created user account for coach:', coachEmail);
          } catch (coachErr: any) {
            console.error('[Wizard] Error creating coach account:', coach.email, coachErr.message);
          }
        }
      }

      // Create user accounts for parents and save students
      const students = wizardData.students || [];
      for (const student of students) {
        try {
          const parentEmail = student.parentEmail?.toLowerCase().trim() || null;
          
          const existingStudent = await db.execute(sql`
            SELECT id FROM students WHERE club_id = ${clubId}::uuid AND name = ${student.name} LIMIT 1
          `);
          
          let studentId;
          if ((existingStudent as any[]).length > 0) {
            studentId = (existingStudent as any[])[0].id;
            const birthdateValue = student.birthday ? student.birthday + 'T00:00:00Z' : null;
            await db.execute(sql`
              UPDATE students SET 
                parent_email = ${parentEmail},
                parent_name = ${student.parentName || null},
                parent_phone = ${student.parentPhone || null},
                belt = ${student.beltId || 'white'},
                birthdate = ${birthdateValue}::timestamptz,
                total_points = ${student.totalPoints || 0},
                total_xp = ${student.lifetimeXp || 0},
                updated_at = NOW()
              WHERE id = ${studentId}::uuid
            `);
          } else {
            const birthdateValue = student.birthday ? student.birthday + 'T00:00:00Z' : null;
            const insertResult = await db.execute(sql`
              INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, total_xp, created_at)
              VALUES (${clubId}::uuid, ${student.name}, ${parentEmail}, ${student.parentName || null}, ${student.parentPhone || null}, ${student.beltId || 'white'}, ${birthdateValue}::timestamptz, ${student.totalPoints || 0}, ${student.lifetimeXp || 0}, NOW())
              RETURNING id
            `);
            studentId = (insertResult as any[])[0]?.id;
          }
          
          if (parentEmail && student.parentPassword) {
            const existingParent = await db.execute(sql`
              SELECT id FROM users WHERE email = ${parentEmail} LIMIT 1
            `);
            
            const parentPasswordHash = await bcrypt.hash(student.parentPassword, 10);
            
            if ((existingParent as any[]).length > 0) {
              await db.execute(sql`
                UPDATE users SET 
                  password_hash = ${parentPasswordHash},
                  name = COALESCE(${student.parentName || student.name + "'s Parent"}, name),
                  club_id = ${clubId}::uuid,
                  role = 'parent',
                  updated_at = NOW()
                WHERE id = ${(existingParent as any[])[0].id}::uuid
              `);
            } else {
              await db.execute(sql`
                INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
                VALUES (${parentEmail}, ${parentPasswordHash}, ${student.parentName || student.name + "'s Parent"}, 'parent', ${clubId}::uuid, true, NOW())
              `);
            }
            console.log('[Wizard] Created user account for parent:', parentEmail);
          }
        } catch (studentErr: any) {
          console.error('[Wizard] Error saving student:', student.name, studentErr.message);
        }
      }

      console.log('[Wizard] Saved wizard data for club:', clubId, `(${coaches.length} coaches, ${students.length} students)`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[Wizard] Save error:', error);
      return res.status(500).json({ error: 'Failed to save wizard data' });
    }
  });

  app.get('/api/club/:clubId/data', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }

      const clubResult = await db.execute(sql`
        SELECT id, name, owner_email, owner_name, country, city, art_type, 
               wizard_data, trial_start, trial_end, trial_status, status
        FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const studentsResult = await db.execute(sql`
        SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
               total_points, total_xp, stripes
        FROM students WHERE club_id = ${clubId}::uuid
      `);

      const coachesResult = await db.execute(sql`
        SELECT id, name, email
        FROM coaches WHERE club_id = ${clubId}::uuid AND is_active = true
      `);

      const savedWizardData = club.wizard_data || {};
      const savedBelts = savedWizardData.belts || [];
      
      const getBeltIdFromName = (beltName: string): string => {
        if (!beltName) return savedBelts[0]?.id || 'white';
        const matchedBelt = savedBelts.find((b: any) => 
          b.name?.toLowerCase() === beltName.toLowerCase() ||
          b.id?.toLowerCase() === beltName.toLowerCase()
        );
        return matchedBelt?.id || savedBelts[0]?.id || 'white';
      };
      
      const students = (studentsResult as any[]).map(s => ({
        id: s.id,
        name: s.name,
        parentEmail: s.parent_email,
        parentName: s.parent_name,
        parentPhone: s.parent_phone,
        beltId: getBeltIdFromName(s.belt),
        birthday: s.birthdate,
        totalXP: s.total_xp || 0,
        totalPoints: s.total_points || 0,
        lifetimeXp: s.total_xp || 0,
        currentStreak: 0,
        stripeCount: s.stripes || 0,
        performanceHistory: [],
        homeDojo: { character: [], chores: [], school: [], health: [] }
      }));

      const coaches = (coachesResult as any[]).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        location: c.location || '',
        assignedClasses: c.assigned_classes || []
      }));

      const wizardData = {
        ...savedWizardData,
        students,
        coaches,
        clubName: savedWizardData.clubName || club.name,
        ownerName: savedWizardData.ownerName || club.owner_name || '',
        country: savedWizardData.country || club.country || 'US',
      };

      return res.json({
        success: true,
        club: {
          id: club.id,
          name: club.name,
          ownerEmail: club.owner_email,
          ownerName: club.owner_name,
          trialStart: club.trial_start,
          trialEnd: club.trial_end,
          trialStatus: club.trial_status,
          status: club.status
        },
        wizardData
      });
    } catch (error: any) {
      console.error('[Club Data] Fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch club data' });
    }
  });

  // Simple name-based login - finds existing student or creates new one
  app.post('/api/login-by-name', async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }
      
      const studentName = name.trim();
      
      // Step A: Look up existing student by name
      const existingResult = await db.execute(sql`
        SELECT id, name, total_xp, club_id FROM students WHERE LOWER(name) = LOWER(${studentName}) LIMIT 1
      `);
      
      if ((existingResult as any[]).length > 0) {
        // Step B: Found existing student - return their ID
        const student = (existingResult as any[])[0];
        console.log(`[LoginByName] Found existing student: ${student.name} (${student.id}), XP: ${student.total_xp}`);
        
        // Return student with their current total_xp (single source of truth)
        return res.json({
          success: true,
          isNew: false,
          student: {
            id: student.id,
            name: student.name,
            totalXp: student.total_xp || 0,
            clubId: student.club_id
          }
        });
      }
      
      // Step C: No existing student - create new one
      const clubResult = await db.execute(sql`SELECT id FROM clubs LIMIT 1`);
      let clubId: string;
      
      if ((clubResult as any[]).length > 0) {
        clubId = (clubResult as any[])[0].id;
      } else {
        const newClubResult = await db.execute(sql`
          INSERT INTO clubs (name, owner_email, status, trial_status, created_at) 
          VALUES ('Demo Dojo', 'demo@taekup.com', 'active', 'active', NOW()) RETURNING id
        `);
        clubId = (newClubResult as any[])[0].id;
      }
      
      const insertResult = await db.execute(sql`
        INSERT INTO students (club_id, name, belt, total_xp, created_at)
        VALUES (${clubId}::uuid, ${studentName}, 'White', 0, NOW()) RETURNING id, name, total_xp, club_id
      `);
      const newStudent = (insertResult as any[])[0];
      console.log(`[LoginByName] Created new student: ${newStudent.name} (${newStudent.id})`);
      
      return res.json({
        success: true,
        isNew: true,
        student: {
          id: newStudent.id,
          name: newStudent.name,
          totalXp: 0,
          clubId: newStudent.club_id
        }
      });
    } catch (error: any) {
      console.error('[LoginByName] Error:', error.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  app.post('/api/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const userResult = await db.execute(
        sql`SELECT u.id, u.email, u.password_hash, u.role, u.name, u.club_id, u.is_active,
                   c.name as club_name, c.owner_email, c.status as club_status, c.trial_status, c.trial_end,
                   c.wizard_data IS NOT NULL as has_wizard_data
            FROM users u
            LEFT JOIN clubs c ON u.club_id = c.id
            WHERE LOWER(u.email) = ${normalizedEmail} AND u.is_active = true
            LIMIT 1`
      );

      const user = (userResult as any[])[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.password_hash) {
        return res.status(401).json({ error: 'Please set up your password first. Check your email for an invitation link.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      console.log('[Login] User authenticated:', user.email, 'Role:', user.role);

      let wizardCompleted = false;
      let wizardData = null;
      
      if (user.club_id) {
        // Fetch wizard_data from clubs table
        const clubDataResult = await db.execute(
          sql`SELECT wizard_data FROM clubs WHERE id = ${user.club_id}::uuid LIMIT 1`
        );
        const clubData = (clubDataResult as any[])[0];
        if (clubData?.wizard_data && Object.keys(clubData.wizard_data).length > 0) {
          wizardData = { ...clubData.wizard_data };
          wizardCompleted = true;
          
          // CRITICAL: Replace wizard_data students with fresh database students (proper UUIDs)
          const studentsResult = await db.execute(sql`
            SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
                   total_points, total_xp, stripes
            FROM students WHERE club_id = ${user.club_id}::uuid
          `);
          
          const savedBelts = wizardData.belts || [];
          const getBeltIdFromName = (beltName: string): string => {
            if (!beltName) return savedBelts[0]?.id || 'white';
            const matchedBelt = savedBelts.find((b: any) => 
              b.name?.toLowerCase() === beltName.toLowerCase() ||
              b.id?.toLowerCase() === beltName.toLowerCase()
            );
            return matchedBelt?.id || savedBelts[0]?.id || 'white';
          };
          
          // Replace students with database records (with proper UUIDs)
          wizardData.students = (studentsResult as any[]).map(s => ({
            id: s.id,
            name: s.name,
            clubId: user.club_id,
            parentEmail: s.parent_email,
            parentName: s.parent_name,
            parentPhone: s.parent_phone,
            beltId: getBeltIdFromName(s.belt),
            birthday: s.birthdate,
            totalXP: s.total_xp || 0,
            totalPoints: s.total_points || 0,
            lifetimeXp: s.total_xp || 0,
            currentStreak: 0,
            stripeCount: s.stripes || 0,
            performanceHistory: [],
            homeDojo: { character: [], chores: [], school: [], health: [] }
          }));
          
          // Also fetch coaches with proper UUIDs
          const coachesResult = await db.execute(sql`
            SELECT id, name, email
            FROM coaches WHERE club_id = ${user.club_id}::uuid AND is_active = true
          `);
          wizardData.coaches = (coachesResult as any[]).map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            location: '',
            assignedClasses: []
          }));
          
          console.log('[Login] Replaced wizard students/coaches with database records');
        }
        
        // Also check onboarding_progress table
        const progressResult = await db.execute(
          sql`SELECT wizard_completed FROM onboarding_progress WHERE club_id = ${user.club_id}::uuid LIMIT 1`
        );
        const progress = (progressResult as any[])[0];
        if (progress?.wizard_completed) {
          wizardCompleted = true;
        }
        
        // Auto-recover if wizard_data exists but onboarding_progress doesn't
        if (wizardData && !progress?.wizard_completed) {
          await db.execute(sql`
            INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
            VALUES (${user.club_id}::uuid, true, NOW())
            ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true
          `);
          console.log('[Login] Auto-recovered wizard_completed for club:', user.club_id);
        }
      }

      // For parents, look up their linked student(s) to get the database UUID
      let studentId: string | null = null;
      if (user.role === 'parent' && user.club_id) {
        // Try exact email match first
        let studentResult = await db.execute(sql`
          SELECT id FROM students 
          WHERE club_id = ${user.club_id}::uuid 
          AND LOWER(parent_email) = ${normalizedEmail}
          ORDER BY created_at ASC
          LIMIT 1
        `);
        let linkedStudent = (studentResult as any[])[0];
        if (linkedStudent) {
          studentId = linkedStudent.id;
          console.log('[Login] Parent linked to student:', studentId);
        } else {
          // Fallback: Get any student from this club (for legacy parents without linked students)
          studentResult = await db.execute(sql`
            SELECT id FROM students 
            WHERE club_id = ${user.club_id}::uuid 
            ORDER BY created_at DESC
            LIMIT 1
          `);
          linkedStudent = (studentResult as any[])[0];
          if (linkedStudent) {
            studentId = linkedStudent.id;
            console.log('[Login] Fallback: Using first club student for parent:', studentId);
          }
        }
        
        // XP is now managed by unified awardXP service - no sync needed
        // students.total_xp is the single source of truth
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('user_login', 'User Login', ${'User logged in: ' + user.email}, ${user.club_id}::uuid, ${JSON.stringify({ email: user.email, role: user.role })}::jsonb, NOW())
      `);

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.club_name,
          role: user.role,
          clubId: user.club_id,
          clubName: user.club_name,
          clubStatus: user.club_status,
          trialStatus: user.trial_status,
          trialEnd: user.trial_end,
          wizardCompleted,
          studentId
        },
        wizardData
      });

    } catch (error: any) {
      console.error('[Login] Error:', error.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  app.post('/api/ai/taekbot', async (req: Request, res: Response) => {
    try {
      const { message, clubName, artType, language } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }
      
      const response = await generateTaekBotResponse(message, {
        name: clubName || 'your dojo',
        artType: artType || 'martial arts',
        language: language || 'English'
      });
      
      res.json({ response });
    } catch (error: any) {
      console.error('TaekBot error:', error.message);
      res.status(500).json({ error: 'Failed to generate response' });
    }
  });

  app.post('/api/ai/class-plan', async (req: Request, res: Response) => {
    try {
      const { beltLevel, focusArea, classDuration, studentCount, language } = req.body;
      
      const plan = await generateClassPlan({
        beltLevel: beltLevel || 'All Levels',
        focusArea: focusArea || 'General Training',
        classDuration: classDuration || 60,
        studentCount: studentCount || 10,
        language: language || 'English'
      });
      
      res.json({ plan });
    } catch (error: any) {
      console.error('Class plan error:', error.message);
      res.status(500).json({ error: 'Failed to generate class plan' });
    }
  });

  app.post('/api/ai/welcome-email', async (req: Request, res: Response) => {
    try {
      const { clubName, studentName, parentName, artType, language } = req.body;
      
      const email = await generateWelcomeEmail({
        clubName: clubName || 'Your Dojo',
        studentName: studentName || 'Student',
        parentName: parentName || 'Parent',
        artType: artType || 'martial arts',
        language: language || 'English'
      });
      
      res.json({ email });
    } catch (error: any) {
      console.error('Welcome email error:', error.message);
      res.status(500).json({ error: 'Failed to generate welcome email' });
    }
  });

  app.post('/api/ai/video-feedback', async (req: Request, res: Response) => {
    try {
      const { studentName, challengeName, challengeCategory, score, beltLevel, coachNotes } = req.body;
      
      console.log('[AI Video Feedback] Request:', { studentName, challengeName, challengeCategory, score, beltLevel, coachNotes });
      
      if (!studentName || !challengeName) {
        return res.status(400).json({ error: 'Student name and challenge name are required' });
      }
      
      const feedback = await generateVideoFeedback({
        studentName,
        challengeName,
        challengeCategory,
        score,
        beltLevel,
        coachNotes
      });
      
      res.json({ feedback });
    } catch (error: any) {
      console.error('[AI Video Feedback] Error:', error.message);
      res.status(500).json({ error: 'Failed to generate feedback' });
    }
  });

  app.get('/api/stripe/publishable-key', async (req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error('Error getting publishable key:', error);
      res.status(500).json({ error: 'Failed to get Stripe key' });
    }
  });

  app.post('/api/stripe-connect/onboard', async (req: Request, res: Response) => {
    try {
      const { clubId, email, clubName } = req.body;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }

      const stripe = await getUncachableStripeClient();
      const appUrl = process.env.APP_URL || 'https://mytaek.com';

      const clubResult = await db.execute(sql`
        SELECT stripe_connect_account_id, owner_email, name FROM clubs WHERE id = ${clubId}
      `);
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const ownerEmail = email || club.owner_email;
      const ownerClubName = clubName || club.name;
      
      if (!ownerEmail) {
        return res.status(400).json({ error: 'Email is required for bank connection' });
      }
      
      let accountId = club?.stripe_connect_account_id;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: ownerEmail,
          business_profile: {
            name: ownerClubName || 'Martial Arts Club',
            product_description: 'Martial arts training and curriculum videos'
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        await db.execute(sql`
          UPDATE clubs SET stripe_connect_account_id = ${accountId} WHERE id = ${clubId}
        `);
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${appUrl}/app/admin?tab=creator&connect=refresh`,
        return_url: `${appUrl}/app/admin?tab=creator&connect=success`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error('Stripe Connect onboarding error:', error);
      res.status(500).json({ error: 'Failed to create bank connection link' });
    }
  });

  app.get('/api/stripe-connect/status/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      const clubResult = await db.execute(sql`
        SELECT stripe_connect_account_id FROM clubs WHERE id = ${clubId}
      `);
      const club = (clubResult as any[])[0];
      
      if (!club?.stripe_connect_account_id) {
        return res.json({ connected: false, chargesEnabled: false, payoutsEnabled: false });
      }

      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(club.stripe_connect_account_id);
      
      res.json({
        connected: true,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ error: 'Failed to get connect status' });
    }
  });

  app.get('/api/products', async (req: Request, res: Response) => {
    try {
      const products = await storage.listProducts();
      res.json({ data: products });
    } catch (error: any) {
      console.error('Error listing products:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.get('/api/products-with-prices', async (req: Request, res: Response) => {
    try {
      const rows = await storage.listProductsWithPrices();

      if (rows && (rows as any[]).length > 0) {
        const productsMap = new Map();
        for (const row of rows as any[]) {
          if (!productsMap.has(row.product_id)) {
            productsMap.set(row.product_id, {
              id: row.product_id,
              name: row.product_name,
              description: row.product_description,
              active: row.product_active,
              metadata: row.product_metadata,
              prices: []
            });
          }
          if (row.price_id) {
            productsMap.get(row.product_id).prices.push({
              id: row.price_id,
              unit_amount: row.unit_amount,
              currency: row.currency,
              recurring: row.recurring,
              active: row.price_active,
              metadata: row.price_metadata,
            });
          }
        }
        res.json({ data: Array.from(productsMap.values()) });
      } else {
        const now = Date.now();
        if (cachedProducts && (now - cacheTimestamp) < CACHE_TTL_MS) {
          res.json({ data: cachedProducts });
          return;
        }
        
        const stripe = await getUncachableStripeClient();
        const products = await stripe.products.list({ active: true, limit: 20 });
        const prices = await stripe.prices.list({ active: true, limit: 100 });
        
        const pricesByProduct = new Map<string, any[]>();
        for (const price of prices.data) {
          const productId = typeof price.product === 'string' ? price.product : price.product.id;
          if (!pricesByProduct.has(productId)) {
            pricesByProduct.set(productId, []);
          }
          pricesByProduct.get(productId)!.push({
            id: price.id,
            unit_amount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring,
            active: price.active,
            metadata: price.metadata,
          });
        }
        
        const result = products.data.map(product => ({
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active,
          metadata: product.metadata,
          prices: pricesByProduct.get(product.id) || [],
        }));
        
        cachedProducts = result;
        cacheTimestamp = now;
        
        res.json({ data: result });
      }
    } catch (error: any) {
      console.error('Error listing products with prices:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.get('/api/prices', async (req: Request, res: Response) => {
    try {
      const prices = await storage.listPrices();
      res.json({ data: prices });
    } catch (error: any) {
      console.error('Error listing prices:', error);
      res.status(500).json({ error: 'Failed to list prices' });
    }
  });

  app.post('/api/checkout', async (req: Request, res: Response) => {
    try {
      const { priceId, clubId, email } = req.body;

      console.log(`[/api/checkout] Received request:`, { priceId, clubId, email });

      if (!priceId) {
        console.error('[/api/checkout] Missing priceId');
        return res.status(400).json({ error: 'priceId is required' });
      }

      // Use APP_URL for production, fallback to Replit domain or request host
      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

      console.log(`[/api/checkout] Creating session with:`, { priceId, baseUrl });

      const session = await stripeService.createCheckoutSession(
        priceId,
        `${baseUrl}/wizard?subscription=success`,
        `${baseUrl}/pricing?subscription=cancelled`,
        undefined,
        { clubId: clubId || '', email: email || '' }
      );

      console.log(`[/api/checkout] Session created:`, { sessionId: session.id, url: session.url });
      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[/api/checkout] Error creating checkout session:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });

  app.get('/api/verify-checkout-session', async (req: Request, res: Response) => {
    try {
      const { session_id } = req.query;
      
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: 'session_id is required' });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      res.json({
        success: session.payment_status === 'paid',
        email: session.customer_email || session.customer_details?.email,
        planName: session.metadata?.planName || 'Premium Plan',
        customerId: session.customer,
        subscriptionId: session.subscription,
      });
    } catch (error: any) {
      console.error('Error verifying checkout session:', error);
      res.status(500).json({ error: 'Failed to verify session' });
    }
  });

  app.post('/api/customer-portal', async (req: Request, res: Response) => {
    try {
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      // Use APP_URL for production, fallback to Replit domain or request host
      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

      const session = await stripeService.createCustomerPortalSession(
        customerId,
        `${baseUrl}/app/admin`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  app.post('/api/test-email', async (req: Request, res: Response) => {
    try {
      const { emailType, to } = req.body;

      if (!to) {
        return res.status(400).json({ error: 'Email address (to) is required' });
      }

      if (!emailType) {
        return res.status(400).json({ error: 'Email type is required' });
      }

      const testData = {
        ownerName: 'Master Hamed',
        clubName: 'Elite Taekwondo Academy',
        coachName: 'Coach Kim',
        coachEmail: to,
        tempPassword: 'TempPass123!',
        userName: 'Test User',
        resetToken: 'test-token-12345',
        studentName: 'Sarah Johnson',
        beltLevel: 'Yellow Belt',
        studentAge: '10',
        parentName: 'John Johnson',
        studentId: 'stu_test123',
        daysLeft: 3,
        monthName: 'December',
        totalEarnings: '350',
        premiumParents: 25,
        newThisMonth: 5,
        className: 'Little Tigers',
        classDate: 'Dec 4, 2025',
        feedbackText: 'Sarah showed excellent focus today and nailed her turning kick! Her dedication is really paying off.',
        highlights: '✨ Perfect form on front kicks<br>✨ Helped younger students<br>✨ Earned 50 XP',
        feedbackId: 'fb_test456',
        beltColor: 'YELLOW',
        promotionDate: 'December 4, 2025',
        totalXp: '2,500',
        classesAttended: 48,
        monthsTrained: 6,
        promotionId: 'promo_test789',
        daysSinceLastClass: 14,
      };

      let result;
      
      switch (emailType) {
        case 'welcome':
          result = await emailService.sendWelcomeEmail(to, testData);
          break;
        case 'day3':
          result = await emailService.sendDay3CheckinEmail(to, testData);
          break;
        case 'day7':
          result = await emailService.sendDay7MidTrialEmail(to, testData);
          break;
        case 'trial-ending':
          result = await emailService.sendTrialEndingSoonEmail(to, testData);
          break;
        case 'trial-expired':
          result = await emailService.sendTrialExpiredEmail(to, testData);
          break;
        case 'coach-invite':
          result = await emailService.sendCoachInviteEmail(to, testData);
          break;
        case 'reset-password':
          result = await emailService.sendResetPasswordEmail(to, testData);
          break;
        case 'new-student':
          result = await emailService.sendNewStudentAddedEmail(to, testData);
          break;
        case 'revenue-report':
          result = await emailService.sendMonthlyRevenueReportEmail(to, testData);
          break;
        case 'parent-welcome':
          result = await emailService.sendParentWelcomeEmail(to, testData);
          break;
        case 'class-feedback':
          result = await emailService.sendClassFeedbackEmail(to, testData);
          break;
        case 'belt-promotion':
          result = await emailService.sendBeltPromotionEmail(to, testData);
          break;
        case 'attendance-alert':
          result = await emailService.sendAttendanceAlertEmail(to, testData);
          break;
        case 'birthday':
          result = await emailService.sendBirthdayWishEmail(to, testData);
          break;
        default:
          return res.status(400).json({ 
            error: 'Invalid email type',
            validTypes: [
              'welcome', 'day3', 'day7', 'trial-ending', 'trial-expired',
              'coach-invite', 'reset-password', 'new-student', 'revenue-report',
              'parent-welcome', 'class-feedback', 'belt-promotion', 
              'attendance-alert', 'birthday'
            ]
          });
      }

      if (result.success) {
        res.json({ 
          success: true, 
          message: `Test email "${emailType}" sent to ${to}`,
          messageId: result.messageId 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error: any) {
      console.error('Test email error:', error);
      res.status(500).json({ error: error.message || 'Failed to send test email' });
    }
  });

  app.get('/api/test-email/types', (req: Request, res: Response) => {
    res.json({
      types: [
        { id: 'welcome', name: 'Welcome Email', from: 'hello@mytaek.com' },
        { id: 'day3', name: 'Day 3 Check-in', from: 'hello@mytaek.com' },
        { id: 'day7', name: 'Day 7 Mid-Trial', from: 'hello@mytaek.com' },
        { id: 'trial-ending', name: 'Trial Ending Soon', from: 'hello@mytaek.com' },
        { id: 'trial-expired', name: 'Trial Expired', from: 'hello@mytaek.com' },
        { id: 'coach-invite', name: 'Coach Invite', from: 'noreply@mytaek.com' },
        { id: 'reset-password', name: 'Reset Password', from: 'noreply@mytaek.com' },
        { id: 'new-student', name: 'New Student Added', from: 'noreply@mytaek.com' },
        { id: 'revenue-report', name: 'Monthly Revenue Report', from: 'hello@mytaek.com' },
        { id: 'parent-welcome', name: 'Parent Welcome', from: 'hello@mytaek.com' },
        { id: 'class-feedback', name: 'Class Feedback', from: 'hello@mytaek.com' },
        { id: 'belt-promotion', name: 'Belt Promotion', from: 'hello@mytaek.com' },
        { id: 'attendance-alert', name: 'Attendance Alert', from: 'hello@mytaek.com' },
        { id: 'birthday', name: 'Birthday Wish', from: 'hello@mytaek.com' },
      ]
    });
  });

  app.post('/api/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const userResult = await db.execute(
        sql`SELECT id, email, name FROM users WHERE email = ${email} AND is_active = true LIMIT 1`
      );
      
      const user = (userResult as any[])[0];
      
      if (!user) {
        return res.json({ 
          success: true, 
          message: 'If an account exists with this email, a password reset link has been sent.' 
        });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.execute(sql`
        UPDATE users 
        SET reset_token = ${resetToken}, reset_token_expires_at = ${expiresAt.toISOString()}::timestamptz
        WHERE id = ${user.id}
      `);

      const emailResult = await emailService.sendResetPasswordEmail(user.email, {
        userName: user.name || 'User',
        resetToken: resetToken
      });

      if (emailResult.success) {
        console.log('[Password Reset] Email sent to:', email);
        
        await db.execute(sql`
          INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
          VALUES ('password_reset_requested', 'Password Reset Requested', ${'Password reset requested for ' + email}, ${JSON.stringify({ email })}::jsonb, NOW())
        `);
      } else {
        console.error('[Password Reset] Failed to send email:', emailResult.error);
      }

      res.json({ 
        success: true, 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      });
    } catch (error: any) {
      console.error('[Forgot Password] Error:', error.message);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  });

  app.post('/api/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      const updateResult = await db.execute(sql`
        UPDATE users 
        SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
        WHERE reset_token = ${token} 
        AND reset_token_expires_at > NOW()
        AND is_active = true
        RETURNING id, email, name
      `);
      
      const user = (updateResult as any[])[0];
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
        VALUES ('password_reset_completed', 'Password Reset Completed', ${'Password reset completed for ' + user.email}, ${JSON.stringify({ email: user.email })}::jsonb, NOW())
      `);

      console.log('[Password Reset] Password updated for:', user.email);

      res.json({ success: true, message: 'Password has been reset successfully' });
    } catch (error: any) {
      console.error('[Reset Password] Error:', error.message);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Update student grading data (total_points and total_xp)
  app.patch('/api/students/:id/grading', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { totalPoints, lifetimeXp, attendanceCount } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      await db.execute(sql`
        UPDATE students SET 
          total_points = COALESCE(${totalPoints}, total_points),
          total_xp = COALESCE(${lifetimeXp}, total_xp),
          last_class_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `);

      console.log('[Grading] Updated student:', id, 'totalPoints:', totalPoints, 'total_xp:', lifetimeXp);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Grading] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update student grading data' });
    }
  });

  app.post('/api/students', async (req: Request, res: Response) => {
    try {
      const { clubId, name, parentEmail, parentName, parentPhone, belt, birthdate } = req.body;
      
      if (!clubId || !name) {
        return res.status(400).json({ error: 'Club ID and student name are required' });
      }

      const clubResult = await db.execute(
        sql`SELECT id, name, owner_email, owner_name FROM clubs WHERE id = ${clubId}::uuid`
      );
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const studentResult = await db.execute(sql`
        INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, created_at)
        VALUES (${clubId}::uuid, ${name}, ${parentEmail || null}, ${parentName || null}, ${parentPhone || null}, ${belt || 'White'}, ${birthdate ? birthdate + 'T00:00:00Z' : null}::timestamptz, NOW())
        RETURNING id, name, parent_email, parent_name, belt
      `);
      
      const student = (studentResult as any[])[0];

      const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

      const notifyEmailResult = await emailService.sendNewStudentAddedEmail(club.owner_email, {
        studentName: name,
        clubName: club.name,
        beltLevel: belt || 'White',
        studentAge: age ? `${age} years old` : 'Not specified',
        parentName: parentName || 'Not specified',
        studentId: student.id
      });

      if (notifyEmailResult.success) {
        console.log('[New Student] Notification email sent to club owner:', club.owner_email);
      }

      if (parentEmail) {
        await emailAutomation.sendParentWelcomeEmailAuto(
          clubId,
          student.id,
          parentEmail,
          parentName || 'Parent',
          name,
          club.name
        );
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('student_added', 'New Student Added', ${'New student added: ' + name}, ${clubId}::uuid, ${JSON.stringify({ studentId: student.id, studentName: name, parentEmail })}::jsonb, NOW())
      `);

      res.status(201).json({
        success: true,
        student: {
          id: student.id,
          name: student.name,
          parentEmail: student.parent_email,
          parentName: student.parent_name,
          belt: student.belt
        }
      });
    } catch (error: any) {
      console.error('[Add Student] Error:', error.message);
      res.status(500).json({ error: 'Failed to add student' });
    }
  });

  // Get student by parent email - resolves wizard IDs to database UUIDs
  app.get('/api/students/by-email', async (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      const clubId = req.query.clubId as string;

      if (!email || !clubId) {
        return res.status(400).json({ error: 'Email and clubId are required' });
      }

      const result = await db.execute(sql`
        SELECT id FROM students WHERE LOWER(parent_email) = ${email.toLowerCase().trim()} AND club_id = ${clubId}::uuid LIMIT 1
      `);

      if ((result as any[]).length > 0) {
        return res.json({ studentId: (result as any[])[0].id });
      }

      // Fallback: get first student from club
      const fallbackResult = await db.execute(sql`
        SELECT id FROM students WHERE club_id = ${clubId}::uuid ORDER BY created_at DESC LIMIT 1
      `);

      if ((fallbackResult as any[]).length > 0) {
        return res.json({ studentId: (fallbackResult as any[])[0].id });
      }

      res.json({ studentId: null });
    } catch (error: any) {
      console.error('[GetStudentByEmail] Error:', error.message);
      res.json({ studentId: null });
    }
  });

  // Get student by name
  app.get('/api/students/by-name', async (req: Request, res: Response) => {
    try {
      const name = req.query.name as string;
      const clubId = req.query.clubId as string;

      if (!name || !clubId) {
        return res.status(400).json({ error: 'Name and clubId are required' });
      }

      const result = await db.execute(sql`
        SELECT id FROM students WHERE LOWER(name) = ${name.toLowerCase().trim()} AND club_id = ${clubId}::uuid LIMIT 1
      `);

      if ((result as any[]).length > 0) {
        return res.json({ studentId: (result as any[])[0].id });
      }

      res.json({ studentId: null });
    } catch (error: any) {
      console.error('[GetStudentByName] Error:', error.message);
      res.json({ studentId: null });
    }
  });

  // Get first student from club
  app.get('/api/students/first', async (req: Request, res: Response) => {
    try {
      const clubId = req.query.clubId as string;

      if (!clubId) {
        return res.status(400).json({ error: 'clubId is required' });
      }

      const result = await db.execute(sql`
        SELECT id FROM students WHERE club_id = ${clubId}::uuid ORDER BY created_at ASC LIMIT 1
      `);

      if ((result as any[]).length > 0) {
        return res.json({ studentId: (result as any[])[0].id });
      }

      res.json({ studentId: null });
    } catch (error: any) {
      console.error('[GetFirstStudent] Error:', error.message);
      res.json({ studentId: null });
    }
  });

  app.post('/api/invite-coach', async (req: Request, res: Response) => {
    try {
      const { clubId, name, email, location, assignedClasses } = req.body;
      
      if (!clubId || !name || !email) {
        return res.status(400).json({ error: 'Club ID, coach name, and email are required' });
      }

      const clubResult = await db.execute(sql`
        SELECT id, name, owner_email FROM clubs WHERE id = ${clubId}::uuid
      `);
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const tempPassword = crypto.randomBytes(8).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Insert into users table for authentication
      const userResult = await db.execute(sql`
        INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
        VALUES (${email}, ${passwordHash}, ${name}, 'coach', ${clubId}::uuid, true, NOW())
        ON CONFLICT (email) DO UPDATE SET name = ${name}, club_id = ${clubId}::uuid, role = 'coach', is_active = true
        RETURNING id
      `);
      const userId = (userResult as any[])[0]?.id;

      // Also insert into coaches table for data fetching
      // First check if coach already exists
      const existingCoach = await db.execute(sql`
        SELECT id FROM coaches WHERE email = ${email} LIMIT 1
      `);
      
      if ((existingCoach as any[]).length > 0) {
        await db.execute(sql`
          UPDATE coaches SET name = ${name}, club_id = ${clubId}::uuid, is_active = true, invite_sent_at = NOW()
          WHERE email = ${email}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO coaches (id, club_id, user_id, name, email, is_active, invite_sent_at, created_at)
          VALUES (gen_random_uuid(), ${clubId}::uuid, ${userId}::uuid, ${name}, ${email}, true, NOW(), NOW())
        `);
      }

      await emailService.sendCoachInviteEmail(email, {
        coachName: name,
        clubName: club.name,
        coachEmail: email,
        tempPassword: tempPassword,
        ownerName: club.name
      });

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('coach_invited', 'Coach Invited', ${'Coach invited: ' + name}, ${clubId}::uuid, ${JSON.stringify({ coachEmail: email, coachName: name })}::jsonb, NOW())
      `);

      console.log('[Invite Coach] Coach invited:', email, 'to club:', club.name);

      res.status(201).json({
        success: true,
        coach: {
          email: email,
          name: name,
          location: location,
          assignedClasses: assignedClasses
        }
      });
    } catch (error: any) {
      console.error('[Invite Coach] Error:', error.message);
      res.status(500).json({ error: 'Failed to invite coach' });
    }
  });

  app.put('/api/students/:id/link-parent', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { parentEmail, parentName, parentPhone } = req.body;
      
      if (!parentEmail) {
        return res.status(400).json({ error: 'Parent email is required' });
      }

      const studentResult = await db.execute(sql`
        SELECT s.id, s.name, s.parent_email, c.id as club_id, c.name as club_name 
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE s.id = ${id}::uuid
        LIMIT 1
      `);
      
      const student = (studentResult as any[])[0];
      
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const hadParentBefore = !!student.parent_email;

      await db.execute(sql`
        UPDATE students 
        SET parent_email = ${parentEmail}, parent_name = ${parentName || null}, parent_phone = ${parentPhone || null}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);

      if (!hadParentBefore) {
        await emailAutomation.sendParentWelcomeEmailAuto(
          student.club_id,
          student.id,
          parentEmail,
          parentName || 'Parent',
          student.name,
          student.club_name
        );
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('parent_linked', 'Parent Linked', ${'Parent linked to student: ' + student.name}, ${student.club_id}::uuid, ${JSON.stringify({ studentId: id, parentEmail })}::jsonb, NOW())
      `);

      res.json({ 
        success: true, 
        message: hadParentBefore ? 'Parent information updated' : 'Parent linked and welcome email sent'
      });
    } catch (error: any) {
      console.error('[Link Parent] Error:', error.message);
      res.status(500).json({ error: 'Failed to link parent to student' });
    }
  });

  // Content Analytics - Record content view/completion
  app.post('/api/content/view', async (req: Request, res: Response) => {
    try {
      const { contentId, studentId, completed, xpAwarded } = req.body;
      
      if (!contentId) {
        return res.status(400).json({ error: 'Content ID is required' });
      }

      // Check if view already exists for this content/student
      const existingView = await db.execute(sql`
        SELECT id, completed FROM content_views 
        WHERE content_id = ${contentId}::uuid 
        ${studentId ? sql`AND student_id = ${studentId}::uuid` : sql`AND student_id IS NULL`}
        LIMIT 1
      `);

      if ((existingView as any[]).length > 0) {
        // Update existing view if completing
        if (completed && !(existingView as any[])[0].completed) {
          await db.execute(sql`
            UPDATE content_views 
            SET completed = true, completed_at = NOW(), xp_awarded = ${xpAwarded || 0}
            WHERE id = ${(existingView as any[])[0].id}::uuid
          `);
          
          // Increment completion count on content
          await db.execute(sql`
            UPDATE curriculum_content 
            SET completion_count = COALESCE(completion_count, 0) + 1
            WHERE id = ${contentId}::uuid
          `);
        }
        return res.json({ success: true, action: 'updated' });
      }

      // Create new view record
      await db.execute(sql`
        INSERT INTO content_views (content_id, student_id, completed, completed_at, xp_awarded, viewed_at)
        VALUES (
          ${contentId}::uuid, 
          ${studentId ? sql`${studentId}::uuid` : sql`NULL`}, 
          ${completed || false}, 
          ${completed ? sql`NOW()` : sql`NULL`}, 
          ${xpAwarded || 0}, 
          NOW()
        )
      `);

      // Increment view count on content
      await db.execute(sql`
        UPDATE curriculum_content 
        SET view_count = COALESCE(view_count, 0) + 1
        ${completed ? sql`, completion_count = COALESCE(completion_count, 0) + 1` : sql``}
        WHERE id = ${contentId}::uuid
      `);

      res.json({ success: true, action: 'created' });
    } catch (error: any) {
      console.error('[Content View] Error:', error.message);
      res.status(500).json({ error: 'Failed to record content view' });
    }
  });

  // Content Analytics - Get analytics for a club's content
  app.get('/api/content/analytics/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;

      // Get total views and completions per content
      const contentStats = await db.execute(sql`
        SELECT 
          cc.id,
          cc.title,
          cc.content_type,
          cc.belt_id,
          cc.pricing_type,
          cc.xp_reward,
          COALESCE(cc.view_count, 0) as view_count,
          COALESCE(cc.completion_count, 0) as completion_count,
          COUNT(cv.id) as tracked_views,
          COUNT(CASE WHEN cv.completed = true THEN 1 END) as tracked_completions
        FROM curriculum_content cc
        LEFT JOIN content_views cv ON cc.id = cv.content_id
        WHERE cc.club_id = ${clubId}::uuid
        GROUP BY cc.id, cc.title, cc.content_type, cc.belt_id, cc.pricing_type, cc.xp_reward
        ORDER BY cc.created_at DESC
      `);

      // Get total XP awarded
      const xpStats = await db.execute(sql`
        SELECT COALESCE(SUM(cv.xp_awarded), 0) as total_xp_awarded
        FROM content_views cv
        JOIN curriculum_content cc ON cv.content_id = cc.id
        WHERE cc.club_id = ${clubId}::uuid
      `);

      res.json({
        success: true,
        content: contentStats,
        totalXpAwarded: (xpStats as any[])[0]?.total_xp_awarded || 0
      });
    } catch (error: any) {
      console.error('[Content Analytics] Error:', error.message);
      res.status(500).json({ error: 'Failed to get content analytics' });
    }
  });

  // =====================================================
  // RIVALS CHALLENGES API - Real-time student challenges
  // =====================================================

  app.post('/api/challenges', async (req: Request, res: Response) => {
    try {
      const challenge = req.body;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Use database-generated UUID for stable ID
      const result = await db.execute(sql`
        INSERT INTO challenges (id, from_student_id, from_student_name, to_student_id, to_student_name, challenge_id, challenge_name, challenge_xp, status, created_at, expires_at)
        VALUES (gen_random_uuid()::text, ${challenge.from_student_id}, ${challenge.from_student_name}, ${challenge.to_student_id}, ${challenge.to_student_name}, ${challenge.challenge_id}, ${challenge.challenge_name}, ${challenge.challenge_xp}, 'pending', NOW(), ${expiresAt}::timestamptz)
        RETURNING id
      `);
      
      const newId = (result as any[])[0]?.id;

      res.json({ success: true, id: newId, expires_at: expiresAt });
    } catch (error: any) {
      console.error('[Challenges] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create challenge' });
    }
  });

  app.get('/api/challenges/received/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const challenges = await db.execute(sql`
        SELECT * FROM challenges WHERE to_student_id = ${studentId} ORDER BY created_at DESC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[Challenges] Fetch received error:', error.message);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  app.get('/api/challenges/sent/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const challenges = await db.execute(sql`
        SELECT * FROM challenges WHERE from_student_id = ${studentId} ORDER BY created_at DESC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[Challenges] Fetch sent error:', error.message);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  app.put('/api/challenges/:challengeId/accept', async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;
      const { score } = req.body;

      const existing = await db.execute(sql`SELECT * FROM challenges WHERE id = ${challengeId}`);
      if (!(existing as any[])[0]) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = (existing as any[])[0];
      // Note: fromScore is simulated for the challenger (PvP async) since they don't submit real-time
      // This is by design for async PvP challenges where only one player submits a score
      const fromScore = challenge.from_score || 0;
      const winnerId = score > fromScore ? challenge.to_student_id : challenge.from_student_id;

      await db.execute(sql`
        UPDATE challenges 
        SET status = 'completed', to_score = ${score}, from_score = ${fromScore}, winner_id = ${winnerId}, completed_at = NOW()
        WHERE id = ${challengeId}
      `);

      res.json({ success: true, winner_id: winnerId, from_score: fromScore, to_score: score });
    } catch (error: any) {
      console.error('[Challenges] Accept error:', error.message);
      res.status(500).json({ error: 'Failed to accept challenge' });
    }
  });

  app.put('/api/challenges/:challengeId/decline', async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;
      await db.execute(sql`UPDATE challenges SET status = 'declined' WHERE id = ${challengeId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Challenges] Decline error:', error.message);
      res.status(500).json({ error: 'Failed to decline challenge' });
    }
  });

  // =====================================================
  // VIDEO VERIFICATION ENDPOINTS
  // =====================================================

  app.post('/api/videos/presigned-upload', async (req: Request, res: Response) => {
    try {
      const { studentId, challengeId, filename, contentType } = req.body;
      
      console.log('[Videos] Presigned upload request:', { studentId, challengeId, filename, contentType });
      
      if (!studentId || !challengeId || !filename) {
        return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
      }

      // Check if S3 credentials are configured
      if (!process.env.IDRIVE_E2_ACCESS_KEY || !process.env.IDRIVE_E2_SECRET_KEY || !process.env.IDRIVE_E2_BUCKET_NAME || !process.env.IDRIVE_E2_ENDPOINT) {
        console.error('[Videos] Missing S3 configuration:', {
          hasAccessKey: !!process.env.IDRIVE_E2_ACCESS_KEY,
          hasSecretKey: !!process.env.IDRIVE_E2_SECRET_KEY,
          hasBucket: !!process.env.IDRIVE_E2_BUCKET_NAME,
          hasEndpoint: !!process.env.IDRIVE_E2_ENDPOINT
        });
        return res.status(500).json({ error: 'Video storage not configured. Please contact support.' });
      }

      const result = await s3Storage.getPresignedUploadUrl(
        studentId,
        challengeId,
        filename,
        contentType || 'video/mp4'
      );

      console.log('[Videos] Presigned URL generated successfully');
      res.json(result);
    } catch (error: any) {
      console.error('[Videos] Presigned upload error:', error.message);
      console.error('[Videos] Full error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  app.post('/api/videos', async (req: Request, res: Response) => {
    try {
      const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, score } = req.body;
      
      console.log('[Videos] Save request:', { studentId, clubId, challengeId, challengeName });
      
      if (!studentId || !clubId || !challengeId || !videoUrl) {
        console.log('[Videos] Missing fields:', { studentId: !!studentId, clubId: !!clubId, challengeId: !!challengeId, videoUrl: !!videoUrl });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        console.log('[Videos] Invalid student ID format:', studentId);
        return res.status(400).json({ error: 'Invalid student ID format. Please log out and log back in.' });
      }
      if (!uuidRegex.test(clubId)) {
        console.log('[Videos] Invalid club ID format:', clubId);
        return res.status(400).json({ error: 'Invalid club ID format. Please log out and log back in.' });
      }

      const result = await db.execute(sql`
        INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, score, status, created_at, updated_at)
        VALUES (${studentId}::uuid, ${clubId}::uuid, ${challengeId}, ${challengeName || ''}, ${challengeCategory || ''}, ${videoUrl}, ${videoKey || ''}, ${score || 0}, 'pending', NOW(), NOW())
        RETURNING id
      `);

      const video = (result as any[])[0];
      
      // Send email notification to coaches
      try {
        const studentResult = await db.execute(sql`SELECT name FROM students WHERE id = ${studentId}::uuid`);
        const clubResult = await db.execute(sql`
          SELECT c.name as club_name, co.email as coach_email, co.name as coach_name
          FROM clubs c
          LEFT JOIN coaches co ON co.club_id = c.id AND co.is_active = true
          WHERE c.id = ${clubId}::uuid
        `);
        
        const studentName = (studentResult as any[])[0]?.name || 'Student';
        const clubData = clubResult as any[];
        
        for (const coach of clubData.filter(c => c.coach_email)) {
          emailService.sendVideoSubmittedNotification(coach.coach_email, {
            coachName: coach.coach_name || 'Coach',
            studentName,
            challengeName: challengeName || challengeId,
            clubName: coach.club_name || 'Your Club'
          }).catch(err => console.error('[Videos] Email notification error:', err));
        }
      } catch (emailErr) {
        console.error('[Videos] Email notification setup error:', emailErr);
      }
      
      res.json({ success: true, videoId: video?.id });
    } catch (error: any) {
      console.error('[Videos] Create error:', error.message);
      console.error('[Videos] Full error:', error);
      res.status(500).json({ error: `Failed to save video record: ${error.message}` });
    }
  });

  app.get('/api/videos/pending/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      const videos = await db.execute(sql`
        SELECT cv.*, s.name as student_name, s.belt as student_belt
        FROM challenge_videos cv
        JOIN students s ON cv.student_id = s.id
        WHERE cv.club_id = ${clubId}::uuid AND cv.status = 'pending'
        ORDER BY cv.created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch pending error:', error.message);
      res.status(500).json({ error: 'Failed to get pending videos' });
    }
  });

  app.get('/api/videos/approved/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { studentId } = req.query;
      
      const videos = await db.execute(sql`
        SELECT cv.*, s.name as student_name, s.belt as student_belt,
               CASE WHEN cvv.id IS NOT NULL THEN true ELSE false END as has_voted
        FROM challenge_videos cv
        JOIN students s ON cv.student_id = s.id
        LEFT JOIN challenge_video_votes cvv ON cv.id = cvv.video_id 
          AND cvv.voter_student_id = ${studentId ? studentId : null}::uuid
        WHERE cv.club_id = ${clubId}::uuid AND cv.status = 'approved'
        ORDER BY cv.vote_count DESC, cv.created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch approved error:', error.message);
      res.status(500).json({ error: 'Failed to get approved videos' });
    }
  });

  app.put('/api/videos/:videoId/verify', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const { status, coachNotes, coachId, xpAwarded } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be approved or rejected' });
      }

      // Get video info first to get student_id
      const videoInfo = await db.execute(sql`
        SELECT student_id FROM challenge_videos WHERE id = ${videoId}::uuid
      `);
      const studentId = (videoInfo as any[])[0]?.student_id;

      await db.execute(sql`
        UPDATE challenge_videos 
        SET status = ${status}::video_status, 
            coach_notes = ${coachNotes || null}, 
            verified_by = ${coachId ? coachId : null}::uuid, 
            verified_at = NOW(),
            xp_awarded = ${xpAwarded || 0},
            updated_at = NOW()
        WHERE id = ${videoId}::uuid
      `);

      // Award XP to student if approved using unified XP service
      if (status === 'approved' && xpAwarded > 0 && studentId) {
        await awardXP(studentId, xpAwarded, 'video', { videoId, type: 'video_verify' });
        console.log('[Videos] Awarded', xpAwarded, 'XP to student', studentId);
      }

      // Send email notification to parent
      try {
        const videoResult = await db.execute(sql`
          SELECT cv.challenge_name, s.name as student_name, s.parent_email, s.parent_name
          FROM challenge_videos cv
          JOIN students s ON cv.student_id = s.id
          WHERE cv.id = ${videoId}::uuid
        `);
        
        const videoData = (videoResult as any[])[0];
        if (videoData?.parent_email) {
          emailService.sendVideoVerifiedNotification(videoData.parent_email, {
            parentName: videoData.parent_name || 'Parent',
            studentName: videoData.student_name,
            challengeName: videoData.challenge_name,
            status: status as 'approved' | 'rejected',
            coachNotes: coachNotes || undefined,
            xpAwarded: status === 'approved' ? (xpAwarded || 0) : undefined
          }).catch(err => console.error('[Videos] Parent notification error:', err));
        }
      } catch (emailErr) {
        console.error('[Videos] Parent notification setup error:', emailErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Videos] Verify error:', error.message);
      res.status(500).json({ error: 'Failed to verify video' });
    }
  });

  app.post('/api/videos/:videoId/vote', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const { voterStudentId } = req.body;
      
      if (!voterStudentId) {
        return res.status(400).json({ error: 'voterStudentId is required' });
      }

      const existing = await db.execute(sql`
        SELECT id FROM challenge_video_votes 
        WHERE video_id = ${videoId}::uuid AND voter_student_id = ${voterStudentId}::uuid
      `);

      if ((existing as any[]).length > 0) {
        return res.status(400).json({ error: 'Already voted on this video' });
      }

      await db.execute(sql`
        INSERT INTO challenge_video_votes (video_id, voter_student_id, vote_value, created_at)
        VALUES (${videoId}::uuid, ${voterStudentId}::uuid, 1, NOW())
      `);

      await db.execute(sql`
        UPDATE challenge_videos 
        SET vote_count = vote_count + 1, updated_at = NOW()
        WHERE id = ${videoId}::uuid
      `);

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Videos] Vote error:', error.message);
      res.status(500).json({ error: 'Failed to vote' });
    }
  });

  app.get('/api/videos/student/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      
      const videos = await db.execute(sql`
        SELECT * FROM challenge_videos 
        WHERE student_id = ${studentId}::uuid
        ORDER BY created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch student videos error:', error.message);
      res.status(500).json({ error: 'Failed to get student videos' });
    }
  });

  // =====================================================
  // AI DAILY MYSTERY CHALLENGE - "Lazy Generator" Pattern
  // =====================================================

  // Hardcoded fallback challenge for when AI generation fails
  const getFallbackChallenge = () => ({
    title: "Master's Wisdom",
    description: "Test your knowledge of martial arts belt symbolism!",
    type: 'quiz' as const,
    xpReward: 50,
    quizData: {
      question: "What does the color of the White Belt represent?",
      options: ["Danger", "Innocence/Beginner", "Mastery", "Fire"],
      correctIndex: 1,
      explanation: "The White Belt represents innocence and a beginner's pure mind - ready to absorb new knowledge like a blank canvas!"
    }
  });

  app.get('/api/daily-challenge', async (req: Request, res: Response) => {
    try {
      const { studentId, clubId, belt } = req.query;
      
      if (!studentId || !belt) {
        return res.status(400).json({ error: 'studentId and belt are required' });
      }

      const today = new Date().toISOString().split('T')[0];
      const targetBelt = (belt as string).toLowerCase();
      
      // STRICT MODE: Validate UUID - NO DEMO MODE
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId as string)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      // Check if student already completed today's challenge
      const existingSubmission = await db.execute(sql`
        SELECT cs.id, cs.is_correct, cs.xp_awarded, dc.title
        FROM challenge_submissions cs
        JOIN daily_challenges dc ON cs.challenge_id = dc.id
        WHERE cs.student_id = ${studentId}::uuid 
        AND dc.date = ${today} 
        AND dc.target_belt = ${targetBelt}
      `);

      if ((existingSubmission as any[]).length > 0) {
        const sub = (existingSubmission as any[])[0];
        return res.json({ 
          completed: true, 
          message: `You already completed today's challenge: "${sub.title}"!`,
          xpAwarded: sub.xp_awarded,
          wasCorrect: sub.is_correct
        });
      }

      // "Lazy Generator" - Check if challenge exists for today + belt
      let existingChallenge = await db.execute(sql`
        SELECT * FROM daily_challenges 
        WHERE date = ${today} AND target_belt = ${targetBelt}
        LIMIT 1
      `);

      let challenge: any;

      if ((existingChallenge as any[]).length > 0) {
        // Use cached challenge
        challenge = (existingChallenge as any[])[0];
        console.log(`[DailyChallenge] Using cached challenge for ${targetBelt} belt`);
      } else {
        // Try to generate new challenge with AI, with fallback on failure
        let artType = 'Taekwondo';
        const clubIdStr = clubId as string;
        const isValidClubUuid = uuidRegex.test(clubIdStr);
        
        if (clubId && isValidClubUuid) {
          const clubData = await db.execute(sql`
            SELECT art_type FROM clubs WHERE id = ${clubIdStr}::uuid
          `);
          if ((clubData as any[]).length > 0) {
            artType = (clubData as any[])[0].art_type || 'Taekwondo';
          }
        }

        let generated;
        try {
          generated = await generateDailyChallenge(targetBelt, artType);
          console.log(`[DailyChallenge] AI generated challenge for ${targetBelt} belt`);
        } catch (aiError: any) {
          // AI generation failed - use fallback challenge
          console.error(`[DailyChallenge] AI generation failed: ${aiError.message}`);
          console.log(`[DailyChallenge] Using fallback challenge for ${targetBelt} belt`);
          generated = getFallbackChallenge();
        }
        
        // Cache in database
        try {
          const insertResult = await db.execute(sql`
            INSERT INTO daily_challenges (date, target_belt, title, description, xp_reward, type, quiz_data, created_by_ai)
            VALUES (${today}, ${targetBelt}, ${generated.title}, ${generated.description}, ${generated.xpReward}, 
                    ${generated.type}::daily_challenge_type, ${JSON.stringify(generated.quizData)}::jsonb, NOW())
            RETURNING *
          `);
          
          challenge = (insertResult as any[])[0];
          console.log(`[DailyChallenge] Cached challenge for ${targetBelt} belt`);
        } catch (dbError: any) {
          // If DB insert fails, return the generated challenge directly without caching
          console.error(`[DailyChallenge] DB cache failed: ${dbError.message}`);
          return res.json({
            completed: false,
            challenge: {
              id: 'temp-' + Date.now(),
              title: generated.title,
              description: generated.description,
              type: generated.type,
              xpReward: generated.xpReward,
              quizData: generated.quizData,
            }
          });
        }
      }

      res.json({
        completed: false,
        challenge: {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          type: challenge.type,
          xpReward: challenge.xp_reward,
          quizData: challenge.quiz_data,
        }
      });
    } catch (error: any) {
      // Ultimate fallback - return hardcoded challenge even if everything else fails
      console.error('[DailyChallenge] Critical error:', error.message);
      const fallback = getFallbackChallenge();
      res.json({
        completed: false,
        challenge: {
          id: 'fallback-' + Date.now(),
          title: fallback.title,
          description: fallback.description,
          type: fallback.type,
          xpReward: fallback.xpReward,
          quizData: fallback.quizData,
        }
      });
    }
  });

  // Debug endpoint to force regenerate daily challenge
  app.get('/debug/force-challenge', async (req: Request, res: Response) => {
    try {
      const { belt = 'white' } = req.query;
      const today = new Date().toISOString().split('T')[0];
      const targetBelt = (belt as string).toLowerCase();

      // Delete today's challenge for this belt
      const deleteResult = await db.execute(sql`
        DELETE FROM daily_challenges 
        WHERE date = ${today} AND target_belt = ${targetBelt}
        RETURNING id
      `);
      
      const deletedCount = (deleteResult as any[]).length;
      console.log(`[Debug] Deleted ${deletedCount} existing challenge(s) for ${targetBelt} belt`);

      // Try to generate new one
      let generated;
      let generationError = null;
      
      try {
        generated = await generateDailyChallenge(targetBelt, 'Taekwondo');
        console.log(`[Debug] AI successfully generated new challenge`);
      } catch (aiError: any) {
        generationError = aiError.message;
        console.error(`[Debug] AI generation failed: ${aiError.message}`);
        generated = getFallbackChallenge();
      }

      // Insert new challenge
      const insertResult = await db.execute(sql`
        INSERT INTO daily_challenges (date, target_belt, title, description, xp_reward, type, quiz_data, created_by_ai)
        VALUES (${today}, ${targetBelt}, ${generated.title}, ${generated.description}, ${generated.xpReward}, 
                ${generated.type}::daily_challenge_type, ${JSON.stringify(generated.quizData)}::jsonb, NOW())
        RETURNING *
      `);

      const newChallenge = (insertResult as any[])[0];

      res.json({
        success: true,
        deletedPrevious: deletedCount,
        aiGenerationError: generationError,
        usedFallback: !!generationError,
        challenge: {
          id: newChallenge.id,
          title: newChallenge.title,
          description: newChallenge.description,
          type: newChallenge.type,
          xpReward: newChallenge.xp_reward,
          quizData: newChallenge.quiz_data,
        }
      });
    } catch (error: any) {
      console.error('[Debug] Force challenge error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        stack: error.stack 
      });
    }
  });

  app.post('/api/daily-challenge/submit', async (req: Request, res: Response) => {
    try {
      console.log('📥 [DailyChallenge] Received Payload:', JSON.stringify(req.body, null, 2));
      console.log('🔍 Processing Submission:', { type: typeof req.body.challengeId, id: req.body.challengeId });
      
      // Extract fields - be very lenient with what we accept
      const { challengeId, studentId, answer, selectedIndex, isCorrect: frontendIsCorrect, xpReward: frontendXpReward } = req.body;
      const clubIdRaw = req.body.clubId;
      
      // Only require studentId and challengeId
      if (!challengeId || !studentId) {
        console.error('❌ [DailyChallenge] Missing required fields:', { challengeId, studentId });
        return res.status(400).json({ error: 'challengeId and studentId are required' });
      }

      // UUID validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      // studentId MUST be a valid UUID
      if (!uuidRegex.test(String(studentId))) {
        console.error('❌ [DailyChallenge] Invalid studentId format:', studentId);
        return res.status(400).json({ error: 'Invalid studentId format' });
      }
      
      // challengeId: Accept UUID OR string starting with "fallback-" or "static-"
      const challengeIdStr = String(challengeId);
      const isFallbackChallenge = challengeIdStr.startsWith('fallback-') || challengeIdStr.startsWith('static-') || !uuidRegex.test(challengeIdStr);
      
      console.log('📋 [DailyChallenge] Challenge type:', { isFallbackChallenge, challengeIdStr });
      
      // clubId: FULLY OPTIONAL
      const validClubId = (clubIdRaw && typeof clubIdRaw === 'string' && uuidRegex.test(clubIdRaw)) ? clubIdRaw : null;
      console.log('📋 [DailyChallenge] Validated (lenient):', { studentId, challengeId: challengeIdStr, validClubId, selectedIndex, isFallbackChallenge });

      // BUG FIX: Check if user already completed a daily challenge TODAY (prevents infinite XP exploit)
      // Use xp_transactions table (correct table name) with reason containing 'daily_challenge'
      const today = new Date().toISOString().split('T')[0];
      const alreadyPlayedToday = await db.execute(sql`
        SELECT id, amount FROM xp_transactions 
        WHERE student_id = ${studentId}::uuid 
        AND reason LIKE '%daily_challenge%' 
        AND DATE(created_at) = ${today}::date
        LIMIT 1
      `);
      
      if ((alreadyPlayedToday as any[]).length > 0) {
        console.log('⛔ [DailyChallenge] Already played today - blocking duplicate:', { studentId, today });
        return res.status(400).json({
          error: 'Already completed',
          message: 'You already completed today\'s challenge! Come back tomorrow.',
          previousXp: (alreadyPlayedToday as any[])[0].amount || 0
        });
      }

      // FALLBACK CHALLENGE HANDLING: Skip DB lookup, trust frontend
      if (isFallbackChallenge) {
        console.log('🎯 [DailyChallenge] Processing FALLBACK challenge - skipping DB lookup');
        
        // For fallback challenges, trust the frontend's isCorrect or default to true
        const isCorrect = frontendIsCorrect !== undefined ? frontendIsCorrect : true;
        const xpAwarded = isCorrect ? (frontendXpReward || 50) : 0;
        
        // Award XP using unified XP service and log to xp_transactions for persistence
        if (isCorrect && xpAwarded > 0) {
          // 1. Award XP using unified service (single source of truth)
          await awardXP(studentId, xpAwarded, 'mystery', { isFallback: true });
          
          // 2. Insert into xp_transactions for persistence and duplicate prevention
          await db.execute(sql`
            INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
            VALUES (${studentId}::uuid, ${xpAwarded}, 'EARN', 'daily_challenge', NOW())
          `);
          
          console.log(`✅ [DailyChallenge] Fallback XP PERSISTED: ${xpAwarded} XP to student ${studentId}`);
        }
        
        return res.json({
          success: true,
          isCorrect,
          xpAwarded,
          explanation: 'Great job completing the challenge!',
          message: isCorrect ? `Correct! +${xpAwarded} XP` : 'Not quite! Try again tomorrow.'
        });
      }

      // REGULAR CHALLENGE HANDLING: Full DB lookup and validation
      const challengeResult = await db.execute(sql`
        SELECT * FROM daily_challenges WHERE id = ${challengeId}::uuid
      `);

      if ((challengeResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = (challengeResult as any[])[0];
      
      // Check for existing submission
      const existing = await db.execute(sql`
        SELECT id FROM challenge_submissions 
        WHERE challenge_id = ${challengeId}::uuid AND student_id = ${studentId}::uuid
      `);

      if ((existing as any[]).length > 0) {
        return res.status(400).json({ error: 'Already submitted this challenge' });
      }

      // Use the ACTUAL xp_reward from the database
      let isCorrect = false;
      const challengeXpReward = challenge.xp_reward || 50;
      let xpAwarded = 0;
      
      if (challenge.type === 'quiz' && challenge.quiz_data) {
        const quizData = typeof challenge.quiz_data === 'string' 
          ? JSON.parse(challenge.quiz_data) 
          : challenge.quiz_data;
        isCorrect = selectedIndex === quizData.correctIndex;
        xpAwarded = isCorrect ? challengeXpReward : 0;
      } else {
        xpAwarded = challengeXpReward;
        isCorrect = true;
      }

      // Create submission (clubId is optional for home users)
      console.log('💾 [DailyChallenge] Inserting submission:', { challengeId, studentId, validClubId, isCorrect, xpAwarded });
      await db.execute(sql`
        INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded, completed_at)
        VALUES (${challengeId}::uuid, ${studentId}::uuid, ${validClubId ? sql`${validClubId}::uuid` : sql`NULL`}, ${answer || String(selectedIndex)}, ${isCorrect}, ${xpAwarded}, NOW())
      `);

      // Award XP using unified XP service (single source of truth)
      if (xpAwarded > 0) {
        await awardXP(studentId, xpAwarded, 'mystery', { challengeId, isCorrect });
      }

      console.log(`✅ [DailyChallenge] Submit Success - XP Awarded: ${xpAwarded}`);

      res.json({
        success: true,
        isCorrect,
        xpAwarded,
        explanation: challenge.quiz_data?.explanation || null,
        message: isCorrect 
          ? `Excellent! You earned ${xpAwarded} XP!` 
          : `Good try! You earned ${xpAwarded} XP for participating.`
      });
    } catch (error: any) {
      console.error('❌ DAILY CHALLENGE ERROR:', error);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to submit challenge', details: error.message });
    }
  });

  // =====================================================
  // ARENA CHALLENGES - Trust vs Verify Flow
  // =====================================================

  const PVP_WIN_XP = 75;
  const PVP_LOSE_XP = 15;
  const TRUST_PER_CHALLENGE_LIMIT = 1; // STRICT: 1 time per challenge per day (anti-XP farming)
  const VIDEO_XP_MULTIPLIER = 2; // Video proof earns 2x XP

  // Challenge metadata mapping
  const CHALLENGE_METADATA: Record<string, { name: string; icon: string; category: string }> = {
    'pushup_master': { name: 'Push-up Master', icon: '💪', category: 'Power' },
    'squat_challenge': { name: 'Squat Challenge', icon: '💪', category: 'Power' },
    'burpee_blast': { name: 'Burpee Blast', icon: '💪', category: 'Power' },
    'abs_of_steel': { name: 'Abs of Steel', icon: '💪', category: 'Power' },
    '100_kicks': { name: '100 Kicks Marathon', icon: '🎯', category: 'Technique' },
    'speed_punches': { name: 'Speed Punches', icon: '🎯', category: 'Technique' },
    'horse_stance': { name: 'Iron Horse Stance', icon: '🎯', category: 'Technique' },
    'jump_rope': { name: 'Jump Rope Ninja', icon: '🎯', category: 'Technique' },
    'plank_hold': { name: 'Plank Hold', icon: '🧘', category: 'Flexibility' },
    'touch_toes': { name: 'Touch Your Toes', icon: '🧘', category: 'Flexibility' },
    'wall_sit': { name: 'The Wall Sit', icon: '🧘', category: 'Flexibility' },
    'one_leg_balance': { name: 'One-Leg Balance', icon: '🧘', category: 'Flexibility' },
    'family_form_practice': { name: 'Family Form Practice', icon: '👨‍👧', category: 'Family' },
    'family_stretch': { name: 'Family Stretch', icon: '👨‍👧', category: 'Family' },
    'family_kicks': { name: 'Family Kicks', icon: '👨‍👧', category: 'Family' },
  };

  // GET /api/challenges/history - Fetch challenge submission history
  app.get('/api/challenges/history', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;
      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      const result = await db.execute(sql`
        SELECT 
          id,
          answer as challenge_type,
          status,
          proof_type,
          xp_awarded,
          score,
          video_url,
          mode,
          completed_at
        FROM challenge_submissions 
        WHERE student_id = ${studentId}::uuid
        ORDER BY completed_at DESC
        LIMIT 50
      `);

      const history = (result as any[]).map(row => {
        const challengeType = row.challenge_type || 'unknown';
        const meta = CHALLENGE_METADATA[challengeType] || { 
          name: challengeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), 
          icon: '⚡', 
          category: 'General' 
        };

        return {
          id: row.id,
          challengeType,
          challengeName: meta.name,
          icon: meta.icon,
          category: meta.category,
          status: row.status || 'COMPLETED',
          proofType: row.proof_type || 'TRUST',
          xpAwarded: row.xp_awarded || 0,
          score: row.score || 0,
          videoUrl: row.video_url,
          mode: row.mode || 'SOLO',
          completedAt: row.completed_at
        };
      });

      res.json({ history });
    } catch (error: any) {
      console.error('[ChallengeHistory] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // Unified challenge submission endpoint
  app.post('/api/challenges/submit', async (req: Request, res: Response) => {
    try {
      const { studentId, clubId, challengeType, score, proofType, videoUrl, challengeXp } = req.body;
      
      // Validate required fields
      if (!studentId || !challengeType) {
        return res.status(400).json({ error: 'studentId and challengeType are required' });
      }

      if (!proofType || !['TRUST', 'VIDEO'].includes(proofType)) {
        return res.status(400).json({ error: 'proofType must be TRUST or VIDEO' });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }
      
      // Calculate XP based on proof type
      const baseXp = challengeXp || 15; // Use passed XP or default
      const finalXp = proofType === 'VIDEO' ? baseXp * VIDEO_XP_MULTIPLIER : baseXp;

      const today = new Date().toISOString().split('T')[0];

      // AUTO-CREATE: Check if student exists, if not create them
      let studentResult = await db.execute(sql`SELECT id, club_id FROM students WHERE id = ${studentId}::uuid`);
      if ((studentResult as any[]).length === 0) {
        const clubResult = await db.execute(sql`SELECT id FROM clubs ORDER BY created_at ASC LIMIT 1`);
        const defaultClubId = (clubResult as any[])[0]?.id;
        
        if (!defaultClubId) {
          return res.status(400).json({ error: 'No clubs available. Please contact support.' });
        }
        
        await db.execute(sql`
          INSERT INTO students (id, club_id, name, total_xp, created_at, updated_at)
          VALUES (${studentId}::uuid, ${defaultClubId}::uuid, 'New Student', 0, NOW(), NOW())
        `);
        console.log(`[Arena] Auto-created student ${studentId} in club ${defaultClubId}`);
        
        studentResult = await db.execute(sql`SELECT id, club_id FROM students WHERE id = ${studentId}::uuid`);
      }

      const studentData = (studentResult as any[])[0];
      const validClubId = studentData.club_id;

      // TRUST submissions: Check PER-CHALLENGE daily limit (anti-cheat)
      if (proofType === 'TRUST') {
        // Count submissions for THIS SPECIFIC challenge today
        const challengeDailyCount = await db.execute(sql`
          SELECT COUNT(*) as count FROM challenge_submissions 
          WHERE student_id = ${studentId}::uuid 
          AND answer = ${challengeType}
          AND proof_type = 'TRUST' 
          AND DATE(completed_at) = ${today}::date
        `);
        
        const count = parseInt((challengeDailyCount as any[])[0]?.count || '0');
        if (count >= TRUST_PER_CHALLENGE_LIMIT) {
          return res.status(429).json({ 
            error: 'Daily mission complete',
            message: `Daily Mission Complete! You can earn XP for this challenge again tomorrow.`,
            limitReached: true,
            alreadyCompleted: true
          });
        }

          // Create TRUST submission - instant XP with deterministic challenge_id
          const challengeUUID = generateChallengeUUID(challengeType);
          await db.execute(sql`
            INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, xp_awarded, completed_at)
            VALUES (${challengeUUID}::uuid, ${studentId}::uuid, ${validClubId}::uuid, ${challengeType}, ${score || 0}, 'SOLO', 'COMPLETED', 'TRUST', ${finalXp}, NOW())
          `);

          // Award XP using unified XP service (single source of truth)
          await awardXP(studentId, finalXp, 'arena', { challengeType, proofType: 'TRUST' });

        console.log(`[Arena] Trust submission for "${challengeType}": +${finalXp} XP (${count + 1}/${TRUST_PER_CHALLENGE_LIMIT} today)`);

        return res.json({
          success: true,
          status: 'COMPLETED',
          xpAwarded: finalXp,
          earned_xp: finalXp,
          remainingForChallenge: TRUST_PER_CHALLENGE_LIMIT - count - 1,
          message: `Challenge completed! +${finalXp} XP earned.`
        });
      }

      // VIDEO submissions: Require premium status (2x XP multiplier)
      if (proofType === 'VIDEO') {
        if (!videoUrl) {
          return res.status(400).json({ error: 'videoUrl is required for video proof' });
        }

        // Check premium access
        const studentCheck = await db.execute(sql`
          SELECT s.id, s.club_id, s.premium_status, c.parent_premium_enabled
          FROM students s
          LEFT JOIN clubs c ON s.club_id = c.id
          WHERE s.id = ${studentId}::uuid
        `);

        const student = (studentCheck as any[])[0];
        const hasPremium = student?.premium_status !== 'none' || student?.parent_premium_enabled;

        if (!hasPremium) {
          return res.status(403).json({ 
            error: 'Premium required',
            message: 'Video proof submissions require a premium subscription. Upgrade to earn more XP!'
          });
        }

        // Store pending XP in xp_awarded field (to be used when verified) with deterministic challenge_id
        const challengeUUID = generateChallengeUUID(challengeType);
        await db.execute(sql`
          INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, video_url, xp_awarded, completed_at)
          VALUES (${challengeUUID}::uuid, ${studentId}::uuid, ${validClubId}::uuid, ${challengeType}, ${score || 0}, 'SOLO', 'PENDING', 'VIDEO', ${videoUrl}, ${finalXp}, NOW())
        `);

        console.log(`[Arena] Video submission for "${challengeType}" pending verification (pending: ${finalXp} XP)`);

        return res.json({
          success: true,
          status: 'PENDING',
          xpAwarded: 0,
          pendingXp: finalXp,
          earned_xp: 0,
          message: `Video submitted! You'll earn ${finalXp} XP when your coach verifies it.`
        });
      }

      return res.status(400).json({ error: 'Invalid proofType. Must be TRUST or VIDEO' });
    } catch (error: any) {
      console.error('[Arena] Submit error:', error.message);
      res.status(500).json({ error: 'Failed to submit challenge' });
    }
  });

  // Get presigned upload URL for video (Premium only)
  app.post('/api/challenges/upload-url', async (req: Request, res: Response) => {
    try {
      const { studentId, challengeType, filename, contentType } = req.body;
      
      if (!studentId || !challengeType || !filename) {
        return res.status(400).json({ error: 'studentId, challengeType, and filename are required' });
      }

      // Verify student has premium access before allowing upload
      const studentCheck = await db.execute(sql`
        SELECT s.id, s.premium_status, c.parent_premium_enabled
        FROM students s
        LEFT JOIN clubs c ON s.club_id = c.id
        WHERE s.id = ${studentId}::uuid
      `);

      if ((studentCheck as any[]).length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = (studentCheck as any[])[0];
      const hasPremium = student.premium_status !== 'none' || student.parent_premium_enabled;

      if (!hasPremium) {
        return res.status(403).json({ 
          error: 'Premium required',
          message: 'Video uploads require a premium subscription.'
        });
      }

      // Validate file type
      const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      const type = contentType || 'video/mp4';
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid video type. Allowed: mp4, webm, quicktime' });
      }

      const { getPresignedUploadUrl } = await import('./services/s3StorageService');
      const result = await getPresignedUploadUrl(studentId, challengeType, filename, type);

      res.json({
        uploadUrl: result.uploadUrl,
        videoUrl: result.publicUrl,
        key: result.key
      });
    } catch (error: any) {
      console.error('[Arena] Upload URL error:', error.message);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // =====================================================
  // PVP CHALLENGES
  // =====================================================

  // Create PvP challenge
  app.post('/api/challenges/pvp/create', async (req: Request, res: Response) => {
    try {
      const { challengerId, opponentId, clubId, challengeType } = req.body;
      
      if (!challengerId || !opponentId || !clubId || !challengeType) {
        return res.status(400).json({ error: 'challengerId, opponentId, clubId, and challengeType are required' });
      }

      // Verify both students are in the same club
      const students = await db.execute(sql`
        SELECT id FROM students WHERE id IN (${challengerId}::uuid, ${opponentId}::uuid) AND club_id = ${clubId}::uuid
      `);

      if ((students as any[]).length !== 2) {
        return res.status(400).json({ error: 'Both students must be in the same club' });
      }

      // Create PvP challenge
      const result = await db.execute(sql`
        INSERT INTO challenge_submissions (student_id, club_id, answer, mode, status, proof_type, opponent_id, xp_awarded, completed_at)
        VALUES (${challengerId}::uuid, ${clubId}::uuid, ${challengeType}, 'PVP', 'PENDING_OPPONENT', 'TRUST', ${opponentId}::uuid, 0, NOW())
        RETURNING id
      `);

      const challengeId = (result as any[])[0]?.id;

      console.log(`[Arena] PvP challenge created: ${challengerId} vs ${opponentId}`);

      res.json({
        success: true,
        challengeId,
        status: 'PENDING_OPPONENT',
        message: 'Challenge sent! Waiting for opponent to accept.'
      });
    } catch (error: any) {
      console.error('[Arena] PvP create error:', error.message);
      res.status(500).json({ error: 'Failed to create PvP challenge' });
    }
  });

  // Get pending PvP challenges for a student
  app.get('/api/challenges/pvp/pending/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;

      const pending = await db.execute(sql`
        SELECT cs.*, 
               challenger.first_name as challenger_name,
               challenger.current_belt as challenger_belt
        FROM challenge_submissions cs
        JOIN students challenger ON cs.student_id = challenger.id
        WHERE cs.opponent_id = ${studentId}::uuid 
        AND cs.status = 'PENDING_OPPONENT'
        ORDER BY cs.completed_at DESC
      `);

      res.json(pending);
    } catch (error: any) {
      console.error('[Arena] PvP pending error:', error.message);
      res.status(500).json({ error: 'Failed to get pending challenges' });
    }
  });

  // Accept/decline PvP challenge
  app.post('/api/challenges/pvp/respond', async (req: Request, res: Response) => {
    try {
      const { challengeId, accept } = req.body;
      
      if (!challengeId) {
        return res.status(400).json({ error: 'challengeId is required' });
      }

      if (!accept) {
        // Decline - mark as rejected
        await db.execute(sql`
          UPDATE challenge_submissions SET status = 'REJECTED' WHERE id = ${challengeId}::uuid
        `);
        return res.json({ success: true, message: 'Challenge declined' });
      }

      // Accept - mark as active
      await db.execute(sql`
        UPDATE challenge_submissions SET status = 'ACTIVE' WHERE id = ${challengeId}::uuid
      `);

      console.log(`[Arena] PvP challenge ${challengeId} accepted`);

      res.json({ success: true, status: 'ACTIVE', message: 'Challenge accepted! Time to compete.' });
    } catch (error: any) {
      console.error('[Arena] PvP respond error:', error.message);
      res.status(500).json({ error: 'Failed to respond to challenge' });
    }
  });

  // Submit PvP scores (both players submit)
  app.post('/api/challenges/pvp/submit-score', async (req: Request, res: Response) => {
    try {
      const { challengeId, studentId, score } = req.body;
      
      if (!challengeId || !studentId || score === undefined) {
        return res.status(400).json({ error: 'challengeId, studentId, and score are required' });
      }

      // Get challenge
      const challengeResult = await db.execute(sql`
        SELECT * FROM challenge_submissions WHERE id = ${challengeId}::uuid
      `);

      if ((challengeResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = (challengeResult as any[])[0];

      if (challenge.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Challenge is not active' });
      }

      const isChallenger = challenge.student_id === studentId;
      const isOpponent = challenge.opponent_id === studentId;

      if (!isChallenger && !isOpponent) {
        return res.status(403).json({ error: 'You are not part of this challenge' });
      }

      // Store score in answer field as JSON
      let scores = {};
      try {
        scores = challenge.answer ? JSON.parse(challenge.answer) : {};
      } catch { scores = {}; }

      if (isChallenger) {
        (scores as any).challenger = score;
      } else {
        (scores as any).opponent = score;
      }

      await db.execute(sql`
        UPDATE challenge_submissions SET answer = ${JSON.stringify(scores)}, score = ${score}
        WHERE id = ${challengeId}::uuid
      `);

      // Check if both scores are in
      if ((scores as any).challenger !== undefined && (scores as any).opponent !== undefined) {
        const challengerScore = (scores as any).challenger;
        const opponentScore = (scores as any).opponent;
        
        let winnerId, loserId;
        if (challengerScore > opponentScore) {
          winnerId = challenge.student_id;
          loserId = challenge.opponent_id;
        } else if (opponentScore > challengerScore) {
          winnerId = challenge.opponent_id;
          loserId = challenge.student_id;
        } else {
          // Tie - both get participation XP using unified XP service
          await awardXP(challenge.student_id, PVP_LOSE_XP, 'pvp', { result: 'TIE' });
          await awardXP(challenge.opponent_id, PVP_LOSE_XP, 'pvp', { result: 'TIE' });
          await db.execute(sql`
            UPDATE challenge_submissions SET status = 'COMPLETED', xp_awarded = ${PVP_LOSE_XP}
            WHERE id = ${challengeId}::uuid
          `);
          
          return res.json({
            success: true,
            status: 'COMPLETED',
            result: 'TIE',
            xpAwarded: PVP_LOSE_XP,
            message: `It's a tie! Both players earned ${PVP_LOSE_XP} XP.`
          });
        }

        // Award XP using unified XP service
        await awardXP(winnerId, PVP_WIN_XP, 'pvp', { result: 'WIN' });
        await awardXP(loserId, PVP_LOSE_XP, 'pvp', { result: 'LOSS' });
        await db.execute(sql`
          UPDATE challenge_submissions SET status = 'COMPLETED', xp_awarded = ${PVP_WIN_XP}
          WHERE id = ${challengeId}::uuid
        `);

        console.log(`[Arena] PvP complete: Winner ${winnerId} (+${PVP_WIN_XP}), Loser ${loserId} (+${PVP_LOSE_XP})`);

        const youWon = winnerId === studentId;
        return res.json({
          success: true,
          status: 'COMPLETED',
          result: youWon ? 'WIN' : 'LOSS',
          xpAwarded: youWon ? PVP_WIN_XP : PVP_LOSE_XP,
          message: youWon ? `Victory! You earned ${PVP_WIN_XP} XP!` : `Good effort! You earned ${PVP_LOSE_XP} XP.`
        });
      }

      res.json({
        success: true,
        status: 'ACTIVE',
        message: 'Score submitted. Waiting for opponent...'
      });
    } catch (error: any) {
      console.error('[Arena] PvP submit score error:', error.message);
      res.status(500).json({ error: 'Failed to submit score' });
    }
  });

  // =====================================================
  // COACH VERIFICATION QUEUE
  // =====================================================

  // Get pending video verifications for coach
  app.get('/api/challenges/pending-verification/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;

      const pending = await db.execute(sql`
        SELECT cs.*, 
               s.first_name, s.last_name, s.current_belt,
               s.profile_image_url
        FROM challenge_submissions cs
        JOIN students s ON cs.student_id = s.id
        WHERE cs.club_id = ${clubId}::uuid 
        AND cs.proof_type = 'VIDEO'
        AND cs.status = 'PENDING'
        ORDER BY cs.completed_at ASC
      `);

      res.json(pending);
    } catch (error: any) {
      console.error('[Arena] Pending verification error:', error.message);
      res.status(500).json({ error: 'Failed to get pending verifications' });
    }
  });

  // Coach verify/reject submission
  app.post('/api/challenges/verify', async (req: Request, res: Response) => {
    try {
      const { submissionId, verified, coachId } = req.body;
      
      if (!submissionId || verified === undefined) {
        return res.status(400).json({ error: 'submissionId and verified are required' });
      }

      // Get submission
      const subResult = await db.execute(sql`
        SELECT * FROM challenge_submissions WHERE id = ${submissionId}::uuid
      `);

      if ((subResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      const submission = (subResult as any[])[0];

      if (submission.status !== 'PENDING') {
        return res.status(400).json({ error: 'Submission is not pending verification' });
      }

      if (verified) {
        // Approve - award the XP that was stored in the submission when created
        const xpToAward = submission.xp_awarded || 30; // Fallback to 30 (15 base * 2) for legacy submissions
        
        await db.execute(sql`
          UPDATE challenge_submissions SET status = 'VERIFIED'
          WHERE id = ${submissionId}::uuid
        `);
        
        // Award XP using unified XP service
        await awardXP(submission.student_id, xpToAward, 'arena', { proofType: 'VIDEO', verified: true });

        console.log(`[Arena] Video verified for ${submission.student_id}: +${xpToAward} XP`);

        res.json({
          success: true,
          status: 'VERIFIED',
          xpAwarded: xpToAward,
          message: `Video verified! +${xpToAward} XP awarded to student.`
        });
      } else {
        // Reject
        await db.execute(sql`
          UPDATE challenge_submissions SET status = 'REJECTED'
          WHERE id = ${submissionId}::uuid
        `);

        console.log(`[Arena] Video rejected for ${submission.student_id}`);

        res.json({
          success: true,
          status: 'REJECTED',
          message: 'Submission rejected.'
        });
      }
    } catch (error: any) {
      console.error('[Arena] Verify error:', error.message);
      res.status(500).json({ error: 'Failed to verify submission' });
    }
  });

  // =====================================================
  // LEADERBOARD - SIMPLE: Read directly from students.total_xp (single source of truth)
  // =====================================================
  app.get('/api/leaderboard', async (req: Request, res: Response) => {
    try {
      const clubId = req.query.clubId as string;
      
      if (!clubId) {
        return res.status(400).json({ error: 'clubId is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clubId)) {
        return res.status(400).json({ error: 'Invalid clubId format' });
      }

      // Fetch all students with their total_xp (single source of truth)
      const students = await db.execute(sql`
        SELECT id, name, belt, stripes, COALESCE(total_xp, 0) as total_xp 
        FROM students 
        WHERE club_id = ${clubId}::uuid 
      `);

      // Calculate monthly XP from xp_transactions (the audit log)
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = monthStart.toISOString();

      const monthlyXpData = await db.execute(sql`
        SELECT student_id, COALESCE(SUM(amount), 0) as monthly_xp
        FROM xp_transactions 
        WHERE student_id IN (SELECT id FROM students WHERE club_id = ${clubId}::uuid)
          AND type = 'EARN' AND created_at >= ${monthStartStr}::timestamp
        GROUP BY student_id
      `);
      const monthlyXpMap = new Map((monthlyXpData as any[]).map(r => [r.student_id, parseInt(r.monthly_xp) || 0]));

      // Build leaderboard: totalXP from students table, monthlyXP from logs
      const leaderboard = (students as any[]).map(s => ({
        id: s.id,
        name: s.name,
        belt: s.belt,
        stripes: s.stripes || 0,
        totalXP: parseInt(s.total_xp) || 0,
        monthlyXP: monthlyXpMap.get(s.id) || 0
      }))
      .sort((a, b) => b.totalXP - a.totalXP)
      .map((s, index) => ({ ...s, rank: index + 1 }));

      console.log('[Leaderboard] Using students.total_xp as source of truth:', leaderboard.map(s => ({ name: s.name, xp: s.totalXP })));

      res.json({ leaderboard });
    } catch (error: any) {
      console.error('[Leaderboard] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  // =====================================================
  // SYNC RIVALS STATS - Return current XP from students.total_xp (single source of truth)
  // =====================================================
  app.post('/api/students/:id/sync-rivals', async (req: Request, res: Response) => {
    try {
      const studentId = req.params.id;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      // Read current total_xp from students table (single source of truth)
      const studentResult = await db.execute(sql`
        SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = ${studentId}::uuid
      `);
      
      if ((studentResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      
      const currentXp = parseInt((studentResult as any[])[0]?.total_xp || '0', 10);

      console.log(`[SyncRivals] Returning current XP for student ${studentId}: ${currentXp}`);

      res.json({ 
        success: true, 
        totalXp: currentXp,
        message: 'Rivals stats synced successfully'
      });
    } catch (error: any) {
      console.error('[SyncRivals] Error:', error.message);
      res.status(500).json({ error: 'Failed to sync rivals stats' });
    }
  });

  // =====================================================
  // HOME DOJO - HABIT TRACKING
  // =====================================================
  const HABIT_XP = 10;
  const DAILY_HABIT_XP_CAP = 60;

  app.post('/api/habits/check', async (req: Request, res: Response) => {
    try {
      const { studentId, habitName } = req.body;

      if (!studentId || !habitName) {
        return res.status(400).json({ error: 'studentId and habitName are required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      const today = new Date().toISOString().split('T')[0];

      // AUTO-CREATE: Check if student exists, if not create them
      const studentCheck = await db.execute(sql`SELECT id FROM students WHERE id = ${studentId}::uuid`);
      if ((studentCheck as any[]).length === 0) {
        // Get first available club for default assignment
        const clubResult = await db.execute(sql`SELECT id FROM clubs ORDER BY created_at ASC LIMIT 1`);
        const defaultClubId = (clubResult as any[])[0]?.id;
        
        if (!defaultClubId) {
          return res.status(400).json({ error: 'No clubs available. Please contact support.' });
        }
        
        // Auto-create the student
        await db.execute(sql`
          INSERT INTO students (id, club_id, name, total_xp, created_at, updated_at)
          VALUES (${studentId}::uuid, ${defaultClubId}::uuid, 'New Student', 0, NOW(), NOW())
        `);
        console.log(`[HomeDojo] Auto-created student ${studentId} in club ${defaultClubId}`);
      }

      const existing = await db.execute(sql`
        SELECT id FROM habit_logs WHERE student_id = ${studentId}::uuid AND habit_name = ${habitName} AND log_date = ${today}::date
      `);

      if ((existing as any[]).length > 0) {
        return res.status(400).json({
          error: 'Already completed',
          message: 'You already completed this habit today!',
          alreadyCompleted: true
        });
      }

      // Anti-cheat: Check daily XP cap (60 XP max from habits per day)
      const dailyXpResult = await db.execute(sql`
        SELECT COALESCE(SUM(xp_awarded), 0) as total_xp_today FROM habit_logs WHERE student_id = ${studentId}::uuid AND log_date = ${today}::date
      `);
      const totalXpToday = parseInt((dailyXpResult as any[])[0]?.total_xp_today || '0');
      const atDailyLimit = totalXpToday >= DAILY_HABIT_XP_CAP;
      const xpToAward = atDailyLimit ? 0 : HABIT_XP;

      await db.execute(sql`
        INSERT INTO habit_logs (student_id, habit_name, xp_awarded, log_date) VALUES (${studentId}::uuid, ${habitName}, ${xpToAward}, ${today}::date)
      `);

      let newTotalXp = 0;
      if (xpToAward > 0) {
        // Award XP using unified XP service
        const xpResult = await awardXP(studentId, xpToAward, 'home_dojo', { habitName });
        newTotalXp = xpResult.newTotal;
        console.log(`[HomeDojo] Habit "${habitName}" completed: +${xpToAward} XP, new total_xp: ${newTotalXp}`);
      } else {
        newTotalXp = await getStudentXP(studentId);
        console.log(`[HomeDojo] Habit "${habitName}" completed but daily cap reached (${totalXpToday}/${DAILY_HABIT_XP_CAP} XP)`);
      }

      res.json({
        success: true,
        xpAwarded: xpToAward,
        newTotalXp,
        dailyXpEarned: totalXpToday + xpToAward,
        dailyXpCap: DAILY_HABIT_XP_CAP,
        atDailyLimit: (totalXpToday + xpToAward) >= DAILY_HABIT_XP_CAP,
        message: atDailyLimit 
          ? `Habit done! Daily Dojo Limit reached (Max ${DAILY_HABIT_XP_CAP} XP).`
          : `Habit completed! +${HABIT_XP} XP earned.`
      });
    } catch (error: any) {
      console.error('[HomeDojo] Habit check error:', error.message);
      res.status(500).json({ error: 'Failed to log habit' });
    }
  });

  // Calculate streak from habit_logs - consecutive days with at least 1 habit completed
  async function calculateStreak(studentId: string): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT log_date FROM habit_logs WHERE student_id = ${studentId}::uuid ORDER BY log_date DESC
      `);

      const rows = result as any[];
      if (rows.length === 0) return 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const dates = rows.map((r: any) => {
        const d = new Date(r.log_date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });

      const todayTime = today.getTime();
      const yesterdayTime = yesterday.getTime();
      
      if (!dates.includes(todayTime) && !dates.includes(yesterdayTime)) {
        return 0;
      }

      let streak = 0;
      let checkDate = dates.includes(todayTime) ? today : yesterday;
      
      for (let i = 0; i < dates.length && i < 365; i++) {
        const expectedTime = checkDate.getTime();
        if (dates.includes(expectedTime)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      console.error('[Streak] Calculation error:', error);
      return 0;
    }
  }

  app.get('/api/habits/status', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;

      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      // STRICT MODE: Validate UUID - NO DEMO MODE
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      const today = new Date().toISOString().split('T')[0];

      // Fetch today's habit logs
      const result = await db.execute(sql`
        SELECT habit_name, xp_awarded FROM habit_logs WHERE student_id = ${studentId}::uuid AND log_date = ${today}::date
      `);

      // Also fetch student's current total_xp for sync on page load
      const studentResult = await db.execute(sql`
        SELECT total_xp FROM students WHERE id = ${studentId}::uuid
      `);
      const totalXp = (studentResult as any[])[0]?.total_xp || 0;

      const completedHabits = (result as any[]).map(r => r.habit_name);
      const totalXpToday = (result as any[]).reduce((sum, r) => sum + (r.xp_awarded || 0), 0);

      // Calculate real streak from habit_logs
      const streak = await calculateStreak(studentId);

      // Return totalXp as single source of truth (also as lifetimeXp for backward compatibility)
      res.json({ completedHabits, totalXpToday, dailyXpCap: DAILY_HABIT_XP_CAP, totalXp, lifetimeXp: totalXp, streak });
    } catch (error: any) {
      console.error('[HomeDojo] Status fetch error:', error.message);
      res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: DAILY_HABIT_XP_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
    }
  });

  // Custom Habits endpoints
  app.get('/api/habits/custom', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;
      if (!studentId) return res.status(400).json({ error: 'studentId is required' });

      // STRICT MODE: Validate UUID - NO DEMO MODE
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      const result = await db.execute(sql`
        SELECT id, title, icon, is_active FROM user_custom_habits WHERE student_id = ${studentId}::uuid AND is_active = true ORDER BY created_at ASC
      `);
      res.json({ customHabits: result });
    } catch (error: any) {
      console.error('[HomeDojo] Get custom habits error:', error.message);
      res.status(500).json({ error: 'Failed to fetch custom habits' });
    }
  });

  app.post('/api/habits/custom', async (req: Request, res: Response) => {
    try {
      const { studentId, title, icon } = req.body;
      if (!studentId || !title) return res.status(400).json({ error: 'studentId and title are required' });

      // STRICT MODE: Validate UUID - NO DEMO MODE
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      const result = await db.execute(sql`
        INSERT INTO user_custom_habits (student_id, title, icon) VALUES (${studentId}::uuid, ${title.slice(0, 100)}, ${icon || '✨'}) RETURNING id, title, icon, is_active
      `);
      console.log(`[HomeDojo] Created custom habit: "${title}" for student ${studentId}`);
      res.json({ success: true, habit: (result as any[])[0] });
    } catch (error: any) {
      console.error('[HomeDojo] Create custom habit error:', error.message);
      res.status(500).json({ error: 'Failed to create habit' });
    }
  });

  app.delete('/api/habits/custom/:habitId', async (req: Request, res: Response) => {
    try {
      const habitId = req.params.habitId;
      // STRICT MODE: Validate UUID - NO DEMO MODE
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(habitId)) {
        return res.status(400).json({ error: 'Invalid habitId - must be a valid UUID' });
      }

      await db.execute(sql`UPDATE user_custom_habits SET is_active = false WHERE id = ${habitId}::uuid`);
      console.log(`[HomeDojo] Deleted custom habit: ${habitId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[HomeDojo] Delete custom habit error:', error.message);
      res.status(500).json({ error: 'Failed to delete habit' });
    }
  });

  // =====================================================
  // FAMILY CHALLENGES - Trust System (Parent Verified)
  // =====================================================

  // Server-side family challenge definitions (canonical XP values - must match frontend)
  const FAMILY_CHALLENGES: Record<string, { name: string; baseXp: number }> = {
    // HARD tier (100+ XP)
    'family_pushups': { name: 'Parent vs Kid: Pushups', baseXp: 100 },
    'family_plank': { name: 'Family Plank-Off', baseXp: 120 },
    'family_squat_hold': { name: 'The Squat Showdown', baseXp: 100 },
    // MEDIUM tier (80-99 XP)
    'family_statue': { name: 'The Statue Challenge', baseXp: 80 },
    'family_kicks': { name: 'Kick Count Battle', baseXp: 90 },
    'family_balance': { name: 'Flamingo Stand-Off', baseXp: 80 },
    'family_situps': { name: 'Sit-Up Showdown', baseXp: 90 },
    'family_reaction': { name: 'Reaction Time Test', baseXp: 85 },
    'family_mirror': { name: 'Mirror Challenge', baseXp: 75 },
    // EASY tier (50-79 XP)
    'family_dance': { name: 'Martial Arts Dance-Off', baseXp: 70 },
    'family_stretch': { name: 'Stretch Together', baseXp: 60 },
    'family_breathing': { name: 'Calm Warrior Breathing', baseXp: 50 }
  };

  // Submit a family challenge completion
  app.post('/api/family-challenges/submit', async (req: Request, res: Response) => {
    try {
      const { studentId, challengeId, won } = req.body;

      if (!studentId || !challengeId) {
        return res.status(400).json({ error: 'studentId and challengeId are required' });
      }

      // Validate UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      // SERVER-SIDE XP CALCULATION - prevent client tampering
      const challenge = FAMILY_CHALLENGES[challengeId];
      if (!challenge) {
        return res.status(400).json({ error: 'Invalid challengeId' });
      }
      
      const baseXp = challenge.baseXp;
      const xp = won ? baseXp : Math.round(baseXp * 0.5); // Win = full XP, Loss = 50%
      const today = new Date().toISOString().split('T')[0];

      // Check if already completed today (1x daily limit per challenge)
      const existing = await db.execute(sql`
        SELECT id FROM family_logs 
        WHERE student_id = ${studentId}::uuid 
        AND challenge_id = ${challengeId} 
        AND completed_at = ${today}::date
      `);

      if ((existing as any[]).length > 0) {
        return res.status(429).json({
          error: 'Already completed',
          message: 'You already completed this family challenge today!',
          alreadyCompleted: true
        });
      }

      // Insert into family_logs
      await db.execute(sql`
        INSERT INTO family_logs (student_id, challenge_id, xp_awarded, completed_at)
        VALUES (${studentId}::uuid, ${challengeId}, ${xp}, ${today}::date)
      `);

      // Award XP using unified XP service
      const xpResult = await awardXP(studentId, xp, 'family', { challengeId, won });
      const newTotalXp = xpResult.newTotal;

      console.log(`[FamilyChallenge] "${challengeId}" completed: +${xp} XP, won: ${won}, new total_xp: ${newTotalXp}`);

      res.json({
        success: true,
        xpAwarded: xp,
        newTotalXp,
        won: won || false,
        message: `Family challenge completed! +${xp} XP earned.`
      });
    } catch (error: any) {
      console.error('[FamilyChallenge] Submit error:', error.message);
      res.status(500).json({ error: 'Failed to submit family challenge' });
    }
  });

  // Get family challenge status for today
  app.get('/api/family-challenges/status', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;

      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      // Validate UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
      }

      const today = new Date().toISOString().split('T')[0];

      // Get all completed family challenges for today
      const result = await db.execute(sql`
        SELECT challenge_id, xp_awarded FROM family_logs 
        WHERE student_id = ${studentId}::uuid 
        AND completed_at = ${today}::date
      `);

      const completedChallenges = (result as any[]).map(r => r.challenge_id);
      const totalXpToday = (result as any[]).reduce((sum, r) => sum + (r.xp_awarded || 0), 0);

      res.json({
        completedChallenges,
        totalXpToday
      });
    } catch (error: any) {
      console.error('[FamilyChallenge] Status error:', error.message);
      res.status(500).json({ error: 'Failed to get family challenge status' });
    }
  });

  // =====================================================
  // VIRTUAL DOJO - Game Module APIs
  // =====================================================

  const WHEEL_ITEMS = [
    { name: 'Rice Ball', type: 'FOOD', rarity: 'COMMON', emoji: '🍙', evolutionPoints: 10, weight: 30 },
    { name: 'Sushi', type: 'FOOD', rarity: 'COMMON', emoji: '🍣', evolutionPoints: 15, weight: 25 },
    { name: 'Ramen', type: 'FOOD', rarity: 'RARE', emoji: '🍜', evolutionPoints: 25, weight: 15 },
    { name: 'Golden Apple', type: 'FOOD', rarity: 'EPIC', emoji: '🍎', evolutionPoints: 50, weight: 8 },
    { name: 'Dragon Fruit', type: 'FOOD', rarity: 'LEGENDARY', emoji: '🐉', evolutionPoints: 100, weight: 2 },
    { name: 'Bonsai Tree', type: 'DECORATION', rarity: 'COMMON', emoji: '🌳', evolutionPoints: 0, weight: 20 },
    { name: 'Lucky Cat', type: 'DECORATION', rarity: 'RARE', emoji: '🐱', evolutionPoints: 0, weight: 10 },
    { name: 'Golden Trophy', type: 'DECORATION', rarity: 'EPIC', emoji: '🏆', evolutionPoints: 0, weight: 5 },
    { name: 'Crystal Orb', type: 'DECORATION', rarity: 'LEGENDARY', emoji: '🔮', evolutionPoints: 0, weight: 2 },
  ];

  const SPIN_COST = 200;

  const EVOLUTION_STAGES = [
    { stage: 'egg', minPoints: 0 },
    { stage: 'baby', minPoints: 50 },
    { stage: 'teen', minPoints: 150 },
    { stage: 'adult', minPoints: 400 },
    { stage: 'master', minPoints: 1000 },
  ];

  // Helper: Calculate total XP (earned - spent)
  async function calculateTotalXp(studentId: string): Promise<number> {
    const earned = await db.execute(sql`
      SELECT 
        COALESCE((SELECT SUM(xp_awarded) FROM habit_logs WHERE student_id = ${studentId}::uuid), 0) +
        COALESCE((SELECT SUM(xp_awarded) FROM family_logs WHERE student_id = ${studentId}::uuid), 0) +
        COALESCE((SELECT SUM(xp_awarded) FROM challenge_submissions WHERE student_id = ${studentId}::uuid), 0)
        AS total
    `);
    const totalEarned = parseInt((earned as any[])[0]?.total || '0', 10);

    const xpEarned = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions 
      WHERE student_id = ${studentId}::uuid AND type = 'EARN'
    `);
    const totalXpEarned = parseInt((xpEarned as any[])[0]?.total || '0', 10);

    const spent = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions 
      WHERE student_id = ${studentId}::uuid AND type = 'SPEND'
    `);
    const totalSpent = parseInt((spent as any[])[0]?.total || '0', 10);

    return totalEarned + totalXpEarned - totalSpent;
  }

  // Helper: Weighted random selection
  function selectWeightedItem(items: typeof WHEEL_ITEMS) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
      random -= item.weight;
      if (random <= 0) return item;
    }
    return items[0];
  }

  // Get Dojo State
  app.get('/api/dojo/state', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;

      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId' });
      }

      const xpBalance = await calculateTotalXp(studentId);

      let inventory: any[] = [];
      try {
        const inventoryResult = await db.execute(sql`
          SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
          FROM dojo_inventory WHERE student_id = ${studentId}::uuid AND quantity > 0
        `);
        const rows = Array.isArray(inventoryResult) ? inventoryResult : [];
        inventory = rows.map(item => ({
          id: item.id,
          itemName: item.item_name,
          itemType: item.item_type,
          itemRarity: item.item_rarity,
          itemEmoji: item.item_emoji,
          quantity: item.quantity,
          evolutionPoints: item.evolution_points,
        }));
      } catch (invErr) {
        console.log('[Dojo] No inventory found for student, returning empty array');
        inventory = [];
      }

      const monsterResult = await db.execute(sql`
        SELECT dojo_monster FROM students WHERE id = ${studentId}::uuid
      `);

      let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
      const monsterRows = Array.isArray(monsterResult) ? monsterResult : [];
      if (monsterRows[0]?.dojo_monster) {
        monster = monsterRows[0].dojo_monster;
      }

      res.json({ xpBalance, inventory, monster });
    } catch (error: any) {
      console.error('[Dojo] State error:', error.message);
      res.status(500).json({ error: 'Failed to get dojo state' });
    }
  });

  // Spin Lucky Wheel
  app.post('/api/dojo/spin', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.body;

      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId' });
      }

      const currentXp = await calculateTotalXp(studentId);
      if (currentXp < SPIN_COST) {
        return res.status(400).json({ error: `Not enough XP! You have ${currentXp} XP but need ${SPIN_COST} XP.` });
      }

      await db.execute(sql`
        INSERT INTO xp_transactions (student_id, amount, type, reason)
        VALUES (${studentId}::uuid, ${SPIN_COST}, 'SPEND', 'Lucky Wheel spin')
      `);

      const wonItem = selectWeightedItem(WHEEL_ITEMS);

      const existing = await db.execute(sql`
        SELECT id, quantity FROM dojo_inventory 
        WHERE student_id = ${studentId}::uuid AND item_name = ${wonItem.name}
      `);

      if ((existing as any[]).length > 0) {
        await db.execute(sql`
          UPDATE dojo_inventory SET quantity = quantity + 1 
          WHERE id = ${(existing as any[])[0].id}::uuid
        `);
      } else {
        await db.execute(sql`
          INSERT INTO dojo_inventory (student_id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points)
          VALUES (${studentId}::uuid, ${wonItem.name}, ${wonItem.type}, ${wonItem.rarity}, ${wonItem.emoji}, 1, ${wonItem.evolutionPoints})
        `);
      }

      const newXpBalance = await calculateTotalXp(studentId);

      const inventoryResult = await db.execute(sql`
        SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
        FROM dojo_inventory WHERE student_id = ${studentId}::uuid AND quantity > 0
      `);

      const inventory = (inventoryResult as any[]).map(item => ({
        id: item.id,
        itemName: item.item_name,
        itemType: item.item_type,
        itemRarity: item.item_rarity,
        itemEmoji: item.item_emoji,
        quantity: item.quantity,
        evolutionPoints: item.evolution_points,
      }));

      console.log(`[Dojo] Spin: ${studentId} won ${wonItem.name} (${wonItem.rarity}), spent ${SPIN_COST} XP`);

      res.json({
        item: wonItem,
        newXpBalance,
        inventory,
      });
    } catch (error: any) {
      console.error('[Dojo] Spin error:', error.message);
      res.status(500).json({ error: 'Failed to spin wheel' });
    }
  });

  // Feed Monster
  app.post('/api/dojo/feed', async (req: Request, res: Response) => {
    try {
      const { studentId, itemId } = req.body;

      if (!studentId || !itemId) {
        return res.status(400).json({ error: 'studentId and itemId are required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId) || !uuidRegex.test(itemId)) {
        return res.status(400).json({ error: 'Invalid UUID format' });
      }

      const itemResult = await db.execute(sql`
        SELECT id, item_type, evolution_points, quantity FROM dojo_inventory 
        WHERE id = ${itemId}::uuid AND student_id = ${studentId}::uuid
      `);

      if ((itemResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const item = (itemResult as any[])[0];
      if (item.item_type !== 'FOOD') {
        return res.status(400).json({ error: 'Only food items can be fed to the monster' });
      }
      if (item.quantity < 1) {
        return res.status(400).json({ error: 'No items left' });
      }

      await db.execute(sql`
        UPDATE dojo_inventory SET quantity = quantity - 1 WHERE id = ${itemId}::uuid
      `);

      const monsterResult = await db.execute(sql`
        SELECT dojo_monster FROM students WHERE id = ${studentId}::uuid
      `);

      let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
      if ((monsterResult as any[])[0]?.dojo_monster) {
        monster = (monsterResult as any[])[0].dojo_monster;
      }

      monster.evolutionPoints += item.evolution_points;

      const sortedStages = [...EVOLUTION_STAGES].reverse();
      const newStage = sortedStages.find(s => monster.evolutionPoints >= s.minPoints) || EVOLUTION_STAGES[0];
      monster.stage = newStage.stage;

      await db.execute(sql`
        UPDATE students SET dojo_monster = ${JSON.stringify(monster)}::jsonb WHERE id = ${studentId}::uuid
      `);

      const inventoryResult = await db.execute(sql`
        SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
        FROM dojo_inventory WHERE student_id = ${studentId}::uuid AND quantity > 0
      `);

      const inventory = (inventoryResult as any[]).map(i => ({
        id: i.id,
        itemName: i.item_name,
        itemType: i.item_type,
        itemRarity: i.item_rarity,
        itemEmoji: i.item_emoji,
        quantity: i.quantity,
        evolutionPoints: i.evolution_points,
      }));

      console.log(`[Dojo] Feed: ${studentId} fed monster +${item.evolution_points} EP, now at ${monster.evolutionPoints} EP (${monster.stage})`);

      res.json({ monster, inventory });
    } catch (error: any) {
      console.error('[Dojo] Feed error:', error.message);
      res.status(500).json({ error: 'Failed to feed monster' });
    }
  });

  // DEBUG: Add test XP for development testing
  app.post('/api/dojo/debug-add-xp', async (req: Request, res: Response) => {
    try {
      const { studentId, amount = 1000 } = req.body;

      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid studentId' });
      }

      await db.execute(sql`
        INSERT INTO xp_transactions (student_id, amount, type, reason)
        VALUES (${studentId}::uuid, ${amount}, 'EARN', 'DEBUG: Test XP added')
      `);

      const newBalance = await calculateTotalXp(studentId);
      console.log(`[Dojo DEBUG] Added ${amount} XP to student ${studentId}, new balance: ${newBalance}`);

      res.json({ success: true, xpBalance: newBalance });
    } catch (error: any) {
      console.error('[Dojo] Debug add XP error:', error.message);
      res.status(500).json({ error: 'Failed to add XP' });
    }
  });
}
