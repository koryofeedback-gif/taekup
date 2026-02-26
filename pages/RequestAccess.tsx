import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const RequestAccessPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [clubName, setClubName] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !clubName) {
            setError('Please fill in all fields.');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, clubName }),
            });

            if (response.ok) {
                setSubmitted(true);
            } else {
                const data = await response.json();
                setError(data.error || 'Something went wrong. Please try again.');
            }
        } catch {
            setSubmitted(true);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4">
            <SEO title="Request Early Access | TaekUp" description="Request early access to the TaekUp platform." />
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <Link to="/" className="inline-block mb-6">
                        <span className="text-2xl font-black tracking-tight">
                            <span className="text-white">TAEK</span>
                            <span className="text-cyan-400">UP</span>
                        </span>
                    </Link>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                    {submitted ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">You're on the list!</h2>
                            <p className="text-zinc-400 mb-6">
                                We'll reach out to <span className="text-cyan-400">{email}</span> when your spot is ready.
                            </p>
                            <Link
                                to="/"
                                className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                Back to home
                            </Link>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-white mb-2 text-center">Request Early Access</h2>
                            <p className="text-zinc-400 text-sm text-center mb-8">
                                Be among the first to transform your dojo with TaekUp.
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Club / Dojo Name</label>
                                    <input
                                        type="text"
                                        value={clubName}
                                        onChange={e => setClubName(e.target.value)}
                                        className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                                        placeholder="Your martial arts school"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Email Address</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-zinc-800 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                                        placeholder="you@example.com"
                                        disabled={isLoading}
                                    />
                                </div>
                                {error && <p className="text-red-400 text-sm">{error}</p>}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Submitting...' : 'Request Access'}
                                </button>
                            </form>

                            <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
                                <p className="text-zinc-500 text-sm">
                                    Already have an account?{' '}
                                    <Link to="/login" className="text-cyan-400 hover:text-cyan-300">Log in</Link>
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
