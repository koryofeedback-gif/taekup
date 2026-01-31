
import React, { useState, useEffect, useMemo } from 'react';
import type { WizardData, Student } from '../types';
import { isDemoModeEnabled, DEMO_STUDENTS, DEMO_EVENTS, DEMO_TV_BIRTHDAYS, DEMO_LEADERBOARD } from './demoData';

interface LobbyDisplayProps {
    data: WizardData;
    onClose: () => void;
}

export const LobbyDisplay: React.FC<LobbyDisplayProps> = ({ data, onClose }) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [time, setTime] = useState(new Date());
    const isDemo = isDemoModeEnabled();

    // --- DATA PREPARATION ---
    
    // 1. Top Students (use demo data in demo mode)
    const topStudents = useMemo(() => {
        if (isDemo) {
            return DEMO_LEADERBOARD.map((s, idx) => ({
                id: `demo-${idx}`,
                name: s.name,
                totalPoints: s.xp,
                beltId: s.belt.toLowerCase().replace(' belt', ''),
            }));
        }
        return [...data.students]
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .slice(0, 5);
    }, [data.students, isDemo]);

    // 2. Birthdays (use demo data in demo mode)
    const birthdayStudents = useMemo(() => {
        if (isDemo) {
            return DEMO_TV_BIRTHDAYS;
        }
        const currentMonth = new Date().getMonth();
        return data.students.filter(s => {
            if (!s.birthday) return false;
            return new Date(s.birthday).getMonth() === currentMonth;
        });
    }, [data.students, isDemo]);

    // 3. Upcoming Events (use demo data in demo mode)
    const upcomingEvents = useMemo(() => {
        if (isDemo) {
            return DEMO_EVENTS;
        }
        const now = new Date();
        return (data.events || [])
            .filter(e => new Date(e.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 3);
    }, [data.events, isDemo]);

    // 4. Today's Schedule (filter events for today or use demo)
    const todaySchedule = useMemo(() => {
        if (isDemo) {
            return [
                { id: 'd1', title: 'Little Dragons', time: '09:00', type: 'class', location: 'Main Hall' },
                { id: 'd2', title: 'Kids Beginner', time: '10:30', type: 'class', location: 'Main Hall' },
                { id: 'd3', title: 'Adult Kickboxing', time: '12:00', type: 'class', location: 'Studio B' },
                { id: 'd4', title: 'Competition Team', time: '16:00', type: 'training', location: 'Main Hall' },
                { id: 'd5', title: 'Family Open Mat', time: '18:00', type: 'open', location: 'Main Hall' },
            ];
        }
        const today = new Date().toDateString();
        return (data.events || [])
            .filter(e => new Date(e.date).toDateString() === today)
            .sort((a, b) => a.time?.localeCompare(b.time || '') || 0)
            .slice(0, 6);
    }, [data.events, isDemo]);

    // Define available slides based on data content
    const slides = useMemo(() => {
        const list = ['welcome', 'leaderboard'];
        if (todaySchedule.length > 0) list.push('schedule');
        if (birthdayStudents.length > 0) list.push('birthdays');
        if (upcomingEvents.length > 0) list.push('events');
        list.push('cta'); // Premium Benefits
        return list;
    }, [birthdayStudents.length, upcomingEvents.length, todaySchedule.length]);

    // --- EFFECT LOOPS ---

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Slide Rotation (10 seconds per slide)
    useEffect(() => {
        const rotation = setInterval(() => {
            setCurrentSlide(prev => (prev + 1) % slides.length);
        }, 10000);
        return () => clearInterval(rotation);
    }, [slides.length]);

    const activeSlide = slides[currentSlide];

    // --- RENDERERS ---

    const renderWelcome = () => {
        const clubName = isDemo ? 'Elite Taekwondo Academy' : (data.clubName || 'Welcome');
        const slogan = isDemo ? 'Building Champions, One Kick at a Time' : (data.slogan || 'Discipline. Focus. Success.');
        
        return (
            <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                <div className="w-56 h-56 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center border-4 border-cyan-500 shadow-[0_0_60px_rgba(6,182,212,0.4)] mb-10 overflow-hidden">
                    {!isDemo && typeof data.logo === 'string' ? (
                        <img src={data.logo} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-8xl">🥋</span>
                    )}
                </div>
                <h1 className="text-8xl font-black text-white mb-6 tracking-tight bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text">{clubName}</h1>
                <p className="text-4xl text-cyan-300 font-light tracking-widest uppercase">{slogan}</p>
                {isDemo && (
                    <div className="mt-12 flex items-center gap-6">
                        <div className="bg-cyan-900/30 border border-cyan-500/30 px-6 py-3 rounded-xl">
                            <span className="text-2xl text-cyan-400 font-bold">8 Students</span>
                        </div>
                        <div className="bg-yellow-900/30 border border-yellow-500/30 px-6 py-3 rounded-xl">
                            <span className="text-2xl text-yellow-400 font-bold">22K+ HonorXP™</span>
                        </div>
                        <div className="bg-green-900/30 border border-green-500/30 px-6 py-3 rounded-xl">
                            <span className="text-2xl text-green-400 font-bold">156 Challenges</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderLeaderboard = () => {
        const getBeltName = (student: any) => {
            if (isDemo) {
                const beltMap: Record<string, string> = {
                    'red': 'Red Belt', 'blue': 'Blue Belt', 'green': 'Green Belt', 
                    'yellow': 'Yellow Belt', 'white': 'White Belt', 'black': 'Black Belt'
                };
                return beltMap[student.beltId] || student.beltId;
            }
            return data.belts.find(b => b.id === student.beltId)?.name || '';
        };

        return (
            <div className="h-full flex flex-col justify-center px-20 animate-fade-in">
                <h2 className="text-5xl font-bold text-yellow-400 mb-12 text-center uppercase tracking-widest flex items-center justify-center">
                    <span className="text-7xl mr-4">🏆</span> Global Shogun Rank™
                </h2>
                <div className="space-y-6">
                    {topStudents.map((student, idx) => (
                        <div key={student.id} className={`flex items-center justify-between p-6 rounded-2xl border-2 ${idx === 0 ? 'bg-gradient-to-r from-yellow-900/40 to-orange-900/30 border-yellow-500/60 scale-105 shadow-2xl' : idx === 1 ? 'bg-gray-800/60 border-gray-500/50' : idx === 2 ? 'bg-gray-800/50 border-orange-700/40' : 'bg-gray-800/40 border-gray-700'}`}>
                            <div className="flex items-center space-x-6">
                                <div className={`text-5xl font-bold w-20 text-center ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </div>
                                <div>
                                    <p className={`text-4xl font-bold ${idx === 0 ? 'text-white' : 'text-gray-200'}`}>{student.name}</p>
                                    <p className="text-xl text-gray-400 mt-1">{getBeltName(student)}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`text-5xl font-black ${idx === 0 ? 'text-yellow-300' : 'text-sky-300'}`}>{student.totalPoints.toLocaleString()}</p>
                                <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">HonorXP™</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderBirthdays = () => (
        <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in bg-gradient-to-b from-gray-900 to-purple-900/20">
            <div className="text-9xl mb-8 animate-bounce">🎂</div>
            <h2 className="text-6xl font-bold text-white mb-4">Happy Birthday!</h2>
            <p className="text-3xl text-purple-300 mb-12 uppercase tracking-widest">Celebrating our students this month</p>
            
            <div className="flex flex-wrap justify-center gap-8 max-w-5xl">
                {birthdayStudents.map(s => (
                    <div key={s.id} className="bg-gray-800/80 backdrop-blur border-2 border-purple-500/30 px-10 py-6 rounded-xl shadow-lg">
                        <p className="text-4xl font-bold text-white">{s.name}</p>
                        <p className="text-xl text-purple-400 mt-2">{new Date(s.birthday).getDate()}th</p>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSchedule = () => {
        const getTypeColor = (type: string) => {
            switch (type) {
                case 'class': return 'bg-cyan-900/50 text-cyan-300 border-cyan-500/30';
                case 'training': return 'bg-purple-900/50 text-purple-300 border-purple-500/30';
                case 'open': return 'bg-green-900/50 text-green-300 border-green-500/30';
                default: return 'bg-gray-800/50 text-gray-300 border-gray-500/30';
            }
        };

        return (
            <div className="h-full flex flex-col justify-center px-20 animate-fade-in">
                <h2 className="text-5xl font-bold text-cyan-300 mb-12 text-center uppercase tracking-widest flex items-center justify-center">
                    <span className="text-7xl mr-4">🥋</span> Today's Schedule
                </h2>
                <div className="grid gap-4 max-w-4xl mx-auto w-full">
                    {todaySchedule.map((item: any) => (
                        <div key={item.id} className={`flex items-center p-6 rounded-2xl border-2 ${getTypeColor(item.type)}`}>
                            <div className="text-5xl font-bold text-white w-36 text-center font-mono">
                                {item.time}
                            </div>
                            <div className="flex-1 ml-8">
                                <p className="text-4xl font-bold text-white">{item.title}</p>
                                <p className="text-xl text-gray-400 mt-1">{item.location}</p>
                            </div>
                            <div className="text-3xl uppercase font-bold opacity-60">{item.type}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderEvents = () => (
        <div className="h-full flex flex-col justify-center px-20 animate-fade-in">
            <h2 className="text-5xl font-bold text-sky-300 mb-16 text-center uppercase tracking-widest flex items-center justify-center">
                <span className="text-7xl mr-4">📅</span> Upcoming Events
            </h2>
            <div className="grid gap-8">
                {upcomingEvents.map(evt => (
                    <div key={evt.id} className="flex bg-gray-800 border-l-8 border-sky-500 rounded-r-2xl overflow-hidden shadow-xl">
                        <div className="bg-gray-700 w-48 flex flex-col items-center justify-center p-4 border-r border-gray-600">
                            <span className="text-3xl font-bold text-gray-400 uppercase">{new Date(evt.date).toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-7xl font-black text-white">{new Date(evt.date).getDate()}</span>
                        </div>
                        <div className="p-8 flex-1 flex justify-between items-center">
                            <div>
                                <span className="inline-block bg-blue-900/50 text-blue-300 px-4 py-1 rounded-full text-xl font-bold uppercase mb-3">{evt.type}</span>
                                <h3 className="text-5xl font-bold text-white mb-2">{evt.title}</h3>
                                <p className="text-2xl text-gray-400">{evt.time} @ {evt.location}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderCTA = () => (
        <div className="h-full flex animate-fade-in">
            {/* Left Side - Hero Message */}
            <div className="w-1/2 flex flex-col justify-center pl-20 pr-12">
                <div className="mb-8">
                    <span className="inline-block px-6 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-black text-2xl uppercase tracking-wider rounded-full">
                        Premium Family
                    </span>
                </div>
                <h2 className="text-7xl font-black text-white leading-tight mb-6">
                    Elevate Your<br/>
                    <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
                        Training Journey
                    </span>
                </h2>
                <p className="text-3xl text-gray-300 leading-relaxed mb-10">
                    Give your child every advantage with exclusive training content and accelerated progress tracking.
                </p>
                <div className="flex items-baseline space-x-3">
                    <span className="text-7xl font-black text-white">$4.99</span>
                    <span className="text-3xl text-gray-400 font-light">/month</span>
                </div>
                <p className="text-2xl text-gray-500 mt-2">per family • cancel anytime</p>
            </div>

            {/* Right Side - Benefits */}
            <div className="w-1/2 flex items-center pr-16">
                <div className="space-y-5 w-full">
                    <div className="flex items-center bg-gradient-to-r from-gray-800/80 to-gray-800/40 p-7 rounded-2xl border border-gray-700/50 backdrop-blur">
                        <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mr-6 shadow-lg shadow-cyan-500/30">
                            <span className="text-4xl">📹</span>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">Exclusive Video Library</p>
                            <p className="text-xl text-gray-400">Pro techniques from world champions</p>
                        </div>
                    </div>
                    <div className="flex items-center bg-gradient-to-r from-gray-800/80 to-gray-800/40 p-7 rounded-2xl border border-gray-700/50 backdrop-blur">
                        <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center mr-6 shadow-lg shadow-yellow-500/30">
                            <span className="text-4xl">⚡</span>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">2x HonorXP™ Rewards</p>
                            <p className="text-xl text-gray-400">Climb the ranks twice as fast</p>
                        </div>
                    </div>
                    <div className="flex items-center bg-gradient-to-r from-gray-800/80 to-gray-800/40 p-7 rounded-2xl border border-gray-700/50 backdrop-blur">
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mr-6 shadow-lg shadow-purple-500/30">
                            <span className="text-4xl">🤖</span>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">AI Training Coach</p>
                            <p className="text-xl text-gray-400">Personalized insights for your child</p>
                        </div>
                    </div>
                    <div className="flex items-center bg-gradient-to-r from-gray-800/80 to-gray-800/40 p-7 rounded-2xl border border-gray-700/50 backdrop-blur">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mr-6 shadow-lg shadow-green-500/30">
                            <span className="text-4xl">🎯</span>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">Priority Booking</p>
                            <p className="text-xl text-gray-400">Reserve popular classes first</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-gray-900 text-white z-[100] overflow-hidden font-sans cursor-none">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black"></div>
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-yellow-500"></div>

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-20">
                <div className="flex items-center space-x-4">
                    <div className="text-2xl font-bold text-gray-400 uppercase tracking-wider">{data.clubName}</div>
                </div>
                <div className="text-right">
                    <div className="text-6xl font-bold font-mono tabular-nums text-white drop-shadow-lg">
                        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-2xl text-gray-400 uppercase font-medium mt-1">
                        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 h-full pt-32 pb-20">
                {activeSlide === 'welcome' && renderWelcome()}
                {activeSlide === 'leaderboard' && renderLeaderboard()}
                {activeSlide === 'schedule' && renderSchedule()}
                {activeSlide === 'birthdays' && renderBirthdays()}
                {activeSlide === 'events' && renderEvents()}
                {activeSlide === 'cta' && renderCTA()}
            </div>

            {/* Progress Bar Footer */}
            <div className="absolute bottom-0 left-0 w-full h-2 bg-gray-800">
                <div 
                    key={currentSlide} // Key forces reset of animation on slide change
                    className="h-full bg-sky-400 transition-all duration-linear w-full origin-left animate-progress"
                    style={{ animationDuration: '10000ms' }}
                ></div>
            </div>

            {/* Secret Close Button (Visible on Hover only) */}
            <button 
                onClick={onClose}
                className="absolute bottom-4 right-4 p-4 text-gray-600 hover:text-white hover:bg-red-600 rounded-full transition-all opacity-0 hover:opacity-100 z-50 cursor-pointer"
            >
                Exit TV Mode
            </button>

            <style>{`
                @keyframes progress {
                    from { transform: scaleX(0); }
                    to { transform: scaleX(1); }
                }
                .animate-progress {
                    animation-name: progress;
                    animation-timing-function: linear;
                }
            `}</style>
        </div>
    );
};
