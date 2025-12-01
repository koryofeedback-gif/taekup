import { useState, useEffect, useCallback } from 'react';
import challengeService, { Challenge } from '../services/challengeRealtimeService';

interface UseChallengeRealtimeResult {
    receivedChallenges: Challenge[];
    sentChallenges: Challenge[];
    pendingCount: number;
    isLoading: boolean;
    sendChallenge: (params: {
        toStudentId: string;
        toStudentName: string;
        fromStudentId: string;
        fromStudentName: string;
        challengeId: string;
        challengeName: string;
        challengeXp: number;
    }) => Promise<Challenge | null>;
    acceptChallenge: (challengeId: string, score: number) => Promise<{ won: boolean; xpEarned: number } | null>;
    declineChallenge: (challengeId: string) => Promise<boolean>;
    newChallengeAlert: Challenge | null;
    clearNewChallengeAlert: () => void;
}

export function useChallengeRealtime(studentId: string): UseChallengeRealtimeResult {
    const [receivedChallenges, setReceivedChallenges] = useState<Challenge[]>([]);
    const [sentChallenges, setSentChallenges] = useState<Challenge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newChallengeAlert, setNewChallengeAlert] = useState<Challenge | null>(null);

    useEffect(() => {
        if (!studentId) return;

        challengeService.initialize(studentId);

        const loadChallenges = async () => {
            setIsLoading(true);
            const [received, sent] = await Promise.all([
                challengeService.getReceivedChallenges(studentId),
                challengeService.getSentChallenges(studentId)
            ]);
            setReceivedChallenges(received);
            setSentChallenges(sent);
            setIsLoading(false);
        };

        loadChallenges();

        const unsubNewChallenge = challengeService.on('new_challenge', (challenge) => {
            if (challenge.to_student_id === studentId) {
                setReceivedChallenges(prev => [challenge, ...prev.filter(c => c.id !== challenge.id)]);
                setNewChallengeAlert(challenge);
                setTimeout(() => setNewChallengeAlert(null), 5000);
            }
        });

        const unsubAccepted = challengeService.on('challenge_accepted', (challenge) => {
            setSentChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
        });

        const unsubDeclined = challengeService.on('challenge_declined', (challenge) => {
            setSentChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
        });

        const unsubCompleted = challengeService.on('challenge_completed', (challenge) => {
            if (challenge.from_student_id === studentId) {
                setSentChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
            }
            if (challenge.to_student_id === studentId) {
                setReceivedChallenges(prev => prev.map(c => c.id === challenge.id ? challenge : c));
            }
        });

        return () => {
            unsubNewChallenge();
            unsubAccepted();
            unsubDeclined();
            unsubCompleted();
        };
    }, [studentId]);

    const sendChallenge = useCallback(async (params: {
        toStudentId: string;
        toStudentName: string;
        fromStudentId: string;
        fromStudentName: string;
        challengeId: string;
        challengeName: string;
        challengeXp: number;
    }): Promise<Challenge | null> => {
        try {
            const challenge = await challengeService.sendChallenge({
                from_student_id: params.fromStudentId,
                from_student_name: params.fromStudentName,
                to_student_id: params.toStudentId,
                to_student_name: params.toStudentName,
                challenge_id: params.challengeId,
                challenge_name: params.challengeName,
                challenge_xp: params.challengeXp,
                status: 'pending'
            });
            setSentChallenges(prev => [challenge, ...prev]);
            return challenge;
        } catch (error) {
            console.error('Failed to send challenge:', error);
            return null;
        }
    }, []);

    const acceptChallenge = useCallback(async (
        challengeId: string, 
        score: number
    ): Promise<{ won: boolean; xpEarned: number } | null> => {
        try {
            const result = await challengeService.acceptChallenge(challengeId, score);
            if (result) {
                setReceivedChallenges(prev => prev.map(c => c.id === challengeId ? result : c));
                const won = result.winner_id === studentId;
                return {
                    won,
                    xpEarned: won ? result.challenge_xp : 10
                };
            }
            return null;
        } catch (error) {
            console.error('Failed to accept challenge:', error);
            return null;
        }
    }, [studentId]);

    const declineChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
        const success = await challengeService.declineChallenge(challengeId);
        if (success) {
            setReceivedChallenges(prev => prev.filter(c => c.id !== challengeId));
        }
        return success;
    }, []);

    const clearNewChallengeAlert = useCallback(() => {
        setNewChallengeAlert(null);
    }, []);

    const pendingCount = receivedChallenges.filter(c => c.status === 'pending').length;

    return {
        receivedChallenges,
        sentChallenges,
        pendingCount,
        isLoading,
        sendChallenge,
        acceptChallenge,
        declineChallenge,
        newChallengeAlert,
        clearNewChallengeAlert
    };
}

export default useChallengeRealtime;
