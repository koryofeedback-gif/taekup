import { useReducer, useCallback, useRef, useEffect } from 'react';
import { Student, RivalsStats } from '../types';

interface ProgressState {
    completedContentIds: string[];
    totalPoints: number;
    xp: number;
    lastSyncedVersion: number;
    pendingMutations: PendingMutation[];
}

interface PendingMutation {
    id: string;
    contentId: string;
    xpDelta: number;
    timestamp: number;
}

type ProgressAction =
    | { type: 'HYDRATE_FROM_SERVER'; payload: { completedIds: string[]; totalPoints: number; xp: number; version: number } }
    | { type: 'QUEUE_COMPLETION'; payload: { contentId: string; xpDelta: number } }
    | { type: 'MUTATION_RESOLVED'; payload: { mutationId: string } }
    | { type: 'MUTATION_FAILED'; payload: { mutationId: string } }
    | { type: 'CLEAR_ALL_PENDING' };

function progressReducer(state: ProgressState, action: ProgressAction): ProgressState {
    switch (action.type) {
        case 'HYDRATE_FROM_SERVER': {
            const { completedIds, totalPoints, xp, version } = action.payload;
            
            if (state.pendingMutations.length > 0) {
                const mergedIds = new Set([...completedIds]);
                let mergedPoints = totalPoints;
                let mergedXp = xp;
                
                state.pendingMutations.forEach(mutation => {
                    if (!completedIds.includes(mutation.contentId)) {
                        mergedIds.add(mutation.contentId);
                        mergedPoints += mutation.xpDelta;
                        mergedXp += mutation.xpDelta;
                    }
                });
                
                return {
                    ...state,
                    completedContentIds: Array.from(mergedIds),
                    totalPoints: mergedPoints,
                    xp: mergedXp,
                    lastSyncedVersion: version
                };
            }
            
            return {
                ...state,
                completedContentIds: completedIds,
                totalPoints,
                xp,
                lastSyncedVersion: version,
                pendingMutations: []
            };
        }
        
        case 'QUEUE_COMPLETION': {
            const { contentId, xpDelta } = action.payload;
            
            if (state.completedContentIds.includes(contentId)) {
                return state;
            }
            
            const mutation: PendingMutation = {
                id: `mut-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                contentId,
                xpDelta,
                timestamp: Date.now()
            };
            
            return {
                ...state,
                completedContentIds: [...state.completedContentIds, contentId],
                totalPoints: state.totalPoints + xpDelta,
                xp: state.xp + xpDelta,
                pendingMutations: [...state.pendingMutations, mutation]
            };
        }
        
        case 'MUTATION_RESOLVED': {
            return {
                ...state,
                pendingMutations: state.pendingMutations.filter(m => m.id !== action.payload.mutationId)
            };
        }
        
        case 'MUTATION_FAILED': {
            const mutation = state.pendingMutations.find(m => m.id === action.payload.mutationId);
            if (!mutation) return state;
            
            return {
                ...state,
                completedContentIds: state.completedContentIds.filter(id => id !== mutation.contentId),
                totalPoints: state.totalPoints - mutation.xpDelta,
                xp: state.xp - mutation.xpDelta,
                pendingMutations: state.pendingMutations.filter(m => m.id !== action.payload.mutationId)
            };
        }
        
        case 'CLEAR_ALL_PENDING': {
            return {
                ...state,
                pendingMutations: []
            };
        }
        
        default:
            return state;
    }
}

interface UseStudentProgressOptions {
    student: Student;
    onUpdateStudent?: (student: Student) => void;
}

export function useStudentProgress({ student, onUpdateStudent }: UseStudentProgressOptions) {
    const lastStudentIdRef = useRef<string>(student.id);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    const [state, dispatch] = useReducer(progressReducer, {
        completedContentIds: student.completedContentIds || [],
        totalPoints: student.totalPoints || 0,
        xp: student.rivalsStats?.xp || 0,
        lastSyncedVersion: 0,
        pendingMutations: []
    });
    
    useEffect(() => {
        const studentChanged = student.id !== lastStudentIdRef.current;
        const hasPendingMutations = state.pendingMutations.length > 0;
        
        if (studentChanged) {
            lastStudentIdRef.current = student.id;
            dispatch({
                type: 'HYDRATE_FROM_SERVER',
                payload: {
                    completedIds: student.completedContentIds || [],
                    totalPoints: student.totalPoints || 0,
                    xp: student.rivalsStats?.xp || 0,
                    version: Date.now()
                }
            });
            return;
        }
        
        if (!hasPendingMutations) {
            const serverCompletedIds = student.completedContentIds || [];
            const serverTotalPoints = student.totalPoints || 0;
            const serverXp = student.rivalsStats?.xp || 0;
            
            const localHasLess = state.completedContentIds.length < serverCompletedIds.length;
            const pointsDiffer = state.totalPoints !== serverTotalPoints;
            const xpDiffer = state.xp !== serverXp;
            
            if (localHasLess || (pointsDiffer && !hasPendingMutations) || (xpDiffer && !hasPendingMutations)) {
                dispatch({
                    type: 'HYDRATE_FROM_SERVER',
                    payload: {
                        completedIds: serverCompletedIds,
                        totalPoints: serverTotalPoints,
                        xp: serverXp,
                        version: Date.now()
                    }
                });
            }
        }
    }, [student.id, student.completedContentIds, student.totalPoints, student.rivalsStats?.xp, state.pendingMutations.length]);
    
    const completeContent = useCallback((contentId: string, xpReward: number): boolean => {
        if (state.completedContentIds.includes(contentId)) {
            return false;
        }
        
        dispatch({
            type: 'QUEUE_COMPLETION',
            payload: { contentId, xpDelta: xpReward }
        });
        
        // Record view/completion in analytics database
        fetch('/api/content/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contentId,
                studentId: student.id,
                completed: true,
                xpAwarded: xpReward
            })
        }).catch(err => console.warn('Failed to record content view:', err));
        
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        
        syncTimeoutRef.current = setTimeout(() => {
            if (onUpdateStudent) {
                const currentXp = student.rivalsStats?.xp || 0;
                const currentTotalPoints = student.totalPoints || 0;
                const currentCompletedIds = student.completedContentIds || [];
                
                const updatedRivalsStats: RivalsStats = {
                    ...(student.rivalsStats || {
                        wins: 0,
                        losses: 0,
                        streak: 0,
                        xp: 0,
                        dailyStreak: 0,
                        teamBattlesWon: 0,
                        familyChallengesCompleted: 0,
                        mysteryBoxCompleted: 0
                    }),
                    xp: currentXp + xpReward
                };
                
                onUpdateStudent({
                    ...student,
                    completedContentIds: [...currentCompletedIds, contentId],
                    totalPoints: currentTotalPoints + xpReward,
                    rivalsStats: updatedRivalsStats
                });
                
                setTimeout(() => {
                    dispatch({ type: 'CLEAR_ALL_PENDING' });
                }, 500);
            }
        }, 100);
        
        return true;
    }, [state.completedContentIds, state.totalPoints, state.xp, student, onUpdateStudent]);
    
    const isCompleted = useCallback((contentId: string): boolean => {
        return state.completedContentIds.includes(contentId);
    }, [state.completedContentIds]);
    
    const trackView = useCallback((contentId: string): void => {
        fetch('/api/content/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contentId,
                studentId: student.id,
                completed: false,
                xpAwarded: 0
            })
        }).catch(err => console.warn('Failed to record content view:', err));
    }, [student.id]);
    
    const hasPendingChanges = state.pendingMutations.length > 0;
    
    return {
        completedContentIds: state.completedContentIds,
        totalPoints: state.totalPoints,
        xp: state.xp,
        completeContent,
        isCompleted,
        trackView,
        hasPendingChanges
    };
}
