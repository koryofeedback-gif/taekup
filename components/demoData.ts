import type { Student, Coach, ScheduleItem, CustomChallenge } from '../types';

export const DEMO_MODE_KEY = 'taekup_demo_mode';

export const isDemoModeEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
};

const createDemoStudent = (
    id: string, name: string, birthday: string, beltId: string, stripes: number,
    parentName: string, parentEmail: string, totalPoints: number, joinDate: string,
    gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say', attendanceCount: number
): Student => ({
    id, name, birthday, beltId, stripes, parentName, parentEmail, totalPoints, joinDate, gender,
    attendanceCount, location: 'Main Dojang', assignedClass: 'Kids Class', medicalInfo: '',
    lastPromotionDate: joinDate, isReadyForGrading: attendanceCount > 20,
    performanceHistory: [], feedbackHistory: [], badges: [], lifeSkillsHistory: [], customHabits: [],
});

export const DEMO_STUDENTS: Student[] = [
    createDemoStudent('demo-1', 'Alex Kim', '2015-03-15', 'yellow', 2, 'Sarah Kim', 'parent1@demo.com', 1250, '2024-06-01', 'Male', 45),
    createDemoStudent('demo-2', 'Jordan Lee', '2014-07-22', 'green', 1, 'Mike Lee', 'parent2@demo.com', 2800, '2024-01-15', 'Female', 78),
    createDemoStudent('demo-3', 'Taylor Park', '2013-11-08', 'blue', 3, 'Jenny Park', 'parent3@demo.com', 4200, '2023-09-01', 'Male', 112),
    createDemoStudent('demo-4', 'Sam Chen', '2012-05-30', 'red', 0, 'David Chen', 'parent4@demo.com', 5600, '2023-03-01', 'Male', 145),
    createDemoStudent('demo-5', 'Morgan Yoo', '2016-01-12', 'white', 1, 'Lisa Yoo', 'parent5@demo.com', 450, '2025-01-05', 'Female', 8),
    createDemoStudent('demo-6', 'Casey Hwang', '2015-09-25', 'yellow', 0, 'Tom Hwang', 'parent6@demo.com', 980, '2024-08-15', 'Other', 32),
    createDemoStudent('demo-7', 'Riley Cho', '2014-04-18', 'green', 2, 'Amy Cho', 'parent7@demo.com', 3100, '2024-02-01', 'Female', 67),
    createDemoStudent('demo-8', 'Jamie Song', '2013-12-03', 'blue', 1, 'Kevin Song', 'parent8@demo.com', 3900, '2023-11-01', 'Male', 95),
];

export const DEMO_COACHES: Coach[] = [
    { id: 'demo-coach-1', name: 'Master David Kim', email: 'david@demo.com', location: 'Main Dojang', assignedClasses: ['Kids Beginners', 'Kids Advanced', 'All Levels'] },
    { id: 'demo-coach-2', name: 'Sarah Johnson', email: 'sarah@demo.com', location: 'Main Dojang', assignedClasses: ['Kids Advanced', 'Weekend Warriors'] },
];

export const DEMO_SCHEDULE: ScheduleItem[] = [
    { id: 'demo-class-1', day: 'Monday', time: '16:00', className: 'Kids Beginners', instructor: 'Master David Kim', beltRequirement: 'All', location: 'Main Dojang' },
    { id: 'demo-class-2', day: 'Monday', time: '17:30', className: 'Kids Advanced', instructor: 'Sarah Johnson', beltRequirement: 'Green Belt+', location: 'Main Dojang' },
    { id: 'demo-class-3', day: 'Wednesday', time: '16:00', className: 'Kids Beginners', instructor: 'Master David Kim', beltRequirement: 'All', location: 'Main Dojang' },
    { id: 'demo-class-4', day: 'Wednesday', time: '17:30', className: 'Kids Advanced', instructor: 'Sarah Johnson', beltRequirement: 'Green Belt+', location: 'Main Dojang' },
    { id: 'demo-class-5', day: 'Friday', time: '16:00', className: 'All Levels', instructor: 'Master David Kim', beltRequirement: 'All', location: 'Main Dojang' },
    { id: 'demo-class-6', day: 'Saturday', time: '10:00', className: 'Weekend Warriors', instructor: 'Master David Kim', beltRequirement: 'All', location: 'Main Dojang' },
];

export const DEMO_STATS = {
    totalStudents: 8,
    activeStudents: 7,
    trialStudents: 1,
    totalCoaches: 2,
    classesThisWeek: 6,
    avgAttendance: 85,
    monthlyRevenue: 4200,
    revenueGrowth: 12,
    xpAwarded: 22380,
    videosSubmitted: 47,
    challengesCompleted: 156,
};

export const DEMO_LEADERBOARD = [
    { rank: 1, name: 'Sam Chen', xp: 5600, belt: 'Red Belt', trend: 'up' },
    { rank: 2, name: 'Taylor Park', xp: 4200, belt: 'Blue Belt', trend: 'same' },
    { rank: 3, name: 'Jamie Song', xp: 3900, belt: 'Blue Belt', trend: 'up' },
    { rank: 4, name: 'Riley Cho', xp: 3100, belt: 'Green Belt', trend: 'down' },
    { rank: 5, name: 'Jordan Lee', xp: 2800, belt: 'Green Belt', trend: 'up' },
];

export const DEMO_RECENT_ACTIVITY = [
    { type: 'xp', message: 'Sam Chen earned 50 HonorXP for video submission', time: '2 hours ago' },
    { type: 'attendance', message: 'Riley Cho checked into Kids Advanced class', time: '3 hours ago' },
    { type: 'belt', message: 'Jordan Lee promoted to Green Belt!', time: '1 day ago' },
    { type: 'video', message: 'Taylor Park submitted a new challenge video', time: '1 day ago' },
    { type: 'signup', message: 'New trial student: Morgan Yoo', time: '2 days ago' },
];

export interface DemoVideoSubmission {
    id: string;
    challengeId: string;
    challengeName: string;
    videoUrl: string;
    status: 'pending' | 'approved' | 'rejected';
    score: number;
    voteCount: number;
    coachNotes?: string;
    createdAt: string;
    challengeCategory?: string;
}

const today = new Date();
const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const fiveDaysAgo = new Date(today); fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

export const DEMO_VIDEO_SUBMISSIONS: DemoVideoSubmission[] = [
    {
        id: 'demo-vid-1',
        challengeId: 'arena-side-kick',
        challengeName: 'Side Kick Power Challenge',
        videoUrl: '',
        status: 'approved',
        score: 85,
        voteCount: 12,
        coachNotes: 'Excellent form! Great hip rotation and chamber. Keep your balance on the standing leg. Try to extend fully through the heel.',
        createdAt: yesterday.toISOString(),
        challengeCategory: 'arena',
    },
    {
        id: 'demo-vid-2',
        challengeId: 'academy-poomsae-1',
        challengeName: 'Taegeuk Il Jang Practice',
        videoUrl: '',
        status: 'pending',
        score: 0,
        voteCount: 0,
        createdAt: today.toISOString(),
        challengeCategory: 'academy',
    },
    {
        id: 'demo-vid-3',
        challengeId: 'arena-flexibility',
        challengeName: 'Splits Flexibility Check',
        videoUrl: '',
        status: 'rejected',
        score: 45,
        voteCount: 3,
        coachNotes: 'Good effort! Please record again with better lighting so I can see your form clearly. Also try to hold the position for at least 5 seconds.',
        createdAt: twoDaysAgo.toISOString(),
        challengeCategory: 'arena',
    },
    {
        id: 'demo-vid-4',
        challengeId: 'academy-breaking',
        challengeName: 'Board Breaking Technique',
        videoUrl: '',
        status: 'approved',
        score: 92,
        voteCount: 8,
        coachNotes: 'Fantastic technique! Your focus and follow-through are spot on. This is exactly what we want to see. Ready for the next level!',
        createdAt: fiveDaysAgo.toISOString(),
        challengeCategory: 'academy',
    },
];

export const DEMO_CUSTOM_CHALLENGES: CustomChallenge[] = [
    {
        id: 'demo-challenge-1',
        name: 'Triple Kick Combo',
        description: 'Perform a front kick, roundhouse kick, and side kick combination without dropping your leg.',
        category: 'Technique',
        icon: '🦵',
        xp: 40,
        demoVideoUrl: '',
        difficulty: 'Medium',
        measurementType: 'count',
        measurementUnit: 'reps',
        createdBy: 'demo-coach-1',
        createdByName: 'Master David Kim',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        targetAudience: 'all',
        challengeType: 'coach_pick',
    },
    {
        id: 'demo-challenge-2',
        name: 'Tornado Kick Challenge',
        description: 'Execute 5 clean tornado kicks with proper rotation and chamber. Focus on balance and height.',
        category: 'Power',
        icon: '🌪️',
        xp: 50,
        demoVideoUrl: '',
        difficulty: 'Hard',
        measurementType: 'count',
        measurementUnit: 'reps',
        createdBy: 'demo-coach-1',
        createdByName: 'Master David Kim',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        targetAudience: 'intermediate',
        challengeType: 'coach_pick',
        weeklyChallenge: true,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 'demo-challenge-3',
        name: 'Full Split Hold',
        description: 'Hold a full split position for 30 seconds. Keep your hips squared and back straight.',
        category: 'Flexibility',
        icon: '🧘',
        xp: 35,
        demoVideoUrl: '',
        difficulty: 'Hard',
        measurementType: 'time',
        measurementUnit: 'seconds',
        createdBy: 'demo-coach-2',
        createdByName: 'Sarah Johnson',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        targetAudience: 'all',
        challengeType: 'general',
    },
    {
        id: 'demo-challenge-4',
        name: 'Speed Punches',
        description: 'Perform as many clean jab-cross combinations as possible in 30 seconds.',
        category: 'Power',
        icon: '👊',
        xp: 25,
        demoVideoUrl: '',
        difficulty: 'Easy',
        measurementType: 'count',
        measurementUnit: 'combos',
        createdBy: 'demo-coach-1',
        createdByName: 'Master David Kim',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: false,
        targetAudience: 'beginners',
        challengeType: 'general',
    },
];

export const DEMO_PENDING_VIDEOS = [
    {
        id: 'demo-pending-1',
        student_id: 'demo-2',
        student_name: 'Jordan Lee',
        student_belt: 'Green Belt',
        challenge_name: 'Roundhouse Kick Combo',
        challenge_category: 'Coach Picks',
        video_url: '',
        video_duration: 12,
        status: 'pending',
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        ai_flag: null,
        ai_flag_reason: null,
        is_spot_check: false,
        source: 'arena'
    },
    {
        id: 'demo-pending-2',
        student_id: 'demo-3',
        student_name: 'Taylor Park',
        student_belt: 'Blue Belt',
        challenge_name: 'Triple Kick Combo',
        challenge_category: 'Coach Picks',
        video_url: '',
        video_duration: 18,
        status: 'pending',
        created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        ai_flag: 'yellow',
        ai_flag_reason: 'High submission rate (3 in 1 hour)',
        is_spot_check: true,
        source: 'arena'
    },
    {
        id: 'demo-pending-3',
        student_id: 'demo-1',
        student_name: 'Alex Kim',
        student_belt: 'Yellow Belt',
        challenge_name: 'Full Split Hold',
        challenge_category: 'gauntlet',
        video_url: '',
        video_duration: 35,
        status: 'pending',
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        ai_flag: null,
        ai_flag_reason: null,
        is_spot_check: false,
        source: 'gauntlet'
    },
    {
        id: 'demo-pending-4',
        student_id: 'demo-7',
        student_name: 'Riley Cho',
        student_belt: 'Green Belt',
        challenge_name: 'Speed Punches',
        challenge_category: 'academy',
        video_url: '',
        video_duration: 28,
        status: 'pending',
        created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        ai_flag: null,
        ai_flag_reason: null,
        is_spot_check: false,
        source: 'academy'
    },
];
