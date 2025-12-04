import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignupForm } from '../components/SignupForm';
import { SEO } from '../components/SEO';
import type { SignupData } from '../types';
import { sendWelcomeEmail } from '../services/geminiService';

interface LandingPageProps {
    onSignupSuccess: (data: SignupData) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignupSuccess }) => {
    const navigate = useNavigate();
    const [showSignup, setShowSignup] = useState(false);

    const handleSignupSuccess = async (data: SignupData) => {
        await sendWelcomeEmail(data.clubName);
        onSignupSuccess(data);
        navigate('/wizard');
    };

    return (
        <div className="bg-black min-h-screen font-sans text-white selection:bg-cyan-600 selection:text-white">
            <SEO
                title="TaekUp - The Growth Engine for Martial Arts | MyTaek"
                description="TaekUp isn't just management software. It's a Growth Engine that gamifies retention, automates pedagogy, and turns your roster into revenue."
            />
            
            {/* --- HERO SECTION --- */}
            <div className="relative pt-32 pb-24 px-6 overflow-hidden border-b border-zinc-800">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-80"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none"></div>

                <div className="relative z-10 max-w-6xl mx-auto text-center flex flex-col items-center">
                    {showSignup ? (
                        <>
                            <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight text-white tracking-tighter">
                                START YOUR <span className="text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-cyan-700">FREE TRIAL.</span>
                            </h1>
                            <p className="text-xl text-zinc-400 mb-10">
                                No credit card required. Unlock your dojang's full potential today.
                            </p>
                            <div className="w-full max-w-md">
                                <SignupForm onSignupSuccess={handleSignupSuccess} />
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest font-bold mb-6">
                                The Future of Martial Arts Business
                            </p>
                            <h1 className="text-5xl md:text-8xl font-black mb-8 leading-tight text-white tracking-tighter">
                                EVERY STEP TAKES<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-cyan-700">YOU UP.</span>
                            </h1>
                            <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-12 leading-relaxed font-light">
                                TaekUp isn't just management software. It's a <span className="text-white font-medium">Growth Engine</span> that gamifies retention, automates pedagogy, and turns your roster into revenue.
                            </p>

                            <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6">
                                <button
                                    onClick={() => setShowSignup(true)}
                                    className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-10 rounded-full transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(6,182,212,0.3)] text-lg"
                                >
                                    Start Free Trial
                                </button>
                                <button
                                    onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold py-4 px-10 rounded-full transition-all text-lg"
                                >
                                    See Features
                                </button>
                            </div>
                            <p className="mt-8 text-zinc-600 text-xs font-semibold tracking-widest uppercase">
                                Powered by MyTaek
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* --- FEATURES TRIFECTA --- */}
            <div id="features" className="container mx-auto px-6 -mt-12 relative z-20 pb-32">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-cyan-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-cyan-500 transition-colors">01</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:rotate-6 transition-transform">
                            🥋
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">Pedagogy First</h2>
                        <p className="text-cyan-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">AI-Powered Teaching</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            AI Lesson Planners, 30-Second Grading, and automated feedback that sounds like YOU. We help you teach better.
                        </p>
                    </div>

                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-cyan-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-cyan-500 transition-colors">02</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:-rotate-6 transition-transform">
                            🎮
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">Gamified Retention</h2>
                        <p className="text-cyan-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">Addictive Progress</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            Dojang Rivals, Fighter Cards, and a Black Belt Time Machine. We make kids addicted to progress.
                        </p>
                    </div>

                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-cyan-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-cyan-500 transition-colors">03</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:scale-110 transition-transform">
                            💰
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">Revenue Engine</h2>
                        <p className="text-cyan-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">Software That Pays You</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            Turn your curriculum into a paid video library. We share 70% of the revenue with you. The software pays for itself.
                        </p>
                    </div>

                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-cyan-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-cyan-500 transition-colors">04</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:rotate-12 transition-transform">
                            🌐
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">The Ecosystem</h2>
                        <p className="text-cyan-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">One Connected World</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            Manage the club with TaekUp. Teach kids with TaekFunDo. Train athletes with TikTaek. One connected world.
                        </p>
                    </div>

                </div>
            </div>

            {/* --- UNLIMITED SECTION --- */}
            <div className="bg-black py-32 relative overflow-hidden border-t border-zinc-900">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        <div>
                            <h2 className="text-5xl font-black text-white mb-6 tracking-tighter leading-tight">
                                GROW YOUR EMPIRE,<br /><span className="text-cyan-500">NOT YOUR BILLS.</span>
                            </h2>
                            <p className="text-xl text-zinc-400 leading-relaxed max-w-md">
                                Competitors punish you for succeeding. They charge extra for every new location, every new staff member, and every new feature. <span className="text-white font-medium">We don't.</span>
                            </p>
                        </div>

                        <div className="space-y-10">
                            <div className="flex items-start">
                                <div className="text-cyan-500 font-black text-4xl mr-6 mt-[-8px] leading-none">01.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Locations</h4>
                                    <p className="text-zinc-500 leading-relaxed">Open 10 new branches? No extra fee. Manage your entire franchise from one screen without paying a "Location Tax."</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-white font-black text-4xl mr-6 mt-[-8px] leading-none">02.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Staff</h4>
                                    <p className="text-zinc-500 leading-relaxed">Add as many coaches, admins, and assistants as you need. We believe your team should grow with you, free of charge.</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-zinc-700 font-black text-4xl mr-6 mt-[-8px] leading-none">03.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Classes</h4>
                                    <p className="text-zinc-500 leading-relaxed">Run 100 classes a week? Great. Schedule as much as you want without limits. Your schedule is yours to control.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- PROFIT ENGINE SECTION --- */}
            <div className="py-32 relative overflow-hidden border-t border-zinc-900">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-yellow-600/10 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="container mx-auto px-6 relative z-10">
                    <div className="max-w-4xl mx-auto text-center">
                        <div className="inline-block mb-6 p-4 bg-yellow-500/10 rounded-full border border-yellow-500/50">
                            <span className="text-4xl">💸</span>
                        </div>

                        <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tighter leading-tight">
                            STOP PAYING FOR SOFTWARE.<br />
                            <span className="text-yellow-500">LET SOFTWARE PAY YOU.</span>
                        </h2>
                        <p className="text-xl text-zinc-400 max-w-3xl mx-auto mb-12 leading-relaxed">
                            Every other platform is a monthly expense. TaekUp is an asset. Our proprietary <span className="font-bold text-white">Club Revenue Engine™</span> shares 70% of the revenue directly with you.
                        </p>

                        <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
                            <div className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 w-full md:w-auto min-w-[240px] opacity-70">
                                <p className="text-zinc-500 text-xs uppercase font-bold tracking-wider mb-2">The Old Way</p>
                                <p className="text-red-400 text-4xl font-black">-$199/mo</p>
                                <p className="text-zinc-600 text-sm mt-2">Pure Expense</p>
                            </div>
                            <div className="text-zinc-600 font-black text-4xl">VS</div>
                            <div className="bg-zinc-900 p-8 rounded-xl border-2 border-yellow-500/60 w-full md:w-auto min-w-[260px] shadow-[0_0_40px_rgba(234,179,8,0.2)] scale-105">
                                <p className="text-yellow-500 text-xs uppercase font-bold tracking-wider mb-2">TaekUp Way</p>
                                <p className="text-green-400 text-4xl font-black">+$450/mo</p>
                                <p className="text-green-400/70 text-sm mt-2">Net Profit</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowSignup(true)}
                            className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-4 px-12 rounded-full shadow-lg transform hover:scale-105 transition-all text-lg"
                        >
                            Start Trial to See the Math
                        </button>
                        <p className="text-zinc-600 text-sm mt-6">Based on a standard club with 150 students.</p>
                    </div>
                </div>
            </div>

            {/* --- CTA SECTION --- */}
            <div className="py-24 text-center bg-gradient-to-t from-zinc-900 to-black relative border-t border-zinc-800">
                <div className="max-w-3xl mx-auto px-6">
                    <p className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-6">
                        The Martial Arts Revolution
                    </p>
                    <div className="flex justify-center items-center opacity-60">
                        <span className="text-2xl font-bold text-white tracking-wider">MYTAEK</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
