
import React from 'react';
import { Link } from 'react-router-dom';

interface MyTaekHomeProps {
    onNavigate: (page: string) => void;
}

export const MyTaekHome: React.FC<MyTaekHomeProps> = ({ onNavigate }) => {
    return (
        <div className="bg-black min-h-screen font-sans text-white selection:bg-red-600 selection:text-white relative">
            
            {/* --- CUSTOM HEADER --- */}
            <div className="absolute top-0 left-0 right-0 z-50 px-8 py-6 flex justify-between items-center">
                {/* Left: MYTAEK LOGO */}
                <div className="flex items-center group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <img 
                        src="/mytaek-logo.png" 
                        alt="MyTaek Logo" 
                        className="h-16 group-hover:scale-105 transition-transform"
                        style={{ filter: 'invert(1) hue-rotate(180deg)' }}
                    />
                </div>

                {/* Right: Navigation / Login */}
                <div className="flex items-center space-x-6">
                    <Link
                        to="/login"
                        className="text-zinc-400 hover:text-white text-sm font-bold tracking-widest uppercase transition-colors"
                    >
                        Log In
                    </Link>
                </div>
            </div>

            {/* --- HERO SECTION --- */}
            <div className="relative pt-40 pb-24 px-6 overflow-hidden border-b border-zinc-800">
                {/* Background Ambience */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-80"></div>
                
                {/* Red Accent Glow (Ambient) */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-[120px] pointer-events-none"></div>

                <div className="relative z-10 max-w-6xl mx-auto text-center flex flex-col items-center">
                    
                    <h1 className="text-5xl md:text-8xl font-black mb-8 leading-tight text-white tracking-tighter">
                        THE MARTIAL ARTS <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-800">REVOLUTION.</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-12 leading-relaxed font-light">
                        One platform to manage your <span className="text-white font-medium">Business</span>, 
                        teach your <span className="text-white font-medium">Curriculum</span>, 
                        and elevate your <span className="text-white font-medium">Students</span>.
                    </p>

                    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6">
                        <Link
                            to="/landing"
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-10 rounded-full transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(220,38,38,0.3)] text-lg text-center"
                        >
                            Start Free Trial
                        </Link>
                        <button
                            onClick={() => document.getElementById('ecosystem')?.scrollIntoView({ behavior: 'smooth' })}
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold py-4 px-10 rounded-full transition-all text-lg"
                        >
                            Explore Products
                        </button>
                    </div>
                </div>
            </div>

            {/* --- PRODUCT TRIFECTA --- */}
            <div id="ecosystem" className="container mx-auto px-6 -mt-12 relative z-20 pb-32">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* TaekUp Card */}
                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-red-600 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-red-600 transition-colors">01</div>
                        
                        <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-800 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:rotate-6 transition-transform">
                            🚀
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">TaekUp</h2>
                        <p className="text-red-500 font-mono text-xs mb-6 uppercase tracking-widest font-bold">Growth & Revenue</p>
                        <p className="text-zinc-400 mb-8 leading-relaxed text-sm min-h-[80px]">
                            The operating system for your club. Manage students, automate feedback, and turn your curriculum into passive income.
                        </p>
                        <Link
                            to="/landing"
                            className="w-full bg-black border border-zinc-700 hover:border-white text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-between group-hover:bg-white group-hover:text-black"
                        >
                            <span>Launch App</span>
                            <span>→</span>
                        </Link>
                    </div>

                    {/* TaekFunDo Card */}
                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-white transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white">02</div>
                        
                        <div className="w-16 h-16 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:-rotate-6 transition-transform border border-zinc-600">
                            🐯
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">TaekFunDo</h2>
                        <p className="text-zinc-500 font-mono text-xs mb-6 uppercase tracking-widest font-bold">Kids Curriculum</p>
                        <p className="text-zinc-400 mb-8 leading-relaxed text-sm min-h-[80px]">
                            Scientifically designed pedagogy for ages 3-7. We turn play into discipline using story-based learning.
                        </p>
                        <button className="w-full bg-black border border-zinc-700 hover:border-white text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-between opacity-50 cursor-not-allowed">
                            <span>Coming Soon</span>
                            <span>🔒</span>
                        </button>
                    </div>

                    {/* TikTaek Card */}
                    <div className="group bg-zinc-900 rounded-xl border border-zinc-800 p-8 hover:bg-zinc-800 hover:border-red-600 transition-all duration-500 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl font-black text-white group-hover:text-red-600 transition-colors">03</div>
                        
                        <div className="w-16 h-16 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-lg text-white transform group-hover:scale-110 transition-transform border border-zinc-600">
                            🎵
                        </div>
                        <h2 className="text-3xl font-bold mb-2 text-white">TikTaek</h2>
                        <p className="text-zinc-500 font-mono text-xs mb-6 uppercase tracking-widest font-bold">Rhythm & Performance</p>
                        <p className="text-zinc-400 mb-8 leading-relaxed text-sm min-h-[80px]">
                            Agility training synchronized with music. Build speed, coordination, and rhythm in a way that feels like a game.
                        </p>
                        <button className="w-full bg-black border border-zinc-700 hover:border-white text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-between opacity-50 cursor-not-allowed">
                            <span>Coming Soon</span>
                            <span>🔒</span>
                        </button>
                    </div>

                </div>
            </div>

            {/* --- BUILT FOR MASTERS SECTION (NEW) --- */}
            <div className="bg-black py-32 relative overflow-hidden border-t border-zinc-900">
                <div className="container mx-auto px-6 relative z-10">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        {/* Headlines */}
                        <div>
                            <h2 className="text-5xl font-black text-white mb-6 tracking-tighter leading-tight">
                                BUILT FOR <span className="text-red-600">MASTERS.</span>
                            </h2>
                            <p className="text-xl text-zinc-400 leading-relaxed max-w-md">
                                Martial Arts is about precision. Your software should be too. We removed the clutter and focused on what actually grows a modern dojang.
                            </p>
                        </div>

                        {/* List Points */}
                        <div className="space-y-10">
                            <div className="flex items-start">
                                <div className="text-red-600 font-black text-4xl mr-6 mt-[-8px] leading-none">01.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Pedagogy Over Paperwork</h4>
                                    <p className="text-zinc-500 leading-relaxed">We automate the administration so you can focus on teaching. 30-second grading, automated feedback, and instant digital certificates.</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-white font-black text-4xl mr-6 mt-[-8px] leading-none">02.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">Profit, Not Expense</h4>
                                    <p className="text-zinc-500 leading-relaxed">The only platform that pays you. Our proprietary revenue-share model is designed to cover your subscription costs and add to your bottom line.</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <div className="text-zinc-700 font-black text-4xl mr-6 mt-[-8px] leading-none">03.</div>
                                <div>
                                    <h4 className="text-xl font-bold text-white mb-2">The Complete Ecosystem</h4>
                                    <p className="text-zinc-500 leading-relaxed">TaekUp manages the club. TaekFunDo engages the kids. TikTaek trains the athletes. One brand, one vision, one login.</p>
                                </div>
                            </div>
                        </div>
                     </div>
                </div>
            </div>

            {/* --- CTA SECTION --- */}
            <div className="py-24 text-center bg-gradient-to-t from-zinc-900 to-black relative border-t border-zinc-800">
                <div className="max-w-3xl mx-auto px-6">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">Ready to elevate your Dojang?</h2>
                    <Link
                        to="/landing"
                        className="bg-white text-black hover:bg-zinc-200 text-lg font-bold py-4 px-10 rounded-full transition-all transform hover:scale-105 shadow-xl inline-block"
                    >
                        Start with TaekUp
                    </Link>
                </div>
            </div>

        </div>
    );
};
