
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Student, WizardData, FeedbackRecord, PerformanceRecord, Skill, Belt } from '../types';

// --- PROPS & HELPER TYPES ---
interface StudentProfileProps {
  student: Student;
  data: WizardData;
  onUpdateStudent?: (student: Student) => void;
  onClose: () => void;
}
interface InfoLineProps { label: string; value?: string | number | null; }

// --- UTILITY FUNCTIONS ---
const getBelt = (beltId: string, belts: Belt[]) => belts.find(b => b.id === beltId);
const calculateAge = (birthday: string) => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};
const formatTimeDifference = (dateString: string) => {
    if (!dateString) return 'N/A';
    const startDate = new Date(dateString);
    const endDate = new Date();
    const diff = endDate.getTime() - startDate.getTime();
    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44)); // Average month length
    const weeks = Math.floor((diff % (1000 * 60 * 60 * 24 * 30.44)) / (1000 * 60 * 60 * 24 * 7));
    return `${months} months, ${weeks} weeks`;
}

// --- SUB-COMPONENTS ---

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; title: string, size?: 'lg' | '2xl' | '4xl' }> = ({ children, onClose, title, size = 'lg' }) => {
    const sizeMap = {
        'lg': 'max-w-lg',
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
    }
    return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className={`bg-gray-800 rounded-lg shadow-xl w-full border border-gray-700 ${sizeMap[size]}`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800 rounded-t-lg z-10">
                <h3 className="font-bold text-white text-xl">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 max-h-[85vh] overflow-y-auto">{children}</div>
        </div>
    </div>
)};

const InfoLine: React.FC<InfoLineProps> = ({ label, value }) => (
    <div className="flex justify-between text-sm py-1.5 border-b border-gray-700/50">
        <span className="font-medium text-gray-400">{label}</span>
        <span className="text-white font-semibold">{value || 'N/A'}</span>
    </div>
);

const EditInput: React.FC<{ label: string; value: string | number; onChange: (val: any) => void; type?: string; options?: {label: string, value: string}[] }> = ({ label, value, onChange, type = 'text', options }) => (
    <div className="mb-2">
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{label}</label>
        {options ? (
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-sky-500 outline-none h-8">
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        ) : (
             <input 
                type={type} 
                value={value} 
                onChange={e => onChange(type === 'number' ? parseInt(e.target.value) || '' : e.target.value)} 
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:border-sky-500 outline-none h-8"
            />
        )}
    </div>
)

const BasicInfo: React.FC<{ student: Student; belts: Belt[]; rules: WizardData; onUpdate?: (s: Student) => void }> = ({ student, belts, rules, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Student>(student);
    const belt = getBelt(student.beltId, belts);
    const displayAge = student.age || calculateAge(student.birthday) || 'N/A';
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormData(student);
    }, [student]);

    const handleSave = () => {
        if (onUpdate) {
            onUpdate(formData);
            setIsEditing(false);
        }
    };

    const handleCancel = () => {
        setFormData(student);
        setIsEditing(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, photo: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleStripesChange = (val: any) => {
        const newStripes = parseInt(val) || 0;
        
        // Recalculate Total Points based on new stripes
        let pps = rules.pointsPerStripe;
        if (rules.useCustomPointsPerBelt && rules.pointsPerBelt[formData.beltId]) {
            pps = rules.pointsPerBelt[formData.beltId];
        }
        
        const newTotal = newStripes * pps;

        setFormData({ 
            ...formData, 
            stripes: newStripes, 
            totalPoints: newTotal 
        });
    };

    const beltOptions = belts.map(b => ({ label: b.name, value: b.id }));
    const genderOptions = [{label: 'Male', value: 'Male'}, {label: 'Female', value: 'Female'}, {label: 'Other', value: 'Other'}];
    const classOptions = rules.classes?.map(c => ({ label: c, value: c })) || [{label: 'General', value: 'General'}];

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 relative">
             <div className="absolute top-4 right-4 z-10">
                {!isEditing ? (
                     onUpdate && <button onClick={() => setIsEditing(true)} className="text-xs font-bold text-sky-300 hover:text-blue-300 bg-gray-800 px-2 py-1 rounded border border-gray-700 transition-colors">EDIT</button>
                ) : (
                    <div className="flex space-x-2">
                        <button onClick={handleCancel} className="text-xs font-bold text-gray-400 hover:text-white bg-gray-800 px-2 py-1 rounded border border-gray-700 transition-colors">CANCEL</button>
                        <button onClick={handleSave} className="text-xs font-bold text-green-400 hover:text-green-300 bg-gray-800 px-2 py-1 rounded border border-gray-700 transition-colors">SAVE</button>
                    </div>
                )}
            </div>

            <div className="text-center mb-4">
                <div className="relative w-24 h-24 mx-auto mb-4 group">
                    <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden border-4 border-gray-800 shadow-lg">
                        {formData.photo ? (
                            <img src={formData.photo} alt={student.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-4xl font-bold text-gray-500">{student.name.charAt(0)}</span>
                        )}
                    </div>
                    
                    {isEditing && (
                        <>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer backdrop-blur-sm"
                                title="Change Photo"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-[10px] font-bold text-white uppercase tracking-wider">Upload</span>
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                                className="hidden" 
                                accept="image/*" 
                            />
                        </>
                    )}
                    
                    {isEditing && !formData.photo && (
                        <div className="absolute bottom-0 right-0 bg-sky-400 rounded-full p-1.5 border-2 border-gray-900 pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
                </div>

                {!isEditing ? (
                    <h2 className="text-xl font-bold text-white">{student.name}</h2>
                ) : (
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-center text-white font-bold mb-2 w-full focus:border-sky-500 outline-none" placeholder="Student Name" />
                )}
                
                {!isEditing && (
                    <div className="flex items-center justify-center space-x-2 mt-1">
                        <div className="w-5 h-5 rounded-sm" style={{ background: belt?.color2 ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` : belt?.color1 }}></div>
                        <span className="text-gray-300">{belt?.name}</span>
                    </div>
                )}
            </div>
            
            {!isEditing ? (
                <div className="space-y-1">
                    <InfoLine label="Age" value={displayAge} />
                    <InfoLine label="Gender" value={student.gender} />
                    <InfoLine label="Location" value={student.location} />
                    <InfoLine label="Assigned Class" value={student.assignedClass} />
                    <InfoLine label="Join Date" value={new Date(student.joinDate).toLocaleDateString()} />
                    <InfoLine label="Attendance" value={`${student.attendanceCount} classes`} />
                    <InfoLine label="Medical Info" value={student.medicalInfo || 'None'} />
                    <div className="border-t border-gray-700 pt-2 mt-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Parent Info</h4>
                        <InfoLine label="Name" value={student.parentName} />
                        <InfoLine label="Email" value={student.parentEmail} />
                        <InfoLine label="Phone" value={student.parentPhone} />
                    </div>
                </div>
            ) : (
                <div className="space-y-3 mt-4">
                    <div>
                        <h4 className="text-xs font-bold text-sky-300 uppercase mb-2">Personal Details</h4>
                        <div className="grid grid-cols-2 gap-2">
                             <EditInput label="Age" type="number" value={formData.age || ''} onChange={v => setFormData({...formData, age: v})} />
                             <EditInput label="Gender" value={formData.gender} options={genderOptions} onChange={v => setFormData({...formData, gender: v})} />
                        </div>
                        <EditInput label="Medical Info" value={formData.medicalInfo || ''} onChange={v => setFormData({...formData, medicalInfo: v})} />
                    </div>
                    
                    <div className="border-t border-gray-700 pt-3">
                         <h4 className="text-xs font-bold text-sky-300 uppercase mb-2">Club Details</h4>
                         <EditInput label="Belt Rank" value={formData.beltId} options={beltOptions} onChange={v => setFormData({...formData, beltId: v})} />
                         <div className="grid grid-cols-2 gap-2">
                             <EditInput label="Current Stripes" type="number" value={formData.stripes} onChange={handleStripesChange} />
                             <EditInput label="Join Date" type="date" value={formData.joinDate.split('T')[0]} onChange={v => setFormData({...formData, joinDate: v})} />
                         </div>
                         <EditInput label="Location" value={formData.location || ''} onChange={v => setFormData({...formData, location: v})} />
                         <EditInput label="Assigned Class" value={formData.assignedClass || ''} options={classOptions} onChange={v => setFormData({...formData, assignedClass: v})} />
                    </div>

                    <div className="border-t border-gray-700 pt-3">
                         <h4 className="text-xs font-bold text-sky-300 uppercase mb-2">Parent Info</h4>
                         <EditInput label="Parent Name" value={formData.parentName || ''} onChange={v => setFormData({...formData, parentName: v})} />
                         <EditInput label="Parent Email" value={formData.parentEmail || ''} onChange={v => setFormData({...formData, parentEmail: v})} />
                         <EditInput label="Parent Phone" value={formData.parentPhone || ''} onChange={v => setFormData({...formData, parentPhone: v})} />
                    </div>
                </div>
            )}
        </div>
    );
};

const PerformanceSummary: React.FC<{ student: Student, rules: WizardData }> = ({ student, rules }) => {
    const { totalPoints } = student; // Only rely on totalPoints
    const { stripesPerBelt } = rules;
    
    // Determine points required for next stripe based on rules
    let pointsPerStripe = rules.pointsPerStripe;
    if (rules.useCustomPointsPerBelt && rules.pointsPerBelt && rules.pointsPerBelt[student.beltId]) {
        pointsPerStripe = rules.pointsPerBelt[student.beltId];
    }

    const earnedStripesCount = Math.floor(totalPoints / pointsPerStripe);
    // Cap the visual display of stripes at the maximum per belt.
    // This prevents the bar from showing "0 stripes" if a student has exactly max points (e.g. 4/4).
    const currentBeltStripes = Math.min(earnedStripesCount, stripesPerBelt);
    
    // If they are maxed out, progress is 100%. Otherwise, calculate modulo.
    const isMaxedOut = earnedStripesCount >= stripesPerBelt;
    const pointsForNextStripe = isMaxedOut ? pointsPerStripe : (totalPoints % pointsPerStripe);
    const stripeProgress = isMaxedOut ? 100 : (pointsForNextStripe / pointsPerStripe) * 100;
    
    const nextStripeIndex = Math.min(currentBeltStripes, stripesPerBelt - 1);
    
    let progressBarColor = 'bg-sky-400';
    if (isMaxedOut) {
        progressBarColor = 'bg-yellow-400'; // Gold for max
    } else if (rules.useColorCodedStripes && rules.stripeColors && rules.stripeColors[nextStripeIndex]) {
        progressBarColor = ''; // Use inline style for custom colors
    }

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
            <h3 className="font-semibold text-lg text-white">Performance Summary</h3>
            <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{isMaxedOut ? 'Ready for Grading' : 'Progress to Next Stripe'}</span>
                    <span>{isMaxedOut ? 'MAX' : `${pointsForNextStripe}/${pointsPerStripe} pts`}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div 
                        className={`h-2.5 rounded-full transition-all duration-500 ${progressBarColor}`} 
                        style={{ 
                            width: `${stripeProgress}%`,
                            backgroundColor: (!isMaxedOut && rules.useColorCodedStripes) ? (rules.stripeColors[nextStripeIndex] || '#3B82F6') : undefined
                        }}
                    ></div>
                </div>
            </div>
            <div>
                <label className="text-xs text-gray-400">Stripes Earned on Current Belt ({currentBeltStripes}/{stripesPerBelt})</label>
                <div className="flex space-x-1 mt-1">
                    {Array.from({ length: stripesPerBelt }).map((_, i) => {
                        const isEarned = i < currentBeltStripes;
                        const stripeColor = rules.useColorCodedStripes ? (rules.stripeColors[i] || '#3B82F6') : '#3B82F6'; // Default blue if not custom
                        
                        return (
                            <div 
                                key={i} 
                                className={`h-2 flex-1 rounded ${!isEarned ? 'bg-gray-700' : ''}`}
                                style={{ backgroundColor: isEarned ? stripeColor : undefined }}
                                title={`Stripe ${i+1}: ${isEarned ? 'Earned' : 'Locked'}`}
                            ></div>
                        );
                    })}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
                 <InfoLine label="Total Points" value={totalPoints} />
                 <InfoLine label="Last Promotion" value={student.lastPromotionDate ? new Date(student.lastPromotionDate).toLocaleDateString() : 'N/A'} />
                 <InfoLine label="Time in Belt" value={formatTimeDifference(student.lastPromotionDate)} />
            </div>
        </div>
    );
};

const PerformanceHistoryGraph: React.FC<{ history: PerformanceRecord[], skills: Skill[], lastPromotionDate?: string }> = ({ history, skills, lastPromotionDate }) => {
    const activeSkills = skills.filter(s => s.isActive);
    
    // FILTER: Only show history AFTER the last promotion
    const relevantHistory = useMemo(() => {
        let filtered = [...history];
        if (lastPromotionDate) {
            const promoTime = new Date(lastPromotionDate).getTime();
            filtered = filtered.filter(h => new Date(h.date).getTime() > promoTime);
        }
        return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [history, lastPromotionDate]);

    const last8WeeksHistory = relevantHistory.slice(-8);
    const hasAnyData = last8WeeksHistory.length > 0;

    const skillStats = activeSkills.map(skill => {
        // Check safely for scores existence to prevent crash on bad data
        const relevantScores = last8WeeksHistory
            .filter(h => h.scores && typeof h.scores[skill.id] === 'number')
            .map(h => h.scores[skill.id] as number);

        if (relevantScores.length === 0) {
            return { name: skill.name, average: 0, trend: '➡️', hasData: false, trendReason: 'No data recorded' };
        }

        const average = relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length;
        
        // Trend calculation logic
        let trend = '➡️';
        let trendReason = 'Stable';
        
        if (relevantScores.length >= 2) {
            // Split history into two halves
            const mid = Math.ceil(relevantScores.length / 2);
            const pastHalf = relevantScores.slice(0, relevantScores.length - mid); // Older
            const recentHalf = relevantScores.slice(relevantScores.length - mid);  // Newer
            
            const pastAvg = pastHalf.length ? pastHalf.reduce((a, b) => a + b, 0) / pastHalf.length : 0;
            const recentAvg = recentHalf.length ? recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length : 0;
            
            if (recentAvg > pastAvg + 0.1) {
                trend = '⬆️';
                trendReason = `Improving: Recent avg (${recentAvg.toFixed(1)}) > Past avg (${pastAvg.toFixed(1)})`;
            } else if (recentAvg < pastAvg - 0.1) {
                trend = '⬇️';
                trendReason = `Declining: Recent avg (${recentAvg.toFixed(1)}) < Past avg (${pastAvg.toFixed(1)})`;
            } else {
                 trendReason = `Stable: Recent avg (${recentAvg.toFixed(1)}) ≈ Past avg (${pastAvg.toFixed(1)})`;
            }
        } else {
             trendReason = "Not enough data (need at least 2 classes) to calculate trend.";
        }

        return { name: skill.name, average, trend, hasData: true, trendReason };
    });

    return (
         <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg text-white">Performance History (Last 8 Weeks)</h3>
                <div className="flex space-x-3 text-xs">
                    <span className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>Exc. (2)</span>
                    <span className="flex items-center"><div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>Good (1)</span>
                    <span className="flex items-center"><div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>Imp. (0)</span>
                </div>
            </div>
            
            {!hasAnyData ? (
                 <div className="py-8 text-center text-gray-500 italic">
                    {lastPromotionDate 
                        ? "No class data recorded since last promotion." 
                        : "No class data recorded yet."}
                </div>
            ) : (
                <div className="space-y-4">
                    {skillStats.map(skill => {
                        const barPercent = (skill.average / 2) * 100;
                        let barColor = 'bg-red-500';
                        if (skill.average >= 1.5) barColor = 'bg-green-500';
                        else if (skill.average >= 0.5) barColor = 'bg-yellow-500';
                        
                        return (
                            <div key={skill.name} className="flex items-center space-x-3">
                                <span className="w-24 text-sm font-medium text-gray-300 truncate" title={skill.name}>{skill.name}</span>
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-1 text-gray-400">
                                    <span>{skill.hasData ? `${skill.average.toFixed(1)} avg` : 'No data'}</span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                                        <div 
                                            className={`${barColor} h-2.5 rounded-full transition-all duration-500`} 
                                            style={{ width: `${skill.hasData ? barPercent : 0}%`}}
                                        ></div>
                                    </div>
                                </div>
                                <span className="w-6 text-center text-lg cursor-help" title={skill.trendReason}>{skill.trend}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

const RivalsEngagement: React.FC<{ student: Student }> = ({ student }) => {
    const stats = student.rivalsStats;
    
    if (!stats || stats.xp === 0) {
        return (
            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg text-white">Home Practice (Dojang Rivals)</h3>
                    <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">No Activity Yet</span>
                </div>
                <p className="text-sm text-gray-500 text-center py-4">
                    This student hasn't participated in Dojang Rivals challenges yet.
                </p>
            </div>
        );
    }
    
    const getEngagementLevel = (xp: number) => {
        if (xp >= 5000) return { level: 'Champion', color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: '🏆' };
        if (xp >= 2000) return { level: 'Warrior', color: 'text-purple-400', bg: 'bg-purple-500/20', icon: '⚔️' };
        if (xp >= 1000) return { level: 'Rising Star', color: 'text-cyan-400', bg: 'bg-cyan-500/20', icon: '⭐' };
        if (xp >= 500) return { level: 'Active', color: 'text-green-400', bg: 'bg-green-500/20', icon: '🔥' };
        return { level: 'Getting Started', color: 'text-gray-400', bg: 'bg-gray-500/20', icon: '🌱' };
    };
    
    const engagement = getEngagementLevel(stats.xp);
    const winRate = stats.wins + stats.losses > 0 
        ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100) 
        : 0;
    
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg text-white">Home Practice (Dojang Rivals)</h3>
                <span className={`text-sm ${engagement.bg} ${engagement.color} px-3 py-1 rounded-full font-medium`}>
                    {engagement.icon} {engagement.level}
                </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-cyan-400">{stats.xp.toLocaleString()}</div>
                    <div className="text-xs text-gray-400">Total XP</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
                    <div className="text-xs text-gray-400">Wins</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-orange-400">{stats.dailyStreak}</div>
                    <div className="text-xs text-gray-400">Day Streak</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">{winRate}%</div>
                    <div className="text-xs text-gray-400">Win Rate</div>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-gray-400">Team Battles:</span>
                    <span className="text-white ml-1 font-medium">{stats.teamBattlesWon}</span>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-gray-400">Family Challenges:</span>
                    <span className="text-white ml-1 font-medium">{stats.familyChallengesCompleted}</span>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-gray-400">Mystery Box:</span>
                    <span className="text-white ml-1 font-medium">{stats.mysteryBoxCompleted}</span>
                </div>
            </div>
            
            {stats.lastChallengeDate && (
                <div className="mt-3 text-xs text-gray-500 text-center">
                    Last active: {new Date(stats.lastChallengeDate).toLocaleDateString()}
                </div>
            )}
        </div>
    );
};

const FeedbackLog: React.FC<{ history: FeedbackRecord[] }> = ({ history }) => (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
        <h3 className="font-semibold text-lg text-white mb-3">Feedback & Notes Log</h3>
        <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
            {history.length > 0 ? [...history].reverse().map((entry, index) => (
                <div key={index} className="text-sm">
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-gray-300">{new Date(entry.date).toLocaleDateString()}</span>
                        <span className="text-xs text-gray-500 flex items-center">
                            {entry.isAIGenerated && <span className="mr-1 text-indigo-400">✨</span>}
                            by {entry.coachName}
                        </span>
                    </div>
                    <p className="bg-gray-800 p-2 rounded-md text-gray-300 italic">"{entry.text}"</p>
                </div>
            )) : <p className="text-sm text-gray-500 text-center">No feedback has been recorded yet.</p>}
        </div>
    </div>
);


// --- MAIN EXPORTED COMPONENT ---

export const StudentProfile: React.FC<StudentProfileProps> = ({ student, data, onUpdateStudent, onClose }) => {
    return (
        <Modal onClose={onClose} title={`${student.name}'s Profile`} size="4xl">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <BasicInfo student={student} belts={data.belts} rules={data} onUpdate={onUpdateStudent} />
                </div>
                <div className="lg:col-span-2 space-y-6">
                    <PerformanceSummary student={student} rules={data} />
                    <RivalsEngagement student={student} />
                    <PerformanceHistoryGraph 
                        history={student.performanceHistory || []} 
                        skills={data.skills} 
                        lastPromotionDate={student.lastPromotionDate}
                    />
                    <FeedbackLog history={student.feedbackHistory || []} />
                </div>
            </div>
        </Modal>
    );
};
