import { db } from './db';
import { students, attendanceEvents, clubs } from './schema';
import { eq, and, sql } from 'drizzle-orm';

function getUpcomingBirthday(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setFullYear(date.getFullYear() - 12);
  return date.toISOString().split('T')[0];
}

const DEMO_STUDENTS = [
  { name: 'Daniel LaRusso', belt: 'Green', parentName: 'Lucille LaRusso', premiumStatus: 'parent_paid' as const, birthday: getUpcomingBirthday(3), isAtRisk: false },
  { name: 'Johnny Lawrence', belt: 'Black', parentName: 'Laura Lawrence', premiumStatus: 'parent_paid' as const, birthday: getUpcomingBirthday(14), isAtRisk: false },
  { name: 'Robby Keene', belt: 'Brown', parentName: 'Shannon Keene', premiumStatus: 'none' as const, birthday: null, isAtRisk: true },
  { name: 'Miguel Diaz', belt: 'Red', parentName: 'Carmen Diaz', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Samantha LaRusso', belt: 'Blue', parentName: 'Amanda LaRusso', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Hawk Moskowitz', belt: 'Red', parentName: 'Paula Moskowitz', premiumStatus: 'none' as const, birthday: null, isAtRisk: true },
  { name: 'Demetri Alexopoulos', belt: 'Green', parentName: 'Maria Alexopoulos', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Tory Nichols', belt: 'Blue', parentName: 'Karen Nichols', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Chris Evans', belt: 'Yellow', parentName: 'Sarah Evans', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Aisha Robinson', belt: 'Orange', parentName: 'Diane Robinson', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Kenny Payne', belt: 'White', parentName: 'Shawn Payne', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Devon Lee', belt: 'Yellow', parentName: 'Grace Lee', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Moon Park', belt: 'Orange', parentName: 'Jin Park', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Kyler Stevens', belt: 'White', parentName: 'Brad Stevens', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Bert Miller', belt: 'Yellow', parentName: 'Tom Miller', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Nate Johnson', belt: 'Green', parentName: 'Rick Johnson', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
  { name: 'Yasmine Chen', belt: 'Blue', parentName: 'Lin Chen', premiumStatus: 'none' as const, birthday: null, isAtRisk: false },
  { name: 'Louie Kim', belt: 'Orange', parentName: 'David Kim', premiumStatus: 'parent_paid' as const, birthday: null, isAtRisk: false },
];

const CLASS_NAMES = ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'];

const DEMO_SKILLS = [
  { id: 'discipline', name: 'Discipline', isActive: true },
  { id: 'technique', name: 'Technique', isActive: true },
  { id: 'focus', name: 'Focus', isActive: true },
  { id: 'power', name: 'Power', isActive: true },
];

const DEMO_COACHES = [
  { id: 'coach-1', name: 'Sensei John Kreese', email: 'kreese@demo.taekup.com', location: 'Main Location', assignedClasses: ['Sparring Team', 'Adult Class'] },
  { id: 'coach-2', name: 'Master Daniel LaRusso', email: 'daniel@demo.taekup.com', location: 'Main Location', assignedClasses: ['Kids Class', 'General Class'] },
];

const DEMO_BELTS = [
  { id: 'white', name: 'White', color: '#FFFFFF' },
  { id: 'yellow', name: 'Yellow', color: '#FFD700' },
  { id: 'orange', name: 'Orange', color: '#FF8C00' },
  { id: 'green', name: 'Green', color: '#228B22' },
  { id: 'blue', name: 'Blue', color: '#0066CC' },
  { id: 'red', name: 'Red', color: '#CC0000' },
  { id: 'brown', name: 'Brown', color: '#8B4513' },
  { id: 'black', name: 'Black', color: '#000000' },
];

const DEMO_SCHEDULE = [
  { id: 's1', day: 'Monday', time: '16:00', duration: 60, className: 'Kids Class', location: 'Main Location' },
  { id: 's2', day: 'Monday', time: '18:00', duration: 90, className: 'Adult Class', location: 'Main Location' },
  { id: 's3', day: 'Wednesday', time: '16:00', duration: 60, className: 'Kids Class', location: 'Main Location' },
  { id: 's4', day: 'Wednesday', time: '18:00', duration: 90, className: 'Sparring Team', location: 'Main Location' },
  { id: 's5', day: 'Friday', time: '16:00', duration: 60, className: 'General Class', location: 'Main Location' },
  { id: 's6', day: 'Saturday', time: '10:00', duration: 120, className: 'Tournament Prep', location: 'Main Location' },
];

export const DEMO_WORLD_RANKINGS = [
  { rank: 1, name: 'Kenji Tanaka', belt: 'Black', globalXp: 5200, clubName: 'Tokyo Martial Arts Academy', sport: 'Karate', country: 'Japan', city: 'Tokyo' },
  { rank: 2, name: 'Johnny Lawrence', belt: 'Black', globalXp: 4850, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo', country: 'USA', city: 'Los Angeles' },
  { rank: 3, name: 'Lucas Silva', belt: 'Brown', globalXp: 4500, clubName: 'Gracie Barra Rio', sport: 'BJJ', country: 'Brazil', city: 'Rio de Janeiro' },
  { rank: 4, name: 'Miguel Diaz', belt: 'Red', globalXp: 4320, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo', country: 'USA', city: 'Los Angeles' },
  { rank: 5, name: 'Yuki Nakamura', belt: 'Black', globalXp: 4100, clubName: 'Kodokan Judo Institute', sport: 'Judo', country: 'Japan', city: 'Osaka' },
  { rank: 6, name: 'Robby Keene', belt: 'Brown', globalXp: 3980, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 7, name: 'Min-Jun Park', belt: 'Red', globalXp: 3800, clubName: 'Seoul Tigers TKD', sport: 'Taekwondo', country: 'South Korea', city: 'Seoul' },
  { rank: 8, name: 'Samantha LaRusso', belt: 'Blue', globalXp: 3650, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 9, name: 'Carlos Martinez', belt: 'Purple', globalXp: 3500, clubName: 'Alliance BJJ Madrid', sport: 'BJJ', country: 'Spain', city: 'Madrid' },
  { rank: 10, name: 'Hawk Moskowitz', belt: 'Red', globalXp: 3420, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo', country: 'USA', city: 'Los Angeles' },
  { rank: 11, name: 'Amir Hassan', belt: 'Black', globalXp: 3300, clubName: 'Tehran Champions', sport: 'Taekwondo', country: 'Iran', city: 'Tehran' },
  { rank: 12, name: 'Tory Nichols', belt: 'Blue', globalXp: 3180, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo', country: 'USA', city: 'Los Angeles' },
  { rank: 13, name: 'Wei Chen', belt: 'Black', globalXp: 3050, clubName: 'Shaolin Kung Fu Academy', sport: 'Kung Fu', country: 'China', city: 'Beijing' },
  { rank: 14, name: 'Daniel LaRusso', belt: 'Green', globalXp: 2890, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 15, name: 'Emma Thompson', belt: 'Blue', globalXp: 2750, clubName: 'London BJJ Academy', sport: 'BJJ', country: 'UK', city: 'London' },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);
  return date;
}

export async function loadDemoData(clubId: string): Promise<{ success: boolean; message: string; studentCount: number; wizardData?: any }> {
  console.log('[DemoService] Starting loadDemoData for clubId:', clubId);
  try {
    const existingClub = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
    console.log('[DemoService] Club lookup result:', existingClub.length > 0 ? 'found' : 'not found');
    
    if (!existingClub.length) {
      return { success: false, message: 'Club not found', studentCount: 0 };
    }
    
    if (existingClub[0].hasDemoData) {
      console.log('[DemoService] Demo data already exists for this club');
      return { success: false, message: 'Demo data already loaded. Clear it first from dashboard settings.', studentCount: 0 };
    }

    console.log('[DemoService] Inserting demo students...');
    
    const studentValues = DEMO_STUDENTS.map(demoStudent => ({
      clubId,
      name: demoStudent.name,
      belt: demoStudent.belt,
      parentName: demoStudent.parentName,
      parentEmail: `${demoStudent.name.toLowerCase().replace(' ', '.')}@demo.taekup.com`,
      lifetimeXp: randomInt(200, 2500),
      globalXp: randomInt(50, 500),
      premiumStatus: demoStudent.premiumStatus,
      premiumStartedAt: demoStudent.premiumStatus === 'parent_paid' ? randomDate(randomInt(7, 60)) : null,
      joinDate: demoStudent.isAtRisk ? randomDate(60) : randomDate(randomInt(30, 180)),
      birthdate: demoStudent.birthday ? new Date(demoStudent.birthday) : null,
      isDemo: true,
    }));
    
    const insertedStudents = await db.insert(students).values(studentValues).returning();
    console.log('[DemoService] Inserted', insertedStudents.length, 'students');
    
    const attendanceValues: any[] = [];
    const atRiskNames = DEMO_STUDENTS.filter(s => s.isAtRisk).map(s => s.name);
    for (const student of insertedStudents) {
      if (atRiskNames.includes(student.name)) {
        continue;
      }
      const attendanceCount = randomInt(8, 15);
      for (let i = 0; i < attendanceCount; i++) {
        attendanceValues.push({
          clubId,
          studentId: student.id,
          attendedAt: randomDate(randomInt(0, 30)),
          className: CLASS_NAMES[randomInt(0, CLASS_NAMES.length - 1)],
          isDemo: true,
        });
      }
    }
    
    if (attendanceValues.length > 0) {
      await db.insert(attendanceEvents).values(attendanceValues);
      console.log('[DemoService] Inserted', attendanceValues.length, 'attendance records');
    }

    await db.update(clubs)
      .set({ hasDemoData: true })
      .where(eq(clubs.id, clubId));
    
    console.log('[DemoService] Fetching all students for wizard data...');

    // Fetch ALL students for this club (including any existing real ones + new demo ones)
    const allStudents = await db.select().from(students).where(eq(students.clubId, clubId));
    
    // Build wizard data with fresh student list and complete demo data
    const club = existingClub[0];
    const wizardData = {
      clubName: club.name || 'Cobra Kai Dojo',
      martialArt: club.artType || 'Taekwondo (WT)',
      ownerName: club.ownerName || 'Sensei',
      email: club.ownerEmail || '',
      branches: 1,
      branchNames: ['Main Location'],
      students: allStudents.map(s => {
        const demoInfo = DEMO_STUDENTS.find(d => d.name === s.name);
        const isAtRisk = demoInfo?.isAtRisk || false;
        const historyLength = isAtRisk ? 0 : randomInt(8, 15);
        const performanceHistory = isAtRisk ? [] : Array.from({ length: historyLength }, (_, i) => ({
          date: new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000).toISOString(),
          score: randomInt(70, 100),
        }));
        return {
          id: s.id,
          name: s.name,
          belt: s.belt,
          parentName: s.parentName,
          parentEmail: s.parentEmail,
          birthday: s.birthdate?.toISOString?.()?.split('T')[0] || demoInfo?.birthday || null,
          lifetimeXp: s.lifetimeXp || 0,
          globalXp: s.globalXp || 0,
          premiumStatus: s.premiumStatus || 'none',
          isDemo: s.isDemo || false,
          totalPoints: isAtRisk ? 0 : randomInt(50, 500),
          attendanceCount: performanceHistory.length,
          joinDate: s.joinDate?.toISOString?.() || s.joinDate || new Date().toISOString(),
          performanceHistory,
        };
      }),
      coaches: DEMO_COACHES,
      belts: DEMO_BELTS,
      skills: DEMO_SKILLS,
      schedule: DEMO_SCHEDULE,
      worldRankings: DEMO_WORLD_RANKINGS,
      events: [
        { id: 'e1', title: 'Belt Test', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), type: 'promotion' },
        { id: 'e2', title: 'Tournament', date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), type: 'competition' },
      ],
      curriculum: [],
      classes: CLASS_NAMES,
      customChallenges: [],
      privateSlots: [],
      pointsPerStripe: 100,
      stripesPerBelt: 4,
      homeworkBonus: true,
      coachBonus: true,
      worldRankingsEnabled: true,
      isDemo: true,
    };

    // Save wizardData to database so it persists after logout/cache clear
    // Use raw SQL because the column is wizard_data (snake_case) not wizardData
    await db.execute(sql`
      UPDATE clubs 
      SET wizard_data = ${JSON.stringify(wizardData)}::jsonb,
          updated_at = NOW()
      WHERE id = ${clubId}::uuid
    `);
    
    console.log('[DemoService] Demo data loaded and saved to database:', insertedStudents.length, 'students, returning wizardData with', allStudents.length, 'total students');
    return { 
      success: true, 
      message: 'Demo data loaded successfully', 
      studentCount: insertedStudents.length,
      wizardData,
    };
  } catch (error: any) {
    console.error('[DemoService] Error loading demo data:', error.message);
    console.error('[DemoService] Full error:', error);
    return { success: false, message: `Failed to load demo data: ${error.message}`, studentCount: 0 };
  }
}

export async function clearDemoData(clubId: string): Promise<{ success: boolean; message: string; deletedCount: number }> {
  try {
    const existingClub = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
    if (!existingClub.length) {
      return { success: false, message: 'Club not found', deletedCount: 0 };
    }
    
    if (!existingClub[0].hasDemoData) {
      return { success: false, message: 'No demo data to clear', deletedCount: 0 };
    }

    await db.delete(attendanceEvents)
      .where(and(eq(attendanceEvents.clubId, clubId), eq(attendanceEvents.isDemo, true)));

    const deletedStudents = await db.delete(students)
      .where(and(eq(students.clubId, clubId), eq(students.isDemo, true)))
      .returning();

    await db.update(clubs)
      .set({ hasDemoData: false })
      .where(eq(clubs.id, clubId));

    return { 
      success: true, 
      message: 'Demo data cleared successfully', 
      deletedCount: deletedStudents.length 
    };
  } catch (error) {
    console.error('Error clearing demo data:', error);
    return { success: false, message: 'Failed to clear demo data', deletedCount: 0 };
  }
}
