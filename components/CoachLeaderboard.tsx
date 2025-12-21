import React, { useState, useEffect } from 'react';
import type { Student, WizardData } from '../types';

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

interface LeaderboardEntry {
    id: string;
    name: string;
    belt: string;
    stripes: number;
    totalXP: number;
    monthlyXP: number;
    rank: number;
    displayXP: number;
}

interface CoachLeaderboardProps {
    students: Student[];
    data: WizardData;
}

export const CoachLeaderboard: React.FC<CoachLeaderboardProps> = ({ students, data }) => {
    const [leaderboardMode, setLeaderboardMode] = useState<'monthly' | 'alltime'>('monthly');
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingStudentHistory, setViewingStudentHistory] = useState<{
        student: Student | null;
        history: ChallengeHistoryEntry[];
        loading: boolean;
    }>({ student: null, history: [], loading: false });

    // Fetch fresh leaderboard data from API
    useEffect(() => {
        const fetchLeaderboard = async () => {
            const clubId = localStorage.getItem('taekup_club_id') || sessionStorage.getItem('impersonate_clubId');
            if (!clubId) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/leaderboard?clubId=${clubId}`);
                const result = await response.json();
                if (result.leaderboard) {
                    setLeaderboardData(result.leaderboard.map((s: any) => ({
                        ...s,
                        displayXP: leaderboardMode === 'monthly' ? s.monthlyXP : s.totalXP
                    })));
                }
            } catch (error) {
                console.error('[Leaderboard] Failed to fetch:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [leaderboardMode]);

    // Sort and assign ranks based on current mode
    const leaderboard = [...leaderboardData]
        .map(s => ({
            ...s,
            displayXP: leaderboardMode === 'monthly' ? s.monthlyXP : s.totalXP
        }))
        .sort((a, b) => b.displayXP - a.displayXP)
        .map((s, i) => ({ ...s, rank: i + 1 }));

    const fetchStudentHistory = async (entry: LeaderboardEntry) => {
        // Convert LeaderboardEntry to minimal Student-like object for display
        const studentForDisplay = { id: entry.id, name: entry.name, belt: entry.belt } as any;
        setViewingStudentHistory({ student: studentForDisplay, history: [], loading: true });
        try {
            const response = await fetch(`/api/challenges/history?studentId=${entry.id}`);
            const result = await response.json();
            setViewingStudentHistory({
                student: studentForDisplay,
                history: result.history || [],
                loading: false
            });
        } catch (error) {
            console.error('[History] Failed to fetch student history:', error);
            setViewingStudentHistory(prev => ({ ...prev, loading: false }));
        }
    };

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
                                        {player.belt || 'Student'} • Click to view history
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
                                    <div className="text-5xl animate-spin mb-4">⏳</div>
                                    <p className="text-gray-400">Loading history...</p>
                                </div>
                            ) : viewingStudentHistory.history.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="text-5xl mb-4">🥋</div>
                                    <p className="text-gray-400">No challenge history yet</p>
                                    <p className="text-gray-500 text-sm mt-2">This student hasn't completed any challenges.</p>
                                </div>
                            ) : (
                                viewingStudentHistory.history.map(entry => {
                                    const date = new Date(entry.completedAt);
                                    const dateDisplay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                    
                                    const statusConfig: Record<string, { badge: string; color: string; bg: string }> = {
                                        'PENDING': { badge: '🟡 In Review', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-500/30' },
                                        'VERIFIED': { badge: '🟢 Verified', color: 'text-green-400', bg: 'bg-green-900/20 border-green-500/30' },
                                        'COMPLETED': { badge: '✅ Completed', color: 'text-green-400', bg: 'bg-gray-800 border-gray-600' },
                                    };
                                    const config = statusConfig[entry.status] || statusConfig['COMPLETED'];
                                    
                                    return (
                                        <div 
                                            key={entry.id} 
                                            className={`flex items-center justify-between p-4 rounded-xl border ${config.bg}`}
                                        >
                                            <div className="flex items-center">
                                                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl mr-4">
                                                    {entry.icon || '⚡'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-white">{entry.challengeName}</p>
                                                    <p className="text-sm text-gray-400">
                                                        {entry.category} • {dateDisplay} • {entry.proofType === 'VIDEO' ? '📹 Video' : '✓ Trust'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold text-sm ${config.color}`}>{config.badge}</p>
                                                <p className="text-sm text-yellow-500 font-bold">+{entry.xpAwarded} XP</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
