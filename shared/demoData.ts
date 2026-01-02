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
