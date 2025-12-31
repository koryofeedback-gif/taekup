import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SignupForm } from '../components/SignupForm';
import { SEO } from '../components/SEO';
import type { SignupData } from '../types';
import { sendWelcomeEmail } from '../services/geminiService';

interface LandingPageProps {
    onSignupSuccess: (data: SignupData) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignupSuccess }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [showSignup, setShowSignup] = useState(false);
    const [studentCount, setStudentCount] = useState(50);

    useEffect(() => {
        if (searchParams.get('signup') === 'true') {
            setShowSignup(true);
        }
    }, [searchParams]);

    const handleSignupSuccess = async (data: SignupData) => {
        await sendWelcomeEmail(data.clubName);
        onSignupSuccess(data);
        navigate('/wizard');
    };

    const PREMIUM_PRICE = 4.99;
    const CLUB_SHARE = 0.70;
    const ADOPTION_RATE = 0.40;
    const PLAN_COST = studentCount <= 25 ? 24.99 : studentCount <= 50 ? 39.99 : studentCount <= 80 ? 69 : studentCount <= 150 ? 129 : 199;

    const profitCalculation = useMemo(() => {
        const subscribers = Math.round(studentCount * ADOPTION_RATE);
        const clubRevenue = subscribers * PREMIUM_PRICE * CLUB_SHARE;
        const netProfit = clubRevenue - PLAN_COST;
        return {
            subscribers,
            monthlyRevenue: clubRevenue,
            planCost: PLAN_COST,
            netProfit
        };
    }, [studentCount, PLAN_COST]);

    return (
        <div className="bg-black min-h-screen font-sans text-white selection:bg-cyan-600 selection:text-white">
            <SEO
                title="TaekUp - Software That Pays Your Rent | DojoMint Protocol"
                description="Why pay for management software? Let your software pay your rent. The world's first martial arts platform with built-in DojoMint™ Protocol."
            />
            
            {/* --- HERO SECTION --- */}
            <div className="relative pt-20 pb-16 md:pt-32 md:pb-24 px-6 overflow-hidden border-b border-zinc-800">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-80"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="relative z-10 max-w-6xl mx-auto text-center flex flex-col items-center">
                    {showSignup ? (
                        <>
                            <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight text-white tracking-tighter">
                                START YOUR <span className="text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-cyan-600">14-DAY WEALTH CHALLENGE.</span>
                            </h1>
                            <p className="text-xl text-zinc-400 mb-10">
                                No credit card required. See your first profit projection in 2 minutes.
                            </p>
                            <div className="w-full max-w-md">
                                <SignupForm onSignupSuccess={handleSignupSuccess} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-6">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 shadow-[0_0_8px_2px_rgba(6,182,212,0.6)]"></span>
                                </span>
                                <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest font-bold">
                                    DojoMint™ Protocol Active
                                </p>
                            </div>
                            <h1 className="text-5xl md:text-8xl font-black mb-8 leading-tight text-white tracking-tighter">
                                WHY PAY FOR SOFTWARE? <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-cyan-600">LET IT PAY YOUR RENT.</span>
                            </h1>
                            <p className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto mb-10 leading-relaxed font-light">
                                The world's first martial arts platform with built-in <span className="text-white font-medium">DojoMint™ Protocol</span>. Start Free, Stay for the Profit.
                            </p>

                            {/* DOJOMINT PROTOCOL SIMULATOR */}
                            <div className="w-full max-w-2xl mx-auto bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 rounded-2xl border border-cyan-500/30 p-6 md:p-8 shadow-2xl mb-8">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <span className="text-2xl">⚡</span>
                                    <h3 className="text-xl font-bold text-white">DojoMint™ Protocol Simulator</h3>
                                </div>
                                <p className="text-zinc-500 text-sm text-center mb-6">See how our proprietary protocol generates passive income for your academy</p>
                                
                                <div className="mb-6">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-zinc-400 text-sm font-medium">Total Academy Students</label>
                                        <span className="text-2xl font-black text-white">{studentCount}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10"
                                        max="200"
                                        value={studentCount}
                                        onChange={(e) => setStudentCount(parseInt(e.target.value))}
                                        className="w-full h-3 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                                        style={{
                                            background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${((studentCount - 10) / 190) * 100}%, #3f3f46 ${((studentCount - 10) / 190) * 100}%, #3f3f46 100%)`
                                        }}
                                    />
                                    <div className="flex justify-between text-xs text-zinc-600 mt-1">
                                        <span>10</span>
                                        <span>200</span>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-r from-cyan-900/30 to-teal-900/30 rounded-xl p-5 border border-cyan-500/30 text-center">
                                    <p className="text-zinc-400 text-xs uppercase font-bold mb-2">Estimated DojoMint™ Generation</p>
                                    
                                    <div className="flex items-center justify-center gap-3 mb-3">
                                        <span className="text-zinc-500 text-sm">Platform Fee:</span>
                                        {profitCalculation.netProfit >= 0 ? (
                                            <span className="text-zinc-500 line-through">${profitCalculation.planCost.toFixed(0)}</span>
                                        ) : (
                                            <span className="text-zinc-400">${profitCalculation.planCost.toFixed(0)}</span>
                                        )}
                                        {profitCalculation.netProfit >= 0 && (
                                            <span className="text-cyan-400 font-bold">$0</span>
                                        )}
                                    </div>
                                    
                                    <p className="text-4xl md:text-5xl font-black text-cyan-400">
                                        +${profitCalculation.monthlyRevenue.toFixed(0)}<span className="text-lg text-zinc-500">/mo</span>
                                    </p>
                                    
                                    {profitCalculation.netProfit > 0 && (
                                        <p className="text-green-400 text-sm font-bold mt-3">
                                            Extra Profit: +${profitCalculation.netProfit.toFixed(0)}/month
                                        </p>
                                    )}
                                    
                                    <p className="text-zinc-500 text-xs mt-3">
                                        Your software doesn't cost money — it makes money.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowSignup(true)}
                                className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-black py-5 px-12 rounded-full transition-all transform hover:scale-105 shadow-[0_0_40px_rgba(6,182,212,0.4)] text-lg md:text-xl uppercase tracking-wide"
                            >
                                Start My 14-Day Wealth Challenge
                            </button>
                            <p className="mt-4 text-zinc-500 text-sm">
                                No Credit Card Required
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* --- COMPARISON TABLE SECTION --- */}
            <div className="py-20 md:py-32 px-6 bg-zinc-950 border-b border-zinc-800">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-12">
                        <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest font-bold mb-4">See The Difference</p>
                        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                            Stop Losing Money on Software
                        </h2>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-zinc-700 shadow-2xl">
                        {/* Table Header */}
                        <div className="grid grid-cols-3 bg-zinc-800">
                            <div className="p-4 md:p-6 border-r border-zinc-700"></div>
                            <div className="p-4 md:p-6 border-r border-zinc-700 text-center">
                                <p className="text-zinc-400 text-xs uppercase font-bold mb-1">Traditional Software</p>
                                <p className="text-white font-bold text-sm md:text-base">Kicksite / Maat</p>
                            </div>
                            <div className="p-4 md:p-6 text-center bg-gradient-to-r from-cyan-900/30 to-teal-900/30">
                                <p className="text-cyan-400 text-xs uppercase font-bold mb-1">The Future</p>
                                <p className="text-white font-bold text-sm md:text-base">TaekUp™ (DojoMint)</p>
                            </div>
                        </div>

                        {/* Row 1: Monthly Cost */}
                        <div className="grid grid-cols-3 border-t border-zinc-700">
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 flex items-center">
                                <span className="text-zinc-300 font-medium text-sm md:text-base">Monthly Cost</span>
                            </div>
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 text-center flex items-center justify-center">
                                <span className="text-red-400 font-bold text-lg md:text-2xl">$49 - $199</span>
                            </div>
                            <div className="p-4 md:p-6 bg-zinc-900/50 text-center flex items-center justify-center">
                                <div>
                                    <span className="text-cyan-400 font-black text-lg md:text-2xl">$0</span>
                                    <p className="text-cyan-400/70 text-xs mt-1">Covered by Profit</p>
                                </div>
                            </div>
                        </div>

                        {/* Row 2: Income Generator */}
                        <div className="grid grid-cols-3 border-t border-zinc-700">
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 flex items-center">
                                <span className="text-zinc-300 font-medium text-sm md:text-base">Income Generator</span>
                            </div>
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 text-center flex items-center justify-center">
                                <span className="text-zinc-500 font-bold text-lg md:text-xl">None</span>
                            </div>
                            <div className="p-4 md:p-6 bg-zinc-900/50 text-center flex items-center justify-center">
                                <div>
                                    <span className="text-teal-400 font-black text-lg md:text-xl">Unlimited</span>
                                    <p className="text-teal-400/70 text-xs mt-1">DojoMint™ Protocol</p>
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Gamification */}
                        <div className="grid grid-cols-3 border-t border-zinc-700">
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 flex items-center">
                                <span className="text-zinc-300 font-medium text-sm md:text-base">Gamification</span>
                            </div>
                            <div className="p-4 md:p-6 border-r border-zinc-700 bg-zinc-900 text-center flex items-center justify-center">
                                <span className="text-zinc-500 font-bold text-lg md:text-xl">Basic</span>
                            </div>
                            <div className="p-4 md:p-6 bg-zinc-900/50 text-center flex items-center justify-center">
                                <div>
                                    <span className="text-cyan-400 font-black text-sm md:text-lg">Legacy Cards™ & HonorXP™</span>
                                    <p className="text-cyan-400/70 text-xs mt-1">Full Engagement System</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- FEATURES TRIFECTA --- */}
            <div id="features" className="container mx-auto px-6 py-20 md:py-32">
                <div className="text-center mb-12">
                    <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest font-bold mb-4">Full Platform</p>
                    <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                        Everything You Need to Grow
                    </h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-cyan-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-cyan-500 transition-colors">01</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:rotate-6 transition-transform">
                            🥋
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">Pedagogy First</h2>
                        <p className="text-cyan-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">AI-Powered Teaching</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            AI Lesson Planners, 30-Second Grading, and automated feedback that sounds like YOU.
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
                            Dojang Rivals™, Legacy Cards™, and a ChronosBelt™ Predictor. Kids get addicted to progress.
                        </p>
                    </div>

                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-teal-500 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-teal-500 transition-colors">03</div>
                        <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:scale-110 transition-transform">
                            💰
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-white">DojoMint™ Protocol</h2>
                        <p className="text-teal-400 font-mono text-xs mb-4 uppercase tracking-widest font-bold">Software That Pays You</p>
                        <p className="text-zinc-400 leading-relaxed text-sm">
                            Our proprietary revenue engine works silently in the background, monetizing student engagement to cover your software costs and generate passive profit.
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
                            Manage with TaekUp™. Teach kids with TaekFunDo™. Train athletes with TikTaek™.
                        </p>
                    </div>

                </div>
            </div>

            {/* --- UNLIMITED SECTION --- */}
            <div className="bg-black py-20 md:py-32 relative overflow-hidden border-t border-zinc-900">
                <div className="container mx-auto px-6 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        <div>
                            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tighter leading-tight">
                                GROW YOUR EMPIRE,<br /><span className="text-cyan-500">NOT YOUR BILLS.</span>
                            </h2>
                            <p className="text-xl text-zinc-400 leading-relaxed max-w-md">
                                Competitors punish you for succeeding. They charge extra for every new location, staff member, and feature. <span className="text-white font-medium">We don't.</span>
                            </p>
                        </div>

                        <div className="space-y-10">
                            <div className="flex items-start">
                                <div className="text-cyan-500 font-black text-4xl mr-6 mt-[-8px] leading-none">01.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Locations</h4>
                                    <p className="text-zinc-500 leading-relaxed">Open 10 new branches? No extra fee. Manage your entire franchise from one screen.</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-white font-black text-4xl mr-6 mt-[-8px] leading-none">02.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Staff</h4>
                                    <p className="text-zinc-500 leading-relaxed">Add as many coaches, admins, and assistants as you need, free of charge.</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-zinc-700 font-black text-4xl mr-6 mt-[-8px] leading-none">03.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Unlimited Classes</h4>
                                    <p className="text-zinc-500 leading-relaxed">Schedule as many classes as you want. Your schedule is yours to control.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- FINAL CTA SECTION --- */}
            <div className="py-20 md:py-32 relative overflow-hidden border-t border-zinc-900 bg-gradient-to-b from-black to-zinc-900">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="container mx-auto px-6 relative z-10">
                    <div className="max-w-3xl mx-auto text-center">
                        <div className="inline-block mb-6 p-4 bg-cyan-500/10 rounded-full border border-cyan-500/50">
                            <span className="text-4xl">💸</span>
                        </div>

                        <h2 className="text-3xl md:text-5xl font-black text-white mb-6 tracking-tighter leading-tight">
                            READY TO STOP PAYING<br />
                            <span className="text-cyan-400">AND START EARNING?</span>
                        </h2>
                        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                            Join the revolution. Start your 14-day wealth challenge today and see how much profit you could be making.
                        </p>

                        <button 
                            onClick={() => setShowSignup(true)}
                            className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-black py-5 px-12 rounded-full shadow-[0_0_40px_rgba(6,182,212,0.4)] transform hover:scale-105 transition-all text-lg uppercase tracking-wide"
                        >
                            Start My 14-Day Wealth Challenge
                        </button>
                        <p className="text-zinc-600 text-sm mt-4">No Credit Card Required</p>
                    </div>
                </div>
            </div>

            {/* --- FOOTER --- */}
            <div className="py-12 text-center bg-black border-t border-zinc-800">
                <div className="max-w-4xl mx-auto px-6">
                    <p className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                        The Martial Arts Revolution
                    </p>
                    <div className="flex justify-center items-center opacity-60 mb-8">
                        <span className="text-2xl font-bold text-white tracking-wider">MYTAEK</span>
                    </div>
                    
                    {/* Legal / Copyright */}
                    <div className="border-t border-zinc-800 pt-6 mt-6">
                        <p className="text-zinc-600 text-[10px] leading-relaxed max-w-3xl mx-auto">
                            © 2025 mytaek Inc. All rights reserved.<br />
                            TaekUp, DojoMint™, SenseiVault™, and ChronosBelt™ are trademarks of mytaek Inc. The visual design of Legacy Cards™ and the Gamification UI are protected intellectual property. The Revenue Share Algorithm is a proprietary trade secret. Unauthorized copying or reverse engineering is strictly prohibited.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
