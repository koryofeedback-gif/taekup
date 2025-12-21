import React, { useState, useEffect } from 'react';
import type { Student, WizardData } from '../types';
import { calculateClassXP } from '../services/gamificationService';

interface ChallengeHistoryEntry {
    id: string;
    challengeId: string;
    challengeName: string;
    category: string;
    icon?: string;
    xpAwarded: number;
    status: string;
    proofType: string;
    completedAt: string;
}

interface CoachLeaderboardProps {
    students: Student[];
    data: WizardData;
    clubId?: string;
}

export const CoachLeaderboard: React.FC<CoachLeaderboardProps> = ({ students, data, clubId }) => {
    const [leaderboardMode, setLeaderboardMode] = useState<'monthly' | 'alltime'>('monthly');
    const [freshXPData, setFreshXPData] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [viewingStudentHistory, setViewingStudentHistory] = useState<{
        student: Student | null;
        history: ChallengeHistoryEntry[];
        loading: boolean;
    }>({ student: null, history: [], loading: false });

    // Fetch fresh XP data from database on mount
    useEffect(() => {
        const fetchFreshXP = async () => {
            setLoading(true);
            try {
                // Fetch fresh rival stats for all students
                const xpMap: Record<string, number> = {};
                
                // Fetch each student's challenge history to get total XP
                await Promise.all(students.map(async (student) => {
                    try {
                        const response = await fetch(`/api/challenges/history?studentId=${student.id}`);
                        const result = await response.json();
                        const history = result.history || [];
                        // Sum all XP from verified challenges
                        const totalXP = history
                            .filter((h: ChallengeHistoryEntry) => h.status === 'VERIFIED' || h.status === 'APPROVED')
                            .reduce((sum: number, h: ChallengeHistoryEntry) => sum + (h.xpAwarded || 0), 0);
                        xpMap[student.id] = totalXP;
                    } catch (err) {
                        // Fallback to stored XP
                        xpMap[student.id] = student.rivalsStats?.xp || student.totalXP || student.lifetimeXp || 0;
                    }
                }));
                
                console.log('[CoachLeaderboard] Fresh XP data:', xpMap);
                setFreshXPData(xpMap);
            } catch (error) {
                console.error('[CoachLeaderboard] Failed to fetch fresh XP:', error);
            } finally {
                setLoading(false);
            }
        };
        
        if (students.length > 0) {
            fetchFreshXP();
        } else {
            setLoading(false);
        }
    }, [students]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate Monthly XP leaderboard (XP earned this month from performance history)
    const monthlyLeaderboard = students
        .map(s => {
            const monthlyXP = (s.performanceHistory || [])
                .filter(record => new Date(record.date) >= monthStart)
                .reduce((sum, record) => {
                    const scores = Object.values(record.scores || {});
                    const classXP = calculateClassXP(scores);
                    return sum + classXP + (record.bonusPoints || 0);
                }, 0);
            return { ...s, displayXP: monthlyXP };
        })
        .sort((a, b) => b.displayXP - a.displayXP)
        .map((s, i) => ({ ...s, rank: i + 1 }));

    // Calculate All-Time XP leaderboard using fresh data from database
    const allTimeLeaderboard = students
        .map(s => ({
            ...s,
            // Use freshly fetched XP if available, otherwise fallback to stored values
            displayXP: freshXPData[s.id] !== undefined 
                ? freshXPData[s.id] 
                : (s.rivalsStats?.xp || s.totalXP || s.lifetimeXp || 0)
        }))
        .sort((a, b) => b.displayXP - a.displayXP)
        .map((s, i) => ({ ...s, rank: i + 1 }));

    // Select which leaderboard to display
    const leaderboard = leaderboardMode === 'monthly' ? monthlyLeaderboard : allTimeLeaderboard;

    const fetchStudentHistory = async (targetStudent: Student) => {
        setViewingStudentHistory({ student: targetStudent, history: [], loading: true });
        try {
            const response = await fetch(`/api/challenges/history?studentId=${targetStudent.id}`);
            const result = await response.json();
            setViewingStudentHistory({
                student: targetStudent,
                history: result.history || [],
                loading: false
            });
        } catch (error) {
            console.error('[History] Failed to fetch student history:', error);
            setViewingStudentHistory(prev => ({ ...prev, loading: false }));
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-center py-16">
                    <div className="text-5xl animate-bounce mb-4">🏆</div>
                    <p className="text-gray-400">Loading leaderboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 p-6 rounded-xl border border-purple-500/30 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <span className="text-3xl">🏆</span> Dojang Leaderboard
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">Click on any student to view their challenge history</p>
                    </div>
                    <div className="flex">
                        <button 
                            onClick={() => setLeaderboardMode('monthly')}
                            className={`px-4 py-2 rounded-l-lg font-bold transition-all ${
                                leaderboardMode === 'monthly' 
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                        >This Month</button>
                        <button 
                            onClick={() => setLeaderboardMode('alltime')}
                            className={`px-4 py-2 rounded-r-lg font-bold transition-all ${
                                leaderboardMode === 'alltime' 
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                        >All-Time</button>
                    </div>
                </div>
                <p className="text-xs text-gray-400">
                    {leaderboardMode === 'monthly' 
                        ? 'XP earned this month - fresh competition!' 
                        : 'Lifetime XP - legends of the dojo'}
                </p>
            </div>

            <div className="space-y-3">
                {leaderboard.filter(p => p.displayXP > 0).length === 0 ? (
                    <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
                        <div className="text-5xl mb-3">🥋</div>
                        <p className="text-gray-400">
                            {leaderboardMode === 'monthly' 
                                ? 'No XP earned this month yet.' 
                                : 'No XP recorded yet.'}
                        </p>
                        <p className="text-gray-500 text-sm mt-1">Students will appear here once they earn XP!</p>
                    </div>
                ) : (
                    leaderboard.filter(p => p.displayXP > 0).map((player) => (
                        <div 
                            key={player.id} 
                            className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.01] bg-gray-800 border-gray-700 hover:border-purple-500/50 hover:bg-gray-800/80`}
                            onClick={() => fetchStudentHistory(player)}
                        >
                            <div className="flex items-center">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-lg mr-4 ${
                                    player.rank === 1 ? 'bg-yellow-500 text-black' :
                                    player.rank === 2 ? 'bg-gray-400 text-black' :
                                    player.rank === 3 ? 'bg-orange-600 text-white' :
                                    'bg-gray-700 text-gray-400'
                                }`}>
                                    {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : player.rank}
                                </div>
                                <div>
                                    <p className="font-bold text-white text-lg">{player.name}</p>
                                    <p className="text-sm text-gray-500">
                                        {data.belts.find(b => b.id === player.beltId)?.name || 'Student'} • Click to view history
                                    </p>
                                </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                                <div>
                                    <p className="font-bold text-purple-400 text-xl">{player.displayXP.toLocaleString()} XP</p>
                                    <p className="text-xs text-gray-500">{leaderboardMode === 'monthly' ? 'This Month' : 'All Time'}</p>
                                </div>
                                <span className="text-gray-500 text-xl">→</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {viewingStudentHistory.student && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewingStudentHistory({ student: null, history: [], loading: false })}>
                    <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 p-5 border-b border-gray-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <span>📜</span> {viewingStudentHistory.student.name}'s History
                                    </h3>
                                    <p className="text-sm text-gray-400">Challenge submissions and achievements</p>
                                </div>
                                <button 
                                    onClick={() => setViewingStudentHistory({ student: null, history: [], loading: false })}
                                    className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors text-lg"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3">
                            {viewingStudentHistory.loading ? (
                                <div className="text-center py-16">
                                    <div className="text-4xl animate-bounce mb-4">⏳</div>
                                    <p className="text-gray-400">Loading challenge history...</p>
                                </div>
                            ) : viewingStudentHistory.history.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="text-5xl mb-4">🥋</div>
                                    <p className="text-gray-400 font-medium">No challenges completed yet</p>
                                    <p className="text-gray-500 text-sm mt-2">This student hasn't submitted any challenges</p>
                                </div>
                            ) : (
                                viewingStudentHistory.history.map((entry, idx) => (
                                    <div key={entry.id || idx} className="bg-gray-800/70 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="text-2xl">{entry.icon || '🏆'}</div>
                                                <div>
                                                    <p className="font-bold text-white">{entry.challengeName}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                            entry.category === 'Power' ? 'bg-red-900/50 text-red-300' :
                                                            entry.category === 'Technique' ? 'bg-blue-900/50 text-blue-300' :
                                                            entry.category === 'Flexibility' ? 'bg-purple-900/50 text-purple-300' :
                                                            'bg-gray-700 text-gray-300'
                                                        }`}>
                                                            {entry.category}
                                                        </span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                            entry.status === 'VERIFIED' ? 'bg-green-900/50 text-green-300' :
                                                            entry.status === 'PENDING' ? 'bg-yellow-900/50 text-yellow-300' :
                                                            entry.status === 'REJECTED' ? 'bg-red-900/50 text-red-300' :
                                                            'bg-cyan-900/50 text-cyan-300'
                                                        }`}>
                                                            {entry.status}
                                                        </span>
                                                        <span className="text-xs text-gray-500">{entry.proofType}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-green-400">+{entry.xpAwarded} XP</p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {new Date(entry.completedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
