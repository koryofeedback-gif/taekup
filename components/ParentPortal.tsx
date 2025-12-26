import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Student, WizardData, PerformanceRecord, Belt, Habit, ChallengeCategory, RivalsStats, HolidayScheduleType } from '../types';
import { calculateClassXP } from '../services/gamificationService';
import { HOLIDAY_PRESETS } from '../types';
import { BeltIcon, CalendarIcon } from './icons/FeatureIcons';
import { generateParentingAdvice } from '../services/geminiService';
import { LANGUAGES } from '../constants';
import { useChallengeRealtime } from '../hooks/useChallengeRealtime';
import { ChallengeToast } from './ChallengeToast';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { useStudentProgress } from '../hooks/useStudentProgress';
import SparkMD5 from 'spark-md5';

const calculateVideoHash = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const chunkSize = 2097152; // 2MB chunks
        const chunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;
        const spark = new SparkMD5.ArrayBuffer();
        const fileReader = new FileReader();

        fileReader.onload = (e) => {
            spark.append(e.target?.result as ArrayBuffer);
            currentChunk++;
            if (currentChunk < chunks) {
                loadNext();
            } else {
                resolve(spark.end());
            }
        };

        fileReader.onerror = () => reject(new Error('Failed to read video file'));

        const loadNext = () => {
            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            fileReader.readAsArrayBuffer(file.slice(start, end));
        };

        loadNext();
    });
};

interface ParentPortalProps {
    student: Student;
    data: WizardData;
    onBack: () => void;
    onUpdateStudent?: (student: Student) => void;
}

// Helper to get belt info
const getBelt = (beltId: string, belts: Belt[]) => belts.find(b => b.id === beltId);

export const ParentPortal: React.FC<ParentPortalProps> = ({ student, data, onBack, onUpdateStudent }) => {
    const [activeTab, setActiveTab] = useState<'home' | 'journey' | 'insights' | 'practice' | 'booking' | 'card' | 'home-dojo' | 'rivals'>('home');
    const [isPremium, setIsPremium] = useState(false); // Toggle to simulate upgrade
    const [missionChecks, setMissionChecks] = useState<Record<string, boolean>>({});
    const [parentingAdvice, setParentingAdvice] = useState<string | null>(null);
    const [isGeneratingAdvice, setIsGeneratingAdvice] = useState(false);
    const [language, setLanguage] = useState(data.language || 'English');
    const [bookedSlots, setBookedSlots] = useState<Record<string, boolean>>({}); // Simulating bookings
    
    // Fresh leaderboard data from API
    const [apiLeaderboardData, setApiLeaderboardData] = useState<Array<{id: string; name: string; totalXP: number; monthlyXP: number; belt?: string; stripes?: number}>>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [serverTotalXP, setServerTotalXP] = useState<number>(0);
    
    // One-time cleanup of stale localStorage cache on mount
    useEffect(() => {
        try {
            const keysToRemove: string[] = [];
            const today = new Date().toISOString().split('T')[0];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('rivals-season-')) {
                    keysToRemove.push(key);
                }
                // Also clean up old arena cache entries (not from today)
                if (key && key.startsWith('arena-') && !key.endsWith(today)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => {
                console.log('[Cleanup] Removing stale localStorage key:', key);
                localStorage.removeItem(key);
            });
        } catch (err) {
            console.error('[Cleanup] Failed to clear localStorage:', err);
        }
    }, []);
    
    // Fetch fresh leaderboard data from API
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (!student.clubId) return;
            setLeaderboardLoading(true);
            try {
                const response = await fetch(`/api/leaderboard?clubId=${student.clubId}`);
                const result = await response.json();
                if (result.leaderboard) {
                    setApiLeaderboardData(result.leaderboard);
                    console.log('[Leaderboard] Fetched fresh data from API:', result.leaderboard.length, 'students');
                }
            } catch (err) {
                console.error('[Leaderboard] Failed to fetch:', err);
            } finally {
                setLeaderboardLoading(false);
            }
        };
        fetchLeaderboard();
        // Refresh every 30 seconds
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, [student.clubId]);
    
    // Fetch total XP directly from server as single source of truth
    useEffect(() => {
        const fetchServerXP = async () => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!student.id || !uuidRegex.test(student.id)) return;
            try {
                const response = await fetch(`/api/habits/status?studentId=${student.id}`);
                const result = await response.json();
                if (typeof result.totalXp === 'number') {
                    setServerTotalXP(result.totalXp);
                    console.log('[ServerXP] Fetched total XP:', result.totalXp);
                }
            } catch (err) {
                console.error('[ServerXP] Failed to fetch:', err);
            }
        };
        fetchServerXP();
        // Refresh every 10 seconds
        const interval = setInterval(fetchServerXP, 10000);
        return () => clearInterval(interval);
    }, [student.id]);
    
    // Rivals State
    const [selectedRival, setSelectedRival] = useState<string>('');
    const [challengeResult, setChallengeResult] = useState<'pending' | 'win' | 'loss' | null>(null);
    const [isSimulatingChallenge, setIsSimulatingChallenge] = useState(false);
    const [selectedChallenge, setSelectedChallenge] = useState<string>('');
    const [rivalsView, setRivalsView] = useState<'arena' | 'leaderboard' | 'weekly' | 'inbox' | 'teams' | 'family' | 'mystery'>('arena');
    const [leaderboardMode, setLeaderboardMode] = useState<'monthly' | 'alltime'>('monthly');
    const [challengeHistory, setChallengeHistory] = useState<Array<{
        id: string;
        challengeName: string;
        icon: string;
        category: string;
        status: string;
        proofType: string;
        xpAwarded: number;
        score: number;
        mode: string;
        completedAt: string;
    }>>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [viewingStudentHistory, setViewingStudentHistory] = useState<{
        student: Student | null;
        history: Array<{
            id: string;
            challengeName: string;
            icon: string;
            category: string;
            status: string;
            proofType: string;
            xpAwarded: number;
            completedAt: string;
        }>;
        loading: boolean;
    }>({ student: null, history: [], loading: false });
    const [rivalStats, setRivalStats] = useState(() => {
        // Initialize from student's saved stats or use defaults
        if (student.rivalsStats) {
            return {
                wins: student.rivalsStats.wins,
                losses: student.rivalsStats.losses,
                streak: student.rivalsStats.streak,
                xp: student.rivalsStats.xp
            };
        }
        return { wins: 0, losses: 0, streak: 0, xp: 0 };
    });
    
    // Track additional rivals stats
    const [teamBattlesWon, setTeamBattlesWon] = useState(student.rivalsStats?.teamBattlesWon || 0);
    const [familyChallengesCompleted, setFamilyChallengesCompleted] = useState(student.rivalsStats?.familyChallengesCompleted || 0);
    const [mysteryBoxCompleted, setMysteryBoxCompletedCount] = useState(student.rivalsStats?.mysteryBoxCompleted || 0);
    
    // Warrior's Gauntlet State
    const [gauntletData, setGauntletData] = useState<{
        dayOfWeek: string;
        dayTheme: string;
        weekNumber: number;
        challenges: Array<{
            id: string;
            name: string;
            description: string;
            icon: string;
            score_type: string;
            sort_order: string;
            target_value: number | null;
            demo_video_url: string | null;
            personalBest: number | null;
            pbHasVideo: boolean;
            submittedThisWeek: boolean;
            thisWeekScore: number | null;
        }>;
    } | null>(null);
    const [gauntletLoading, setGauntletLoading] = useState(false);
    const [selectedGauntletChallenge, setSelectedGauntletChallenge] = useState<string | null>(null);
    const [gauntletScore, setGauntletScore] = useState('');
    const [gauntletSubmitting, setGauntletSubmitting] = useState(false);
    const gauntletSubmitRef = useRef(false); // Prevent double-click race condition
    const [gauntletResult, setGauntletResult] = useState<{
        success: boolean;
        message: string;
        xp: number;
        pendingXp?: number;
        isNewPB: boolean;
        pendingVerification?: boolean;
    } | null>(null);
    
    // Team Battle State
    const [myTeam, setMyTeam] = useState<string[]>([]);
    const [selectedTeammates, setSelectedTeammates] = useState<string[]>([]);
    const [teamBattleMode, setTeamBattleMode] = useState(false);
    
    // Parent-Child Challenge State
    const [familyChallengeMode, setFamilyChallengeMode] = useState(false);
    const [parentScore, setParentScore] = useState<string>('');
    const [activeFamilyChallenge, setActiveFamilyChallenge] = useState<string | null>(null);
    const [familyResult, setFamilyResult] = useState<{ show: boolean; won: boolean; xp: number; challengeName: string } | null>(null);
    
    // Daily limit for family challenges - prevent XP farming (now backed by database)
    const [completedFamilyToday, setCompletedFamilyToday] = useState<string[]>([]);
    const [familyChallengeSubmitting, setFamilyChallengeSubmitting] = useState(false);
    
    // Fetch family challenge status from backend on load
    useEffect(() => {
        const fetchFamilyChallengeStatus = async () => {
            if (!student.id) return;
            
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(student.id)) return;
            
            try {
                const response = await fetch(`/api/family-challenges/status?studentId=${student.id}`);
                const data = await response.json();
                if (data.completedChallenges) {
                    setCompletedFamilyToday(data.completedChallenges);
                }
            } catch (error) {
                console.error('[FamilyChallenge] Failed to fetch status:', error);
            }
        };
        
        fetchFamilyChallengeStatus();
    }, [student.id]);
    
    // Submit family challenge to backend (XP calculated server-side)
    const submitFamilyChallenge = async (challengeId: string, won: boolean) => {
        if (!student.id) return { success: false };
        
        setFamilyChallengeSubmitting(true);
        try {
            const response = await fetch('/api/family-challenges/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: student.id,
                    challengeId,
                    won  // XP is calculated server-side to prevent tampering
                })
            });
            
            const result = await response.json();
            
            if (result.alreadyCompleted) {
                setCompletedFamilyToday(prev => prev.includes(challengeId) ? prev : [...prev, challengeId]);
                return { success: false, alreadyCompleted: true };
            }
            
            if (result.success) {
                setCompletedFamilyToday(prev => [...prev, challengeId]);
                // Update serverTotalXP immediately for header display
                if (typeof result.newTotalXp === 'number') {
                    setServerTotalXP(result.newTotalXp);
                    setRivalStats(prev => ({ ...prev, xp: result.newTotalXp }));
                    console.log('[FamilyChallenge] XP updated:', result.newTotalXp);
                }
                return { success: true, xpAwarded: result.xpAwarded, newTotalXp: result.newTotalXp };
            }
            
            return { success: false };
        } catch (error) {
            console.error('[FamilyChallenge] Submit error:', error);
            return { success: false };
        } finally {
            setFamilyChallengeSubmitting(false);
        }
    };
    
    // Check if a family challenge is already done today
    const isFamilyChallengeCompletedToday = (challengeId: string) => {
        return completedFamilyToday.includes(challengeId);
    };
    
    // Mystery Challenge State (AI-powered daily challenge)
    const [mysteryChallenge, setMysteryChallenge] = useState<{
        id: string; 
        title: string;
        description: string;
        type: 'quiz' | 'photo' | 'text';
        xpReward: number;
        quizData?: {
            question: string;
            options: string[];
            correctIndex: number;
            explanation: string;
        };
    } | null>(null);
    const [mysteryCompleted, setMysteryCompleted] = useState(false);
    const [mysteryCompletionMessage, setMysteryCompletionMessage] = useState<string>('');
    const [mysteryXpAwarded, setMysteryXpAwarded] = useState<number>(0);
    const [mysteryWasCorrect, setMysteryWasCorrect] = useState<boolean>(false);
    const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<number | null>(null);
    const [quizExplanation, setQuizExplanation] = useState<string>('');
    const [loadingMysteryChallenge, setLoadingMysteryChallenge] = useState(true);
    const [submittingMystery, setSubmittingMystery] = useState(false);
    const [mysterySource, setMysterySource] = useState<'api' | 'static' | null>(null);
    
    // Daily Streak
    const [dailyStreak, setDailyStreak] = useState(student.rivalsStats?.dailyStreak || 0);
    const [lastChallengeDate, setLastChallengeDate] = useState<string>(student.rivalsStats?.lastChallengeDate || new Date().toISOString().split('T')[0]);
    
    // Video Upload State (Premium Feature)
    const [showVideoUpload, setShowVideoUpload] = useState(false);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUploadProgress, setVideoUploadProgress] = useState(0);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
    const [videoScore, setVideoScore] = useState<string>('');
    const [gauntletVideoMode, setGauntletVideoMode] = useState(false);
    const [myVideos, setMyVideos] = useState<Array<{
        id: string;
        challengeId: string;
        challengeName: string;
        videoUrl: string;
        status: 'pending' | 'approved' | 'rejected';
        score: number;
        voteCount: number;
        coachNotes?: string;
        createdAt: string;
    }>>([]);
    const videoInputRef = useRef<HTMLInputElement>(null);
    
    // Solo Arena State (Trust vs Verify flow)
    const [soloScore, setSoloScore] = useState<string>('');
    const [remainingTrustSubmissions, setRemainingTrustSubmissions] = useState(3);
    const [soloSubmitting, setSoloSubmitting] = useState(false);
    const soloSubmitRef = useRef(false); // Prevent double-click race condition
    const videoUploadRef = useRef(false); // Prevent double video upload
    const [soloResult, setSoloResult] = useState<{ success: boolean; message: string; xp: number } | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    
    // Daily completed challenges tracking (localStorage-based, STRICT 1x per day limit)
    const getTodayKey = useCallback(() => `arena-${student.id}-${new Date().toISOString().split('T')[0]}`, [student.id]);
    const [dailyCompletedChallenges, setDailyCompletedChallenges] = useState<Set<string>>(() => {
        try {
            const key = `arena-${student.id}-${new Date().toISOString().split('T')[0]}`;
            const saved = localStorage.getItem(key);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    
    const markChallengeCompleted = useCallback((challengeId: string) => {
        setDailyCompletedChallenges(prev => {
            const updated = new Set(prev);
            updated.add(challengeId);
            try {
                localStorage.setItem(getTodayKey(), JSON.stringify([...updated]));
            } catch {}
            return updated;
        });
    }, [getTodayKey]);
    
    const isChallengeCompletedToday = useCallback((challengeId: string) => 
        dailyCompletedChallenges.has(challengeId), [dailyCompletedChallenges]);
    
    // Use robust progress tracking hook for XP/completion
    const { 
        completedContentIds: localCompletedIds, 
        totalPoints: localTotalPoints, 
        xp: progressXp,
        completeContent,
        isCompleted: isContentCompleted
    } = useStudentProgress({ student, onUpdateStudent });
    
    // Sync rivals stats to student record whenever they change
    const syncRivalsStats = useCallback(async () => {
        if (!onUpdateStudent) return;
        
        const rivalsStatsToSync: RivalsStats = {
            xp: rivalStats.xp,
            wins: rivalStats.wins,
            losses: rivalStats.losses,
            streak: rivalStats.streak,
            dailyStreak: dailyStreak,
            lastChallengeDate: lastChallengeDate,
            teamBattlesWon: teamBattlesWon,
            familyChallengesCompleted: familyChallengesCompleted,
            mysteryBoxCompleted: mysteryBoxCompleted
        };
        
        const updatedStudent = {
            ...student,
            rivalsStats: rivalsStatsToSync,
            completedContentIds: localCompletedIds,
            totalPoints: localTotalPoints
        };
        
        onUpdateStudent(updatedStudent);
        
        // Also sync with database to get accurate XP from all sources
        try {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(student.id)) {
                const response = await fetch(`/api/students/${student.id}/sync-rivals`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        xp: rivalStats.xp,
                        wins: rivalStats.wins,
                        losses: rivalStats.losses,
                        streak: rivalStats.streak
                    })
                });
                const result = await response.json();
                if (result.success && typeof result.totalXp === 'number') {
                    // Update local state and shared state with database truth if different
                    if (result.totalXp !== rivalStats.xp) {
                        console.log(`[SyncRivals] Updated XP from ${rivalStats.xp} to ${result.totalXp} (database truth)`);
                        setRivalStats(prev => ({ ...prev, xp: result.totalXp }));
                        // Re-update shared student state with correct XP
                        onUpdateStudent({
                            ...student,
                            rivalsStats: { ...rivalsStatsToSync, xp: result.totalXp },
                            totalXP: result.totalXp,
                            completedContentIds: localCompletedIds,
                            totalPoints: localTotalPoints
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[SyncRivals] Failed to persist to database:', err);
        }
    }, [rivalStats, dailyStreak, lastChallengeDate, teamBattlesWon, familyChallengesCompleted, mysteryBoxCompleted, student, onUpdateStudent, localCompletedIds, localTotalPoints]);
    
    // Sync when non-curriculum stats change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            syncRivalsStats();
        }, 500);
        
        return () => clearTimeout(timeoutId);
    }, [rivalStats.wins, rivalStats.losses, rivalStats.streak, dailyStreak, lastChallengeDate, teamBattlesWon, familyChallengesCompleted, mysteryBoxCompleted]);
    
    // Get belt name from beltId for API call
    const studentBeltName = useMemo(() => {
        const belt = data.belts.find(b => b.id === student.beltId);
        return belt?.name || 'White';
    }, [data.belts, student.beltId]);
    
    // Fetch AI-powered Daily Mystery Challenge
    useEffect(() => {
        const fetchDailyChallenge = async () => {
            if (!studentBeltName || !student.id) return;
            
            // STRICT MODE: Require valid student ID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(student.id)) {
                console.warn('[MysteryChallenge] Invalid student ID, skipping fetch');
                return;
            }
            
            setLoadingMysteryChallenge(true);
            try {
                const params = new URLSearchParams({
                    studentId: student.id,
                    belt: studentBeltName,
                });
                
                const response = await fetch(`/api/daily-challenge?${params}`);
                const result = await response.json();
                
                if (result.completed) {
                    setMysteryCompleted(true);
                    setMysteryXpAwarded(result.xpAwarded || 0);
                    setMysteryWasCorrect(result.wasCorrect || false);
                    setMysteryCompletionMessage(result.message || 'Challenge already completed!');
                    setMysterySource('api');
                } else if (result.challenge) {
                    setMysteryChallenge(result.challenge);
                    setMysteryCompleted(false);
                    setMysterySource('api');
                    console.log('[MysteryChallenge] Loaded from API:', result.challenge.title);
                } else {
                    throw new Error('No challenge in response');
                }
            } catch (error) {
                console.error('[MysteryChallenge] Failed to fetch, using fallback:', error);
                
                // Before showing fallback, check if user already completed today via a quick status check
                try {
                    const statusCheck = await fetch(`/api/daily-challenge/status?studentId=${student.id}`);
                    const statusResult = await statusCheck.json();
                    if (statusResult.completed || statusResult.alreadyPlayed) {
                        console.log('[MysteryChallenge] User already played today (status check)');
                        setMysteryCompleted(true);
                        setMysteryXpAwarded(statusResult.xpAwarded || statusResult.previousXp || 50);
                        setMysteryWasCorrect(true);
                        setMysteryCompletionMessage('You already completed today\'s challenge!');
                        setMysterySource('api');
                        return; // Don't show fallback
                    }
                } catch (statusError) {
                    console.log('[MysteryChallenge] Status check failed, showing fallback');
                }
                
                // Static fallback question with DAILY unique ID (prevents duplicate submissions)
                const today = new Date().toISOString().split('T')[0];
                const fallbackChallenge = {
                    id: `fallback-${today}-${student.id.slice(0, 8)}`,
                    title: 'Martial Arts Trivia',
                    description: 'Test your knowledge while we reconnect!',
                    type: 'quiz' as const,
                    xpReward: 50,
                    isStaticFallback: true,
                    quizData: {
                        question: 'What is the traditional bow in martial arts called?',
                        options: ['Kyungye (경례)', 'Kick', 'Punch', 'Block'],
                        correctIndex: 0,
                        explanation: 'Kyungye (경례) means "bow" in Korean and is used to show respect in martial arts.'
                    }
                };
                setMysteryChallenge(fallbackChallenge);
                setMysteryCompleted(false);
                setMysterySource('static');
            } finally {
                setLoadingMysteryChallenge(false);
            }
        };
        
        fetchDailyChallenge();
    }, [student.id, studentBeltName]);
    
    // Fetch own student's history for badge calculations when viewing Rivals
    useEffect(() => {
        if (activeTab !== 'rivals' || !student.id) return;
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(student.id)) return;
        
        const fetchOwnHistory = async () => {
            try {
                const response = await fetch(`/api/challenges/history?studentId=${student.id}`);
                const data = await response.json();
                if (data.history) {
                    setChallengeHistory(data.history);
                }
            } catch (error) {
                console.error('[History] Failed to fetch own history:', error);
            }
        };
        
        fetchOwnHistory();
    }, [activeTab, student.id]);
    
    // Fetch student's history for leaderboard viewing
    const fetchStudentHistory = async (targetStudent: Student) => {
        setViewingStudentHistory({ student: targetStudent, history: [], loading: true });
        try {
            const response = await fetch(`/api/challenges/history?studentId=${targetStudent.id}`);
            const data = await response.json();
            setViewingStudentHistory({
                student: targetStudent,
                history: data.history || [],
                loading: false
            });
        } catch (error) {
            console.error('[History] Failed to fetch student history:', error);
            setViewingStudentHistory(prev => ({ ...prev, loading: false }));
        }
    };
    
    // Submit Mystery Challenge answer
    const submitMysteryChallenge = async (selectedIndex: number) => {
        if (!mysteryChallenge) return;
        
        // Prevent submission if already completed or currently submitting
        if (mysteryCompleted || submittingMystery) {
            console.log('[MysteryChallenge] Already completed or submitting, ignoring');
            return;
        }
        
        setSubmittingMystery(true);
        
        // Debug: Log current student data
        console.log('[MysteryChallenge] Submitting with:', {
            studentId: student.id,
            clubId: student.clubId || 'none (home user)',
            challengeId: mysteryChallenge.id,
            selectedIndex,
            isStaticFallback: (mysteryChallenge as any).isStaticFallback || false
        });
        
        // Only require student ID - clubId is optional for home users
        if (!student.id) {
            console.error('[MysteryChallenge] Missing student.id - student object:', student);
            setSubmittingMystery(false);
            return;
        }
        
        // Handle static fallback challenge locally (no backend call needed)
        if ((mysteryChallenge as any).isStaticFallback || mysterySource === 'static') {
            console.log('[MysteryChallenge] Handling static fallback locally');
            const quizData = mysteryChallenge.quizData;
            const isCorrect = selectedIndex === quizData?.correctIndex;
            const xpAwarded = isCorrect ? (mysteryChallenge.xpReward || 10) : 0;
            
            setMysteryCompleted(true);
            setMysteryXpAwarded(xpAwarded);
            setMysteryWasCorrect(isCorrect);
            setMysteryCompletionMessage(isCorrect 
                ? `Correct! +${xpAwarded} XP (offline mode)` 
                : 'Not quite! Try again tomorrow.');
            setQuizExplanation(quizData?.explanation || '');
            setSubmittingMystery(false);
            return;
        }
        
        try {
            // Sanitize clubId: only include if it's a valid UUID, not strings like "none" or "home user"
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const sanitizedClubId = student.clubId && uuidRegex.test(student.clubId) ? student.clubId : null;
            
            // Check if this is a fallback challenge (non-UUID ID)
            const challengeIdStr = String(mysteryChallenge.id);
            const isFallbackId = !uuidRegex.test(challengeIdStr);
            
            // For fallback challenges, calculate isCorrect locally and send to backend
            const quizData = mysteryChallenge.quizData;
            const localIsCorrect = selectedIndex === quizData?.correctIndex;
            
            const payload: any = {
                challengeId: mysteryChallenge.id,
                studentId: student.id,
                selectedIndex,
            };
            
            // For fallback challenges, include isCorrect and xpReward so backend can award XP
            if (isFallbackId) {
                payload.isCorrect = localIsCorrect;
                payload.xpReward = mysteryChallenge.xpReward || 50;
                console.log('[MysteryChallenge] Fallback challenge detected, including isCorrect:', localIsCorrect);
            }
            
            if (sanitizedClubId) {
                payload.clubId = sanitizedClubId;
            }
            
            console.log('[MysteryChallenge] Sending sanitized payload:', payload);
            
            const response = await fetch('/api/daily-challenge/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            // Handle ALREADY_COMPLETED error from backend (security fix) - treat as SUCCESS UI
            if (result.error === 'Already completed' || result.error === 'ALREADY_COMPLETED' || result.message?.includes('already completed')) {
                console.log('[MysteryChallenge] Already completed - showing success state');
                setMysteryCompleted(true);
                setMysteryXpAwarded(result.previousXp || 50);
                setMysteryWasCorrect(true);
                setMysteryCompletionMessage(result.message || 'You already completed today\'s challenge! Come back tomorrow.');
                setSelectedQuizAnswer(null);
                
                // Update header XP - trigger student refresh
                const updatedStudent = { ...student, totalPoints: (student.totalPoints || 0) };
                onUpdateStudent(updatedStudent);
                return;
            }
            
            if (result.success) {
                setMysteryCompleted(true);
                setMysteryXpAwarded(result.xpAwarded);
                setMysteryWasCorrect(result.isCorrect);
                setMysteryCompletionMessage(result.message);
                setQuizExplanation(result.explanation || '');
                setMysteryBoxCompletedCount(prev => prev + 1);
                
                // Update local stats and serverTotalXP for header display
                const xpEarned = result.xpAwarded || 0;
                if (typeof result.newTotalXp === 'number') {
                    setServerTotalXP(result.newTotalXp);
                    setRivalStats(prev => ({ ...prev, wins: prev.wins + (result.isCorrect ? 1 : 0), xp: result.newTotalXp }));
                } else {
                    setServerTotalXP(prev => prev + xpEarned);
                    setRivalStats(prev => ({ ...prev, wins: prev.wins + (result.isCorrect ? 1 : 0), xp: prev.xp + xpEarned }));
                }
                console.log('[MysteryChallenge] XP updated: +', xpEarned);
            }
        } catch (error) {
            console.error('[MysteryChallenge] Submit error:', error);
        } finally {
            setSubmittingMystery(false);
        }
    };

    // Fetch Warrior's Gauntlet data
    useEffect(() => {
        const fetchGauntlet = async () => {
            if (!student.id) return;
            setGauntletLoading(true);
            try {
                const response = await fetch(`/api/gauntlet/today?studentId=${student.id}`);
                const result = await response.json();
                setGauntletData(result);
            } catch (err) {
                console.error('[Gauntlet] Failed to fetch:', err);
            } finally {
                setGauntletLoading(false);
            }
        };
        fetchGauntlet();
    }, [student.id]);
    
    // Submit Gauntlet Challenge
    const submitGauntletChallenge = async (proofType: 'TRUST' | 'VIDEO') => {
        if (!selectedGauntletChallenge || !student.id || !gauntletScore) return;
        
        // Prevent double-click race condition
        if (gauntletSubmitRef.current) return;
        gauntletSubmitRef.current = true;
        
        setGauntletSubmitting(true);
        setGauntletResult(null);
        
        try {
            const response = await fetch('/api/gauntlet/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeId: selectedGauntletChallenge,
                    studentId: student.id,
                    score: parseInt(gauntletScore),
                    proofType,
                }),
            });
            
            const result = await response.json();
            
            if (result.limitReached) {
                setGauntletResult({
                    success: false,
                    message: 'Already completed this week! Come back next week.',
                    xp: 0,
                    isNewPB: false,
                });
                return;
            }
            
            if (result.success) {
                setGauntletResult({
                    success: true,
                    message: result.message,
                    xp: result.xpAwarded,
                    isNewPB: result.isNewPersonalBest,
                });
                
                // Update server XP
                if (!result.pendingVerification) {
                    setServerTotalXP(prev => prev + result.xpAwarded);
                }
                
                // Refresh gauntlet data
                const refreshResponse = await fetch(`/api/gauntlet/today?studentId=${student.id}`);
                const refreshResult = await refreshResponse.json();
                setGauntletData(refreshResult);
                
                // Reset form
                setGauntletScore('');
            }
        } catch (error) {
            console.error('[Gauntlet] Submit error:', error);
            setGauntletResult({
                success: false,
                message: 'Failed to submit. Please try again.',
                xp: 0,
                isNewPB: false,
            });
        } finally {
            setGauntletSubmitting(false);
            gauntletSubmitRef.current = false;
        }
    };

    // Solo Arena submission (Trust vs Video)
    const submitSoloChallenge = async (proofType: 'TRUST' | 'VIDEO', videoUrl?: string, challengeXp?: number) => {
        if (!selectedChallenge || !student.id) return;
        
        // Prevent double-click race condition
        if (soloSubmitRef.current) return;
        soloSubmitRef.current = true;
        
        // STRICT 1x daily limit - check frontend first
        if (isChallengeCompletedToday(selectedChallenge)) {
            soloSubmitRef.current = false; // Reset ref on early return
            setSoloResult({
                success: false,
                message: 'Daily Mission Complete! You can earn XP for this challenge again tomorrow.',
                xp: 0
            });
            return;
        }
        
        // Use passed XP or default to 15
        const xpValue = challengeXp || 15;
        
        // Get challenge metadata from data.customChallenges (available in scope)
        const customChallenge = (data.customChallenges || []).find(c => c.id === selectedChallenge);
        // Detect challenge type: coach_pick if explicitly set, or if it's a custom challenge that's not General category
        const challengeCategoryType = customChallenge?.challengeType === 'coach_pick' || 
            (customChallenge && customChallenge.category !== 'Custom') 
            ? 'coach_pick' 
            : 'general';
        // Normalize difficulty to uppercase ENUM keys (EASY, MEDIUM, HARD, EPIC)
        const rawDifficulty = (customChallenge?.difficulty || 'easy').toString().toUpperCase();
        const challengeDifficulty = ['EASY', 'MEDIUM', 'HARD', 'EPIC'].includes(rawDifficulty) ? rawDifficulty : 'EASY';
        
        setSoloSubmitting(true);
        setSoloResult(null);
        
        try {
            // Get challenge name for storage
            const challengeInfo = getChallengeInfo(selectedChallenge);
            
            const response = await fetch('/api/challenges/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: student.id,
                    clubId: student.clubId,
                    challengeType: selectedChallenge,
                    challengeName: challengeInfo.name,
                    score: parseInt(soloScore) || 0,
                    proofType,
                    videoUrl,
                    challengeXp: xpValue,
                    challengeCategoryType,
                    challengeDifficulty,
                })
            });
            
            const result = await response.json();
            
            // Handle 429 (daily limit) from backend
            if (result.alreadyCompleted || result.limitReached) {
                markChallengeCompleted(selectedChallenge);
                setSoloResult({
                    success: false,
                    message: result.message || 'Daily Mission Complete!',
                    xp: 0
                });
                return;
            }
            
            if (result.success) {
                // Mark as completed in localStorage (1x daily limit)
                markChallengeCompleted(selectedChallenge);
                
                const xpEarned = result.xpAwarded || result.earned_xp || 0;
                setSoloResult({
                    success: true,
                    message: result.message,
                    xp: xpEarned
                });
                
                // Update XP display immediately (add earned XP to current total)
                if (xpEarned > 0) {
                    if (typeof result.newTotalXp === 'number') {
                        setServerTotalXP(result.newTotalXp);
                        setRivalStats(prev => ({ ...prev, xp: result.newTotalXp }));
                    } else {
                        setServerTotalXP(prev => prev + xpEarned);
                        setRivalStats(prev => ({ ...prev, xp: prev.xp + xpEarned }));
                    }
                    console.log('[Arena] XP updated: +', xpEarned);
                }
                
                setSoloScore('');
                setSelectedChallenge('');
                
                setTimeout(() => setSoloResult(null), 4000);
            } else {
                setSoloResult({
                    success: false,
                    message: result.message || result.error || 'Submission failed',
                    xp: 0
                });
            }
        } catch (error) {
            console.error('[SoloArena] Submit error:', error);
            setSoloResult({
                success: false,
                message: 'Failed to submit. Please try again.',
                xp: 0
            });
        } finally {
            setSoloSubmitting(false);
            soloSubmitRef.current = false;
        }
    };
    
    // Video upload for solo arena
    const handleSoloVideoUpload = async () => {
        if (!videoFile || !selectedChallenge) return;
        
        // Prevent double-click race condition during upload
        if (videoUploadRef.current || isUploadingVideo) return;
        videoUploadRef.current = true;
        
        setIsUploadingVideo(true);
        setVideoUploadError(null);
        
        try {
            // Get presigned URL
            const urlResponse = await fetch('/api/challenges/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: student.id,
                    challengeType: selectedChallenge,
                    filename: videoFile.name,
                    contentType: videoFile.type,
                })
            });
            
            const { uploadUrl, videoUrl } = await urlResponse.json();
            
            // Upload video to S3
            await fetch(uploadUrl, {
                method: 'PUT',
                body: videoFile,
                headers: { 'Content-Type': videoFile.type }
            });
            
            // Submit challenge with video
            await submitSoloChallenge('VIDEO', videoUrl);
            
            setShowVideoUpload(false);
            setVideoFile(null);
        } catch (error) {
            console.error('[SoloArena] Video upload error:', error);
            setVideoUploadError('Failed to upload video. Please try again.');
        } finally {
            setIsUploadingVideo(false);
            videoUploadRef.current = false;
        }
    };
    
    // Challenge Inbox State
    interface PendingChallenge {
        id: string;
        fromId: string;
        fromName: string;
        toId: string;
        toName: string;
        challengeId: string;
        challengeName: string;
        challengeXp: number;
        status: 'pending' | 'accepted' | 'declined' | 'completed';
        myScore?: number;
        theirScore?: number;
        createdAt: string;
        expiresIn: string;
    }
    const [pendingChallenges, setPendingChallenges] = useState<PendingChallenge[]>([]);
    const [sentChallenges, setSentChallenges] = useState<PendingChallenge[]>([]);
    const [activeChallenge, setActiveChallenge] = useState<PendingChallenge | null>(null);
    const [myScore, setMyScore] = useState<string>('');
    const [showScoreSubmit, setShowScoreSubmit] = useState(false);
    const [inboxTab, setInboxTab] = useState<'received' | 'sent'>('received');
    const [challengeSent, setChallengeSent] = useState(false);

    // Real-time Challenge Hook
    const {
        receivedChallenges: realtimeReceived,
        sentChallenges: realtimeSent,
        pendingCount: realtimePendingCount,
        sendChallenge: realtimeSendChallenge,
        acceptChallenge: realtimeAcceptChallenge,
        declineChallenge: realtimeDeclineChallenge,
        newChallengeAlert,
        clearNewChallengeAlert
    } = useChallengeRealtime(student.id);

    // Merge real-time challenges with demo data for display
    const mergedReceivedChallenges = useMemo(() => {
        const realtimeFormatted = realtimeReceived.map(c => ({
            id: c.id,
            fromId: c.from_student_id,
            fromName: c.from_student_name,
            toId: c.to_student_id,
            toName: c.to_student_name,
            challengeId: c.challenge_id,
            challengeName: c.challenge_name,
            challengeXp: c.challenge_xp,
            status: c.status as PendingChallenge['status'],
            createdAt: new Date(c.created_at).toLocaleString(),
            expiresIn: Math.max(0, Math.floor((new Date(c.expires_at).getTime() - Date.now()) / (1000 * 60 * 60))) + ' hours'
        }));
        const existingIds = new Set(realtimeFormatted.map(c => c.id));
        const demoData = pendingChallenges.filter(c => !existingIds.has(c.id));
        return [...realtimeFormatted, ...demoData];
    }, [realtimeReceived, pendingChallenges]);

    const mergedSentChallenges = useMemo(() => {
        const realtimeFormatted = realtimeSent.map(c => ({
            id: c.id,
            fromId: c.from_student_id,
            fromName: c.from_student_name,
            toId: c.to_student_id,
            toName: c.to_student_name,
            challengeId: c.challenge_id,
            challengeName: c.challenge_name,
            challengeXp: c.challenge_xp,
            status: c.status as PendingChallenge['status'],
            createdAt: new Date(c.created_at).toLocaleString(),
            expiresIn: Math.max(0, Math.floor((new Date(c.expires_at).getTime() - Date.now()) / (1000 * 60 * 60))) + ' hours'
        }));
        const existingIds = new Set(realtimeFormatted.map(c => c.id));
        const demoData = sentChallenges.filter(c => !existingIds.has(c.id));
        return [...realtimeFormatted, ...demoData];
    }, [realtimeSent, sentChallenges]);

    const totalPendingCount = useMemo(() => {
        return mergedReceivedChallenges.filter(c => c.status === 'pending').length;
    }, [mergedReceivedChallenges]);

    // Home Dojo State
    const [homeDojoChecks, setHomeDojoChecks] = useState<Record<string, boolean>>({});
    const [habitLoading, setHabitLoading] = useState<Record<string, boolean>>({});
    const [habitXpEarned, setHabitXpEarned] = useState<Record<string, number>>({});
    const [habitXpToday, setHabitXpToday] = useState(0);
    const [dailyXpCap] = useState(60);
    const [atDailyLimit, setAtDailyLimit] = useState(false);
    const [isEditingHabits, setIsEditingHabits] = useState(false);
    // Local state for habit customization before saving (simulated)
    const defaultHabits: Habit[] = [
        { id: 'made_bed', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
        { id: 'brushed_teeth', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
        { id: 'showed_respect', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
        { id: 'did_chores', question: 'Did they help with chores?', category: 'Chores', icon: '🧹', isActive: true },
    ];
    const [customHabitList, setCustomHabitList] = useState<Habit[]>(student.customHabits?.length ? student.customHabits : defaultHabits);
    // Custom habit creation state
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customHabitQuestion, setCustomHabitQuestion] = useState('');
    const [customHabitIcon, setCustomHabitIcon] = useState('');
    const [customHabitCategory, setCustomHabitCategory] = useState<Habit['category']>('Custom');

    // Check if ID is a valid database UUID (not a wizard-generated ID)
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Use the student.id directly - ParentPortalRoute already resolves wizard IDs to database UUIDs
    const studentId = student.id;
    console.log('[HomeDojo] Using student ID:', studentId, 'valid UUID:', isValidUUID(studentId || ''));
    
    // Fetch habit status and custom habits on mount
    useEffect(() => {
        if (!studentId || !isValidUUID(studentId)) {
            console.warn('[HomeDojo] Invalid student ID, skipping habit fetch:', studentId);
            return;
        }
        
        const fetchHabitData = async () => {
            try {
                console.log('[HomeDojo] Fetching habits for student:', studentId);
                // Fetch habit status and sync XP from database
                const statusRes = await fetch(`/api/habits/status?studentId=${studentId}`);
                if (statusRes.ok) {
                    const data = await statusRes.json();
                    const checks: Record<string, boolean> = {};
                    (data.completedHabits || []).forEach((habitName: string) => {
                        checks[habitName] = true;
                    });
                    setHomeDojoChecks(checks);
                    setHabitXpToday(data.totalXpToday || 0);
                    setAtDailyLimit((data.totalXpToday || 0) >= (data.dailyXpCap || 60));
                    
                    // Sync XP from database totalXp (single source of truth)
                    const dbXp = data.totalXp ?? data.lifetimeXp ?? 0;
                    setRivalStats(prev => ({ ...prev, xp: dbXp }));
                    console.log('[HomeDojo] XP hydrated from DB:', dbXp);
                    
                    // Sync streak from database (calculated from habit_logs)
                    if (typeof data.streak === 'number') {
                        setDailyStreak(data.streak);
                        console.log('[HomeDojo] Streak hydrated from DB:', data.streak);
                    }
                }
                
                // Fetch custom habits from database (only user-created ones)
                const customRes = await fetch(`/api/habits/custom?studentId=${studentId}`);
                if (customRes.ok) {
                    const customData = await customRes.json();
                    const dbHabits = (customData.customHabits || []).map((h: any) => ({
                        id: h.id,
                        question: h.title,
                        category: 'Custom' as const,
                        icon: h.icon || '✨',
                        isActive: true,
                        isCustom: true
                    }));
                    // Start with default habits and add any custom habits from DB
                    setCustomHabitList([...defaultHabits, ...dbHabits]);
                }
            } catch (e) {
                console.error('Failed to fetch habit data:', e);
            }
        };
        fetchHabitData();
    }, [studentId]);

    // Time Machine State
    const [simulatedAttendance, setSimulatedAttendance] = useState(2); // Default 2x week

    // Check if premium is unlocked via Club Sponsorship or User Upgrade
    const hasPremiumAccess = isPremium || data.clubSponsoredPremium;

    const currentBelt = getBelt(student.beltId, data.belts);
    
    // Use actual streak from rivalStats (daily practice streak)
    const streak = student.rivalsStats?.dailyStreak || dailyStreak || 0; 

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

    // Home Dojo Helpers - use habitId as the key for both frontend state and backend storage
    const toggleHabitCheck = async (habitId: string, habitName: string) => {
        console.log('[HomeDojo] Click detected:', habitId, 'studentId:', studentId);
        
        // Prevent double-clicks on already completed habits
        if (homeDojoChecks[habitId]) return;
        
        // Validate we have a valid UUID before making API calls
        if (!studentId || !isValidUUID(studentId)) {
            console.warn('[HomeDojo] Cannot save habit - invalid student ID:', studentId);
            alert('Student data not ready. Please refresh the page and try again.');
            return;
        }
        
        // Check if at daily limit before visual feedback
        const wasAtLimit = atDailyLimit;
        const xpToShow = wasAtLimit ? 0 : 10;
        
        // Immediate visual feedback - mark as complete right away
        setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
        setHabitXpEarned(prev => ({ ...prev, [habitId]: xpToShow }));
        setHabitXpToday(prev => prev + xpToShow);
        
        // Update rivalStats.xp immediately so header shows new total (only if not at limit)
        if (!wasAtLimit) {
            setRivalStats(prev => ({ ...prev, xp: prev.xp + 10 }));
        }
        
        setTimeout(() => {
            setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
        }, 2000);
        
        // API call to persist to database - use habitId as the key
        try {
            const res = await fetch('/api/habits/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, habitName: habitId })
            });
            const apiData = await res.json();
            
            // Log API failures (no blocking alerts)
            if (!res.ok) {
                console.error('[HomeDojo] API Error:', apiData.error || 'Unknown error', 'Student ID:', studentId);
                // Revert optimistic updates
                setHomeDojoChecks(prev => ({ ...prev, [habitId]: false }));
                if (!wasAtLimit) {
                    setRivalStats(prev => ({ ...prev, xp: prev.xp - 10 }));
                    setHabitXpToday(prev => prev - 10);
                }
                return;
            }
            
            if (apiData.success) {
                // Sync with actual values from server (source of truth)
                setHabitXpToday(apiData.dailyXpEarned || 0);
                setAtDailyLimit(apiData.atDailyLimit || false);
                // Update header XP from server's newTotalXp (single source of truth)
                if (typeof apiData.newTotalXp === 'number') {
                    setRivalStats(prev => ({ ...prev, xp: apiData.newTotalXp }));
                    setServerTotalXP(apiData.newTotalXp);
                    console.log('[HomeDojo] XP synced from server:', apiData.newTotalXp, 'Daily:', apiData.dailyXpEarned, '/', apiData.dailyXpCap);
                }
            } else if (apiData.alreadyCompleted) {
                // Already completed - revert optimistic update
                setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
                setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
                // Revert the optimistic XP add
                if (!wasAtLimit) {
                    setRivalStats(prev => ({ ...prev, xp: prev.xp - 10 }));
                    setHabitXpToday(prev => prev - 10);
                }
            }
        } catch (e) {
            console.error('Habit API error:', e);
            // Revert optimistic updates on error
            setHomeDojoChecks(prev => ({ ...prev, [habitId]: false }));
            setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
            if (!wasAtLimit) {
                setRivalStats(prev => ({ ...prev, xp: prev.xp - 10 }));
                setHabitXpToday(prev => prev - 10);
            }
        }
    };
    
    // Create custom habit and save to database
    const handleCreateCustomHabit = async () => {
        if (!customHabitQuestion.trim()) return;
        
        // Generate a stable ID based on the question text (slugified)
        const stableId = 'custom_' + customHabitQuestion.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
        
        const newHabit: Habit = {
            id: stableId,
            question: customHabitQuestion.trim(),
            category: 'Custom',
            icon: customHabitIcon || '✨',
            isActive: true,
            isCustom: true
        };
        
        // Add to local list immediately
        setCustomHabitList(prev => [...prev, newHabit]);
        setShowCustomForm(false);
        setCustomHabitQuestion('');
        setCustomHabitIcon('');
        
        // Save to database
        try {
            const res = await fetch('/api/habits/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    studentId: studentId, 
                    title: customHabitQuestion.trim(),
                    icon: customHabitIcon || '✨'
                })
            });
            const apiData = await res.json();
            if (apiData.success && apiData.habit) {
                // Update with real DB ID
                setCustomHabitList(prev => prev.map(h => 
                    h.id === newHabit.id ? { ...h, id: apiData.habit.id } : h
                ));
                console.log('[HomeDojo] Custom habit saved:', apiData.habit.id);
            }
        } catch (e) {
            console.error('Failed to save custom habit:', e);
        }
    };
    
    // Legacy handler kept for reference
    const toggleHabitCheckLegacy = async (habitId: string, habitName: string) => {
        if (homeDojoChecks[habitId]) {
            return;
        }
        
        setHabitLoading(prev => ({ ...prev, [habitId]: true }));
        
        try {
            const res = await fetch('/api/habits/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: student.id, habitName: habitId })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
                setHabitXpEarned(prev => ({ ...prev, [habitId]: data.xpAwarded || 10 }));
                setHabitXpToday(prev => prev + (data.xpAwarded || 10));
                setTimeout(() => {
                    setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
                }, 2000);
            } else if (data.alreadyCompleted) {
                setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
            } else {
                // Fallback: mark as complete locally even if API fails
                setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
                setHabitXpEarned(prev => ({ ...prev, [habitId]: 10 }));
                setHabitXpToday(prev => prev + 10);
                setTimeout(() => {
                    setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
                }, 2000);
            }
        } catch (e) {
            console.error('Failed to check habit:', e);
            // Fallback: mark as complete locally even if API fails
            setHomeDojoChecks(prev => ({ ...prev, [habitId]: true }));
            setHabitXpEarned(prev => ({ ...prev, [habitId]: 10 }));
            setHabitXpToday(prev => prev + 10);
            setTimeout(() => {
                setHabitXpEarned(prev => ({ ...prev, [habitId]: 0 }));
            }, 2000);
        } finally {
            setHabitLoading(prev => ({ ...prev, [habitId]: false }));
        }
    }

    const PRESET_HABITS: Habit[] = [
        { id: 'made_bed', question: 'Did they make their bed?', category: 'Chores', icon: '🛏️', isActive: true },
        { id: 'brushed_teeth', question: 'Did they brush their teeth?', category: 'Health', icon: '🦷', isActive: true },
        { id: 'showed_respect', question: 'Did they show respect to parents?', category: 'Character', icon: '🙇', isActive: true },
        { id: 'did_chores', question: 'Did they help with chores?', category: 'Chores', icon: '🧹', isActive: true },
        { id: 'homework', question: 'Did they finish homework on time?', category: 'School', icon: '📚', isActive: false },
        { id: 'kindness', question: 'Did they practice kindness?', category: 'Character', icon: '❤️', isActive: false },
    ];

    const handleToggleCustomHabit = (preset: Habit) => {
        setCustomHabitList(prev => {
            const exists = prev.find(h => h.id === preset.id);
            if (exists) {
                return prev.filter(h => h.id !== preset.id);
            } else {
                return [...prev, { ...preset }];
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
        
        // 4. Holiday Adjustment - Critical for accuracy!
        const holidayType = data.holidaySchedule || 'minimal';
        const weeksClosedPerYear = holidayType === 'custom' 
            ? (data.customHolidayWeeks || 4)
            : HOLIDAY_PRESETS[holidayType]?.weeksClosedPerYear || 2;
        
        // Effective training weeks per year (52 weeks - holidays)
        const effectiveWeeksPerYear = 52 - weeksClosedPerYear;
        const holidayAdjustmentFactor = effectiveWeeksPerYear / 52;
        
        const calculateDate = (attendancePerWeek: number) => {
            if (pointsRemaining <= 0) return new Date(); // Already there
            
            // Apply holiday adjustment to weekly points
            const adjustedPointsPerWeek = attendancePerWeek * velocityPerClass * holidayAdjustmentFactor;
            
            // Avoid divide by zero
            if (adjustedPointsPerWeek <= 0) return new Date(new Date().setFullYear(new Date().getFullYear() + 10));

            const weeksNeeded = pointsRemaining / adjustedPointsPerWeek;
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
        
        // Calculate confidence based on factors
        // Base: 70%, +10% for known holiday schedule, +5% for attendance history
        let confidenceScore = 70;
        if (data.holidaySchedule) confidenceScore += 10;
        if (student.attendanceCount && student.attendanceCount > 10) confidenceScore += 5;
        // Deduct for longer timeframes (more uncertainty)
        const yearsToGoal = (estimatedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
        if (yearsToGoal > 3) confidenceScore -= 5;
        if (yearsToGoal > 5) confidenceScore -= 5;
        confidenceScore = Math.max(50, Math.min(90, confidenceScore));

        return {
            totalPointsNeeded: totalLifetimePointsNeeded,
            pointsRemaining,
            estimatedDate,
            yearsSaved,
            targetBeltName,
            percentComplete: Math.min(100, Math.max(0, percentComplete)),
            weeksClosedPerYear,
            holidayType,
            confidenceScore
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

    // Fetch student's videos on mount and refresh every 30 seconds
    useEffect(() => {
        if (hasPremiumAccess && student.id) {
            fetchMyVideos();
            // Auto-refresh to pick up coach feedback updates
            const interval = setInterval(() => {
                fetchMyVideos();
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [hasPremiumAccess, student.id]);

    const fetchMyVideos = async () => {
        try {
            const response = await fetch(`/api/videos/student/${student.id}`);
            if (response.ok) {
                const videos = await response.json();
                setMyVideos(videos.map((v: any) => ({
                    id: v.id,
                    challengeId: v.challengeId || v.challenge_id,
                    challengeName: v.challengeName || v.challenge_name,
                    videoUrl: v.videoUrl || v.video_url,
                    status: v.status,
                    score: v.score,
                    voteCount: v.voteCount || v.vote_count || 0,
                    coachNotes: v.coachNotes || v.coach_notes || '',
                    createdAt: v.createdAt || v.created_at
                })));
            }
        } catch (error) {
            console.error('Failed to fetch videos:', error);
        }
    };

    const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 100 * 1024 * 1024) {
                setVideoUploadError('Video must be under 100MB');
                return;
            }
            if (!file.type.startsWith('video/')) {
                setVideoUploadError('Please select a video file');
                return;
            }
            setVideoFile(file);
            setVideoUploadError(null);
        }
    };

    const getChallengeInfo = (challengeId: string) => {
        const allChallenges: Record<string, { name: string; category: string }> = {
            'pushup_master': { name: 'Push-up Master', category: 'Power' },
            'squat_challenge': { name: 'Squat Challenge', category: 'Power' },
            'burpee_blast': { name: 'Burpee Blast', category: 'Power' },
            'abs_of_steel': { name: 'Abs of Steel', category: 'Power' },
            'kicks_marathon': { name: '100 Kicks Marathon', category: 'Technique' },
            'speed_punches': { name: 'Speed Punches', category: 'Technique' },
            'horse_stance': { name: 'Iron Horse Stance', category: 'Technique' },
            'jump_rope': { name: 'Jump Rope Ninja', category: 'Technique' },
            'plank_hold': { name: 'Plank Hold', category: 'Flexibility' },
            'touch_toes': { name: 'Touch Your Toes', category: 'Flexibility' },
            'wall_sit': { name: 'The Wall Sit', category: 'Flexibility' },
            'one_leg_balance': { name: 'One-Leg Balance', category: 'Flexibility' },
            'stretch': { name: 'Full Stretch Hold', category: 'Flexibility' },
            'yoga': { name: 'Yoga Flow', category: 'Flexibility' },
        };
        const customChallenge = data.customChallenges?.find(c => c.id === challengeId);
        if (customChallenge) {
            return { name: customChallenge.name, category: 'Coach Picks' };
        }
        // If it's a custom challenge ID but not in loaded data, show friendly name
        if (challengeId.startsWith('custom_')) {
            return { name: 'Custom Challenge', category: 'Coach Picks' };
        }
        return allChallenges[challengeId] || { name: challengeId, category: 'General' };
    };

    const handleVideoUpload = async () => {
        const challengeIdToUse = gauntletVideoMode ? selectedGauntletChallenge : selectedChallenge;
        if (!videoFile || !challengeIdToUse) return;
        
        // Prevent double-click race condition during upload
        if (videoUploadRef.current || isUploadingVideo) return;
        videoUploadRef.current = true;
        
        setIsUploadingVideo(true);
        setVideoUploadProgress(0);
        setVideoUploadError(null);

        try {
            // Calculate video fingerprint for duplicate detection
            setVideoUploadProgress(5);
            const videoHash = await calculateVideoHash(videoFile);
            console.log('[VideoUpload] Video hash calculated:', videoHash);
            setVideoUploadProgress(10);

            const presignedResponse = await fetch('/api/videos/presigned-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: student.id,
                    challengeId: challengeIdToUse,
                    filename: videoFile.name,
                    contentType: videoFile.type,
                    isGauntlet: gauntletVideoMode
                })
            });

            if (!presignedResponse.ok) {
                const errorData = await presignedResponse.json().catch(() => ({}));
                // Show limit-specific error message
                if (errorData.limitReached) {
                    throw new Error(errorData.message || 'Limit reached');
                }
                throw new Error(errorData.error || 'Failed to get upload URL');
            }

            const { uploadUrl, key, publicUrl } = await presignedResponse.json();
            setVideoUploadProgress(20);

            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: videoFile,
                headers: { 'Content-Type': videoFile.type }
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload video');
            }
            setVideoUploadProgress(80);

            if (gauntletVideoMode) {
                // Submit gauntlet challenge with VIDEO proof type
                console.log('[Gauntlet] Submitting video:', { challengeId: selectedGauntletChallenge, studentId: student.id, score: parseInt(videoScore) });
                
                const gauntletResponse = await fetch('/api/gauntlet/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        challengeId: selectedGauntletChallenge,
                        studentId: student.id,
                        score: parseInt(videoScore),
                        proofType: 'VIDEO',
                        videoUrl: publicUrl,
                        videoHash: videoHash,
                    }),
                });
                
                const result = await gauntletResponse.json();
                console.log('[Gauntlet] Submit response:', gauntletResponse.status, result);
                setVideoUploadProgress(100);
                
                if (result.success) {
                    setGauntletResult({
                        success: true,
                        message: result.message,
                        xp: result.pendingVerification ? 0 : result.xpAwarded,
                        pendingXp: result.pendingXp || 0,
                        isNewPB: result.isNewPersonalBest,
                        pendingVerification: result.pendingVerification,
                    });
                    
                    // Only update XP if not pending verification
                    if (!result.pendingVerification && result.xpAwarded > 0) {
                        setServerTotalXP(prev => prev + result.xpAwarded);
                    }
                    
                    // Refresh gauntlet data
                    const refreshResponse = await fetch(`/api/gauntlet/today?studentId=${student.id}`);
                    const refreshResult = await refreshResponse.json();
                    setGauntletData(refreshResult);
                }
                
                setTimeout(() => {
                    setShowVideoUpload(false);
                    setVideoFile(null);
                    setVideoUploadProgress(0);
                    setVideoScore('');
                    setGauntletVideoMode(false);
                    setGauntletScore('');
                }, 1000);
            } else {
                // Original Arena video submission logic
                const challengeInfo = getChallengeInfo(selectedChallenge);
                const clubId = localStorage.getItem('taekup_club_id');
                
                if (!clubId) {
                    throw new Error('Club information not found. Please log in again.');
                }

                // Calculate XP based on challenge difficulty (Coach Pick video = 2x base XP)
                const customChallenge = (data.customChallenges || []).find(c => c.id === selectedChallenge);
                const difficultyXpMap: Record<string, number> = {
                    'EASY': 20, 'MEDIUM': 40, 'HARD': 70, 'EPIC': 100
                };
                const difficulty = (customChallenge?.difficulty || 'EASY').toUpperCase();
                const xpAwarded = difficultyXpMap[difficulty] || 40;

                console.log('[Arena] Saving video:', { studentId: student.id, clubId, challengeId: selectedChallenge, challengeName: challengeInfo.name, xpAwarded });
                
                const saveResponse = await fetch('/api/videos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        studentId: student.id,
                        clubId: clubId,
                        challengeId: selectedChallenge,
                        challengeName: challengeInfo.name,
                        challengeCategory: challengeInfo.category,
                        videoUrl: publicUrl,
                        videoKey: key,
                        videoHash: videoHash,
                        score: parseInt(videoScore) || 0,
                        xpAwarded: xpAwarded
                    })
                });

                const saveResult = await saveResponse.json().catch(() => ({}));
                console.log('[Arena] Save response:', saveResponse.status, saveResult);
                
                if (!saveResponse.ok) {
                    throw new Error(saveResult.message || 'Failed to save video record');
                }

                setVideoUploadProgress(100);
                
                // Show success feedback
                setVideoUploadError(null);
                alert('Video submitted successfully! Your coach will review it soon.');
                
                setTimeout(() => {
                    setShowVideoUpload(false);
                    setVideoFile(null);
                    setVideoUploadProgress(0);
                    setVideoScore('');
                    setSelectedChallenge('');
                    fetchMyVideos();
                }, 500);
            }

        } catch (error: any) {
            console.error('Video upload error:', error);
            setVideoUploadError(error.message || 'Upload failed');
        } finally {
            setIsUploadingVideo(false);
            videoUploadRef.current = false;
        }
    };

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
                        {Array.from({ length: data.stripesPerBelt }).map((_, i) => {
                            const isEarned = i < currentBeltStripes;
                            const stripeColor = data.useColorCodedStripes && data.stripeColors?.[i] ? data.stripeColors[i] : '#FACC15';
                            return (
                                <div 
                                    key={i} 
                                    className={`h-2 flex-1 rounded-full mx-0.5 transition-all ${isEarned ? 'shadow-lg' : 'bg-gray-700'}`}
                                    style={isEarned ? { backgroundColor: stripeColor, boxShadow: `0 0 8px ${stripeColor}80` } : {}}
                                ></div>
                            );
                        })}
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
                    {student.performanceHistory && student.performanceHistory.length > 0 ? (
                        <div className="space-y-6">
                            {data.skills.filter(s => s.isActive).slice(0, 3).map(skill => {
                                const recentScores = student.performanceHistory?.slice(-8).map(ph => {
                                    const score = ph.scores?.[skill.id];
                                    return typeof score === 'number' ? Math.round(score * 50) : 50;
                                }) || [];
                                const hasData = recentScores.length > 0;
                                const displayScores = hasData ? recentScores : [50, 50, 50, 50, 50, 50, 50, 50];
                                
                                return (
                                    <div key={skill.id}>
                                        <div className="flex justify-between text-xs text-gray-400 mb-1 font-bold uppercase">
                                            <span>{skill.name}</span>
                                            {hasData && recentScores.length >= 2 && (
                                                <span className={recentScores[recentScores.length - 1] > recentScores[0] ? 'text-green-400' : 'text-gray-500'}>
                                                    {recentScores[recentScores.length - 1] > recentScores[0] ? '⬆️ Improving' : '➡️ Steady'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-20 flex items-end space-x-2">
                                            {displayScores.map((h, i) => (
                                                <div key={i} className="flex-1 bg-gray-700 rounded-t overflow-hidden relative group">
                                                    <div className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-500" style={{ height: `${h}%` }}></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <div className="text-4xl mb-3">📊</div>
                            <p className="text-gray-400 text-sm">Progress charts will appear after coach grades are recorded.</p>
                            <p className="text-gray-500 text-xs mt-2">Each class, coaches rate skills like {data.skills.filter(s => s.isActive).slice(0, 2).map(s => s.name).join(', ')} and more.</p>
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h3 className="font-bold text-white mb-4 flex items-center">
                        <span className="mr-2">📅</span> Consistency Heatmap
                    </h3>
                    {student.attendanceCount && student.attendanceCount > 0 ? (
                        <>
                            <div className="grid grid-cols-7 gap-2">
                                {Array.from({length: 28}).map((_, i) => {
                                    const attended = i < (student.attendanceCount || 0) && ((i + 1) % 3 === 0 || (i + 1) % 4 === 0);
                                    return (
                                        <div key={i} className={`aspect-square rounded-sm ${attended ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]' : 'bg-gray-700/50'}`}></div>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-center text-gray-500 mt-3">{student.attendanceCount} classes attended. Keep going!</p>
                        </>
                    ) : (
                        <div className="text-center py-4">
                            <div className="text-3xl mb-2">📅</div>
                            <p className="text-gray-400 text-sm">Attendance tracking will appear after classes.</p>
                        </div>
                    )}
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
                            studentVideos
                                .filter(v => v.status === 'live' || !v.status)
                                .filter(v => v.pricingType !== 'premium' || hasPremiumAccess)
                                .map((video, idx) => {
                                const isCompleted = isContentCompleted(video.id);
                                const xpReward = video.xpReward || 10;
                                const isPremiumContent = video.pricingType === 'premium';
                                
                                const handleComplete = (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    const awarded = completeContent(video.id, xpReward);
                                    if (awarded) {
                                        setRivalStats(prev => ({ ...prev, xp: prev.xp + xpReward }));
                                    }
                                    window.open(video.url, '_blank');
                                };
                                
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={handleComplete}
                                        className={`bg-gray-800 rounded-xl overflow-hidden shadow-lg border flex group cursor-pointer transition-colors ${isCompleted ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700 hover:border-sky-500'}`}
                                    >
                                        <div className={`w-24 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-300 ${isCompleted ? 'bg-green-900/30' : 'bg-gray-900'}`}>
                                            {isCompleted ? '✅' : (video.contentType === 'document' ? '📄' : '🥋')}
                                        </div>
                                        <div className="p-4 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className={`font-bold text-sm ${isCompleted ? 'text-green-400' : 'text-white'}`}>{video.title}</h4>
                                                {isPremiumContent && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">Premium</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-gray-500">{isCompleted ? 'Completed!' : 'Watch to earn XP'}</p>
                                                <span className={`text-xs font-bold ${isCompleted ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {isCompleted ? `+${xpReward} XP earned` : `+${xpReward} XP`}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center px-4">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${isCompleted ? 'bg-green-500 shadow-green-600/30' : 'bg-sky-500 group-hover:bg-sky-400 shadow-blue-600/30'}`}>
                                                <span className="text-white text-xs">{isCompleted ? '✓' : '▶'}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
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
                {/* TIME MACHINE WIDGET - Available to ALL users (not premium-gated) */}
                <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden mb-6">
                    {/* Glowing Effect */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-2 bg-gradient-to-r from-transparent via-blue-500 to-transparent blur-sm"></div>
                    
                    <h3 className="text-center text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">{blackBeltPrediction.targetBeltName} Time Machine</h3>
                    
                    <div className="text-center mb-6">
                        <p className="text-sm text-gray-500">Estimated Achievement Date</p>
                        <h2 className="text-3xl md:text-4xl font-black text-white mt-1 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                            {blackBeltPrediction.estimatedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </h2>
                        <div className="flex items-center justify-center gap-2 mt-1">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                                Target: {blackBeltPrediction.targetBeltName}
                            </p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/30 text-blue-300">
                                ~{blackBeltPrediction.confidenceScore}% confidence
                            </span>
                        </div>
                        {simulatedAttendance > 1 && Number(blackBeltPrediction.yearsSaved) > 0 && (
                            <p className="text-green-400 text-xs font-bold mt-2 animate-pulse">
                                ⚡ You save {blackBeltPrediction.yearsSaved} years by training {simulatedAttendance}x/week!
                            </p>
                        )}
                        <p className="text-[9px] text-gray-600 mt-2">
                            Accounts for {blackBeltPrediction.weeksClosedPerYear} weeks/year holidays
                        </p>
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

                    {/* Road to Final Belt Progress */}
                    <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Road to {blackBeltPrediction.targetBeltName}</span>
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

                {/* JOURNEY TIMELINE - Premium Feature */}
                <div className="relative">
                    {!hasPremiumAccess && renderPremiumLock("Belt Journey Timeline", "See a visual timeline of your child's entire martial arts career. Relive every promotion and milestone.")}
                    
                    <div className={`space-y-6 pb-20 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none overflow-hidden h-[400px]' : ''}`}>
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
            </div>
        );
    }
    
    const [cardFlipped, setCardFlipped] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    
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
            label: skill.name.substring(0, 3).toUpperCase(),
            value: calcAvg(skill.id)
        }));

        // Attendance is always a stat
        const att = Math.min(99, 60 + (student.attendanceCount || 0));
        
        // Calculate OVR (Overall Rating) based on ALL skills + Belt
        const beltIndex = data.belts.findIndex(b => b.id === student.beltId);
        const beltBase = 60 + (beltIndex * 4);
        
        const skillSum = cardStats.reduce((sum, stat) => sum + stat.value, 0);
        const ovr = Math.round((skillSum + att + beltBase) / (cardStats.length + 2));

        const hasSparringData = stats.matches > 0;

        // RARITY SYSTEM based on OVR
        const getRarity = (rating: number) => {
            if (rating >= 95) return { name: 'LEGENDARY', gradient: 'from-amber-400 via-yellow-300 to-amber-500', glow: 'shadow-[0_0_40px_rgba(251,191,36,0.8)]', icon: '💎', textColor: 'text-amber-300', borderColor: 'border-amber-400' };
            if (rating >= 90) return { name: 'DIAMOND', gradient: 'from-cyan-300 via-blue-200 to-cyan-400', glow: 'shadow-[0_0_35px_rgba(34,211,238,0.7)]', icon: '💠', textColor: 'text-cyan-200', borderColor: 'border-cyan-300' };
            if (rating >= 85) return { name: 'GOLD', gradient: 'from-yellow-500 via-amber-400 to-yellow-600', glow: 'shadow-[0_0_30px_rgba(234,179,8,0.6)]', icon: '🥇', textColor: 'text-yellow-300', borderColor: 'border-yellow-400' };
            if (rating >= 80) return { name: 'SILVER', gradient: 'from-gray-300 via-slate-200 to-gray-400', glow: 'shadow-[0_0_25px_rgba(148,163,184,0.5)]', icon: '🥈', textColor: 'text-gray-200', borderColor: 'border-gray-300' };
            return { name: 'BRONZE', gradient: 'from-orange-600 via-amber-700 to-orange-700', glow: 'shadow-[0_0_20px_rgba(194,65,12,0.5)]', icon: '🥉', textColor: 'text-orange-300', borderColor: 'border-orange-400' };
        };

        const rarity = getRarity(ovr);

        // Generate achievements for back of card (with null checks)
        // Use lifetime_xp (normalized XP for Dojang Rivals) as the source of truth
        const actualXP = student.lifetimeXp || 0;
        const achievements = [
            { icon: '🎯', label: 'Classes Attended', value: student.attendanceCount || 0 },
            { icon: '⚡', label: 'Current Streak', value: `${student.rivalsStats?.dailyStreak || 0} days` },
            { icon: '🏆', label: 'Total Wins', value: rivalStats?.wins || 0 },
            { icon: '⭐', label: 'XP Earned', value: actualXP },
            { icon: '🥋', label: 'Belt Rank', value: currentBelt?.name || 'White' },
            { icon: '📅', label: 'Member Since', value: student.joinDate ? new Date(student.joinDate).getFullYear() : new Date().getFullYear() },
        ];

        // Sparkle positions (deterministic to avoid hydration issues)
        const sparklePositions = [
            { left: '15%', top: '20%' },
            { left: '75%', top: '15%' },
            { left: '25%', top: '60%' },
            { left: '80%', top: '55%' },
        ];
        
        // Sparkle component for high stats (deterministic positions)
        const Sparkle = ({ delay = 0, position }: { delay?: number; position: { left: string; top: string } }) => (
            <span 
                className="absolute text-yellow-300 animate-ping text-xs pointer-events-none"
                style={{ 
                    animationDelay: `${delay}ms`,
                    animationDuration: '1.5s',
                    left: position.left,
                    top: position.top
                }}
            >✦</span>
        );

        // Download card as image
        const handleShareCard = async () => {
            if (!cardRef.current) return;
            try {
                const html2canvas = (await import('html2canvas')).default;
                const canvas = await html2canvas(cardRef.current, { 
                    backgroundColor: '#000',
                    scale: 2 
                });
                const link = document.createElement('a');
                link.download = `${student.name.replace(/\s+/g, '_')}_athlete_card.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (err) {
                console.error('Failed to generate card image:', err);
                alert('Could not download card. Try again later.');
            }
        };

        return (
            <div className="relative h-full min-h-[500px] flex flex-col items-center pb-20">
                {!hasPremiumAccess && renderPremiumLock("Athlete Card", "Unlock your official Athlete Card with tracked stats like Focus, Power, and Discipline.")}
                
                <div className={`w-full max-w-xs mt-4 ${!hasPremiumAccess ? 'filter blur-md opacity-40 pointer-events-none' : ''}`}>
                    
                    {/* Rarity Badge */}
                    <div className="flex justify-center mb-3">
                        <div className={`px-4 py-1 rounded-full bg-gradient-to-r ${rarity.gradient} text-black text-xs font-black uppercase tracking-widest flex items-center gap-1 ${rarity.glow}`}>
                            {rarity.icon} {rarity.name} {rarity.icon}
                        </div>
                    </div>

                    {/* FLIP CARD CONTAINER */}
                    <div 
                        className="relative w-full h-[480px] cursor-pointer"
                        style={{ perspective: '1000px' }}
                        onClick={() => setCardFlipped(!cardFlipped)}
                    >
                        <div 
                            className="relative w-full h-full transition-transform duration-700"
                            style={{ 
                                transformStyle: 'preserve-3d',
                                transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                            }}
                        >
                            {/* FRONT OF CARD */}
                            <div 
                                ref={cardRef}
                                className="absolute inset-0"
                                style={{ backfaceVisibility: 'hidden' }}
                            >
                                <div className={`bg-gradient-to-b ${rarity.gradient} p-1 rounded-[20px] ${rarity.glow} transform hover:scale-[1.02] transition-transform duration-300 h-full`}>
                                    <div className={`bg-gradient-to-b from-gray-900 via-black to-gray-900 rounded-[18px] p-4 relative overflow-hidden ${rarity.borderColor} border h-full flex flex-col`}>
                                        
                                        {/* Holographic Shimmer Effect */}
                                        <div 
                                            className="absolute inset-0 opacity-30 pointer-events-none"
                                            style={{
                                                background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.3) 30%, transparent 40%, transparent 60%, rgba(255,255,255,0.2) 70%, transparent 80%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 3s infinite linear'
                                            }}
                                        />
                                        
                                        {/* Sparkles for Legendary/Diamond */}
                                        {ovr >= 90 && sparklePositions.map((pos, i) => (
                                            <Sparkle key={i} delay={i * 300} position={pos} />
                                        ))}
                                        
                                        {/* Background Texture */}
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                        
                                        {/* Top Stats */}
                                        <div className="flex justify-between items-start relative z-10 mb-2">
                                            <div>
                                                <span className={`text-5xl font-black ${rarity.textColor} italic drop-shadow-lg`}>{ovr}</span>
                                                <span className="block text-[10px] text-gray-300 font-bold uppercase">OVR</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-xs text-gray-400 max-w-[100px] truncate">{data.clubName}</span>
                                                <div className="w-8 h-5 rounded mt-1 ml-auto border border-white/30" style={{background: currentBelt?.color1 || 'white'}}></div>
                                            </div>
                                        </div>

                                        {/* Photo Area with Glow */}
                                        <div className="relative z-10 flex-1 flex items-end justify-center mb-3">
                                            <div className={`w-28 h-28 rounded-full ${rarity.borderColor} border-4 overflow-hidden ${rarity.glow} bg-gray-800`}>
                                                {student.photo ? (
                                                    <img src={student.photo} className="w-full h-full object-cover" alt={student.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-b from-gray-700 to-gray-900">🥋</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Name */}
                                        <div className="relative z-10 text-center mb-4">
                                            <h2 className={`text-xl font-black text-white uppercase tracking-tight italic drop-shadow-lg`}>{student.name}</h2>
                                            <div className={`h-0.5 w-16 bg-gradient-to-r from-transparent ${rarity.gradient.includes('amber') ? 'via-amber-400' : rarity.gradient.includes('cyan') ? 'via-cyan-400' : rarity.gradient.includes('yellow') ? 'via-yellow-400' : 'via-gray-400'} to-transparent mx-auto mt-1`}></div>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="relative z-10 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono">
                                            {cardStats.map((stat, i) => (
                                                <div key={i} className="flex justify-between border-b border-gray-800/50 pb-1 items-center">
                                                    <span className="text-gray-400">{stat.label}</span>
                                                    <span className={`font-bold ${stat.value >= 95 ? 'text-amber-300' : stat.value >= 90 ? 'text-cyan-300' : 'text-white'}`}>
                                                        {stat.value}
                                                        {stat.value >= 95 && <span className="ml-0.5 text-amber-400">★</span>}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between border-b border-gray-800/50 pb-1 items-center">
                                                <span className="text-gray-400">ATT</span>
                                                <span className={`font-bold ${att >= 95 ? 'text-amber-300' : att >= 90 ? 'text-cyan-300' : 'text-white'}`}>
                                                    {att}
                                                    {att >= 95 && <span className="ml-0.5 text-amber-400">★</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Tap to Flip hint */}
                                        <div className="text-center mt-3 text-[10px] text-gray-500 animate-pulse">
                                            ↻ Tap to flip
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BACK OF CARD */}
                            <div 
                                className="absolute inset-0"
                                style={{ 
                                    backfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)'
                                }}
                            >
                                <div className={`bg-gradient-to-b ${rarity.gradient} p-1 rounded-[20px] ${rarity.glow} h-full`}>
                                    <div className={`bg-gradient-to-b from-gray-900 via-black to-gray-900 rounded-[18px] p-4 relative overflow-hidden ${rarity.borderColor} border h-full flex flex-col`}>
                                        
                                        {/* Holographic Shimmer */}
                                        <div 
                                            className="absolute inset-0 opacity-20 pointer-events-none"
                                            style={{
                                                background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.3) 30%, transparent 40%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 3s infinite linear'
                                            }}
                                        />
                                        
                                        {/* Header */}
                                        <div className="text-center mb-4 relative z-10">
                                            <h3 className={`text-lg font-black ${rarity.textColor} uppercase tracking-wide`}>🏆 Achievements</h3>
                                            <div className={`h-0.5 w-24 bg-gradient-to-r ${rarity.gradient} mx-auto mt-1`}></div>
                                        </div>

                                        {/* Achievements Grid */}
                                        <div className="flex-1 space-y-2 relative z-10 overflow-y-auto">
                                            {achievements.map((ach, i) => (
                                                <div key={i} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 border border-gray-700/50">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{ach.icon}</span>
                                                        <span className="text-gray-300 text-xs">{ach.label}</span>
                                                    </div>
                                                    <span className={`font-bold text-sm ${rarity.textColor}`}>{ach.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Combat Stats if available */}
                                        {hasSparringData && (
                                            <div className="mt-3 pt-3 border-t border-gray-700 relative z-10">
                                                <p className="text-center text-xs text-gray-400 mb-2">🥊 Combat Record</p>
                                                <div className="flex justify-around text-center">
                                                    <div>
                                                        <p className="text-lg font-bold text-green-400">{stats.wins}</p>
                                                        <p className="text-[10px] text-gray-500">Wins</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-gray-400">{stats.draws}</p>
                                                        <p className="text-[10px] text-gray-500">Draws</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold text-red-400">{stats.matches - stats.wins - stats.draws}</p>
                                                        <p className="text-[10px] text-gray-500">Losses</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tap to Flip hint */}
                                        <div className="text-center mt-3 text-[10px] text-gray-500 animate-pulse relative z-10">
                                            ↻ Tap to flip back
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Share/Download Button - Only for Premium */}
                    {hasPremiumAccess && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleShareCard(); }}
                            className={`mt-4 w-full py-3 rounded-xl bg-gradient-to-r ${rarity.gradient} text-black font-bold text-sm flex items-center justify-center gap-2 ${rarity.glow} hover:scale-[1.02] active:scale-95 transition-transform`}
                        >
                            📥 Download Card
                        </button>
                    )}
                </div>

                {/* CSS for shimmer animation */}
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
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
        const classmates = (data.students || []).filter(s => s.id !== student.id);
        
        // Use API leaderboard data (all club students) as primary source
        // This ensures we show ALL students in the club, not just parent's linked students
        let allStudentsForLeaderboard: Array<any> = apiLeaderboardData.length > 0 
            ? apiLeaderboardData.map(s => ({
                id: s.id,
                name: s.name,
                belt: s.belt || (data.belts || []).find(b => b.id === student.beltId)?.name || 'Unknown',
                beltId: student.beltId,
                totalXP: s.totalXP,
                monthlyXP: s.monthlyXP
            }))
            : (data.students || []);
        
        // If current student not in list, add them (handles edge cases)
        if (!allStudentsForLeaderboard.find(s => s.id === student.id)) {
            allStudentsForLeaderboard = [{
                ...student,
                totalXP: serverTotalXP || 0,
                monthlyXP: serverTotalXP || 0
            } as any, ...allStudentsForLeaderboard];
        }
        
        // Get start of current month for monthly XP calculation
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Calculate Monthly XP leaderboard - USE FRESH API DATA or serverTotalXP
        const monthlyLeaderboard = allStudentsForLeaderboard
            .map(s => {
                // Find this student's monthly XP from fresh API data
                const apiStudent = apiLeaderboardData.find(a => a.id === s.id);
                // For current user, use serverTotalXP as fallback for monthly (approximation for home users)
                const freshMonthlyXP = s.id === student.id 
                    ? (apiStudent?.monthlyXP ?? serverTotalXP ?? 0)
                    : (apiStudent?.monthlyXP ?? 0);
                return { ...s, displayXP: freshMonthlyXP, isYou: s.id === student.id };
            })
            .sort((a, b) => b.displayXP - a.displayXP)
            .map((s, i) => ({ ...s, rank: i + 1 }));
        
        // Calculate All-Time XP leaderboard - USE FRESH API DATA or serverTotalXP
        const allTimeLeaderboard = allStudentsForLeaderboard
            .map(s => {
                // Find this student's XP from fresh API data
                const apiStudent = apiLeaderboardData.find(a => a.id === s.id);
                // For current user, use serverTotalXP as primary source
                const freshXP = s.id === student.id 
                    ? (serverTotalXP || apiStudent?.totalXP || 0)
                    : (apiStudent?.totalXP ?? 0);
                return {
                    ...s,
                    displayXP: freshXP,
                    isYou: s.id === student.id
                };
            })
            .sort((a, b) => b.displayXP - a.displayXP)
            .map((s, i) => ({ ...s, rank: i + 1 }));
        
        // Select which leaderboard to display
        const leaderboard = leaderboardMode === 'monthly' ? monthlyLeaderboard : allTimeLeaderboard;
        
        const activeCustomChallenges = (data.customChallenges || []).filter(c => c.isActive);
        
        // Get streak XP multiplier
        const getStreakMultiplier = () => {
            if (dailyStreak >= 7) return 2.0;
            if (dailyStreak >= 3) return 1.5;
            return 1.0;
        };
        
        // Belt tier for matchmaking
        const getBeltTier = (beltId: string) => {
            const beltIndex = data.belts.findIndex(b => b.id === beltId);
            if (beltIndex < 3) return 'beginner';
            if (beltIndex < 6) return 'intermediate';
            return 'advanced';
        };
        
        const studentBeltTier = getBeltTier(student.beltId);
        
        // Filter classmates by similar belt tier for fair matchmaking
        const fairMatchClassmates = classmates.filter(c => {
            const theirTier = getBeltTier(c.beltId);
            return theirTier === studentBeltTier;
        });
        
        // Challenge Categories - Consolidated to 3 (Power, Technique, Flexibility)
        const coachPickChallenges = activeCustomChallenges.filter(c => c.challengeType === 'coach_pick' || (!c.challengeType && c.category !== 'Custom'));
        const generalCustomChallenges = activeCustomChallenges.filter(c => c.challengeType === 'general' || (c.challengeType === undefined && c.category === 'Custom'));
        
        const challengeCategories = [
            ...(coachPickChallenges.length > 0 ? [{
                name: 'Coach Picks',
                icon: '🥋',
                color: 'amber',
                isFeatured: true,
                challenges: coachPickChallenges.map(c => ({
                    id: c.id,
                    name: c.name,
                    icon: c.icon,
                    xp: c.xp,
                    isCoachChallenge: true,
                    challengeType: 'coach_pick' as const,
                    demoVideoUrl: c.demoVideoUrl,
                    videoUrl: c.videoUrl,
                    description: c.description,
                    weeklyChallenge: c.weeklyChallenge,
                    difficulty: c.difficulty
                }))
            }] : []),
        ];
        
        // Family challenge pairs - Trust System only (parent verifies)
        const familyChallenges = [
            // HARD tier challenges (100+ XP)
            { id: 'family_pushups', name: 'Parent vs Kid: Pushups', icon: '💪', xp: 100, tier: 'Hard', description: 'Who can do more pushups? Beat your parent! Count each rep together and see who gives up first.' },
            { id: 'family_plank', name: 'Family Plank-Off', icon: '🧱', xp: 120, tier: 'Hard', description: 'Plank together side by side. Who drops first loses! Parent times while both hold strong.' },
            { id: 'family_squat_hold', name: 'The Squat Showdown', icon: '🦵', xp: 100, tier: 'Hard', description: 'Hold a wall sit together. Thighs burning? Who can last longer without standing up!' },
            // MEDIUM tier challenges (80-99 XP)
            { id: 'family_statue', name: 'The Statue Challenge', icon: '🧘', xp: 80, tier: 'Medium', description: 'Stand on one leg, close your eyes. Who falls first? Focus and balance win!' },
            { id: 'family_kicks', name: 'Kick Count Battle', icon: '🦶', xp: 90, tier: 'Medium', description: 'Parent holds a pillow. Kid kicks for 30 seconds. Parent counts every kick!' },
            { id: 'family_balance', name: 'Flamingo Stand-Off', icon: '🦩', xp: 80, tier: 'Medium', description: 'Both stand on one leg like flamingos. First to put foot down loses. Eyes open!' },
            { id: 'family_situps', name: 'Sit-Up Showdown', icon: '🏋️', xp: 90, tier: 'Medium', description: 'Take turns doing sit-ups. Parent holds feet. Who can do more in 1 minute?' },
            // FUN & CREATIVE challenges
            { id: 'family_dance', name: 'Martial Arts Dance-Off', icon: '💃', xp: 70, tier: 'Easy', description: 'Create a 30-second routine mixing kicks and punches. Perform it together!' },
            { id: 'family_mirror', name: 'Mirror Challenge', icon: '🪞', xp: 75, tier: 'Medium', description: 'One person leads with martial arts moves, the other mirrors exactly. Switch after 1 minute!' },
            { id: 'family_reaction', name: 'Reaction Time Test', icon: '⚡', xp: 85, tier: 'Medium', description: 'Parent drops a ruler, kid catches it. Measure where they caught it. Lower = faster reflexes!' },
            { id: 'family_stretch', name: 'Stretch Together', icon: '🤸', xp: 60, tier: 'Easy', description: 'Do a 5-minute stretching routine together. Touch toes, butterfly stretch, reach for the sky!' },
            { id: 'family_breathing', name: 'Calm Warrior Breathing', icon: '🧘', xp: 50, tier: 'Easy', description: 'Sit together, close eyes, breathe deeply for 2 minutes. Focus and relax like true warriors.' },
        ];

        // Weekly Challenges
        const weeklyChallenges = [
            { id: 'w1', name: 'Iron Fist Week', description: 'Win 5 Strength challenges', icon: '🥊', reward: '500 XP + Iron Fist Badge', progress: 3, total: 5, endsIn: '3 days' },
            { id: 'w2', name: 'Speed Demon', description: 'Complete 3 Speed challenges', icon: '⚡', reward: '300 XP + Lightning Badge', progress: 1, total: 3, endsIn: '3 days' },
            { id: 'w3', name: 'Perfect Form', description: 'Win Forms Accuracy with 90%+', icon: '🎯', reward: '200 XP + Master Badge', progress: 0, total: 1, endsIn: '3 days' },
        ];

        // Calculate category wins from challenge history (uses own history loaded on Rivals tab)
        const categoryCounts = challengeHistory.reduce((acc, entry) => {
            if (entry.status === 'VERIFIED' || entry.status === 'COMPLETED') {
                const cat = entry.category?.toLowerCase() || '';
                if (cat.includes('power') || cat.includes('strength')) acc.power++;
                else if (cat.includes('technique') || cat.includes('speed')) acc.technique++;
                else if (cat.includes('flexibility') || cat.includes('flex')) acc.flexibility++;
                acc.total++;
            }
            return acc;
        }, { power: 0, technique: 0, flexibility: 0, total: 0 });
        
        // Use rivalStats wins as fallback if no history loaded
        const totalWins = categoryCounts.total > 0 ? categoryCounts.total : rivalStats.wins;
        const powerWins = categoryCounts.power;
        const techniqueWins = categoryCounts.technique;
        const flexibilityWins = categoryCounts.flexibility;
        
        // Check if #1 on leaderboard
        const isChampion = leaderboard.length > 0 && leaderboard[0]?.isYou;

        // Available Badges - calculated from real data
        const allBadges = [
            { id: 'iron_fist', name: 'Iron Fist', icon: '🥊', description: 'Win 10 Power challenges', earned: powerWins >= 10, progress: powerWins, target: 10 },
            { id: 'lightning', name: 'Lightning', icon: '⚡', description: 'Win 5 Technique challenges', earned: techniqueWins >= 5, progress: techniqueWins, target: 5 },
            { id: 'flexible', name: 'Flex Master', icon: '🧘', description: 'Win 5 Flexibility challenges', earned: flexibilityWins >= 5, progress: flexibilityWins, target: 5 },
            { id: 'warrior', name: 'Warrior Spirit', icon: '⚔️', description: 'Win 20 total challenges', earned: totalWins >= 20, progress: totalWins, target: 20 },
            { id: 'streak5', name: 'On Fire', icon: '🔥', description: '5 win streak', earned: rivalStats.streak >= 5, progress: rivalStats.streak, target: 5 },
            { id: 'champion', name: 'Champion', icon: '👑', description: 'Reach #1 on leaderboard', earned: isChampion, progress: isChampion ? 1 : 0, target: 1 },
        ];

        const handleSendChallenge = async () => {
            if (!selectedRival || !selectedChallenge) return;
            
            const challenge = challengeCategories.flatMap(c => c.challenges).find(c => c.id === selectedChallenge);
            const opponent = classmates.find(c => c.id === selectedRival);
            
            const result = await realtimeSendChallenge({
                toStudentId: selectedRival,
                toStudentName: opponent?.name || 'Unknown',
                fromStudentId: student.id,
                fromStudentName: student.name,
                challengeId: selectedChallenge,
                challengeName: challenge?.name || selectedChallenge,
                challengeXp: challenge?.xp || 50
            });
            
            if (result) {
                const newChallenge: PendingChallenge = {
                    id: result.id,
                    fromId: student.id,
                    fromName: student.name,
                    toId: selectedRival,
                    toName: opponent?.name || 'Unknown',
                    challengeId: selectedChallenge,
                    challengeName: challenge?.name || selectedChallenge,
                    challengeXp: challenge?.xp || 50,
                    status: 'pending',
                    createdAt: 'Just now',
                    expiresIn: '24 hours'
                };
                setSentChallenges(prev => [newChallenge, ...prev]);
            }
            
            setChallengeSent(true);
            setSelectedRival('');
            setSelectedChallenge('');
            
            setTimeout(() => setChallengeSent(false), 3000);
        };

        const handleAcceptChallenge = (challenge: PendingChallenge) => {
            setActiveChallenge(challenge);
            setShowScoreSubmit(true);
            setMyScore('');
        };

        const handleDeclineChallengeAction = async (challengeId: string) => {
            await realtimeDeclineChallenge(challengeId);
            setPendingChallenges(prev => prev.filter(c => c.id !== challengeId));
        };

        const handleSubmitScore = async () => {
            if (!activeChallenge || !myScore) return;
            
            const score = parseInt(myScore);
            
            const result = await realtimeAcceptChallenge(activeChallenge.id, score);
            
            if (result) {
                const won = result.won;
                const streakMultiplier = getStreakMultiplier();
                const baseXp = result.xpEarned;
                const xpEarned = won ? Math.round(baseXp * streakMultiplier) : 10;
                
                if (won) {
                    setRivalStats(prev => ({ 
                        ...prev, 
                        wins: prev.wins + 1, 
                        streak: prev.streak + 1,
                        xp: prev.xp + xpEarned
                    }));
                    setDailyStreak(prev => prev + 1);
                    setLastChallengeDate(new Date().toISOString().split('T')[0]);
                } else {
                    setRivalStats(prev => ({ ...prev, losses: prev.losses + 1, streak: 0, xp: prev.xp + 10 }));
                }
                
                setChallengeResult(won ? 'win' : 'loss');
            }
            
            setPendingChallenges(prev => prev.filter(c => c.id !== activeChallenge.id));
            setShowScoreSubmit(false);
            setActiveChallenge(null);
            setMyScore('');
            setIsSimulatingChallenge(true);
            
            setTimeout(() => {
                setIsSimulatingChallenge(false);
                setChallengeResult(null);
            }, 3000);
        };

        return (
            <div className="relative h-full min-h-[500px]">
                <div className="space-y-4 pb-20">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-red-900 to-black p-4 rounded-xl border border-red-600/50 text-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        
                        
                        <h3 className="text-2xl font-black text-white italic tracking-tighter relative z-10">DOJANG RIVALS</h3>
                        <p className="text-red-400 font-bold uppercase tracking-widest text-[10px] relative z-10">Challenge. Compete. Win.</p>
                        
                        {/* Simplified Stats Bar - Rank + XP + Streak */}
                        <div className="flex justify-center gap-6 mt-3 relative z-10">
                            <div className="text-center">
                                <div className="text-2xl font-black text-cyan-400">#{leaderboard.find(p => p.isYou)?.rank || '-'}</div>
                                <div className="text-[10px] text-gray-400 uppercase">Rank</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-black text-purple-400">{serverTotalXP || apiLeaderboardData.find(s => s.id === student.id)?.totalXP || 0}</div>
                                <div className="text-[10px] text-gray-400 uppercase">Total XP</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-black text-yellow-400">{dailyStreak}🔥</div>
                                <div className="text-[10px] text-gray-400 uppercase">Streak</div>
                            </div>
                        </div>
                    </div>

                    {/* Streak & XP Multiplier Banner */}
                    {dailyStreak >= 3 && (
                        <div className="bg-gradient-to-r from-orange-900/50 to-yellow-900/50 p-3 rounded-xl border border-orange-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{dailyStreak >= 7 ? '🌟' : '🔥'}</span>
                                <div>
                                    <p className="text-white font-bold text-sm">{dailyStreak}-Day Streak!</p>
                                    <p className="text-orange-300 text-xs">
                                        {dailyStreak >= 7 ? '2x XP Bonus Active!' : '1.5x XP Bonus Active!'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-yellow-400 font-black text-lg">{getStreakMultiplier()}x</p>
                                <p className="text-gray-400 text-[10px] uppercase">Multiplier</p>
                            </div>
                        </div>
                    )}

                    {/* Navigation Tabs - Row 1 */}
                    <div className="flex gap-2 bg-gradient-to-r from-gray-800/80 to-gray-900/80 p-2 rounded-xl border border-gray-700/50">
                        {[
                            { id: 'arena', label: 'Arena', icon: '⚔️', badge: 0, color: 'from-red-600 to-orange-600', glow: 'shadow-red-500/30' },
                            { id: 'inbox', label: 'Inbox', icon: '📬', badge: totalPendingCount, color: 'from-blue-600 to-cyan-600', glow: 'shadow-blue-500/30' },
                            { id: 'mystery', label: 'Mystery', icon: '🎁', badge: mysteryCompleted ? 0 : 1, color: 'from-purple-600 to-pink-600', glow: 'shadow-purple-500/30' },
                            { id: 'leaderboard', label: 'Ranks', icon: '🏆', badge: 0, color: 'from-yellow-600 to-amber-600', glow: 'shadow-yellow-500/30' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setRivalsView(tab.id as typeof rivalsView)}
                                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition-all duration-300 relative transform ${
                                    rivalsView === tab.id 
                                        ? `bg-gradient-to-r ${tab.color} text-white shadow-lg ${tab.glow} scale-[1.02]` 
                                        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-[1.02]'
                                }`}
                            >
                                <span className={`mr-1 ${rivalsView === tab.id ? 'animate-bounce' : ''}`} style={{ display: 'inline-block', animationDuration: '1s' }}>{tab.icon}</span>
                                {tab.label}
                                {tab.badge > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-yellow-500/50 border border-yellow-300">
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    
                    {/* Navigation Tabs - Row 2 */}
                    <div className="flex gap-2 bg-gradient-to-r from-gray-800/80 to-gray-900/80 p-2 rounded-xl border border-gray-700/50">
                        {[
                            { id: 'teams', label: 'Team Battles', icon: '👥', badge: 0, color: 'from-green-600 to-emerald-600', glow: 'shadow-green-500/30' },
                            { id: 'family', label: 'Family Mode', icon: '👨‍👧', badge: 0, color: 'from-pink-600 to-rose-600', glow: 'shadow-pink-500/30' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setRivalsView(tab.id as typeof rivalsView)}
                                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition-all duration-300 relative transform ${
                                    rivalsView === tab.id 
                                        ? `bg-gradient-to-r ${tab.color} text-white shadow-lg ${tab.glow} scale-[1.02]` 
                                        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-[1.02]'
                                }`}
                            >
                                <span className={`mr-1 ${rivalsView === tab.id ? 'animate-bounce' : ''}`} style={{ display: 'inline-block', animationDuration: '1s' }}>{tab.icon}</span>
                                {tab.label}
                                {tab.badge > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-yellow-500/50 border border-yellow-300">
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {!isSimulatingChallenge ? (
                        <>
                            {/* ARENA VIEW */}
                            {rivalsView === 'arena' && (
                                <div className="space-y-4">
                                    {/* Badges Display */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {allBadges.filter(b => b.earned).map((badge, i) => (
                                            <div key={i} className="bg-gray-800 px-3 py-1.5 rounded-full border border-yellow-600/50 text-xs font-bold text-yellow-400 flex items-center whitespace-nowrap">
                                                <span className="mr-1">{badge.icon}</span> {badge.name}
                                            </div>
                                        ))}
                                        {allBadges.filter(b => b.earned).length === 0 && (
                                            <p className="text-gray-500 text-xs italic">Complete challenges to earn badges!</p>
                                        )}
                                    </div>

                                    {/* Challenge Categories - Coach Picks & Custom */}
                                    <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-5 rounded-2xl border border-gray-700 shadow-xl">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-bold text-white text-lg flex items-center">
                                                <span className="w-8 h-8 bg-red-600/20 rounded-lg flex items-center justify-center mr-3">🎮</span>
                                                Select Challenge
                                            </h4>
                                            {hasPremiumAccess && (
                                                <span className="text-[10px] bg-gradient-to-r from-purple-600 to-pink-600 text-white px-2 py-1 rounded-full font-bold">
                                                    ✓ Video Proof
                                                </span>
                                            )}
                                        </div>
                                        
                                        {challengeCategories.map((category, catIdx) => {
                                            const isFeatured = (category as any).isFeatured;
                                            return (
                                            <div key={category.name} className={`${catIdx > 0 ? 'mt-5 pt-5 border-t border-gray-700/50' : ''} ${
                                                isFeatured ? 'bg-gradient-to-br from-amber-900/20 to-amber-950/10 -mx-5 px-5 py-4 rounded-xl border border-amber-500/30' : ''
                                            }`}>
                                                <div className="flex items-center mb-3">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center mr-2 ${
                                                        isFeatured ? 'bg-amber-900/50 ring-1 ring-amber-500/50' :
                                                        category.name === 'Power' ? 'bg-red-900/50' :
                                                        category.name === 'Technique' ? 'bg-blue-900/50' :
                                                        category.name === 'Flexibility' ? 'bg-purple-900/50' : 
                                                        category.name === 'General' ? 'bg-blue-900/50' : 'bg-cyan-900/50'
                                                    }`}>
                                                        <span className="text-base">{category.icon}</span>
                                                    </div>
                                                    <span className={`text-sm font-bold ${isFeatured ? 'text-amber-300' : 'text-gray-300'}`}>{category.name}</span>
                                                    {isFeatured && (
                                                        <span className="ml-2 text-[9px] bg-gradient-to-r from-amber-500 to-yellow-500 text-black px-1.5 py-0.5 rounded-full font-bold">
                                                            FEATURED
                                                        </span>
                                                    )}
                                                    <span className="ml-2 text-[10px] text-gray-500">({category.challenges.length})</span>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {category.challenges.map(challenge => {
                                                        const isCompleted = isChallengeCompletedToday(challenge.id);
                                                        const challengeData = challenge as any;
                                                        const isCoachPick = challengeData.challengeType === 'coach_pick' || isFeatured;
                                                        return (
                                                        <button
                                                            key={challenge.id}
                                                            onClick={() => {
                                                            if (isCompleted) return;
                                                            setSoloResult(null); // Clear stale result from previous challenge
                                                            setSelectedChallenge(challenge.id);
                                                        }}
                                                            disabled={isCompleted}
                                                            className={`group relative p-3 rounded-xl text-center transition-all duration-200 border-2 ${
                                                                isCompleted
                                                                    ? 'bg-green-900/30 border-green-600/50 opacity-60 cursor-not-allowed'
                                                                    : selectedChallenge === challenge.id
                                                                    ? isCoachPick
                                                                        ? 'bg-gradient-to-br from-amber-900/60 to-amber-950/60 border-amber-500 shadow-lg shadow-amber-900/30 scale-[1.02]'
                                                                        : 'bg-gradient-to-br from-red-900/60 to-red-950/60 border-red-500 shadow-lg shadow-red-900/30 scale-[1.02]'
                                                                    : isCoachPick
                                                                        ? 'bg-amber-900/20 border-amber-700/50 hover:border-amber-500 hover:bg-amber-800/30'
                                                                        : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-500 hover:bg-gray-700/50'
                                                            }`}
                                                        >
                                                            {isCompleted ? (
                                                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                                                    <span className="text-white text-[10px]">✓</span>
                                                                </div>
                                                            ) : selectedChallenge === challenge.id && (
                                                                <div className={`absolute -top-1 -right-1 w-5 h-5 ${isCoachPick ? 'bg-amber-500' : 'bg-red-500'} rounded-full flex items-center justify-center`}>
                                                                    <span className="text-white text-[10px]">✓</span>
                                                                </div>
                                                            )}
                                                            {isCoachPick && !isCompleted && (
                                                                <div className="absolute -top-1 -left-1 text-[9px] bg-amber-500 text-black px-1 rounded font-bold">
                                                                    ⭐
                                                                </div>
                                                            )}
                                                            <div className="text-2xl mb-1.5 group-hover:scale-110 transition-transform">{challenge.icon}</div>
                                                            <div className="text-xs font-semibold text-gray-200 leading-tight">{challenge.name}</div>
                                                            <div className="mt-1 inline-block px-2 py-0.5 bg-yellow-900/30 rounded-full">
                                                                <span className="text-[10px] font-bold text-yellow-400">
                                                                    {isCompleted ? 'Done ✓' : `+${challenge.xp} XP`}
                                                                </span>
                                                            </div>
                                                            {challengeData.demoVideoUrl && (
                                                                <div className="mt-1 text-[9px] text-cyan-400">📺 Has Demo</div>
                                                            )}
                                                        </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>

                                    {/* WARRIOR'S GAUNTLET - Today's Challenges */}
                                    {gauntletData && gauntletData.challenges && gauntletData.challenges.length > 0 && (
                                        <div className="bg-gradient-to-b from-orange-900/30 to-gray-900 p-5 rounded-2xl border border-orange-500/50 shadow-xl">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center">
                                                    <span className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                                                        <span className="text-2xl">⚔️</span>
                                                    </span>
                                                    <div>
                                                        <h4 className="font-black text-white text-lg">Daily Training</h4>
                                                        <p className="text-orange-300 text-xs font-bold">
                                                            {gauntletData.dayTheme} {gauntletData.dayOfWeek.charAt(0) + gauntletData.dayOfWeek.slice(1).toLowerCase()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] bg-orange-600 text-white px-2 py-1 rounded-full font-bold">
                                                        Week {gauntletData.weekNumber}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 gap-3">
                                                {gauntletData.challenges.map((challenge, idx) => {
                                                    const isSelected = selectedGauntletChallenge === challenge.id;
                                                    const isCompleted = challenge.submittedThisWeek;
                                                    const sortLabel = challenge.sort_order === 'ASC' ? 'Lower is better' : 'Higher is better';
                                                    
                                                    return (
                                                        <div key={challenge.id}>
                                                            <button
                                                                onClick={() => {
                                                                    if (isCompleted) return;
                                                                    setGauntletResult(null); // Clear stale result from previous challenge
                                                                    setSelectedGauntletChallenge(isSelected ? null : challenge.id);
                                                                }}
                                                                disabled={isCompleted}
                                                                className={`w-full p-4 rounded-xl text-left transition-all border-2 ${
                                                                    isCompleted
                                                                        ? 'bg-green-900/30 border-green-600/50 opacity-70'
                                                                        : isSelected
                                                                        ? 'bg-gradient-to-r from-orange-900/60 to-red-900/60 border-orange-500 shadow-lg scale-[1.01]'
                                                                        : 'bg-gray-800/60 border-gray-700 hover:border-orange-500/50'
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between">
                                                                    <div className="flex items-start gap-3">
                                                                        <span className="text-3xl">{challenge.icon}</span>
                                                                        <div>
                                                                            <h5 className="font-bold text-white">{challenge.name}</h5>
                                                                            <p className="text-gray-400 text-xs mt-1">{challenge.description}</p>
                                                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                                                <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                                                                    {challenge.score_type} • {sortLabel}
                                                                                </span>
                                                                                {challenge.personalBest !== null && (
                                                                                    <span className="text-[10px] bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded font-bold">
                                                                                        PB: {challenge.personalBest} {challenge.pbHasVideo && '🥇'}
                                                                                    </span>
                                                                                )}
                                                                                {challenge.demo_video_url && (
                                                                                    <a 
                                                                                        href={challenge.demo_video_url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        className="text-[10px] bg-cyan-900/50 text-cyan-400 px-2 py-0.5 rounded font-bold hover:bg-cyan-800/50 transition-colors"
                                                                                    >
                                                                                        📺 Watch Demo
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        {isCompleted ? (
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-green-400 text-sm font-bold">Done ✓</span>
                                                                                <span className="text-gray-500 text-xs">Score: {challenge.thisWeekScore}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-yellow-400 text-sm font-bold">+20 XP</span>
                                                                                <span className="text-gray-500 text-[10px]">+40 with video</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </button>
                                                            
                                                            {/* Submission Form (inline when selected) */}
                                                            {isSelected && !isCompleted && (
                                                                <div className="mt-3 p-4 bg-gray-800/80 rounded-xl border border-orange-500/30">
                                                                    <div className="mb-3">
                                                                        <label className="text-gray-400 text-xs mb-1 block">Your Score</label>
                                                                        <input
                                                                            type="number"
                                                                            value={gauntletScore}
                                                                            onChange={e => setGauntletScore(e.target.value)}
                                                                            placeholder={`Enter your ${challenge.score_type.toLowerCase()}...`}
                                                                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-orange-500 focus:outline-none"
                                                                        />
                                                                        {challenge.personalBest !== null && (
                                                                            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-2 mt-2">
                                                                                <p className="text-yellow-400 text-sm font-bold">
                                                                                    🏆 Last time: {challenge.personalBest} {challenge.score_type.toLowerCase()}
                                                                                </p>
                                                                                <p className="text-yellow-300/80 text-xs mt-0.5">
                                                                                    Think you can beat your record this week?
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <button
                                                                            onClick={() => submitGauntletChallenge('TRUST')}
                                                                            disabled={!gauntletScore || gauntletSubmitting}
                                                                            className={`py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1 ${
                                                                                gauntletScore && !gauntletSubmitting
                                                                                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500'
                                                                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                            }`}
                                                                        >
                                                                            {gauntletSubmitting ? '...' : '✓ Trust +20 XP'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (!hasPremiumAccess) {
                                                                                    setShowUpgradeModal(true);
                                                                                } else {
                                                                                    setGauntletVideoMode(true);
                                                                                    setVideoScore(gauntletScore);
                                                                                    setShowVideoUpload(true);
                                                                                }
                                                                            }}
                                                                            disabled={!gauntletScore || gauntletSubmitting}
                                                                            className={`py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1 ${
                                                                                gauntletScore && !gauntletSubmitting
                                                                                    ? hasPremiumAccess
                                                                                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                                                                                        : 'bg-gray-700 border border-purple-500/50 text-purple-400'
                                                                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                            }`}
                                                                        >
                                                                            {!hasPremiumAccess && '🔒 '}📹 Video +40 XP
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Success/Result Message - shown even after completion */}
                                                            {isSelected && gauntletResult && (
                                                                <div className={`mt-3 p-4 rounded-xl text-center ${
                                                                    gauntletResult.success
                                                                        ? gauntletResult.isNewPB
                                                                            ? 'bg-gradient-to-br from-yellow-900/70 to-orange-900/70 border-2 border-yellow-500 shadow-lg shadow-yellow-500/20'
                                                                            : 'bg-green-900/50 border border-green-500'
                                                                        : 'bg-red-900/50 border border-red-500'
                                                                }`}>
                                                                    {gauntletResult.isNewPB ? (
                                                                        <>
                                                                            <div className="text-4xl mb-2">🏆🔥🏆</div>
                                                                            <p className="text-yellow-400 font-black text-lg animate-pulse">
                                                                                NEW PERSONAL BEST!
                                                                            </p>
                                                                            <p className="text-yellow-300 text-sm mt-1">
                                                                                You crushed your old record!
                                                                            </p>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className="text-2xl">{gauntletResult.success ? '✅' : '❌'}</span>
                                                                            <p className={`font-bold mt-1 ${
                                                                                gauntletResult.success ? 'text-green-400' : 'text-red-400'
                                                                            }`}>
                                                                                {gauntletResult.message}
                                                                            </p>
                                                                        </>
                                                                    )}
                                                                    {gauntletResult.xp > 0 && (
                                                                        <p className="text-yellow-400 font-black text-xl mt-2">+{gauntletResult.xp} XP!</p>
                                                                    )}
                                                                    {gauntletResult.pendingVerification && gauntletResult.pendingXp && gauntletResult.pendingXp > 0 && (
                                                                        <p className="text-purple-400 font-bold text-sm mt-2">⏳ +{gauntletResult.pendingXp} XP pending coach verification</p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            
                                            <div className="mt-4 pt-3 border-t border-orange-900/50 text-center">
                                                <p className="text-gray-500 text-xs">Resets weekly • Beat your personal best each week!</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Solo Challenge Submission */}
                                    {selectedChallenge && (() => {
                                        const selectedChallengeObj = challengeCategories.flatMap(c => c.challenges).find(ch => ch.id === selectedChallenge) as any;
                                        const isCoachPickChallenge = selectedChallengeObj?.challengeType === 'coach_pick' || selectedChallengeObj?.isCoachChallenge;
                                        const demoVideoLink = selectedChallengeObj?.demoVideoUrl;
                                        
                                        return (
                                        <div className={`p-5 rounded-2xl border shadow-xl ${
                                            isCoachPickChallenge 
                                                ? 'bg-gradient-to-b from-amber-900/40 to-gray-900 border-amber-500/50' 
                                                : 'bg-gradient-to-b from-green-900/40 to-gray-900 border-green-500/50'
                                        }`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="font-bold text-white text-lg flex items-center">
                                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${
                                                        isCoachPickChallenge ? 'bg-amber-600/30' : 'bg-green-600/30'
                                                    }`}>
                                                        {isCoachPickChallenge ? '🥋' : '🏋️'}
                                                    </span>
                                                    {isCoachPickChallenge ? 'Coach Pick Challenge' : 'Solo Practice'}
                                                </h4>
                                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                                                    isChallengeCompletedToday(selectedChallenge) 
                                                        ? 'bg-green-600 text-white' 
                                                        : isCoachPickChallenge
                                                            ? 'bg-amber-700 text-amber-200'
                                                            : 'bg-gray-700 text-gray-300'
                                                }`}>
                                                    {isChallengeCompletedToday(selectedChallenge) ? '✅ Completed' : isCoachPickChallenge ? '⭐ High Value' : 'Daily Mission'}
                                                </span>
                                            </div>
                                            
                                            <p className="text-gray-400 text-sm mb-4">
                                                {selectedChallengeObj?.description || 'Complete this challenge solo and earn XP!'}
                                            </p>
                                            
                                            {demoVideoLink && (
                                                <div className="mb-4 p-3 bg-cyan-900/30 rounded-xl border border-cyan-500/30">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xl">📺</span>
                                                            <div>
                                                                <p className="text-cyan-300 text-sm font-bold">Watch Demo First!</p>
                                                                <p className="text-gray-400 text-xs">Learn the proper technique before attempting</p>
                                                            </div>
                                                        </div>
                                                        <a 
                                                            href={demoVideoLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                                                        >
                                                            ▶️ Watch
                                                        </a>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Score Input */}
                                            <div className="mb-4">
                                                <label className="text-gray-400 text-xs mb-2 block">Your Score (reps, seconds, etc.)</label>
                                                <input
                                                    type="number"
                                                    value={soloScore}
                                                    onChange={e => setSoloScore(e.target.value)}
                                                    placeholder="Enter your score..."
                                                    className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-600 focus:border-green-500 focus:outline-none"
                                                />
                                            </div>
                                            
                                            {/* Submission Buttons */}
                                            <div className="space-y-3">
                                                {/* Trust Submission */}
                                                {(() => {
                                                    const selectedChallengeData = challengeCategories.flatMap(c => c.challenges).find(ch => ch.id === selectedChallenge);
                                                    const challengeXpValue = selectedChallengeData?.xp || 15;
                                                    return (
                                                        <>
                                                            <button
                                                                onClick={() => submitSoloChallenge('TRUST', undefined, challengeXpValue)}
                                                                disabled={!soloScore || soloSubmitting || isChallengeCompletedToday(selectedChallenge)}
                                                                className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                                                                    soloScore && !isChallengeCompletedToday(selectedChallenge) && !soloSubmitting
                                                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
                                                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                }`}
                                                            >
                                                                {soloSubmitting ? (
                                                                    <span>Submitting...</span>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-lg">✓</span>
                                                                        Submit (Trust System) • +{challengeXpValue} XP
                                                                    </>
                                                                )}
                                                            </button>
                                                            
                                                            {/* Video Proof Submission - 2x XP Multiplier */}
                                                            <button
                                                                onClick={() => {
                                                                    if (hasPremiumAccess) {
                                                                        setVideoScore(soloScore); // Pass score to video upload modal
                                                                        setShowVideoUpload(true);
                                                                    } else {
                                                                        setShowUpgradeModal(true);
                                                                    }
                                                                }}
                                                                disabled={!soloScore}
                                                                className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                                                                    soloScore
                                                                        ? hasPremiumAccess
                                                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                                                                            : 'bg-gray-700 border border-purple-500/50 text-purple-400 hover:bg-gray-600'
                                                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                }`}
                                                            >
                                                                {!hasPremiumAccess && <span className="text-lg">🔒</span>}
                                                                <span className="text-lg">📹</span>
                                                                Submit Video Proof • +{challengeXpValue * 2} XP
                                                                {!hasPremiumAccess && <span className="text-[10px] ml-1">PREMIUM</span>}
                                                            </button>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            
                                            {/* Solo Result Message */}
                                            {soloResult && (
                                                <div className={`mt-4 p-4 rounded-xl text-center ${
                                                    soloResult.success 
                                                        ? 'bg-green-900/50 border border-green-500' 
                                                        : 'bg-red-900/50 border border-red-500'
                                                }`}>
                                                    <span className="text-2xl">{soloResult.success ? '🎉' : '❌'}</span>
                                                    <p className={`font-bold mt-2 ${soloResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                                        {soloResult.message}
                                                    </p>
                                                    {soloResult.xp > 0 && (
                                                        <p className="text-yellow-400 font-black text-lg mt-1">+{soloResult.xp} XP!</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })()}

                                    {/* Upgrade to Premium Modal */}
                                    {showUpgradeModal && (
                                        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                                            <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-purple-500 shadow-2xl">
                                                <div className="text-center mb-6">
                                                    <span className="text-5xl">👑</span>
                                                    <h3 className="text-2xl font-black text-white mt-4">Unlock Video Proof</h3>
                                                    <p className="text-gray-400 mt-2">
                                                        Premium members can submit video proof for coach verification and earn <span className="text-yellow-400 font-bold">2x XP</span> per challenge!
                                                    </p>
                                                </div>
                                                
                                                <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 p-4 rounded-xl border border-purple-500/50 mb-6">
                                                    <h4 className="font-bold text-white mb-2">Premium Benefits:</h4>
                                                    <ul className="text-sm text-gray-300 space-y-2">
                                                        <li className="flex items-center gap-2"><span>✅</span> Video proof submissions (2x XP)</li>
                                                        <li className="flex items-center gap-2"><span>✅</span> Coach feedback on technique</li>
                                                        <li className="flex items-center gap-2"><span>✅</span> Progress analytics & insights</li>
                                                        <li className="flex items-center gap-2"><span>✅</span> Digital athlete card</li>
                                                    </ul>
                                                </div>
                                                
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => setShowUpgradeModal(false)}
                                                        className="flex-1 py-3 rounded-xl font-bold bg-gray-700 text-gray-300 hover:bg-gray-600"
                                                    >
                                                        Maybe Later
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowUpgradeModal(false);
                                                            setActiveTab('home');
                                                        }}
                                                        className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500"
                                                    >
                                                        Upgrade Now
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* VS Mode - Challenge a Friend (Secondary) */}
                                    {selectedChallenge && classmates.length > 0 && (
                                        <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/50 p-4 rounded-2xl border border-gray-700/50">
                                            <div className="flex items-center gap-3 mb-3">
                                                <span className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">⚔️</span>
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">Challenge a Friend</h4>
                                                    <p className="text-gray-500 text-xs">Optional: compete with a classmate</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mb-3 p-2 bg-green-900/20 rounded-lg border border-green-700/30">
                                                <span className="text-green-400 text-xs">⚖️</span>
                                                <span className="text-gray-400 text-xs">{studentBeltTier} tier • {fairMatchClassmates.length} fair matches</span>
                                            </div>
                                            <select 
                                                value={selectedRival} 
                                                onChange={e => setSelectedRival(e.target.value)}
                                                className="w-full bg-gray-800 text-white p-3 rounded-xl border border-gray-600 text-sm focus:border-blue-500 focus:outline-none"
                                            >
                                                <option value="">Solo Mode (no opponent)</option>
                                                {fairMatchClassmates.length > 0 && (
                                                    <optgroup label="Fair Match (Same Tier)">
                                                        {fairMatchClassmates.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name} • {data.belts.find(b => b.id === c.beltId)?.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {classmates.filter(c => !fairMatchClassmates.includes(c)).length > 0 && (
                                                    <optgroup label="All Others">
                                                        {classmates.filter(c => !fairMatchClassmates.includes(c)).map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name} • {data.belts.find(b => b.id === c.beltId)?.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>
                                            {selectedRival && (
                                                <button 
                                                    onClick={handleSendChallenge}
                                                    className="w-full mt-3 py-3 rounded-xl font-bold bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <span>⚔️</span> Send Challenge to {classmates.find(c => c.id === selectedRival)?.name}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Challenge Sent Confirmation */}
                                    {challengeSent && (
                                        <div className="bg-green-900/50 border border-green-500 p-4 rounded-xl text-center animate-pulse">
                                            <span className="text-2xl">✅</span>
                                            <p className="text-green-400 font-bold mt-2">Challenge Sent!</p>
                                            <p className="text-gray-400 text-xs">They have 24 hours to respond</p>
                                        </div>
                                    )}

                                    {/* My Video Submissions - Premium Only */}
                                    {hasPremiumAccess && myVideos.length > 0 && (
                                        <div className="bg-gray-800/50 p-4 rounded-xl border border-purple-500/30">
                                            <h5 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                                                <span>📹</span> My Video Submissions
                                            </h5>
                                            <div className="space-y-3 max-h-64 overflow-y-auto">
                                                {myVideos.map(video => (
                                                    <div key={video.id} className={`bg-gray-700/50 p-3 rounded-lg border-l-4 ${
                                                        video.status === 'pending' ? 'border-yellow-500' : 
                                                        video.status === 'approved' ? 'border-green-500' : 'border-red-500'
                                                    }`}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-lg">
                                                                    {video.status === 'pending' ? '⏳' : video.status === 'approved' ? '✅' : '❌'}
                                                                </span>
                                                                <div>
                                                                    <p className="text-sm text-white font-medium">{video.challengeName}</p>
                                                                    <p className="text-xs text-gray-500">
                                                                        {video.status === 'pending' && 'Awaiting coach review'}
                                                                        {video.status === 'approved' && !video.coachNotes && `Verified! ${video.voteCount} votes`}
                                                                        {video.status === 'rejected' && !video.coachNotes && 'Not approved'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                                video.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' :
                                                                video.status === 'approved' ? 'bg-green-900/50 text-green-400' : 
                                                                'bg-red-900/50 text-red-400'
                                                            }`}>
                                                                {video.status === 'pending' ? 'Pending' : video.status === 'approved' ? 'Approved' : 'Rejected'}
                                                            </span>
                                                        </div>
                                                        {video.coachNotes && (
                                                            <div className={`mt-2 p-2 rounded-lg text-sm ${
                                                                video.status === 'approved' ? 'bg-green-900/30 border border-green-700/50' : 
                                                                'bg-red-900/30 border border-red-700/50'
                                                            }`}>
                                                                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                                                                    <span>💬</span> Coach Feedback:
                                                                </p>
                                                                <p className={`${video.status === 'approved' ? 'text-green-300' : 'text-red-300'}`}>
                                                                    {video.coachNotes}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Video Upload Modal */}
                                    {showVideoUpload && (
                                        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
                                            <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-purple-500 shadow-2xl">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                                                        <span className="text-2xl">🎬</span> Video Proof
                                                    </h3>
                                                    <button 
                                                        onClick={() => {
                                                            setShowVideoUpload(false);
                                                            setVideoFile(null);
                                                            setVideoUploadError(null);
                                                            setGauntletVideoMode(false);
                                                        }}
                                                        className="text-gray-400 hover:text-white text-2xl"
                                                    >
                                                        ×
                                                    </button>
                                                </div>

                                                {/* Challenge Info */}
                                                <div className="bg-gray-800 rounded-xl p-4 mb-4">
                                                    <p className="text-gray-400 text-xs mb-1">Submitting for:</p>
                                                    <p className="text-white font-bold">
                                                        {gauntletVideoMode 
                                                            ? gauntletData?.challenges?.find((c: any) => c.id === selectedGauntletChallenge)?.name || 'Daily Training Challenge'
                                                            : challengeCategories.flatMap(c => c.challenges).find(ch => ch.id === selectedChallenge)?.name || 'Unknown Challenge'}
                                                    </p>
                                                    {videoScore && (
                                                        <p className={`text-sm mt-1 ${gauntletVideoMode ? 'text-orange-400' : 'text-green-400'}`}>
                                                            ✅ Score: {videoScore}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* File Upload Area */}
                                                <div 
                                                    onClick={() => videoInputRef.current?.click()}
                                                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                                                        videoFile 
                                                            ? 'border-purple-500 bg-purple-900/20' 
                                                            : 'border-gray-600 hover:border-purple-400 hover:bg-gray-800/50'
                                                    }`}
                                                >
                                                    <input
                                                        ref={videoInputRef}
                                                        type="file"
                                                        accept="video/*"
                                                        onChange={handleVideoFileChange}
                                                        className="hidden"
                                                    />
                                                    {videoFile ? (
                                                        <div>
                                                            <span className="text-4xl">✅</span>
                                                            <p className="text-white font-bold mt-2">{videoFile.name}</p>
                                                            <p className="text-gray-400 text-xs mt-1">
                                                                {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <span className="text-4xl">📹</span>
                                                            <p className="text-gray-300 font-medium mt-2">Tap to select video</p>
                                                            <p className="text-gray-500 text-xs mt-1">MP4, MOV, WEBM • Max 100MB</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Upload Progress */}
                                                {isUploadingVideo && (
                                                    <div className="mt-4">
                                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                            <span>Uploading...</span>
                                                            <span>{videoUploadProgress}%</span>
                                                        </div>
                                                        <div className="w-full bg-gray-700 rounded-full h-2">
                                                            <div 
                                                                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                                                                style={{ width: `${videoUploadProgress}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Error Message */}
                                                {videoUploadError && (
                                                    <div className="mt-4 bg-red-900/50 border border-red-500 p-3 rounded-lg">
                                                        <p className="text-red-400 text-sm text-center">{videoUploadError}</p>
                                                    </div>
                                                )}

                                                {/* Submit Button */}
                                                <button
                                                    onClick={handleVideoUpload}
                                                    disabled={!videoFile || isUploadingVideo || !videoScore}
                                                    className={`w-full mt-4 py-4 rounded-xl font-bold text-lg transition-all ${
                                                        videoFile && !isUploadingVideo && videoScore
                                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg'
                                                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {isUploadingVideo ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <span className="animate-spin">⏳</span> Uploading...
                                                        </span>
                                                    ) : videoUploadProgress === 100 ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <span>✅</span> Submitted!
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <span>🚀</span> Submit for Verification
                                                        </span>
                                                    )}
                                                </button>

                                                <p className="text-gray-500 text-xs text-center mt-3">
                                                    Your coach will review and verify your video within 24 hours
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* INBOX VIEW */}
                            {rivalsView === 'inbox' && (
                                <div className="space-y-4">
                                    {/* Score Submit Modal */}
                                    {showScoreSubmit && activeChallenge && (
                                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                                            <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-red-500">
                                                <h3 className="text-xl font-black text-white text-center mb-4">Submit Your Score</h3>
                                                <div className="text-center mb-6">
                                                    <div className="text-4xl mb-2">🎯</div>
                                                    <p className="text-gray-400 text-sm">{activeChallenge.challengeName}</p>
                                                    <p className="text-xs text-gray-500">vs {activeChallenge.fromName}</p>
                                                </div>
                                                <div className="mb-4">
                                                    <label className="text-gray-400 text-xs block mb-2">Your Score (reps, seconds, etc.)</label>
                                                    <input
                                                        type="number"
                                                        value={myScore}
                                                        onChange={(e) => setMyScore(e.target.value)}
                                                        placeholder="Enter your score..."
                                                        className="w-full bg-gray-800 text-white text-2xl font-bold text-center p-4 rounded-xl border border-gray-600 focus:border-red-500 focus:outline-none"
                                                    />
                                                </div>
                                                <div className="flex gap-3">
                                                    <button 
                                                        onClick={() => {
                                                            setShowScoreSubmit(false);
                                                            setActiveChallenge(null);
                                                        }}
                                                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button 
                                                        onClick={handleSubmitScore}
                                                        disabled={!myScore}
                                                        className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-bold py-3 rounded-xl"
                                                    >
                                                        Submit
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Inbox Header */}
                                    <div className="bg-gradient-to-r from-orange-900/50 to-red-900/50 p-4 rounded-xl border border-orange-500/30">
                                        <h4 className="font-bold text-white flex items-center">
                                            <span className="mr-2">📬</span> Challenge Inbox
                                        </h4>
                                        <p className="text-xs text-gray-400">Accept challenges to compete!</p>
                                    </div>

                                    {/* Inbox Tabs */}
                                    <div className="flex bg-gray-800 rounded-lg p-1">
                                        <button
                                            onClick={() => setInboxTab('received')}
                                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                                                inboxTab === 'received' ? 'bg-orange-600 text-white' : 'text-gray-400'
                                            }`}
                                        >
                                            Received ({mergedReceivedChallenges.filter(c => c.status === 'pending').length})
                                        </button>
                                        <button
                                            onClick={() => setInboxTab('sent')}
                                            className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                                                inboxTab === 'sent' ? 'bg-orange-600 text-white' : 'text-gray-400'
                                            }`}
                                        >
                                            Sent ({mergedSentChallenges.length})
                                        </button>
                                    </div>

                                    {/* Received Challenges */}
                                    {inboxTab === 'received' && (
                                        <div className="space-y-3">
                                            {mergedReceivedChallenges.filter(c => c.status === 'pending').length === 0 ? (
                                                <div className="text-center py-12">
                                                    <div className="text-5xl mb-4">📭</div>
                                                    <p className="text-gray-500 font-bold">No pending challenges</p>
                                                    <p className="text-gray-600 text-xs">When someone challenges you, it'll appear here!</p>
                                                </div>
                                            ) : (
                                                mergedReceivedChallenges.filter(c => c.status === 'pending').map(challenge => (
                                                    <div key={challenge.id} className="bg-gray-800 rounded-xl border border-orange-500/30 overflow-hidden">
                                                        <div className="p-4">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center">
                                                                    <div className="w-10 h-10 bg-red-900/50 rounded-full flex items-center justify-center text-lg mr-3">
                                                                        ⚔️
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-bold text-white text-sm">{challenge.fromName}</p>
                                                                        <p className="text-xs text-gray-500">{challenge.createdAt}</p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] text-orange-400 font-bold bg-orange-900/30 px-2 py-1 rounded-full">
                                                                    ⏰ {challenge.expiresIn}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="bg-gray-900/50 rounded-lg p-3 mb-3">
                                                                <p className="text-xs text-gray-400 mb-1">Challenge:</p>
                                                                <p className="text-white font-bold">{challenge.challengeName}</p>
                                                                <p className="text-yellow-500 text-xs mt-1">+{challenge.challengeXp} XP if you win</p>
                                                            </div>
                                                            
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    onClick={() => handleDeclineChallengeAction(challenge.id)}
                                                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-2.5 rounded-lg text-sm transition-colors"
                                                                >
                                                                    Decline
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleAcceptChallenge(challenge)}
                                                                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                                                                >
                                                                    Accept & Submit Score
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* Sent Challenges */}
                                    {inboxTab === 'sent' && (
                                        <div className="space-y-3">
                                            {mergedSentChallenges.length === 0 ? (
                                                <div className="text-center py-12">
                                                    <div className="text-5xl mb-4">📤</div>
                                                    <p className="text-gray-500 font-bold">No challenges sent</p>
                                                    <p className="text-gray-600 text-xs">Go to Arena to challenge a rival!</p>
                                                </div>
                                            ) : (
                                                mergedSentChallenges.map(challenge => (
                                                    <div key={challenge.id} className="bg-gray-800 rounded-xl border border-blue-500/30 p-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center">
                                                                <div className="w-10 h-10 bg-blue-900/50 rounded-full flex items-center justify-center text-lg mr-3">
                                                                    📨
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-400 text-xs">Challenged:</p>
                                                                    <p className="font-bold text-white text-sm">{challenge.toName}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                                                    challenge.status === 'pending' 
                                                                        ? 'bg-yellow-900/30 text-yellow-400' 
                                                                        : challenge.status === 'accepted'
                                                                        ? 'bg-green-900/30 text-green-400'
                                                                        : 'bg-red-900/30 text-red-400'
                                                                }`}>
                                                                    {challenge.status === 'pending' ? '⏳ Waiting' : 
                                                                     challenge.status === 'accepted' ? '✅ Accepted' : '❌ Declined'}
                                                                </span>
                                                                <p className="text-[10px] text-gray-500 mt-1">{challenge.createdAt}</p>
                                                            </div>
                                                        </div>
                                                        <div className="bg-gray-900/50 rounded-lg p-2 mt-2">
                                                            <p className="text-white font-bold text-sm">{challenge.challengeName}</p>
                                                            <p className="text-gray-500 text-xs">Expires in {challenge.expiresIn}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* WEEKLY CHALLENGES VIEW */}
                            {rivalsView === 'weekly' && (
                                <div className="space-y-3">
                                    <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 p-4 rounded-xl border border-purple-500/30">
                                        <h4 className="font-bold text-white flex items-center mb-1">
                                            <span className="mr-2">🎯</span> Weekly Challenges
                                        </h4>
                                        <p className="text-xs text-gray-400">Complete special challenges for bonus rewards!</p>
                                    </div>
                                    
                                    {weeklyChallenges.map(challenge => (
                                        <div key={challenge.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center">
                                                    <span className="text-2xl mr-3">{challenge.icon}</span>
                                                    <div>
                                                        <h5 className="font-bold text-white text-sm">{challenge.name}</h5>
                                                        <p className="text-xs text-gray-400">{challenge.description}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-red-400 font-bold">{challenge.endsIn}</span>
                                            </div>
                                            
                                            {/* Progress Bar */}
                                            <div className="mt-3">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-400">{challenge.progress}/{challenge.total}</span>
                                                    <span className="text-yellow-400">{challenge.reward}</span>
                                                </div>
                                                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                                                        style={{ width: `${(challenge.progress / challenge.total) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* LEADERBOARD VIEW - Dual Mode: Monthly / All-Time */}
                            {rivalsView === 'leaderboard' && (
                                <div className="space-y-2">
                                    <div className="bg-gradient-to-r from-yellow-900/50 to-orange-900/50 p-4 rounded-xl border border-yellow-500/30 mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-bold text-white flex items-center">
                                                <span className="mr-2">🏆</span> Dojang Leaderboard
                                            </h4>
                                            <div className="flex text-xs">
                                                <button 
                                                    onClick={() => setLeaderboardMode('monthly')}
                                                    className={`px-3 py-1 rounded-l-lg font-bold transition-all ${
                                                        leaderboardMode === 'monthly' 
                                                            ? 'bg-purple-600 text-white' 
                                                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                    }`}
                                                >This Month</button>
                                                <button 
                                                    onClick={() => setLeaderboardMode('alltime')}
                                                    className={`px-3 py-1 rounded-r-lg font-bold transition-all ${
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
                                    
                                    {leaderboard.filter(p => p.displayXP > 0).length === 0 ? (
                                        <p className="text-gray-500 text-center py-8 italic">
                                            {leaderboardMode === 'monthly' 
                                                ? 'No XP earned this month yet. Start training!' 
                                                : 'No XP recorded yet. Complete challenges to rank up!'}
                                        </p>
                                    ) : (
                                        leaderboard.filter(p => p.displayXP > 0).map((player) => {
                                            const fullStudent = data.students.find(s => s.id === player.id);
                                            const canViewHistory = player.isYou;
                                            return (
                                            <div 
                                                key={player.id} 
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                                    player.isYou 
                                                        ? 'bg-cyan-900/30 border-cyan-500/50 hover:border-cyan-400 cursor-pointer hover:scale-[1.02]' 
                                                        : 'bg-gray-800 border-gray-700'
                                                }`}
                                                onClick={() => canViewHistory && fullStudent && fetchStudentHistory(fullStudent)}
                                            >
                                                <div className="flex items-center">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mr-3 ${
                                                        player.rank === 1 ? 'bg-yellow-500 text-black' :
                                                        player.rank === 2 ? 'bg-gray-400 text-black' :
                                                        player.rank === 3 ? 'bg-orange-600 text-white' :
                                                        'bg-gray-700 text-gray-400'
                                                    }`}>
                                                        {player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : player.rank}
                                                    </div>
                                                    <div>
                                                        <p className={`font-bold text-sm ${player.isYou ? 'text-cyan-400' : 'text-white'}`}>
                                                            {player.name} {player.isYou && '(You)'}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">
                                                            {data.belts.find(b => b.id === player.beltId)?.name || 'Student'}{player.isYou && ' • Tap to view history'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-2">
                                                    <p className="font-bold text-purple-400">{player.displayXP.toLocaleString()} XP</p>
                                                    {player.isYou && <span className="text-gray-500 text-xs">→</span>}
                                                </div>
                                            </div>
                                        );
                                        })
                                    )}
                                </div>
                            )}

                            {/* MYSTERY CHALLENGE VIEW - AI-powered Daily Quiz */}
                            {rivalsView === 'mystery' && (
                                <div className="space-y-4">
                                    <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 p-4 rounded-xl border border-purple-500/30 text-center">
                                        <h4 className="font-bold text-white flex items-center justify-center mb-2">
                                            <span className="mr-2 text-2xl">🎁</span> Daily Mystery Challenge
                                        </h4>
                                        <p className="text-xs text-purple-300">AI-powered daily quiz - test your martial arts knowledge!</p>
                                    </div>
                                    
                                    {loadingMysteryChallenge ? (
                                        <div className="bg-gray-800 rounded-xl border border-purple-500/30 p-8 text-center">
                                            <div className="text-5xl mb-4 animate-spin">🎁</div>
                                            <p className="text-purple-300">Generating your mystery challenge...</p>
                                        </div>
                                    ) : mysteryCompleted ? (
                                        <div className="bg-gray-800 rounded-xl border border-green-500/30 p-6 text-center">
                                            <div className="text-6xl mb-4">{mysteryWasCorrect ? '🎉' : '📚'}</div>
                                            <h4 className={`text-xl font-bold mb-2 ${mysteryWasCorrect ? 'text-green-400' : 'text-yellow-400'}`}>
                                                {mysteryWasCorrect ? 'Correct!' : 'Good Try!'}
                                            </h4>
                                            <p className="text-gray-300 text-sm mb-3">{mysteryCompletionMessage}</p>
                                            {quizExplanation && (
                                                <div className="bg-gray-700/50 rounded-lg p-3 mb-4 text-left">
                                                    <p className="text-xs text-gray-400 mb-1">Explanation:</p>
                                                    <p className="text-sm text-purple-200">{quizExplanation}</p>
                                                </div>
                                            )}
                                            <div className="bg-yellow-900/30 rounded-lg p-3 border border-yellow-500/30">
                                                <p className="text-yellow-400 font-bold">+{mysteryXpAwarded} XP earned!</p>
                                            </div>
                                            <p className="text-gray-500 text-xs mt-4">Come back tomorrow for a new challenge!</p>
                                        </div>
                                    ) : mysteryChallenge ? (
                                        <div className="bg-gray-800 rounded-xl border border-purple-500/50 overflow-hidden">
                                            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 text-center">
                                                <div className="text-4xl mb-2">🧠</div>
                                                <h4 className="text-lg font-black text-white">{mysteryChallenge.title}</h4>
                                                <p className="text-purple-200 text-xs">{mysteryChallenge.description}</p>
                                            </div>
                                            <div className="p-4">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-gray-400 text-sm">Reward:</span>
                                                    <span className="text-yellow-400 font-black text-lg">+{mysteryChallenge.xpReward} XP</span>
                                                </div>
                                                
                                                {mysteryChallenge.type === 'quiz' && mysteryChallenge.quizData ? (
                                                    <div className="space-y-3">
                                                        <div className="bg-gray-700/50 rounded-lg p-4 mb-4">
                                                            <p className="text-white font-medium text-sm">{mysteryChallenge.quizData.question}</p>
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            {mysteryChallenge.quizData.options.map((option, index) => (
                                                                <button
                                                                    key={index}
                                                                    onClick={() => setSelectedQuizAnswer(index)}
                                                                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                                                                        selectedQuizAnswer === index
                                                                            ? 'bg-purple-600/30 border-purple-500 text-white'
                                                                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-purple-500/50'
                                                                    }`}
                                                                >
                                                                    <span className="font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
                                                                    {option}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        
                                                        <button
                                                            onClick={() => {
                                                                if (selectedQuizAnswer !== null && !submittingMystery) {
                                                                    submitMysteryChallenge(selectedQuizAnswer);
                                                                }
                                                            }}
                                                            disabled={selectedQuizAnswer === null || submittingMystery}
                                                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all mt-4 flex items-center justify-center"
                                                        >
                                                            {submittingMystery ? (
                                                                <>
                                                                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                                                    </svg>
                                                                    Submitting...
                                                                </>
                                                            ) : (
                                                                'Submit Answer'
                                                            )}
                                                        </button>
                                                        
                                                        {/* Debug indicator */}
                                                        <p className={`text-[10px] mt-3 text-center ${mysterySource === 'api' ? 'text-green-500' : 'text-orange-500'}`}>
                                                            Source: {mysterySource === 'api' ? 'API (Dynamic)' : 'Static (Fallback)'}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-4">
                                                        <p className="text-gray-400 text-sm">Challenge type not yet supported. Check back later!</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-800 rounded-xl border border-gray-600 p-6 text-center">
                                            <div className="text-4xl mb-4">🎁</div>
                                            <p className="text-gray-400">No challenge available right now.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TEAM BATTLES VIEW - Coming Soon */}
                            {rivalsView === 'teams' && (
                                <div className="space-y-4">
                                    <div className="bg-gradient-to-r from-blue-900/50 to-cyan-900/50 p-4 rounded-xl border border-blue-500/30">
                                        <h4 className="font-bold text-white flex items-center">
                                            <span className="mr-2">👥</span> Team Battles
                                            <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Coming Soon</span>
                                        </h4>
                                        <p className="text-xs text-blue-300">Team up with classmates for combined challenges!</p>
                                    </div>
                                    
                                    <div className="bg-gray-800/30 p-8 rounded-xl border border-gray-700 text-center">
                                        <div className="text-6xl mb-4">🚀</div>
                                        <h5 className="font-bold text-white text-lg mb-2">Team Battles Coming Soon!</h5>
                                        <p className="text-gray-400 text-sm mb-4">
                                            We're working hard to bring you an exciting team-based challenge experience.
                                        </p>
                                        <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-500/20">
                                            <h6 className="font-bold text-blue-300 text-sm mb-2">What to expect:</h6>
                                            <ul className="text-gray-400 text-xs space-y-1 text-left">
                                                <li>• Build squads with 2-3 classmates</li>
                                                <li>• Combined scores from all team members</li>
                                                <li>• XP split equally among teammates</li>
                                                <li>• Fair matchmaking by belt level</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* FAMILY CHALLENGES VIEW */}
                            {rivalsView === 'family' && (
                                <div className="space-y-4">
                                    {/* Family Challenge Result Feedback */}
                                    {familyResult && (
                                        <div className={`p-4 rounded-xl border-2 text-center animate-pulse ${
                                            familyResult.won 
                                                ? 'bg-gradient-to-r from-green-900/80 to-emerald-900/80 border-green-500' 
                                                : 'bg-gradient-to-r from-orange-900/80 to-yellow-900/80 border-orange-500'
                                        }`}>
                                            <div className="text-4xl mb-2">{familyResult.won ? '🏆' : '💪'}</div>
                                            <h4 className="font-black text-white text-xl mb-1">
                                                {familyResult.won ? 'YOU WON!' : 'GREAT EFFORT!'}
                                            </h4>
                                            <p className="text-gray-200 text-sm mb-2">{familyResult.challengeName}</p>
                                            <div className={`inline-block px-4 py-2 rounded-full font-bold ${
                                                familyResult.won ? 'bg-green-600 text-white' : 'bg-orange-600 text-white'
                                            }`}>
                                                +{familyResult.xp} XP {familyResult.won ? 'Winner Bonus!' : 'Participation!'}
                                            </div>
                                            <p className="text-gray-400 text-xs mt-2">
                                                {familyResult.won 
                                                    ? 'Amazing work! Keep training with your family!' 
                                                    : 'You still earned XP! Practice makes perfect!'}
                                            </p>
                                        </div>
                                    )}
                                    
                                    <div className="bg-gradient-to-r from-pink-900/50 to-red-900/50 p-4 rounded-xl border border-pink-500/30">
                                        <h4 className="font-bold text-white flex items-center">
                                            <span className="mr-2">👨‍👧</span> Family Challenges
                                        </h4>
                                        <p className="text-xs text-pink-300">Challenge your parents at home for bonus XP!</p>
                                    </div>
                                    
                                    <div className="grid gap-3">
                                        {familyChallenges.map(challenge => {
                                            const isCompletedToday = isFamilyChallengeCompletedToday(challenge.id);
                                            return (
                                            <div 
                                                key={challenge.id}
                                                className={`bg-gray-800 rounded-xl border overflow-hidden transition-all ${
                                                    isCompletedToday
                                                        ? 'border-green-500/50 opacity-75'
                                                        : activeFamilyChallenge === challenge.id 
                                                            ? 'border-pink-500/50' 
                                                            : 'border-gray-700 hover:border-pink-500/30'
                                                }`}
                                            >
                                                <div 
                                                    onClick={() => {
                                                        if (isCompletedToday) return; // Block if already done today
                                                        setActiveFamilyChallenge(
                                                            activeFamilyChallenge === challenge.id ? null : challenge.id
                                                        );
                                                    }}
                                                    className={`flex items-center justify-between p-4 ${isCompletedToday ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                                >
                                                    <div className="flex items-center">
                                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mr-3 ${
                                                            isCompletedToday ? 'bg-green-900/50' : 'bg-pink-900/50'
                                                        }`}>
                                                            {isCompletedToday ? '✅' : challenge.icon}
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-bold text-sm flex items-center gap-2">
                                                                {challenge.name}
                                                                {isCompletedToday && (
                                                                    <span className="text-[10px] bg-green-600/30 text-green-400 px-2 py-0.5 rounded-full">Done Today</span>
                                                                )}
                                                            </p>
                                                            <p className="text-gray-400 text-[10px]">{challenge.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        {isCompletedToday ? (
                                                            <p className="text-green-400 font-bold text-sm">Completed!</p>
                                                        ) : (
                                                            <>
                                                                <p className="text-yellow-400 font-bold">+{challenge.xp} XP</p>
                                                                <p className="text-gray-500 text-[10px]">for winner</p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {activeFamilyChallenge === challenge.id && (
                                                    <div className="border-t border-gray-700 p-4 bg-gray-900/50">
                                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                                            <div>
                                                                <label className="text-gray-400 text-xs block mb-1">Your Score</label>
                                                                <input
                                                                    type="number"
                                                                    placeholder="0"
                                                                    value={myScore}
                                                                    onChange={(e) => setMyScore(e.target.value)}
                                                                    className="w-full bg-gray-700 text-white p-2 rounded-lg text-center"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-gray-400 text-xs block mb-1">Parent's Score</label>
                                                                <input
                                                                    type="number"
                                                                    placeholder="0"
                                                                    value={parentScore}
                                                                    onChange={(e) => setParentScore(e.target.value)}
                                                                    className="w-full bg-gray-700 text-white p-2 rounded-lg text-center"
                                                                />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (!myScore || !parentScore) return;
                                                                const won = parseInt(myScore) > parseInt(parentScore);
                                                                
                                                                // Submit to backend - XP calculated server-side
                                                                const result = await submitFamilyChallenge(challenge.id, won);
                                                                
                                                                if (result.alreadyCompleted) {
                                                                    setFamilyResult({ show: true, won: false, xp: 0, challengeName: challenge.name + ' (already completed today)' });
                                                                    setTimeout(() => setFamilyResult(null), 4000);
                                                                    setActiveFamilyChallenge(null);
                                                                    setMyScore('');
                                                                    setParentScore('');
                                                                    return;
                                                                }
                                                                
                                                                if (result.success) {
                                                                    const xpAwarded = result.xpAwarded || 0;
                                                                    setRivalStats(prev => ({
                                                                        ...prev,
                                                                        wins: won ? prev.wins + 1 : prev.wins,
                                                                        losses: won ? prev.losses : prev.losses + 1,
                                                                        streak: won ? prev.streak + 1 : 0,
                                                                        xp: prev.xp + xpAwarded
                                                                    }));
                                                                    
                                                                    if (won) setDailyStreak(prev => prev + 1);
                                                                    setFamilyChallengesCompleted(prev => prev + 1);
                                                                    setLastChallengeDate(new Date().toISOString().split('T')[0]);
                                                                    
                                                                    // Show result feedback with server-calculated XP
                                                                    setFamilyResult({ show: true, won, xp: xpAwarded, challengeName: challenge.name });
                                                                }
                                                                
                                                                // Auto-hide after 4 seconds
                                                                setTimeout(() => setFamilyResult(null), 4000);
                                                                
                                                                setActiveFamilyChallenge(null);
                                                                setMyScore('');
                                                                setParentScore('');
                                                            }}
                                                            disabled={!myScore || !parentScore || familyChallengeSubmitting}
                                                            className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors"
                                                        >
                                                            {familyChallengeSubmitting ? 'Submitting...' : 'Submit Results'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                        })}
                                    </div>
                                    
                                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                                        <h5 className="font-bold text-white mb-2 text-sm flex items-center">
                                            <span className="mr-2">💝</span> Family Bonding Benefits
                                        </h5>
                                        <ul className="text-gray-400 text-xs space-y-1">
                                            <li>• Kids earn XP even when they lose (50%)</li>
                                            <li>• Parents can let kids win for morale!</li>
                                            <li>• Great for practicing at home</li>
                                            <li>• Builds family martial arts culture</li>
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        // Battle Simulation Screen
                        <div className="bg-black rounded-xl border-2 border-red-600 p-8 text-center min-h-[350px] flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-red-900/20 animate-pulse"></div>
                            
                            {challengeResult === 'pending' ? (
                                <>
                                    <div className="text-7xl mb-6 animate-bounce">⚔️</div>
                                    <h3 className="text-2xl font-black text-white italic mb-2">BATTLE IN PROGRESS...</h3>
                                    <p className="text-gray-400 text-sm">
                                        {challengeCategories.flatMap(c => c.challenges).find(c => c.id === selectedChallenge)?.name || 'Challenge'}
                                    </p>
                                    <div className="mt-6 flex gap-2">
                                        {[...Array(3)].map((_, i) => (
                                            <div key={i} className="w-3 h-3 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}></div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-7xl mb-4">{challengeResult === 'win' ? '👑' : '💀'}</div>
                                    <h3 className={`text-4xl font-black italic mb-2 ${challengeResult === 'win' ? 'text-yellow-400' : 'text-gray-500'}`}>
                                        {challengeResult === 'win' ? 'VICTORY!' : 'DEFEAT'}
                                    </h3>
                                    {challengeResult === 'win' ? (
                                        <div className="space-y-2">
                                            <p className="text-green-400 font-bold animate-pulse">
                                                +{challengeCategories.flatMap(c => c.challenges).find(c => c.id === selectedChallenge)?.xp || 50} XP Earned!
                                            </p>
                                            <p className="text-yellow-400 text-sm">🔥 Streak: {rivalStats.streak}</p>
                                        </div>
                                    ) : (
                                        <p className="text-gray-400 text-sm">+10 XP for trying. Keep training!</p>
                                    )}
                                    <button 
                                        onClick={() => {
                                            setIsSimulatingChallenge(false);
                                            setChallengeResult(null);
                                            setSelectedRival('');
                                            setSelectedChallenge('');
                                        }}
                                        className="mt-8 bg-gray-800 hover:bg-gray-700 text-white font-bold px-6 py-2 rounded-lg transition-colors"
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

                    {/* XP Summary with Daily Cap */}
                    <div className={`p-3 rounded-lg flex items-center justify-between ${atDailyLimit ? 'bg-gradient-to-r from-orange-900/50 to-red-900/50 border border-orange-500/30' : 'bg-gradient-to-r from-yellow-900/50 to-orange-900/50 border border-yellow-500/30'}`}>
                        <div>
                            <span className={`font-bold text-sm ${atDailyLimit ? 'text-orange-400' : 'text-yellow-400'}`}>
                                {atDailyLimit ? 'Daily Limit Reached!' : "Today's Habit XP"}
                            </span>
                            <div className="text-[10px] text-gray-400">Max {dailyXpCap} XP per day</div>
                        </div>
                        <div className="text-right">
                            <span className={`font-black text-lg ${atDailyLimit ? 'text-orange-300' : 'text-yellow-300'}`}>
                                {habitXpToday}/{dailyXpCap} XP
                            </span>
                        </div>
                    </div>

                    {/* Habit Tracker List */}
                    {!isEditingHabits ? (
                        <div className="space-y-3">
                            {activeHabits.map(habit => (
                                <div 
                                    key={habit.id}
                                    onClick={() => toggleHabitCheck(habit.id, habit.question)}
                                    className={`p-4 rounded-xl border transition-all flex items-center justify-between group relative
                                        ${homeDojoChecks[habit.id] 
                                            ? 'bg-green-900/20 border-green-500/50 cursor-default' 
                                            : habitLoading[habit.id]
                                                ? 'bg-gray-800 border-gray-600 cursor-wait opacity-70'
                                                : 'bg-gray-800 border-gray-700 hover:border-gray-500 cursor-pointer'}`}
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="text-3xl bg-gray-900 w-12 h-12 rounded-full flex items-center justify-center shadow-inner">
                                            {habitLoading[habit.id] ? (
                                                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                                            ) : habit.icon}
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
                                    <div className="flex items-center space-x-2">
                                        {habitXpEarned[habit.id] > 0 && (
                                            <span className="text-green-400 font-black text-sm animate-pulse">+{habitXpEarned[habit.id]} XP</span>
                                        )}
                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all
                                            ${homeDojoChecks[habit.id] ? 'bg-green-500 border-green-500 scale-110' : 'border-gray-600 group-hover:border-gray-400'}`}>
                                            {homeDojoChecks[habit.id] && <span className="text-white font-bold">✓</span>}
                                        </div>
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
                            
                            {/* Custom Habit Creation */}
                            <div className="mb-4">
                                {!showCustomForm ? (
                                    <button 
                                        onClick={() => setShowCustomForm(true)}
                                        className="w-full p-3 border-2 border-dashed border-cyan-500/50 rounded-xl text-cyan-400 hover:bg-cyan-900/20 transition-colors flex items-center justify-center space-x-2"
                                    >
                                        <span className="text-xl">+</span>
                                        <span className="font-bold">Create Custom Habit</span>
                                    </button>
                                ) : (
                                    <div className="bg-gray-900 p-4 rounded-xl border border-cyan-500/30 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <h5 className="font-bold text-cyan-400 text-sm">New Custom Habit</h5>
                                            <button onClick={() => setShowCustomForm(false)} className="text-gray-500 hover:text-white">✕</button>
                                        </div>
                                        
                                        {/* Icon Picker */}
                                        <div>
                                            <label className="text-xs text-gray-400 mb-1 block">Choose an Icon</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['🎯', '💪', '📖', '🧘', '🏃', '💤', '🙏', '🎨', '🎵', '🧹', '💧', '🍎'].map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => setCustomHabitIcon(emoji)}
                                                        className={`text-2xl p-2 rounded-lg transition-all ${customHabitIcon === emoji ? 'bg-cyan-600 scale-110' : 'bg-gray-800 hover:bg-gray-700'}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Question Input */}
                                        <div>
                                            <label className="text-xs text-gray-400 mb-1 block">Habit Question</label>
                                            <input
                                                type="text"
                                                value={customHabitQuestion}
                                                onChange={(e) => setCustomHabitQuestion(e.target.value)}
                                                placeholder="Did they practice 10 minutes of forms?"
                                                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                                            />
                                        </div>
                                        
                                        {/* Category Selector */}
                                        <div>
                                            <label className="text-xs text-gray-400 mb-1 block">Category</label>
                                            <select
                                                value={customHabitCategory}
                                                onChange={(e) => setCustomHabitCategory(e.target.value as Habit['category'])}
                                                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                                            >
                                                <option value="Custom">Custom</option>
                                                <option value="Martial Arts">Martial Arts</option>
                                                <option value="Health">Health</option>
                                                <option value="School">School</option>
                                                <option value="Character">Character</option>
                                                <option value="Family">Family</option>
                                            </select>
                                        </div>
                                        
                                        {/* Add Button */}
                                        <button
                                            onClick={handleCreateCustomHabit}
                                            disabled={!customHabitQuestion.trim()}
                                            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-2 rounded-lg transition-colors"
                                        >
                                            Add Custom Habit
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {/* Existing Custom Habits */}
                            {customHabitList.filter(h => h.isCustom).length > 0 && (
                                <div className="mb-4">
                                    <h5 className="text-xs text-gray-500 uppercase font-bold mb-2">Your Custom Habits</h5>
                                    <div className="space-y-2">
                                        {customHabitList.filter(h => h.isCustom).map(habit => (
                                            <div key={habit.id} className="flex items-center justify-between p-3 bg-cyan-900/20 rounded border border-cyan-500/30">
                                                <div className="flex items-center space-x-3">
                                                    <span className="text-2xl">{habit.icon}</span>
                                                    <div>
                                                        <span className="text-sm text-white block">{habit.question}</span>
                                                        <span className="text-[10px] text-cyan-400">{habit.category}</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={async () => {
                                                        setCustomHabitList(prev => prev.filter(h => h.id !== habit.id));
                                                        try {
                                                            await fetch(`/api/habits/custom/${habit.id}`, { method: 'DELETE' });
                                                        } catch (e) { console.error('Failed to delete habit:', e); }
                                                    }}
                                                    className="px-3 py-1 rounded text-xs font-bold bg-red-900/50 text-red-400 border border-red-900 hover:bg-red-900/80 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Preset Habits */}
                            <h5 className="text-xs text-gray-500 uppercase font-bold mb-2">Preset Habits</h5>
                            <div className="space-y-2 max-h-[250px] overflow-y-auto">
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
            {/* Real-time Challenge Toast Notification */}
            <ChallengeToast 
                challenge={newChallengeAlert ? {
                    from_student_name: newChallengeAlert.from_student_name,
                    challenge_name: newChallengeAlert.challenge_name,
                    challenge_xp: newChallengeAlert.challenge_xp
                } : null}
                onClose={clearNewChallengeAlert}
                onViewInbox={() => {
                    setActiveTab('rivals');
                    setRivalsView('inbox');
                }}
            />

             {/* Preview Header for Owner */}
            <div className="bg-yellow-600 text-white text-xs font-bold text-center py-2 sticky top-0 z-50 shadow-md flex justify-between px-4 items-center">
                <span>PREVIEW MODE</span>
                <button onClick={onBack} className="underline text-yellow-100 hover:text-white">Close</button>
            </div>

            {/* Club Sponsored Premium Badge - Always Visible */}
            {data.clubSponsoredPremium && (
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white text-xs font-bold text-center py-2 px-4 flex items-center justify-center space-x-2 shadow-lg">
                    <span className="text-base">💎</span>
                    <span>Premium Included by <span className="font-extrabold">{data.clubName}</span></span>
                    <span className="bg-white/20 text-[10px] px-2 py-0.5 rounded-full">FREE</span>
                </div>
            )}

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

            {/* Student History Modal */}
            {viewingStudentHistory.student && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewingStudentHistory({ student: null, history: [], loading: false })}>
                    <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 p-4 border-b border-gray-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span>📜</span> {viewingStudentHistory.student.name}'s History
                                    </h3>
                                    <p className="text-xs text-gray-400">Challenge submissions and achievements</p>
                                </div>
                                <button 
                                    onClick={() => setViewingStudentHistory({ student: null, history: [], loading: false })}
                                    className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
                            {viewingStudentHistory.loading ? (
                                <div className="text-center py-12">
                                    <div className="text-4xl animate-spin mb-3">⏳</div>
                                    <p className="text-gray-400 text-sm">Loading history...</p>
                                </div>
                            ) : viewingStudentHistory.history.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-4xl mb-3">🥋</div>
                                    <p className="text-gray-400 text-sm">No challenge history yet</p>
                                    <p className="text-gray-500 text-xs mt-1">Complete challenges to build your history!</p>
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
                                            className={`flex items-center justify-between p-3 rounded-xl border ${config.bg}`}
                                        >
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xl mr-3">
                                                    {entry.icon || '⚡'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-white text-sm">{entry.challengeName}</p>
                                                    <p className="text-[10px] text-gray-400">
                                                        {entry.category} • {dateDisplay} • {entry.proofType === 'VIDEO' ? '📹 Video' : '✓ Trust'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold text-xs ${config.color}`}>{config.badge}</p>
                                                <p className="text-[10px] text-yellow-500 font-bold">+{entry.xpAwarded} XP</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

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