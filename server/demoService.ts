import { db } from './db';
import { students, attendanceEvents, clubs } from './schema';
import { eq, and } from 'drizzle-orm';

const DEMO_STUDENTS = [
  { name: 'Daniel LaRusso', belt: 'Green', parentName: 'Lucille LaRusso', premiumStatus: 'parent_paid' as const },
  { name: 'Johnny Lawrence', belt: 'Black', parentName: 'Laura Lawrence', premiumStatus: 'parent_paid' as const },
  { name: 'Robby Keene', belt: 'Brown', parentName: 'Shannon Keene', premiumStatus: 'none' as const },
  { name: 'Miguel Diaz', belt: 'Red', parentName: 'Carmen Diaz', premiumStatus: 'parent_paid' as const },
  { name: 'Samantha LaRusso', belt: 'Blue', parentName: 'Amanda LaRusso', premiumStatus: 'parent_paid' as const },
  { name: 'Hawk Moskowitz', belt: 'Red', parentName: 'Paula Moskowitz', premiumStatus: 'none' as const },
  { name: 'Demetri Alexopoulos', belt: 'Green', parentName: 'Maria Alexopoulos', premiumStatus: 'parent_paid' as const },
  { name: 'Tory Nichols', belt: 'Blue', parentName: 'Karen Nichols', premiumStatus: 'none' as const },
  { name: 'Chris Evans', belt: 'Yellow', parentName: 'Sarah Evans', premiumStatus: 'parent_paid' as const },
  { name: 'Aisha Robinson', belt: 'Orange', parentName: 'Diane Robinson', premiumStatus: 'none' as const },
  { name: 'Kenny Payne', belt: 'White', parentName: 'Shawn Payne', premiumStatus: 'parent_paid' as const },
  { name: 'Devon Lee', belt: 'Yellow', parentName: 'Grace Lee', premiumStatus: 'none' as const },
  { name: 'Moon Park', belt: 'Orange', parentName: 'Jin Park', premiumStatus: 'parent_paid' as const },
  { name: 'Kyler Stevens', belt: 'White', parentName: 'Brad Stevens', premiumStatus: 'none' as const },
  { name: 'Bert Miller', belt: 'Yellow', parentName: 'Tom Miller', premiumStatus: 'none' as const },
  { name: 'Nate Johnson', belt: 'Green', parentName: 'Rick Johnson', premiumStatus: 'parent_paid' as const },
  { name: 'Yasmine Chen', belt: 'Blue', parentName: 'Lin Chen', premiumStatus: 'none' as const },
  { name: 'Louie Kim', belt: 'Orange', parentName: 'David Kim', premiumStatus: 'parent_paid' as const },
];

const CLASS_NAMES = ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team'];

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
      joinDate: randomDate(randomInt(30, 180)),
      isDemo: true,
    }));
    
    const insertedStudents = await db.insert(students).values(studentValues).returning();
    console.log('[DemoService] Inserted', insertedStudents.length, 'students');
    
    const attendanceValues: any[] = [];
    for (const student of insertedStudents) {
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

    // Fetch ALL students for this club (including any existing real ones + new demo ones)
    const allStudents = await db.select().from(students).where(eq(students.clubId, clubId));
    
    // Build wizard data with fresh student list
    const club = existingClub[0];
    const wizardData = {
      clubName: club.name || 'My Dojo',
      martialArt: club.martialArt || 'Taekwondo (WT)',
      ownerName: club.ownerName || 'Owner',
      email: club.email || '',
      students: allStudents.map(s => ({
        id: s.id,
        name: s.name,
        belt: s.belt,
        parentName: s.parentName,
        parentEmail: s.parentEmail,
        lifetimeXp: s.lifetimeXp || 0,
        globalXp: s.globalXp || 0,
        premiumStatus: s.premiumStatus || 'none',
        isDemo: s.isDemo || false,
      })),
      coaches: [],
      belts: [],
      schedule: [],
      events: [],
      curriculum: [],
      classes: [],
    };

    console.log('[DemoService] Demo data loaded successfully:', insertedStudents.length, 'students, returning wizardData with', allStudents.length, 'total students');
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
