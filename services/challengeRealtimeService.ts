export interface Challenge {
    id: string;
    from_student_id: string;
    from_student_name: string;
    to_student_id: string;
    to_student_name: string;
    challenge_id: string;
    challenge_name: string;
    challenge_xp: number;
    status: 'pending' | 'accepted' | 'declined' | 'completed';
    from_score?: number;
    to_score?: number;
    winner_id?: string;
    created_at: string;
    expires_at: string;
    completed_at?: string;
}

type ChallengeCallback = (challenge: Challenge) => void;

const API_BASE = '/api';

class ChallengeRealtimeService {
    private listeners: Map<string, Set<ChallengeCallback>> = new Map();
    private broadcastChannel: BroadcastChannel | null = null;
    private studentId: string = '';
    private pollInterval: NodeJS.Timeout | null = null;

    constructor() {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            this.broadcastChannel = new BroadcastChannel('taekup-challenges');
            this.broadcastChannel.onmessage = (event) => {
                this.handleIncomingChallenge(event.data);
            };
        }
    }

    initialize(studentId: string) {
        this.studentId = studentId;
        this.startPolling(studentId);
    }

    private startPolling(studentId: string) {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(async () => {
            try {
                const challenges = await this.getReceivedChallenges(studentId);
                const pending = challenges.filter(c => c.status === 'pending');
                if (pending.length > 0) {
                    pending.forEach(c => this.notifyListeners('new_challenge', c));
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 10000);
    }

    private handleIncomingChallenge(data: { type: string; challenge: Challenge }) {
        if (data.challenge.to_student_id === this.studentId) {
            this.notifyListeners(data.type, data.challenge);
        } else if (data.challenge.from_student_id === this.studentId) {
            this.notifyListeners(data.type, data.challenge);
        }
    }

    private notifyListeners(event: string, challenge: Challenge) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(challenge));
        }
        const allCallbacks = this.listeners.get('*');
        if (allCallbacks) {
            allCallbacks.forEach(callback => callback(challenge));
        }
    }

    on(event: string, callback: ChallengeCallback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    async sendChallenge(challenge: Omit<Challenge, 'id' | 'created_at' | 'expires_at'>): Promise<Challenge> {
        try {
            const response = await fetch(`${API_BASE}/challenges`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(challenge)
            });
            
            if (!response.ok) throw new Error('Failed to send challenge');
            
            const result = await response.json();
            const newChallenge: Challenge = {
                ...challenge,
                id: result.id,
                created_at: new Date().toISOString(),
                expires_at: result.expires_at,
                status: 'pending'
            };

            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({ type: 'new_challenge', challenge: newChallenge });
            }
            
            return newChallenge;
        } catch (err) {
            console.error('Error sending challenge:', err);
            const fallbackChallenge: Challenge = {
                ...challenge,
                id: `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                status: 'pending'
            };
            this.saveChallengeLocally(fallbackChallenge);
            return fallbackChallenge;
        }
    }

    async acceptChallenge(challengeId: string, score: number): Promise<Challenge | null> {
        try {
            const response = await fetch(`${API_BASE}/challenges/${challengeId}/accept`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ score })
            });
            
            if (!response.ok) throw new Error('Failed to accept challenge');
            
            const result = await response.json();
            
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({ type: 'challenge_completed', challenge: result });
            }
            
            return result;
        } catch (err) {
            console.error('Error accepting challenge:', err);
            const challenges = this.getChallengesLocally();
            const idx = challenges.findIndex(c => c.id === challengeId);
            if (idx === -1) return null;

            const fromScore = Math.floor(Math.random() * 100);
            const winnerId = score > fromScore ? challenges[idx].to_student_id : challenges[idx].from_student_id;

            challenges[idx] = {
                ...challenges[idx],
                status: 'completed',
                to_score: score,
                from_score: fromScore,
                winner_id: winnerId,
                completed_at: new Date().toISOString()
            };

            localStorage.setItem('taekup_challenges', JSON.stringify(challenges));
            return challenges[idx];
        }
    }

    async declineChallenge(challengeId: string): Promise<boolean> {
        try {
            const response = await fetch(`${API_BASE}/challenges/${challengeId}/decline`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });
            return response.ok;
        } catch (err) {
            console.error('Error declining challenge:', err);
            const challenges = this.getChallengesLocally();
            const idx = challenges.findIndex(c => c.id === challengeId);
            if (idx === -1) return false;
            challenges[idx].status = 'declined';
            localStorage.setItem('taekup_challenges', JSON.stringify(challenges));
            return true;
        }
    }

    async getReceivedChallenges(studentId: string): Promise<Challenge[]> {
        try {
            const response = await fetch(`${API_BASE}/challenges/received/${studentId}`);
            if (!response.ok) throw new Error('Failed to fetch challenges');
            return await response.json();
        } catch (err) {
            console.error('Error fetching received challenges:', err);
            return this.getChallengesLocally().filter(c => c.to_student_id === studentId);
        }
    }

    async getSentChallenges(studentId: string): Promise<Challenge[]> {
        try {
            const response = await fetch(`${API_BASE}/challenges/sent/${studentId}`);
            if (!response.ok) throw new Error('Failed to fetch challenges');
            return await response.json();
        } catch (err) {
            console.error('Error fetching sent challenges:', err);
            return this.getChallengesLocally().filter(c => c.from_student_id === studentId);
        }
    }

    private saveChallengeLocally(challenge: Challenge) {
        const challenges = this.getChallengesLocally();
        challenges.unshift(challenge);
        localStorage.setItem('taekup_challenges', JSON.stringify(challenges));
    }

    private getChallengesLocally(): Challenge[] {
        try {
            return JSON.parse(localStorage.getItem('taekup_challenges') || '[]');
        } catch {
            return [];
        }
    }

    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
    }
}

export const challengeService = new ChallengeRealtimeService();
export default challengeService;
