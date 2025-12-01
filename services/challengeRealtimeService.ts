import { supabase, isSupabaseConfigured } from './supabaseClient';

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

class ChallengeRealtimeService {
    private listeners: Map<string, Set<ChallengeCallback>> = new Map();
    private broadcastChannel: BroadcastChannel | null = null;
    private supabaseChannel: any = null;
    private studentId: string = '';

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

        if (isSupabaseConfigured && supabase) {
            this.setupSupabaseRealtime(studentId);
        }
    }

    private setupSupabaseRealtime(studentId: string) {
        if (!supabase) return;

        this.supabaseChannel = supabase
            .channel(`challenges:${studentId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'challenges',
                    filter: `to_student_id=eq.${studentId}`
                },
                (payload) => {
                    const challenge = payload.new as Challenge;
                    this.notifyListeners('new_challenge', challenge);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'challenges',
                    filter: `from_student_id=eq.${studentId}`
                },
                (payload) => {
                    const challenge = payload.new as Challenge;
                    if (challenge.status === 'accepted') {
                        this.notifyListeners('challenge_accepted', challenge);
                    } else if (challenge.status === 'declined') {
                        this.notifyListeners('challenge_declined', challenge);
                    } else if (challenge.status === 'completed') {
                        this.notifyListeners('challenge_completed', challenge);
                    }
                }
            )
            .subscribe();
    }

    private handleIncomingChallenge(data: { type: string; challenge: Challenge }) {
        if (data.challenge.to_student_id === this.studentId) {
            this.notifyListeners(data.type, data.challenge);
        }
        if (data.challenge.from_student_id === this.studentId) {
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
        const newChallenge: Challenge = {
            ...challenge,
            id: `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending'
        };

        if (isSupabaseConfigured && supabase) {
            const { data, error } = await supabase
                .from('challenges')
                .insert(newChallenge)
                .select()
                .single();

            if (error) {
                console.error('Error sending challenge:', error);
                throw error;
            }
            return data;
        } else {
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'new_challenge',
                    challenge: newChallenge
                });
            }
            this.saveChallengeLocally(newChallenge);
            return newChallenge;
        }
    }

    async acceptChallenge(challengeId: string, score: number): Promise<Challenge | null> {
        if (isSupabaseConfigured && supabase) {
            const { data: challenge, error: fetchError } = await supabase
                .from('challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (fetchError || !challenge) return null;

            const fromScore = Math.floor(Math.random() * 100);
            const winnerId = score > fromScore ? challenge.to_student_id : challenge.from_student_id;

            const { data, error } = await supabase
                .from('challenges')
                .update({
                    status: 'completed',
                    to_score: score,
                    from_score: fromScore,
                    winner_id: winnerId,
                    completed_at: new Date().toISOString()
                })
                .eq('id', challengeId)
                .select()
                .single();

            if (error) {
                console.error('Error accepting challenge:', error);
                return null;
            }
            return data;
        } else {
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

            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'challenge_completed',
                    challenge: challenges[idx]
                });
            }

            return challenges[idx];
        }
    }

    async declineChallenge(challengeId: string): Promise<boolean> {
        if (isSupabaseConfigured && supabase) {
            const { error } = await supabase
                .from('challenges')
                .update({ status: 'declined' })
                .eq('id', challengeId);

            return !error;
        } else {
            const challenges = this.getChallengesLocally();
            const idx = challenges.findIndex(c => c.id === challengeId);
            if (idx === -1) return false;

            challenges[idx].status = 'declined';
            localStorage.setItem('taekup_challenges', JSON.stringify(challenges));

            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'challenge_declined',
                    challenge: challenges[idx]
                });
            }

            return true;
        }
    }

    async getReceivedChallenges(studentId: string): Promise<Challenge[]> {
        if (isSupabaseConfigured && supabase) {
            const { data, error } = await supabase
                .from('challenges')
                .select('*')
                .eq('to_student_id', studentId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching received challenges:', error);
                return [];
            }
            return data || [];
        } else {
            return this.getChallengesLocally().filter(c => c.to_student_id === studentId);
        }
    }

    async getSentChallenges(studentId: string): Promise<Challenge[]> {
        if (isSupabaseConfigured && supabase) {
            const { data, error } = await supabase
                .from('challenges')
                .select('*')
                .eq('from_student_id', studentId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching sent challenges:', error);
                return [];
            }
            return data || [];
        } else {
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
        if (this.supabaseChannel && supabase) {
            supabase.removeChannel(this.supabaseChannel);
        }
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
    }
}

export const challengeService = new ChallengeRealtimeService();
export default challengeService;
