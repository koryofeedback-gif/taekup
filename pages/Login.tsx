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
            
            // Wait for onLoginSuccess to complete (it fetches wizard data for returning owners)
            await onLoginSuccess(userType, user.name || user.clubName, undefined, user);
            
            // Check if wizard data exists in localStorage as fallback
            const hasLocalWizardData = !!localStorage.getItem('taekup_wizard_data');
            const wizardCompleted = user.wizardCompleted || hasLocalWizardData;
            
            // Use full page reload to ensure React reads fresh localStorage data
            // This avoids race conditions with React state updates
            if (userType === 'owner' && !wizardCompleted) {
                window.location.href = '/wizard';
            } else if (userType === 'owner') {
                window.location.href = '/app/admin';
            } else if (userType === 'coach') {
                window.location.href = '/app/coach';
            } else if (userType === 'parent' && user.studentId) {
                window.location.href = `/app/parent/${user.studentId}`;
            } else {
                window.location.href = '/app';
            }

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
