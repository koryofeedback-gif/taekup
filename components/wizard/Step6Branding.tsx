
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
           <div className="bg-gray-900 rounded-3xl border-4 border-gray-800 overflow-hidden relative mx-auto max-w-sm shadow-2xl" style={{ height: '600px' }}>
                
                {/* App Header */}
                <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        {logoPreview ? (
                            <img src={logoPreview} className="w-8 h-8 rounded-full object-cover border border-white/20" alt="logo" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-[10px] font-bold">Logo</div>
                        )}
                    </div>
                    <div className="text-xs text-gray-400 border border-gray-700 rounded px-2 py-1">English</div>
                </div>

                {/* Scrollable Content */}
                <div className="h-full overflow-y-auto p-4 pt-16 pb-20 no-scrollbar">
                    
                    {/* Hero Card */}
                    <div className="rounded-2xl p-6 shadow-xl border border-gray-700 relative overflow-hidden mb-4" style={{ background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)' }}>
                        {bgPreview && <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${bgPreview})`, backgroundSize: 'cover' }}></div>}
                        
                        <div className="relative z-10">
                            <div className="flex items-center space-x-4 mb-6">
                                <div className="w-14 h-14 rounded-full border-2 border-white/20 bg-gray-700 flex items-center justify-center text-2xl shadow-md">
                                    🥋
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Hi, Alex!</h2>
                                    <div className="flex items-center text-xs text-gray-400 mt-1">
                                        <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: data.belts[0]?.color1 || 'white' }}></div>
                                        {data.belts[0]?.name || 'White Belt'}
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div className="bg-gray-800/60 rounded-lg p-2 border border-gray-600/30 backdrop-blur-sm">
                                    <p className="text-[10px] text-gray-400 uppercase">Attendance</p>
                                    <p className="text-lg font-bold text-white">12 <span className="text-[10px] font-normal text-gray-500">classes</span></p>
                                </div>
                                <div className="bg-gray-800/60 rounded-lg p-2 border border-gray-600/30 backdrop-blur-sm">
                                    <p className="text-[10px] text-gray-400 uppercase">Streak</p>
                                    <p className="text-lg font-bold text-green-400">🔥 5 <span className="text-[10px] font-normal text-gray-500">days</span></p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                    <span>Next Belt Progress</span>
                                    <span>65%</span>
                                </div>
                                <div className="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden">
                                    <div className="h-full transition-all" style={{ width: '65%', backgroundColor: data.primaryColor }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Premium Teaser */}
                    <div className="bg-gray-800 border border-gray-700 p-3 rounded-xl flex items-center justify-between mb-4 group">
                        <div className="flex items-center">
                            <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center text-sm mr-3">📹</div>
                            <div>
                                <h4 className="font-bold text-white text-xs">Practice at Home</h4>
                                <p className="text-[10px] text-gray-400">Unlock training videos</p>
                            </div>
                        </div>
                        <div className="text-gray-500 text-xs">→</div>
                    </div>

                    {/* Recent Feedback */}
                    <div>
                        <h3 className="font-bold text-gray-300 px-1 text-xs uppercase tracking-wider mb-2">Recent Feedback</h3>
                        <div className="bg-gray-800 p-3 rounded-xl border-l-2 shadow-sm relative" style={{ borderLeftColor: data.primaryColor }}>
                            <p className="text-gray-300 text-xs italic mb-2">"Alex showed great focus today! Keep up the good work on the new form."</p>
                            <div className="flex justify-between items-center text-[10px] text-gray-500">
                                <span>Today</span>
                                <span className="font-medium" style={{ color: data.primaryColor }}>✨ Coach AI</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Bottom Nav */}
                <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 h-16 flex justify-around items-center z-20">
                    <div className="flex flex-col items-center" style={{ color: data.primaryColor }}>
                        <span className="text-lg">🏠</span>
                        <span className="text-[9px] mt-1 font-medium">Home</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-lg">📅</span>
                        <span className="text-[9px] mt-1">Booking</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-lg">🚀</span>
                        <span className="text-[9px] mt-1">Journey</span>
                    </div>
                    <div className="flex flex-col items-center text-gray-500">
                        <span className="text-lg">📊</span>
                        <span className="text-[9px] mt-1">Insights</span>
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
