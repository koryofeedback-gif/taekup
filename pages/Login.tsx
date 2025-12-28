import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import type { SignupData, WizardData } from '../types';

interface LoginPageProps {
    signupData: SignupData | null;
    finalWizardData: WizardData | null;
    onLoginSuccess: (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string, userData?: any) => Promise<void> | void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ signupData, finalWizardData, onLoginSuccess }) => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Invalid email or password.');
                setIsLoading(false);
                return;
            }

            const user = data.user;
            const userType = user.role === 'owner' ? 'owner' : user.role === 'coach' ? 'coach' : 'parent';
            
            // CRITICAL: Save all login data to localStorage FIRST before any redirect
            localStorage.setItem('taekup_user_type', userType);
            localStorage.setItem('taekup_user_name', user.name || user.clubName || 'User');
            if (user.clubId) {
                localStorage.setItem('taekup_club_id', user.clubId);
            }
            if (user.studentId) {
                localStorage.setItem('taekup_student_id', user.studentId);
            }
            
            // Clear any stale impersonation data (sessionStorage)
            sessionStorage.removeItem('impersonationToken');
            sessionStorage.removeItem('impersonationClubId');
            sessionStorage.removeItem('impersonationClubName');
            sessionStorage.removeItem('impersonation_wizard_data');
            sessionStorage.removeItem('impersonation_user_type');
            sessionStorage.removeItem('impersonation_user_name');
            sessionStorage.removeItem('impersonation_club_id');
            
            // CRITICAL: Clear old cached wizard data to force fresh data with proper UUIDs
            localStorage.removeItem('taekup_wizard_data');
            console.log('[Login] Cleared old cached wizard data');
            
            // FIRST: Check if API returned wizardData directly (Vercel production path)
            if (data.wizardData && Object.keys(data.wizardData).length > 0) {
                localStorage.setItem('taekup_wizard_data', JSON.stringify(data.wizardData));
                console.log('[Login] Saved fresh wizard data from login API (with database UUIDs)');
            }
            // FALLBACK: For owners, try to fetch wizard data from database if not in login response
            else if (userType === 'owner' && user.clubId && !user.wizardCompleted) {
                try {
                    const wizardResponse = await fetch(`/api/club/${user.clubId}/data`);
                    const wizardResult = await wizardResponse.json();
                    if (wizardResult.success && wizardResult.wizardData) {
                        // Check if wizard data has actual content (not just defaults)
                        const wd = wizardResult.wizardData;
                        const hasContent = wd.clubName || (wd.students && wd.students.length > 0) || (wd.belts && wd.belts.length > 0);
                        if (hasContent) {
                            // Merge club settings (like worldRankingsEnabled) into wizardData
                            const mergedData = {
                                ...wizardResult.wizardData,
                                worldRankingsEnabled: wizardResult.club?.worldRankingsEnabled || false
                            };
                            localStorage.setItem('taekup_wizard_data', JSON.stringify(mergedData));
                            // Mark wizard as completed if there's real content
                            user.wizardCompleted = true;
                            console.log('[Login] Saved wizard data from /api/club/:id/data, worldRankingsEnabled:', mergedData.worldRankingsEnabled);
                        }
                    }
                } catch (err) {
                    console.error('[Login] Failed to fetch wizard data:', err);
                }
            }
            
            // Also call the original handler for React state updates
            await onLoginSuccess(userType, user.name || user.clubName, user.studentId, user);
            
            // Verify localStorage before redirect
            const savedUserType = localStorage.getItem('taekup_user_type');
            const savedWizardData = localStorage.getItem('taekup_wizard_data');
            console.log('[Login] Pre-redirect check:', { savedUserType, hasWizardData: !!savedWizardData });
            
            // Check if wizard is completed - either from API or from localStorage having wizard data
            const hasLocalWizardData = !!savedWizardData;
            const wizardIsCompleted = user.wizardCompleted || hasLocalWizardData;
            
            // Determine target URL
            let targetUrl = '/app';
            if (userType === 'owner' && !wizardIsCompleted) {
                targetUrl = '/wizard';
            } else if (userType === 'owner') {
                targetUrl = '/app/admin';
            } else if (userType === 'coach') {
                targetUrl = '/app/coach';
            } else if (userType === 'parent' && user.studentId) {
                targetUrl = `/app/parent/${user.studentId}`;
            }
            
            console.log('[Login] Redirecting to:', targetUrl, { wizardIsCompleted, hasLocalWizardData });
            
            // Use full page reload to ensure fresh state from localStorage
            window.location.href = targetUrl;

        } catch (err: any) {
            console.error('Login error:', err);
            setError('Network error. Please check your connection and try again.');
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
            <SEO title="Login | TaekUp™" description="Log in to your TaekUp™ Dashboard." />
            <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 relative">
                <button
                    onClick={handleCancel}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl leading-none"
                    aria-label="Close"
                >
                    &times;
                </button>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
                    <p className="text-gray-400">Log in to TaekUp™</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="user@example.com"
                            disabled={isLoading}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="••••••••"
                            disabled={isLoading}
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Logging in...
                            </span>
                        ) : 'Log In'}
                    </button>
                </form>
                
                <div className="mt-4 text-center">
                    <Link
                        to="/forgot-password"
                        className="text-sm text-sky-400 hover:text-sky-300"
                    >
                        Forgot your password?
                    </Link>
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-700">
                    <p className="text-center text-gray-400 text-sm mb-4">No account yet?</p>
                    <Link
                        to="/landing?signup=true"
                        className="w-full block text-center bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        Start Free Trial
                    </Link>
                    <p className="text-center text-gray-500 text-xs mt-3">14-day free trial - no credit card required</p>
                </div>
            </div>
        </div>
    );
};
