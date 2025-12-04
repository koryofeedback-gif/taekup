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
        <>
            <SEO
                title="TaekUp - The Growth Engine for Martial Arts | MyTaek"
                description="TaekUp isn't just management software. It's a Growth Engine that gamifies retention, automates pedagogy, and turns your roster into revenue."
            />
            <HeroSection
                showSignup={showSignup}
                onStartTrial={() => setShowSignup(true)}
                onSignupSuccess={handleSignupSuccess}
            />
            <TransformationSection />
            <UnlimitedSection />
            <ProfitEngineSection onStartTrial={() => setShowSignup(true)} />
            <TrustSection />
        </>
    );
};

interface HeroSectionProps {
    showSignup: boolean;
    onStartTrial: () => void;
    onSignupSuccess: (data: SignupData) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ showSignup, onStartTrial, onSignupSuccess }) => (
    <div className="relative text-center py-20 md:py-32 px-6 bg-dots-pattern">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-900/80 to-gray-900"></div>
        <div className="relative z-10 max-w-4xl mx-auto">
            {showSignup ? (
                <>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
                        Start Your <span className="text-sky-300">14-Day</span> Free Trial
                    </h1>
                    <p className="text-lg text-gray-300 mb-8">
                        No credit card required. Unlock your dojang's full potential today.
                    </p>
                    <SignupForm onSignupSuccess={onSignupSuccess} />
                </>
            ) : (
                <>
                    <p className="text-sky-400 font-semibold uppercase tracking-widest text-sm mb-4">
                        The Future of Martial Arts Business
                    </p>
                    <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
                        Every Step Takes You Up.
                    </h1>
                    <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
                        TaekUp isn't just management software. It's a <span className="text-sky-300 font-semibold">Growth Engine</span> that gamifies retention, automates pedagogy, and turns your roster into revenue.
                    </p>
                    <div className="flex flex-col items-center">
                        <button
                            onClick={onStartTrial}
                            className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 px-10 rounded-full text-lg transition-transform transform hover:scale-105 shadow-lg shadow-blue-600/30"
                        >
                            Start Free Trial
                        </button>
                        <div className="mt-6 text-xs text-gray-500 font-semibold tracking-widest uppercase opacity-70">
                            Powered by MyTaek
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
);

const TransformationSection: React.FC = () => (
    <div id="features" className="py-24 bg-gray-900">
        <div className="container mx-auto px-6">
            <div className="text-center mb-16">
                <p className="text-sky-400 font-semibold uppercase tracking-widest text-sm mb-3">
                    Not Just "Management."
                </p>
                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">Transformation.</h2>
                <p className="text-gray-400 mt-4 text-lg max-w-2xl mx-auto">
                    We don't just track attendance. We engineer growth through gamification and AI.
                </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                <FeatureCard
                    icon="🥋"
                    title="Pedagogy First"
                    description="AI Lesson Planners, 30-Second Grading, and automated feedback that sounds like YOU. We help you teach better."
                />
                <FeatureCard
                    icon="🎮"
                    title="Gamified Retention"
                    description="Dojang Rivals, Fighter Cards, and a Black Belt Time Machine. We make kids addicted to progress."
                />
                <FeatureCard
                    icon="💰"
                    title="Revenue Engine"
                    description="Turn your curriculum into a paid video library. We share 70% of the revenue with you. The software pays for itself."
                />
                <FeatureCard
                    icon="🌐"
                    title="The Ecosystem"
                    description="Manage the club with TaekUp. Teach kids with TaekFunDo. Train athletes with TikTaek. One connected world."
                />
            </div>
        </div>
    </div>
);

const UnlimitedSection: React.FC = () => (
    <div className="py-24 bg-gray-800 border-y border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>
        <div className="container mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
                Grow Your Empire, Not Your Bills.
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-12">
                Competitors punish you for succeeding. They charge extra for every new location, every new staff member, and every new feature.
                <br />
                <span className="text-white font-semibold">We don't.</span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">🌍</div>
                    <h3 className="text-2xl font-bold text-white mb-3">Unlimited Locations</h3>
                    <p className="text-gray-400">
                        Open 10 new branches? No extra fee. Manage your entire franchise from one screen without paying a "Location Tax."
                    </p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border-2 border-sky-500/50 transform hover:scale-105 transition-transform duration-300 relative">
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Best Value
                    </div>
                    <div className="text-5xl mb-4">🥋</div>
                    <h3 className="text-2xl font-bold text-white mb-3">Unlimited Staff</h3>
                    <p className="text-gray-400">
                        Add as many coaches, admins, and assistants as you need. We believe your team should grow with you, free of charge.
                    </p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">⏰</div>
                    <h3 className="text-2xl font-bold text-white mb-3">Unlimited Classes</h3>
                    <p className="text-gray-400">
                        Run 100 classes a week? Great. Schedule as much as you want without limits. Your schedule is yours to control.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

interface ProfitEngineSectionProps {
    onStartTrial: () => void;
}

const ProfitEngineSection: React.FC<ProfitEngineSectionProps> = ({ onStartTrial }) => (
    <div className="py-24 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-yellow-600/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl mx-auto text-center border border-yellow-600/30 bg-gray-800/40 backdrop-blur-sm rounded-3xl p-8 md:p-12 shadow-2xl">
                <div className="inline-block mb-4 p-3 bg-yellow-500/10 rounded-full border border-yellow-500/50">
                    <span className="text-3xl">💸</span>
                </div>

                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
                    Stop Paying for Software.<br />
                    <span className="text-yellow-500">Let Software Pay You.</span>
                </h2>
                <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-10 leading-relaxed">
                    Every other platform is a monthly expense. TaekUp is an asset. Our proprietary <span className="font-bold text-white">Club Revenue Engine™</span> shares 70% of the revenue directly with you.
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-10">
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full md:w-auto min-w-[220px] opacity-70">
                        <p className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">The Old Way</p>
                        <p className="text-red-400 text-3xl font-bold">-$199/mo</p>
                        <p className="text-gray-500 text-sm mt-1">Pure Expense</p>
                    </div>
                    <div className="text-gray-600 font-bold text-3xl">VS</div>
                    <div className="bg-gray-900 p-6 rounded-xl border-2 border-yellow-500/60 w-full md:w-auto min-w-[240px] shadow-[0_0_30px_rgba(234,179,8,0.2)] scale-105">
                        <p className="text-yellow-500 text-xs uppercase font-bold tracking-wider mb-2">TaekUp Way</p>
                        <p className="text-green-400 text-3xl font-bold">+$450/mo</p>
                        <p className="text-green-400/80 text-sm mt-1">Net Profit</p>
                    </div>
                </div>

                <div className="mt-8">
                    <button 
                        onClick={onStartTrial}
                        className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-4 px-10 rounded-full shadow-lg transform hover:scale-105 transition-all text-lg"
                    >
                        Start Trial to See the Math
                    </button>
                    <p className="text-gray-500 text-sm mt-4">Based on a standard club with 150 students.</p>
                </div>
            </div>
        </div>
    </div>
);

interface FeatureCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
    <div className="bg-gray-800 p-8 rounded-xl border border-gray-700/50 shadow-lg hover:border-sky-500/50 hover:-translate-y-1 transition-all duration-300">
        <div className="text-4xl mb-5">{icon}</div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
    </div>
);

const TrustSection: React.FC = () => (
    <div className="bg-gray-900 py-16">
        <div className="container mx-auto px-6 text-center">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">
                Your Martial Arts Companion
            </p>
            <div className="flex justify-center items-center opacity-60">
                <span className="text-2xl font-bold text-white tracking-wider">MYTAEK</span>
            </div>
        </div>
    </div>
);
