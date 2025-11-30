import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO';
import type { SignupData, WizardData } from '../types';

interface LoginPageProps {
    signupData: SignupData | null;
    finalWizardData: WizardData | null;
    onLoginSuccess: (userType: 'owner' | 'coach' | 'parent', userName: string, studentId?: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ signupData, finalWizardData, onLoginSuccess }) => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }

        if (!finalWizardData && !signupData) {
            setError("No club data found. Please sign up first.");
            return;
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Owner Check
        if (signupData && normalizedEmail === signupData.email.toLowerCase()) {
            if (password === signupData.password) {
                const userName = finalWizardData ? finalWizardData.ownerName : signupData.clubName;
                onLoginSuccess('owner', userName);
                if (!finalWizardData) {
                    navigate('/wizard');
                } else {
                    navigate('/app');
                }
                return;
            }
        }

        if (!finalWizardData) {
            setError("Invalid credentials or account not fully set up.");
            return;
        }

        // 2. Coach Check
        const coach = finalWizardData.coaches.find(c => c.email.toLowerCase() === normalizedEmail);
        if (coach) {
            if (coach.password && password === coach.password) {
                onLoginSuccess('coach', coach.name);
                navigate('/app/coach');
                return;
            }
            if (!coach.password) {
                setError("Security Error: This coach account has no password set.");
                return;
            }
        }

        // 3. Parent Check
        const student = finalWizardData.students.find(s => s.parentEmail.toLowerCase() === normalizedEmail);
        if (student) {
            if (password === '1234') {
                onLoginSuccess('parent', '', student.id);
                navigate(`/app/parent/${student.id}`);
                return;
            }
        }

        setError("Invalid email or password. Please try again.");
    };

    const handleCancel = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
            <SEO title="Login | TaekUp" description="Log in to your TaekUp Dashboard." />
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
                    <p className="text-gray-400">Log in to TaekUp</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="user@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="••••••••"
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        Log In
                    </button>
                </form>
                <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-700 pt-4">
                    <p className="mb-1">Demo Credentials:</p>
                    <p>Owner: (Use Signup Email & Password)</p>
                    <p>Coach: (Use Email & Password from Step 5)</p>
                    <p>Parent: (Use Parent Email, Password: <span className="font-mono text-gray-300">1234</span>)</p>
                </div>
            </div>
        </div>
    );
};
