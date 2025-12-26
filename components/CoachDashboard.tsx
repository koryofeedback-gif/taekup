
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { WizardData, Student, PerformanceRecord, FeedbackRecord, CalendarEvent, CustomChallenge } from '../types';
import { generateParentFeedback, generatePromotionMessage, generateLessonPlan } from '../services/geminiService';
import { generateLessonPlanGPT } from '../services/openaiService';
import { StudentProfile } from './StudentProfile';
import { ChallengeBuilder } from './ChallengeBuilder';
import { CoachLeaderboard } from './CoachLeaderboard';
import { WorldRankings } from './WorldRankings';
import { calculateClassPTS, calculateGradingXP, calculateGlobalGradingXP } from '../services/gamificationService';

// --- TYPE DEFINITIONS ---
type SessionScores = Record<string, Record<string, number | null>>;

interface CoachDashboardProps {
  data: WizardData;
  coachName: string;
  onUpdateStudents: (students: Student[]) => void;
  onUpdateData?: (data: Partial<WizardData>) => void;
  onBack: () => void;
  userType?: 'owner' | 'coach' | 'parent';
  onGoToAdmin?: () => void;
  clubId?: string;
}

// --- SPEECH RECOGNITION TYPES (Browser Native) ---
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

// --- HELPER COMPONENTS ---

const ScoreDropdown: React.FC<{ score: number | null | undefined; onChange: (score: number) => void }> = ({ score, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);
    
    const scoreDisplay: Record<string, { emoji: string; color: string }> = {
        '2': { emoji: '💚', color: 'bg-green-500' },
        '1': { emoji: '💛', color: 'bg-yellow-500' },
        '0': { emoji: '❤️', color: 'bg-red-500' },
        'null': { emoji: '⚪', color: 'bg-gray-600' }
    };

    // Robustly handle undefined or null scores
    let currentDisplayKey = 'null';
    if (score !== null && score !== undefined) {
        currentDisplayKey = String(score);
    }
    
    const currentDisplay = scoreDisplay[currentDisplayKey] || scoreDisplay['null'];

    return (
        <div className="relative flex justify-center" ref={wrapperRef}>
            <button onClick={() => setIsOpen(!isOpen)} className={`w-9 h-7 flex items-center justify-center rounded-md text-sm transition-colors ${currentDisplay.color}`}>
                {currentDisplay.emoji} <span className="text-xs ml-0.5 opacity-70">▼</span>
            </button>
            {isOpen && (
                <div className="absolute z-20 top-full mt-1 bg-gray-700 rounded-md shadow-lg p-1 space-y-1">
                    {[2, 1, 0].map(val => (
                        <button key={val} onClick={() => { onChange(val); setIsOpen(false); }}
                            className={`w-9 h-7 flex items-center justify-center rounded-md text-lg ${scoreDisplay[String(val)].color}`}>
                            {scoreDisplay[String(val)].emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const ProgressBar: React.FC<{ student: Student; sessionTotal: number; pointsPerStripe: number; newStripes: number; hasMaxStripes: boolean }> = ({ student, sessionTotal, pointsPerStripe, newStripes, hasMaxStripes }) => {
    const totalPointsWithSession = (student.totalPoints || 0) + sessionTotal;
    const pointsForCurrentStripe = totalPointsWithSession % pointsPerStripe;
    const progressPercent = hasMaxStripes ? 100 : (pointsForCurrentStripe / pointsPerStripe) * 100;
    
    return (
        <div className="w-full bg-gray-700 rounded-full h-4 relative overflow-hidden border border-gray-600" title={`Total Points: ${totalPointsWithSession}`}>
            <div 
                className={`h-4 rounded-full transition-all duration-300 ${hasMaxStripes ? 'bg-yellow-400' : 'bg-sky-400'}`} 
                style={{ width: `${progressPercent}%` }}
            ></div>
            <div className="absolute inset-0 flex items-center justify-center">
                {newStripes > 0 ? (
                    <span className="text-xs font-bold text-white animate-pulse">⭐ +{newStripes} Stripe Earned!</span>
                ) : hasMaxStripes ? (
                    <span className="text-xs font-bold text-black uppercase tracking-wide">Max Stripes Reached</span>
                ) : (
                    <span className="text-xs font-bold text-white mix-blend-difference">{pointsForCurrentStripe} / {pointsPerStripe}</span>
                )}
            </div>
        </div>
    );
};

const InsightSidebar: React.FC<{ students: Student[], belts: any[], clubId?: string }> = ({ students, belts, clubId }) => {
    const [leaderboardMode, setLeaderboardMode] = useState<'effort' | 'progress'>('effort');
    const [apiMonthlyPTS, setApiMonthlyPTS] = useState<Map<string, number>>(new Map());
    
    // Fetch monthly PTS from API (persisted in database)
    useEffect(() => {
        if (!clubId) return;
        const fetchMonthlyPTS = async () => {
            try {
                const response = await fetch(`/api/leaderboard?clubId=${clubId}`);
                const result = await response.json();
                if (result.leaderboard) {
                    const ptsMap = new Map<string, number>();
                    result.leaderboard.forEach((s: any) => {
                        ptsMap.set(s.id, s.monthlyPTS || 0);
                    });
                    setApiMonthlyPTS(ptsMap);
                }
            } catch (error) {
                console.error('[InsightSidebar] Failed to fetch monthly PTS:', error);
            }
        };
        fetchMonthlyPTS();
        const interval = setInterval(fetchMonthlyPTS, 30000);
        return () => clearInterval(interval);
    }, [clubId]);
    
    // Mode 1: Monthly Effort - Use API data for persisted PTS (survives logout)
    const monthlyEffortStudents = useMemo(() => {
        return [...students]
            .map(student => {
                const monthlyPTS = apiMonthlyPTS.get(student.id) || 0;
                return { ...student, displayPTS: monthlyPTS };
            })
            .sort((a, b) => b.displayPTS - a.displayPTS)
            .filter(s => s.displayPTS > 0)
            .slice(0, 3);
    }, [students, apiMonthlyPTS]);
    
    // Mode 2: Belt Progress - Live current_stripe_points (totalPoints)
    const beltProgressStudents = useMemo(() => {
        return [...students]
            .map(student => ({
                ...student,
                displayPTS: student.totalPoints || 0
            }))
            .sort((a, b) => b.displayPTS - a.displayPTS)
            .filter(s => s.displayPTS > 0)
            .slice(0, 3);
    }, [students]);
    
    // Select which list to display based on mode
    const topStudents = leaderboardMode === 'effort' ? monthlyEffortStudents : beltProgressStudents;

    // 2. Retention Radar Logic
    const atRiskStudents = students.filter(s => {
        if (!s.performanceHistory || s.performanceHistory.length === 0) {
             const joinTime = new Date(s.joinDate).getTime();
             const daysSinceJoin = (new Date().getTime() - joinTime) / (1000 * 3600 * 24);
             return daysSinceJoin > 10;
        }
        const lastClass = s.performanceHistory[s.performanceHistory.length - 1];
        const lastDate = new Date(lastClass.date).getTime();
        const today = new Date().getTime();
        const daysSince = (today - lastDate) / (1000 * 3600 * 24);
        return daysSince > 10;
    });

    // 3. Birthday Radar Logic
    const birthdayStudents = students.filter(s => {
        if (!s.birthday) return false;
        const today = new Date();
        const bdate = new Date(s.birthday);
        // Set current year to check upcoming
        bdate.setFullYear(today.getFullYear());
        
        // Handle year wrap for Dec->Jan if needed (simple version: next 30 days)
        const diffTime = bdate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Only show if birthday is today (0) or within next 30 days
        // Note: Logic handles if bdate passed this year, it might be negative, we ignore those
        return diffDays >= 0 && diffDays <= 30;
    }).sort((a, b) => {
        const da = new Date(a.birthday).setFullYear(new Date().getFullYear());
        const db = new Date(b.birthday).setFullYear(new Date().getFullYear());
        return da - db;
    });
    
    return (
        <div className="space-y-6">
            {/* Birthday Widget */}
            <div className="bg-gray-800/50 rounded-lg border border-yellow-500/30 p-4">
                <h3 className="font-bold text-white flex items-center mb-3">
                    <span className="text-xl mr-2">🎂</span> Birthday Radar
                </h3>
                <div className="space-y-2">
                    {birthdayStudents.length > 0 ? (
                        birthdayStudents.slice(0, 3).map(s => {
                            const today = new Date();
                            const bdate = new Date(s.birthday);
                            const isToday = bdate.getDate() === today.getDate() && bdate.getMonth() === today.getMonth();
                            const newAge = today.getFullYear() - bdate.getFullYear();
                            
                            return (
                                <div key={s.id} className={`flex items-center justify-between p-2 rounded border ${isToday ? 'bg-yellow-900/40 border-yellow-500' : 'bg-gray-800 border-gray-700'}`}>
                                    <div>
                                        <p className={`text-sm font-bold ${isToday ? 'text-yellow-400' : 'text-white'}`}>
                                            {s.name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {isToday ? 'Turning' : new Date(s.birthday).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} • {newAge}
                                        </p>
                                    </div>
                                    {isToday && <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold animate-pulse">TODAY!</span>}
                                </div>
                            )
                        })
                    ) : (
                        <p className="text-xs text-gray-500 italic text-center py-2">No upcoming birthdays.</p>
                    )}
                </div>
            </div>

            {/* Leaderboard Widget - Dual View: Monthly Effort / Belt Progress */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white flex items-center">
                        <span className="text-xl mr-2">🏆</span> Top Students
                    </h3>
                    <div className="flex text-xs">
                        <button 
                            onClick={() => setLeaderboardMode('effort')}
                            className={`px-2 py-1 rounded-l ${leaderboardMode === 'effort' ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                        >Monthly Effort</button>
                        <button 
                            onClick={() => setLeaderboardMode('progress')}
                            className={`px-2 py-1 rounded-r ${leaderboardMode === 'progress' ? 'bg-sky-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                        >Belt Progress</button>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                    {leaderboardMode === 'effort' ? 'Points earned this month' : 'Current stripe progress'}
                </p>
                <div className="space-y-3">
                    {topStudents.map((s, i) => {
                        const belt = belts.find(b => b.id === s.beltId);
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                        return (
                            <div key={s.id} className="flex items-center justify-between bg-gray-800 p-2 rounded border border-gray-700">
                                <div className="flex items-center">
                                    <span className="text-lg mr-2">{medal}</span>
                                    <div>
                                        <p className="text-sm font-bold text-white">{s.name}</p>
                                        <p className="text-xs text-gray-400">{belt?.name}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-sky-300">{s.displayPTS} PTS</span>
                            </div>
                        )
                    })}
                    {topStudents.length === 0 && (
                        <p className="text-sm text-gray-500 italic">
                            {leaderboardMode === 'effort' ? 'No activity this month.' : 'No students with points yet.'}
                        </p>
                    )}
                </div>
            </div>

            {/* Retention Radar Widget */}
            <div className="bg-gray-800/50 rounded-lg border border-red-900/30 p-4">
                <h3 className="font-bold text-white flex items-center mb-3">
                    <span className="text-xl mr-2">📡</span> Retention Radar
                </h3>
                <p className="text-xs text-gray-400 mb-3">Absent 3+ Sessions</p>
                <div className="space-y-2">
                     {atRiskStudents.length > 0 ? (
                         atRiskStudents.slice(0, 3).map(s => (
                            <div key={s.id} className="flex items-center justify-between bg-red-900/20 p-2 rounded border border-red-900/50">
                                <span className="text-sm text-red-200">{s.name}</span>
                                <span className="text-xs bg-red-900 text-white px-1.5 py-0.5 rounded">At Risk</span>
                            </div>
                         ))
                     ) : (
                         <div className="flex items-center justify-center p-2 text-green-400 text-sm">
                             <span>✅ Everyone is active!</span>
                         </div>
                     )}
                     {atRiskStudents.length > 3 && <p className="text-xs text-center text-red-400">+{atRiskStudents.length - 3} more...</p>}
                </div>
            </div>
        </div>
    );
}

const CertificateModal: React.FC<{ student: Student; newBelt: string; data: WizardData; onClose: () => void }> = ({ student, newBelt, data, onClose }) => {
    const [certId] = useState(`CERT-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`);
    const [showSharePreview, setShowSharePreview] = useState(false);
    
    const disciplineName = useMemo(() => {
        switch(data.beltSystemType) {
            case 'wt': return 'World Taekwondo';
            case 'itf': return 'ITF Taekwondo';
            case 'karate': return 'Karate';
            case 'bjj': return 'Brazilian Jiu-Jitsu';
            case 'judo': return 'Judo';
            case 'custom': return 'Martial Arts';
            default: return 'Martial Arts';
        }
    }, [data.beltSystemType]);

    const handleSend = () => {
        alert(`Certificate and Referral Link sent to ${student.parentEmail}!`);
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="max-w-3xl w-full bg-gray-900 text-white rounded-lg shadow-2xl overflow-hidden my-8" onClick={e => e.stopPropagation()}>
                
                {/* Certificate Area (White Paper) */}
                <div className="bg-white text-gray-900 p-1 rounded-t-lg">
                    <div className="p-8 border-8 border-double border-yellow-600 m-2 bg-[#fdfbf7] text-center relative">
                        {/* Decorative Corners */}
                        <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-yellow-600 m-2"></div>
                        <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-yellow-600 m-2"></div>
                        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-yellow-600 m-2"></div>
                        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-yellow-600 m-2"></div>

                        <div className="mb-6">
                             <h1 className="text-4xl font-serif font-bold text-gray-800 uppercase tracking-wider mb-2">Certificate</h1>
                             <h2 className="text-xl font-serif text-yellow-700 uppercase tracking-widest">of Promotion</h2>
                             <p className="text-sm text-gray-500 mt-2 font-bold uppercase tracking-wide text-blue-900">{disciplineName}</p>
                        </div>

                        <p className="text-gray-600 italic mb-4">This certifies that</p>
                        
                        <h3 className="text-3xl font-bold text-blue-900 mb-4 font-serif border-b-2 border-gray-300 inline-block pb-2 px-8 min-w-[300px]">
                            {student.name}
                        </h3>

                        <p className="text-gray-600 italic mb-4">has successfully demonstrated the skills and spirit required for the rank of</p>

                        <h3 className="text-4xl font-bold text-red-700 mb-8 uppercase font-serif">
                            {newBelt}
                        </h3>

                        <div className="flex justify-between items-end px-12 mt-8 mb-6">
                            <div className="text-center">
                                <p className="text-sm font-bold border-t border-gray-400 pt-2 px-4 min-w-[150px]">{new Date().toLocaleDateString()}</p>
                                <p className="text-xs text-gray-500 uppercase">Date</p>
                            </div>
                            <div className="w-24 h-24 relative flex items-center justify-center mx-4">
                                <div className="absolute inset-0 bg-yellow-500 rounded-full opacity-20"></div>
                                <div className="w-20 h-20 border-2 border-yellow-600 rounded-full flex items-center justify-center p-1">
                                    <div className="w-full h-full border border-dashed border-yellow-600 rounded-full flex items-center justify-center flex-col">
                                         <span className="text-[10px] font-bold text-yellow-800 uppercase">Official</span>
                                         <span className="text-xs font-bold text-yellow-800 uppercase">Rank</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-script text-blue-900 mb-1 font-serif min-w-[150px]">{data.ownerName || 'Master Instructor'}</p>
                                <p className="text-xs text-gray-500 uppercase border-t border-gray-400 pt-1">Instructor Signature</p>
                            </div>
                        </div>
                        
                        {/* Verification Footer */}
                        <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-end text-xs text-gray-400 font-mono">
                             <div className="text-left">
                                 <p>ID: <span className="text-gray-600 font-bold">{certId}</span></p>
                                 <p>Verify at: www.taekup.com/verify</p>
                             </div>
                             <div className="text-right">
                                 <p className="font-bold text-gray-600">{data.clubName}</p>
                                 <p>{data.city}, {data.country}</p>
                                 <p>contact@{data.clubName.toLowerCase().replace(/\s+/g, '')}.com</p>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Marketing / Viral Engine Section */}
                <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-6 border-t border-sky-500/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center">
                                🚀 Viral Referral Engine
                                <span className="ml-2 text-xs bg-green-500 text-black px-2 py-0.5 rounded-full font-bold">ACTIVE</span>
                            </h3>
                            <p className="text-blue-200 text-sm mt-1 max-w-lg">
                                When you email this certificate, we automatically attach a "Share & Earn" link for the parent.
                            </p>
                        </div>
                        <button 
                            onClick={() => setShowSharePreview(!showSharePreview)}
                            className="text-xs text-blue-300 underline hover:text-white"
                        >
                            {showSharePreview ? 'Hide Preview' : 'See What Parents Share'}
                        </button>
                    </div>

                    {showSharePreview && (
                        <div className="mt-4 bg-white rounded-lg p-4 max-w-sm mx-auto shadow-lg text-gray-800">
                            <div className="flex items-center space-x-2 mb-3">
                                <div className="w-8 h-8 bg-sky-500 rounded-full"></div>
                                <div>
                                    <p className="font-bold text-sm leading-tight">Proud Parent</p>
                                    <p className="text-xs text-gray-500">Just now • 🌎</p>
                                </div>
                            </div>
                            <p className="text-sm mb-2">
                                So proud of {student.name} for earning their {newBelt}! 🥋 big thanks to {data.clubName}.
                            </p>
                            <p className="text-sm mb-3 text-sky-500 font-medium">
                                Want to try it out? Use my link for a FREE WEEK! 👇
                            </p>
                            <div className="bg-gray-100 rounded border border-gray-300 overflow-hidden">
                                <div className="h-32 bg-gray-200 flex items-center justify-center text-gray-400">
                                    [Certificate Image]
                                </div>
                                <div className="p-2 bg-gray-50">
                                    <p className="font-bold text-xs uppercase text-gray-500">TAEKUP.COM</p>
                                    <p className="font-bold text-sm">Free Week at {data.clubName}</p>
                                </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-gray-200 flex justify-between text-gray-500 text-sm">
                                <span>Like</span><span>Comment</span><span>Share</span>
                            </div>
                        </div>
                    )}
                    
                    <div className="mt-4 flex items-center justify-between bg-blue-800/30 p-3 rounded border border-sky-500/20">
                        <div className="flex items-center text-sm">
                            <span className="text-2xl mr-3">🎁</span>
                            <div>
                                <p className="font-bold text-white">Incentive Active</p>
                                <p className="text-blue-200 text-xs">Parents get <span className="text-yellow-400 font-bold">$50 Credit</span> for every friend who joins.</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-gray-400 uppercase">Cost to You</p>
                            <p className="font-bold text-green-400">$0 (Pay only on Success)</p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="bg-gray-800 p-4 flex justify-end space-x-4 border-t border-gray-700">
                    <button onClick={onClose} className="text-gray-400 font-bold hover:text-white transition-colors">Close</button>
                    <button className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded flex items-center transition-colors">
                        <span className="mr-2">⬇️</span> Download PDF
                    </button>
                    <button onClick={handleSend} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded flex items-center shadow-lg transition-colors">
                        <span className="mr-2">📧</span> Email (With Referral Link)
                    </button>
                </div>
            </div>
        </div>
    )
}

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; title: string, size?: 'lg' | '2xl' | '4xl' }> = ({ children, onClose, title, size = 'lg' }) => {
    const sizeMap = {
        'lg': 'max-w-lg',
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
    }
    return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className={`bg-gray-800 rounded-lg shadow-xl w-full border border-gray-700 ${sizeMap[size]}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800 rounded-t-lg z-10">
                <h3 className="font-bold text-white">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-y-auto">{children}</div>
        </div>
    </div>
)};

const NoteEditorModal: React.FC<{student: Student, initialNote: string, onSave: (note: string) => void, onClose: () => void}> = ({ student, initialNote, onSave, onClose }) => {
    const [note, setNote] = useState(initialNote);
    return (
        <Modal onClose={onClose} title={`Add Note for ${student.name}`}>
            <div className="space-y-4">
                <p className="text-sm text-gray-400">Add a quick note about the student's performance. This will be used by the AI to generate parent feedback.</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full h-24 bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:ring-sky-500 focus:border-sky-500" placeholder="e.g., Good energy but talking a bit."/>
                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Cancel</button>
                    <button onClick={() => onSave(note)} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-md">Save Note</button>
                </div>
            </div>
        </Modal>
    );
};

const NotesHistoryModal: React.FC<{student: Student, onClose: () => void}> = ({ student, onClose }) => {
    const notesFromPerformance = (student.performanceHistory || [])
        .filter(p => p.note)
        .map(p => ({
            date: p.date,
            text: p.note || '',
            coachName: p.coachName || 'Coach',
            type: 'session' as const
        }));
    
    const notesFromFeedback = (student.feedbackHistory || [])
        .map(f => ({
            date: f.date,
            text: f.text,
            coachName: f.coachName,
            type: f.isAIGenerated ? 'ai-feedback' as const : 'feedback' as const
        }));
    
    const allNotes = [...notesFromPerformance, ...notesFromFeedback]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <Modal onClose={onClose} title={`Training Notes - ${student.name}`} size="2xl">
            <div className="space-y-4">
                {allNotes.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-400">No training notes recorded yet.</p>
                        <p className="text-sm text-gray-500 mt-2">Notes added during grading will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {allNotes.map((note, idx) => (
                            <div key={idx} className={`p-3 rounded-lg border ${
                                note.type === 'session' ? 'bg-gray-900/50 border-gray-700' :
                                note.type === 'ai-feedback' ? 'bg-indigo-900/30 border-indigo-700/50' :
                                'bg-sky-900/30 border-sky-700/50'
                            }`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">
                                            {note.type === 'session' ? '📝' : note.type === 'ai-feedback' ? '🤖' : '💬'}
                                        </span>
                                        <span className="text-xs font-medium text-gray-400">
                                            {note.type === 'session' ? 'Class Note' : note.type === 'ai-feedback' ? 'AI Feedback' : 'Parent Message'}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {new Date(note.date).toLocaleDateString()} • {note.coachName}
                                    </span>
                                </div>
                                <p className="text-gray-300 text-sm">{note.text}</p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex justify-end pt-2 border-t border-gray-700">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md">Close</button>
                </div>
            </div>
        </Modal>
    );
};

const FeedbackPreviewModal: React.FC<{messages: Record<string, string>, students: Student[], onClose: () => void}> = ({ messages, students, onClose }) => (
    <Modal onClose={onClose} title="Preview Parent Feedback" size="2xl">
        <div className="space-y-4">
            {Object.entries(messages).map(([studentId, message]) => {
                const studentName = students.find(s => s.id === studentId)?.name;
                return (
                    <div key={studentId} className="bg-gray-900/50 p-3 rounded-lg">
                        <p className="font-bold text-sky-300">{studentName}</p>
                        <p className="text-gray-300 italic">"{message}"</p>
                    </div>
                );
            })}
             <div className="flex justify-end">
                 <button onClick={onClose} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-md">Close</button>
            </div>
        </div>
    </Modal>
);

const AddEventModal: React.FC<{ onClose: () => void, onAdd: (event: CalendarEvent) => void }> = ({ onClose, onAdd }) => {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [type, setType] = useState<'competition' | 'test' | 'seminar' | 'social'>('social');

    const handleSubmit = () => {
        if (!title || !date) return;
        onAdd({
            id: `evt-${Date.now()}`,
            title,
            date,
            time: time || '10:00',
            location: 'Dojang',
            description: '',
            type
        });
        onClose();
    }

    return (
        <Modal onClose={onClose} title="Add Club Event">
            <div className="space-y-4">
                <input type="text" placeholder="Event Title" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600" />
                <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-700 text-white p-2 rounded border border-gray-600" />
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-gray-700 text-white p-2 rounded border border-gray-600" />
                </div>
                <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600">
                    <option value="social">Social / Team Building</option>
                    <option value="competition">Competition</option>
                    <option value="test">Belt Test</option>
                    <option value="seminar">Seminar</option>
                </select>
                <button onClick={handleSubmit} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Save Event</button>
            </div>
        </Modal>
    )
}

const SenseiVoiceHUD: React.FC<{ transcript: string, isActive: boolean, lastCommand: string | null, students: Student[], skills: {id: string, name: string}[] }> = ({ transcript, isActive, lastCommand, students, skills }) => {
    if (!isActive) return null;
    
    const exampleStudent = students[0]?.name || "Amin";
    const exampleSkill = skills[0]?.name || "Kicks";
    
    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center pointer-events-none">
            <div className="bg-gray-900/90 p-8 rounded-3xl border-2 border-cyan-500 shadow-[0_0_50px_rgba(6,182,212,0.5)] text-center max-w-2xl w-full relative overflow-hidden">
                {/* Animated Wave */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-cyan-500 animate-pulse"></div>
                
                <div className="text-5xl mb-4 animate-bounce text-cyan-400">🎙️</div>
                <h3 className="text-2xl font-bold text-white mb-4 font-mono tracking-widest">SENSEI VOICE ACTIVE</h3>
                
                {/* Live Transcript */}
                <div className="bg-black/50 p-4 rounded-xl min-h-[60px] flex items-center justify-center mb-4 border border-gray-700">
                    <p className="text-xl text-cyan-300 font-mono">
                        {transcript || "Listening..."}
                        <span className="animate-pulse">_</span>
                    </p>
                </div>

                {/* Command Guide */}
                <div className="bg-gray-800/80 rounded-xl p-4 mb-4 text-left border border-gray-700">
                    <h4 className="text-sm font-bold text-cyan-400 uppercase mb-3 text-center">Voice Command Structure</h4>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div className="bg-gray-700/50 rounded-lg p-2">
                            <p className="text-xs text-gray-400 uppercase">Student</p>
                            <p className="text-white font-bold">{exampleStudent}</p>
                        </div>
                        <div className="bg-gray-700/50 rounded-lg p-2">
                            <p className="text-xs text-gray-400 uppercase">Skill</p>
                            <p className="text-white font-bold">{exampleSkill}</p>
                        </div>
                        <div className="bg-gray-700/50 rounded-lg p-2">
                            <p className="text-xs text-gray-400 uppercase">Score</p>
                            <p className="text-white font-bold">Green</p>
                        </div>
                    </div>
                    <div className="text-center mb-3">
                        <p className="text-gray-400 text-xs mb-1">Example:</p>
                        <p className="text-cyan-300 font-mono text-sm">"{exampleStudent} {exampleSkill} green"</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                            <span className="text-green-400 font-bold">💚 Green</span>
                            <p className="text-gray-500">"green" "good" "yes"</p>
                        </div>
                        <div className="text-center">
                            <span className="text-yellow-400 font-bold">💛 Yellow</span>
                            <p className="text-gray-500">"yellow" "okay" "half"</p>
                        </div>
                        <div className="text-center">
                            <span className="text-red-400 font-bold">❤️ Red</span>
                            <p className="text-gray-500">"red" "bad" "no"</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between text-xs text-gray-500 uppercase font-mono">
                    <span>🎤 Chrome Only</span>
                    <span>Say "Stop" to exit</span>
                </div>

                {/* Last Success */}
                {lastCommand && (
                    <div className="absolute bottom-0 left-0 right-0 bg-green-600 py-2 text-white font-bold text-sm animate-pulse">
                        ✅ EXECUTED: {lastCommand}
                    </div>
                )}
            </div>
        </div>
    );
};

const LessonPlanner: React.FC<{ data: WizardData }> = ({ data }) => {
    const [ageGroup, setAgeGroup] = useState('Kids (7-9)');
    const [focus, setFocus] = useState('');
    const [duration, setDuration] = useState('45');
    const [beltLevel, setBeltLevel] = useState(data.belts[0]?.name || 'White Belt');
    const [plan, setPlan] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!focus) return;
        setIsGenerating(true);
        
        // Try GPT-4o first for higher accuracy, fallback to Gemini
        // Pass the martial art type for specialized lesson plans
        let result = await generateLessonPlanGPT(ageGroup, beltLevel, focus, duration, data.language, data.beltSystemType);
        
        // If GPT fails (returns fallback), try Gemini
        if (result.includes('Basic form practice')) {
            result = await generateLessonPlan(ageGroup, beltLevel, focus, duration, data.language);
        }
        
        setPlan(result);
        setIsGenerating(false);
    }

    // Focus suggestions based on martial art type
    const focusSuggestionsByArt: Record<string, string[]> = {
        'wt': [
            'Front Kick (Ap Chagi)',
            'Roundhouse Kick (Dollyo Chagi)',
            'Side Kick (Yeop Chagi)',
            'Back Kick (Dwi Chagi)',
            'Sparring Combinations',
            'Poomsae / Forms',
            'Self-Defense Techniques',
            'Board Breaking',
            'Flexibility & Stretching',
            'Competition Prep'
        ],
        'itf': [
            'Front Kick (Ap Chagi)',
            'Turning Kick (Dollyo Chagi)',
            'Side Piercing Kick (Yop Cha Jirugi)',
            'Back Kick (Dwit Chagi)',
            'Tul (Patterns)',
            'Step Sparring',
            'Self-Defense (Hosinsul)',
            'Power Breaking',
            'Conditioning',
            'Theory & Terminology'
        ],
        'karate': [
            'Front Kick (Mae Geri)',
            'Roundhouse Kick (Mawashi Geri)',
            'Side Kick (Yoko Geri)',
            'Back Kick (Ushiro Geri)',
            'Kata Practice',
            'Kumite Combinations',
            'Kihon (Basics)',
            'Bunkai (Applications)',
            'Board Breaking',
            'Competition Prep'
        ],
        'bjj': [
            'Guard Passing',
            'Mount Escapes',
            'Submissions from Guard',
            'Side Control Techniques',
            'Back Control & Chokes',
            'Takedowns',
            'Sweeps',
            'Positional Drilling',
            'Live Rolling Strategy',
            'Competition Prep'
        ],
        'judo': [
            'Osoto Gari (Major Outer Reap)',
            'Seoi Nage (Shoulder Throw)',
            'Ouchi Gari (Major Inner Reap)',
            'Uchi Mata (Inner Thigh Throw)',
            'Newaza (Ground Techniques)',
            'Grip Fighting (Kumi-kata)',
            'Randori Practice',
            'Kata',
            'Competition Prep',
            'Ukemi (Breakfalls)'
        ],
        'hapkido': [
            'Joint Locks (Kwan Jyel Sul)',
            'Wrist Techniques',
            'Falling & Rolling (Nakbop)',
            'Roundhouse Kick (Dollyo Chagi)',
            'Defensive Kicks',
            'Throwing Techniques',
            'Pressure Points',
            'Weapons Defense',
            'Self-Defense Scenarios',
            'Forms (Hyung)'
        ],
        'tangsoodo': [
            'Front Kick (Ap Chagi)',
            'Roundhouse Kick (Dollyo Chagi)',
            'Side Kick (Yop Chagi)',
            'Spinning Heel Kick',
            'Hyung (Forms)',
            'Il Soo Sik (One-Step Sparring)',
            'Ho Sin Sul (Self-Defense)',
            'Breaking Techniques',
            'Sparring Combinations',
            'Conditioning'
        ],
        'aikido': [
            'Ikkyo (First Teaching)',
            'Nikyo (Second Teaching)',
            'Shihonage (Four Directions)',
            'Iriminage (Entering Throw)',
            'Kotegaeshi (Wrist Turn)',
            'Ukemi (Breakfalls)',
            'Tai Sabaki (Body Movement)',
            'Weapons (Jo/Bokken)',
            'Randori Practice',
            'Ki Development'
        ],
        'kravmaga': [
            'Straight Punches',
            'Palm Strikes',
            'Front Kick (Groin)',
            'Knee Strikes',
            'Choke Defense',
            'Bear Hug Defense',
            'Ground Defense',
            'Knife Defense',
            'Gun Defense',
            'Multiple Attacker Scenarios'
        ],
        'kungfu': [
            'Horse Stance Training',
            'Basic Punches & Blocks',
            'Front Kick (Ti Tui)',
            'Side Kick',
            'Forms (Taolu)',
            'Conditioning (Iron Body)',
            'Speed & Power Drills',
            'Weapons (Staff/Sword)',
            'Partner Drills',
            'Application (San Da)'
        ],
        'custom': [
            'Striking Combinations',
            'Kicking Techniques',
            'Forms / Kata',
            'Sparring Drills',
            'Self-Defense',
            'Conditioning',
            'Flexibility Training',
            'Partner Drills',
            'Competition Prep',
            'Weapons Training'
        ]
    };

    const focusSuggestions = focusSuggestionsByArt[data.beltSystemType] || focusSuggestionsByArt['wt'];

    return (
        <div className="p-6 min-h-[600px] space-y-8 bg-gray-800 rounded-b-lg border-x border-b border-gray-700">
            <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-6 rounded-xl border border-indigo-500/30">
                <div className="flex items-center mb-4">
                    <span className="text-3xl mr-4">🧠</span>
                    <div>
                        <h2 className="text-xl font-bold text-white">AI Class Planner <span className="text-xs bg-green-600 px-2 py-0.5 rounded ml-2">GPT-4o Powered</span></h2>
                        <p className="text-gray-400 text-sm">Professional lesson plans with exact timing, Korean terminology, and age-appropriate activities.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                    <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} className="bg-gray-800 border border-gray-600 rounded p-2 text-white">
                        <option>Little Tigers (4-6)</option>
                        <option>Kids (7-9)</option>
                        <option>Juniors (10-13)</option>
                        <option>Teens/Adults</option>
                    </select>
                    <select value={beltLevel} onChange={e => setBeltLevel(e.target.value)} className="bg-gray-800 border border-gray-600 rounded p-2 text-white">
                        {data.belts.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    </select>
                    <select value={duration} onChange={e => setDuration(e.target.value)} className="bg-gray-800 border border-gray-600 rounded p-2 text-white">
                        <option value="30">30 min class</option>
                        <option value="45">45 min class</option>
                        <option value="60">60 min class</option>
                        <option value="90">90 min class</option>
                    </select>
                    <input 
                        type="text" 
                        placeholder="Focus (e.g. Roundhouse Kick)" 
                        value={focus} 
                        onChange={e => setFocus(e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded p-2 text-white"
                        list="focus-suggestions"
                    />
                    <datalist id="focus-suggestions">
                        {focusSuggestions.map((s, i) => <option key={i} value={s} />)}
                    </datalist>
                    <button 
                        onClick={handleGenerate} 
                        disabled={isGenerating || !focus}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center py-2"
                    >
                        {isGenerating ? '🧠 Thinking...' : '✨ Generate Plan'}
                    </button>
                </div>
                
                {/* Quick Focus Buttons */}
                <div className="flex flex-wrap gap-2 mt-4">
                    <span className="text-gray-500 text-xs uppercase mr-2 self-center">Quick:</span>
                    {focusSuggestions.slice(0, 5).map((suggestion, i) => (
                        <button 
                            key={i}
                            onClick={() => setFocus(suggestion)}
                            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-full transition-colors"
                        >
                            {suggestion.split(' (')[0]}
                        </button>
                    ))}
                </div>
            </div>

            {plan && (
                <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 shadow-2xl animate-fade-in">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-4">
                        <div>
                            <h3 className="text-lg font-bold text-white">Lesson Plan: {focus}</h3>
                            <p className="text-xs text-gray-500">{ageGroup} | {beltLevel} | {duration} min</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => navigator.clipboard.writeText(plan)} className="text-gray-400 hover:text-white text-sm bg-gray-800 px-3 py-1 rounded">📋 Copy</button>
                            <button onClick={() => window.print()} className="text-gray-400 hover:text-white text-sm bg-gray-800 px-3 py-1 rounded">🖨️ Print</button>
                        </div>
                    </div>
                    <div className="prose prose-invert max-w-none whitespace-pre-line text-gray-300 leading-relaxed">
                        {plan}
                    </div>
                </div>
            )}
        </div>
    )
}

// --- MAIN DASHBOARD COMPONENT ---

export const CoachDashboard: React.FC<CoachDashboardProps> = ({ data, coachName, onUpdateStudents, onUpdateData, onBack, userType, onGoToAdmin, clubId }) => {
    const [students, setStudents] = useState<Student[]>(() => data.students.map(s => ({ ...s, totalPoints: s.totalPoints || 0 })));
    const [sessionScores, setSessionScores] = useState<SessionScores>({});
    const [bonusPoints, setBonusPoints] = useState<Record<string, number>>({});
    const [homeworkPoints, setHomeworkPoints] = useState<Record<string, number>>({});
    const [attendance, setAttendance] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [parentMessages, setParentMessages] = useState<Record<string, string>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [isNoteModalOpen, setNoteModalOpen] = useState(false);
    const [isFeedbackPreviewOpen, setFeedbackPreviewOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
    const [activeBeltFilter, setActiveBeltFilter] = useState('all');
    const [activeLocationFilter, setActiveLocationFilter] = useState('all'); // Location State
    const [activeClassFilter, setActiveClassFilter] = useState('all'); // Class State
    const [confirmation, setConfirmation] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
    const [processingPromotion, setProcessingPromotion] = useState<string | null>(null);
    // Certificate State
    const [certificateData, setCertificateData] = useState<{show: boolean, student: Student | null, newBelt: string}>({ show: false, student: null, newBelt: '' });
    
    // Navigation State
    const [activeView, setActiveView] = useState<'grading' | 'schedule' | 'planner' | 'challenges' | 'videos' | 'leaderboard' | 'world-rankings'>('grading');
    const [isAddEventOpen, setIsAddEventOpen] = useState(false);
    const [showChallengeBuilder, setShowChallengeBuilder] = useState(false);

    // Video Review State
    const [pendingVideos, setPendingVideos] = useState<any[]>([]);
    const [currentVideoPlaying, setCurrentVideoPlaying] = useState<string | null>(null);
    const [reviewingVideo, setReviewingVideo] = useState<any | null>(null);
    const [coachVideoNotes, setCoachVideoNotes] = useState('');
    const [xpToAward, setXpToAward] = useState<number>(50);
    const [isLoadingVideos, setIsLoadingVideos] = useState(false);
    const [isProcessingVideo, setIsProcessingVideo] = useState(false);
    const [isGeneratingVideoFeedback, setIsGeneratingVideoFeedback] = useState(false);
    // Batch Review Mode state
    const [batchMode, setBatchMode] = useState(false);
    const [focusedVideoIndex, setFocusedVideoIndex] = useState(0);
    const [approvedCount, setApprovedCount] = useState(0);
    const [rejectedCount, setRejectedCount] = useState(0);

    // Focus Mode and Notes History State
    const [focusMode, setFocusMode] = useState(false);
    const [viewingNotesHistory, setViewingNotesHistory] = useState<Student | null>(null);

    // SENSEI VOICE STATE
    const [isVoiceActive, setIsVoiceActive] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);

    // Sparring State
    const [fighter1, setFighter1] = useState<string>('');
    const [fighter2, setFighter2] = useState<string>('');
    const [sparringSession, setSparringSession] = useState<{
        f1Stats: { head: number, body: number, takedowns: number, punches: number },
        f2Stats: { head: number, body: number, takedowns: number, punches: number }
    }>({
        f1Stats: { head: 0, body: 0, takedowns: 0, punches: 0 },
        f2Stats: { head: 0, body: 0, takedowns: 0, punches: 0 }
    });

    const activeSkills = useMemo(() => data.skills.filter(s => s.isActive), [data.skills]);
    
    // Use custom branch names if available, otherwise generate generic ones
    const locations = useMemo(() => 
        data.branchNames && data.branchNames.length === data.branches 
            ? data.branchNames 
            : Array.from({length: data.branches}, (_, i) => i === 0 ? 'Main Location' : `Location ${i + 1}`), 
    [data.branches, data.branchNames]);

    // Get available classes for selected filter location
    const availableClasses = useMemo(() => {
        if (activeLocationFilter === 'all') {
            // Flatten all classes from all locations
            const allClasses = new Set<string>();
            Object.values(data.locationClasses || {}).forEach((classes: unknown) => {
                if (Array.isArray(classes)) {
                    classes.forEach((c: unknown) => {
                         if (typeof c === 'string') allClasses.add(c);
                    });
                }
            });
            if (allClasses.size === 0 && data.classes) data.classes.forEach(c => allClasses.add(c)); // Fallback
            return Array.from(allClasses);
        }
        return data.locationClasses?.[activeLocationFilter] || data.classes || [];
    }, [activeLocationFilter, data.locationClasses, data.classes]);

    // Initialize scores and attendance
    useEffect(() => {
        setSessionScores(prev => {
            if (Object.keys(prev).length > 0) return prev;
            
            const initialScores: SessionScores = {};
            students.forEach(student => {
                initialScores[student.id] = {};
                activeSkills.forEach(skill => { initialScores[student.id][skill.id] = null; });
            });
            return initialScores;
        });

        setAttendance(prev => {
            if (Object.keys(prev).length > 0) return prev;
            const initialAttendance: Record<string, boolean> = {};
             students.forEach(student => {
                initialAttendance[student.id] = true;
            });
            return initialAttendance;
        });
    }, [students, activeSkills]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const beltMatch = activeBeltFilter === 'all' || s.beltId === activeBeltFilter;
            const locationMatch = activeLocationFilter === 'all' || (s.location === activeLocationFilter);
            const classMatch = activeClassFilter === 'all' || (s.assignedClass === activeClassFilter);
            return beltMatch && locationMatch && classMatch;
        });
    }, [students, activeBeltFilter, activeLocationFilter, activeClassFilter]);

    // --- VOICE RECOGNITION EFFECT ---
    useEffect(() => {
        if ('webkitSpeechRecognition' in window) {
            const recognition = new window.webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                const transcript = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');
                setVoiceTranscript(transcript);

                if (event.results[0].isFinal) {
                    processVoiceCommand(transcript);
                    setVoiceTranscript(''); // Reset for next command
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Voice error', event.error);
                setIsVoiceActive(false);
            };
            
            recognition.onend = () => {
                // Auto-restart if supposed to be active (unless manually stopped)
                if (isVoiceActive) recognition.start();
            };

            recognitionRef.current = recognition;
        }
    }, [students, activeSkills]);

    const toggleVoiceMode = () => {
        if (!recognitionRef.current) {
            alert("Voice recognition is not supported in this browser. Try Chrome.");
            return;
        }
        if (isVoiceActive) {
            recognitionRef.current.stop();
            setIsVoiceActive(false);
        } else {
            recognitionRef.current.start();
            setIsVoiceActive(true);
        }
    };

    const processVoiceCommand = (cmd: string) => {
        const lowerCmd = cmd.toLowerCase();
        if (lowerCmd.includes("stop") || lowerCmd.includes("exit")) {
            toggleVoiceMode();
            return;
        }

        // 1. Find Student
        const targetStudent = students.find(s => lowerCmd.includes(s.name.toLowerCase()));
        if (!targetStudent) return;

        // 2. Find Skill
        let targetSkill = activeSkills.find(s => lowerCmd.includes(s.name.toLowerCase()));
        
        // 3. Find Score
        let score = -1;
        if (lowerCmd.includes("green") || lowerCmd.includes("good") || lowerCmd.includes("point") || lowerCmd.includes("yes")) score = 2;
        else if (lowerCmd.includes("yellow") || lowerCmd.includes("okay") || lowerCmd.includes("half")) score = 1;
        else if (lowerCmd.includes("red") || lowerCmd.includes("bad") || lowerCmd.includes("no")) score = 0;

        if (targetStudent && targetSkill && score !== -1) {
            handleScoreChange(targetStudent.id, targetSkill.id, score);
            setLastVoiceCommand(`${targetStudent.name}: ${targetSkill.name} = ${score === 2 ? '💚' : score === 1 ? '💛' : '❤️'}`);
            setTimeout(() => setLastVoiceCommand(null), 3000);
        }
    };

    const getPointsRequired = (beltId: string) => {
        if (data.useCustomPointsPerBelt && data.pointsPerBelt && data.pointsPerBelt[beltId]) {
            return data.pointsPerBelt[beltId];
        }
        return data.pointsPerStripe;
    };

    const handleScoreChange = (studentId: string, skillId: string, newScore: number) => {
        setSessionScores(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [skillId]: newScore
            }
        }));
    };
    
    const handleBonusChange = (studentId: string, points: number) => {
        // No cap for local XP - coaches can give unlimited bonus points
        setBonusPoints(prev => ({...prev, [studentId]: Math.max(0, points)}));
    };

    const handleHomeworkChange = (studentId: string, points: number) => {
        // No cap for local XP - coaches can give unlimited homework points
        setHomeworkPoints(prev => ({...prev, [studentId]: Math.max(0, points)}));
    };

    const handleBulkScore = (score: number | null) => {
        setSessionScores(prev => {
            const newScores: SessionScores = { ...prev };
            filteredStudents.forEach(student => {
                if (attendance[student.id]) {
                    // Deep copy the student object we are about to modify
                    newScores[student.id] = { ...newScores[student.id] };
                    activeSkills.forEach(skill => { 
                        newScores[student.id][skill.id] = score; 
                    });
                }
            });
            return newScores;
        });
    };

    const resetDashboard = () => {
        const initialScores: SessionScores = {};
        students.forEach(student => {
            initialScores[student.id] = {};
            activeSkills.forEach(skill => { initialScores[student.id][skill.id] = null; });
        });
        setSessionScores(initialScores);
        setNotes({});
        setBonusPoints({});
        setHomeworkPoints({});
        setParentMessages({});
    }

    const handleOpenNoteModal = (student: Student) => {
        setCurrentStudent(student);
        setNoteModalOpen(true);
    };

    const handleSaveNote = (note: string) => {
        if (currentStudent) {
            setNotes(prev => ({ ...prev, [currentStudent.id]: note }));
        }
        setNoteModalOpen(false);
        setCurrentStudent(null);
    };

    const handleGenerateAllFeedback = async () => {
        setIsGenerating(true); // Changed from setIsGeneratingAdvice(true)
        const messages: Record<string, string> = {};
        const presentStudents = filteredStudents.filter(s => attendance[s.id]);
        
        for (const student of presentStudents) {
            const scoresForStudent = activeSkills.map(skill => ({
                skillName: skill.name,
                score: sessionScores[student.id]?.[skill.id] ?? null,
            }));
            const noteForStudent = notes[student.id] || 'No specific notes today.';
            const bonus = bonusPoints[student.id] || 0;
            const homework = homeworkPoints[student.id] || 0;
            const feedback = await generateParentFeedback(
                student.name, 
                scoresForStudent, 
                noteForStudent, 
                bonus, 
                homework,
                student.isReadyForGrading,
                data.gradingRequirementName,
                data.language // Pass selected language
            );
            messages[student.id] = feedback;
        }
        setParentMessages(messages);
        setIsGenerating(false);
        setFeedbackPreviewOpen(true);
    };

    const handleSaveAndNotify = () => {
        let updatedCount = 0;
        let earnedStripes = 0;

        const updatedStudents = students.map(student => {
            if (!attendance[student.id]) return student;

            const studentScores = sessionScores[student.id] || {};
            const studentBonus = bonusPoints[student.id] || 0; // No cap for local
            const studentHomework = homeworkPoints[student.id] || 0; // No cap for local
            
            // Calculate raw PTS for stripe progress + normalized XP for Dojang Rivals
            const scoresArray = Object.values(studentScores);
            const classPTS = calculateClassPTS(scoresArray);
            const sessionTotal = classPTS + studentBonus + studentHomework;
            
            // Calculate LOCAL XP (includes bonus/homework - NO caps for generosity)
            const gradingXP = calculateGradingXP(
                scoresArray,
                studentBonus,
                studentHomework,
                data.coachBonus || false,
                data.homeworkBonus || false
            );
            
            // Calculate GLOBAL XP (capped bonus/homework at 2 each for World Rankings fairness)
            const globalGradingXP = calculateGlobalGradingXP(
                scoresArray,
                studentBonus,
                studentHomework,
                data.coachBonus || false,
                data.homeworkBonus || false
            );
            
            if (sessionTotal === 0 && Object.values(studentScores).every(s => s === null)) return student;

            const totalPointsBefore = student.totalPoints || 0;
            const totalPointsAfter = totalPointsBefore + sessionTotal;
            
            const pointsRequired = getPointsRequired(student.beltId);
            const stripesBefore = Math.floor(totalPointsBefore / pointsRequired);
            const stripesAfter = Math.floor(totalPointsAfter / pointsRequired);
            
            updatedCount++;
            earnedStripes += (stripesAfter - stripesBefore);
            
            const newPerformanceRecord: PerformanceRecord = {
                date: new Date().toISOString(),
                scores: { ...studentScores },
                bonusPoints: studentBonus + studentHomework,
                note: notes[student.id] || undefined,
                coachName: coachName,
            };

            const newFeedbackRecord: FeedbackRecord | null = parentMessages[student.id] ? {
                date: new Date().toISOString(),
                text: parentMessages[student.id],
                coachName: data.ownerName,
                isAIGenerated: true,
            } : null;

            // Calculate new lifetimeXp (normalized XP for Dojang Rivals - never resets)
            const lifetimeXpBefore = student.lifetimeXp || 0;
            const lifetimeXpAfter = lifetimeXpBefore + gradingXP; // Fair normalized XP with bonus/homework

            return { 
                ...student, 
                totalPoints: totalPointsAfter,
                lifetimeXp: lifetimeXpAfter, // Fair normalized XP for Dojang Rivals
                sessionXp: gradingXP, // Store session XP for API call (local - uncapped)
                sessionGlobalXp: globalGradingXP, // Store global XP for World Rankings (capped bonus/homework)
                sessionPts: sessionTotal, // Store session PTS for monthly effort tracking
                attendanceCount: (student.attendanceCount || 0) + 1,
                performanceHistory: [...(student.performanceHistory || []), newPerformanceRecord],
                feedbackHistory: newFeedbackRecord ? [...(student.feedbackHistory || []), newFeedbackRecord] : (student.feedbackHistory || []),
            };
        });

        onUpdateStudents(updatedStudents);
        setStudents(updatedStudents);
        resetDashboard();

        // Persist grading data to database (totalPoints + lifetimeXp + sessionXp for monthly tracking)
        updatedStudents.forEach(async (student) => {
            if (attendance[student.id]) {
                // Extract session values from the updated student object
                const studentAny = student as any;
                const sessionXpValue = studentAny.sessionXp || 0;
                const sessionGlobalXpValue = studentAny.sessionGlobalXp || 0;
                const sessionPtsValue = studentAny.sessionPts || 0;
                
                console.log('[Grading] Persisting for', student.name, '- localXP:', sessionXpValue, 'globalXP:', sessionGlobalXpValue, 'PTS:', sessionPtsValue);
                
                try {
                    // 1. Save local grading data
                    const response = await fetch(`/api/students/${student.id}/grading`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            totalPoints: student.totalPoints,
                            lifetimeXp: student.lifetimeXp,
                            sessionXp: sessionXpValue,
                            sessionPts: sessionPtsValue
                        })
                    });
                    if (!response.ok) {
                        console.error('[Grading] API error for', student.name, ':', await response.text());
                    }
                    
                    // 2. Submit Global XP for World Rankings (uses capped bonus/homework, 1x/day limit enforced by backend)
                    if (data.worldRankingsEnabled && sessionGlobalXpValue > 0) {
                        try {
                            const globalResponse = await fetch(`/api/students/${student.id}/global-xp`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    scorePercentage: sessionGlobalXpValue // Already calculated with capped bonus/homework
                                })
                            });
                            const globalResult = await globalResponse.json();
                            if (globalResult.alreadyGraded) {
                                console.log('[Global XP] Already submitted today for', student.name);
                            } else if (globalResult.globalXpAwarded > 0) {
                                console.log('[Global XP] Awarded', globalResult.globalXpAwarded, 'to', student.name);
                            }
                        } catch (globalErr) {
                            console.error('[Global XP] Error for', student.name, globalErr);
                        }
                    }
                } catch (err) {
                    console.error('Failed to persist grading for student:', student.id, err);
                }
            }
        });

        setConfirmation({ show: true, message: `${updatedCount} students updated. Parents notified. ${earnedStripes} new stripes earned!` });
        setTimeout(() => setConfirmation({ show: false, message: '' }), 5000);
    };

    const handleStudentUpdate = (updatedStudent: Student) => {
        const newStudents = students.map(s => s.id === updatedStudent.id ? updatedStudent : s);
        setStudents(newStudents);
        onUpdateStudents(newStudents);
        setViewingStudent(updatedStudent);
    };

    const handleToggleReady = (student: Student) => {
        const updatedStudent = { ...student, isReadyForGrading: !student.isReadyForGrading };
        const newStudents = students.map(s => s.id === student.id ? updatedStudent : s);
        setStudents(newStudents);
        onUpdateStudents(newStudents);
    };

    const handlePromote = async (student: Student) => {
        const currentBeltIndex = data.belts.findIndex(b => b.id === student.beltId);
        const nextBelt = data.belts[currentBeltIndex + 1];
        
        if (nextBelt) {
            setProcessingPromotion(student.id);
            const promoMessage = await generatePromotionMessage(student.name, nextBelt.name, data.clubName, data.language);
            
            const promotionRecord: FeedbackRecord = {
                date: new Date().toISOString(),
                text: promoMessage,
                coachName: "System",
                isAIGenerated: true
            };

             const updatedStudent = { 
                ...student, 
                beltId: nextBelt.id,
                stripes: 0,
                totalPoints: 0,
                isReadyForGrading: false,
                lastPromotionDate: new Date().toISOString(),
                feedbackHistory: [...(student.feedbackHistory || []), promotionRecord]
            };
            
            const newStudents = students.map(s => s.id === student.id ? updatedStudent : s);
            setStudents(newStudents);
            onUpdateStudents(newStudents);
            
            setProcessingPromotion(null);
            
            // Open Certificate Modal
            setCertificateData({ show: true, student: updatedStudent, newBelt: nextBelt.name });
        }
    };
    
    const handleAddEvent = (newEvent: CalendarEvent) => {
        if(onUpdateData) {
            onUpdateData({ events: [...(data.events || []), newEvent] });
        }
    }

    const handleSaveChallenge = (challenge: CustomChallenge) => {
        if (onUpdateData) {
            const existingChallenges = data.customChallenges || [];
            const existingIndex = existingChallenges.findIndex(c => c.id === challenge.id);
            
            if (existingIndex >= 0) {
                const updated = [...existingChallenges];
                updated[existingIndex] = challenge;
                onUpdateData({ customChallenges: updated });
            } else {
                onUpdateData({ customChallenges: [...existingChallenges, challenge] });
            }
        }
    };

    const handleDeleteChallenge = (challengeId: string) => {
        if (onUpdateData) {
            const existingChallenges = data.customChallenges || [];
            onUpdateData({ customChallenges: existingChallenges.filter(c => c.id !== challengeId) });
        }
    };

    const handleToggleChallenge = (challengeId: string, isActive: boolean) => {
        if (onUpdateData) {
            const existingChallenges = data.customChallenges || [];
            const updated = existingChallenges.map(c => 
                c.id === challengeId ? { ...c, isActive } : c
            );
            onUpdateData({ customChallenges: updated });
        }
    };
    
    const calculateRowData = (student: Student) => {
        const studentScores = sessionScores[student.id] || {};
        const studentBonus = bonusPoints[student.id] || 0; // No cap for local display
        const studentHomework = homeworkPoints[student.id] || 0; // No cap for local display
        
        // Calculate raw PTS for stripe progress (display in grading table)
        const scoresArray = attendance[student.id] ? Object.values(studentScores) : [];
        const classPTS = calculateClassPTS(scoresArray);
        const sessionTotal = classPTS + studentBonus + studentHomework;
        const totalPointsBefore = student.totalPoints || 0;
        const totalPointsAfter = totalPointsBefore + sessionTotal;
        const pointsRequired = getPointsRequired(student.beltId);
        
        const stripesBefore = Math.floor(totalPointsBefore / pointsRequired);
        const stripesAfter = Math.floor(totalPointsAfter / pointsRequired);
        const newStripes = stripesAfter - stripesBefore;
        
        const maxStripes = data.stripesPerBelt;
        const currentStripesTotal = Math.floor(totalPointsAfter / pointsRequired);
        const hasMaxStripes = currentStripesTotal >= maxStripes;

        return { sessionTotal, newStripes, pointsRequired, hasMaxStripes, currentStripesTotal };
    };

    // --- Sparring Logic ---
    const updateSparringStats = (player: 1 | 2, type: 'head' | 'body' | 'punch' | 'takedown') => {
        setSparringSession(prev => {
            const stats = player === 1 ? { ...prev.f1Stats } : { ...prev.f2Stats };
            if (type === 'head') stats.head++;
            if (type === 'body') stats.body++;
            if (type === 'punch') stats.punches++;
            if (type === 'takedown') stats.takedowns++;
            return player === 1 ? { ...prev, f1Stats: stats } : { ...prev, f2Stats: stats };
        });
    }

    const finishSparringMatch = () => {
        if (!fighter1 || !fighter2) return;
        const s1 = students.find(s => s.id === fighter1);
        const s2 = students.find(s => s.id === fighter2);
        if (!s1 || !s2) return;

        // Update Student 1
        const s1NewStats = {
            ...s1.sparringStats,
            matches: (s1.sparringStats?.matches || 0) + 1,
            wins: (s1.sparringStats?.wins || 0) + 1, // Mock: Player 1 always wins for demo
            draws: (s1.sparringStats?.draws || 0),
            headKicks: (s1.sparringStats?.headKicks || 0) + sparringSession.f1Stats.head,
            bodyKicks: (s1.sparringStats?.bodyKicks || 0) + sparringSession.f1Stats.body,
            punches: (s1.sparringStats?.punches || 0) + sparringSession.f1Stats.punches,
            takedowns: (s1.sparringStats?.takedowns || 0) + sparringSession.f1Stats.takedowns,
            defense: 75 // Mock
        };

        // Update Student 2
        const s2NewStats = {
            ...s2.sparringStats,
            matches: (s2.sparringStats?.matches || 0) + 1,
            wins: (s2.sparringStats?.wins || 0),
            draws: (s2.sparringStats?.draws || 0),
            headKicks: (s2.sparringStats?.headKicks || 0) + sparringSession.f2Stats.head,
            bodyKicks: (s2.sparringStats?.bodyKicks || 0) + sparringSession.f2Stats.body,
            punches: (s2.sparringStats?.punches || 0) + sparringSession.f2Stats.punches,
            takedowns: (s2.sparringStats?.takedowns || 0) + sparringSession.f2Stats.takedowns,
            defense: 60 // Mock
        };

        const updatedStudents = students.map(s => {
            if (s.id === fighter1) return { ...s, sparringStats: s1NewStats };
            if (s.id === fighter2) return { ...s, sparringStats: s2NewStats };
            return s;
        });

        onUpdateStudents(updatedStudents);
        setStudents(updatedStudents);
        setConfirmation({ show: true, message: "Match saved! Stats updated." });
        setTimeout(() => setConfirmation({ show: false, message: '' }), 3000);
        
        // Reset
        setSparringSession({
            f1Stats: { head: 0, body: 0, takedowns: 0, punches: 0 },
            f2Stats: { head: 0, body: 0, takedowns: 0, punches: 0 }
        });
        setFighter1('');
        setFighter2('');
    }

    // --- VIDEO REVIEW FUNCTIONS ---
    const fetchPendingVideos = async () => {
        if (!clubId) {
            console.log('[Videos] No clubId available, skipping video fetch');
            return;
        }

        setIsLoadingVideos(true);
        try {
            // Fetch from both original video system and new Arena submissions
            const [videosRes, arenaRes] = await Promise.all([
                fetch(`/api/videos/pending/${clubId}`),
                fetch(`/api/challenges/pending-verification/${clubId}`)
            ]);
            
            let allVideos: any[] = [];
            
            if (videosRes.ok) {
                const videos = await videosRes.json();
                allVideos = Array.isArray(videos) ? videos : [];
            }
            
            // Add Arena submissions with source marker
            if (arenaRes.ok) {
                const arenaSubmissions = await arenaRes.json();
                if (Array.isArray(arenaSubmissions)) {
                    const formattedArena = arenaSubmissions.map((s: any) => ({
                        id: s.id,
                        student_id: s.student_id,
                        student_name: `${s.first_name} ${s.last_name}`,
                        student_belt: s.current_belt,
                        challenge_name: s.answer || 'Arena Challenge',
                        video_url: s.video_url,
                        score: s.score,
                        status: 'pending',
                        created_at: s.completed_at,
                        source: 'arena' // Mark as Arena submission
                    }));
                    allVideos = [...allVideos, ...formattedArena];
                }
            }
            
            setPendingVideos(allVideos);
        } catch (error) {
            console.error('[Videos] Failed to fetch pending videos:', error);
            setPendingVideos([]);
        } finally {
            setIsLoadingVideos(false);
        }
    };

    // Fetch videos when switching to videos view
    useEffect(() => {
        if (activeView === 'videos') {
            fetchPendingVideos();
        }
    }, [activeView]);

    // Batch Review Keyboard Shortcuts
    useEffect(() => {
        if (!batchMode || activeView !== 'videos' || pendingVideos.length === 0) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            const currentVideo = pendingVideos[focusedVideoIndex];
            if (!currentVideo) return;
            
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    handleBatchApprove(currentVideo);
                    break;
                case 'KeyX':
                    e.preventDefault();
                    handleBatchReject(currentVideo);
                    break;
                case 'ArrowRight':
                case 'KeyN':
                    e.preventDefault();
                    setFocusedVideoIndex(prev => Math.min(prev + 1, pendingVideos.length - 1));
                    break;
                case 'ArrowLeft':
                case 'KeyP':
                    e.preventDefault();
                    setFocusedVideoIndex(prev => Math.max(prev - 1, 0));
                    break;
                case 'Escape':
                    setBatchMode(false);
                    break;
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [batchMode, activeView, pendingVideos, focusedVideoIndex]);

    // Batch approve helper (quick approve without notes)
    const handleBatchApprove = async (video: any) => {
        if (isProcessingVideo) return;
        setIsProcessingVideo(true);
        try {
            const fixedXp = video.xp_awarded || 40;
            const response = await fetch(`/api/videos/${video.id}/verify`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'approved',
                    coachNotes: '',
                    xpAwarded: fixedXp
                })
            });
            if (response.ok) {
                setPendingVideos(prev => prev.filter(v => v.id !== video.id));
                setApprovedCount(prev => prev + 1);
                // Move to next video or stay at end
                setFocusedVideoIndex(prev => Math.min(prev, Math.max(0, pendingVideos.length - 2)));
            }
        } catch (error) {
            console.error('[Batch] Failed to approve:', error);
        } finally {
            setIsProcessingVideo(false);
        }
    };

    // Batch reject helper (quick reject without notes)
    const handleBatchReject = async (video: any) => {
        if (isProcessingVideo) return;
        setIsProcessingVideo(true);
        try {
            const response = await fetch(`/api/videos/${video.id}/verify`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'rejected',
                    coachNotes: '',
                    xpAwarded: 0
                })
            });
            if (response.ok) {
                setPendingVideos(prev => prev.filter(v => v.id !== video.id));
                setRejectedCount(prev => prev + 1);
                setFocusedVideoIndex(prev => Math.min(prev, Math.max(0, pendingVideos.length - 2)));
            }
        } catch (error) {
            console.error('[Batch] Failed to reject:', error);
        } finally {
            setIsProcessingVideo(false);
        }
    };

    const handleApproveVideo = async (video: any) => {
        console.log('[Videos] Approving video:', video.id, 'source:', video.source);
        setIsProcessingVideo(true);
        try {
            let response;
            
            if (video.source === 'arena') {
                response = await fetch('/api/challenges/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        submissionId: video.id,
                        verified: true,
                        coachId: coachName
                    })
                });
            } else {
                // Use the pre-stored XP value from the video (prevents XP inflation)
                const fixedXp = video.xp_awarded || 40;
                response = await fetch(`/api/videos/${video.id}/verify`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'approved',
                        coachNotes: coachVideoNotes,
                        xpAwarded: fixedXp
                    })
                });
            }

            const data = await response.json();
            console.log('[Videos] Approve response:', response.status, data);

            if (response.ok) {
                setPendingVideos(prev => prev.filter(v => v.id !== video.id));
                setReviewingVideo(null);
                setCoachVideoNotes('');
                setXpToAward(50);
                setCurrentVideoPlaying(null);
                // Use data.xpAwarded (authoritative from backend) for all arena/coach_pick videos
                const xp = data.xpAwarded || video.xp_awarded || xpToAward;
                setConfirmation({ show: true, message: `Video approved! +${xp} XP awarded.` });
                setTimeout(() => setConfirmation({ show: false, message: '' }), 3000);
            } else {
                console.error('[Videos] Approve failed:', data.error);
                setConfirmation({ show: true, message: `Error: ${data.error || 'Failed to approve'}` });
                setTimeout(() => setConfirmation({ show: false, message: '' }), 3000);
            }
        } catch (error) {
            console.error('[Videos] Failed to approve video:', error);
        } finally {
            setIsProcessingVideo(false);
        }
    };

    const handleRejectVideo = async (video: any) => {
        console.log('[Videos] Rejecting video:', video.id, 'source:', video.source);
        setIsProcessingVideo(true);
        try {
            let response;
            
            if (video.source === 'arena') {
                response = await fetch('/api/challenges/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        submissionId: video.id,
                        verified: false,
                        coachId: coachName
                    })
                });
            } else {
                response = await fetch(`/api/videos/${video.id}/verify`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'rejected',
                        coachNotes: coachVideoNotes,
                        xpAwarded: 0
                    })
                });
            }

            const data = await response.json();
            console.log('[Videos] Reject response:', response.status, data);

            if (response.ok) {
                setPendingVideos(prev => prev.filter(v => v.id !== video.id));
                setReviewingVideo(null);
                setCoachVideoNotes('');
                setCurrentVideoPlaying(null);
                setConfirmation({ show: true, message: 'Video rejected.' });
                setTimeout(() => setConfirmation({ show: false, message: '' }), 3000);
            } else {
                console.error('[Videos] Reject failed:', data.error);
                setConfirmation({ show: true, message: `Error: ${data.error || 'Failed to reject'}` });
                setTimeout(() => setConfirmation({ show: false, message: '' }), 3000);
            }
        } catch (error) {
            console.error('[Videos] Failed to reject video:', error);
        } finally {
            setIsProcessingVideo(false);
        }
    };

    const handleGenerateVideoFeedback = async (video: any) => {
        setIsGeneratingVideoFeedback(true);
        try {
            const response = await fetch('/api/ai/video-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentName: video.student_name,
                    challengeName: video.challenge_name,
                    challengeCategory: video.challenge_category,
                    score: video.score,
                    beltLevel: video.student_belt,
                    coachNotes: coachVideoNotes
                })
            });

            if (response.ok) {
                const result = await response.json();
                setCoachVideoNotes(result.feedback || '');
            } else {
                const fallback = `Great effort on the ${video.challenge_name} challenge, ${video.student_name}! Keep up the hard work and continue to push yourself. Your dedication shows!`;
                setCoachVideoNotes(fallback);
            }
        } catch (error) {
            console.error('[Videos] Failed to generate AI feedback:', error);
            const fallback = `Excellent submission for the ${video.challenge_name} challenge! Keep training hard and stay focused on your goals.`;
            setCoachVideoNotes(fallback);
        } finally {
            setIsGeneratingVideoFeedback(false);
        }
    };

    const getCategoryEmoji = (category: string) => {
        switch(category?.toLowerCase()) {
            case 'power': return '💪';
            case 'technique': return '🎯';
            case 'flexibility': return '🧘';
            case 'speed': return '⚡';
            case 'endurance': return '🔥';
            default: return '🏆';
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
             {confirmation.show && (
                <div className="fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg z-[60] animate-pulse">
                    ✅ {confirmation.message}
                </div>
            )}
            
            <SenseiVoiceHUD transcript={voiceTranscript} isActive={isVoiceActive} lastCommand={lastVoiceCommand} students={students} skills={activeSkills} />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* MAIN TABLE AREA */}
                <div className="lg:col-span-3 bg-gray-800/50 rounded-lg border border-gray-700 shadow-2xl">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-t-xl border-b border-gray-700/50 overflow-hidden">
                        {/* Top Bar - Title & Actions (Mobile Optimized) */}
                        <div className="px-3 md:px-6 py-3 md:py-4 flex flex-wrap justify-between items-center gap-2 border-b border-gray-700/30">
                            <div className="flex items-center gap-2 md:gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
                                    <span className="text-xl md:text-2xl">
                                        {activeView === 'grading' ? '📋' : activeView === 'schedule' ? '📅' : activeView === 'planner' ? '🧠' : activeView === 'challenges' ? '🏆' : activeView === 'leaderboard' ? '🥇' : activeView === 'world-rankings' ? '🌍' : '🎬'}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-base md:text-xl font-bold text-white truncate">
                                        {activeView === 'grading' ? `Today's Class` : activeView === 'schedule' ? `Schedule` : activeView === 'planner' ? 'Planner' : activeView === 'challenges' ? 'Challenges' : activeView === 'leaderboard' ? 'Leaderboard' : activeView === 'world-rankings' ? 'World Rankings' : 'Videos'}
                                    </h1>
                                    <p className="text-xs md:text-sm text-gray-400 flex items-center gap-1 md:gap-2 truncate">
                                        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-500"></span> <span className="hidden xs:inline">Coach</span> {coachName}</span>
                                        <span className="text-gray-600 hidden sm:inline">|</span>
                                        <span className="hidden sm:inline truncate">{data.clubName}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                                {/* SENSEI VOICE BUTTON */}
                                <button 
                                    onClick={toggleVoiceMode}
                                    className={`px-2 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 flex items-center gap-1 md:gap-2 ${isVoiceActive ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-gray-900 shadow-lg shadow-cyan-500/40 animate-pulse' : 'bg-gray-800/80 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 hover:bg-gray-700/80'}`}
                                    title="Hands-Free Grading"
                                >
                                    <span className="text-base md:text-lg">🎙️</span>
                                    <span className="hidden sm:inline">{isVoiceActive ? 'LISTENING...' : 'Voice'}</span>
                                </button>
                                {userType === 'owner' && onGoToAdmin && (
                                    <button onClick={onGoToAdmin} className="px-2 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-gray-800/80 text-gray-300 border border-gray-600/50 hover:border-cyan-500/50 hover:text-cyan-400 transition-all duration-300 flex items-center gap-1 md:gap-2">
                                        <span>⬅️</span> <span className="hidden sm:inline">Admin</span>
                                    </button>
                                )}
                                <button onClick={onBack} className="px-2 md:px-4 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-400 transition-all duration-300 flex items-center gap-1 md:gap-2">
                                    <span>🚪</span> <span className="hidden sm:inline">Logout</span>
                                </button>
                            </div>
                        </div>
                        
                        {/* Navigation Tabs - Glossy Capsule Buttons (Mobile Optimized) */}
                        <div className="px-2 md:px-4 py-2 md:py-3 overflow-x-auto scrollbar-hide bg-gray-900/50">
                            <div className="flex items-center gap-1.5 md:gap-3 min-w-max">
                                <button 
                                    onClick={() => setActiveView('grading')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'grading' 
                                            ? 'bg-gradient-to-b from-sky-400 via-sky-500 to-sky-700 text-white shadow-lg shadow-sky-500/40 border-t border-sky-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">📋</span>
                                    <span className="relative hidden sm:inline">Grading</span>
                                </button>
                                <button 
                                    onClick={() => setActiveView('planner')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'planner' 
                                            ? 'bg-gradient-to-b from-purple-400 via-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/40 border-t border-purple-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">🧠</span>
                                    <span className="relative hidden sm:inline">Plan</span>
                                </button>
                                <button 
                                    onClick={() => setActiveView('schedule')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'schedule' 
                                            ? 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/40 border-t border-emerald-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">📅</span>
                                    <span className="relative hidden sm:inline">Schedule</span>
                                </button>
                                <button 
                                    onClick={() => setActiveView('challenges')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'challenges' 
                                            ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-700 text-white shadow-lg shadow-amber-500/40 border-t border-amber-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">🏆</span>
                                    <span className="relative hidden sm:inline">Challenges</span>
                                </button>
                                <button 
                                    onClick={() => setActiveView('videos')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'videos' 
                                            ? 'bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 text-white shadow-lg shadow-rose-500/40 border-t border-rose-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">🎬</span>
                                    <span className="relative hidden sm:inline">Videos</span>
                                    {pendingVideos.length > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center font-bold animate-pulse shadow-lg shadow-red-500/50 z-10">
                                            {pendingVideos.length}
                                        </span>
                                    )}
                                </button>
                                
                                <div className="w-px h-6 md:h-8 bg-gradient-to-b from-transparent via-gray-600 to-transparent mx-0.5 md:mx-1 flex-shrink-0"></div>
                                
                                <button 
                                    onClick={() => setActiveView('leaderboard')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'leaderboard' 
                                            ? 'bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600 text-gray-900 shadow-lg shadow-yellow-500/40 border-t border-yellow-200/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">🥇</span>
                                    <span className="relative hidden sm:inline">Leaderboard</span>
                                </button>
                                <button 
                                    onClick={() => setActiveView('world-rankings')}
                                    className={`group relative px-3 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 md:gap-2 overflow-hidden flex-shrink-0
                                        ${activeView === 'world-rankings' 
                                            ? 'bg-gradient-to-b from-cyan-400 via-blue-500 to-purple-600 text-white shadow-lg shadow-cyan-500/40 border-t border-cyan-300/50' 
                                            : 'bg-gradient-to-b from-gray-600 via-gray-700 to-gray-800 text-gray-300 hover:from-gray-500 hover:via-gray-600 hover:to-gray-700 border-t border-gray-500/30 shadow-md'}`}
                                >
                                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full"></span>
                                    <span className="relative text-base md:text-lg">🌍</span>
                                    <span className="relative hidden sm:inline">World</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Content Area with Filters */}
                    <div className="p-4 space-y-4">
                        
                        {/* Filters (Only for Grading View) */}
                        {activeView === 'grading' && (
                            <>
                                <div className="flex space-x-2">
                                    <select 
                                        value={activeLocationFilter} 
                                        onChange={e => {
                                            setActiveLocationFilter(e.target.value);
                                            setActiveClassFilter('all'); // Reset class filter on location change
                                        }} 
                                        className="bg-gray-700 border border-gray-600 rounded-md text-white text-sm py-2 px-3 font-bold focus:ring-sky-500 focus:border-sky-500"
                                    >
                                        <option value="all">📍 All Locations</option>
                                        {locations.map(loc => <option key={loc} value={loc}>📍 {loc}</option>)}
                                    </select>
                                    <select 
                                        value={activeClassFilter} 
                                        onChange={e => setActiveClassFilter(e.target.value)} 
                                        className="bg-gray-700 border border-gray-600 rounded-md text-white text-sm py-2 px-3 font-bold focus:ring-sky-500 focus:border-sky-500"
                                        disabled={activeLocationFilter === 'all' && availableClasses.length === 0}
                                    >
                                        <option value="all">⏰ All Classes</option>
                                        {availableClasses.map(cls => <option key={cls} value={cls}>⏰ {cls}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-wrap items-center gap-4">
                                     <div>
                                        <label htmlFor="belt-filter" className="text-xs font-medium text-gray-400 mr-2">Filter by Belt:</label>
                                        <select id="belt-filter" value={activeBeltFilter} onChange={e => setActiveBeltFilter(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md text-white text-sm py-1 px-2 focus:ring-sky-500 focus:border-sky-500">
                                            <option value="all">All Belts</option>
                                            {data.belts.map(belt => <option key={belt.id} value={belt.id}>{belt.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button onClick={() => handleBulkScore(2)} className="bg-green-600/80 hover:bg-green-600 text-white font-bold py-1.5 px-3 text-sm rounded-md">💚 All Greens</button>
                                        <button onClick={() => handleBulkScore(1)} className="bg-yellow-500/80 hover:bg-yellow-500 text-white font-bold py-1.5 px-3 text-sm rounded-md">💛 All Yellows</button>
                                        <button onClick={() => handleBulkScore(0)} className="bg-red-500/80 hover:bg-red-500 text-white font-bold py-1.5 px-3 text-sm rounded-md">❤️ All Reds</button>
                                        <button onClick={() => handleBulkScore(null)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1.5 px-3 text-sm rounded-md">Reset</button>
                                    </div>
                                    <button 
                                        onClick={() => setFocusMode(!focusMode)} 
                                        className={`py-1.5 px-3 text-sm rounded-md font-bold transition-all ${focusMode ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                        title="Focus Mode - Simplified view for faster grading"
                                    >
                                        {focusMode ? '🎯 Focus ON' : '🎯 Focus'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Content Area */}
                    {activeView === 'grading' ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-300">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3">Student</th>
                                        {activeSkills.map(s => <th key={s.id} className="px-3 py-3 text-center">{s.name}</th>)}
                                        {!focusMode && data.homeworkBonus && <th className="px-2 py-3 text-center text-sky-300">Homework</th>}
                                        {!focusMode && data.coachBonus && <th className="px-2 py-3 text-center text-purple-400">Bonus</th>}
                                        <th className="px-2 py-3 text-center">Total</th>
                                        <th className="px-4 py-3 min-w-[200px]">Stripe Bar</th>
                                        {!focusMode && data.gradingRequirementEnabled && (
                                            <th className="px-2 py-3 text-center text-yellow-400">{data.gradingRequirementName || 'Req.'}</th>
                                        )}
                                        <th className="px-2 py-3 text-center">Note</th>
                                        {!focusMode && <th className="px-2 py-3 text-center">View</th>}
                                        <th className="px-4 py-3 text-center">✅</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudents.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="px-4 py-8 text-center text-gray-500 italic">
                                                No students found for this filter.
                                            </td>
                                        </tr>
                                    ) : (
                                    filteredStudents.map((student) => {
                                        const { sessionTotal, newStripes, pointsRequired, hasMaxStripes } = calculateRowData(student);
                                        const isReady = student.isReadyForGrading;
                                        const rowClass = isReady ? 'bg-yellow-900/20 border-yellow-600/50' : (!attendance[student.id] ? 'opacity-40' : 'bg-gray-800');
                                        
                                        return (
                                        <tr key={student.id} className={`border-b border-gray-700 transition-all ${rowClass}`}>
                                            <td className="px-4 py-2 font-medium text-white whitespace-nowrap">
                                                <button onClick={() => setViewingStudent(student)} className="hover:text-sky-300 flex items-center">
                                                    {student.name} 
                                                    {newStripes > 0 && <span className="ml-2 animate-bounce">🎉</span>}
                                                    {isReady && <span className="ml-2" title="Ready for Promotion">🌟</span>}
                                                    {student.rivalsStats && student.rivalsStats.xp >= 500 && (
                                                        <span 
                                                            className="ml-2" 
                                                            title={`Home Practice: ${student.rivalsStats.xp.toLocaleString()} XP`}
                                                        >
                                                            {student.rivalsStats.xp >= 5000 ? '🏆' : 
                                                             student.rivalsStats.xp >= 2000 ? '⚔️' : 
                                                             student.rivalsStats.xp >= 1000 ? '⭐' : '🔥'}
                                                        </span>
                                                    )}
                                                </button>
                                                {(student.location || student.assignedClass) && (
                                                    <div className="text-[10px] text-gray-500 font-normal">
                                                        {[student.location, student.assignedClass].filter(Boolean).join(' • ')}
                                                    </div>
                                                )}
                                            </td>
                                            {activeSkills.map(skill => <td key={skill.id} className="px-3 py-2"><ScoreDropdown score={sessionScores[student.id]?.[skill.id]} onChange={score => handleScoreChange(student.id, skill.id, score)} /></td>)}
                                            {!focusMode && data.homeworkBonus && <td className="px-2 py-2"><input type="number" min="0" placeholder="0" value={homeworkPoints[student.id] || ''} onChange={e => handleHomeworkChange(student.id, parseInt(e.target.value) || 0)} className="w-16 bg-gray-700 text-blue-300 font-bold p-1 rounded-md border border-gray-600 text-center focus:ring-sky-500"/></td>}
                                            {!focusMode && data.coachBonus && <td className="px-2 py-2"><input type="number" min="0" placeholder="0" value={bonusPoints[student.id] || ''} onChange={e => handleBonusChange(student.id, parseInt(e.target.value) || 0)} className="w-16 bg-gray-700 text-purple-300 font-bold p-1 rounded-md border border-gray-600 text-center focus:ring-purple-500"/></td>}
                                            <td className="px-2 py-2 text-center font-bold text-lg">{sessionTotal}</td>
                                            <td className="px-4 py-2">
                                                {isReady ? (
                                                    <button 
                                                        onClick={() => handlePromote(student)}
                                                        disabled={processingPromotion === student.id}
                                                        className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-bold py-1 px-2 rounded shadow-lg transform hover:scale-105 transition-all disabled:opacity-70 disabled:cursor-wait flex justify-center items-center"
                                                    >
                                                        {processingPromotion === student.id ? (
                                                             <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        ) : 'Promote ⬆️'}
                                                    </button>
                                                ) : hasMaxStripes && !data.gradingRequirementEnabled ? (
                                                    (() => {
                                                        const currentBeltIndex = data.belts.findIndex(b => b.id === student.beltId);
                                                        const nextBelt = data.belts[currentBeltIndex + 1];
                                                        return nextBelt ? (
                                                            <button 
                                                                onClick={() => handlePromote(student)}
                                                                disabled={processingPromotion === student.id}
                                                                className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-1 px-2 rounded shadow-lg transform hover:scale-105 transition-all disabled:opacity-70 disabled:cursor-wait flex justify-center items-center"
                                                            >
                                                                {processingPromotion === student.id ? (
                                                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                ) : `Promote to ${nextBelt.name} ⬆️`}
                                                            </button>
                                                        ) : (
                                                            <div className="w-full bg-yellow-400 text-black font-bold py-1 px-2 rounded text-center text-xs uppercase tracking-wide">
                                                                Max Belt Reached
                                                            </div>
                                                        );
                                                    })()
                                                ) : (
                                                    <ProgressBar 
                                                        student={student} 
                                                        sessionTotal={sessionTotal} 
                                                        pointsPerStripe={pointsRequired} 
                                                        newStripes={newStripes} 
                                                        hasMaxStripes={hasMaxStripes}
                                                    />
                                                )}
                                            </td>
                                            
                                            {!focusMode && data.gradingRequirementEnabled && (
                                                <td className="px-2 py-2 text-center">
                                                    <div className="flex justify-center" title={hasMaxStripes ? "Toggle Readiness" : "Earn max stripes to unlock"}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={!!student.isReadyForGrading} 
                                                            disabled={!hasMaxStripes}
                                                            onChange={() => handleToggleReady(student)} 
                                                            className={`w-5 h-5 rounded focus:ring-yellow-500 ${hasMaxStripes ? 'text-yellow-500 bg-gray-700 border-gray-500 cursor-pointer' : 'text-gray-600 bg-gray-800 border-gray-700 cursor-not-allowed opacity-50'}`}
                                                        />
                                                    </div>
                                                </td>
                                            )}

                                            <td className="px-2 py-2 text-center text-lg">
                                                <div className="flex justify-center gap-1">
                                                    <button onClick={() => handleOpenNoteModal(student)} className="hover:scale-125 transition-transform" title="Add Note">{notes[student.id] ? '✍️' : '🎤'}</button>
                                                    <button onClick={() => setViewingNotesHistory(student)} className="hover:scale-125 transition-transform text-gray-400 hover:text-sky-300" title="View Notes History">📋</button>
                                                </div>
                                            </td>
                                            {!focusMode && <td className="px-2 py-2 text-center"><button onClick={() => setViewingStudent(student)} className="text-xl hover:text-sky-300 transition-colors">👁️</button></td>}
                                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={!!attendance[student.id]} onChange={() => setAttendance(p => ({...p, [student.id]: !p[student.id]}))} className="w-5 h-5 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"/></td>
                                        </tr>
                                    )}))}
                                </tbody>
                            </table>
                        </div>
                    ) : activeView === 'planner' ? (
                        <LessonPlanner data={data} />
                    ) : activeView === 'schedule' ? (
                        // SCHEDULE VIEW
                        <div className="p-6 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Section 1: My Weekly Classes */}
                                <div className="md:col-span-2 bg-gray-700/30 p-4 rounded-lg border border-gray-600/50">
                                    <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-600 pb-2">
                                        🗓️ My Weekly Classes
                                    </h3>
                                    <div className="space-y-3">
                                        {(data.schedule || []).filter(s => s.instructor === coachName || coachName === data.ownerName).length === 0 && (
                                            <p className="text-gray-400 italic text-sm">No recurring classes assigned.</p>
                                        )}
                                        {(data.schedule || []).filter(s => s.instructor === coachName || coachName === data.ownerName).map(cls => (
                                            <div key={cls.id} className="bg-gray-800 p-3 rounded border border-gray-700 flex justify-between items-center">
                                                <div>
                                                    <span className="text-sky-300 font-bold mr-2">{cls.day} {cls.time}</span>
                                                    <span className="text-white font-medium">{cls.className}</span>
                                                    <p className="text-xs text-gray-500">{cls.location} • {cls.instructor}</p>
                                                </div>
                                                <button className="bg-gray-700 hover:bg-gray-600 text-xs text-white px-3 py-1 rounded">
                                                    Start
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Section 2: Private Bookings */}
                                <div className="bg-purple-900/20 p-4 rounded-lg border border-purple-500/30">
                                    <h3 className="text-lg font-bold text-purple-200 mb-4 border-b border-purple-800/50 pb-2">
                                        🥋 Private Lessons
                                    </h3>
                                    <div className="space-y-3">
                                        {(data.privateSlots || []).filter(s => s.coachName === coachName || coachName === data.ownerName).length === 0 && (
                                            <p className="text-gray-400 italic text-sm">No private slots.</p>
                                        )}
                                        {(data.privateSlots || []).filter(s => s.coachName === coachName || coachName === data.ownerName).map(slot => (
                                            <div key={slot.id} className={`p-3 rounded border flex justify-between items-center ${slot.isBooked ? 'bg-green-900/30 border-green-500/50' : 'bg-gray-800 border-gray-700 opacity-60'}`}>
                                                <div>
                                                    <p className="text-white font-bold text-sm">{new Date(slot.date).toLocaleDateString()}</p>
                                                    <p className="text-xs text-gray-400">{slot.isBooked ? 'Booked (Check Email)' : 'Open Slot'}</p>
                                                </div>
                                                {slot.isBooked && <span className="text-green-400 text-xs font-bold">CONFIRMED</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Upcoming Events */}
                            <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600/50">
                                <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                                    <h3 className="text-lg font-bold text-white">🏆 Upcoming Club Events</h3>
                                    {onUpdateData && (
                                        <button onClick={() => setIsAddEventOpen(true)} className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1 px-3 rounded">
                                            + Add Event
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {(data.events || []).map(evt => (
                                        <div key={evt.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide block mb-1">{evt.type}</span>
                                            <h4 className="font-bold text-white text-lg">{evt.title}</h4>
                                            <p className="text-gray-400 text-sm mt-2 flex items-center">
                                                📅 {new Date(evt.date).toLocaleDateString()} <span className="mx-2">•</span> 🕒 {evt.time}
                                            </p>
                                            <p className="text-gray-500 text-xs mt-1">📍 {evt.location}</p>
                                        </div>
                                    ))}
                                    {(data.events || []).length === 0 && <p className="text-gray-500 text-sm italic">No upcoming events found.</p>}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* CHALLENGES VIEW */}
                    {activeView === 'challenges' && (
                        <div className="p-6 min-h-[500px] bg-gray-900">
                            <div className="max-w-4xl mx-auto">
                                <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-2xl p-8 border border-cyan-500/30 mb-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-2">Custom Challenge Builder</h2>
                                            <p className="text-gray-400">Create unique challenges for your students to compete in Dojang Rivals</p>
                                        </div>
                                        <button
                                            onClick={() => setShowChallengeBuilder(true)}
                                            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
                                        >
                                            <span className="text-xl">🏆</span>
                                            Create Challenge
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
                                        <div className="text-4xl mb-2">📊</div>
                                        <div className="text-3xl font-black text-cyan-400">{(data.customChallenges || []).filter(c => c.isActive).length}</div>
                                        <div className="text-gray-400 text-sm">Active Challenges</div>
                                    </div>
                                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
                                        <div className="text-4xl mb-2">🎯</div>
                                        <div className="text-3xl font-black text-yellow-400">{(data.customChallenges || []).filter(c => c.weeklyChallenge).length}</div>
                                        <div className="text-gray-400 text-sm">Weekly Challenges</div>
                                    </div>
                                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
                                        <div className="text-4xl mb-2">👥</div>
                                        <div className="text-3xl font-black text-green-400">{students.length}</div>
                                        <div className="text-gray-400 text-sm">Students</div>
                                    </div>
                                </div>

                                {(data.customChallenges || []).length === 0 ? (
                                    <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-gray-700">
                                        <div className="text-7xl mb-4">🏆</div>
                                        <h3 className="text-2xl font-bold text-white mb-2">No Custom Challenges Yet</h3>
                                        <p className="text-gray-400 mb-6 max-w-md mx-auto">
                                            Create your first custom challenge to give your students unique ways to compete and earn XP in Dojang Rivals!
                                        </p>
                                        <button
                                            onClick={() => setShowChallengeBuilder(true)}
                                            className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold px-8 py-3 rounded-xl transition-all"
                                        >
                                            Create Your First Challenge
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <span className="text-green-400">●</span> Your Custom Challenges
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {(data.customChallenges || []).filter(c => c.isActive).map(challenge => (
                                                <div key={challenge.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-cyan-500/50 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl">
                                                            {challenge.icon}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white">{challenge.name}</span>
                                                                {challenge.weeklyChallenge && (
                                                                    <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">Weekly</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs text-gray-500">{challenge.category}</span>
                                                                <span className="text-xs text-gray-500">•</span>
                                                                <span className="text-xs text-gray-500">{challenge.difficulty}</span>
                                                                <span className="text-green-400 text-sm font-bold ml-auto">+{challenge.xp} XP</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setShowChallengeBuilder(true)}
                                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-bold py-4 rounded-xl transition-all border border-dashed border-gray-600 hover:border-cyan-500"
                                        >
                                            + Add More Challenges
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* VIDEOS VIEW */}
                    {activeView === 'videos' && (
                        <div className="p-6">
                            <div className="space-y-6">
                                {/* Feature Explainer Panel */}
                                <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 rounded-xl p-4 border border-indigo-500/30">
                                    <div className="flex items-start gap-4">
                                        <span className="text-3xl">🤖</span>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-white mb-2">Smart Video Review System</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                <div className="bg-gray-800/50 rounded-lg p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-green-400">⭐</span>
                                                        <span className="font-bold text-white">Trust Tiers</span>
                                                    </div>
                                                    <p className="text-gray-400 text-xs">
                                                        Students with 10+ approved videos become <span className="text-green-400">Verified</span> and get instant XP. Only 1-in-10 are spot-checked.
                                                    </p>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-cyan-400">⚡</span>
                                                        <span className="font-bold text-white">Speed Mode</span>
                                                    </div>
                                                    <p className="text-gray-400 text-xs">
                                                        Use keyboard shortcuts in Speed Mode: <kbd className="bg-gray-700 px-1 rounded text-xs">SPACE</kbd>=Approve, <kbd className="bg-gray-700 px-1 rounded text-xs">X</kbd>=Reject
                                                    </p>
                                                </div>
                                                <div className="bg-gray-800/50 rounded-lg p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-yellow-400">🔍</span>
                                                        <span className="font-bold text-white">AI Flags</span>
                                                    </div>
                                                    <p className="text-gray-400 text-xs">
                                                        <span className="text-red-400">Red</span>=duplicates, <span className="text-yellow-400">Yellow</span>=suspicious patterns. Auto-flagged for your review.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Cards + Batch Mode Toggle */}
                                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                    <div className="flex gap-4 flex-wrap">
                                        <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 rounded-xl px-6 py-4 border border-orange-500/30 flex items-center gap-3">
                                            <span className="text-2xl">📹</span>
                                            <div>
                                                <div className="text-2xl font-black text-orange-400">{pendingVideos.length}</div>
                                                <div className="text-gray-400 text-xs">Pending</div>
                                            </div>
                                        </div>
                                        <div className="bg-gray-800 rounded-xl px-6 py-4 border border-gray-700 flex items-center gap-3">
                                            <span className="text-2xl">✅</span>
                                            <div>
                                                <div className="text-2xl font-black text-green-400">{approvedCount}</div>
                                                <div className="text-gray-400 text-xs">Approved</div>
                                            </div>
                                        </div>
                                        <div className="bg-gray-800 rounded-xl px-6 py-4 border border-gray-700 flex items-center gap-3">
                                            <span className="text-2xl">❌</span>
                                            <div>
                                                <div className="text-2xl font-black text-red-400">{rejectedCount}</div>
                                                <div className="text-gray-400 text-xs">Rejected</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Batch Mode Toggle */}
                                    <button
                                        onClick={() => {
                                            setBatchMode(!batchMode);
                                            setFocusedVideoIndex(0);
                                        }}
                                        className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${
                                            batchMode 
                                                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/30' 
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        <span>⚡</span>
                                        {batchMode ? 'Exit Speed Mode' : 'Speed Review Mode'}
                                    </button>
                                </div>

                                {/* Batch Mode Instructions */}
                                {batchMode && pendingVideos.length > 0 && (
                                    <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-4 border border-cyan-500/30">
                                        <div className="flex items-center justify-between flex-wrap gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="text-cyan-400 font-bold">Keyboard Shortcuts:</div>
                                                <div className="flex gap-3">
                                                    <kbd className="bg-gray-800 px-3 py-1 rounded text-green-400 font-mono text-sm border border-gray-600">SPACE</kbd>
                                                    <span className="text-gray-400">= Approve</span>
                                                </div>
                                                <div className="flex gap-3">
                                                    <kbd className="bg-gray-800 px-3 py-1 rounded text-red-400 font-mono text-sm border border-gray-600">X</kbd>
                                                    <span className="text-gray-400">= Reject</span>
                                                </div>
                                                <div className="flex gap-3">
                                                    <kbd className="bg-gray-800 px-3 py-1 rounded text-gray-300 font-mono text-sm border border-gray-600">← →</kbd>
                                                    <span className="text-gray-400">= Navigate</span>
                                                </div>
                                            </div>
                                            <div className="text-gray-400 text-sm">
                                                Video {focusedVideoIndex + 1} of {pendingVideos.length}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Video Queue */}
                                {isLoadingVideos ? (
                                    <div className="text-center py-16">
                                        <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                                        <p className="text-gray-400">Loading pending videos...</p>
                                    </div>
                                ) : pendingVideos.length === 0 ? (
                                    <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-gray-700">
                                        <div className="text-7xl mb-4">🎬</div>
                                        <h3 className="text-2xl font-bold text-white mb-2">No Videos to Review</h3>
                                        <p className="text-gray-400 max-w-md mx-auto">
                                            When students submit video proofs for challenges, they'll appear here for your review.
                                        </p>
                                        <p className="text-cyan-400 text-sm mt-4">
                                            Verified students get instant XP - only spot-checks need review!
                                        </p>
                                    </div>
                                ) : batchMode ? (
                                    /* BATCH MODE - Thumbnail Grid with focused video */
                                    <div className="space-y-4">
                                        {/* Thumbnail Grid */}
                                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                            {pendingVideos.map((video, index) => (
                                                <button
                                                    key={video.id}
                                                    onClick={() => setFocusedVideoIndex(index)}
                                                    className={`relative aspect-video rounded-lg overflow-hidden transition-all ${
                                                        index === focusedVideoIndex 
                                                            ? 'ring-4 ring-cyan-500 scale-105 z-10' 
                                                            : 'opacity-60 hover:opacity-100'
                                                    } ${video.ai_flag === 'red' ? 'ring-2 ring-red-500' : video.ai_flag === 'yellow' ? 'ring-2 ring-yellow-500' : ''}`}
                                                >
                                                    <video 
                                                        src={video.video_url}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        preload="auto"
                                                        playsInline
                                                    />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1 flex items-center justify-between">
                                                        <span className="text-white text-xs truncate">{video.student_name?.split(' ')[0]}</span>
                                                        {video.video_duration && (
                                                            <span className={`text-xs ${video.video_duration < 3 ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                                {video.video_duration < 60 ? `${Math.round(video.video_duration)}s` : `${Math.floor(video.video_duration / 60)}m`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {video.ai_flag === 'red' && (
                                                        <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 rounded font-bold" title={video.ai_flag_reason}>
                                                            ⚠️
                                                        </div>
                                                    )}
                                                    {video.ai_flag === 'yellow' && (
                                                        <div className="absolute top-1 left-1 bg-yellow-500 text-black text-xs px-1 rounded font-bold" title={video.ai_flag_reason}>
                                                            ⚡
                                                        </div>
                                                    )}
                                                    {video.is_spot_check && (
                                                        <div className="absolute top-1 right-1 bg-cyan-500 text-white text-xs px-1 rounded font-bold">
                                                            🔍
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Focused Video - Large Preview */}
                                        {pendingVideos[focusedVideoIndex] && (
                                            <div className="bg-gray-800 rounded-xl border-2 border-cyan-500 overflow-hidden">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                                                    {/* Video Player */}
                                                    <div className="relative bg-black aspect-video">
                                                        <video 
                                                            key={pendingVideos[focusedVideoIndex].id}
                                                            src={pendingVideos[focusedVideoIndex].video_url}
                                                            className="w-full h-full object-contain"
                                                            controls
                                                            autoPlay
                                                            playsInline
                                                        />
                                                    </div>
                                                    
                                                    {/* Quick Info + Actions */}
                                                    <div className="p-6 flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                                                <h4 className="text-2xl font-bold text-white">{pendingVideos[focusedVideoIndex].student_name}</h4>
                                                                {pendingVideos[focusedVideoIndex].ai_flag === 'red' && (
                                                                    <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full font-bold border border-red-500/50">
                                                                        ⚠️ {pendingVideos[focusedVideoIndex].ai_flag_reason || 'Flagged'}
                                                                    </span>
                                                                )}
                                                                {pendingVideos[focusedVideoIndex].ai_flag === 'yellow' && (
                                                                    <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-full font-bold border border-yellow-500/50">
                                                                        ⚡ {pendingVideos[focusedVideoIndex].ai_flag_reason || 'Review'}
                                                                    </span>
                                                                )}
                                                                {pendingVideos[focusedVideoIndex].is_spot_check && (
                                                                    <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-1 rounded-full font-bold">
                                                                        🔍 Spot Check
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-gray-400 mb-2">{pendingVideos[focusedVideoIndex].student_belt} Belt</p>
                                                            <div className="bg-gray-900/50 rounded-lg p-4">
                                                                <p className="text-white font-medium mb-1">{pendingVideos[focusedVideoIndex].challenge_name || 'Challenge'}</p>
                                                                <div className="flex items-center gap-2 text-sm">
                                                                    <span className="text-gray-500">{pendingVideos[focusedVideoIndex].challenge_category}</span>
                                                                    {pendingVideos[focusedVideoIndex].video_duration && (
                                                                        <>
                                                                            <span className="text-gray-600">•</span>
                                                                            <span className={pendingVideos[focusedVideoIndex].video_duration < 3 ? 'text-yellow-400 font-bold' : 'text-gray-400'}>
                                                                                {pendingVideos[focusedVideoIndex].video_duration < 60 
                                                                                    ? `${Math.round(pendingVideos[focusedVideoIndex].video_duration)}s` 
                                                                                    : `${Math.floor(pendingVideos[focusedVideoIndex].video_duration / 60)}m ${Math.round(pendingVideos[focusedVideoIndex].video_duration % 60)}s`}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="mt-4 flex items-center gap-2">
                                                                <span className="text-gray-400">XP Award:</span>
                                                                <span className="text-green-400 font-bold text-xl">{pendingVideos[focusedVideoIndex].xp_awarded || 40} XP</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Quick Action Buttons */}
                                                        <div className="flex gap-3 mt-6">
                                                            <button
                                                                onClick={() => handleBatchApprove(pendingVideos[focusedVideoIndex])}
                                                                disabled={isProcessingVideo}
                                                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-6 rounded-xl transition-all disabled:opacity-50 text-lg"
                                                            >
                                                                {isProcessingVideo ? '...' : '✅ Approve (Space)'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleBatchReject(pendingVideos[focusedVideoIndex])}
                                                                disabled={isProcessingVideo}
                                                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-6 rounded-xl transition-all disabled:opacity-50 text-lg"
                                                            >
                                                                {isProcessingVideo ? '...' : '❌ Reject (X)'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* NORMAL MODE - Standard video cards */
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <span className="text-orange-400">●</span> Pending Video Submissions
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {pendingVideos.map(video => (
                                                <div key={video.id} className={`bg-gray-800 rounded-xl border overflow-hidden hover:border-orange-500/50 transition-all ${
                                                    video.ai_flag === 'red' ? 'border-red-500' :
                                                    video.ai_flag === 'yellow' ? 'border-yellow-500' :
                                                    video.is_spot_check ? 'border-cyan-500/50' : 'border-gray-700'
                                                }`}>
                                                    {/* AI Flag Badges */}
                                                    {video.ai_flag === 'red' && (
                                                        <div className="bg-red-500/20 text-red-400 text-xs font-bold px-4 py-1 text-center">
                                                            ⚠️ {video.ai_flag_reason || 'Flagged for Review'}
                                                        </div>
                                                    )}
                                                    {video.ai_flag === 'yellow' && (
                                                        <div className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-4 py-1 text-center">
                                                            ⚡ {video.ai_flag_reason || 'Requires Attention'}
                                                        </div>
                                                    )}
                                                    {/* Spot Check Badge - show for green-flagged or no-flag spot checks */}
                                                    {video.is_spot_check && (!video.ai_flag || video.ai_flag === 'green') && (
                                                        <div className="bg-cyan-500/20 text-cyan-400 text-xs font-bold px-4 py-1 text-center">
                                                            🔍 Random Spot Check - Verified Student
                                                        </div>
                                                    )}
                                                    {/* Video Preview */}
                                                    <div className="relative bg-black aspect-video">
                                                        <video 
                                                            src={video.video_url}
                                                            className="w-full h-full object-contain"
                                                            controls
                                                            playsInline
                                                            preload="auto"
                                                        />
                                                    </div>

                                                    {/* Video Info */}
                                                    <div className="p-4">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                <h4 className="font-bold text-white text-lg">{video.student_name}</h4>
                                                                <p className="text-gray-400 text-sm">{video.student_belt} Belt</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="flex items-center gap-1 text-orange-400">
                                                                    <span className="text-xl">{getCategoryEmoji(video.challenge_category)}</span>
                                                                    <span className="font-bold">{video.score || 0}</span>
                                                                </div>
                                                                <p className="text-xs text-gray-500">Claimed Score</p>
                                                            </div>
                                                        </div>

                                                        <div className="bg-gray-900/50 rounded-lg p-3 mb-3">
                                                            <p className="text-sm font-medium text-white mb-1">{video.challenge_name || 'Challenge'}</p>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                                <span className={`px-2 py-0.5 rounded ${
                                                                    video.challenge_category === 'Power' ? 'bg-red-900/50 text-red-400' :
                                                                    video.challenge_category === 'Technique' ? 'bg-blue-900/50 text-blue-400' :
                                                                    'bg-purple-900/50 text-purple-400'
                                                                }`}>
                                                                    {video.challenge_category || 'General'}
                                                                </span>
                                                                <span>•</span>
                                                                <span>{new Date(video.created_at).toLocaleDateString()}</span>
                                                                {video.video_duration && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className={video.video_duration < 3 ? 'text-yellow-400' : ''}>
                                                                            {video.video_duration < 60 
                                                                                ? `${Math.round(video.video_duration)}s` 
                                                                                : `${Math.floor(video.video_duration / 60)}m ${Math.round(video.video_duration % 60)}s`}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Review Actions */}
                                                        {reviewingVideo?.id === video.id ? (
                                                            <div className="space-y-3">
                                                                <div className="relative">
                                                                    <textarea 
                                                                        value={coachVideoNotes}
                                                                        onChange={(e) => setCoachVideoNotes(e.target.value)}
                                                                        placeholder="Add feedback for the student (optional)..."
                                                                        className="w-full bg-gray-700 text-white p-3 pr-24 rounded-lg border border-gray-600 text-sm resize-none focus:ring-orange-500 focus:border-orange-500"
                                                                        rows={2}
                                                                    />
                                                                    <button
                                                                        onClick={() => handleGenerateVideoFeedback(video)}
                                                                        disabled={isGeneratingVideoFeedback}
                                                                        className="absolute right-2 top-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold py-1.5 px-3 rounded-md transition-all disabled:opacity-50 flex items-center gap-1"
                                                                        title="Generate AI feedback"
                                                                    >
                                                                        {isGeneratingVideoFeedback ? (
                                                                            <>
                                                                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                                AI...
                                                                            </>
                                                                        ) : (
                                                                            <>✨ AI</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <div className="flex items-center gap-3 bg-gray-700/50 p-2 rounded-lg">
                                                                    <span className="text-sm text-gray-400">XP Award:</span>
                                                                    <span className="text-green-400 font-bold text-lg">{video.xp_awarded || 40} XP</span>
                                                                    <span className="text-gray-500 text-xs">(fixed)</span>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        onClick={() => handleApproveVideo(video)}
                                                                        disabled={isProcessingVideo}
                                                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isProcessingVideo ? '...' : '✅ Approve'}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleRejectVideo(video)}
                                                                        disabled={isProcessingVideo}
                                                                        className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isProcessingVideo ? '...' : '❌ Reject'}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => {
                                                                            setReviewingVideo(null);
                                                                            setCoachVideoNotes('');
                                                                            setXpToAward(50);
                                                                        }}
                                                                        className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={() => {
                                                                    setReviewingVideo(video);
                                                                    setCurrentVideoPlaying(video.id);
                                                                    setCoachVideoNotes('');
                                                                    setXpToAward(50);
                                                                }}
                                                                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                                                            >
                                                                Review Video
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* LEADERBOARD VIEW */}
                    {activeView === 'leaderboard' && (
                        <CoachLeaderboard students={students} data={data} clubId={clubId} />
                    )}

                    {/* WORLD RANKINGS VIEW */}
                    {activeView === 'world-rankings' && (
                        <WorldRankings clubId={clubId} />
                    )}

                    {/* Footer Actions (Only for Grading View) */}
                    {activeView === 'grading' && (
                        <div className="p-4 bg-gray-800 rounded-b-lg border-t border-gray-700 flex flex-wrap gap-4 justify-end">
                            <button onClick={handleGenerateAllFeedback} disabled={isGenerating} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 text-sm rounded-md flex items-center disabled:opacity-50">
                                {isGenerating ? <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : '✨ Generate Feedback'}
                            </button>
                            {Object.keys(parentMessages).length > 0 && <button onClick={() => setFeedbackPreviewOpen(true)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 text-sm rounded-md">🧾 Preview Messages</button>}
                            <button onClick={handleSaveAndNotify} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-6 text-sm rounded-md">Save & Notify Parents</button>
                        </div>
                    )}
                </div>

                {/* SIDEBAR AREA (Keep visible) */}
                <div className="lg:col-span-1">
                    <InsightSidebar students={filteredStudents} belts={data.belts} clubId={clubId} />
                </div>
            </div>
            
            {isNoteModalOpen && currentStudent && <NoteEditorModal student={currentStudent} initialNote={notes[currentStudent.id] || ''} onSave={handleSaveNote} onClose={() => setNoteModalOpen(false)} />}
            {isFeedbackPreviewOpen && <FeedbackPreviewModal messages={parentMessages} students={students} onClose={() => setFeedbackPreviewOpen(false)} />}
            {viewingStudent && <StudentProfile student={viewingStudent} data={data} onUpdateStudent={handleStudentUpdate} onClose={() => setViewingStudent(null)} />}
            {isAddEventOpen && <AddEventModal onClose={() => setIsAddEventOpen(false)} onAdd={handleAddEvent} />}
            {certificateData.show && certificateData.student && (
                <CertificateModal 
                    student={certificateData.student} 
                    newBelt={certificateData.newBelt} 
                    data={data}
                    onClose={() => setCertificateData({ show: false, student: null, newBelt: '' })} 
                />
            )}
            {viewingNotesHistory && <NotesHistoryModal student={viewingNotesHistory} onClose={() => setViewingNotesHistory(null)} />}
            {showChallengeBuilder && (
                <ChallengeBuilder
                    coachId={coachName}
                    coachName={coachName}
                    existingChallenges={data.customChallenges || []}
                    belts={data.belts || []}
                    onSaveChallenge={handleSaveChallenge}
                    onDeleteChallenge={handleDeleteChallenge}
                    onToggleChallenge={handleToggleChallenge}
                    onClose={() => setShowChallengeBuilder(false)}
                />
            )}
        </div>
    );
};
