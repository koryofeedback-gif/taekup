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

  const [audioStarted, setAudioStarted] = useState(false);

  useEffect(() => {
    ambienceRef.current = new Audio('/assets/sfx_ambience_dojo.wav');
    chargeRef.current = new Audio('/assets/sfx_energy_charge.wav');
    tapRef.current = new Audio('/assets/sfx_tap_stone.wav');
    crackRef.current = new Audio('/assets/sfx_crack_crisp.wav');
    
    if (ambienceRef.current) {
      ambienceRef.current.loop = true;
      ambienceRef.current.volume = 0.3;
    }
    
    return () => {
      ambienceRef.current?.pause();
      chargeRef.current?.pause();
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
    };
  }, []);

  const startAudioOnInteraction = useCallback(() => {
    if (!audioStarted && ambienceRef.current) {
      ambienceRef.current.play().catch(() => {});
      setAudioStarted(true);
    }
  }, [audioStarted]);

  const handleEggTap = () => {
    if (isCompleted) return;
    
    startAudioOnInteraction();
    tapRef.current?.play().catch(() => {});
    
    setShowDustPuff(true);
    setTimeout(() => setShowDustPuff(false), 500);
    
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const startHolding = useCallback(() => {
    if (isCompleted) return;
    
    startAudioOnInteraction();
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
  }, [isCompleted, startAudioOnInteraction]);

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
    <div className="awakening-screen">
      {/* Game Container - Mobile Portrait Aspect Ratio */}
      <div className="awakening-container">
        {/* Background */}
        <img 
          src="/assets/bg_dojo_level1.jpg" 
          alt="Dojo Background"
          className="awakening-bg"
        />
        
        {/* Flash Effect */}
        {showFlash && <div className="flash-overlay" />}
        
        {/* Back Button */}
        {onBack && (
          <button onClick={onBack} className="back-button">
            ← Back
          </button>
        )}
        
        {/* Toast Message */}
        {showToast && !isCompleted && (
          <div className="toast-message">
            <p className="toast-text">It's dormant. Use your Spirit Energy.</p>
            <p className="toast-hint">Hold the button below ↓</p>
          </div>
        )}
        
        {/* Egg - Top layer, sits ON pedestal */}
        <div className={`egg-container ${isHolding ? 'shaking' : ''}`}>
          {/* Glow Effect */}
          <div className={`glow-effect ${isHolding ? 'visible' : ''}`}>
            <img src="/assets/vfx_glow_flare.png" alt="" className="glow-image" />
          </div>
          
          {/* Egg */}
          <img 
            src={isCompleted ? '/assets/egg_state_crack_yellow.png' : '/assets/egg_state_dormant.png'}
            alt="Mysterious Egg"
            className="egg-image"
            onClick={handleEggTap}
          />
          
          {/* Dust Puff */}
          {showDustPuff && (
            <img src="/assets/vfx_dust_puff.png" alt="" className="dust-puff" />
          )}
        </div>
        
        {/* Pedestal - Sits on floor above UI */}
        <img 
          src="/assets/pedestal_stone.png"
          alt="Stone Pedestal"
          className="pedestal-image"
        />
        
        {/* UI Container - Bottom layer */}
        {!isCompleted && (
          <div className="ui-container">
            {/* Progress Bar */}
            <div className="progress-bar-container">
              <img src="/assets/ui_bar_frame.png" alt="" className="bar-frame" />
              <div 
                className="bar-fill"
                style={{ width: `${progress * 0.92}%`, right: 'auto' }}
              />
              <span className="bar-text">{Math.round(progress)}%</span>
            </div>
            
            {/* Hold Button */}
            <button
              onMouseDown={startHolding}
              onMouseUp={stopHolding}
              onMouseLeave={stopHolding}
              onTouchStart={(e) => { e.preventDefault(); startHolding(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopHolding(); }}
              className={`action-button ${isHolding ? 'pressing' : ''}`}
            >
              <img src="/assets/ui_btn_action.png" alt="Hold to Infuse" className="button-image" />
              <span className="button-text">
                {isHolding ? 'CHANNELING...' : 'HOLD TO INFUSE'}
              </span>
            </button>
          </div>
        )}
        
        {/* Completion Panel */}
        {isCompleted && (
          <div className="completion-overlay">
            <div className="completion-panel">
              <img src="/assets/ui_panel_bg.png" alt="" className="panel-bg" />
              <div className="panel-content">
                <span className="panel-icon">✨</span>
                <h2 className="panel-title">A crack appeared!</h2>
                <p className="panel-text">It's reacting... Let it rest until tomorrow.</p>
                <button onClick={onBack} className="continue-button">
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        .awakening-screen {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: black;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .awakening-container {
          position: relative;
          width: 100%;
          max-width: 450px;
          height: 100vh;
          overflow: hidden;
        }
        
        .awakening-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .flash-overlay {
          position: absolute;
          inset: 0;
          background: white;
          z-index: 50;
          animation: flash 0.2s ease-out;
        }
        
        .back-button {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 40;
          background: rgba(0,0,0,0.5);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          backdrop-filter: blur(4px);
          transition: background 0.2s;
        }
        .back-button:hover {
          background: rgba(0,0,0,0.7);
        }
        
        .toast-message {
          position: absolute;
          top: 100px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(4px);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          text-align: center;
          z-index: 40;
          width: 90%;
          max-width: 300px;
          animation: fadeIn 0.3s ease-out;
        }
        .toast-text {
          font-size: 14px;
          margin: 0;
        }
        .toast-hint {
          font-size: 12px;
          color: #22d3ee;
          margin: 8px 0 0 0;
        }
        
        /* UI Container - Anchored to bottom */
        .ui-container {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
          z-index: 10;
        }
        
        .progress-bar-container {
          position: relative;
          width: 300px;
          height: 55px;
          padding: 0;
        }
        .bar-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: fill;
        }
        .bar-fill {
          position: absolute;
          top: 18%;
          bottom: 18%;
          left: 5%;
          right: 5%;
          height: auto;
          background: linear-gradient(to right, #eab308, #f97316);
          border-radius: 10px;
          transition: width 0.1s;
        }
        .bar-text {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: bold;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          z-index: 5;
        }
        
        .action-button {
          position: relative;
          border: none;
          background: none;
          cursor: pointer;
          transition: transform 0.1s;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 280px;
          height: 70px;
          padding: 0;
          margin: 0;
          white-space: nowrap;
        }
        .action-button:active, .action-button.pressing {
          transform: scale(1.1);
        }
        .button-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: fill;
        }
        .button-text {
          position: relative;
          z-index: 10;
          color: white;
          font-weight: bold;
          font-size: 16px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          margin: 0;
          padding: 0;
          line-height: 1;
        }
        
        /* Pedestal - Sits on floor above UI (percentage-based) */
        .pedestal-image {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          width: 50%;
          max-width: 220px;
          z-index: 5;
        }
        
        /* Egg Container - Sits on top of pedestal (percentage-based) */
        .egg-container {
          position: absolute;
          bottom: 35%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .egg-container.shaking {
          animation: shake 0.3s ease-in-out infinite;
        }
        
        .egg-image {
          width: 120px;
          height: auto;
          cursor: pointer;
          position: relative;
          z-index: 2;
        }
        
        .glow-effect {
          position: absolute;
          inset: -60px;
          opacity: 0;
          transition: opacity 0.5s;
          z-index: 1;
        }
        .glow-effect.visible {
          opacity: 1;
          animation: pulse 1s ease-in-out infinite;
        }
        .glow-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        
        .dust-puff {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120px;
          height: 120px;
          object-fit: contain;
          animation: fadeOut 0.5s ease-out forwards;
          z-index: 10;
        }
        
        /* Completion Panel */
        .completion-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          z-index: 40;
          animation: fadeIn 0.3s ease-out;
        }
        .completion-panel {
          position: relative;
          width: 90%;
          max-width: 350px;
          min-height: 200px;
          background-image: url('/assets/ui_panel_bg.png');
          background-size: 100% 100%;
          background-repeat: no-repeat;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          color: #fff;
        }
        .panel-bg {
          display: none;
        }
        .panel-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0;
          text-align: center;
        }
        .panel-icon {
          font-size: 40px;
          margin-bottom: 16px;
        }
        .panel-title {
          font-size: 20px;
          font-weight: bold;
          color: #facc15;
          margin: 0 0 8px 0;
        }
        .panel-text {
          font-size: 14px;
          color: white;
          margin: 0;
        }
        .continue-button {
          margin-top: 24px;
          background: linear-gradient(to right, #06b6d4, #0d9488);
          color: white;
          font-weight: bold;
          padding: 10px 24px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .continue-button:hover {
          opacity: 0.9;
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(-50%); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(calc(-50% - 2px)) rotate(-1deg); }
          20%, 40%, 60%, 80% { transform: translateX(calc(-50% + 2px)) rotate(1deg); }
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
        
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default AwakeningRitual;
