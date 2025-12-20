import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AwakeningRitualProps {
  onComplete?: () => void;
  onBack?: () => void;
}

const AwakeningRitual: React.FC<AwakeningRitualProps> = ({ onComplete, onBack }) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showDustPuff, setShowDustPuff] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const chargeRef = useRef<HTMLAudioElement | null>(null);
  const tapRef = useRef<HTMLAudioElement | null>(null);
  const crackRef = useRef<HTMLAudioElement | null>(null);
  
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    ambienceRef.current = new Audio('/assets/sfx_ambience_dojo.wav');
    chargeRef.current = new Audio('/assets/sfx_energy_charge.wav');
    tapRef.current = new Audio('/assets/sfx_tap_stone.wav');
    crackRef.current = new Audio('/assets/sfx_crack_crisp.wav');
    
    if (ambienceRef.current) {
      ambienceRef.current.loop = true;
      ambienceRef.current.volume = 0.3;
      ambienceRef.current.play().catch(() => {});
    }
    
    return () => {
      ambienceRef.current?.pause();
      chargeRef.current?.pause();
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
    };
  }, []);

  const handleEggTap = () => {
    if (isCompleted) return;
    
    tapRef.current?.play().catch(() => {});
    
    setShowDustPuff(true);
    setTimeout(() => setShowDustPuff(false), 500);
    
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const startHolding = useCallback(() => {
    if (isCompleted) return;
    
    setIsHolding(true);
    
    if (decayIntervalRef.current) {
      clearInterval(decayIntervalRef.current);
      decayIntervalRef.current = null;
    }
    
    if (chargeRef.current) {
      chargeRef.current.currentTime = 0;
      chargeRef.current.loop = true;
      chargeRef.current.play().catch(() => {});
    }
    
    holdIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        const newProgress = Math.min(prev + 2, 100);
        
        if (newProgress >= 100) {
          if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
          chargeRef.current?.pause();
          triggerCompletion();
          return 100;
        }
        
        return newProgress;
      });
    }, 50);
  }, [isCompleted]);

  const stopHolding = useCallback(() => {
    setIsHolding(false);
    
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    
    chargeRef.current?.pause();
    
    if (!isCompleted && progress < 100) {
      decayIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = Math.max(prev - 1, 0);
          if (newProgress <= 0) {
            if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
          }
          return newProgress;
        });
      }, 100);
    }
  }, [isCompleted, progress]);

  const triggerCompletion = () => {
    crackRef.current?.play().catch(() => {});
    
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);
    
    setIsCompleted(true);
    setIsHolding(false);
    
    onComplete?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Game Container - Mobile Portrait Aspect Ratio */}
      <div 
        className="relative w-full h-full overflow-hidden"
        style={{ maxWidth: '450px' }}
      >
        {/* Background */}
        <img 
          src="/assets/bg_dojo_level1.jpg" 
          alt="Dojo Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Flash Effect */}
        {showFlash && (
          <div className="absolute inset-0 bg-white z-50 animate-pulse" />
        )}
        
        {/* Back Button */}
        {onBack && (
          <button 
            onClick={onBack}
            className="absolute top-4 left-4 z-40 bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-lg backdrop-blur-sm transition-colors"
          >
            ← Back
          </button>
        )}
        
        {/* Toast Message */}
        {showToast && !isCompleted && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-xl text-center animate-fadeIn z-40 w-[90%] max-w-[300px]">
            <p className="text-sm">It's dormant. Use your Spirit Energy.</p>
            <p className="text-xs text-cyan-400 mt-1">Hold the button below ↓</p>
          </div>
        )}
        
        {/* Pedestal - Positioned from bottom */}
        <div 
          className="absolute z-10"
          style={{
            bottom: '180px',
            left: '50%',
            transform: 'translateX(-50%)'
          }}
        >
          <img 
            src="/assets/pedestal_stone.png"
            alt="Stone Pedestal"
            className="w-64 h-auto object-contain"
          />
        </div>
        
        {/* Egg Container - Positioned to sit ON pedestal */}
        <div 
          className="absolute z-20"
          style={{
            bottom: '280px',
            left: '50%',
            transform: 'translateX(-50%)'
          }}
        >
          {/* Glow Effect */}
          <div 
            className={`absolute -inset-16 transition-opacity duration-500 ${
              isHolding ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              animation: isHolding ? 'pulse 1s ease-in-out infinite' : 'none'
            }}
          >
            <img 
              src="/assets/vfx_glow_flare.png" 
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
          
          {/* Egg */}
          <div 
            onClick={handleEggTap}
            className={`relative cursor-pointer transition-transform ${
              isHolding ? 'animate-shake' : ''
            }`}
          >
            <img 
              src={isCompleted ? '/assets/egg_state_crack_yellow.png' : '/assets/egg_state_dormant.png'}
              alt="Mysterious Egg"
              className="w-32 h-40 object-contain relative z-10"
            />
            
            {/* Dust Puff */}
            {showDustPuff && (
              <img 
                src="/assets/vfx_dust_puff.png"
                alt=""
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 object-contain animate-fadeOut z-20"
              />
            )}
          </div>
        </div>
        
        {/* UI Container - Fixed at bottom, centered */}
        {!isCompleted && (
          <div 
            className="absolute z-30"
            style={{
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px',
              padding: '0 20px',
              boxSizing: 'border-box'
            }}
          >
            {/* Progress Bar */}
            <div className="relative w-full max-w-[280px] h-8">
              <img 
                src="/assets/ui_bar_frame.png"
                alt=""
                className="absolute inset-0 w-full h-full object-fill"
              />
              <div 
                className="absolute top-[15%] h-[70%] bg-gradient-to-r from-yellow-500 to-orange-500 rounded-sm transition-all duration-100"
                style={{ 
                  left: '4%',
                  width: `${progress * 0.92}%` 
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow-lg">
                {Math.round(progress)}%
              </span>
            </div>
            
            {/* Hold Button */}
            <button
              onMouseDown={startHolding}
              onMouseUp={stopHolding}
              onMouseLeave={stopHolding}
              onTouchStart={(e) => { e.preventDefault(); startHolding(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopHolding(); }}
              className={`relative active:scale-95 transition-transform select-none ${
                isHolding ? 'scale-110' : ''
              }`}
            >
              <img 
                src="/assets/ui_btn_action.png"
                alt="Hold to Infuse"
                className="w-56 h-16 object-contain"
              />
              <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-base drop-shadow-lg">
                {isHolding ? 'CHANNELING...' : 'HOLD TO INFUSE'}
              </span>
            </button>
          </div>
        )}
        
        {/* Completion Panel */}
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-[90%] max-w-[320px]">
              <img 
                src="/assets/ui_panel_bg.png"
                alt=""
                className="w-full"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <span className="text-4xl mb-4">✨</span>
                <h2 className="text-xl font-bold text-yellow-400 mb-2">A crack appeared!</h2>
                <p className="text-white text-sm">
                  It's reacting... Let it rest until tomorrow.
                </p>
                <button 
                  onClick={onBack}
                  className="mt-6 bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white font-bold px-6 py-2 rounded-lg transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px) rotate(-1deg); }
          20%, 40%, 60%, 80% { transform: translateX(2px) rotate(1deg); }
        }
        
        @keyframes fadeOut {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
        }
        
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        
        .animate-shake {
          animation: shake 0.3s ease-in-out infinite;
        }
        
        .animate-fadeOut {
          animation: fadeOut 0.5s ease-out forwards;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default AwakeningRitual;
