
import React, { useState, useRef, useEffect } from 'react';
import type { WizardData } from '../../types';

interface Step6Props {
  data: WizardData;
  onUpdate: (data: Partial<WizardData>) => void;
}

export const Step6Branding: React.FC<Step6Props> = ({ data, onUpdate }) => {
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data.logo instanceof File) {
        const reader = new FileReader();
        reader.onloadend = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(data.logo);
    } else if (typeof data.logo === 'string') {
        setLogoPreview(data.logo);
    }
  }, [data.logo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpdate({ clubPhoto: file });
      const reader = new FileReader();
      reader.onloadend = () => setBgPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Branding & Confirmation</h1>
        <p className="text-gray-400 mt-2">Let’s make TaekUp look like your club.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left Side: Controls */}
        <div className="space-y-6">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-3">Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="primaryColor" className="text-sm font-medium text-gray-300">Primary Color</label>
                <input type="color" id="primaryColor" value={data.primaryColor} onChange={e => onUpdate({ primaryColor: e.target.value })} className="w-10 h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Theme Style</label>
                <div className="flex space-x-2">
                    <ThemeButton label="Modern" isActive={data.themeStyle === 'modern'} onClick={() => onUpdate({ themeStyle: 'modern'})} />
                    <ThemeButton label="Classic" isActive={data.themeStyle === 'classic'} onClick={() => onUpdate({ themeStyle: 'classic'})} />
                    <ThemeButton label="Minimal" isActive={data.themeStyle === 'minimal'} onClick={() => onUpdate({ themeStyle: 'minimal'})} />
                </div>
              </div>
               <div>
                <label className="block text-sm font-medium text-gray-300">Club Background (Optional)</label>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-1 w-full bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold py-2 px-4 rounded-md transition-colors">
                    Upload Photo
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
               <div>
                <label htmlFor="banner" className="block text-sm font-medium text-gray-300">Welcome Banner</label>
                 <input id="banner" value={data.welcomeBanner} onChange={e => onUpdate({ welcomeBanner: e.target.value })} className="mt-1 wizard-input" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Real App Preview */}
        <div>
           <h3 className="text-lg font-semibold text-white mb-2 text-center">
               Student App Preview
               <span className="block text-xs text-gray-400 font-normal mt-1">This is exactly what parents will see.</span>
           </h3>
           
           {/* Mock Parent Portal Container - mirrors ParentPortal.tsx structure */}
           <div className="bg-gray-900 rounded-3xl border-4 border-gray-800 overflow-hidden relative mx-auto max-w-sm shadow-2xl h-[400px] md:h-[500px] lg:h-[600px]">
                
                {/* App Header */}
                <div className="absolute top-0 left-0 right-0 z-20 p-3 flex justify-between items-center bg-gray-900/80 backdrop-blur-sm">
                    <div className="flex items-center space-x-2">
                        {logoPreview ? (
                            <img src={logoPreview} className="w-7 h-7 rounded-full object-cover border border-white/20" alt="logo" />
                        ) : (
                            <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-[10px] font-bold">Logo</div>
                        )}
                    </div>
                    <div className="text-[10px] text-gray-400 border border-gray-700 rounded px-2 py-0.5">English</div>
                </div>

                {/* Scrollable Content */}
                <div className="h-full overflow-y-auto p-4 pt-14 pb-20 no-scrollbar">
                    
                    {/* Hero Card */}
                    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-4 shadow-xl border border-gray-700 relative overflow-hidden mb-3">
                        {bgPreview && <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${bgPreview})`, backgroundSize: 'cover' }}></div>}
                        <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-8 -mt-8" style={{ backgroundColor: data.primaryColor, opacity: 0.1 }}></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-12 h-12 rounded-full border-2 border-white/20 bg-gray-700 flex items-center justify-center text-xl shadow-md">
                                    🥋
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Hi, Alex!</h2>
                                    <div className="flex items-center text-[11px] text-gray-400 mt-0.5">
                                        <div className="w-2.5 h-2.5 rounded-full mr-1.5 shadow-sm" style={{ backgroundColor: data.belts[0]?.color1 || 'white' }}></div>
                                        {data.belts[0]?.name || 'White Belt'}
                                    </div>
                                    <div className="text-[9px] text-cyan-400/70 mt-0.5 font-mono">MTK-2026-A7X9K2</div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="bg-gray-800/50 rounded-xl p-2 border border-gray-700/50">
                                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Attendance</p>
                                    <p className="text-base font-bold text-white">12 <span className="text-[9px] font-normal text-gray-500">classes</span></p>
                                </div>
                                <div className="bg-gray-800/50 rounded-xl p-2 border border-gray-700/50">
                                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Total HonorXP</p>
                                    <p className="text-base font-bold text-cyan-400">1,250</p>
                                </div>
                            </div>

                            {/* Global Rank Preview */}
                            <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-2 border border-cyan-500/30 flex items-center justify-between mb-3">
                                <div className="flex items-center">
                                    <span className="text-sm mr-1.5">🌍</span>
                                    <div>
                                        <p className="text-[10px] text-cyan-300 font-bold">Global Shogun Rank #42</p>
                                        <p className="text-[8px] text-gray-400">180 Global HonorXP</p>
                                    </div>
                                </div>
                                <span className="text-cyan-400 text-[10px]">View &gt;</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-2">
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Progress to Next Belt</span>
                                    <span>65%</span>
                                </div>
                                <div className="w-full bg-gray-700/50 rounded-full h-2.5 overflow-hidden shadow-inner">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all" style={{ width: '65%' }}></div>
                                </div>
                            </div>

                            {/* Stripes Earned */}
                            <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Stripes Earned</span>
                                    <span>2 of {data.stripesPerBelt}</span>
                                </div>
                                <div className="flex justify-between">
                                    {Array.from({ length: data.stripesPerBelt }).map((_, i) => {
                                        const isEarned = i < 2;
                                        const stripeColor = data.useColorCodedStripes && data.stripeColors?.[i] ? data.stripeColors[i] : '#FACC15';
                                        return (
                                            <div key={i} className={`h-1.5 flex-1 rounded-full mx-0.5 ${isEarned ? '' : 'bg-gray-700'}`}
                                                style={isEarned ? { backgroundColor: stripeColor, boxShadow: `0 0 6px ${stripeColor}80` } : {}}
                                            ></div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Action Cards */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900 border border-slate-600/40 p-3 rounded-xl">
                            <div className="text-xl mb-1">🏅</div>
                            <h4 className="font-bold text-white text-[11px]">Legacy Card</h4>
                            <p className="text-[8px] text-gray-400 mt-0.5">Digital student card</p>
                        </div>
                        <div className="bg-gradient-to-br from-red-900/70 to-red-950 border border-red-700/40 p-3 rounded-xl">
                            <div className="text-xl mb-1">⚔️</div>
                            <h4 className="font-bold text-white text-[11px]">Battle Arena</h4>
                            <p className="text-[8px] text-gray-400 mt-0.5">Challenges & quests</p>
                        </div>
                        <div className="bg-gradient-to-br from-cyan-900/70 to-cyan-950 border border-cyan-700/40 p-3 rounded-xl">
                            <div className="text-xl mb-1">📅</div>
                            <h4 className="font-bold text-white text-[11px]">Training Ops</h4>
                            <p className="text-[8px] text-gray-400 mt-0.5">Book classes</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-800/90 via-indigo-800/90 to-cyan-800/90 border border-purple-500/60 p-3 rounded-xl relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-cyan-500/10"></div>
                            <div className="absolute top-0.5 right-0.5">
                                <span className="text-[7px] text-white font-bold px-1 py-0.5 rounded" style={{ backgroundColor: data.primaryColor }}>NEW</span>
                            </div>
                            <div className="relative z-10">
                                <div className="text-xl mb-1">🔮</div>
                                <h4 className="font-bold text-white text-[11px]">ChronosBelt</h4>
                                <p className="text-[8px] text-cyan-300 mt-0.5">AI black belt date</p>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-violet-900/70 to-violet-950 border border-violet-700/40 p-3 rounded-xl">
                            <div className="text-xl mb-1">🧠</div>
                            <h4 className="font-bold text-white text-[11px]">Sensei Mind</h4>
                            <p className="text-[8px] text-gray-400 mt-0.5">AI training intel</p>
                        </div>
                        <div className="bg-gradient-to-br from-amber-900/70 to-amber-950 border border-amber-700/40 p-3 rounded-xl">
                            <div className="text-xl mb-1">🏆</div>
                            <h4 className="font-bold text-white text-[11px]">Arena Ranks</h4>
                            <p className="text-[8px] text-gray-400 mt-0.5">Leaderboard</p>
                        </div>
                    </div>

                    {/* Sensei Intel / Recent Feedback */}
                    <div>
                        <h3 className="font-bold text-gray-300 px-1 text-[10px] uppercase tracking-wider mb-2 flex items-center">
                            <span className="mr-1">💬</span> Sensei Intel
                        </h3>
                        <div className="bg-gray-800 p-3 rounded-xl border-l-2 shadow-sm relative" style={{ borderLeftColor: data.primaryColor }}>
                            <p className="text-gray-300 text-[11px] italic mb-2">"Alex showed great focus today! Keep up the good work on the new form."</p>
                            <div className="flex justify-between items-center text-[9px] text-gray-500">
                                <span>Today</span>
                                <span className="font-medium" style={{ color: data.primaryColor }}>✨ Coach AI</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Bottom Nav - matches real app */}
                <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 h-14 flex justify-around items-center z-20">
                    <div className="flex flex-col items-center" style={{ color: data.primaryColor }}>
                        <span className="text-base">🏠</span>
                        <span className="text-[8px] mt-0.5 font-medium">HQ</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-base">⚔️</span>
                        <span className="text-[8px] mt-0.5">Arena</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-base">💬</span>
                        <span className="text-[8px] mt-0.5">Feedback</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-base">🔮</span>
                        <span className="text-[8px] mt-0.5">Chronos</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-base">🧠</span>
                        <span className="text-[8px] mt-0.5">Sensei</span>
                    </div>
                </div>

           </div>
        </div>
      </div>
      
       <style>{`.wizard-input { background-color: #374151; border: 1px solid #4B5563; border-radius: 0.375rem; padding: 0.5rem 0.75rem; color: white; width: 100%; } .wizard-input:focus { outline: none; border-color: #3B82F6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5); }`}</style>
    </div>
  );
};

const ThemeButton: React.FC<{ label: string; isActive: boolean; onClick: () => void; }> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors w-full ${
      isActive
        ? 'bg-sky-500 text-white'
        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
    }`}
  >
    {label}
  </button>
);
