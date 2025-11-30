import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignupForm } from '../components/SignupForm';
import { SEO } from '../components/SEO';
import { BeltIcon, CalendarIcon } from '../components/icons/FeatureIcons';
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
                title="TaekUp - Management Software | MyTaek"
                description="The Operating System for Modern Dojangs. Manage Students. Automate Growth. The only software that PAYS you to use it."
            />
            <HeroSection
                showSignup={showSignup}
                onStartTrial={() => setShowSignup(true)}
                onSignupSuccess={handleSignupSuccess}
            />
            <FeaturesSection />
            <MarketingSection />
            <ProfitEngineSection />
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
                        Start Your <span className="text-blue-400">14-Day</span> Free Trial
                    </h1>
                    <p className="text-lg text-gray-300 mb-8">
                        No credit card required. Unlock your dojang's full potential today.
                    </p>
                    <SignupForm onSignupSuccess={onSignupSuccess} />
                </>
            ) : (
                <>
                    <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 leading-tight">
                        Every Step Takes You Up.
                    </h1>
                    <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                        The ultimate management platform for your Martial Arts school.
                    </p>
                    <div className="flex flex-col items-center">
                        <button
                            onClick={onStartTrial}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full text-lg transition-transform transform hover:scale-105 shadow-lg shadow-blue-600/30"
                        >
                            Start Free Trial
                        </button>
                        <div className="mt-4 text-xs text-gray-500 font-semibold tracking-widest uppercase opacity-70">
                            Powered by MyTaek
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
);

const FeaturesSection: React.FC = () => (
    <div id="features" className="py-20 bg-gray-900">
        <div className="container mx-auto px-6">
            <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-extrabold text-white">Built for Modern Dojangs</h2>
                <p className="text-gray-400 mt-4">Everything you need to run a successful martial arts school.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <FeatureCard
                    icon="🥋"
                    title="Made for All Arts"
                    description="Whether you teach Taekwondo, Karate, BJJ, or Judo—our preset belt systems adapt to you instantly."
                />
                <FeatureCard
                    icon={<BeltIcon />}
                    title="Gamified Rank Tracking"
                    description="Visual progress bars, automated grading requirements, and one-click digital certificate generation."
                />
                <FeatureCard
                    icon={<CalendarIcon />}
                    title="Smart Scheduling"
                    description="Revenue-focused calendar with belt-gated classes and integrated Private Lesson upsells."
                />
                <FeatureCard
                    icon="✨"
                    title="AI Dojo Assistant"
                    description="Multi-language coach feedback, retention radar, and 30-second class grading workflow."
                />
            </div>
            <div className="mt-12 bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-3xl mx-auto text-center">
                <h3 className="font-bold text-white text-lg mb-2">Looking for Website & Payments?</h3>
                <p className="text-gray-400 text-sm">
                    Yes, we have them too. TaekUp includes a{' '}
                    <strong className="text-blue-400">Parent Web App</strong> (no more generic websites) and{' '}
                    <strong className="text-green-400">Integrated Payments</strong> (via Stripe) at no extra cost.
                </p>
            </div>
        </div>
    </div>
);

const MarketingSection: React.FC = () => (
    <div className="py-24 bg-gray-800 border-y border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>
        <div className="container mx-auto px-6 text-center relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
                Grow Your Empire, Not Your Bills.
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-12">
                Unlike competitors who nickel-and-dime you for every new location or staff member, TaekUp scales with
                your success.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">🌍</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Locations</h3>
                    <p className="text-gray-400">
                        Open 10 new branches? No extra fee. Manage your entire franchise from one screen.
                    </p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">🥋</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Staff</h3>
                    <p className="text-gray-400">
                        Add as many coaches, admins, and assistants as you need. We don't charge per user.
                    </p>
                </div>
                <div className="bg-gray-900/50 p-8 rounded-2xl border border-gray-700 transform hover:scale-105 transition-transform duration-300">
                    <div className="text-5xl mb-4">⏰</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Unlimited Classes</h3>
                    <p className="text-gray-400">
                        Run 100 classes a week? Great. Schedule as much as you want without limits.
                    </p>
                </div>
            </div>

            <div className="mt-16 bg-blue-900/20 inline-block py-2 px-6 rounded-full border border-blue-500/30">
                <span className="text-blue-400 font-bold uppercase tracking-wide text-sm">The TaekUp Guarantee</span>
            </div>
        </div>
    </div>
);

const ProfitEngineSection: React.FC = () => (
    <div className="py-24 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[800px] h-[400px] bg-yellow-600/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-4xl mx-auto text-center border border-yellow-600/30 bg-gray-800/40 backdrop-blur-sm rounded-3xl p-8 md:p-12 shadow-2xl">
                <div className="inline-block mb-4 p-3 bg-yellow-500/10 rounded-full border border-yellow-500/50">
                    <span className="text-3xl">💸</span>
                </div>

                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
                    Stop Paying for Software. <span className="text-yellow-500">Let Software Pay You.</span>
                </h2>
                <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-8 leading-relaxed">
                    Our proprietary <span className="font-bold text-white">Club Revenue Engine™</span> is designed to
                    offset your costs entirely.
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-6 mt-8 mb-8">
                    <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full md:w-auto min-w-[220px] opacity-70">
                        <p className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Every Other App</p>
                        <p className="text-red-400 text-2xl font-bold">Monthly Expense</p>
                    </div>
                    <div className="text-gray-600 font-bold text-2xl">VS</div>
                    <div className="bg-gray-900 p-6 rounded-xl border-2 border-yellow-500/60 w-full md:w-auto min-w-[240px] shadow-[0_0_30px_rgba(234,179,8,0.2)] scale-105">
                        <p className="text-yellow-500 text-xs uppercase font-bold tracking-wider mb-1">TaekUp</p>
                        <p className="text-green-400 text-2xl font-bold">Profit Center</p>
                    </div>
                </div>

                <div className="mt-8">
                    <button className="bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-bold py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-all">
                        Start Trial to See the Math
                    </button>
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
    <div className="bg-gray-800 p-8 rounded-lg border border-gray-700/50 shadow-lg hover:border-blue-500/50 hover:-translate-y-1 transition-all duration-300">
        <div className="bg-gray-700 text-blue-400 rounded-full h-12 w-12 flex items-center justify-center mb-6 text-2xl">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed text-sm">{description}</p>
    </div>
);

const TrustSection: React.FC = () => (
    <div className="bg-gray-900 py-16">
        <div className="container mx-auto px-6 text-center">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-6">
                Your Martial Arts Companion
            </p>
            <div className="flex justify-center items-center opacity-60">
                <span className="text-2xl font-bold text-white">MyTaek</span>
            </div>
        </div>
    </div>
);
