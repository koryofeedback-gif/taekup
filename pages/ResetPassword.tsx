import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const ResetPasswordPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!token) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <SEO title="Invalid Link | TaekUp" />
                <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center">
                    <div className="text-6xl mb-4">🔗</div>
                    <h2 className="text-2xl font-bold text-white mb-4">Invalid Reset Link</h2>
                    <p className="text-gray-400 mb-6">
                        This password reset link is invalid or has expired.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!password || !confirmPassword) {
            setError('Please fill in both password fields.');
            return;
        }
        
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, newPassword: password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to reset password.');
                setIsLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err: any) {
            console.error('Reset password error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
                <SEO title="Password Reset | TaekUp" />
                <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <h2 className="text-2xl font-bold text-white mb-4">Password Reset!</h2>
                    <p className="text-gray-400 mb-6">
                        Your password has been successfully reset. Redirecting to login...
                    </p>
                    <Link
                        to="/login"
                        className="inline-block bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                    >
                        Go to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
            <SEO title="Reset Password | TaekUp" />
            <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Reset Password</h2>
                    <p className="text-gray-400">Enter your new password</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="••••••••"
                            disabled={isLoading}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
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
                                Resetting...
                            </span>
                        ) : 'Reset Password'}
                    </button>
                </form>
                
                <div className="mt-6 text-center">
                    <Link
                        to="/login"
                        className="text-sm text-sky-400 hover:text-sky-300"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
};
