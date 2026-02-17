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
import { calculateArenaGlobalScore, calculateLocalXp, type ChallengeTypeKey, type ChallengeTierKey } from '../services/gamificationService';
import { loadDemoData, clearDemoData } from './demoService';

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

  app.post('/api/change-password', async (req: Request, res: Response) => {
    const { userId, currentPassword, newPassword } = req.body || {};
    
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'User ID, current password, and new password are required' });
    }
    
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    
    try {
      const userResult = await db.execute(sql`
        SELECT id, password_hash FROM users WHERE id = ${userId}::uuid
      `);
      
      if ((userResult as any[]).length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const user = (userResult as any[])[0];
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await db.execute(sql`
        UPDATE users SET password_hash = ${newPasswordHash}, updated_at = NOW() WHERE id = ${userId}::uuid
      `);
      
      console.log('[ChangePassword] Password changed for user:', userId);
      return res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      console.error('[ChangePassword] Error:', error.message);
      return res.status(500).json({ error: 'Failed to change password' });
    }
  });

  app.post('/api/club/save-wizard-data', async (req: Request, res: Response) => {
    try {
      const { clubId, wizardData } = req.body;
      
      if (!clubId || !wizardData) {
        return res.status(400).json({ error: 'Club ID and wizard data are required' });
      }

      // Map beltSystemType to display name for art_type column
      const beltSystemToArtType: Record<string, string> = {
        'wt': 'Taekwondo',
        'itf': 'Taekwondo (ITF)',
        'karate': 'Karate',
        'bjj': 'Brazilian Jiu-Jitsu',
        'judo': 'Judo',
        'hapkido': 'Hapkido',
        'tangsoodo': 'Tang Soo Do',
        'aikido': 'Aikido',
        'kravmaga': 'Krav Maga',
        'kungfu': 'Kung Fu',
        'custom': 'Custom'
      };
      
      const artType = beltSystemToArtType[wizardData.beltSystemType] || 'Taekwondo';

      await db.execute(sql`
        UPDATE clubs 
        SET wizard_data = ${JSON.stringify(wizardData)}::jsonb,
            art_type = ${artType},
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
            const tempPassword = coach.password || '1234';
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
            const joinDateValue = student.joinDate ? new Date(student.joinDate).toISOString() : new Date().toISOString();
            const insertResult = await db.execute(sql`
              INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, total_xp, join_date, created_at)
              VALUES (${clubId}::uuid, ${student.name}, ${parentEmail}, ${student.parentName || null}, ${student.parentPhone || null}, ${student.beltId || 'white'}, ${birthdateValue}::timestamptz, ${student.totalPoints || 0}, ${student.lifetimeXp || 0}, ${joinDateValue}::timestamptz, NOW())
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
               wizard_data, trial_start, trial_end, trial_status, status,
               world_rankings_enabled, has_demo_data
        FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const studentsResult = await db.execute(sql`
        SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
               total_points, total_xp, stripes, join_date, created_at,
               location, assigned_class, global_xp, is_demo, premium_status,
               trust_tier, video_approval_streak, last_class_at
        FROM students WHERE club_id = ${clubId}::uuid
      `);

      const coachesResult = await db.execute(sql`
        SELECT id, name, email, location, assigned_classes
        FROM coaches WHERE club_id = ${clubId}::uuid AND is_active = true
      `);

      // Fetch curriculum content from database
      const curriculumResult = await db.execute(sql`
        SELECT id, title, description, url, thumbnail_url, content_type, belt_id, 
               tags, duration, status, pricing_type, price, xp_reward, order_index,
               view_count, completion_count, author_name, publish_at, created_at
        FROM curriculum_content 
        WHERE club_id = ${clubId}::uuid AND status = 'live'
        ORDER BY order_index ASC, created_at DESC
      `);

      const defaultWizardFields = {
        beltSystemType: 'wt',
        belts: [],
        stripesPerBelt: 4,
        skills: [
          { id: 'skill-1', name: 'Technique', isActive: true, isCustom: false },
          { id: 'skill-2', name: 'Effort', isActive: true, isCustom: false },
          { id: 'skill-3', name: 'Focus', isActive: true, isCustom: false },
          { id: 'skill-4', name: 'Discipline', isActive: true, isCustom: false },
        ],
        homeworkBonus: false,
        coachBonus: false,
        pointsPerStripe: 64,
        useCustomPointsPerBelt: false,
        pointsPerBelt: {},
        useColorCodedStripes: false,
        stripeColors: ['#000000', '#000000', '#000000', '#000000'],
        gradingRequirementEnabled: false,
        gradingRequirementName: '',
        primaryColor: '#3B82F6',
        themeStyle: 'modern',
        slogan: '',
        classes: ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'],
        locationClasses: {},
        schedule: [],
        events: [],
        privateSlots: [],
        clubSponsoredPremium: false,
        challenges: [],
        customChallenges: [],
        holidaySchedule: 'minimal',
        customHolidayWeeks: 4,
        language: 'English',
        branches: 1,
        branchNames: ['Main Location'],
        branchAddresses: [''],
      };
      const savedWizardData = { ...defaultWizardFields, ...(club.wizard_data || {}) };
      const savedBelts = savedWizardData.belts || [];
      
      const getBeltIdFromName = (beltName: string): string => {
        if (!beltName) return savedBelts[0]?.id || 'white';
        const matchedBelt = savedBelts.find((b: any) => 
          b.name?.toLowerCase() === beltName.toLowerCase() ||
          b.id?.toLowerCase() === beltName.toLowerCase()
        );
        return matchedBelt?.id || savedBelts[0]?.id || 'white';
      };
      
      // Preserve extra fields from saved wizard_data (performanceHistory, isDemo, etc.)
      const savedStudents = savedWizardData.students || [];
      const students = (studentsResult as any[]).map(s => {
        // Find matching saved student to preserve extra fields
        const saved = savedStudents.find((ws: any) => 
          ws.id === s.id || ws.name === s.name
        ) || {};
        return {
          id: s.id,
          name: s.name,
          parentEmail: s.parent_email,
          parentName: s.parent_name,
          parentPhone: s.parent_phone,
          beltId: getBeltIdFromName(s.belt),
          birthday: s.birthdate?.toISOString?.()?.split('T')[0] || saved.birthday || null,
          joinDate: s.join_date || s.created_at || saved.joinDate || new Date().toISOString(),
          totalXP: s.total_xp || 0,
          totalPoints: s.total_points || saved.totalPoints || 0,
          lifetimeXp: s.total_xp || saved.lifetimeXp || 0,
          globalXp: s.global_xp || saved.globalXp || 0,
          currentStreak: saved.currentStreak || 0,
          stripes: s.stripes || 0,
          stripeCount: s.stripes || 0,
          location: s.location || saved.location || '',
          assignedClass: s.assigned_class || saved.assignedClass || '',
          gender: saved.gender || '',
          medicalInfo: saved.medicalInfo || '',
          age: saved.age || undefined,
          performanceHistory: saved.performanceHistory || [],
          attendanceCount: saved.attendanceCount || 0,
          premiumStatus: s.premium_status || saved.premiumStatus || 'none',
          isDemo: s.is_demo || saved.isDemo || false,
          trustTier: s.trust_tier || saved.trustTier || 'unverified',
          videoApprovalStreak: s.video_approval_streak || saved.videoApprovalStreak || 0,
          homeDojo: saved.homeDojo || { character: [], chores: [], school: [], health: [] },
          lastClassAt: s.last_class_at?.toISOString?.() || saved.lastClassAt || null
        };
      });

      for (const s of studentsResult as any[]) {
        if (!s.last_class_at) {
          const saved = savedStudents.find((ws: any) => ws.id === s.id || ws.name === s.name) || {} as any;
          const perfHistory = saved.performanceHistory || [];
          if (perfHistory.length > 0) {
            const lastEntry = perfHistory[perfHistory.length - 1];
            if (lastEntry?.date) {
              await db.execute(sql`
                UPDATE students SET last_class_at = ${new Date(lastEntry.date)} WHERE id = ${s.id}::uuid AND last_class_at IS NULL
              `);
            }
          }
        }
      }

      const coaches = (coachesResult as any[]).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        location: c.location || '',
        assignedClasses: c.assigned_classes || []
      }));

      // Map curriculum content from database to frontend format
      const curriculum = (curriculumResult as any[]).map(c => {
        const tagsArr = Array.isArray(c.tags) ? c.tags : [];
        return {
          id: c.id,
          title: c.title,
          description: c.description || '',
          url: c.url || '',
          thumbnailUrl: c.thumbnail_url,
          contentType: c.content_type || 'video',
          beltId: c.belt_id || 'all',
          tags: tagsArr,
          category: tagsArr.join(','),
          duration: c.duration,
          status: c.status || 'live',
          pricingType: c.pricing_type || 'free',
          price: c.price || 0,
          xpReward: c.xp_reward || 10,
          orderIndex: c.order_index || 0,
          viewCount: c.view_count || 0,
          completionCount: c.completion_count || 0,
          authorName: c.author_name,
          publishAt: c.publish_at,
          createdAt: c.created_at
        };
      });

      const wizardData = {
        ...savedWizardData,
        students,
        coaches,
        curriculum,
        clubName: savedWizardData.clubName || club.name,
        ownerName: savedWizardData.ownerName || club.owner_name || '',
        country: savedWizardData.country || club.country || 'US',
        logo: savedWizardData.logo || null,
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
          status: club.status,
          worldRankingsEnabled: club.world_rankings_enabled || false,
          hasDemoData: club.has_demo_data || false
        },
        wizardData
      });
    } catch (error: any) {
      console.error('[Club Data] Fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch club data' });
    }
  });

  // Verify subscription status by checking Stripe directly
  app.post('/api/club/:clubId/verify-subscription', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }

      // Get club's owner email and trial info
      const clubResult = await db.execute(sql`
        SELECT id, owner_email, trial_status, trial_start, trial_end FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const stripe = await getUncachableStripeClient();
      
      // Find Stripe customer by email
      const customers = await stripe.customers.list({
        email: club.owner_email,
        limit: 1
      });

      if (customers.data.length === 0) {
        return res.json({ 
          success: true, 
          hasActiveSubscription: false,
          trialStatus: club.trial_status,
          trialEnd: club.trial_end,
          trialStart: club.trial_start,
          searchedEmail: club.owner_email
        });
      }

      const customer = customers.data[0];
      
      // Check for active or trialing subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 5
      });

      // Find the base plan subscription (not Universal Access) and get plan details
      let hasActiveSubscription = false;
      let planId: string | null = null;
      
      for (const sub of subscriptions.data) {
        if (sub.status !== 'active' && sub.status !== 'trialing') continue;
        
        const item = sub.items.data[0];
        if (!item) continue;
        
        const priceId = item.price.id;
        // Fetch the price with product expanded (only 1 level deep)
        const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
        const product = typeof price.product === 'object' ? price.product as any : null;
        const productName = product?.name || '';
        
        // Skip Universal Access subscriptions
        if (productName.toLowerCase().includes('universal access')) continue;
        if (price.metadata?.type === 'universal_access') continue;
        
        // Found a base plan subscription
        hasActiveSubscription = true;
        
        // Try to get plan from price metadata first
        planId = price.metadata?.planId || price.metadata?.tier || null;
        // Fallback to product name
        if (!planId && productName) {
          const pName = productName.toLowerCase();
          if (pName.includes('starter')) planId = 'starter';
          else if (pName.includes('pro')) planId = 'pro';
          else if (pName.includes('standard')) planId = 'standard';
          else if (pName.includes('growth')) planId = 'growth';
          else if (pName.includes('empire')) planId = 'empire';
          else planId = pName;
        }
        break; // Found the base plan, stop looking
      }

      if (hasActiveSubscription && club.trial_status !== 'converted') {
        // Update database to mark as converted
        await db.execute(sql`
          UPDATE clubs 
          SET trial_status = 'converted',
              updated_at = NOW()
          WHERE id = ${clubId}::uuid
        `);
        console.log('[VerifySubscription] Updated club', clubId, 'to converted status');
      }

      return res.json({
        success: true,
        hasActiveSubscription,
        trialStatus: hasActiveSubscription ? 'converted' : club.trial_status,
        trialEnd: club.trial_end,
        trialStart: club.trial_start,
        planId: planId,
        customerId: customer.id,
        searchedEmail: club.owner_email
      });

    } catch (error: any) {
      console.error('[VerifySubscription] Error:', error.message);
      return res.status(500).json({ error: 'Failed to verify subscription' });
    }
  });

  // DojoMint Universal Access - metered per-student billing toggle
  // METERED BILLING: Uses usage records instead of quantity-based billing
  app.post('/api/club/:clubId/universal-access', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { enabled, studentCount } = req.body;
      
      const stripe = await getUncachableStripeClient();
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      
      // Get club email
      const clubResult = await db.execute(sql`
        SELECT owner_email FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];
      if (!club) return res.status(404).json({ error: 'Club not found' });
      
      const customers = await stripe.customers.list({ email: club.owner_email.toLowerCase().trim(), limit: 1 });
      if (customers.data.length === 0) {
        return res.status(400).json({ error: 'No Stripe customer found. Please subscribe first.' });
      }
      const customerId = customers.data[0].id;
      
      // Use the specific metered UA price ID
      const UA_PRICE_ID = 'price_1Sp5trRhYhunDn2jrTOtUvyR';
      
      // Find existing UA subscription (separate from base plan) - only active ones
      const allSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
      let uaSubscription = allSubs.data.find(sub => 
        sub.status !== 'canceled' &&
        sub.items.data.some(item => {
          const price = typeof item.price === 'object' ? item.price : null;
          return price && price.id === UA_PRICE_ID;
        })
      );
      
      if (enabled) {
        const quantity = Math.max(1, studentCount || 1);
        
        if (uaSubscription) {
          // For metered billing, report usage instead of updating quantity
          const uaItem = uaSubscription.items.data.find(item => {
            const price = typeof item.price === 'object' ? item.price : null;
            return price && price.id === UA_PRICE_ID;
          });
          if (uaItem) {
            // Report current student count as usage (set action replaces previous usage)
            await stripe.subscriptionItems.createUsageRecord(uaItem.id, {
              quantity,
              action: 'set',
              timestamp: Math.floor(Date.now() / 1000)
            });
          }
        } else {
          // Create new metered subscription for Universal Access
          uaSubscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: UA_PRICE_ID }],
            metadata: { type: 'universal_access', clubId }
          });
          // Report initial usage
          const uaItem = uaSubscription.items.data[0];
          await stripe.subscriptionItems.createUsageRecord(uaItem.id, {
            quantity,
            action: 'set',
            timestamp: Math.floor(Date.now() / 1000)
          });
        }
        return res.json({ success: true, enabled: true, quantity, subscriptionId: uaSubscription.id });
      } else {
        // Cancel UA subscription if it exists
        if (uaSubscription) {
          await stripe.subscriptions.cancel(uaSubscription.id);
        }
        return res.json({ success: true, enabled: false });
      }
    } catch (error: any) {
      console.error('[UniversalAccess] Error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  });

  // DojoMint Universal Access - sync student count (metered billing)
  // Reports usage instead of updating subscription quantity
  app.post('/api/club/:clubId/universal-access/sync', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { studentCount } = req.body;
      
      const stripe = await getUncachableStripeClient();
      if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
      
      const clubResult = await db.execute(sql`
        SELECT owner_email FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];
      if (!club) return res.status(404).json({ error: 'Club not found' });
      
      const customers = await stripe.customers.list({ email: club.owner_email.toLowerCase().trim(), limit: 1 });
      if (customers.data.length === 0) {
        return res.json({ success: false, message: 'No Stripe customer' });
      }
      
      // Use specific UA price ID for metered billing
      const UA_PRICE_ID = 'price_1Sp5trRhYhunDn2jrTOtUvyR';
      
      // Find UA subscription by price ID
      const allSubs = await stripe.subscriptions.list({ customer: customers.data[0].id, limit: 10 });
      let uaItem = null;
      
      for (const sub of allSubs.data) {
        if (sub.status === 'canceled') continue;
        for (const item of sub.items.data) {
          const price = typeof item.price === 'object' ? item.price : null;
          if (price && price.id === UA_PRICE_ID) {
            uaItem = item;
            break;
          }
        }
        if (uaItem) break;
      }
      
      if (!uaItem) {
        return res.json({ success: false, message: 'Universal Access not enabled' });
      }
      
      const quantity = Math.max(1, studentCount || 1);
      // Report usage for metered billing
      await stripe.subscriptionItems.createUsageRecord(uaItem.id, {
        quantity,
        action: 'set',
        timestamp: Math.floor(Date.now() / 1000)
      });
      
      return res.json({ success: true, quantity });
    } catch (error: any) {
      console.error('[UniversalAccessSync] Error:', error.message);
      return res.status(500).json({ error: error.message });
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
        // First check if wizard was actually completed via onboarding_progress
        const progressCheck = await db.execute(
          sql`SELECT wizard_completed FROM onboarding_progress WHERE club_id = ${user.club_id}::uuid LIMIT 1`
        );
        const progressData = (progressCheck as any[])[0];
        wizardCompleted = progressData?.wizard_completed === true;
        
        // Fetch wizard_data from clubs table
        const clubDataResult = await db.execute(
          sql`SELECT wizard_data FROM clubs WHERE id = ${user.club_id}::uuid LIMIT 1`
        );
        const clubData = (clubDataResult as any[])[0];
        if (clubData?.wizard_data && Object.keys(clubData.wizard_data).length > 0) {
          wizardData = { ...clubData.wizard_data };
          
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
          // Preserve extra fields from saved wizard_data (performanceHistory, isDemo, etc.)
          const savedStudents = wizardData.students || [];
          wizardData.students = (studentsResult as any[]).map(s => {
            // Find matching saved student to preserve extra fields
            const saved = savedStudents.find((ws: any) => 
              ws.id === s.id || ws.name === s.name
            ) || {};
            return {
              id: s.id,
              name: s.name,
              clubId: user.club_id,
              parentEmail: s.parent_email,
              parentName: s.parent_name,
              parentPhone: s.parent_phone,
              beltId: getBeltIdFromName(s.belt),
              birthday: s.birthdate?.toISOString?.()?.split('T')[0] || saved.birthday || null,
              totalXP: s.total_xp || 0,
              totalPoints: s.total_points || saved.totalPoints || 0,
              lifetimeXp: s.total_xp || saved.lifetimeXp || 0,
              globalXp: saved.globalXp || 0,
              currentStreak: saved.currentStreak || 0,
              stripes: s.stripes || 0,
              stripeCount: s.stripes || 0,
              performanceHistory: saved.performanceHistory || [],
              attendanceCount: saved.attendanceCount || 0,
              joinDate: saved.joinDate || new Date().toISOString(),
              premiumStatus: saved.premiumStatus || 'none',
              isDemo: saved.isDemo || false,
              homeDojo: saved.homeDojo || { character: [], chores: [], school: [], health: [] }
            };
          });
          
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
        
        // Log wizard completion status for debugging
        console.log('[Login] Club wizard status:', { 
          hasWizardData: !!wizardData, 
          wizardCompleted, 
          clubId: user.club_id 
        });
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
        // Only return wizardData if wizard is completed - prevents frontend from caching demo data after logout
        wizardData: wizardCompleted ? wizardData : null
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

      // Check if club has already used their trial
      let skipTrial = false;
      let stripeCustomerId: string | undefined;
      
      if (clubId) {
        const clubResult = await db.execute(
          sql`SELECT trial_status, stripe_customer_id FROM clubs WHERE id = ${clubId}::uuid`
        );
        const club = (clubResult as any[])[0];
        
        if (club) {
          // Skip trial if they have ANY trial status (active, expired, or converted)
          // This prevents getting multiple trial periods
          if (club.trial_status) {
            skipTrial = true;
            console.log(`[/api/checkout] Club ${clubId} has trial_status: ${club.trial_status}, skipping Stripe trial`);
          }
          // Use existing Stripe customer if available
          if (club.stripe_customer_id) {
            stripeCustomerId = club.stripe_customer_id as string;
          }
        }
      }

      // Use APP_URL for production, fallback to Replit domain or request host
      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

      // Create or find Stripe customer to LOCK the email (prevents users from changing email during checkout)
      const stripe = await getUncachableStripeClient();
      if (!stripeCustomerId && email) {
        const emailLower = email.toLowerCase().trim();
        const existingCustomers = await stripe.customers.list({ email: emailLower, limit: 1 });
        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id;
          console.log(`[/api/checkout] Found existing Stripe customer: ${stripeCustomerId}`);
        } else {
          const newCustomer = await stripe.customers.create({
            email: emailLower,
            metadata: { clubId: clubId || '' }
          });
          stripeCustomerId = newCustomer.id;
          console.log(`[/api/checkout] Created new Stripe customer: ${stripeCustomerId}`);
        }
      }

      console.log(`[/api/checkout] Creating session with:`, { priceId, baseUrl, skipTrial, customerId: stripeCustomerId });

      const session = await stripeService.createCheckoutSession(
        priceId,
        `${baseUrl}/wizard?subscription=success`,
        `${baseUrl}/pricing?subscription=cancelled`,
        stripeCustomerId,
        { clubId: clubId || '', email: email || '' },
        skipTrial
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

  // Parent Premium Checkout ($4.99/month) with 70/30 revenue split
  app.post('/api/parent-premium/checkout', async (req: Request, res: Response) => {
    try {
      const { studentId, parentEmail, clubId } = req.body;

      if (!studentId || !parentEmail) {
        return res.status(400).json({ error: 'studentId and parentEmail are required' });
      }

      const { STRIPE_PRICE_IDS } = await import('./stripeConfig.js');
      const priceId = STRIPE_PRICE_IDS.parentPremium.monthly;

      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

      const stripe = await getUncachableStripeClient();
      
      // Find or create customer
      const emailLower = parentEmail.toLowerCase().trim();
      let customerId: string | undefined;
      const existingCustomers = await stripe.customers.list({ email: emailLower, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: emailLower,
          metadata: { studentId, clubId: clubId || '', type: 'parent_premium' }
        });
        customerId = newCustomer.id;
      }

      // Revenue Split: 70% of NET to Club, 30% + fees to Platform
      // Gross: $4.99 (499 cents), Est. Fee: $0.30 (30 cents), Net: 469 cents
      // Club share: 469 * 0.70 = 328 cents ($3.28)
      const CLUB_SHARE_CENTS = 328;

      // Get club's Stripe Connect account
      let stripeConnectAccountId: string | null = null;
      if (clubId) {
        const clubResult = await db.execute(
          sql`SELECT stripe_connect_account_id FROM clubs WHERE id = ${clubId}::uuid`
        );
        const club = (clubResult as any[])[0];
        if (club?.stripe_connect_account_id) {
          stripeConnectAccountId = club.stripe_connect_account_id;
        }
      }

      const sessionConfig: any = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${baseUrl}/app/parent?premium=success&student_id=${studentId}`,
        cancel_url: `${baseUrl}/app/parent?premium=cancelled`,
        metadata: {
          studentId,
          clubId: clubId || '',
          type: 'parent_premium'
        },
        subscription_data: {
          metadata: {
            studentId,
            clubId: clubId || '',
            type: 'parent_premium'
          },
          // Add transfer on each subscription payment
          // Fixed amount = 70% of NET ($4.99 - $0.30 fee = $4.69 * 0.70 = $3.28)
          ...(stripeConnectAccountId && {
            transfer_data: {
              destination: stripeConnectAccountId,
              amount: 328, // Fixed $3.28 (70% of net after fees)
            }
          })
        }
      };

      const session = await stripe.checkout.sessions.create(sessionConfig);

      console.log(`[Parent Premium] Created checkout for student ${studentId}, session: ${session.id}, club transfer: ${stripeConnectAccountId ? 'yes (70%)' : 'no connected account'}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Parent Premium] Checkout error:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
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
        sql`SELECT id, email, name, club_id FROM users WHERE email = ${email} AND is_active = true LIMIT 1`
      );
      
      const user = (userResult as any[])[0];
      
      if (!user) {
        return res.json({ 
          success: true, 
          message: 'If an account exists with this email, a password reset link has been sent.' 
        });
      }

      let clubLanguage = 'English';
      if (user.club_id) {
        const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${user.club_id}::uuid LIMIT 1`);
        const clubLangData = (clubLangResult as any[])[0];
        clubLanguage = (clubLangData?.wizard_data as any)?.language || 'English';
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
        resetToken: resetToken,
        language: clubLanguage
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
      const { totalPoints, lifetimeXp, sessionXp, sessionPts } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      // Use sessionXp to INCREMENT total_xp (single source of truth)
      const xpEarned = sessionXp || 0;
      
      await db.execute(sql`
        UPDATE students SET 
          total_points = COALESCE(${totalPoints}, total_points),
          total_xp = COALESCE(total_xp, 0) + ${xpEarned},
          last_class_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `);

      // Log XP transaction for monthly leaderboard tracking
      if (xpEarned > 0) {
        await db.execute(sql`
          INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
          VALUES (${id}::uuid, ${xpEarned}, 'EARN', 'Class grading', NOW())
        `);
        console.log('[Grading] Logged XP transaction:', id, '+', xpEarned, 'XP');
      }

      // Log PTS transaction for monthly effort widget tracking
      const ptsEarned = sessionPts || 0;
      if (ptsEarned > 0) {
        await db.execute(sql`
          INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
          VALUES (${id}::uuid, ${ptsEarned}, 'PTS_EARN', 'Class grading PTS', NOW())
        `);
        console.log('[Grading] Logged PTS transaction:', id, '+', ptsEarned, 'PTS');
      }

      console.log('[Grading] Updated student:', id, 'totalPoints:', totalPoints, 'total_xp:', lifetimeXp);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Grading] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update student grading data' });
    }
  });

  // GET /api/students/:id/stats - Comprehensive stats for Insights tab
  app.get('/api/students/:id/stats', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      // 1. Attendance history for heatmap (last 90 days)
      const attendanceResult = await db.execute(sql`
        SELECT DATE(attended_at) as date, COUNT(*) as count
        FROM attendance_events 
        WHERE student_id = ${id}::uuid
          AND attended_at >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(attended_at)
        ORDER BY date ASC
      `);

      // 2. XP history by day (last 30 days) from challenge submissions
      const xpHistoryResult = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          SUM(COALESCE(xp_awarded, 0)) as xp
        FROM challenge_videos 
        WHERE student_id = ${id}::uuid
          AND status = 'approved'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // 3. Gauntlet XP history (Daily Training) - uses submitted_at and local_xp_awarded
      const gauntletXpResult = await db.execute(sql`
        SELECT 
          DATE(gs.submitted_at) as date,
          SUM(COALESCE(gs.local_xp_awarded, 0)) as xp
        FROM gauntlet_submissions gs
        WHERE gs.student_id = ${id}::uuid
          AND gs.submitted_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(gs.submitted_at)
        ORDER BY date ASC
      `);

      // 4. Challenge category breakdown for Character Development
      const categoryResult = await db.execute(sql`
        SELECT 
          COALESCE(challenge_category, 'General') as category,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          SUM(COALESCE(xp_awarded, 0)) as xp_earned
        FROM challenge_videos
        WHERE student_id = ${id}::uuid
          AND created_at >= NOW() - INTERVAL '90 days'
        GROUP BY COALESCE(challenge_category, 'General')
      `);

      // 5. Video approval stats for Discipline metric
      const videoStatsResult = await db.execute(sql`
        SELECT 
          COUNT(*) as total_videos,
          COUNT(*) FILTER (WHERE status = 'approved') as approved_videos,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected_videos
        FROM challenge_videos
        WHERE student_id = ${id}::uuid
          AND created_at >= NOW() - INTERVAL '90 days'
      `);

      // 6. Training consistency (submissions per week)
      const consistencyResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('week', created_at) as week,
          COUNT(*) as submissions
        FROM challenge_videos
        WHERE student_id = ${id}::uuid
          AND created_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week ASC
      `);

      // Merge XP histories (Coach Picks + Gauntlet)
      const xpByDate = new Map<string, number>();
      for (const row of xpHistoryResult as any[]) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        xpByDate.set(dateStr, (xpByDate.get(dateStr) || 0) + parseInt(row.xp || '0'));
      }
      for (const row of gauntletXpResult as any[]) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        xpByDate.set(dateStr, (xpByDate.get(dateStr) || 0) + parseInt(row.xp || '0'));
      }

      // Build XP trend array (last 14 days)
      const xpTrend = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        xpTrend.push({
          date: dateStr,
          xp: xpByDate.get(dateStr) || 0,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' })
        });
      }

      // Parse attendance into date array
      const attendanceDates = (attendanceResult as any[]).map(row => 
        new Date(row.date).toISOString().split('T')[0]
      );

      // Calculate character development metrics from real data
      const videoStats = (videoStatsResult as any[])[0] || { total_videos: 0, approved_videos: 0, rejected_videos: 0 };
      const categories = categoryResult as any[];
      const weeklyActivity = consistencyResult as any[];

      // Derive meaningful metrics
      const totalSubmissions = parseInt(videoStats.total_videos || '0');
      const approvedSubmissions = parseInt(videoStats.approved_videos || '0');
      const approvalRate = totalSubmissions > 0 ? Math.round((approvedSubmissions / totalSubmissions) * 100) : 0;

      // Find tech vs fitness balance
      const techCategories = ['Technique', 'Power', 'Flexibility'];
      let techXp = 0, fitnessXp = 0;
      for (const cat of categories) {
        const xp = parseInt(cat.xp_earned || '0');
        if (techCategories.includes(cat.category)) {
          techXp += xp;
        } else {
          fitnessXp += xp;
        }
      }
      const totalCatXp = techXp + fitnessXp;
      const techFocus = totalCatXp > 0 ? Math.round((techXp / totalCatXp) * 100) : 50;

      // Weekly consistency score
      const weeksActive = weeklyActivity.filter(w => parseInt(w.submissions) > 0).length;
      const totalWeeks = Math.min(8, weeklyActivity.length || 1);
      const consistencyScore = Math.round((weeksActive / totalWeeks) * 100);

      // Character development derived metrics
      const characterDevelopment = {
        technique: {
          name: 'Technique Focus',
          score: techFocus,
          trend: techFocus >= 50 ? 'up' : 'steady',
          description: techFocus >= 60 ? 'Strong technical training' : techFocus >= 40 ? 'Balanced approach' : 'More fitness-focused'
        },
        discipline: {
          name: 'Discipline',
          score: approvalRate,
          trend: approvalRate >= 80 ? 'up' : approvalRate >= 50 ? 'steady' : 'down',
          description: approvalRate >= 80 ? 'Excellent quality submissions' : approvalRate >= 50 ? 'Good effort' : 'Room for improvement'
        },
        consistency: {
          name: 'Consistency',
          score: consistencyScore,
          trend: consistencyScore >= 75 ? 'up' : consistencyScore >= 50 ? 'steady' : 'down',
          description: consistencyScore >= 75 ? 'Training regularly' : consistencyScore >= 50 ? 'Fairly consistent' : 'Could train more often'
        }
      };

      res.json({
        attendanceDates,
        xpTrend,
        characterDevelopment,
        categoryBreakdown: categories.map(c => ({
          category: c.category,
          submissions: parseInt(c.total || '0'),
          approved: parseInt(c.approved || '0'),
          xpEarned: parseInt(c.xp_earned || '0')
        })),
        totalSubmissions,
        approvalRate
      });
    } catch (error: any) {
      console.error('[Student Stats] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch student stats' });
    }
  });

  app.post('/api/students', async (req: Request, res: Response) => {
    try {
      const { clubId, name, parentEmail, parentName, parentPhone, belt, birthdate, totalPoints, totalXP, lifetimeXp, location, assignedClass } = req.body;
      
      if (!clubId || !name) {
        return res.status(400).json({ error: 'Club ID and student name are required' });
      }

      const clubResult = await db.execute(
        sql`SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE id = ${clubId}::uuid`
      );
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const clubLanguage = (club?.wizard_data as any)?.language || 'English';

      const currentYear = new Date().getFullYear();
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const mytaekId = `MTK-${currentYear}-${randomCode}`;
      
      const studentResult = await db.execute(sql`
        INSERT INTO students (club_id, mytaek_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, total_xp, location, assigned_class, created_at)
        VALUES (${clubId}::uuid, ${mytaekId}, ${name}, ${parentEmail || null}, ${parentName || null}, ${parentPhone || null}, ${belt || 'White'}, ${birthdate ? birthdate + 'T00:00:00Z' : null}::timestamptz, ${totalPoints || 0}, ${totalXP || lifetimeXp || 0}, ${location || null}, ${assignedClass || null}, NOW())
        RETURNING id, mytaek_id, name, parent_email, parent_name, belt, total_points, total_xp
      `);
      
      const student = (studentResult as any[])[0];

      const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

      const notifyEmailResult = await emailService.sendNewStudentAddedEmail(club.owner_email, {
        studentName: name,
        clubName: club.name,
        beltLevel: belt || 'White',
        studentAge: age ? `${age} years old` : 'Not specified',
        parentName: parentName || 'Not specified',
        studentId: student.id,
        language: clubLanguage
      });

      if (notifyEmailResult.success) {
        console.log('[New Student] Notification email sent to club owner:', club.owner_email);
      }

      let welcomeEmailResult = { success: false, skipped: false, reason: 'No parent email' };
      if (parentEmail) {
        welcomeEmailResult = await emailAutomation.sendParentWelcomeEmailAuto(
          clubId,
          student.id,
          parentEmail,
          parentName || 'Parent',
          name,
          club.name
        );
        console.log('[Add Student] Welcome email result:', welcomeEmailResult);
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('student_added', 'New Student Added', ${'New student added: ' + name}, ${clubId}::uuid, ${JSON.stringify({ studentId: student.id, studentName: name, parentEmail })}::jsonb, NOW())
      `);

      res.status(201).json({
        success: true,
        student: {
          id: student.id,
          mytaekId: student.mytaek_id,
          name: student.name,
          parentEmail: student.parent_email,
          parentName: student.parent_name,
          belt: student.belt
        },
        welcomeEmail: welcomeEmailResult
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

  // =============================================
  // STUDENT TRANSFER SYSTEM (MyTaek Federation)
  // =============================================

  // Global student lookup by MyTaek ID - returns public profile for transfer
  app.get('/api/students/lookup/:mytaekId', async (req: Request, res: Response) => {
    try {
      const { mytaekId } = req.params;
      
      if (!mytaekId || !mytaekId.startsWith('MTK-')) {
        return res.status(400).json({ error: 'Invalid MyTaek ID format' });
      }

      const result = await db.execute(sql`
        SELECT 
          s.id, s.mytaek_id, s.name, s.belt, s.total_xp, s.global_xp, s.join_date, s.birthdate,
          c.id as club_id, c.name as club_name, c.country, c.city, c.art_type
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE s.mytaek_id = ${mytaekId}
        LIMIT 1
      `);

      if ((result as any[]).length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = (result as any[])[0];
      
      // Get promotion history for verified belt progression
      const promotionsResult = await db.execute(sql`
        SELECT from_belt, to_belt, promotion_date, total_xp, classes_attended
        FROM promotions
        WHERE student_id = ${student.id}::uuid
        ORDER BY promotion_date DESC
      `);

      res.json({
        mytaekId: student.mytaek_id,
        name: student.name,
        currentBelt: student.belt,
        totalXp: student.total_xp || 0,
        globalXp: student.global_xp || 0,
        joinDate: student.join_date,
        currentClub: {
          id: student.club_id,
          name: student.club_name,
          country: student.country,
          city: student.city,
          artType: student.art_type
        },
        promotionHistory: (promotionsResult as any[]).map(p => ({
          fromBelt: p.from_belt,
          toBelt: p.to_belt,
          date: p.promotion_date,
          xpAtPromotion: p.total_xp,
          classesAttended: p.classes_attended
        }))
      });
    } catch (error: any) {
      console.error('[Student Lookup] Error:', error.message);
      res.status(500).json({ error: 'Failed to lookup student' });
    }
  });

  // Request a student transfer to your club
  app.post('/api/transfers', async (req: Request, res: Response) => {
    try {
      const { mytaekId, toClubId, notes } = req.body;
      
      if (!mytaekId || !toClubId) {
        return res.status(400).json({ error: 'MyTaek ID and destination club are required' });
      }

      // Find the student
      const studentResult = await db.execute(sql`
        SELECT id, club_id, name, belt, total_xp FROM students WHERE mytaek_id = ${mytaekId}
      `);

      if ((studentResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = (studentResult as any[])[0];

      // Cannot transfer to the same club
      if (student.club_id === toClubId) {
        return res.status(400).json({ error: 'Student is already at this club' });
      }

      // Check for existing pending transfer
      const existingTransfer = await db.execute(sql`
        SELECT id FROM student_transfers 
        WHERE student_id = ${student.id}::uuid AND status = 'pending'
      `);

      if ((existingTransfer as any[]).length > 0) {
        return res.status(400).json({ error: 'A transfer request is already pending for this student' });
      }

      // Create transfer request
      const transferResult = await db.execute(sql`
        INSERT INTO student_transfers (student_id, from_club_id, to_club_id, notes, belt_at_transfer, xp_at_transfer)
        VALUES (${student.id}::uuid, ${student.club_id}::uuid, ${toClubId}::uuid, ${notes || null}, ${student.belt}, ${student.total_xp || 0})
        RETURNING id, status, requested_at
      `);

      const transfer = (transferResult as any[])[0];

      res.status(201).json({
        success: true,
        transfer: {
          id: transfer.id,
          studentName: student.name,
          status: transfer.status,
          requestedAt: transfer.requested_at
        }
      });
    } catch (error: any) {
      console.error('[Create Transfer] Error:', error.message);
      res.status(500).json({ error: 'Failed to create transfer request' });
    }
  });

  // Get transfer requests for a club (both incoming and outgoing)
  app.get('/api/club/:clubId/transfers', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { type } = req.query; // 'incoming', 'outgoing', or 'all'

      let whereClause = '';
      if (type === 'incoming') {
        whereClause = `t.to_club_id = '${clubId}'::uuid`;
      } else if (type === 'outgoing') {
        whereClause = `t.from_club_id = '${clubId}'::uuid`;
      } else {
        whereClause = `(t.to_club_id = '${clubId}'::uuid OR t.from_club_id = '${clubId}'::uuid)`;
      }

      const result = await db.execute(sql`
        SELECT 
          t.id, t.status, t.requested_at, t.responded_at, t.transferred_at, t.notes,
          t.belt_at_transfer, t.xp_at_transfer,
          s.id as student_id, s.mytaek_id, s.name as student_name, s.belt as current_belt,
          fc.id as from_club_id, fc.name as from_club_name,
          tc.id as to_club_id, tc.name as to_club_name
        FROM student_transfers t
        JOIN students s ON t.student_id = s.id
        LEFT JOIN clubs fc ON t.from_club_id = fc.id
        JOIN clubs tc ON t.to_club_id = tc.id
        WHERE (t.to_club_id = ${clubId}::uuid OR t.from_club_id = ${clubId}::uuid)
        ORDER BY t.requested_at DESC
      `);

      res.json({
        transfers: (result as any[]).map(t => ({
          id: t.id,
          status: t.status,
          requestedAt: t.requested_at,
          respondedAt: t.responded_at,
          transferredAt: t.transferred_at,
          notes: t.notes,
          beltAtTransfer: t.belt_at_transfer,
          xpAtTransfer: t.xp_at_transfer,
          student: {
            id: t.student_id,
            mytaekId: t.mytaek_id,
            name: t.student_name,
            currentBelt: t.current_belt
          },
          fromClub: t.from_club_id ? { id: t.from_club_id, name: t.from_club_name } : null,
          toClub: { id: t.to_club_id, name: t.to_club_name },
          direction: t.to_club_id === clubId ? 'incoming' : 'outgoing'
        }))
      });
    } catch (error: any) {
      console.error('[Get Transfers] Error:', error.message);
      res.status(500).json({ error: 'Failed to get transfers' });
    }
  });

  // Approve or reject a transfer request
  app.patch('/api/transfers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { action, clubId } = req.body; // action: 'approve' or 'reject'

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be approve or reject' });
      }

      // Get the transfer request
      const transferResult = await db.execute(sql`
        SELECT t.*, s.name as student_name, s.belt, s.total_xp
        FROM student_transfers t
        JOIN students s ON t.student_id = s.id
        WHERE t.id = ${id}::uuid AND t.status = 'pending'
      `);

      if ((transferResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Transfer request not found or already processed' });
      }

      const transfer = (transferResult as any[])[0];

      // Verify the club making the action is the source club (they must approve the release)
      if (transfer.from_club_id !== clubId) {
        return res.status(403).json({ error: 'Only the current club can approve or reject transfers' });
      }

      if (action === 'approve') {
        // Update transfer status and move the student
        await db.execute(sql`
          UPDATE student_transfers 
          SET status = 'approved', responded_at = NOW(), transferred_at = NOW()
          WHERE id = ${id}::uuid
        `);

        // Move student to new club
        await db.execute(sql`
          UPDATE students 
          SET club_id = ${transfer.to_club_id}::uuid, updated_at = NOW()
          WHERE id = ${transfer.student_id}::uuid
        `);

        res.json({
          success: true,
          message: `${transfer.student_name} has been transferred successfully`,
          status: 'approved'
        });
      } else {
        // Reject the transfer
        await db.execute(sql`
          UPDATE student_transfers 
          SET status = 'rejected', responded_at = NOW()
          WHERE id = ${id}::uuid
        `);

        res.json({
          success: true,
          message: 'Transfer request rejected',
          status: 'rejected'
        });
      }
    } catch (error: any) {
      console.error('[Update Transfer] Error:', error.message);
      res.status(500).json({ error: 'Failed to update transfer' });
    }
  });

  app.post('/api/invite-coach', async (req: Request, res: Response) => {
    try {
      const { clubId, name, email, location, assignedClasses } = req.body;
      
      if (!clubId || !name || !email) {
        return res.status(400).json({ error: 'Club ID, coach name, and email are required' });
      }

      const clubResult = await db.execute(sql`
        SELECT id, name, owner_email, wizard_data FROM clubs WHERE id = ${clubId}::uuid
      `);
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const clubLanguage = (club?.wizard_data as any)?.language || 'English';

      const tempPassword = '1234';
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
        ownerName: club.name,
        language: clubLanguage
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

  // Update coach
  app.patch('/api/coaches/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, location, assignedClasses } = req.body;

      // Ensure assignedClasses is a valid array
      const classesArray = Array.isArray(assignedClasses) ? assignedClasses : [];

      const result = await db.execute(sql`
        UPDATE coaches SET 
          name = COALESCE(${name || null}, name),
          email = COALESCE(${email || null}, email),
          location = ${location || null},
          assigned_classes = ${classesArray}::text[],
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING id, name, email, location, assigned_classes
      `);

      if ((result as any[]).length === 0) {
        return res.status(404).json({ error: 'Coach not found' });
      }

      const coach = (result as any[])[0];
      console.log('[UpdateCoach] Updated coach:', id);
      res.json({
        success: true,
        coach: {
          id: coach.id,
          name: coach.name,
          email: coach.email,
          location: coach.location || '',
          assignedClasses: coach.assigned_classes || []
        }
      });
    } catch (error: any) {
      console.error('[UpdateCoach] Error:', error.message);
      res.status(500).json({ error: 'Failed to update coach' });
    }
  });

  // Delete coach (soft delete)
  app.delete('/api/coaches/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await db.execute(sql`
        UPDATE coaches SET is_active = false, updated_at = NOW() 
        WHERE id = ${id}::uuid 
        RETURNING id, email
      `);

      if ((result as any[]).length === 0) {
        return res.status(404).json({ error: 'Coach not found' });
      }

      const coachEmail = (result as any[])[0].email;
      if (coachEmail) {
        await db.execute(sql`
          UPDATE users SET is_active = false, updated_at = NOW() WHERE email = ${coachEmail}
        `);
      }

      console.log('[DeleteCoach] Deleted coach:', id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[DeleteCoach] Error:', error.message);
      res.status(500).json({ error: 'Failed to delete coach' });
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
        SELECT s.id, s.name, s.parent_email, c.id as club_id, c.name as club_name, c.wizard_data as club_wizard_data 
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

  // Sync curriculum content to database (called when publishing)
  app.post('/api/content/sync', async (req: Request, res: Response) => {
    try {
      const { clubId, content } = req.body;
      console.log('[Content Sync] Received:', { clubId, contentTitle: content?.title });
      
      if (!clubId || !content) {
        return res.status(400).json({ error: 'Club ID and content are required' });
      }

      const { id, title, url, beltId, contentType, status, pricingType, xpReward, description, requiresVideo, videoAccess, maxPerWeek, category } = content;
      
      // Convert comma-separated tags to JSON array for database
      const tagsArray = category ? category.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
      
      // Check if ID is a valid UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidUuid = uuidRegex.test(id);
      
      // Check if content already exists by title+url (for non-UUID IDs) or by UUID
      let existingId = null;
      if (isValidUuid) {
        const existing = await db.execute(sql`
          SELECT id FROM curriculum_content WHERE id = ${id}::uuid LIMIT 1
        `);
        if ((existing as any[]).length > 0) {
          existingId = (existing as any[])[0].id;
        }
      } else {
        // Try to find by title+url match for the same club
        const existing = await db.execute(sql`
          SELECT id FROM curriculum_content WHERE club_id = ${clubId}::uuid AND title = ${title} AND url = ${url} LIMIT 1
        `);
        if ((existing as any[]).length > 0) {
          existingId = (existing as any[])[0].id;
        }
      }

      if (existingId) {
        // Update existing content
        await db.execute(sql`
          UPDATE curriculum_content 
          SET title = ${title}, url = ${url}, belt_id = ${beltId || 'all'}, 
              content_type = ${contentType || 'video'}, status = ${status || 'draft'},
              pricing_type = ${pricingType || 'free'}, xp_reward = ${xpReward || 10},
              description = ${description || null}, 
              tags = ${JSON.stringify(tagsArray)}::jsonb,
              requires_video = ${requiresVideo || false},
              video_access = ${videoAccess || 'premium'},
              max_per_week = ${maxPerWeek || null},
              updated_at = NOW()
          WHERE id = ${existingId}::uuid
        `);
        return res.json({ success: true, action: 'updated', contentId: existingId });
      }

      // Insert new content (let DB generate UUID)
      const result = await db.execute(sql`
        INSERT INTO curriculum_content (club_id, title, url, belt_id, content_type, status, pricing_type, xp_reward, description, tags, requires_video, video_access, max_per_week, created_at, updated_at)
        VALUES (
          ${clubId}::uuid, ${title}, ${url}, ${beltId || 'all'}, 
          ${contentType || 'video'}, ${status || 'draft'}, ${pricingType || 'free'}, 
          ${xpReward || 10}, ${description || null}, ${JSON.stringify(tagsArray)}::jsonb,
          ${requiresVideo || false}, ${videoAccess || 'premium'}, ${maxPerWeek || null},
          NOW(), NOW()
        )
        RETURNING id
      `);
      
      const newId = (result as any[])[0]?.id;
      res.json({ success: true, action: 'created', contentId: newId });
    } catch (error: any) {
      console.error('[Content Sync] Error:', error.message);
      res.status(500).json({ error: 'Failed to sync content' });
    }
  });

  // Content Analytics - Record content view/completion
  app.post('/api/content/view', async (req: Request, res: Response) => {
    try {
      const { contentId, studentId, completed, xpAwarded } = req.body;
      
      if (!contentId) {
        return res.status(400).json({ error: 'Content ID is required' });
      }

      // Check if content exists first
      const contentExists = await db.execute(sql`
        SELECT id FROM curriculum_content WHERE id = ${contentId}::uuid LIMIT 1
      `);
      if ((contentExists as any[]).length === 0) {
        return res.status(404).json({ error: 'Content not found' });
      }

      // Check if student exists (skip student tracking if not - demo mode)
      let validStudentId = null;
      if (studentId) {
        const studentExists = await db.execute(sql`
          SELECT id FROM students WHERE id = ${studentId}::uuid LIMIT 1
        `);
        if ((studentExists as any[]).length > 0) {
          validStudentId = studentId;
        }
      }

      // Check if view already exists for this content/student
      const existingView = await db.execute(sql`
        SELECT id, completed FROM content_views 
        WHERE content_id = ${contentId}::uuid 
        ${validStudentId ? sql`AND student_id = ${validStudentId}::uuid` : sql`AND student_id IS NULL`}
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
          
          // Award XP to student's total_xp (single source of truth)
          if (validStudentId && xpAwarded > 0) {
            await awardXP(validStudentId, xpAwarded, 'content', { contentId });
            
            // Insert into xp_transactions for persistence (like Daily Mystery)
            await db.execute(sql`
              INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
              VALUES (${validStudentId}::uuid, ${xpAwarded}, 'EARN', 'content_completion', NOW())
            `);
            
            // Award Global XP for World Rankings (1 point per 10 local XP)
            const globalXp = Math.max(1, Math.floor(xpAwarded / 10));
            await db.execute(sql`
              UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalXp} WHERE id = ${validStudentId}::uuid
            `);
            
            console.log(`[Content] XP awarded: ${xpAwarded} local, ${globalXp} global for student ${validStudentId}`);
          }
        }
        return res.json({ success: true, action: 'updated' });
      }

      // Create new view record
      await db.execute(sql`
        INSERT INTO content_views (content_id, student_id, completed, completed_at, xp_awarded, viewed_at)
        VALUES (
          ${contentId}::uuid, 
          ${validStudentId ? sql`${validStudentId}::uuid` : sql`NULL`}, 
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

      // Award XP to student's total_xp if completing (single source of truth)
      if (completed && validStudentId && xpAwarded > 0) {
        await awardXP(validStudentId, xpAwarded, 'content', { contentId });
        
        // Insert into xp_transactions for persistence (like Daily Mystery)
        await db.execute(sql`
          INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
          VALUES (${validStudentId}::uuid, ${xpAwarded}, 'EARN', 'content_completion', NOW())
        `);
        
        // Award Global XP for World Rankings (1 point per 10 local XP)
        const globalXp = Math.max(1, Math.floor(xpAwarded / 10));
        await db.execute(sql`
          UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalXp} WHERE id = ${validStudentId}::uuid
        `);
        
        console.log(`[Content] XP awarded: ${xpAwarded} local, ${globalXp} global for student ${validStudentId}`);
      }

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

  // Content Analytics - Get detailed completions (who completed what)
  app.get('/api/content/completions/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;

      const completions = await db.execute(sql`
        SELECT 
          cv.id as view_id,
          cv.content_id,
          cv.student_id,
          cv.completed,
          cv.completed_at,
          cv.xp_awarded,
          cv.viewed_at,
          cc.title as content_title,
          cc.content_type,
          cc.belt_id,
          s.name as student_name,
          s.belt as student_belt
        FROM content_views cv
        JOIN curriculum_content cc ON cv.content_id = cc.id
        LEFT JOIN students s ON cv.student_id = s.id
        WHERE cc.club_id = ${clubId}::uuid AND cv.completed = true
        ORDER BY cv.completed_at DESC
        LIMIT 100
      `);

      res.json({
        success: true,
        completions: (completions as any[]).map(c => ({
          viewId: c.view_id,
          contentId: c.content_id,
          contentTitle: c.content_title,
          contentType: c.content_type,
          beltId: c.belt_id,
          studentId: c.student_id,
          studentName: c.student_name || 'Unknown Student',
          studentBelt: c.student_belt,
          completedAt: c.completed_at,
          xpAwarded: c.xp_awarded
        }))
      });
    } catch (error: any) {
      console.error('[Content Completions] Error:', error.message);
      res.status(500).json({ error: 'Failed to get content completions' });
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
      const { studentId, challengeId, filename, contentType, isGauntlet, fileSize } = req.body;
      
      console.log('[Videos] Presigned upload request:', { studentId, challengeId, filename, contentType, isGauntlet, fileSize });
      
      if (!studentId || !challengeId || !filename) {
        return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      if (fileSize && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'Video file too large. Maximum size is 50MB. Use timelapse mode for long challenges!' });
      }

      // CHECK LIMITS BEFORE generating upload URL (prevents orphaned uploads)
      if (isGauntlet) {
        // Gauntlet: Check weekly limit using gauntlet_submissions table
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
        
        const existingSubmission = await db.execute(sql`
          SELECT id FROM gauntlet_submissions 
          WHERE challenge_id = ${challengeId}::uuid 
          AND student_id = ${studentId}::uuid 
          AND week_number = ${weekNumber}
        `);
        
        if ((existingSubmission as any[]).length > 0) {
          console.log('[Videos] Gauntlet weekly limit reached:', { studentId, challengeId, weekNumber });
          return res.status(429).json({
            error: 'Already completed',
            message: 'You already completed this challenge this week. Come back next week!',
            limitReached: true
          });
        }
      } else {
        // Arena: Check daily limit using challenge_videos table
        const existingVideoResult = await db.execute(sql`
          SELECT id FROM challenge_videos 
          WHERE student_id = ${studentId}::uuid AND challenge_id = ${challengeId}
          AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
        `);
        
        if ((existingVideoResult as any[]).length > 0) {
          console.log('[Videos] Arena daily limit reached:', { studentId, challengeId });
          return res.status(429).json({
            error: 'Already submitted',
            message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
            limitReached: true
          });
        }
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
      const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, videoHash, score } = req.body;
      
      console.log('[Videos] Save request:', { studentId, clubId, challengeId, challengeName, videoHash: videoHash?.substring(0, 8) });
      
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

      // Check if already submitted video for this challenge today
      // Compare both timestamps in UTC to avoid timezone mismatch
      const existingVideoResult = await db.execute(sql`
        SELECT id FROM challenge_videos 
        WHERE student_id = ${studentId}::uuid AND challenge_id = ${challengeId}
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
      `);
      
      if ((existingVideoResult as any[]).length > 0) {
        // Video already exists today - BLOCK duplicate submission
        console.log('[Videos] Duplicate submission blocked for student:', studentId, 'challenge:', challengeId);
        return res.status(429).json({
          error: 'Already submitted',
          message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
          alreadyCompleted: true
        });
      }

      // AI Pre-Screening: Check for duplicate video content using hash (fingerprint)
      let aiFlag = 'green';
      let aiFlagReason = '';
      
      if (videoHash) {
        const duplicateHashResult = await db.execute(sql`
          SELECT id, student_id, created_at FROM challenge_videos 
          WHERE video_hash = ${videoHash}
          AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1
        `);
        
        if ((duplicateHashResult as any[]).length > 0) {
          aiFlag = 'red';
          aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
          console.log(`[AI-Screen] RED FLAG: Duplicate video hash detected for student ${studentId}, hash: ${videoHash.substring(0, 8)}...`);
        }
      }

      // First submission today - INSERT new record with hash and AI flag
      console.log('[Videos] Inserting record:', { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl: videoUrl?.substring(0, 50), videoKey: videoKey?.substring(0, 30), videoHash: videoHash?.substring(0, 8), aiFlag });
      
      let result;
      try {
        result = await db.execute(sql`
          INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, ai_flag, ai_flag_reason, created_at, updated_at)
          VALUES (${studentId}::uuid, ${clubId}::uuid, ${challengeId}, ${challengeName || ''}, ${challengeCategory || ''}, ${videoUrl}, ${videoKey || ''}, ${videoHash || null}, ${score || 0}, 'pending', ${aiFlag}, ${aiFlagReason || null}, NOW(), NOW())
          RETURNING id
        `);
      } catch (insertErr: any) {
        console.error('[Videos] INSERT failed:', insertErr.message);
        throw insertErr;
      }
      const video = (result as any[])[0];
      console.log('[Videos] Insert successful, id:', video?.id);
      
      // Send email notification to coaches
      try {
        const studentResult = await db.execute(sql`SELECT name FROM students WHERE id = ${studentId}::uuid`);
        const clubResult = await db.execute(sql`
          SELECT c.name as club_name, c.wizard_data, co.email as coach_email, co.name as coach_name
          FROM clubs c
          LEFT JOIN coaches co ON co.club_id = c.id AND co.is_active = true
          WHERE c.id = ${clubId}::uuid
        `);
        
        const studentName = (studentResult as any[])[0]?.name || 'Student';
        const clubData = clubResult as any[];
        const videoClubLanguage = (clubData[0]?.wizard_data as any)?.language || 'English';
        
        for (const coach of clubData.filter(c => c.coach_email)) {
          emailService.sendVideoSubmittedNotification(coach.coach_email, {
            coachName: coach.coach_name || 'Coach',
            studentName,
            challengeName: challengeName || challengeId,
            clubName: coach.club_name || 'Your Club',
            language: videoClubLanguage
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

  // Video streaming proxy endpoint
  app.get('/api/videos/stream/*videoKey', async (req: Request, res: Response) => {
    try {
      const videoKeyParts = req.params.videoKey as unknown as string[];
      const videoKey = decodeURIComponent(videoKeyParts.join('/'));
      
      const result = await s3Storage.getObject(videoKey);
      if (!result || !result.Body) {
        return res.status(404).json({ error: 'Video not found' });
      }
      
      res.setHeader('Content-Type', result.ContentType || 'video/mp4');
      res.setHeader('Content-Length', result.ContentLength || 0);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      
      const stream = result.Body as NodeJS.ReadableStream;
      stream.pipe(res);
    } catch (error: any) {
      console.error('[Videos] Stream error:', error.message);
      res.status(500).json({ error: 'Failed to stream video' });
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

      // Convert to proxy URLs for video streaming
      const videosWithProxyUrls = (videos as any[]).map((video: any) => {
        let videoKey = video.video_key;
        // Extract key from URL if video_key is empty but video_url exists
        if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
          videoKey = video.video_url.split('idrivee2.com/')[1];
        }
        return {
          ...video,
          video_url: videoKey 
            ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
            : video.video_url
        };
      });

      res.json(videosWithProxyUrls);
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

      // Convert to proxy URLs for video streaming
      const videosWithProxyUrls = (videos as any[]).map((video: any) => {
        let videoKey = video.video_key;
        // Extract key from URL if video_key is empty but video_url exists
        if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
          videoKey = video.video_url.split('idrivee2.com/')[1];
        }
        return {
          ...video,
          video_url: videoKey 
            ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
            : video.video_url
        };
      });

      res.json(videosWithProxyUrls);
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
        
        // For Gauntlet (Daily Training) videos, also award Global XP
        // Get the challenge category to check if it's a Gauntlet submission
        const videoDetails = await db.execute(sql`
          SELECT challenge_category, challenge_id FROM challenge_videos WHERE id = ${videoId}::uuid
        `);
        const videoDetail = (videoDetails as any[])[0];
        
        if (videoDetail?.challenge_category === 'Daily Training') {
          // Get global points from gauntlet_submissions
          const gauntletSub = await db.execute(sql`
            SELECT global_points_awarded FROM gauntlet_submissions 
            WHERE challenge_id = ${videoDetail.challenge_id}::uuid 
            AND student_id = ${studentId}::uuid
            ORDER BY submitted_at DESC LIMIT 1
          `);
          const globalPoints = (gauntletSub as any[])[0]?.global_points_awarded || 15;
          
          // Award Global XP
          await db.execute(sql`
            UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalPoints}
            WHERE id = ${studentId}::uuid
          `);
          console.log('[Videos] Awarded', globalPoints, 'Global XP to student', studentId, '(Gauntlet video)');
        }
        
        // For Coach Pick (Arena) videos, calculate and award Global XP
        if (videoDetail?.challenge_category && videoDetail.challenge_category !== 'Daily Training') {
          try {
            let difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC' = 'MEDIUM';
            let foundInDb = false;
            
            // Try to get difficulty tier from arena_challenges table (if valid UUID)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (videoDetail.challenge_id && uuidRegex.test(videoDetail.challenge_id)) {
              const challengeResult = await db.execute(sql`
                SELECT difficulty_tier, category FROM arena_challenges WHERE id = ${videoDetail.challenge_id}::uuid
              `);
              if ((challengeResult as any[]).length > 0) {
                difficulty = ((challengeResult as any[])[0].difficulty_tier || 'MEDIUM').toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC';
                foundInDb = true;
              }
            }
            
            // If not found in DB, infer difficulty from XP awarded (Local XP values for Coach Pick with video)
            if (!foundInDb) {
              const xpVal = xpAwarded || 0;
              if (xpVal >= 100) difficulty = 'EPIC';
              else if (xpVal >= 70) difficulty = 'HARD';
              else if (xpVal >= 40) difficulty = 'MEDIUM';
              else difficulty = 'EASY';
              console.log('[Videos] Inferred difficulty', difficulty, 'from XP', xpVal);
            }
            
            // Calculate Global XP using ARENA_GLOBAL_SCORE_MATRIX (Coach Pick with video)
            const globalPoints = calculateArenaGlobalScore('coach_pick', difficulty, true);
            
            // Award Global XP to student
            await db.execute(sql`
              UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalPoints}
              WHERE id = ${studentId}::uuid
            `);
            
            // Store global_rank_points on the video record for auditing
            await db.execute(sql`
              UPDATE challenge_videos SET global_rank_points = ${globalPoints} WHERE id = ${videoId}::uuid
            `);
            
            console.log('[Videos] Awarded', globalPoints, 'Global XP to student', studentId, '(Coach Pick video, difficulty:', difficulty, ')');
          } catch (globalErr: any) {
            console.error('[Videos] Failed to award Global XP for Coach Pick:', globalErr.message);
          }
        }
      }

      // Send email notification to parent
      try {
        const videoResult = await db.execute(sql`
          SELECT cv.challenge_name, cv.club_id, s.name as student_name, s.parent_email, s.parent_name
          FROM challenge_videos cv
          JOIN students s ON cv.student_id = s.id
          WHERE cv.id = ${videoId}::uuid
        `);
        
        const videoData = (videoResult as any[])[0];
        if (videoData?.parent_email) {
          let verifyClubLanguage = 'English';
          if (videoData.club_id) {
            const verifyClubResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${videoData.club_id}::uuid LIMIT 1`);
            verifyClubLanguage = ((verifyClubResult as any[])[0]?.wizard_data as any)?.language || 'English';
          }
          emailService.sendVideoVerifiedNotification(videoData.parent_email, {
            parentName: videoData.parent_name || 'Parent',
            studentName: videoData.student_name,
            challengeName: videoData.challenge_name,
            status: status as 'approved' | 'rejected',
            coachNotes: coachNotes || undefined,
            xpAwarded: status === 'approved' ? (xpAwarded || 0) : undefined,
            language: verifyClubLanguage
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

  // Fallback challenges - rotates daily to prevent same question every day
  const getFallbackChallenge = () => {
    const fallbackQuestions = [
      {
        title: "Belt Wisdom",
        question: "What does the color of the White Belt represent?",
        options: ["Danger", "Innocence/Beginner", "Mastery", "Fire"],
        correctIndex: 1,
        explanation: "The White Belt represents innocence and a beginner's pure mind."
      },
      {
        title: "Martial Arts Origins",
        question: "Which country is known as the birthplace of many martial arts?",
        options: ["Japan", "China", "Korea", "Brazil"],
        correctIndex: 1,
        explanation: "China is considered the birthplace of many martial arts traditions."
      },
      {
        title: "Martial Arts Respect",
        question: "What is the purpose of bowing in martial arts?",
        options: ["To stretch", "To show respect", "To intimidate", "To start fighting"],
        correctIndex: 1,
        explanation: "Bowing shows respect to instructors, training partners, and the art itself."
      },
      {
        title: "Training Space",
        question: "What is a martial arts training hall generally called?",
        options: ["Arena", "Dojo/Dojang", "Court", "Ring"],
        correctIndex: 1,
        explanation: "Training halls are called Dojo (Japanese) or Dojang (Korean)."
      },
      {
        title: "Black Belt Meaning",
        question: "What does the Black Belt traditionally symbolize?",
        options: ["End of training", "Mastery and maturity", "Danger level", "Teaching ability"],
        correctIndex: 1,
        explanation: "The Black Belt symbolizes maturity - it's actually the beginning of deeper learning!"
      },
      {
        title: "Forms Practice",
        question: "What are choreographed movement patterns called in martial arts?",
        options: ["Sparring", "Forms/Kata/Poomsae", "Drills", "Combos"],
        correctIndex: 1,
        explanation: "Forms (Kata in Japanese, Poomsae in Korean) are solo practice patterns."
      },
      {
        title: "Martial Arts Philosophy",
        question: "What is a core principle of most martial arts?",
        options: ["Aggression", "Self-discipline", "Competition", "Strength"],
        correctIndex: 1,
        explanation: "Self-discipline is fundamental to martial arts training and philosophy."
      }
    ];
    
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const selected = fallbackQuestions[dayOfYear % fallbackQuestions.length];
    
    return {
      title: selected.title,
      description: "Test your martial arts knowledge!",
      type: 'quiz' as const,
      xpReward: 15,
      quizData: {
        question: selected.question,
        options: selected.options,
        correctIndex: selected.correctIndex,
        explanation: selected.explanation
      }
    };
  };

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

      // Get club's art_type FIRST (needed for cache lookup)
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

      // "Lazy Generator" - Check if challenge exists for today + belt + art_type
      let existingChallenge = await db.execute(sql`
        SELECT * FROM daily_challenges 
        WHERE date = ${today} AND target_belt = ${targetBelt} AND art_type = ${artType}
        LIMIT 1
      `);

      let challenge: any;

      if ((existingChallenge as any[]).length > 0) {
        // Use cached challenge - SAME question for all students with same sport+belt
        challenge = (existingChallenge as any[])[0];
        console.log(`[DailyChallenge] Using cached challenge for ${artType} ${targetBelt} belt`);
      } else {
        // Try to generate new challenge with AI, with fallback on failure
        let generated;
        try {
          generated = await generateDailyChallenge(targetBelt, artType);
          console.log(`[DailyChallenge] AI generated challenge for ${artType} ${targetBelt} belt`);
        } catch (aiError: any) {
          // AI generation failed - use fallback challenge
          console.error(`[DailyChallenge] AI generation failed: ${aiError.message}`);
          console.log(`[DailyChallenge] Using fallback challenge for ${targetBelt} belt`);
          generated = getFallbackChallenge();
        }
        
        // Cache in database with art_type
        try {
          const insertResult = await db.execute(sql`
            INSERT INTO daily_challenges (date, target_belt, art_type, title, description, xp_reward, type, quiz_data, created_by_ai)
            VALUES (${today}, ${targetBelt}, ${artType}, ${generated.title}, ${generated.description}, ${generated.xpReward}, 
                    ${generated.type}::daily_challenge_type, ${JSON.stringify(generated.quizData)}::jsonb, NOW())
            RETURNING *
          `);
          
          challenge = (insertResult as any[])[0];
          console.log(`[DailyChallenge] Cached challenge for ${artType} ${targetBelt} belt`);
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
      // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
      const alreadyPlayedToday = await db.execute(sql`
        SELECT id, amount FROM xp_transactions 
        WHERE student_id = ${studentId}::uuid 
        AND reason LIKE '%daily_challenge%' 
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
        LIMIT 1
      `);
      
      if ((alreadyPlayedToday as any[]).length > 0) {
        const previousXp = (alreadyPlayedToday as any[])[0].amount || 0;
        const wasCorrect = previousXp >= 15;
        console.log('⛔ [DailyChallenge] Already played today - blocking duplicate:', { studentId, previousXp, wasCorrect });
        return res.status(400).json({
          error: 'Already completed',
          message: 'You already completed today\'s challenge! Come back tomorrow.',
          previousXp,
          wasCorrect
        });
      }

      // FALLBACK CHALLENGE HANDLING: Skip DB lookup, trust frontend
      if (isFallbackChallenge) {
        console.log('🎯 [DailyChallenge] Processing FALLBACK challenge - skipping DB lookup');
        
        // For fallback challenges, trust the frontend's isCorrect or default to true
        const isCorrect = frontendIsCorrect !== undefined ? frontendIsCorrect : true;
        
        // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
        const localXp = isCorrect ? 15 : 5;
        const globalXp = isCorrect ? 3 : 1;
        
        // 1. Award Local XP using unified service (single source of truth)
        await awardXP(studentId, localXp, 'mystery', { isFallback: true });
        
        // 2. Insert into xp_transactions for persistence and duplicate prevention
        await db.execute(sql`
          INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
          VALUES (${studentId}::uuid, ${localXp}, 'EARN', 'daily_challenge', NOW())
        `);
        
        // 3. Award Global XP (use global_xp column - the one World Rankings queries)
        await db.execute(sql`
          UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalXp} WHERE id = ${studentId}::uuid
        `);
        
        console.log(`✅ [DailyChallenge] Fallback XP PERSISTED: Local=${localXp}, Global=${globalXp} to student ${studentId}`);
        
        return res.json({
          success: true,
          isCorrect,
          xpAwarded: localXp,
          globalXp,
          explanation: 'Great job completing the challenge!',
          message: isCorrect ? `Correct! +${localXp} XP` : `Not quite! +${localXp} XP for trying!`
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

      // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
      let isCorrect = false;
      
      if (challenge.type === 'quiz' && challenge.quiz_data) {
        const quizData = typeof challenge.quiz_data === 'string' 
          ? JSON.parse(challenge.quiz_data) 
          : challenge.quiz_data;
        isCorrect = selectedIndex === quizData.correctIndex;
      } else {
        isCorrect = true;
      }
      
      const localXp = isCorrect ? 15 : 5;
      const globalXp = isCorrect ? 3 : 1;

      // Create submission (clubId is optional for home users)
      console.log('💾 [DailyChallenge] Inserting submission:', { challengeId, studentId, validClubId, isCorrect, localXp, globalXp });
      await db.execute(sql`
        INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded, completed_at)
        VALUES (${challengeId}::uuid, ${studentId}::uuid, ${validClubId ? sql`${validClubId}::uuid` : sql`NULL`}, ${answer || String(selectedIndex)}, ${isCorrect}, ${localXp}, NOW())
      `);

      // Award Local XP using unified XP service (single source of truth)
      await awardXP(studentId, localXp, 'mystery', { challengeId, isCorrect });
      
      // Award Global XP (use global_xp column - the one World Rankings queries)
      await db.execute(sql`
        UPDATE students SET global_xp = COALESCE(global_xp, 0) + ${globalXp} WHERE id = ${studentId}::uuid
      `);

      console.log(`✅ [DailyChallenge] Submit Success - Local XP: ${localXp}, Global XP: ${globalXp}`);

      res.json({
        success: true,
        isCorrect,
        xpAwarded: localXp,
        globalXp,
        explanation: challenge.quiz_data?.explanation || null,
        message: isCorrect 
          ? `Correct! +${localXp} XP` 
          : `Not quite! +${localXp} XP for trying.`
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
  // VIDEO_XP_MULTIPLIER removed - now using calculateLocalXp from gamificationService

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

  // GET /api/challenges/history - Fetch XP history from Coach Picks and Daily Training
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

      // Fetch Coach Pick submissions (from challenge_videos table)
      // Exclude 'Daily Training' category as those are Gauntlet submissions (already in gauntlet_submissions)
      const coachPicksResult = await db.execute(sql`
        SELECT 
          id,
          challenge_id,
          challenge_name,
          challenge_category,
          status,
          xp_awarded,
          score,
          video_url,
          created_at
        FROM challenge_videos 
        WHERE student_id = ${studentId}::uuid
          AND (challenge_category IS NULL OR challenge_category != 'Daily Training')
        ORDER BY created_at DESC
        LIMIT 30
      `);

      // Fetch Daily Training submissions (from gauntlet_submissions table)
      // Join with challenge_videos to get actual verification status for video submissions
      const gauntletResult = await db.execute(sql`
        SELECT 
          gs.id,
          gs.challenge_id,
          gc.name as challenge_name,
          gc.day_theme as challenge_category,
          gs.proof_type,
          gs.local_xp_awarded as xp_awarded,
          gs.global_points_awarded as global_xp_awarded,
          gs.score,
          gs.is_personal_best,
          gs.submitted_at as created_at,
          cv.status as video_status
        FROM gauntlet_submissions gs
        LEFT JOIN gauntlet_challenges gc ON gs.challenge_id = gc.id
        LEFT JOIN challenge_videos cv ON cv.challenge_id = gs.challenge_id::text 
          AND cv.student_id = gs.student_id 
          AND cv.challenge_category = 'Daily Training'
        WHERE gs.student_id = ${studentId}::uuid
        ORDER BY gs.submitted_at DESC
        LIMIT 30
      `);

      // Fetch Daily Mystery Challenge submissions (from challenge_submissions table)
      // ONLY include submissions that have a matching daily_challenges record
      const mysteryResult = await db.execute(sql`
        SELECT 
          cs.id,
          cs.challenge_id,
          dc.title as challenge_name,
          cs.is_correct,
          cs.xp_awarded,
          cs.completed_at as created_at
        FROM challenge_submissions cs
        INNER JOIN daily_challenges dc ON cs.challenge_id = dc.id
        WHERE cs.student_id = ${studentId}::uuid
        ORDER BY cs.completed_at DESC
        LIMIT 20
      `);
      
      // Fetch Arena Coach Pick TRUST submissions (from challenge_submissions table)
      // These are TRUST submissions that are NOT daily mystery challenges
      const arenaTrustResult = await db.execute(sql`
        SELECT 
          cs.id,
          cs.challenge_id,
          cs.answer as challenge_name,
          cs.xp_awarded,
          cs.global_rank_points,
          cs.proof_type,
          cs.completed_at as created_at
        FROM challenge_submissions cs
        LEFT JOIN daily_challenges dc ON cs.challenge_id = dc.id
        WHERE cs.student_id = ${studentId}::uuid
          AND dc.id IS NULL
          AND cs.proof_type = 'TRUST'
        ORDER BY cs.completed_at DESC
        LIMIT 30
      `);

      // Fetch Family Challenge submissions (from family_logs table)
      // Use text comparison to handle both UUID and legacy string IDs
      // Wrapped in try-catch to prevent breaking history if family tables don't exist
      let familyResult: any[] = [];
      try {
        familyResult = await db.execute(sql`
          SELECT 
            fl.id,
            fl.challenge_id,
            fc.name as challenge_name,
            fc.icon as challenge_icon,
            fc.category as challenge_category,
            fl.xp_awarded,
            fl.completed_at as created_at
          FROM family_logs fl
          LEFT JOIN family_challenges fc ON fl.challenge_id = fc.id::text
          WHERE fl.student_id = ${studentId}::uuid
          ORDER BY fl.completed_at DESC
          LIMIT 20
        `) as any[];
      } catch (famErr: any) {
        console.log('[ChallengeHistory] Family query skipped:', famErr.message);
      }

      // Map Coach Picks to history format
      const coachPickHistory = (coachPicksResult as any[]).map(row => {
        const statusMap: Record<string, string> = {
          'pending': 'PENDING',
          'approved': 'VERIFIED',
          'rejected': 'REJECTED'
        };
        
        return {
          id: row.id,
          source: 'coach_pick',
          challengeId: row.challenge_id,
          challengeName: row.challenge_name || 'Coach Pick Challenge',
          icon: '⭐',
          category: row.challenge_category || 'Coach Picks',
          status: statusMap[row.status] || 'PENDING',
          proofType: 'VIDEO',
          xpAwarded: row.xp_awarded || 0,
          score: row.score || 0,
          videoUrl: row.video_url,
          mode: 'SOLO',
          completedAt: row.created_at
        };
      });

      // Map Daily Training to history format
      const categoryIcons: Record<string, string> = {
        'Engine': '🔥',
        'Foundation': '🏋️',
        'Evasion': '💨',
        'Explosion': '💥',
        'Animal': '🐯',
        'Defense': '🛡️',
        'Flow': '🌊'
      };
      
      const gauntletHistory = (gauntletResult as any[]).map(row => {
        // Determine status: TRUST submissions are always COMPLETED, VIDEO depends on verification
        let status = 'COMPLETED';
        if (row.proof_type === 'VIDEO') {
          if (row.video_status === 'approved') {
            status = 'VERIFIED';
          } else if (row.video_status === 'rejected') {
            status = 'REJECTED';
          } else {
            status = 'PENDING';
          }
        }
        
        // XP shown: For pending videos, show 0 (not yet awarded)
        const xpAwarded = (row.proof_type === 'VIDEO' && status === 'PENDING') ? 0 : (row.xp_awarded || 0);
        const globalXp = (row.proof_type === 'VIDEO' && status === 'PENDING') ? 0 : (row.global_xp_awarded || 0);
        
        return {
          id: row.id,
          source: 'daily_training',
          challengeId: row.challenge_id,
          challengeName: row.challenge_name || 'Daily Training',
          icon: categoryIcons[row.challenge_category] || '🥋',
          category: row.challenge_category || 'Daily Training',
          status,
          proofType: row.proof_type || 'TRUST',
          xpAwarded,
          pendingXp: (row.proof_type === 'VIDEO' && status === 'PENDING') ? (row.xp_awarded || 0) : 0,
          globalXp,
          pendingGlobalXp: (row.proof_type === 'VIDEO' && status === 'PENDING') ? (row.global_xp_awarded || 0) : 0,
          score: row.score || 0,
          isPersonalBest: row.is_personal_best || false,
          mode: 'SOLO',
          completedAt: row.created_at
        };
      });

      // Map Daily Mystery Challenge to history format
      const mysteryHistory = (mysteryResult as any[]).map(row => {
        return {
          id: row.id,
          source: 'mystery',
          challengeId: row.challenge_id,
          challengeName: row.challenge_name || 'Daily Mystery',
          icon: '🎯',
          category: 'Mystery',
          status: row.is_correct ? 'CORRECT' : 'WRONG',
          proofType: 'QUIZ',
          xpAwarded: row.xp_awarded || 0,
          globalXp: row.is_correct ? 3 : 1,
          mode: 'SOLO',
          completedAt: row.created_at
        };
      });

      // Map Family Challenge to history format
      const familyHistory = (familyResult as any[]).map(row => {
        return {
          id: row.id,
          source: 'family',
          challengeId: row.challenge_id,
          challengeName: row.challenge_name || 'Family Challenge',
          icon: row.challenge_icon || '👨‍👧',
          category: row.challenge_category || 'Family',
          status: 'COMPLETED',
          proofType: 'TRUST',
          xpAwarded: row.xp_awarded || 0,
          globalXp: row.xp_awarded >= 15 ? 2 : 1, // Win = 2 Global, Lose = 1 Global
          mode: 'FAMILY',
          completedAt: row.created_at
        };
      });
      
      // Map Arena TRUST submissions to history format (Coach Pick challenges done without video)
      const arenaTrustHistory = (arenaTrustResult as any[]).map(row => {
        // Use simple "Coach Pick" as the display name
        return {
          id: row.id,
          source: 'coach_pick',
          challengeId: row.challenge_id,
          challengeName: 'Coach Pick',
          icon: '⭐',
          category: 'Coach Picks',
          status: 'COMPLETED',
          proofType: 'TRUST',
          xpAwarded: row.xp_awarded || 0,
          globalXp: row.global_rank_points || 0,
          mode: 'SOLO',
          completedAt: row.created_at
        };
      });

      // Combine and sort by date (newest first)
      const allHistory = [...coachPickHistory, ...gauntletHistory, ...mysteryHistory, ...familyHistory, ...arenaTrustHistory]
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        .slice(0, 50);

      res.json({ history: allHistory });
    } catch (error: any) {
      console.error('[ChallengeHistory] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // Unified challenge submission endpoint
  app.post('/api/challenges/submit', async (req: Request, res: Response) => {
    try {
      const { studentId, challengeType, score, proofType, videoUrl, challengeCategoryType, challengeDifficulty } = req.body;
      // Note: challengeXp is intentionally ignored - XP is calculated server-side using the secure matrix
      
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
      
      // Calculate XP using shared helper (single source of truth for Local XP matrix)
      const catType: ChallengeTypeKey = challengeCategoryType === 'coach_pick' ? 'coach_pick' : 'general';
      const difficulty: ChallengeTierKey = (['EASY', 'MEDIUM', 'HARD', 'EPIC'].includes(challengeDifficulty) ? challengeDifficulty : 'EASY') as ChallengeTierKey;
      const hasVideoProof = proofType === 'VIDEO';
      
      // Calculate Local XP using category-based value hierarchy (single source of truth)
      const finalXp = calculateLocalXp(catType, difficulty, hasVideoProof);
      
      // Calculate Global Rank Score using the shared helper (single source of truth)
      const globalRankPoints = calculateArenaGlobalScore(catType, difficulty, hasVideoProof);

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
        // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
        const challengeDailyCount = await db.execute(sql`
          SELECT COUNT(*) as count FROM challenge_submissions 
          WHERE student_id = ${studentId}::uuid 
          AND answer = ${challengeType}
          AND proof_type = 'TRUST' 
          AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
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
        
        // ALSO check if there's already a pending/approved VIDEO for this challenge (block double-dipping)
        const existingVideoResult = await db.execute(sql`
          SELECT id, status FROM challenge_videos 
          WHERE student_id = ${studentId}::uuid AND challenge_id = ${challengeType}
          AND status IN ('pending', 'approved')
          AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
        `);
        
        if ((existingVideoResult as any[]).length > 0) {
          const videoStatus = (existingVideoResult as any[])[0].status;
          return res.status(429).json({
            error: 'Already submitted with video',
            message: videoStatus === 'approved' 
              ? 'You already completed this challenge with video proof today!' 
              : 'You have a video pending review for this challenge. Wait for coach approval!',
            alreadyCompleted: true
          });
        }

          // Create TRUST submission - instant XP with deterministic challenge_id
          // Include Global Rank metadata for World Rankings
          const challengeUUID = generateChallengeUUID(challengeType);
          await db.execute(sql`
            INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, xp_awarded, challenge_category_type, challenge_difficulty, global_rank_points, completed_at)
            VALUES (${challengeUUID}::uuid, ${studentId}::uuid, ${validClubId}::uuid, ${challengeType}, ${score || 0}, 'SOLO', 'COMPLETED', 'TRUST', ${finalXp}, ${catType}::challenge_category_type, ${difficulty}::challenge_difficulty, ${globalRankPoints}, NOW())
          `);

          // Award XP using unified XP service (single source of truth)
          await awardXP(studentId, finalXp, 'arena', { challengeType, proofType: 'TRUST' });
          
          // Award Global Rank Points (for World Rankings)
          await db.execute(sql`
            UPDATE students 
            SET global_xp = COALESCE(global_xp, 0) + ${globalRankPoints},
                updated_at = NOW()
            WHERE id = ${studentId}::uuid
          `);

        console.log(`[Arena] Trust submission for "${challengeType}" (${catType}/${difficulty}): +${finalXp} XP, +${globalRankPoints} Global Rank Points (${count + 1}/${TRUST_PER_CHALLENGE_LIMIT} today)`);

        return res.json({
          success: true,
          status: 'COMPLETED',
          xpAwarded: finalXp,
          earned_xp: finalXp,
          globalRankPoints,
          remainingForChallenge: TRUST_PER_CHALLENGE_LIMIT - count - 1,
          message: `Challenge completed! +${finalXp} XP earned. +${globalRankPoints} World Rank points!`
        });
      }

      // VIDEO submissions: Require premium status (2x XP multiplier)
      if (proofType === 'VIDEO') {
        if (!videoUrl) {
          return res.status(400).json({ error: 'videoUrl is required for video proof' });
        }

        // Check if already submitted video for this challenge today (prevent duplicates)
        // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
        const existingVideoResult = await db.execute(sql`
          SELECT id FROM challenge_submissions 
          WHERE student_id = ${studentId}::uuid AND answer = ${challengeType} AND proof_type = 'VIDEO'
          AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
        `);
        
        if ((existingVideoResult as any[]).length > 0) {
          return res.status(429).json({
            error: 'Already submitted',
            message: 'You already submitted a video for this challenge today. Try again tomorrow!',
            alreadyCompleted: true
          });
        }
        
        // ALSO check if already submitted via TRUST for this challenge today (block double-dipping)
        const existingTrustResult = await db.execute(sql`
          SELECT id FROM challenge_submissions 
          WHERE student_id = ${studentId}::uuid AND answer = ${challengeType} AND proof_type = 'TRUST'
          AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
        `);
        
        if ((existingTrustResult as any[]).length > 0) {
          return res.status(429).json({
            error: 'Already completed without video',
            message: 'You already completed this challenge today without video. Try a different challenge!',
            alreadyCompleted: true
          });
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
        // Include Global Rank metadata for World Rankings verification
        const challengeUUID = generateChallengeUUID(challengeType);
        await db.execute(sql`
          INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, video_url, xp_awarded, challenge_category_type, challenge_difficulty, global_rank_points, completed_at)
          VALUES (${challengeUUID}::uuid, ${studentId}::uuid, ${validClubId}::uuid, ${challengeType}, ${score || 0}, 'SOLO', 'PENDING', 'VIDEO', ${videoUrl}, ${finalXp}, ${catType}::challenge_category_type, ${difficulty}::challenge_difficulty, ${globalRankPoints}, NOW())
        `);

        console.log(`[Arena] Video submission for "${challengeType}" (${catType}/${difficulty}) pending verification (pending: ${finalXp} XP, ${globalRankPoints} Global Rank Points)`);

        return res.json({
          success: true,
          status: 'PENDING',
          xpAwarded: 0,
          pendingXp: finalXp,
          pendingGlobalRankPoints: globalRankPoints,
          earned_xp: 0,
          message: `Video submitted! You'll earn ${finalXp} XP and ${globalRankPoints} World Rank points when your coach verifies it.`
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
               s.name as student_name, s.belt as student_belt
        FROM challenge_submissions cs
        JOIN students s ON cs.student_id = s.id
        WHERE cs.club_id = ${clubId}::uuid 
        AND cs.proof_type = 'VIDEO'
        AND cs.status = 'PENDING'
        ORDER BY cs.completed_at ASC
      `);

      // Convert video URLs to proxy URLs
      const pendingWithProxyUrls = (pending as any[]).map((row: any) => {
        let videoKey = row.video_key;
        // Extract key from URL if video_key is empty but video_url exists
        if (!videoKey && row.video_url && row.video_url.includes('idrivee2.com/')) {
          videoKey = row.video_url.split('idrivee2.com/')[1];
        }
        return {
          ...row,
          video_url: videoKey 
            ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
            : row.video_url
        };
      });

      res.json(pendingWithProxyUrls);
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
        const xpToAward = parseInt(submission.xp_awarded) || 30; // Fallback to 30 (15 base * 2) for legacy submissions
        
        // Use stored Global Rank Points from submission (calculated at submit time)
        // This ensures accurate matrix values for coach_pick vs general and correct difficulty
        const globalRankPoints = parseInt(submission.global_rank_points) || 3; // Fallback to EASY general with video for legacy
        
        await db.execute(sql`
          UPDATE challenge_submissions SET status = 'VERIFIED'
          WHERE id = ${submissionId}::uuid
        `);
        
        // Award XP using unified XP service
        await awardXP(submission.student_id, xpToAward, 'arena', { proofType: 'VIDEO', verified: true });
        
        // Award Global Rank Points (for World Rankings)
        await db.execute(sql`
          UPDATE students 
          SET global_xp = COALESCE(global_xp, 0) + ${globalRankPoints}::integer,
              updated_at = NOW()
          WHERE id = ${submission.student_id}::uuid
        `);

        console.log(`[Arena] Video verified for ${submission.student_id}: +${xpToAward} XP, +${globalRankPoints} Global Rank Points (${submission.challenge_category_type}/${submission.challenge_difficulty})`);

        res.json({
          success: true,
          status: 'VERIFIED',
          xpAwarded: xpToAward,
          globalRankPoints,
          message: `Video verified! +${xpToAward} XP and +${globalRankPoints} World Rank points awarded.`
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
  // WARRIOR'S GAUNTLET - 7-Day Fixed Challenge Rotation
  // =====================================================
  
  // Get today's gauntlet challenges
  app.get('/api/gauntlet/today', async (req: Request, res: Response) => {
    try {
      const studentId = req.query.studentId as string;
      
      // Get current day of week
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const today = days[new Date().getDay()];
      
      // Get current week number (for tracking weekly resets)
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      
      // Fetch today's challenges
      const challenges = await db.execute(sql`
        SELECT * FROM gauntlet_challenges 
        WHERE day_of_week = ${today}::gauntlet_day AND is_active = true
        ORDER BY display_order ASC
      `);
      
      // Get student's personal bests for these challenges
      let personalBests: any[] = [];
      let thisWeekSubmissions: any[] = [];
      
      if (studentId) {
        const challengeIds = (challenges as any[]).map(c => c.id);
        
        if (challengeIds.length > 0) {
          const idsArray = `{${challengeIds.join(',')}}`;
          
          personalBests = await db.execute(sql`
            SELECT challenge_id, best_score, has_video_proof 
            FROM gauntlet_personal_bests 
            WHERE student_id = ${studentId}::uuid 
            AND challenge_id = ANY(${idsArray}::uuid[])
          `) as any[];
          
          thisWeekSubmissions = await db.execute(sql`
            SELECT challenge_id, score, proof_type, is_personal_best 
            FROM gauntlet_submissions 
            WHERE student_id = ${studentId}::uuid 
            AND week_number = ${weekNumber}
            AND challenge_id = ANY(${idsArray}::uuid[])
          `) as any[];
        }
      }
      
      // Map personal bests to challenges
      const pbMap = new Map(personalBests.map(pb => [pb.challenge_id, pb]));
      const submittedMap = new Map(thisWeekSubmissions.map(s => [s.challenge_id, s]));
      
      const enrichedChallenges = (challenges as any[]).map(c => ({
        ...c,
        personalBest: pbMap.get(c.id)?.best_score || null,
        pbHasVideo: pbMap.get(c.id)?.has_video_proof || false,
        submittedThisWeek: submittedMap.has(c.id),
        thisWeekScore: submittedMap.get(c.id)?.score || null,
        thisWeekProofType: submittedMap.get(c.id)?.proof_type || null,
      }));
      
      res.json({
        dayOfWeek: today,
        dayTheme: (challenges as any[])[0]?.day_theme || 'Training',
        weekNumber,
        challenges: enrichedChallenges,
      });
    } catch (error: any) {
      console.error('[Gauntlet] Error fetching today challenges:', error.message);
      res.status(500).json({ error: 'Failed to fetch gauntlet challenges' });
    }
  });
  
  // Submit gauntlet challenge (with PB tracking)
  app.post('/api/gauntlet/submit', async (req: Request, res: Response) => {
    try {
      const { challengeId, studentId, score, proofType, videoUrl, videoHash } = req.body;
      
      if (!challengeId || !studentId || score === undefined) {
        return res.status(400).json({ error: 'challengeId, studentId, and score are required' });
      }
      
      // Get challenge info
      const challengeResult = await db.execute(sql`
        SELECT * FROM gauntlet_challenges WHERE id = ${challengeId}::uuid
      `);
      
      if ((challengeResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      const challenge = (challengeResult as any[])[0];
      
      // Calculate week number
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      
      // Check if already submitted this week
      const existingSubmission = await db.execute(sql`
        SELECT id FROM gauntlet_submissions 
        WHERE challenge_id = ${challengeId}::uuid 
        AND student_id = ${studentId}::uuid 
        AND week_number = ${weekNumber}
      `);
      
      if ((existingSubmission as any[]).length > 0) {
        return res.status(429).json({ error: 'Already submitted this challenge this week', limitReached: true });
      }
      
      // Calculate XP and Global Points (Gauntlet-specific scoring)
      const isVideoProof = proofType === 'VIDEO';
      const localXp = isVideoProof ? 40 : 20;      // Fixed: Trust=20, Video=40
      const globalPoints = isVideoProof ? 15 : 5;  // Fixed: Trust=5, Video=15
      
      // Check/update personal best
      const pbResult = await db.execute(sql`
        SELECT id, best_score FROM gauntlet_personal_bests 
        WHERE challenge_id = ${challengeId}::uuid AND student_id = ${studentId}::uuid
      `);
      
      const existingPB = (pbResult as any[])[0];
      let isNewPB = false;
      
      // Determine if new score is better (depends on sort order)
      if (!existingPB) {
        // First submission - always a PB
        isNewPB = true;
        await db.execute(sql`
          INSERT INTO gauntlet_personal_bests (challenge_id, student_id, best_score, has_video_proof)
          VALUES (${challengeId}::uuid, ${studentId}::uuid, ${score}, ${isVideoProof})
        `);
      } else {
        // Compare based on sort order
        const isBetter = challenge.sort_order === 'DESC' 
          ? score > existingPB.best_score 
          : score < existingPB.best_score;
        
        if (isBetter) {
          isNewPB = true;
          await db.execute(sql`
            UPDATE gauntlet_personal_bests 
            SET best_score = ${score}, achieved_at = NOW(), has_video_proof = ${isVideoProof}
            WHERE id = ${existingPB.id}::uuid
          `);
        }
      }
      
      // Insert submission
      await db.execute(sql`
        INSERT INTO gauntlet_submissions 
        (challenge_id, student_id, score, proof_type, video_url, local_xp_awarded, global_points_awarded, is_personal_best, week_number)
        VALUES (${challengeId}::uuid, ${studentId}::uuid, ${score}, ${proofType || 'TRUST'}::proof_type, ${videoUrl || null}, ${localXp}, ${globalPoints}, ${isNewPB}, ${weekNumber})
      `);
      
      // Award XP immediately for trust submissions, pending for video
      if (!isVideoProof) {
        await db.execute(sql`
          UPDATE students SET total_xp = COALESCE(total_xp, 0) + ${localXp}, global_xp = COALESCE(global_xp, 0) + ${globalPoints}
          WHERE id = ${studentId}::uuid
        `);
      } else {
        // VIDEO submissions: Also insert into challenge_videos for coach review queue
        const studentClubResult = await db.execute(sql`
          SELECT club_id FROM students WHERE id = ${studentId}::uuid
        `);
        const studentClubId = (studentClubResult as any[])[0]?.club_id;
        
        if (studentClubId && videoUrl) {
          // Check for duplicate video content using hash (fingerprint)
          let aiFlag = 'green';
          let aiFlagReason = '';
          
          if (videoHash) {
            const duplicateHashResult = await db.execute(sql`
              SELECT id FROM challenge_videos 
              WHERE video_hash = ${videoHash}
              AND created_at > NOW() - INTERVAL '30 days'
              LIMIT 1
            `);
            
            if ((duplicateHashResult as any[]).length > 0) {
              aiFlag = 'red';
              aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
              console.log(`[Gauntlet] RED FLAG: Duplicate video hash for ${studentId}`);
            }
          }
          
          await db.execute(sql`
            INSERT INTO challenge_videos 
            (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, xp_awarded, ai_flag, ai_flag_reason, created_at, updated_at)
            VALUES (${studentId}::uuid, ${studentClubId}::uuid, ${challengeId}, ${challenge.name}, 'Daily Training', ${videoUrl}, '', ${videoHash || null}, ${score}, 'pending', ${localXp}, ${aiFlag}, ${aiFlagReason || null}, NOW(), NOW())
          `);
          console.log(`[Gauntlet] Video added to coach review queue for ${challenge.name}, AI Flag: ${aiFlag}`);
        }
      }
      
      console.log(`[Gauntlet] Submission: ${challenge.name} by ${studentId} - Score: ${score}, XP: ${isVideoProof ? 0 : localXp}, Global: ${isVideoProof ? 0 : globalPoints}, NewPB: ${isNewPB}, Pending: ${isVideoProof}`);
      
      res.json({
        success: true,
        xpAwarded: isVideoProof ? 0 : localXp,
        pendingXp: isVideoProof ? localXp : 0,
        globalRankPoints: isVideoProof ? 0 : globalPoints,
        pendingGlobalRankPoints: isVideoProof ? globalPoints : 0,
        isNewPersonalBest: isNewPB,
        previousBest: existingPB?.best_score || null,
        message: isVideoProof 
          ? `Video submitted! You'll earn ${localXp} XP when verified by your coach.`
          : (isNewPB ? 'New Personal Best!' : 'Challenge completed!'),
        pendingVerification: isVideoProof,
      });
    } catch (error: any) {
      console.error('[Gauntlet] Submit error:', error.message);
      res.status(500).json({ error: 'Failed to submit challenge' });
    }
  });
  
  // Get gauntlet leaderboard for a challenge
  app.get('/api/gauntlet/leaderboard/:challengeId', async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;
      const scope = req.query.scope as string || 'global'; // 'global' or 'club'
      const clubId = req.query.clubId as string;
      
      // Get challenge info for sort order
      const challengeResult = await db.execute(sql`
        SELECT sort_order FROM gauntlet_challenges WHERE id = ${challengeId}::uuid
      `);
      
      if ((challengeResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      const sortOrder = (challengeResult as any[])[0].sort_order;
      const orderDirection = sortOrder === 'DESC' ? 'DESC' : 'ASC';
      
      // Get top scores from personal bests
      let leaderboard: any[];
      
      if (scope === 'club' && clubId) {
        leaderboard = await db.execute(sql`
          SELECT pb.best_score, pb.has_video_proof, pb.achieved_at,
                 s.name, s.belt, s.profile_image_url
          FROM gauntlet_personal_bests pb
          JOIN students s ON pb.student_id = s.id
          WHERE pb.challenge_id = ${challengeId}::uuid AND s.club_id = ${clubId}::uuid
          ORDER BY pb.best_score ${sql.raw(orderDirection)}
          LIMIT 50
        `) as any[];
      } else {
        leaderboard = await db.execute(sql`
          SELECT pb.best_score, pb.has_video_proof, pb.achieved_at,
                 s.name, s.belt, s.profile_image_url
          FROM gauntlet_personal_bests pb
          JOIN students s ON pb.student_id = s.id
          WHERE pb.challenge_id = ${challengeId}::uuid
          ORDER BY pb.best_score ${sql.raw(orderDirection)}
          LIMIT 100
        `) as any[];
      }
      
      res.json({ leaderboard });
    } catch (error: any) {
      console.error('[Gauntlet] Leaderboard error:', error.message);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
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

      // Calculate monthly PTS from xp_transactions (PTS_EARN type)
      const monthlyPtsData = await db.execute(sql`
        SELECT student_id, COALESCE(SUM(amount), 0) as monthly_pts
        FROM xp_transactions 
        WHERE student_id IN (SELECT id FROM students WHERE club_id = ${clubId}::uuid)
          AND type = 'PTS_EARN' AND created_at >= ${monthStartStr}::timestamp
        GROUP BY student_id
      `);
      const monthlyPtsMap = new Map((monthlyPtsData as any[]).map(r => [r.student_id, parseInt(r.monthly_pts) || 0]));

      // Build leaderboard: totalXP from students table, monthlyXP and monthlyPTS from logs
      const leaderboard = (students as any[]).map(s => ({
        id: s.id,
        name: s.name,
        belt: s.belt,
        stripes: s.stripes || 0,
        totalXP: parseInt(s.total_xp) || 0,
        monthlyXP: monthlyXpMap.get(s.id) || 0,
        monthlyPTS: monthlyPtsMap.get(s.id) || 0
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
  // XP HISTORY - Get XP transaction history for a student
  // =====================================================
  app.get('/api/students/:id/xp-history', async (req: Request, res: Response) => {
    try {
      const studentId = req.params.id;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      const result = await db.execute(sql`
        SELECT id, amount, type, reason, created_at
        FROM xp_transactions
        WHERE student_id = ${studentId}::uuid
          AND type NOT IN ('PTS_EARN', 'GLOBAL_EARN')
        ORDER BY created_at DESC
        LIMIT 50
      `);

      const history = (result as any[]).map((row: any) => ({
        id: row.id,
        amount: parseInt(row.amount, 10),
        type: row.type,
        reason: row.reason,
        createdAt: row.created_at
      }));

      res.json({ success: true, history });
    } catch (error: any) {
      console.error('[XP History] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch XP history' });
    }
  });

  // =====================================================
  // AWARD XP - Generic endpoint for content completion XP
  // =====================================================
  app.post('/api/students/:id/award-xp', async (req: Request, res: Response) => {
    try {
      const studentId = req.params.id;
      const { xp, source, contentId } = req.body;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      if (!xp || typeof xp !== 'number' || xp <= 0) {
        return res.status(400).json({ error: 'Valid XP amount is required' });
      }

      // Award XP using the unified awardXP function
      const result = await awardXP(studentId, xp, source || 'content', { contentId });
      
      // Insert into xp_transactions for persistence (local XP only - no global XP for content)
      await db.execute(sql`
        INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
        VALUES (${studentId}::uuid, ${xp}, 'EARN', 'content_completion', NOW())
      `);
      
      console.log(`[AwardXP] Local XP awarded: ${xp} for student ${studentId}`);

      res.json({ 
        success: true, 
        newTotalXp: result.newTotal,
        xpAwarded: xp
      });
    } catch (error: any) {
      console.error('[AwardXP] Error:', error.message);
      res.status(500).json({ error: 'Failed to award XP' });
    }
  });

  // =====================================================
  // HOME DOJO - HABIT TRACKING (Simplified)
  // XP System: 3 XP per habit for all users
  // Free: 3 habits/day = 9 XP cap, Premium: 7 habits/day = 21 XP cap
  // =====================================================
  const HOME_DOJO_BASE_XP = 3;
  const HOME_DOJO_FREE_CAP = 9;    // 3 habits × 3 XP
  const HOME_DOJO_PREMIUM_CAP = 21; // 7 habits × 3 XP

  // Helper: Check if student has premium (explicit check - NULL means free)
  async function hasHomeDojoPremium(studentId: string): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT s.premium_status, c.parent_premium_enabled 
        FROM students s 
        LEFT JOIN clubs c ON s.club_id = c.id 
        WHERE s.id = ${studentId}::uuid
      `);
      const student = (result as any[])[0];
      if (!student) return false;
      const hasPremiumStatus = student.premium_status === 'club_sponsored' || student.premium_status === 'parent_paid';
      const hasParentPremium = student.parent_premium_enabled === true;
      return hasPremiumStatus || hasParentPremium;
    } catch {
      return false;
    }
  }

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

      const studentCheck = await db.execute(sql`SELECT id FROM students WHERE id = ${studentId}::uuid`);
      if ((studentCheck as any[]).length === 0) {
        const clubResult = await db.execute(sql`SELECT id FROM clubs ORDER BY created_at ASC LIMIT 1`);
        const defaultClubId = (clubResult as any[])[0]?.id;
        
        if (!defaultClubId) {
          return res.status(400).json({ error: 'No clubs available. Please contact support.' });
        }
        
        await db.execute(sql`
          INSERT INTO students (id, club_id, name, total_xp, created_at, updated_at)
          VALUES (${studentId}::uuid, ${defaultClubId}::uuid, 'New Student', 0, NOW(), NOW())
        `);
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

      const isPremium = await hasHomeDojoPremium(studentId);
      const habitXp = HOME_DOJO_BASE_XP; // 3 XP for all users
      const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;

      const dailyXpResult = await db.execute(sql`
        SELECT COALESCE(SUM(xp_awarded), 0) as total_xp_today FROM habit_logs 
        WHERE student_id = ${studentId}::uuid AND log_date = ${today}::date
      `);
      const totalXpToday = parseInt((dailyXpResult as any[])[0]?.total_xp_today || '0');
      const atDailyLimit = totalXpToday >= dailyCap;
      const xpToAward = atDailyLimit ? 0 : habitXp;

      await db.execute(sql`
        INSERT INTO habit_logs (student_id, habit_name, xp_awarded, log_date) 
        VALUES (${studentId}::uuid, ${habitName}, ${xpToAward}, ${today}::date)
      `);

      if (xpToAward > 0) {
        await awardXP(studentId, xpToAward, 'home_dojo', { habitName });
      }

      const currentStreak = await calculateStreak(studentId);
      const newTotalXp = await getStudentXP(studentId);
      const updatedDailyXp = totalXpToday + xpToAward;

      res.json({
        success: true,
        xpAwarded: xpToAward,
        habitXp: xpToAward,
        newTotalXp,
        dailyXpEarned: updatedDailyXp,
        dailyXpCap: dailyCap,
        atDailyLimit: updatedDailyXp >= dailyCap,
        isPremium,
        streak: currentStreak,
        message: atDailyLimit ? 'Habit done! Daily limit reached.' : `+${xpToAward} XP`
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

      // Check premium for correct daily cap
      const isPremium = await hasHomeDojoPremium(studentId);
      const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;

      // Return totalXp as single source of truth (also as lifetimeXp for backward compatibility)
      res.json({ completedHabits, totalXpToday, dailyXpCap: dailyCap, totalXp, lifetimeXp: totalXp, streak, isPremium });
    } catch (error: any) {
      console.error('[HomeDojo] Status fetch error:', error.message);
      res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: HOME_DOJO_FREE_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
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
      // Validate challenge exists in database (supports both UUID and legacy IDs)
      const isUuid = uuidRegex.test(challengeId);
      let challengeValid = false;
      
      if (isUuid) {
        const challengeCheck = await db.execute(sql`
          SELECT id, name FROM family_challenges WHERE id = ${challengeId}::uuid AND is_active = true
        `);
        challengeValid = (challengeCheck as any[]).length > 0;
      }
      
      if (!challengeValid) {
        // Fallback to legacy static challenges for backward compatibility
        const legacyChallenge = FAMILY_CHALLENGES[challengeId];
        if (!legacyChallenge) {
          return res.status(400).json({ error: 'Invalid challengeId' });
        }
      }
      
      // Flat XP: 15/5 Local (win/lose) - consistency-focused ("world champion of yourself")
      const xp = won ? 15 : 5;
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

  // =====================================================
  // WORLD RANKINGS - Global Leaderboard System
  // =====================================================

  // Get world rankings with filters
  app.get('/api/world-rankings', async (req: Request, res: Response) => {
    try {
      const { category = 'students', sport, country, limit = 100, offset = 0 } = req.query;

      if (category === 'students') {
        // Ensure previous_rank and rank_snapshot_date columns exist
        try {
          await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_rank INTEGER DEFAULT NULL`);
          await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS rank_snapshot_date DATE DEFAULT NULL`);
        } catch (e) {
          // Columns likely already exist
        }

        // Get top students globally (from clubs that opted in)
        // IMPORTANT: Exclude demo students from real rankings
        let query = sql`
          SELECT 
            s.id,
            s.name,
            s.belt,
            s.global_xp,
            s.previous_rank,
            s.rank_snapshot_date,
            c.name as club_name,
            c.art_type as sport,
            c.country,
            c.city
          FROM students s
          JOIN clubs c ON s.club_id = c.id
          WHERE c.world_rankings_enabled = true
            AND c.status = 'active'
            AND COALESCE(s.global_xp, 0) > 0
            AND COALESCE(s.is_demo, false) = false
        `;

        if (sport && sport !== 'all') {
          query = sql`${query} AND c.art_type = ${sport}`;
        }
        if (country && country !== 'all') {
          query = sql`${query} AND c.country = ${country}`;
        }

        query = sql`${query} ORDER BY COALESCE(s.global_xp, 0) DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

        const result = await db.execute(query);
        
        // Add rank position and calculate rank change
        const rankings = (result as any[]).map((r, index) => {
          const currentRank = Number(offset) + index + 1;
          const prevRank = r.previous_rank ? Number(r.previous_rank) : null;
          const rankChange = prevRank !== null ? prevRank - currentRank : null;
          return {
            rank: currentRank,
            id: r.id,
            name: r.name,
            belt: r.belt,
            globalXp: r.global_xp || 0,
            clubName: r.club_name,
            sport: r.sport,
            country: r.country,
            city: r.city,
            rankChange
          };
        });

        // Update previous_rank ONLY once per day (daily snapshot)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        for (const s of rankings) {
          // Only update if snapshot date is not today (first call of the day)
          await db.execute(sql`
            UPDATE students 
            SET previous_rank = ${s.rank}, rank_snapshot_date = ${today}::date
            WHERE id = ${s.id} 
            AND (rank_snapshot_date IS NULL OR rank_snapshot_date < ${today}::date)
          `);
        }

        res.json({ category: 'students', rankings, total: rankings.length });
      } else if (category === 'clubs') {
        // Get top clubs globally (aggregate of student global_xp, normalized by count)
        let query = sql`
          SELECT 
            c.id,
            c.name,
            c.art_type as sport,
            c.country,
            c.city,
            c.global_score,
            COUNT(s.id) as student_count,
            COALESCE(SUM(s.global_xp), 0) as total_global_xp,
            CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.global_xp), 0) / COUNT(s.id) ELSE 0 END as avg_global_xp
          FROM clubs c
          LEFT JOIN students s ON s.club_id = c.id
          WHERE c.world_rankings_enabled = true
            AND c.status = 'active'
          GROUP BY c.id, c.name, c.art_type, c.country, c.city, c.global_score
          HAVING COUNT(s.id) > 0
        `;

        if (sport && sport !== 'all') {
          query = sql`
            SELECT * FROM (${query}) sub WHERE sport = ${sport}
          `;
        }

        const orderQuery = sql`
          SELECT * FROM (${query}) ranked
          ORDER BY avg_global_xp DESC
          LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `;

        const result = await db.execute(orderQuery);
        
        const rankings = (result as any[]).map((r, index) => ({
          rank: Number(offset) + index + 1,
          id: r.id,
          name: r.name,
          sport: r.sport,
          country: r.country,
          city: r.city,
          studentCount: Number(r.student_count),
          totalGlobalXp: Number(r.total_global_xp),
          avgGlobalXp: Math.round(Number(r.avg_global_xp)),
          globalScore: r.global_score || 0
        }));

        res.json({ category: 'clubs', rankings, total: rankings.length });
      } else {
        res.status(400).json({ error: 'Invalid category. Use "students" or "clubs"' });
      }
    } catch (error: any) {
      console.error('[World Rankings] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch world rankings' });
    }
  });

  // Get available sports (martial arts types) for filter
  app.get('/api/world-rankings/sports', async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT art_type FROM clubs 
        WHERE art_type IS NOT NULL AND art_type != ''
        ORDER BY art_type
      `);
      
      const sports = (result as any[]).map(r => r.art_type);
      res.json({ sports });
    } catch (error: any) {
      console.error('[World Rankings] Sports error:', error.message);
      res.status(500).json({ error: 'Failed to fetch sports' });
    }
  });

  // Get available countries for filter
  app.get('/api/world-rankings/countries', async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT country FROM clubs 
        WHERE country IS NOT NULL AND country != ''
        ORDER BY country
      `);
      
      const countries = (result as any[]).map(r => r.country);
      res.json({ countries });
    } catch (error: any) {
      console.error('[World Rankings] Countries error:', error.message);
      res.status(500).json({ error: 'Failed to fetch countries' });
    }
  });

  // Toggle world rankings opt-in for a club
  app.patch('/api/clubs/:clubId/world-rankings', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      await db.execute(sql`
        UPDATE clubs 
        SET world_rankings_enabled = ${enabled}, updated_at = NOW()
        WHERE id = ${clubId}::uuid
      `);

      console.log(`[World Rankings] Club ${clubId} opt-${enabled ? 'in' : 'out'}`);
      res.json({ success: true, enabled });
    } catch (error: any) {
      console.error('[World Rankings] Toggle error:', error.message);
      res.status(500).json({ error: 'Failed to update world rankings setting' });
    }
  });

  // Calculate Global XP for a grading session
  // Formula: 20 (attendance) + (score% × 30) = max 50 XP per session
  app.post('/api/students/:id/global-xp', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { scorePercentage } = req.body; // 0-100 percentage

      if (!id) {
        return res.status(400).json({ error: 'Student ID is required' });
      }

      // Validate Local XP (0-110 with MyTaek 110 Protocol)
      const rawScore = Number(scorePercentage);
      if (isNaN(rawScore)) {
        return res.status(400).json({ error: 'scorePercentage must be a valid number' });
      }
      const localXp = Math.max(0, Math.min(110, rawScore)); // Allow up to 110 (Legendary)

      // Calculate Global XP using the MyTaek 110 Protocol formula
      // Formula: min(round(20 + (localXp × 0.272)), 50)
      // This rewards Legendary students (110) with full 50 Global XP
      const attendanceXp = 20; // Fixed XP for showing up
      const performanceXp = localXp * 0.272; // 110 × 0.272 = 29.92, 100 × 0.272 = 27.2
      const sessionGlobalXp = Math.min(50, Math.round(attendanceXp + performanceXp)); // Round then cap at 50

      // Check if already graded today (daily cap)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const existingToday = await db.execute(sql`
        SELECT COUNT(*) as count FROM xp_transactions 
        WHERE student_id = ${id}::uuid 
          AND reason = 'Global grading'
          AND created_at >= ${todayStart.toISOString()}::timestamptz
      `);
      
      const alreadyGraded = Number((existingToday as any[])[0]?.count || 0) > 0;

      if (alreadyGraded) {
        // Already earned global XP today - skip for world rankings
        return res.json({ 
          success: true, 
          globalXpAwarded: 0, 
          message: 'Daily global XP cap reached',
          alreadyGraded: true 
        });
      }

      // Award global XP
      await db.execute(sql`
        UPDATE students 
        SET global_xp = COALESCE(global_xp, 0) + ${sessionGlobalXp}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);

      // Log the global XP transaction
      await db.execute(sql`
        INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
        VALUES (${id}::uuid, ${sessionGlobalXp}, 'EARN', 'Global grading', NOW())
      `);

      console.log(`[Global XP] Student ${id}: +${sessionGlobalXp} (attendance: ${attendanceXp}, performance: ${performanceXp})`);

      res.json({ 
        success: true, 
        globalXpAwarded: sessionGlobalXp,
        breakdown: { attendance: attendanceXp, performance: performanceXp }
      });
    } catch (error: any) {
      console.error('[Global XP] Error:', error.message);
      res.status(500).json({ error: 'Failed to award global XP' });
    }
  });

  // Get world rankings stats summary
  app.get('/api/world-rankings/stats', async (req: Request, res: Response) => {
    try {
      const clubsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM clubs WHERE world_rankings_enabled = true AND status = 'active'
      `);
      
      // Exclude demo students from stats count
      const studentsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true AND c.status = 'active'
          AND COALESCE(s.is_demo, false) = false
      `);
      
      const sportsResult = await db.execute(sql`
        SELECT COUNT(DISTINCT art_type) as count FROM clubs 
        WHERE world_rankings_enabled = true AND art_type IS NOT NULL
      `);

      const countriesResult = await db.execute(sql`
        SELECT COUNT(DISTINCT country) as count FROM clubs 
        WHERE world_rankings_enabled = true AND country IS NOT NULL
      `);

      res.json({
        participatingClubs: Number((clubsResult as any[])[0]?.count || 0),
        totalStudents: Number((studentsResult as any[])[0]?.count || 0),
        sportsRepresented: Number((sportsResult as any[])[0]?.count || 0),
        countriesRepresented: Number((countriesResult as any[])[0]?.count || 0)
      });
    } catch (error: any) {
      console.error('[World Rankings] Stats error:', error.message);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Get specific student's world rank (accurate even if ranked beyond top 100)
  app.get('/api/students/:studentId/world-rank', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;

      // Get student's global XP
      const studentResult = await db.execute(sql`
        SELECT s.id, s.name, COALESCE(s.global_xp, 0) as global_xp, c.world_rankings_enabled
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE s.id = ${studentId}::uuid
      `);

      if ((studentResult as any[]).length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const studentData = (studentResult as any[])[0];
      const myGlobalXP = Number(studentData.global_xp || 0);
      const clubEnabled = studentData.world_rankings_enabled;

      // If student has no global XP or club not enabled, they're not ranked
      if (myGlobalXP === 0 || !clubEnabled) {
        return res.json({
          rank: null,
          totalStudents: 0,
          globalXP: myGlobalXP,
          message: myGlobalXP === 0 
            ? 'No global XP earned yet' 
            : 'Club has not opted into World Rankings'
        });
      }

      // Count how many students have MORE global XP (rank = count + 1)
      // IMPORTANT: Exclude demo students from rank calculation
      const rankResult = await db.execute(sql`
        SELECT COUNT(*) as higher_count
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
          AND COALESCE(s.global_xp, 0) > ${myGlobalXP}
          AND COALESCE(s.is_demo, false) = false
      `);

      // Get total count of ranked students (excluding demo)
      const totalResult = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
          AND COALESCE(s.global_xp, 0) > 0
          AND COALESCE(s.is_demo, false) = false
      `);

      const higherCount = Number((rankResult as any[])[0]?.higher_count || 0);
      const totalStudents = Number((totalResult as any[])[0]?.total || 0);
      const myRank = higherCount + 1;

      res.json({
        rank: myRank,
        totalStudents,
        globalXP: myGlobalXP,
        percentile: totalStudents > 0 ? Math.round((1 - (myRank / totalStudents)) * 100) : 0
      });
    } catch (error: any) {
      console.error('[Student World Rank] Error:', error.message);
      res.status(500).json({ error: 'Failed to fetch world rank' });
    }
  });

  // =====================================================
  // FAMILY CHALLENGES CRUD - Super Admin Management
  // =====================================================

  // Super Admin: Get all family challenges (including inactive) - for local dev
  app.get('/api/super-admin/family-challenges', async (req: Request, res: Response) => {
    try {
      const challenges = await db.execute(sql`
        SELECT * FROM family_challenges ORDER BY display_order ASC, created_at ASC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[FamilyChallenges] Super Admin list error:', error.message);
      res.status(500).json({ error: 'Failed to fetch family challenges' });
    }
  });

  // Super Admin: Create family challenge - for local dev
  app.post('/api/super-admin/family-challenges', async (req: Request, res: Response) => {
    try {
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      if (!name || !description || !category) {
        return res.status(400).json({ error: 'Name, description, and category are required' });
      }
      const result = await db.execute(sql`
        INSERT INTO family_challenges (name, description, icon, category, demo_video_url, is_active, display_order)
        VALUES (${name}, ${description}, ${icon || '🎯'}, ${category}, ${demoVideoUrl || null}, ${isActive !== false}, ${displayOrder || 0})
        RETURNING *
      `);
      res.json((result as any[])[0]);
    } catch (error: any) {
      console.error('[FamilyChallenges] Super Admin create error:', error.message);
      res.status(500).json({ error: 'Failed to create family challenge' });
    }
  });

  // Super Admin: Update family challenge - for local dev
  app.put('/api/super-admin/family-challenges/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      const result = await db.execute(sql`
        UPDATE family_challenges
        SET name = COALESCE(${name}, name), description = COALESCE(${description}, description),
            icon = COALESCE(${icon}, icon), category = COALESCE(${category}, category),
            demo_video_url = ${demoVideoUrl ?? null}, is_active = COALESCE(${isActive}, is_active),
            display_order = COALESCE(${displayOrder}, display_order), updated_at = NOW()
        WHERE id = ${id}::uuid RETURNING *
      `);
      if ((result as any[]).length === 0) return res.status(404).json({ error: 'Challenge not found' });
      res.json((result as any[])[0]);
    } catch (error: any) {
      console.error('[FamilyChallenges] Super Admin update error:', error.message);
      res.status(500).json({ error: 'Failed to update family challenge' });
    }
  });

  // Super Admin: Delete family challenge - for local dev
  app.delete('/api/super-admin/family-challenges/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await db.execute(sql`DELETE FROM family_challenges WHERE id = ${id}::uuid`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[FamilyChallenges] Super Admin delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete family challenge' });
    }
  });

  // Get active family challenges (for Parent Portal - public)
  app.get('/api/family-challenges', async (req: Request, res: Response) => {
    try {
      const challenges = await db.execute(sql`
        SELECT * FROM family_challenges WHERE is_active = true ORDER BY display_order ASC, created_at ASC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[FamilyChallenges] List error:', error.message);
      res.status(500).json({ error: 'Failed to fetch family challenges' });
    }
  });

  // Get all family challenges including inactive (for Super Admin)
  app.get('/api/admin/family-challenges', async (req: Request, res: Response) => {
    try {
      const challenges = await db.execute(sql`
        SELECT * FROM family_challenges ORDER BY display_order ASC, created_at ASC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[FamilyChallenges] Admin list error:', error.message);
      res.status(500).json({ error: 'Failed to fetch family challenges' });
    }
  });

  // Create family challenge (Super Admin)
  app.post('/api/admin/family-challenges', async (req: Request, res: Response) => {
    try {
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      
      if (!name || !description || !category) {
        return res.status(400).json({ error: 'Name, description, and category are required' });
      }
      
      const result = await db.execute(sql`
        INSERT INTO family_challenges (name, description, icon, category, demo_video_url, is_active, display_order)
        VALUES (${name}, ${description}, ${icon || '🎯'}, ${category}, ${demoVideoUrl || null}, ${isActive !== false}, ${displayOrder || 0})
        RETURNING *
      `);
      
      res.json((result as any[])[0]);
    } catch (error: any) {
      console.error('[FamilyChallenges] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create family challenge' });
    }
  });

  // Update family challenge (Super Admin)
  app.put('/api/admin/family-challenges/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      
      const result = await db.execute(sql`
        UPDATE family_challenges
        SET 
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          icon = COALESCE(${icon}, icon),
          category = COALESCE(${category}, category),
          demo_video_url = ${demoVideoUrl},
          is_active = COALESCE(${isActive}, is_active),
          display_order = COALESCE(${displayOrder}, display_order),
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `);
      
      if ((result as any[]).length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      res.json((result as any[])[0]);
    } catch (error: any) {
      console.error('[FamilyChallenges] Update error:', error.message);
      res.status(500).json({ error: 'Failed to update family challenge' });
    }
  });

  // Delete family challenge (Super Admin)
  app.delete('/api/admin/family-challenges/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      await db.execute(sql`DELETE FROM family_challenges WHERE id = ${id}::uuid`);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[FamilyChallenges] Delete error:', error.message);
      res.status(500).json({ error: 'Failed to delete family challenge' });
    }
  });

  // Seed default family challenges (Super Admin - one-time setup)
  app.post('/api/admin/family-challenges/seed', async (req: Request, res: Response) => {
    try {
      const existingCount = await db.execute(sql`SELECT COUNT(*) as count FROM family_challenges`);
      if (Number((existingCount as any[])[0]?.count) > 0) {
        return res.json({ message: 'Challenges already seeded', count: Number((existingCount as any[])[0]?.count) });
      }
      
      const defaultChallenges = [
        { name: 'The Earthquake Plank', description: 'Parent holds a plank. Kid has 30 seconds to push, pull, or crawl under to break their balance. Parent survives = Parent wins!', icon: '🧱', category: 'Strength', displayOrder: 1 },
        { name: 'The Tunnel Bear', description: 'Parent holds a high plank. Kid crawls under, stands up, jumps over legs. Can Kid complete 10 cycles before Parent collapses?', icon: '🐻', category: 'Strength', displayOrder: 2 },
        { name: 'The Pillow Samurai', description: 'Sit facing each other, feet interlocked. Do a sit-up and throw a pillow. Catch it, sit-up, throw back. Drop it = lose a life!', icon: '🛋️', category: 'Strength', displayOrder: 3 },
        { name: 'Toe Tag', description: "Stand in fighting stance. Gently tap the top of opponent's foot with your foot. First to 5 taps wins!", icon: '🦶', category: 'Speed', displayOrder: 4 },
        { name: "The Dragon's Tail", description: "Tuck a sock in your waistband like a tail. Stay in the arena and steal the opponent's tail without losing yours!", icon: '🐉', category: 'Speed', displayOrder: 5 },
        { name: 'Knee-Slap Boxing', description: "Tag the opponent's knee with your hand. No blocking with hands - only move legs/hips to evade. First to 10 wins!", icon: '🥊', category: 'Speed', displayOrder: 6 },
        { name: 'The Ruler Ninja', description: 'Parent stands on chair and drops a ruler. Kid catches it. Parent can yell "KIAI!" to distract! Catch below 15cm = Black Belt Reflexes!', icon: '📏', category: 'Speed', displayOrder: 7 },
        { name: 'Sock Wars', description: "Both start on knees on carpet. Wrestle to remove the other person's socks. Last one with a sock on wins!", icon: '🧦', category: 'Focus', displayOrder: 8 },
        { name: 'The Mirror of Doom', description: 'Leader moves slowly, Follower copies. Leader can suddenly FREEZE - if Follower is still moving, they lose! 3 tricks to win.', icon: '🪞', category: 'Focus', displayOrder: 9 },
        { name: 'The Sleeping Tiger', description: "Parent lies down eyes closed. Kid creeps up to touch Parent's shoulder without being heard. If Parent points correctly, Kid restarts!", icon: '🐯', category: 'Focus', displayOrder: 10 },
      ];
      
      for (const c of defaultChallenges) {
        await db.execute(sql`
          INSERT INTO family_challenges (name, description, icon, category, is_active, display_order)
          VALUES (${c.name}, ${c.description}, ${c.icon}, ${c.category}, true, ${c.displayOrder})
        `);
      }
      
      res.json({ success: true, count: defaultChallenges.length });
    } catch (error: any) {
      console.error('[FamilyChallenges] Seed error:', error.message);
      res.status(500).json({ error: 'Failed to seed family challenges' });
    }
  });

  // =====================================================
  // DEMO MODE ENDPOINTS
  // =====================================================
  
  // Load demo data for a club
  app.post('/api/demo/load', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.body;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }
      
      const result = await loadDemoData(clubId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('[Demo] Load error:', error.message);
      res.status(500).json({ error: 'Failed to load demo data' });
    }
  });
  
  // Clear demo data for a club
  app.delete('/api/demo/clear', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.body;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }
      
      const result = await clearDemoData(clubId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('[Demo] Clear error:', error.message);
      res.status(500).json({ error: 'Failed to clear demo data' });
    }
  });
}
