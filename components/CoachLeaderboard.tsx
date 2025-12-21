import React, { useMemo } from 'react';
import type { Student, Belt } from '../types';

interface CoachLeaderboardProps {
    students: Student[];
    belts: Belt[];
}

export const CoachLeaderboard: React.FC<CoachLeaderboardProps> = ({ students, belts }) => {
    const getBelt = (beltId: string) => belts.find(b => b.id === beltId);

    const rankedStudents = useMemo(() => {
        return [...students]
            .map(s => ({
                ...s,
                totalXP: s.totalXP || 0,
                rivalsXP: s.rivalsStats?.xp || 0,
                classXP: (s.totalXP || 0) - (s.rivalsStats?.xp || 0)
            }))
            .sort((a, b) => b.totalXP - a.totalXP);
    }, [students]);

    const getRankDisplay = (rank: number) => {
        if (rank === 1) return { icon: '🥇', bg: 'bg-gradient-to-r from-yellow-600/30 to-yellow-500/20', border: 'border-yellow-500/50' };
        if (rank === 2) return { icon: '🥈', bg: 'bg-gradient-to-r from-gray-400/20 to-gray-300/10', border: 'border-gray-400/50' };
        if (rank === 3) return { icon: '🥉', bg: 'bg-gradient-to-r from-orange-700/20 to-orange-600/10', border: 'border-orange-600/50' };
        return { icon: `#${rank}`, bg: 'bg-gray-800', border: 'border-gray-700' };
    };

    const getBeltDisplay = (student: Student) => {
        const belt = getBelt(student.beltId);
        return (
            <div className="flex items-center gap-2">
                <div 
                    className="w-6 h-3 rounded-sm border border-white/20"
                    style={{ 
                        background: belt?.color2 
                            ? `linear-gradient(to right, ${belt.color1} 50%, ${belt.color2} 50%)` 
                            : belt?.color1 || '#666'
                    }}
                />
                <span className="text-sm text-gray-300">{belt?.name || student.beltId}</span>
                {(student.stripes || 0) > 0 && (
                    <span className="text-xs text-yellow-400">{'⭐'.repeat(student.stripes || 0)}</span>
                )}
            </div>
        );
    };

    const totalXP = rankedStudents.reduce((sum, s) => sum + s.totalXP, 0);
    const avgXp = rankedStudents.length > 0 ? Math.round(totalXP / rankedStudents.length) : 0;
    const activeStudents = rankedStudents.filter(s => s.totalXP > 0).length;

    return (
        <div className="p-6 min-h-[500px] bg-gray-900">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/30 rounded-xl p-4 border border-cyan-500/30">
                        <p className="text-cyan-400 text-sm font-medium">Total Students</p>
                        <p className="text-3xl font-black text-white">{students.length}</p>
                        <p className="text-xs text-gray-500">{activeStudents} active (have XP)</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-900/40 to-emerald-900/30 rounded-xl p-4 border border-green-500/30">
                        <p className="text-green-400 text-sm font-medium">Average XP</p>
                        <p className="text-3xl font-black text-white">{avgXp.toLocaleString()}</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-900/40 to-indigo-900/30 rounded-xl p-4 border border-purple-500/30">
                        <p className="text-purple-400 text-sm font-medium">Total Club XP</p>
                        <p className="text-3xl font-black text-white">{totalXP.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            🏆 Student XP Rankings
                        </h3>
                        <p className="text-sm text-gray-400">Track student engagement and practice</p>
                    </div>

                    <div className="divide-y divide-gray-700/50">
                        {rankedStudents.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                No students found.
                            </div>
                        ) : (
                            rankedStudents.map((student, index) => {
                                const rank = index + 1;
                                const { icon, bg, border } = getRankDisplay(rank);
                                const isTopThree = rank <= 3;

                                return (
                                    <div 
                                        key={student.id}
                                        className={`px-4 py-3 flex items-center gap-4 transition-colors hover:bg-gray-700/30 ${bg} border-l-4 ${border}`}
                                    >
                                        <div className={`w-10 h-10 flex items-center justify-center rounded-full ${isTopThree ? 'text-2xl' : 'bg-gray-700 text-gray-400 font-bold text-sm'}`}>
                                            {icon}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-semibold truncate">{student.name}</p>
                                            {getBeltDisplay(student)}
                                        </div>

                                        <div className="text-right">
                                            <p className="text-xl font-black text-cyan-400">{student.totalXP.toLocaleString()} XP</p>
                                            <div className="flex items-center justify-end gap-3 text-xs">
                                                <span className="text-sky-400" title="Class XP">🥋 {student.classXP.toLocaleString()}</span>
                                                <span className="text-orange-400" title="Rivals XP">🔥 {student.rivalsXP.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
                    <h4 className="text-sm font-bold text-gray-400 mb-3">Legend</h4>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">🥋 <span className="text-sky-400">Class XP</span> - Earned during classes</span>
                        <span className="flex items-center gap-1">🔥 <span className="text-orange-400">Rivals XP</span> - Earned from Dojang Rivals</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
