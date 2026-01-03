export const DEMO_STUDENTS = [
  { name: 'Alex Kim', parentName: 'Susan Kim', parentEmail: 'susan.kim@demo.com', belt: 'Yellow', location: 'Main Location', assignedClass: 'Beginner Class' },
  { name: 'Emma Johnson', parentName: 'Michael Johnson', parentEmail: 'mike.j@demo.com', belt: 'Orange', location: 'Main Location', assignedClass: 'General Class' },
  { name: 'Lucas Chen', parentName: 'Wei Chen', parentEmail: 'wei.chen@demo.com', belt: 'Green', location: 'Main Location', assignedClass: 'Adult Class' },
  { name: 'Sophia Martinez', parentName: 'Carlos Martinez', parentEmail: 'carlos.m@demo.com', belt: 'Blue', location: 'Main Location', assignedClass: 'Sparring Team' },
  { name: 'Ethan Williams', parentName: 'Jennifer Williams', parentEmail: 'jen.w@demo.com', belt: 'Red', location: 'Main Location', assignedClass: 'Sparring Team' },
  { name: 'Olivia Brown', parentName: 'David Brown', parentEmail: 'david.b@demo.com', belt: 'White', location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Noah Davis', parentName: 'Lisa Davis', parentEmail: 'lisa.d@demo.com', belt: 'Yellow', location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Ava Wilson', parentName: 'James Wilson', parentEmail: 'james.w@demo.com', belt: 'Orange', location: 'Downtown Studio', assignedClass: 'General Class' },
  { name: 'Liam Taylor', parentName: 'Emily Taylor', parentEmail: 'emily.t@demo.com', belt: 'Green', location: 'Downtown Studio', assignedClass: 'General Class' },
  { name: 'Isabella Moore', parentName: 'Robert Moore', parentEmail: 'robert.m@demo.com', belt: 'Blue', location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Mason Anderson', parentName: 'Sarah Anderson', parentEmail: 'sarah.a@demo.com', belt: 'Yellow', location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Mia Thomas', parentName: 'Mark Thomas', parentEmail: 'mark.t@demo.com', belt: 'Orange', location: 'West Side Dojo', assignedClass: 'General Class' },
  { name: 'James Jackson', parentName: 'Karen Jackson', parentEmail: 'karen.j@demo.com', belt: 'White', location: 'Main Location', assignedClass: 'Beginner Class' },
  { name: 'Charlotte White', parentName: 'Tom White', parentEmail: 'tom.w@demo.com', belt: 'Green', location: 'Downtown Studio', assignedClass: 'General Class' },
  { name: 'Benjamin Harris', parentName: 'Nancy Harris', parentEmail: 'nancy.h@demo.com', belt: 'Red', location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Amelia Martin', parentName: 'Steve Martin', parentEmail: 'steve.m@demo.com', belt: 'Brown', location: 'Main Location', assignedClass: 'Adult Class' },
  { name: 'Henry Lee', parentName: 'Michelle Lee', parentEmail: 'michelle.l@demo.com', belt: 'Black', location: 'Main Location', assignedClass: 'Sparring Team' },
  { name: 'Evelyn Clark', parentName: 'Brian Clark', parentEmail: 'brian.c@demo.com', belt: 'Blue', location: 'West Side Dojo', assignedClass: 'Teen Class' },
];

export const DEMO_BRANCHES = ['Main Location', 'Downtown Studio', 'West Side Dojo'];

export const DEMO_LOCATION_CLASSES: Record<string, string[]> = {
  'Main Location': ['Beginner Class', 'General Class', 'Adult Class', 'Sparring Team'],
  'Downtown Studio': ['Kids Class', 'General Class'],
  'West Side Dojo': ['Teen Class', 'General Class'],
};

export const CLASS_NAMES = ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team', 'Teen Class', 'Beginner Class'];

export const DEMO_SKILLS = [
  { id: 'discipline', name: 'Discipline', isActive: true },
  { id: 'technique', name: 'Technique', isActive: true },
  { id: 'focus', name: 'Focus', isActive: true },
  { id: 'power', name: 'Power', isActive: true },
];

export const DEMO_COACHES = [
  { id: 'coach-1', name: 'Sensei John Kreese', email: 'kreese@demo.taekup.com', location: 'Main Location', assignedClasses: ['Sparring Team', 'Adult Class'] },
  { id: 'coach-2', name: 'Master Daniel LaRusso', email: 'daniel@demo.taekup.com', location: 'Main Location', assignedClasses: ['Kids Class', 'General Class'] },
];

export const DEMO_BELTS = [
  { id: 'white', name: 'White', color1: '#FFFFFF' },
  { id: 'yellow', name: 'Yellow', color1: '#FFD700' },
  { id: 'orange', name: 'Orange', color1: '#FF8C00' },
  { id: 'green', name: 'Green', color1: '#228B22' },
  { id: 'blue', name: 'Blue', color1: '#0066CC' },
  { id: 'red', name: 'Red', color1: '#CC0000' },
  { id: 'brown', name: 'Brown', color1: '#8B4513' },
  { id: 'black', name: 'Black', color1: '#000000' },
];

export const DEMO_SCHEDULE = [
  { id: 's1', day: 'Monday', time: '17:00', duration: 60, className: 'Beginner Class', location: 'Main Location', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's2', day: 'Monday', time: '18:30', duration: 90, className: 'Adult Class', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's3', day: 'Wednesday', time: '17:00', duration: 60, className: 'Beginner Class', location: 'Main Location', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's4', day: 'Wednesday', time: '18:30', duration: 90, className: 'Sparring Team', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'green' },
  { id: 's5', day: 'Friday', time: '18:00', duration: 90, className: 'Adult Class', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's6', day: 'Saturday', time: '09:00', duration: 120, className: 'Sparring Team', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'blue' },
  { id: 's7', day: 'Monday', time: '15:30', duration: 45, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's8', day: 'Tuesday', time: '16:00', duration: 60, className: 'General Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's9', day: 'Wednesday', time: '15:30', duration: 45, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's10', day: 'Thursday', time: '16:00', duration: 60, className: 'General Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's11', day: 'Saturday', time: '10:00', duration: 60, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's12', day: 'Tuesday', time: '17:00', duration: 60, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's13', day: 'Tuesday', time: '18:30', duration: 60, className: 'General Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's14', day: 'Thursday', time: '17:00', duration: 60, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's15', day: 'Thursday', time: '18:30', duration: 60, className: 'General Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's16', day: 'Saturday', time: '11:00', duration: 90, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'yellow' },
];

export const DEMO_WORLD_RANKINGS = [
  { rank: 1, name: 'Park Tae-joon', belt: 'Black', globalXp: 5200, clubName: 'Korea Tigers Academy', sport: 'Taekwondo WT', country: 'South Korea', city: 'Seoul' },
  { rank: 2, name: 'Yuki Tanaka', belt: 'Black', globalXp: 4980, clubName: 'Tokyo Martial Arts', sport: 'Karate', country: 'Japan', city: 'Tokyo' },
  { rank: 3, name: 'Lucas Silva', belt: 'Black', globalXp: 4850, clubName: 'Gracie Barra Rio', sport: 'BJJ', country: 'Brazil', city: 'Rio de Janeiro' },
  { rank: 4, name: 'Ali Hosseini', belt: 'Black', globalXp: 4720, clubName: 'Tehran Champions', sport: 'Taekwondo WT', country: 'Iran', city: 'Tehran' },
  { rank: 5, name: 'Johnny Lawrence', belt: 'Black', globalXp: 4650, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo ITF', country: 'USA', city: 'Los Angeles' },
  { rank: 6, name: 'Maria Garcia', belt: 'Red', globalXp: 4420, clubName: 'Madrid Warriors', sport: 'Taekwondo WT', country: 'Spain', city: 'Madrid' },
  { rank: 7, name: 'Chen Wei', belt: 'Black', globalXp: 4280, clubName: 'Beijing Kung Fu', sport: 'Kung Fu', country: 'China', city: 'Beijing' },
  { rank: 8, name: 'Miguel Diaz', belt: 'Red', globalXp: 4150, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo ITF', country: 'USA', city: 'Los Angeles' },
  { rank: 9, name: 'Ahmed Hassan', belt: 'Brown', globalXp: 3980, clubName: 'Cairo Fighters', sport: 'Judo', country: 'Egypt', city: 'Cairo' },
  { rank: 10, name: 'Sophie Martin', belt: 'Brown', globalXp: 3850, clubName: 'Paris Dojo', sport: 'Karate', country: 'France', city: 'Paris' },
  { rank: 11, name: 'Robby Keene', belt: 'Brown', globalXp: 3720, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 12, name: 'Kim Min-su', belt: 'Blue', globalXp: 3580, clubName: 'Busan Elite', sport: 'Hapkido', country: 'South Korea', city: 'Busan' },
  { rank: 13, name: 'Fatima Al-Rashid', belt: 'Blue', globalXp: 3450, clubName: 'Dubai Martial Arts', sport: 'Taekwondo WT', country: 'UAE', city: 'Dubai' },
  { rank: 14, name: 'Samantha LaRusso', belt: 'Blue', globalXp: 3320, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 15, name: 'Dimitri Petrov', belt: 'Blue', globalXp: 3180, clubName: 'Moscow Academy', sport: 'Judo', country: 'Russia', city: 'Moscow' },
];

export function getDemoPrivateSlots() {
  const slots = [];
  const coaches = ['Master Daniel LaRusso', 'Sensei John Kreese'];
  const locations = ['Main Location', 'Downtown Studio', 'West Side Dojo'];
  const times = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
  const prices = [40, 50, 60];
  
  for (let i = 0; i < 8; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i + 1);
    const isBooked = i < 3;
    const bookedStudent = isBooked ? DEMO_STUDENTS[i % DEMO_STUDENTS.length] : null;
    
    slots.push({
      id: `ps${i + 1}`,
      date: futureDate.toISOString().split('T')[0],
      time: times[i % times.length],
      duration: 60,
      coachName: coaches[i % coaches.length],
      location: locations[i % locations.length],
      price: prices[i % prices.length],
      isBooked,
      bookedBy: bookedStudent?.name || null,
      bookedByParent: bookedStudent?.parentName || null,
    });
  }
  return slots;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);
  return date;
}

// Demo Parent Dashboard Data
export const DEMO_PARENT_LEADERBOARD = [
  { id: 'd1', name: 'Henry Lee', totalXP: 2850, monthlyXP: 420, belt: 'black', stripes: 1 },
  { id: 'd2', name: 'Ethan Williams', totalXP: 2340, monthlyXP: 380, belt: 'red', stripes: 2 },
  { id: 'd3', name: 'Sophia Martinez', totalXP: 2180, monthlyXP: 350, belt: 'blue', stripes: 3 },
  { id: 'd4', name: 'Amelia Martin', totalXP: 1920, monthlyXP: 290, belt: 'brown', stripes: 1 },
  { id: 'd5', name: 'Lucas Chen', totalXP: 1780, monthlyXP: 275, belt: 'green', stripes: 2 },
  { id: 'd6', name: 'Liam Taylor', totalXP: 1650, monthlyXP: 240, belt: 'green', stripes: 1 },
  { id: 'd7', name: 'Emma Johnson', totalXP: 1520, monthlyXP: 220, belt: 'orange', stripes: 3 },
  { id: 'd8', name: 'Ava Wilson', totalXP: 1380, monthlyXP: 195, belt: 'orange', stripes: 2 },
  { id: 'd9', name: 'Charlotte White', totalXP: 1240, monthlyXP: 180, belt: 'green', stripes: 1 },
  { id: 'd10', name: 'Isabella Moore', totalXP: 1100, monthlyXP: 165, belt: 'blue', stripes: 1 },
];

export const DEMO_STUDENT_STATS = {
  attendanceDates: [
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  ],
  xpTrend: [
    { date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 45, dayName: 'Mon' },
    { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 0, dayName: 'Tue' },
    { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 80, dayName: 'Wed' },
    { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 25, dayName: 'Thu' },
    { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 60, dayName: 'Fri' },
    { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], xp: 40, dayName: 'Sat' },
    { date: new Date().toISOString().split('T')[0], xp: 35, dayName: 'Sun' },
  ],
  characterDevelopment: {
    technique: { name: 'Technique', score: 78, trend: 'up', description: 'Form and execution quality' },
    discipline: { name: 'Discipline', score: 85, trend: 'up', description: 'Consistency and focus' },
    consistency: { name: 'Consistency', score: 72, trend: 'stable', description: 'Regular practice habits' },
  },
  categoryBreakdown: [
    { category: 'Power', submissions: 8, approved: 7, xpEarned: 280 },
    { category: 'Technique', submissions: 12, approved: 11, xpEarned: 440 },
    { category: 'Flexibility', submissions: 5, approved: 5, xpEarned: 200 },
  ],
  totalSubmissions: 25,
  approvalRate: 92,
};

export const DEMO_HABITS_STATUS = {
  todayChecked: ['habit-1', 'habit-3'],
  streak: 5,
  lastCheckDate: new Date().toISOString().split('T')[0],
  weeklyProgress: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
};

export const DEMO_CUSTOM_HABITS = [
  { id: 'habit-1', question: 'Did you practice kicks today?', icon: '🦵', xp: 10 },
  { id: 'habit-2', question: 'Did you stretch for 10 minutes?', icon: '🧘', xp: 5 },
  { id: 'habit-3', question: 'Did you review your forms?', icon: '🥋', xp: 15 },
  { id: 'habit-4', question: 'Did you help a training partner?', icon: '🤝', xp: 10 },
];

export const DEMO_RIVAL_STATS = {
  xp: 1520,
  wins: 12,
  losses: 3,
  streak: 4,
  rank: 7,
};

export const DEMO_DAILY_CHALLENGE = {
  id: 'dc-demo-1',
  name: '50 Roundhouse Kicks',
  category: 'Power',
  difficulty: 'MEDIUM',
  xpReward: 40,
  globalPoints: 15,
  description: 'Complete 50 roundhouse kicks with proper form. Alternate legs for balance.',
  icon: '🦵',
  videoRequired: false,
  completed: false,
};

export const DEMO_GAUNTLET_CHALLENGES = [
  { id: 'g1', name: 'Engine Builder', category: 'Engine', day: 'Monday', xp: 20, globalXp: 5, description: '3 minutes of high knees', completed: false, personalBest: null },
  { id: 'g2', name: 'Foundation Hold', category: 'Foundation', day: 'Tuesday', xp: 20, globalXp: 5, description: '60 second plank hold', completed: true, personalBest: '72 seconds' },
];

export const DEMO_ARENA_CHALLENGES = [
  { id: 'a1', name: 'Speed Punches', category: 'Power', difficulty: 'EASY', xp: 10, globalXp: 3, icon: '👊', coachPick: false },
  { id: 'a2', name: 'Flying Side Kick', category: 'Technique', difficulty: 'HARD', xp: 70, globalXp: 25, icon: '🦅', coachPick: true, demoVideo: 'https://example.com/demo' },
  { id: 'a3', name: 'Flexibility Flow', category: 'Flexibility', difficulty: 'MEDIUM', xp: 40, globalXp: 15, icon: '🧘', coachPick: false },
  { id: 'a4', name: 'Tornado Kick Combo', category: 'Technique', difficulty: 'EPIC', xp: 100, globalXp: 35, icon: '🌪️', coachPick: true, demoVideo: 'https://example.com/tornado' },
];

export const DEMO_CURRICULUM = [
  { id: 'cur1', title: 'White Belt Basics', belt: 'white', items: [
    { id: 'c1', name: 'Front Stance', type: 'video', duration: '3:45', completed: true, xp: 20 },
    { id: 'c2', name: 'Low Block', type: 'video', duration: '4:20', completed: true, xp: 20 },
    { id: 'c3', name: 'Front Kick', type: 'video', duration: '5:10', completed: false, xp: 25 },
  ]},
  { id: 'cur2', title: 'Yellow Belt Forms', belt: 'yellow', items: [
    { id: 'c4', name: 'Taegeuk 1 - Full Form', type: 'video', duration: '8:30', completed: false, xp: 50 },
    { id: 'c5', name: 'Stance Transitions', type: 'video', duration: '6:15', completed: false, xp: 30 },
  ]},
];

export const DEMO_FAMILY_CHALLENGES = [
  { id: 'fc1', name: 'Family Stretch Session', description: 'Complete a 10-minute stretch routine together', xp: 30, icon: '👨‍👩‍👧', expires: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fc2', name: 'Partner Kick Drills', description: 'Practice 20 kicks each with a family member holding pads', xp: 50, icon: '🥋', expires: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
];

export const DEMO_CHALLENGE_HISTORY = [
  { id: 'h1', challengeName: 'Speed Punches', completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), status: 'VERIFIED', xpEarned: 40, icon: '👊' },
  { id: 'h2', challengeName: 'Tornado Kick', completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), status: 'VERIFIED', xpEarned: 100, icon: '🌪️' },
  { id: 'h3', challengeName: 'Flexibility Flow', completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), status: 'PENDING', xpEarned: 40, icon: '🧘' },
  { id: 'h4', challengeName: 'Engine Builder', completedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), status: 'COMPLETED', xpEarned: 20, icon: '🔥' },
];

export const DEMO_ATHLETE_CARD_STATS = {
  totalXP: 1520,
  globalRank: 7,
  totalStudents: 105,
  classesAttended: 47,
  challengesCompleted: 25,
  currentStreak: 5,
  longestStreak: 12,
  powerScore: 82,
  techniqueScore: 78,
  disciplineScore: 85,
  joinDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
};
