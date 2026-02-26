import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const RequestAccessPage: React.FC = () => {
    const [fullName, setFullName] = useState('');
    const [clubName, setClubName] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName || !clubName || !websiteUrl || !email) {
            setError('Please fill in all required fields.');
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, clubName, websiteUrl, email, phone }),
            });

            if (response.ok) {
                setSubmitted(true);
            } else {
                const data = await response.json();
                setError(data.error || 'Something went wrong. Please try again.');
            }
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
            <SEO title="Request VIP Access | TaekUp" description="Request VIP early access to the TaekUp platform." />
            <div className="max-w-lg w-full">
                <div className="text-center mb-8">
                    <Link to="/" className="inline-block mb-4">
                        <span className="text-3xl font-black tracking-tight">
                            <span className="text-white">TAEK</span>
                            <span className="text-cyan-400">UP</span>
                        </span>
                    </Link>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">VIP Early Access</span>
                    </div>
                </div>

                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-cyan-500/5 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-600"></div>

                    <div className="p-8">
                        {submitted ? (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-3">Thank you!</h2>
                                <p className="text-zinc-400 leading-relaxed mb-2">
                                    Your request is under review.
                                </p>
                                <p className="text-zinc-400 leading-relaxed mb-6">
                                    Our team will verify your website and email you the VIP access details within <span className="text-cyan-400 font-semibold">24 hours</span>.
                                </p>
                                <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 border border-zinc-700/50">
                                    <p className="text-sm text-zinc-500">Confirmation will be sent to</p>
                                    <p className="text-cyan-400 font-medium">{email}</p>
                                </div>
                                <Link
                                    to="/"
                                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    Back to home
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold text-white mb-2">Request VIP Access</h2>
                                    <p className="text-zinc-400 text-sm">
                                        Join the exclusive group of dojos transforming their business with TaekUp.
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            Full Name <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder="John Smith"
                                            disabled={isLoading}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            Dojo / Club Name <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={clubName}
                                            onChange={e => setClubName(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder="Your martial arts school"
                                            disabled={isLoading}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            Club Website URL <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="url"
                                            value={websiteUrl}
                                            onChange={e => setWebsiteUrl(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder="https://yourdojo.com"
                                            disabled={isLoading}
                                            required
                                        />
                                        <p className="text-xs text-zinc-600 mt-1">We verify this to ensure quality partners</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            Email Address <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder="you@example.com"
                                            disabled={isLoading}
                                            required
                                        />
                                        <p className="text-xs text-zinc-600 mt-1">This will be your club admin login email</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            Phone Number <span className="text-zinc-600">(optional)</span>
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder="+1 (555) 000-0000"
                                            disabled={isLoading}
                                        />
                                    </div>

                                    {error && (
                                        <div className="bg-red-900/20 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center justify-center">
                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Submitting...
                                            </span>
                                        ) : 'Request VIP Access'}
                                    </button>
                                </form>

                                <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
                                    <p className="text-zinc-500 text-sm">
                                        Already have an account?{' '}
                                        <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">Log in</Link>
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center text-zinc-700 text-xs mt-6">
                    By requesting access, you agree to our{' '}
                    <Link to="/terms" className="text-zinc-500 hover:text-zinc-400">Terms</Link> and{' '}
                    <Link to="/privacy" className="text-zinc-500 hover:text-zinc-400">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );
};
