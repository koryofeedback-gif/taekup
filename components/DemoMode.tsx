import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WizardData, Student, Coach, CustomChallenge } from '../types';
import { WT_BELTS } from '../constants';

const DEMO_STUDENTS: Student[] = [
    {
        id: 'demo-student-1',
        name: 'Alex Kim',
        beltId: 'wt-5',
        stripes: 3,
        totalPoints: 420,
        parentEmail: 'parent1@demo.com',
        parentName: 'Sarah Kim',
        birthday: '2015-03-15',
        gender: 'Male',
        joinDate: '2024-06-01',
        attendanceCount: 45,
        lastPromotionDate: '2025-09-15',
        isReadyForGrading: true,
        performanceHistory: [],
        feedbackHistory: [],
        badges: ['attendance-star', 'focus-master'],
        lifeSkillsHistory: [],
        customHabits: [],
    },
    {
        id: 'demo-student-2',
        name: 'Emma Chen',
        beltId: 'wt-7',
        stripes: 2,
        totalPoints: 580,
        parentEmail: 'parent2@demo.com',
        parentName: 'Mike Chen',
        birthday: '2014-07-22',
        gender: 'Female',
        joinDate: '2024-03-15',
        attendanceCount: 62,
        lastPromotionDate: '2025-10-01',
        isReadyForGrading: false,
        performanceHistory: [],
        feedbackHistory: [],
        badges: ['champion', 'dedication'],
        lifeSkillsHistory: [],
        customHabits: [],
    },
    {
        id: 'demo-student-3',
        name: 'Jake Martinez',
        beltId: 'wt-3',
        stripes: 1,
        totalPoints: 180,
        parentEmail: 'parent3@demo.com',
        parentName: 'Maria Martinez',
        birthday: '2016-11-08',
        gender: 'Male',
        joinDate: '2025-01-10',
        attendanceCount: 28,
        lastPromotionDate: '2025-08-20',
        isReadyForGrading: false,
        performanceHistory: [],
        feedbackHistory: [],
        badges: ['newcomer'],
        lifeSkillsHistory: [],
        customHabits: [],
    },
    {
        id: 'demo-student-4',
        name: 'Sophie Williams',
        beltId: 'wt-4',
        stripes: 4,
        totalPoints: 315,
        parentEmail: 'parent4@demo.com',
        parentName: 'David Williams',
        birthday: '2015-09-30',
        gender: 'Female',
        joinDate: '2024-09-01',
        attendanceCount: 38,
        lastPromotionDate: '2025-10-15',
        isReadyForGrading: true,
        performanceHistory: [],
        feedbackHistory: [],
        badges: ['belt-ready'],
        lifeSkillsHistory: [],
        customHabits: [],
    },
    {
        id: 'demo-student-5',
        name: 'Ethan Park',
        beltId: 'wt-6',
        stripes: 2,
        totalPoints: 445,
        parentEmail: 'parent5@demo.com',
        parentName: 'Jenny Park',
        birthday: '2014-01-12',
        gender: 'Male',
        joinDate: '2024-05-20',
        attendanceCount: 52,
        lastPromotionDate: '2025-09-01',
        isReadyForGrading: false,
        performanceHistory: [],
        feedbackHistory: [],
        badges: ['consistency'],
        lifeSkillsHistory: [],
        customHabits: [],
    },
];

const DEMO_COACHES: Coach[] = [
    { id: 'demo-coach-1', name: 'Master Johnson', email: 'master.johnson@demo.com', location: 'Main Dojo' },
    { id: 'demo-coach-2', name: 'Coach Sarah', email: 'sarah@demo.com', location: 'Main Dojo' },
];

const DEMO_CUSTOM_CHALLENGES: CustomChallenge[] = [
    {
        id: 'demo-challenge-1',
        name: 'Side Kick Challenge',
        description: 'Perform your best side kicks - focus on height and form!',
        category: 'Technique',
        difficulty: 'Medium',
        xp: 90,
        icon: '🦵',
        measurementType: 'count',
        measurementUnit: 'kicks',
        videoUrl: 'https://youtube.com/watch?v=example1',
        isActive: true,
        createdAt: '2025-11-25T10:00:00Z',
        createdBy: 'demo-coach-1',
        createdByName: 'Master Johnson',
        targetAudience: 'all',
    },
    {
        id: 'demo-challenge-2',
        name: 'Speed Combo',
        description: 'Complete the 5-move combination as fast as possible with good form',
        category: 'Technique',
        difficulty: 'Hard',
        xp: 150,
        icon: '⚡',
        measurementType: 'time',
        measurementUnit: 'seconds',
        isActive: true,
        createdAt: '2025-11-28T14:00:00Z',
        createdBy: 'demo-coach-1',
        createdByName: 'Master Johnson',
        targetAudience: 'intermediate',
    },
    {
        id: 'demo-challenge-3',
        name: 'Plank Endurance',
        description: 'Hold a perfect plank position - engage your core!',
        category: 'Power',
        difficulty: 'Easy',
        xp: 50,
        icon: '💪',
        measurementType: 'time',
        measurementUnit: 'seconds',
        isActive: true,
        createdAt: '2025-11-20T09:00:00Z',
        createdBy: 'demo-coach-2',
        createdByName: 'Coach Sarah',
        targetAudience: 'beginners',
    },
];

export const DEMO_WIZARD_DATA: WizardData = {
    clubName: 'Demo Martial Arts Academy',
    country: 'United States',
    ownerName: 'Grand Master Demo',
    city: 'San Francisco',
    language: 'English',
    branches: 1,
    branchNames: ['Main Dojo'],
    branchAddresses: ['123 Martial Arts Way, San Francisco, CA'],
    logo: null,
    slogan: 'Building Champions, One Kick at a Time',
    beltSystemType: 'wt',
    belts: WT_BELTS,
    stripesPerBelt: 4,
    skills: [
        { id: 'skill-1', name: 'Technique', isActive: true, isCustom: false },
        { id: 'skill-2', name: 'Effort', isActive: true, isCustom: false },
        { id: 'skill-3', name: 'Focus', isActive: true, isCustom: false },
        { id: 'skill-4', name: 'Discipline', isActive: true, isCustom: false },
    ],
    homeworkBonus: true,
    coachBonus: true,
    pointsPerStripe: 64,
    useCustomPointsPerBelt: false,
    pointsPerBelt: {},
    useColorCodedStripes: true,
    stripeColors: ['#FFD700', '#C0C0C0', '#CD7F32', '#000000'],
    gradingRequirementEnabled: true,
    gradingRequirementName: 'Poomsae',
    coaches: DEMO_COACHES,
    students: DEMO_STUDENTS,
    primaryColor: '#06B6D4',
    themeStyle: 'modern',
    clubPhoto: null,
    welcomeBanner: 'Welcome to Demo Martial Arts Academy!',
    curriculum: [],
    classes: ['Kids Class', 'Teen Class', 'Adult Class', 'Sparring Team'],
    locationClasses: { 'Main Dojo': ['Kids Class', 'Teen Class', 'Adult Class', 'Sparring Team'] },
    schedule: [
        { id: 'sched-1', day: 'Monday', time: '4:00 PM', className: 'Kids Class', location: 'Main Dojo', instructor: 'Master Johnson', beltRequirement: 'All' },
        { id: 'sched-2', day: 'Monday', time: '5:30 PM', className: 'Teen Class', location: 'Main Dojo', instructor: 'Coach Sarah', beltRequirement: 'All' },
        { id: 'sched-3', day: 'Wednesday', time: '4:00 PM', className: 'Kids Class', location: 'Main Dojo', instructor: 'Master Johnson', beltRequirement: 'All' },
        { id: 'sched-4', day: 'Friday', time: '6:00 PM', className: 'Sparring Team', location: 'Main Dojo', instructor: 'Master Johnson', beltRequirement: 'wt-5' },
    ],
    events: [
        { id: 'event-1', title: 'Belt Test', date: '2025-12-15', time: '10:00 AM', location: 'Main Dojo', description: 'Quarterly belt testing ceremony', type: 'test' },
        { id: 'event-2', title: 'Holiday Tournament', date: '2025-12-20', time: '9:00 AM', location: 'Community Center', description: 'Annual holiday sparring tournament', type: 'competition' },
    ],
    privateSlots: [
        { id: 'slot-1', date: '2025-12-05', time: '3:00 PM', coachName: 'Master Johnson', price: 75, isBooked: false },
        { id: 'slot-2', date: '2025-12-06', time: '10:00 AM', coachName: 'Coach Sarah', price: 60, isBooked: false },
    ],
    clubSponsoredPremium: false,
    challenges: [],
    customChallenges: DEMO_CUSTOM_CHALLENGES,
    holidaySchedule: 'minimal',
    customHolidayWeeks: 4,
};

interface DemoModeProps {
    onEnterDemo: (role: 'owner' | 'coach' | 'parent', studentId?: string) => void;
}

export const DemoMode: React.FC<DemoModeProps> = ({ onEnterDemo }) => {
    const [selectedStudent, setSelectedStudent] = useState(DEMO_STUDENTS[0].id);
    const navigate = useNavigate();

    const roleCards = [
        {
            role: 'owner' as const,
            title: 'Admin / Owner',
            icon: '👑',
            color: 'from-purple-600 to-purple-800',
            borderColor: 'border-purple-500',
            description: 'Full access to all features: manage club settings, view analytics, control subscriptions, and oversee everything.',
            features: ['Club Settings', 'Financial Reports', 'Staff Management', 'TV Lobby Display'],
        },
        {
            role: 'coach' as const,
            title: 'Coach / Instructor',
            icon: '🥋',
            color: 'from-cyan-600 to-cyan-800',
            borderColor: 'border-cyan-500',
            description: 'Manage classes, track attendance, score students, and create custom challenges.',
            features: ['Attendance Tracking', 'Point Scoring', 'Challenge Builder', 'Student Progress'],
        },
        {
            role: 'parent' as const,
            title: 'Parent / Student',
            icon: '👨‍👩‍👧',
            color: 'from-green-600 to-green-800',
            borderColor: 'border-green-500',
            description: 'View student progress, track achievements, compete in Dojang Rivals™, and manage Home Dojo habits.',
            features: ['Progress Tracking', 'Dojang Rivals™ Arena', 'Home Dojo Habits', 'Achievement Badges'],
        },
    ];

    const handleEnterDemo = (role: 'owner' | 'coach' | 'parent') => {
        if (role === 'parent') {
            onEnterDemo(role, selectedStudent);
        } else {
            onEnterDemo(role);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <div className="container mx-auto px-4 py-8 md:py-16">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-full text-sm font-medium mb-6">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                        Demo Mode - No Registration Required
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Experience <span className="text-cyan-400">TaekUp</span> Now
                    </h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                        Explore the platform from any perspective. Choose a role below to instantly access a fully-featured demo with sample data.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
                    {roleCards.map((card) => (
                        <div
                            key={card.role}
                            className={`bg-gray-800/80 backdrop-blur rounded-2xl border-2 ${card.borderColor} overflow-hidden hover:scale-105 transition-all duration-300 flex flex-col`}
                        >
                            <div className={`bg-gradient-to-r ${card.color} p-6 text-center`}>
                                <span className="text-5xl mb-2 block">{card.icon}</span>
                                <h2 className="text-2xl font-bold text-white">{card.title}</h2>
                            </div>
                            <div className="p-6 flex-1 flex flex-col">
                                <p className="text-gray-300 mb-4">{card.description}</p>
                                <div className="mb-6">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Key Features</p>
                                    <div className="flex flex-wrap gap-2">
                                        {card.features.map((feature) => (
                                            <span key={feature} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                                                {feature}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {card.role === 'parent' && (
                                    <div className="mb-4">
                                        <label className="text-sm text-gray-400 block mb-2">Select Student to View:</label>
                                        <select
                                            value={selectedStudent}
                                            onChange={(e) => setSelectedStudent(e.target.value)}
                                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                                        >
                                            {DEMO_STUDENTS.map((student) => (
                                                <option key={student.id} value={student.id}>
                                                    {student.name} ({WT_BELTS.find(b => b.id === student.beltId)?.name || 'White Belt'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <button
                                    onClick={() => handleEnterDemo(card.role)}
                                    className={`mt-auto w-full bg-gradient-to-r ${card.color} text-white font-bold py-3 px-6 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
                                >
                                    Enter as {card.title.split(' ')[0]}
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="text-center">
                    <p className="text-gray-500 mb-4">Ready to set up your own club?</p>
                    <button
                        onClick={() => navigate('/landing')}
                        className="text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
                    >
                        Start Your Free 14-Day Trial
                    </button>
                </div>

                <div className="mt-16 max-w-4xl mx-auto">
                    <h3 className="text-xl font-bold text-white text-center mb-6">Demo Club Overview</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-800/50 rounded-xl p-4 text-center border border-gray-700">
                            <p className="text-3xl font-bold text-cyan-400">{DEMO_STUDENTS.length}</p>
                            <p className="text-gray-400 text-sm">Students</p>
                        </div>
                        <div className="bg-gray-800/50 rounded-xl p-4 text-center border border-gray-700">
                            <p className="text-3xl font-bold text-purple-400">{DEMO_COACHES.length}</p>
                            <p className="text-gray-400 text-sm">Coaches</p>
                        </div>
                        <div className="bg-gray-800/50 rounded-xl p-4 text-center border border-gray-700">
                            <p className="text-3xl font-bold text-green-400">{DEMO_CUSTOM_CHALLENGES.length}</p>
                            <p className="text-gray-400 text-sm">Custom Challenges</p>
                        </div>
                        <div className="bg-gray-800/50 rounded-xl p-4 text-center border border-gray-700">
                            <p className="text-3xl font-bold text-yellow-400">4</p>
                            <p className="text-gray-400 text-sm">Class Types</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const RoleSwitcher: React.FC<{
    currentRole: 'owner' | 'coach' | 'parent';
    onSwitchRole: (role: 'owner' | 'coach' | 'parent', studentId?: string) => void;
    students: Student[];
    currentStudentId?: string;
}> = ({ currentRole, onSwitchRole, students, currentStudentId }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(currentStudentId || students[0]?.id);

    const roles = [
        { id: 'owner', label: 'Admin', icon: '👑', color: 'bg-purple-600' },
        { id: 'coach', label: 'Coach', icon: '🥋', color: 'bg-cyan-600' },
        { id: 'parent', label: 'Parent', icon: '👨‍👩‍👧', color: 'bg-green-600' },
    ];

    const currentRoleInfo = roles.find(r => r.id === currentRole);

    return (
        <div className="fixed bottom-4 right-4 z-50">
            {isOpen && (
                <div className="absolute bottom-16 right-0 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-4 w-64 animate-fade-in">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Demo Role Switcher</p>
                    <div className="space-y-2">
                        {roles.map((role) => (
                            <button
                                key={role.id}
                                onClick={() => {
                                    if (role.id === 'parent') {
                                        onSwitchRole(role.id as any, selectedStudent);
                                    } else {
                                        onSwitchRole(role.id as any);
                                    }
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                    currentRole === role.id
                                        ? `${role.color} text-white`
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                <span className="text-lg">{role.icon}</span>
                                <span className="font-medium">{role.label}</span>
                                {currentRole === role.id && (
                                    <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded">Current</span>
                                )}
                            </button>
                        ))}
                    </div>
                    {students.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                            <label className="text-xs text-gray-400 block mb-2">Student (for Parent view):</label>
                            <select
                                value={selectedStudent}
                                onChange={(e) => setSelectedStudent(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm focus:border-cyan-500 focus:outline-none"
                            >
                                {students.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={() => setIsOpen(false)}
                        className="mt-3 w-full text-center text-gray-500 text-sm hover:text-gray-400"
                    >
                        Close
                    </button>
                </div>
            )}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`${currentRoleInfo?.color} text-white px-4 py-3 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center gap-2`}
            >
                <span className="text-xl">{currentRoleInfo?.icon}</span>
                <span className="font-medium hidden sm:inline">Demo: {currentRoleInfo?.label}</span>
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            </button>
        </div>
    );
};
