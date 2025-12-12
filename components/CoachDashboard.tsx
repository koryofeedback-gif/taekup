
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { WizardData, Student, PerformanceRecord, FeedbackRecord, CalendarEvent, CustomChallenge } from '../types';
import { generateParentFeedback, generatePromotionMessage, generateLessonPlan } from '../services/geminiService';
import { generateLessonPlanGPT } from '../services/openaiService';
import { StudentProfile } from './StudentProfile';
import { ChallengeBuilder } from './ChallengeBuilder';

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

const InsightSidebar: React.FC<{ students: Student[], belts: any[] }> = ({ students, belts }) => {
    // 1. Leaderboard Logic
    const topStudents = [...students]
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 3);

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

            {/* Leaderboard Widget */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <h3 className="font-bold text-white flex items-center mb-3">
                    <span className="text-xl mr-2">🏆</span> Top Students
                </h3>
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
                                <span className="text-sm font-bold text-sky-300">{s.totalPoints} pts</span>
                            </div>
                        )
                    })}
                    {topStudents.length === 0 && <p className="text-sm text-gray-500 italic">No students yet.</p>}
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

const SenseiVoiceHUD: React.FC<{ transcript: string, isActive: boolean, lastCommand: string | null }> = ({ transcript, isActive, lastCommand }) => {
    if (!isActive) return null;
    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center pointer-events-none">
            <div className="bg-gray-900/90 p-8 rounded-3xl border-2 border-cyan-500 shadow-[0_0_50px_rgba(6,182,212,0.5)] text-center max-w-lg w-full relative overflow-hidden">
                {/* Animated Wave */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-cyan-500 animate-pulse"></div>
                
                <div className="text-6xl mb-6 animate-bounce text-cyan-400">🎙️</div>
                <h3 className="text-2xl font-bold text-white mb-4 font-mono tracking-widest">SENSEI VOICE ACTIVE</h3>
                
                {/* Live Transcript */}
                <div className="bg-black/50 p-4 rounded-xl min-h-[80px] flex items-center justify-center mb-4 border border-gray-700">
                    <p className="text-xl text-cyan-300 font-mono">
                        {transcript || "Listening..."}
                        <span className="animate-pulse">_</span>
                    </p>
                </div>

                <div className="flex justify-between text-xs text-gray-500 uppercase font-mono">
                    <span>Command Mode</span>
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

export const CoachDashboard: React.FC<CoachDashboardProps> = ({ data, coachName, onUpdateStudents, onUpdateData, onBack, userType, onGoToAdmin }) => {
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
    const [activeView, setActiveView] = useState<'grading' | 'schedule' | 'sparring' | 'planner' | 'challenges'>('grading');
    const [isAddEventOpen, setIsAddEventOpen] = useState(false);
    const [showChallengeBuilder, setShowChallengeBuilder] = useState(false);

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
        setBonusPoints(prev => ({...prev, [studentId]: Math.max(0, points)}));
    };

    const handleHomeworkChange = (studentId: string, points: number) => {
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
            const studentBonus = bonusPoints[student.id] || 0;
            const studentHomework = homeworkPoints[student.id] || 0;
            const sessionTotalFromScores = Object.values(studentScores).reduce((sum: number, score) => sum + (Number(score) || 0), 0);
            const sessionTotal = sessionTotalFromScores + studentBonus + studentHomework;
            
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
            };

            const newFeedbackRecord: FeedbackRecord | null = parentMessages[student.id] ? {
                date: new Date().toISOString(),
                text: parentMessages[student.id],
                coachName: data.ownerName,
                isAIGenerated: true,
            } : null;

            return { 
                ...student, 
                totalPoints: totalPointsAfter,
                attendanceCount: (student.attendanceCount || 0) + 1,
                performanceHistory: [...(student.performanceHistory || []), newPerformanceRecord],
                feedbackHistory: newFeedbackRecord ? [...(student.feedbackHistory || []), newFeedbackRecord] : (student.feedbackHistory || []),
            };
        });

        onUpdateStudents(updatedStudents);
        setStudents(updatedStudents);
        resetDashboard();

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
        const studentBonus = bonusPoints[student.id] || 0;
        const studentHomework = homeworkPoints[student.id] || 0;
        const sessionTotalFromScores = attendance[student.id] ? Object.values(studentScores).reduce((sum: number, score) => sum + (Number(score) || 0), 0) : 0;
        const sessionTotal = sessionTotalFromScores + studentBonus + studentHomework;
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

    return (
        <div className="container mx-auto px-4 py-8">
             {confirmation.show && (
                <div className="fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg z-[60] animate-pulse">
                    ✅ {confirmation.message}
                </div>
            )}
            
            <SenseiVoiceHUD transcript={voiceTranscript} isActive={isVoiceActive} lastCommand={lastVoiceCommand} />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* MAIN TABLE AREA */}
                <div className="lg:col-span-3 bg-gray-800/50 rounded-lg border border-gray-700 shadow-2xl">
                    {/* Header */}
                    <div className="p-4 bg-gray-800 rounded-t-lg border-b border-gray-700 space-y-4">
                        <div className="flex flex-wrap justify-between items-center">
                            <div>
                                <h1 className="text-xl font-bold text-white">
                                    {activeView === 'grading' ? `🗓️ Today's Class` : activeView === 'schedule' ? `📅 My Schedule` : activeView === 'planner' ? '🧠 Class Planner' : activeView === 'challenges' ? '🏆 Challenge Builder' : `🥊 Sparring Tracker`}
                                </h1>
                                <p className="text-sm text-gray-400">👤 Coach {coachName} | 🏫 {data.clubName}</p>
                            </div>
                            <div className="flex space-x-2">
                                {/* SENSEI VOICE BUTTON */}
                                <button 
                                    onClick={toggleVoiceMode}
                                    className={`px-4 py-2 rounded-full text-sm font-bold transition-all shadow-lg border ${isVoiceActive ? 'bg-cyan-500 text-black border-cyan-400 animate-pulse' : 'bg-gray-900 text-cyan-400 border-cyan-500/50 hover:bg-gray-800'}`}
                                    title="Hands-Free Grading"
                                >
                                    {isVoiceActive ? '🎙️ LISTENING...' : '🎙️ Sensei Voice'}
                                </button>

                                <button 
                                    onClick={() => setActiveView('grading')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeView === 'grading' ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    📋 Grading
                                </button>
                                <button 
                                    onClick={() => setActiveView('planner')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeView === 'planner' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    🧠 Plan
                                </button>
                                <button 
                                    onClick={() => setActiveView('sparring')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeView === 'sparring' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    🥊 Sparring
                                </button>
                                <button 
                                    onClick={() => setActiveView('schedule')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeView === 'schedule' ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    📅 Schedule
                                </button>
                                <button 
                                    onClick={() => setActiveView('challenges')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeView === 'challenges' ? 'bg-cyan-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >
                                    🏆 Challenges
                                </button>
                                {userType === 'owner' && onGoToAdmin && (
                                    <button onClick={onGoToAdmin} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-3 text-sm rounded-md transition-colors">⬅️ Admin</button>
                                )}
                                <button onClick={onBack} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 text-sm rounded-md transition-colors">🚪 Logout</button>
                            </div>
                        </div>
                        
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
                                        {data.homeworkBonus && <th className="px-2 py-3 text-center text-sky-300">Homework</th>}
                                        {data.coachBonus && <th className="px-2 py-3 text-center text-purple-400">Bonus</th>}
                                        <th className="px-2 py-3 text-center">Total</th>
                                        <th className="px-4 py-3 min-w-[200px]">Stripe Bar</th>
                                        {data.gradingRequirementEnabled && (
                                            <th className="px-2 py-3 text-center text-yellow-400">{data.gradingRequirementName || 'Req.'}</th>
                                        )}
                                        <th className="px-2 py-3 text-center">Note</th>
                                        <th className="px-2 py-3 text-center">View</th>
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
                                            {data.homeworkBonus && <td className="px-2 py-2"><input type="number" min="0" placeholder="0" value={homeworkPoints[student.id] || ''} onChange={e => handleHomeworkChange(student.id, parseInt(e.target.value) || 0)} className="w-16 bg-gray-700 text-blue-300 font-bold p-1 rounded-md border border-gray-600 text-center focus:ring-sky-500"/></td>}
                                            {data.coachBonus && <td className="px-2 py-2"><input type="number" min="0" placeholder="0" value={bonusPoints[student.id] || ''} onChange={e => handleBonusChange(student.id, parseInt(e.target.value) || 0)} className="w-16 bg-gray-700 text-purple-300 font-bold p-1 rounded-md border border-gray-600 text-center focus:ring-purple-500"/></td>}
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
                                            
                                            {data.gradingRequirementEnabled && (
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

                                            <td className="px-2 py-2 text-center text-lg"><button onClick={() => handleOpenNoteModal(student)} className="hover:scale-125 transition-transform">{notes[student.id] ? '✍️' : '🎤'}</button></td>
                                            <td className="px-2 py-2 text-center"><button onClick={() => setViewingStudent(student)} className="text-xl hover:text-sky-300 transition-colors">👁️</button></td>
                                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={!!attendance[student.id]} onChange={() => setAttendance(p => ({...p, [student.id]: !p[student.id]}))} className="w-5 h-5 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"/></td>
                                        </tr>
                                    )}))}
                                </tbody>
                            </table>
                        </div>
                    ) : activeView === 'planner' ? (
                        <LessonPlanner data={data} />
                    ) : activeView === 'sparring' ? (
                        // SPARRING VIEW
                        <div className="p-6 min-h-[500px] bg-gray-900 flex flex-col">
                            {/* Match Setup */}
                            <div className="flex justify-center items-center space-x-8 mb-8">
                                <div className="w-1/3 bg-red-900/20 p-4 rounded-lg border border-red-600/50">
                                    <label className="block text-red-400 font-bold mb-2 text-center">RED FIGHTER</label>
                                    <select value={fighter1} onChange={e => setFighter1(e.target.value)} className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2">
                                        <option value="">Select Fighter</option>
                                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="text-2xl font-black text-white italic">VS</div>
                                <div className="w-1/3 bg-blue-900/20 p-4 rounded-lg border border-blue-600/50">
                                    <label className="block text-sky-300 font-bold mb-2 text-center">BLUE FIGHTER</label>
                                    <select value={fighter2} onChange={e => setFighter2(e.target.value)} className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2">
                                        <option value="">Select Fighter</option>
                                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Controls */}
                            {fighter1 && fighter2 ? (
                                <div className="grid grid-cols-2 gap-12 flex-1">
                                    {/* Red Controls */}
                                    <div className="space-y-4">
                                        <button onClick={() => updateSparringStats(1, 'head')} className="w-full h-20 bg-red-600 hover:bg-red-500 text-white font-black text-2xl rounded-xl shadow-lg active:scale-95 transition-transform">HEAD KICK ({sparringSession.f1Stats.head})</button>
                                        <button onClick={() => updateSparringStats(1, 'body')} className="w-full h-16 bg-red-700 hover:bg-red-600 text-white font-bold text-xl rounded-xl shadow-lg active:scale-95 transition-transform">BODY KICK ({sparringSession.f1Stats.body})</button>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={() => updateSparringStats(1, 'punch')} className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl">PUNCH ({sparringSession.f1Stats.punches})</button>
                                            <button onClick={() => updateSparringStats(1, 'takedown')} className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl">TAKEDOWN ({sparringSession.f1Stats.takedowns})</button>
                                        </div>
                                    </div>
                                    {/* Blue Controls */}
                                    <div className="space-y-4">
                                        <button onClick={() => updateSparringStats(2, 'head')} className="w-full h-20 bg-sky-500 hover:bg-sky-400 text-white font-black text-2xl rounded-xl shadow-lg active:scale-95 transition-transform">HEAD KICK ({sparringSession.f2Stats.head})</button>
                                        <button onClick={() => updateSparringStats(2, 'body')} className="w-full h-16 bg-blue-700 hover:bg-sky-500 text-white font-bold text-xl rounded-xl shadow-lg active:scale-95 transition-transform">BODY KICK ({sparringSession.f2Stats.body})</button>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={() => updateSparringStats(2, 'punch')} className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl">PUNCH ({sparringSession.f2Stats.punches})</button>
                                            <button onClick={() => updateSparringStats(2, 'takedown')} className="h-16 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl">TAKEDOWN ({sparringSession.f2Stats.takedowns})</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-48 text-gray-500 italic">Select two fighters to start recording stats.</div>
                            )}

                            <div className="mt-8 flex justify-center">
                                <button onClick={finishSparringMatch} disabled={!fighter1 || !fighter2} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white font-bold py-4 px-12 rounded-full text-xl shadow-2xl hover:scale-105 transition-all">
                                    💾 SAVE MATCH
                                </button>
                            </div>
                        </div>
                    ) : (
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
                    )}

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
                    <InsightSidebar students={filteredStudents} belts={data.belts} />
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
            {showChallengeBuilder && (
                <ChallengeBuilder
                    coachId={coachName}
                    coachName={coachName}
                    existingChallenges={data.customChallenges || []}
                    onSaveChallenge={handleSaveChallenge}
                    onDeleteChallenge={handleDeleteChallenge}
                    onToggleChallenge={handleToggleChallenge}
                    onClose={() => setShowChallengeBuilder(false)}
                />
            )}
        </div>
    );
};
