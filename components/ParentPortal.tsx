import React, { useState, useMemo, useEffect } from 'react';
import type { Student, WizardData, PerformanceRecord, Belt, Habit } from '../types';
import { BeltIcon, CalendarIcon } from './icons/FeatureIcons';
import { generateParentingAdvice } from '../services/geminiService';
import { LANGUAGES } from '../constants';

interface ParentPortalProps {
    student: Student;
    data: WizardData;
    onBack: () => void;
}

// Helper to get belt info
const getBelt = (beltId: string, belts: Belt[]) => belts.find(b => b.id === beltId);

export const ParentPortal: React.FC<ParentPortalProps> = ({ student, data, onBack }) => {
    const [activeTab, setActiveTab] = useState<'home' | 'journey' | 'insights' | 'practice' | 'booking' | 'card' | 'home-dojo' | 'rivals'>('home');
    const [isPremium, setIsPremium] = useState(false); // Toggle to simulate upgrade
    const [missionChecks, setMissionChecks] = useState<Record<string, boolean>>({});
    const [parentingAdvice, setParentingAdvice] = useState<string | null>(null);
    const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
    const [language, setLanguage] = useState(data.language || 'English');
    const [bookedSlots, setBookedSlots] = useState<Record<string, boolean>>({}); // Simulating bookings
    
    // Rivals State
    const [selectedRival, setSelectedRival] = useState<string>('');
    const [challengeResult, setChallengeResult] = useState<'pending' | 'win' | 'loss' | null>(null);
    const [isSimulatingChallenge, setIsSimulatingChallenge] = useState(false);

    // Home Dojo State
    const [homeDojoChecks, setHomeDojoChecks] = useState<Record<string, boolean>>({});
    const [isEditingHabits, setIsEditingHabits] = useState(false);
    // Local state for habit customization before saving (simulated)
    const [customHabitList, setCustomHabitList] = useState<Habit[]>(student.customHabits || []);

    // Time Machine State
    const [simulatedAttendance, setSimulatedAttendance] = useState(2); // Default 2x week

    // Check if premium is unlocked via Club Sponsorship or User Upgrade
    const hasPremiumAccess = isPremium || data.clubSponsoredPremium;

    const currentBelt = getBelt(student.beltId, data.belts);
    
    // Calculate Streak (Mock logic)
    const streak = 3; 

    // Calculate Progress
    let pointsPerStripe = data.pointsPerStripe;
    if (data.useCustomPointsPerBelt && data.pointsPerBelt[student.beltId]) {
        pointsPerStripe = data.pointsPerBelt[student.beltId];
    }
    const totalStripes = Math.floor(student.totalPoints / pointsPerStripe);
    const currentBeltStripes = Math.min(totalStripes, data.stripesPerBelt);
    const progressPercent = (currentBeltStripes / data.stripesPerBelt) * 100;

    // Filter Curriculum for this student
    const studentVideos = (data.curriculum || []).filter(v => v.beltId === student.beltId);

    const toggleMission = (id: string) => {
        setMissionChecks(prev => ({ ...prev, [id]: !prev[id] }));
    }
    
    const handleBookSlot = (id: string) => {
        setBookedSlots(prev => ({...prev, [id]: true}));
        alert("Slot booked! You will receive a confirmation email shortly.");
    }

    const handleGenerateAdvice = async () => {
        setIsGeneratingAdvice(true);
        // Construct a summary from recent history
        const recentStats = student.performanceHistory?.slice(-3) || [];
        let summary = "General improvement";
        if (recentStats.length > 0) {
             const latest = recentStats[recentStats.length - 1];
             // Simple heuristic: find lowest score
             let lowestSkill = '';
             let lowestVal = 2;
             Object.entries(latest.scores).forEach(([skillId, score]) => {
                 const skillName = data.skills.find(s => s.id === skillId)?.name || skillId;
                 if (typeof score === 'number' && score < lowestVal) {
                     lowestVal = score;
                     lowestSkill = skillName;
                 }
             });
             if (lowestSkill) summary = `Struggling slightly with ${lowestSkill}`;
        }
        
        const advice = await generateParentingAdvice(student.name, summary, language);
        setParentingAdvice(advice);
        setIsGeneratingAdvice(false);
    }

    const handleSendChallenge = () => {
        if (!selectedRival) return;
        setIsSimulatingChallenge(true);
        setChallengeResult('pending');
        
        // Simulate response time
        setTimeout(() => {
            const win = Math.random() > 0.4; // 60% chance to win for fun
            setChallengeResult(win ? 'win' : 'loss');
            setIsSimulatingChallenge(false);
        }, 3000);
    }

    // Home Dojo Helpers
    const toggleHabitCheck = (habitId: string) => {
        setHomeDojoChecks(prev => {
            const newState = { ...prev, [habitId]: !prev[habitId] };
            return newState;
        });
    }

    const PRESET_HABITS: Habit[] = [
        { id: 'p1', question: 'Did they finish homework on time?', category: 'School', icon: '📚', isActive: false },
        { id: 'p2', question: 'Did they limit screentime?', category: 'Health', icon: '📵', isActive: false },
        { id: 'p3', question: 'Did they eat vegetables?', category: 'Health', icon: '🥦', isActive: false },
        { id: 'p4', question: 'Did they help with chores?', category: 'Chores', icon: '🧹', isActive: false },
        { id: 'p5', question: 'Did they practice kindness?', category: 'Character', icon: '❤️', isActive: false },
        { id: 'p6', question: 'Did they get ready for school alone?', category: 'School', icon: '🎒', isActive: false },
    ];

    const handleToggleCustomHabit = (preset: Habit) => {
        setCustomHabitList(prev => {
            const exists = prev.find(h => h.question === preset.question);
            if (exists) {
                return prev.filter(h => h.question !== preset.question);
            } else {
                return [...prev, { ...preset, id: `custom-${Date.now()}` }];
            }
        });
    }

    // --- HIGH PRECISION BLACK BELT PREDICTION ENGINE (CUMULATIVE) ---
    const blackBeltPrediction = useMemo(() => {
        
        // 1. Identify Target Belt (Always the FINAL belt in the system)
        const targetIndex = data.belts.length - 1;
        const targetBeltName = data.belts[targetIndex]?.name || 'Black Belt';
        const currentBeltIndex = data.belts.findIndex(b => b.id === student.beltId);

        // 2. Exact Cumulative Distance Calculation
        // Calculate "Banked Points" from previous belts to show lifetime progress.
        let totalLifetimePointsNeeded = 0;
        let pointsFromPreviousBelts = 0;

        for (let i = 0; i < targetIndex; i++) {
            const beltId = data.belts[i].id;
            let pps = data.pointsPerStripe;
            // Respect advanced per-belt settings
            if (data.useCustomPointsPerBelt && data.pointsPerBelt[beltId]) {
                pps = data.pointsPerBelt[beltId];
            }
            const beltTotal = data.stripesPerBelt * pps;
            
            totalLifetimePointsNeeded += beltTotal;

            if (i < currentBeltIndex) {
                pointsFromPreviousBelts += beltTotal;
            }
        }

        // Current "Lifetime" Position: Banked points + Current belt points
        // Note: student.totalPoints resets on promotion, so we add it to the banked total.
        const currentLifetimePoints = pointsFromPreviousBelts + student.totalPoints;
        const pointsRemaining = Math.max(0, totalLifetimePointsNeeded - currentLifetimePoints);

        // 3. Velocity Calculation (Points per Class)
        const calculatePointsPerClass = () => {
            // Base points from active skills (e.g. 4 skills * 2 pts = 8 max)
            const activeSkillCount = Math.max(1, data.skills.filter(s => s.isActive).length);
            const maxSkillPoints = activeSkillCount * 2;
            
            // Average realistic performance (assuming mostly Greens/Yellows) - 85% efficiency
            const realisticSkillPoints = maxSkillPoints * 0.85; 
            
            // Add avg bonuses (homework, coach bonus) - estimated conservatively
            const avgBonus = (data.homeworkBonus ? 1 : 0) + (data.coachBonus ? 0.5 : 0);
            
            return realisticSkillPoints + avgBonus;
        };

        const velocityPerClass = calculatePointsPerClass();
        
        const calculateDate = (attendancePerWeek: number) => {
            if (pointsRemaining <= 0) return new Date(); // Already there
            
            const pointsPerWeek = attendancePerWeek * velocityPerClass;
            // Avoid divide by zero
            if (pointsPerWeek <= 0) return new Date(new Date().setFullYear(new Date().getFullYear() + 10));

            const weeksNeeded = pointsRemaining / pointsPerWeek;
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + (weeksNeeded * 7));
            return targetDate;
        }

        const estimatedDate = calculateDate(simulatedAttendance);
        const baselineDate = calculateDate(Math.max(1, simulatedAttendance - 1)); // Compare to doing less
        
        // Calculate time saved vs baseline
        const msDiff = Math.abs(baselineDate.getTime() - estimatedDate.getTime());
        const yearsSaved = (msDiff / (1000 * 60 * 60 * 24 * 365)).toFixed(1);

        // Calculate precise percentage based on LIFETIME points
        const percentComplete = totalLifetimePointsNeeded > 0 
            ? (currentLifetimePoints / totalLifetimePointsNeeded) * 100 
            : 100;

        return {
            totalPointsNeeded: totalLifetimePointsNeeded,
            pointsRemaining,
            estimatedDate,
            yearsSaved,
            targetBeltName,
            percentComplete: Math.min(100, Math.max(0, percentComplete))
        };
    }, [data, student.totalPoints, student.beltId, simulatedAttendance]);

    // Initialize simulated attendance based on student's actual history (Personalized Velocity)
    useEffect(() => {
        if (student.joinDate && student.attendanceCount) {
            const join = new Date(student.joinDate);
            const now = new Date();
            const weeks = Math.max(1, (now.getTime() - join.getTime()) / (1000 * 60 * 60 * 24 * 7));
            const avg = Math.round(student.attendanceCount / weeks);
            // Clamp between 1 and 6, default to 2 if 0
            setSimulatedAttendance(Math.max(1, Math.min(6, avg || 2)));
        }
    }, [student.joinDate, student.attendanceCount]);


    const generateGoogleCalendarUrl = (event: { title: string, date: string, time: string, description: string, location: string }) => {
        const start = new Date(`${event.date}T${event.time}`).toISOString().replace(/-|:|\.\d\d\d/g, '');
        // Assume 2 hour duration
        const end = new Date(new Date(`${event.date}T${event.time}`).getTime() + 2*60*60*1000).toISOString().replace(/-|:|\.\d\d\d/g, '');
        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${start}/${end}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}`;
    }

    const renderPremiumLock = (featureName: string, description: string) => {
        if (hasPremiumAccess) return null;
        return (
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md z-20 flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-orange-500/50 animate-pulse">
                    <span className="text-3xl">👑</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Unlock {featureName}</h3>
                <p className="text-gray-300 mb-6 text-sm leading-relaxed">
                    {description}
                </p>
                <ul className="text-left text-sm text-gray-400 mb-6 space-y-2">
                    <li>✅ Full HD Video Curriculum</li>
                    <li>✅ Character Growth Analytics</li>
                    <li>✅ Digital Trophy Case</li>
                    <li>✅ AI Parenting Coach</li>
                </ul>
                <button 
                    onClick={() => setIsPremium(true)}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 px-8 rounded-full shadow-lg transform transition-all active:scale-95"
                >
                    Start 7-Day Free Trial
                </button>
                <p className="mt-3 text-xs text-gray-500">Then just $4.99/month. Cancel anytime.</p>
                <button onClick={() => setIsPremium(true)} className="mt-8 text-xs text-gray-600 underline">
                    (Simulate Payment Success)
                </button>
            </div>
        );
    };

    const renderHome = () => (
        <div className="space-y-6 pb-20">
            {/* Language Selector */}
            <div className="flex justify-between items-center">
                {data.clubSponsoredPremium && (
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg flex items-center">
                        💎 Premium Unlocked by {data.clubName}
                    </div>
                )}
                <div className="flex-1 flex justify-end">
                    <select 
                        value={language} 
                        onChange={e => setLanguage(e.target.value)}
                        className="bg-gray-800 text-xs text-gray-400 border border-gray-700 rounded px-2 py-1 focus:outline-none"
                    >
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                </div>
            </div>

            {/* Hero Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 shadow-xl border border-gray-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-400/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                
                <div className="flex items-center space-x-4 relative z-10">
                    <div className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden bg-gray-700 shadow-md">
                        {student.photo ? (
                            <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🥋</div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Hi, {student.name.split(' ')[0]}!</h2>
                        <div className="flex items-center text-sm text-gray-400 mt-1">
                            <div className="w-3 h-3 rounded-full mr-2 shadow-sm" style={{ background: currentBelt?.color1 || '#fff' }}></div>
                            {currentBelt?.name}
                        </div>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Attendance</p>
                        <p className="text-2xl font-bold text-white mt-1">{student.attendanceCount} <span className="text-xs font-normal text-gray-500">classes</span></p>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Current Streak</p>
                        <p className="text-2xl font-bold text-green-400 mt-1">🔥 {streak} <span className="text-xs font-normal text-gray-500">days</span></p>
                    </div>
                </div>

                {/* Next Belt Progress */}
                <div className="mt-6">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                        <span>Progress to Next Belt</span>
                        <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between mt-2">
                        {Array.from({ length: data.stripesPerBelt }).map((_, i) => (
                            <div key={i} className={`h-1.5 flex-1 rounded-full mx-0.5 ${i < currentBeltStripes ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 'bg-gray-700'}`}></div>
                        ))}
                    </div>
                </div>
            </div>
            
            {/* Athlete Card Teaser */}
            <div 
                onClick={() => setActiveTab('card')}
                className="bg-gradient-to-r from-blue-900 to-black border border-blue-700/50 p-4 rounded-xl flex items-center justify-between cursor-pointer group shadow-lg"
            >
                <div className="flex items-center">
                    <div className="text-2xl mr-3">🏅</div>
                    <div>
                        <h4 className="font-black text-white text-sm italic uppercase">My Athlete Card</h4>
                        <p className="text-[10px] text-gray-400">View your stats & rating</p>
                    </div>
                </div>
                <div className="text-sky-400 group-hover:text-white transition-colors font-bold">VIEW &gt;</div>
            </div>

            {/* Home Dojo Teaser */}
            <div 
                onClick={() => setActiveTab('home-dojo')}
                className="bg-gradient-to-r from-green-900 to-black border border-green-700/50 p-4 rounded-xl flex items-center justify-between cursor-pointer group shadow-lg"
            >
                <div className="flex items-center">
                    <div className="text-2xl mr-3">🏠</div>
                    <div>
                        <h4 className="font-black text-white text-sm italic uppercase">Home Dojo</h4>
                        <p className="text-[10px] text-gray-400">Track daily habits</p>
                    </div>
                </div>
                <div className="text-green-500 group-hover:text-white transition-colors font-bold">VIEW &gt;</div>
            </div>

            {/* Premium Teaser on Home - Only show if NOT premium */}
            {!hasPremiumAccess && (
                <div 
                    onClick={() => setActiveTab('practice')}
                    className="bg-gradient-to-r from-gray-800 to-gray-800 border border-gray-700 p-4 rounded-xl flex items-center justify-between cursor-pointer group hover:border-yellow-500/50 transition-colors"
                >
                    <div className="flex items-center">
                        <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center text-xl mr-3">
                            📹
                        </div>
                        <div>
                            <h4 className="font-bold text-white text-sm">Practice at Home</h4>
                            <p className="text-xs text-gray-400">Unlock {currentBelt?.name} training</p>
                        </div>
                    </div>
                    <div className="text-gray-500 group-hover:text-yellow-400 transition-colors">→</div>
                </div>
            )}

            {/* Recent Feedback */}
            <div className="space-y-4">
                <h3 className="font-bold text-gray-200 px-2 text-sm uppercase tracking-wider">Coach Feedback</h3>
                {student.feedbackHistory && student.feedbackHistory.length > 0 ? (
                    student.feedbackHistory.slice().reverse().slice(0, 3).map((fb, idx) => (
                        <div key={idx} className="bg-gray-800 p-4 rounded-xl border-l-4 border-sky-500 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10 text-4xl">💬</div>
                            <p className="text-gray-300 text-sm italic mb-2 relative z-10">"{fb.text}"</p>
                            <div className="flex justify-between items-center text-xs text-gray-500 relative z-10">
                                <span>{new Date(fb.date).toLocaleDateString()}</span>
                                <span className="flex items-center font-medium text-sky-300">
                                    {fb.isAIGenerated ? '✨ Coach AI' : `👤 ${fb.coachName}`}
                                </span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-gray-500 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
                        No feedback yet. Keep training hard!
                    </div>
                )}
            </div>
        </div>
    );

    const renderInsights = () => (
        <div className="relative h-full min-h-[500px]">
            {!hasPremiumAccess && renderPremiumLock("Growth Analytics", "Visualize your child's character development. See trends in Focus, Discipline, and Effort over time.")}
            
            <div className={`space-y-6 pb-20 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none overflow-hidden h-[500px]' : ''}`}>
                
                 {/* AI Parenting Coach */}
                 <div className="bg-gradient-to-r from-indigo-900/50 to-blue-900/50 p-6 rounded-2xl border border-indigo-500/30 shadow-lg">
                    <h3 className="font-bold text-white mb-2 flex items-center">
                        <span className="mr-2 text-xl">🧠</span> AI Parenting Coach
                    </h3>
                    <p className="text-xs text-indigo-200 mb-4">Get personalized advice on how to support {student.name} based on recent class performance.</p>
                    
                    {parentingAdvice ? (
                        <div className="bg-indigo-950/50 p-4 rounded-xl border border-indigo-500/30">
                            <p className="text-sm text-indigo-100 italic">"{parentingAdvice}"</p>
                            <button onClick={() => setParentingAdvice(null)} className="text-xs text-indigo-400 mt-2 hover:text-white">Generate New Tip</button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleGenerateAdvice} 
                            disabled={isGeneratingAdvice}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex justify-center items-center"
                        >
                            {isGeneratingAdvice ? (
                                <span className="animate-pulse">Analyzing progress...</span>
                            ) : (
                                "✨ Generate Advice"
                            )}
                        </button>
                    )}
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h3 className="font-bold text-white mb-4 flex items-center">
                        <span className="mr-2">📈</span> Character Development
                    </h3>
                    {/* Simulated Graph Visuals */}
                    <div className="space-y-6">
                        {data.skills.filter(s => s.isActive).slice(0, 3).map(skill => (
                            <div key={skill.id}>
                                <div className="flex justify-between text-xs text-gray-400 mb-1 font-bold uppercase">
                                    <span>{skill.name}</span>
                                    <span className="text-green-400">⬆️ +12% this month</span>
                                </div>
                                <div className="h-20 flex items-end space-x-2">
                                    {[40, 50, 45, 60, 55, 75, 70, 85].map((h, i) => (
                                        <div key={i} className="flex-1 bg-gray-700 rounded-t overflow-hidden relative group">
                                            <div className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-500" style={{ height: `${h}%` }}></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h3 className="font-bold text-white mb-4 flex items-center">
                        <span className="mr-2">📅</span> Consistency Heatmap
                    </h3>
                    <div className="grid grid-cols-7 gap-2">
                        {Array.from({length: 28}).map((_, i) => (
                            <div key={i} className={`aspect-square rounded-sm ${Math.random() > 0.6 ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]' : 'bg-gray-700/50'}`}></div>
                        ))}
                    </div>
                    <p className="text-xs text-center text-gray-500 mt-3">Consistent training builds strong habits.</p>
                </div>
            </div>
        </div>
    );

    const renderPractice = () => {
        const hasVideos = studentVideos.length > 0;
        
        return (
            <div className="relative h-full min-h-[500px]">
                {!hasPremiumAccess && renderPremiumLock("The Practice Dojo", `Help your child practice at home. Unlock training missions and videos.`)}

                <div className={`space-y-6 pb-20 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none overflow-hidden h-[500px]' : ''}`}>
                    <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="absolute right-0 top-0 text-6xl opacity-20 -mr-4 -mt-2">🥋</div>
                        <h3 className="font-bold text-white relative z-10">Current Mission: {currentBelt?.name}</h3>
                        <p className="text-sm text-yellow-100 relative z-10 mt-1">
                            {hasVideos ? "Master these skills to earn your next stripe." : "Complete these family challenges to build discipline."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1">
                            {hasVideos ? "My Curriculum" : "Family Missions"}
                        </h4>
                        
                        {hasVideos ? (
                            studentVideos.map((video, idx) => (
                                <a key={idx} href={video.url} target="_blank" rel="noopener noreferrer" className="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 flex group cursor-pointer hover:border-sky-500 transition-colors">
                                    <div className="w-24 bg-gray-900 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-300">
                                        🥋
                                    </div>
                                    <div className="p-4 flex-1">
                                        <h4 className="font-bold text-white text-sm">{video.title}</h4>
                                        <p className="text-xs text-gray-500 mt-1">Watch Video</p>
                                    </div>
                                    <div className="flex items-center px-4">
                                        <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center group-hover:bg-sky-400 shadow-lg shadow-blue-600/30">
                                            <span className="text-white text-xs">▶</span>
                                        </div>
                                    </div>
                                </a>
                            ))
                        ) : (
                            // Fallback: Family Missions if no videos
                            <div className="space-y-3">
                                {[
                                    { id: 'm1', title: 'Team Staring Contest', desc: 'Challenge your parent! First to blink loses. Builds Focus.', icon: '👀' },
                                    { id: 'm2', title: 'Pillow Kicking', desc: 'Parent holds a pillow. Student does 10 kicks. Builds Speed.', icon: '🦶' },
                                    { id: 'm3', title: 'The Teacher', desc: 'Teach your parent 1 move you learned in class today.', icon: '🎓' }
                                ].map(mission => (
                                    <div 
                                        key={mission.id} 
                                        onClick={() => toggleMission(mission.id)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between
                                            ${missionChecks[mission.id] 
                                                ? 'bg-green-900/20 border-green-500/50' 
                                                : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="text-2xl">{mission.icon}</div>
                                            <div>
                                                <h4 className={`font-bold text-sm ${missionChecks[mission.id] ? 'text-green-400 line-through' : 'text-white'}`}>{mission.title}</h4>
                                                <p className="text-xs text-gray-400">{mission.desc}</p>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                                            ${missionChecks[mission.id] ? 'bg-green-500 border-green-500' : 'border-gray-500'}`}>
                                            {missionChecks[mission.id] && <span className="text-white text-xs">✓</span>}
                                        </div>
                                    </div>
                                ))}
                                <p className="text-xs text-center text-gray-500 mt-4 italic">Complete missions to earn a Family Star!</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 p-4 bg-gray-800/50 rounded-lg text-center border border-gray-700/50">
                        <p className="text-xs text-gray-500">Need more help? Ask your instructor during next class!</p>
                    </div>
                </div>
            </div>
        );
    }

    const renderJourney = () => {
        // Construct timeline events from student history
        const timelineEvents = [
            { date: student.joinDate, title: 'Joined the Family', type: 'start', icon: '🎉' },
            ...(student.lastPromotionDate ? [{ date: student.lastPromotionDate, title: `Promoted to ${currentBelt?.name}`, type: 'promotion', icon: '🥋' }] : []),
            ...(student.feedbackHistory?.filter(f => f.text.includes('Award') || f.text.includes('Certificate')).map(f => ({
                date: f.date, title: 'Award Earned', type: 'award', icon: '🏆'
            })) || [])
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Newest first

        // Mock data if timeline is empty
        if (timelineEvents.length < 2) {
             timelineEvents.push({ date: '2024-01-01', title: 'First Class Attended', type: 'class', icon: '✅' });
        }

        return (
            <div className="relative h-full min-h-[500px]">
                {!hasPremiumAccess && renderPremiumLock("Belt Journey", "See a visual timeline of your child's entire martial arts career. Relive every promotion and milestone.")}
                
                <div className={`space-y-6 pb-20 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none overflow-hidden h-[500px]' : ''}`}>
                    
                    {/* TIME MACHINE WIDGET (New!) */}
                    <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden">
                        {/* Glowing Effect */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-2 bg-gradient-to-r from-transparent via-blue-500 to-transparent blur-sm"></div>
                        
                        <h3 className="text-center text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Black Belt Time Machine</h3>
                        
                        <div className="text-center mb-6">
                            <p className="text-sm text-gray-500">Estimated Achievement Date</p>
                            <h2 className="text-3xl md:text-4xl font-black text-white mt-1 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                {blackBeltPrediction.estimatedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </h2>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
                                Target: {blackBeltPrediction.targetBeltName}
                            </p>
                            {simulatedAttendance > 1 && Number(blackBeltPrediction.yearsSaved) > 0 && (
                                <p className="text-green-400 text-xs font-bold mt-2 animate-pulse">
                                    ⚡ You save {blackBeltPrediction.yearsSaved} years by training {simulatedAttendance}x/week!
                                </p>
                            )}
                        </div>

                        {/* Slider */}
                        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 mb-4">
                            <div className="flex justify-between text-xs text-gray-300 mb-2">
                                <span>Training Frequency</span>
                                <span className="font-bold text-sky-300">{simulatedAttendance} Classes / Week</span>
                            </div>
                            <input 
                                type="range" 
                                min="1" max="6" step="1"
                                value={simulatedAttendance} 
                                onChange={(e) => setSimulatedAttendance(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                <span>Relaxed (1x)</span>
                                <span>Dedicated (3x)</span>
                                <span>Elite (6x)</span>
                            </div>
                        </div>

                        {/* Road to Black Belt Progress */}
                        <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Road to Black Belt</span>
                                <span>{Math.round(blackBeltPrediction.percentComplete)}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-3 border border-gray-700">
                                <div 
                                    className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-black rounded-full transition-all duration-1000 relative" 
                                    style={{ width: `${blackBeltPrediction.percentComplete}%` }}
                                >
                                    <div className="absolute right-0 -top-1 w-5 h-5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] flex items-center justify-center">
                                        <span className="text-[10px]">🥋</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center py-6">
                        <div className="w-24 h-24 bg-sky-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                            <span className="text-4xl">🚀</span>
                        </div>
                        <h3 className="text-xl font-bold text-white">Your Journey</h3>
                        <p className="text-sm text-gray-400">Started {new Date(student.joinDate).toLocaleDateString()}</p>
                    </div>

                    <div className="relative pl-8 border-l-2 border-gray-700 space-y-8 ml-6">
                        {timelineEvents.map((event, i) => (
                            <div key={i} className="relative">
                                <div className="absolute -left-[41px] bg-gray-900 border-2 border-sky-500 rounded-full w-10 h-10 flex items-center justify-center text-xl shadow-lg shadow-blue-900/50">
                                    {event.icon}
                                </div>
                                <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm hover:border-sky-500/50 transition-colors">
                                    <span className="text-xs font-bold text-sky-300 uppercase tracking-wide">{new Date(event.date).toLocaleDateString()}</span>
                                    <h4 className="font-bold text-white text-lg mt-1">{event.title}</h4>
                                </div>
                            </div>
                        ))}
                         <div className="relative">
                            <div className="absolute -left-[35px] bg-gray-700 rounded-full w-7 h-7 flex items-center justify-center text-xs">🏁</div>
                            <p className="text-gray-500 text-sm italic pt-1">The journey began here.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    const renderAthleteCard = () => {
        const stats = student.sparringStats || { matches: 0, wins: 0, draws: 0, headKicks: 0, bodyKicks: 0, punches: 0, takedowns: 0, defense: 0 };
        
        // DYNAMICALLY CALCULATE STATS BASED ON CLUB'S SKILLS
        const history = student.performanceHistory || [];
        const recentHistory = history.slice(-10); // Last 10 classes
        const activeSkills = data.skills.filter(s => s.isActive);

        const calcAvg = (skillId: string) => {
            if (recentHistory.length === 0) return 75; // Default start
            
            const scores = recentHistory
                .map(h => h.scores[skillId])
                .filter(s => typeof s === 'number') as number[];
            
            if (scores.length === 0) return 75;
            const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
            // Map 0-2 to 60-99 scale
            return Math.round(60 + (avg * 19.5)); 
        }

        // Calculate individual stats for the card (Limit to 6 slots)
        const cardStats = activeSkills.slice(0, 6).map(skill => ({
            label: skill.name.substring(0, 3).toUpperCase(), // e.g. Technique -> TEC
            value: calcAvg(skill.id)
        }));

        // Attendance is always a stat
        const att = Math.min(99, 60 + (student.attendanceCount || 0));
        
        // Calculate OVR (Overall Rating) based on ALL skills + Belt
        const beltIndex = data.belts.findIndex(b => b.id === student.beltId);
        const beltBase = 60 + (beltIndex * 4); // Higher belt = Higher base OVR
        
        const skillSum = cardStats.reduce((sum, stat) => sum + stat.value, 0);
        const ovr = Math.round((skillSum + att + beltBase) / (cardStats.length + 2));

        const hasSparringData = stats.matches > 0;

        return (
            <div className="relative h-full min-h-[500px] flex flex-col items-center pb-20">
                {!hasPremiumAccess && renderPremiumLock("Athlete Card", "Unlock your official Athlete Card with tracked stats like Focus, Power, and Discipline.")}
                
                <div className={`w-full max-w-xs mt-4 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none' : ''}`}>
                    {/* THE ATHLETE CARD */}
                    <div className="bg-gradient-to-b from-blue-600 via-blue-800 to-black p-1 rounded-[20px] shadow-2xl transform hover:scale-105 transition-transform duration-500">
                        <div className="bg-black rounded-[18px] p-4 relative overflow-hidden border border-blue-600/50 h-[450px] flex flex-col">
                            {/* Background Texture */}
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                            
                            {/* Top Stats */}
                            <div className="flex justify-between items-start relative z-10 mb-2">
                                <div>
                                    <span className="text-4xl font-black text-sky-300 italic">{ovr}</span>
                                    <span className="block text-[10px] text-blue-200 font-bold uppercase">OVR</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-xs text-gray-400">{data.clubName}</span>
                                    <div className="w-6 h-4 rounded mt-1 ml-auto" style={{background: currentBelt?.color1 || 'white'}}></div>
                                </div>
                            </div>

                            {/* Photo Area */}
                            <div className="relative z-10 flex-1 flex items-end justify-center mb-4">
                                <div className="w-32 h-32 rounded-full border-4 border-sky-500 overflow-hidden shadow-[0_0_20px_rgba(59,130,246,0.5)] bg-gray-800">
                                    {student.photo ? (
                                        <img src={student.photo} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-5xl">🥋</div>
                                    )}
                                </div>
                            </div>

                            {/* Name */}
                            <div className="relative z-10 text-center mb-6">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">{student.name}</h2>
                                <div className="h-0.5 w-20 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto mt-1"></div>
                            </div>

                            {/* General Attributes Grid - DYNAMIC */}
                            <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
                                {cardStats.map((stat, i) => (
                                    <div key={i} className="flex justify-between border-b border-gray-800 pb-1">
                                        <span className="text-gray-400">{stat.label}</span>
                                        <span className="font-bold text-white">{stat.value}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between border-b border-gray-800 pb-1">
                                    <span className="text-gray-400">ATT</span>
                                    <span className="font-bold text-white">{att}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Optional Sparring Stats (Only if they fight) */}
                    {hasSparringData && (
                        <div className="mt-6 bg-gray-800 p-4 rounded-xl border border-gray-700">
                            <h4 className="text-white font-bold mb-2 text-sm uppercase tracking-wider text-center">🥊 Combat Stats</h4>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-gray-900 p-2 rounded">
                                    <p className="text-xs text-gray-500 uppercase">Matches</p>
                                    <p className="font-mono font-bold text-white">{stats.matches}</p>
                                </div>
                                <div className="bg-gray-900 p-2 rounded">
                                    <p className="text-xs text-gray-500 uppercase">Wins</p>
                                    <p className="font-mono font-bold text-green-400">{stats.wins}</p>
                                </div>
                                <div className="bg-gray-900 p-2 rounded">
                                    <p className="text-xs text-gray-500 uppercase">Takedowns</p>
                                    <p className="font-mono font-bold text-sky-300">{stats.takedowns}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }
    
    const renderBooking = () => {
        // Smart Filter: Only show classes that match student's belt
        // For simplicity: if beltReq is "All" or matches ID
        // In real app, would need rank comparison (is belt > required belt)
        const relevantClasses = (data.schedule || []).filter(c => 
            c.beltRequirement === 'All' || c.beltRequirement === student.beltId
        );

        return (
            <div className="space-y-8 pb-20">
                 {/* Section 1: My Schedule */}
                 <div className="space-y-4">
                     <h3 className="font-bold text-white text-lg px-2 flex items-center"><CalendarIcon /><span className="ml-2">My Class Schedule</span></h3>
                     {relevantClasses.length > 0 ? (
                         <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                             {relevantClasses.map(cls => (
                                 <div key={cls.id} className="p-4 border-b border-gray-700 last:border-0 flex justify-between items-center">
                                     <div>
                                         <p className="font-bold text-white text-lg">{cls.day}</p>
                                         <p className="text-sm text-sky-300 font-bold">{cls.time} • {cls.className}</p>
                                         <p className="text-xs text-gray-500 mt-1">Instructor: {cls.instructor}</p>
                                     </div>
                                     <div className="text-right">
                                         <button className="bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded-full">Weekly</button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     ) : (
                         <p className="text-gray-500 text-center italic py-4">No specific classes scheduled for your belt level yet.</p>
                     )}
                 </div>
                 
                 {/* Section 2: Upcoming Events */}
                 <div className="space-y-4">
                     <h3 className="font-bold text-white text-lg px-2">Upcoming Events</h3>
                     {(data.events || []).length > 0 ? (
                         data.events?.map(evt => (
                             <div key={evt.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                                 <div className="flex justify-between items-start mb-2">
                                     <div>
                                         <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">{evt.type}</span>
                                         <h4 className="font-bold text-white text-lg">{evt.title}</h4>
                                     </div>
                                     <div className="text-center bg-gray-700 p-2 rounded-lg min-w-[60px]">
                                         <span className="block text-xs text-gray-400 uppercase">{new Date(evt.date).toLocaleString('default', { month: 'short' })}</span>
                                         <span className="block text-xl font-bold text-white">{new Date(evt.date).getDate()}</span>
                                     </div>
                                 </div>
                                 <p className="text-sm text-gray-400 mb-4">{evt.time} @ {evt.location}</p>
                                 <a 
                                     href={generateGoogleCalendarUrl(evt)} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="block w-full text-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                                 >
                                     📅 Add to Google Calendar
                                 </a>
                             </div>
                         ))
                     ) : (
                         <p className="text-gray-500 text-center italic py-4">No upcoming events.</p>
                     )}
                 </div>

                 {/* Section 3: Private Lessons Upsell */}
                 <div className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 p-6 rounded-2xl border border-purple-500/30">
                     <h3 className="font-bold text-white text-lg mb-2">🚀 Accelerate Progress</h3>
                     <p className="text-sm text-gray-300 mb-4">Book a 1-on-1 private lesson with a Master Instructor.</p>
                     
                     <div className="space-y-3">
                         {(data.privateSlots || []).filter(s => !s.isBooked).length === 0 && (
                             <p className="text-gray-400 text-sm italic">No slots available right now.</p>
                         )}
                         {(data.privateSlots || []).filter(s => !s.isBooked).map(slot => (
                             <div key={slot.id} className="bg-gray-800 p-3 rounded-lg border border-gray-600 flex justify-between items-center">
                                 <div>
                                     <p className="font-bold text-white">{new Date(slot.date).toLocaleDateString()}</p>
                                     <p className="text-sm text-gray-400">{slot.time} with {slot.coachName}</p>
                                 </div>
                                 {bookedSlots[slot.id] ? (
                                     <span className="text-green-400 font-bold text-sm">Booked!</span>
                                 ) : (
                                     <button 
                                         onClick={() => handleBookSlot(slot.id)}
                                         className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2 rounded-lg"
                                     >
                                         Book ${slot.price}
                                     </button>
                                 )}
                             </div>
                         ))}
                     </div>
                 </div>
            </div>
        );
    }

    const renderRivals = () => {
        // Mock classmates to challenge
        const classmates = data.students.filter(s => s.id !== student.id);

        return (
            <div className="relative h-full min-h-[500px]">
                <div className="space-y-6 pb-20">
                    <div className="bg-gradient-to-r from-red-900 to-black p-6 rounded-xl border border-red-600/50 text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        <h3 className="text-3xl font-black text-white italic tracking-tighter relative z-10">DOJANG RIVALS</h3>
                        <p className="text-red-400 font-bold uppercase tracking-widest text-xs relative z-10">Challenge. Compete. Win.</p>
                    </div>

                    {!isSimulatingChallenge ? (
                        <>
                            {/* Current Badges */}
                            <div className="flex space-x-2 overflow-x-auto pb-2">
                                {(student.badges || []).map((badge, i) => (
                                    <div key={i} className="bg-gray-800 px-3 py-1 rounded-full border border-gray-700 text-xs font-bold text-yellow-400 flex items-center">
                                        <span className="mr-1">🏆</span> {badge}
                                    </div>
                                ))}
                                {(student.badges || []).length === 0 && <p className="text-gray-500 text-xs italic">Win challenges to earn badges!</p>}
                            </div>

                            {/* Challenge UI */}
                            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                                <h4 className="font-bold text-white mb-4">Start a Duel</h4>
                                <select 
                                    value={selectedRival} 
                                    onChange={e => setSelectedRival(e.target.value)}
                                    className="w-full bg-gray-700 text-white p-3 rounded-lg mb-4 border border-gray-600"
                                >
                                    <option value="">Select Opponent...</option>
                                    {classmates.map(c => <option key={c.id} value={c.id}>{c.name} ({data.belts.find(b => b.id === c.beltId)?.name})</option>)}
                                </select>
                                
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <button className="bg-gray-700 hover:bg-red-900/50 hover:border-red-500 border border-transparent p-3 rounded-lg text-center transition-all group">
                                        <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">💪</div>
                                        <div className="text-xs font-bold text-gray-300">Pushups</div>
                                    </button>
                                    <button className="bg-gray-700 hover:bg-red-900/50 hover:border-red-500 border border-transparent p-3 rounded-lg text-center transition-all group">
                                        <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">🦵</div>
                                        <div className="text-xs font-bold text-gray-300">Squats</div>
                                    </button>
                                </div>

                                <button 
                                    onClick={handleSendChallenge}
                                    disabled={!selectedRival}
                                    className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-black py-4 rounded-xl shadow-lg transform active:scale-95 transition-all text-lg uppercase tracking-wider"
                                >
                                    FIGHT!
                                </button>
                            </div>
                        </>
                    ) : (
                        // Simulation Screen
                        <div className="bg-black rounded-xl border-2 border-red-600 p-8 text-center min-h-[300px] flex flex-col items-center justify-center relative overflow-hidden">
                            {/* VS Animation */}
                            <div className="absolute inset-0 bg-red-900/20 animate-pulse"></div>
                            
                            {challengeResult === 'pending' ? (
                                <>
                                    <div className="text-6xl mb-4 animate-bounce">⚔️</div>
                                    <h3 className="text-2xl font-black text-white italic">WAITING FOR OPPONENT...</h3>
                                </>
                            ) : (
                                <>
                                    <div className="text-6xl mb-4">{challengeResult === 'win' ? '👑' : '💀'}</div>
                                    <h3 className={`text-4xl font-black italic mb-2 ${challengeResult === 'win' ? 'text-yellow-400' : 'text-gray-500'}`}>
                                        {challengeResult === 'win' ? 'YOU WON!' : 'DEFEAT'}
                                    </h3>
                                    {challengeResult === 'win' && (
                                        <p className="text-green-400 font-bold animate-pulse">+1 Golden Fist Earned</p>
                                    )}
                                    <button 
                                        onClick={() => {
                                            setIsSimulatingChallenge(false);
                                            setChallengeResult(null);
                                            setSelectedRival('');
                                        }}
                                        className="mt-8 text-gray-400 underline text-sm"
                                    >
                                        Back to Arena
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    const renderHomeDojo = () => {
        // Toggle Edit Mode (Premium Check)
        const toggleEditMode = () => {
            if (!hasPremiumAccess) {
                // Trigger premium lock visually or alert
                alert("Upgrade to Premium to customize habits!");
                setIsPremium(true); // Simulate upgrade flow
                return;
            }
            setIsEditingHabits(!isEditingHabits);
        }

        const activeHabits = customHabitList.filter(h => h.isActive);

        return (
            <div className="relative h-full min-h-[500px]">
                <div className="space-y-6 pb-20">
                    <div className="bg-gradient-to-r from-green-800 to-teal-900 p-6 rounded-xl shadow-lg relative overflow-hidden">
                        <div className="absolute right-0 top-0 text-6xl opacity-20 -mr-2 -mt-2">🏠</div>
                        <h3 className="font-bold text-white text-xl relative z-10">The Home Dojo</h3>
                        <p className="text-sm text-green-100 relative z-10 mt-1">
                            Building character starts at home.
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Today's Check-in</h4>
                        <button 
                            onClick={toggleEditMode}
                            className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors flex items-center ${hasPremiumAccess ? 'bg-gray-800 text-sky-300 border-sky-500 hover:bg-gray-700' : 'bg-gray-800 text-gray-500 border-gray-600'}`}
                        >
                            {!hasPremiumAccess && <span className="mr-1">🔒</span>}
                            {isEditingHabits ? 'Done' : 'Customize'}
                        </button>
                    </div>

                    {/* Habit Tracker List */}
                    {!isEditingHabits ? (
                        <div className="space-y-3">
                            {activeHabits.map(habit => (
                                <div 
                                    key={habit.id}
                                    onClick={() => toggleHabitCheck(habit.id)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group
                                        ${homeDojoChecks[habit.id] 
                                            ? 'bg-green-900/20 border-green-500/50' 
                                            : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="text-3xl bg-gray-900 w-12 h-12 rounded-full flex items-center justify-center shadow-inner">
                                            {habit.icon}
                                        </div>
                                        <div>
                                            <h4 className={`font-bold text-base ${homeDojoChecks[habit.id] ? 'text-green-400' : 'text-white'}`}>
                                                {habit.question}
                                            </h4>
                                            <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-900 px-2 py-0.5 rounded mt-1 inline-block">
                                                {habit.category}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all
                                        ${homeDojoChecks[habit.id] ? 'bg-green-500 border-green-500 scale-110' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                        {homeDojoChecks[habit.id] && <span className="text-white font-bold">✓</span>}
                                    </div>
                                </div>
                            ))}
                            {activeHabits.length === 0 && (
                                <p className="text-gray-500 text-center italic py-8">No active habits. Click customize to add some!</p>
                            )}
                        </div>
                    ) : (
                        // EDIT MODE (Premium Only)
                        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 animate-fade-in">
                            <h4 className="font-bold text-white mb-4 flex items-center">
                                <span className="text-xl mr-2">⚙️</span> Habit Builder
                            </h4>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {PRESET_HABITS.map(preset => {
                                    const isActive = customHabitList.some(h => h.question === preset.question);
                                    return (
                                        <div key={preset.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded border border-gray-700">
                                            <div className="flex items-center space-x-3">
                                                <span className="text-2xl">{preset.icon}</span>
                                                <span className="text-sm text-gray-300">{preset.question}</span>
                                            </div>
                                            <button 
                                                onClick={() => handleToggleCustomHabit(preset)}
                                                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${isActive ? 'bg-red-900/50 text-red-400 border border-red-900' : 'bg-green-900/50 text-green-400 border border-green-900'}`}
                                            >
                                                {isActive ? 'Remove' : 'Add'}
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-4 text-center">Changes save automatically.</p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-900 pb-20 max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-gray-800">
             {/* Preview Header for Owner */}
            <div className="bg-yellow-600 text-white text-xs font-bold text-center py-2 sticky top-0 z-50 shadow-md flex justify-between px-4 items-center">
                <span>PREVIEW MODE</span>
                <button onClick={onBack} className="underline text-yellow-100 hover:text-white">Close</button>
            </div>

            {/* Main Content */}
            <div className="p-4 overflow-y-auto h-[calc(100vh-60px)] no-scrollbar">
                {activeTab === 'home' && renderHome()}
                {activeTab === 'insights' && renderInsights()}
                {activeTab === 'card' && renderAthleteCard()}
                {activeTab === 'practice' && renderPractice()}
                {activeTab === 'journey' && renderJourney()}
                {activeTab === 'booking' && renderBooking()}
                {activeTab === 'rivals' && renderRivals()}
                {activeTab === 'home-dojo' && renderHomeDojo()}
            </div>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 w-full max-w-md bg-gray-800 border-t border-gray-700 pb-safe z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
                <div className="flex justify-between items-center h-16 px-2 overflow-x-auto no-scrollbar">
                    <NavButton icon="🏠" label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                    <NavButton icon="🏠" label="Dojo" active={activeTab === 'home-dojo'} onClick={() => setActiveTab('home-dojo')} isPremium={!hasPremiumAccess} />
                    <NavButton icon="📅" label="Book" active={activeTab === 'booking'} onClick={() => setActiveTab('booking')} />
                    <NavButton icon="⚔️" label="Rivals" active={activeTab === 'rivals'} onClick={() => setActiveTab('rivals')} />
                    <NavButton icon="🏅" label="Card" active={activeTab === 'card'} onClick={() => setActiveTab('card')} isPremium={!hasPremiumAccess} />
                    <NavButton icon="📊" label="Stats" active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} isPremium={!hasPremiumAccess} />
                    <NavButton icon="🚀" label="Path" active={activeTab === 'journey'} onClick={() => setActiveTab('journey')} isPremium={!hasPremiumAccess} />
                </div>
            </div>
        </div>
    );
};

const NavButton: React.FC<{ icon: string; label: string; active: boolean; onClick: () => void; isPremium?: boolean }> = ({ icon, label, active, onClick, isPremium }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center min-w-[50px] w-full h-full relative transition-colors ${active ? 'text-sky-300' : 'text-gray-500 hover:text-gray-300'}`}>
        <span className={`text-xl mb-1 transition-transform ${active ? 'scale-110' : ''}`}>{icon}</span>
        <span className="text-[9px] font-medium tracking-wide">{label}</span>
        {isPremium && <span className="absolute top-2 right-1 w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)]"></span>}
    </button>
);