import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AwakeningRitualProps {
  onComplete?: (guardianName: string, guardianType: 'power' | 'technique') => void;
  onBack?: () => void;
}

type TrainingType = 'power' | 'technique' | 'neutral';
type GameLevel = 1 | 2 | 3;

const AwakeningRitual: React.FC<AwakeningRitualProps> = ({ onComplete, onBack }) => {
  const [level, setLevel] = useState<GameLevel>(1);
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [trainingType, setTrainingType] = useState<TrainingType>('neutral');
  const [tapCount, setTapCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', showInput: false });
  const [guardianName, setGuardianName] = useState('');
  const [dayCompleted, setDayCompleted] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isHatched, setIsHatched] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(true);
  
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const chargeRef = useRef<HTMLAudioElement | null>(null);
  const heartbeatRef = useRef<HTMLAudioElement | null>(null);
  const crackRef = useRef<HTMLAudioElement | null>(null);
  const hatchRef = useRef<HTMLAudioElement | null>(null);
  
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);

  const MAX_PROGRESS = 300;
  const TAPS_REQUIRED = 20;

  useEffect(() => {
    ambienceRef.current = new Audio('/assets/sfx_ambience_dojo.wav');
    chargeRef.current = new Audio('/assets/sfx_energy_charge.wav');
    heartbeatRef.current = new Audio('/assets/sfx_heartbeat_low.wav');
    crackRef.current = new Audio('/assets/sfx_crack_crisp.wav');
    hatchRef.current = new Audio('/assets/sfx_hatch_poof.mp3');
    
    if (ambienceRef.current) {
      ambienceRef.current.loop = true;
      ambienceRef.current.volume = 0.3;
    }
    
    return () => {
      ambienceRef.current?.pause();
      chargeRef.current?.pause();
      heartbeatRef.current?.pause();
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

  const getEggImage = () => {
    if (isHatched) {
      return '/assets/egg_state_broken.png';
    }
    
    switch (level) {
      case 1:
        if (progress >= MAX_PROGRESS) {
          return '/assets/egg_state_crack_yellow.png';
        }
        return '/assets/egg_state_dormant.png';
      case 2:
        if (trainingType === 'power') return '/assets/egg_state_crack_red.png';
        if (trainingType === 'technique') return '/assets/egg_state_crack_blue.png';
        return '/assets/egg_state_crack_yellow.png';
      case 3:
        if (trainingType === 'power') return '/assets/egg_state_crack_red.png';
        if (trainingType === 'technique') return '/assets/egg_state_crack_blue.png';
        return '/assets/egg_state_crack_yellow.png';
      default:
        return '/assets/egg_state_dormant.png';
    }
  };

  const startHolding = useCallback(() => {
    if (dayCompleted || level === 3) return;
    
    startAudioOnInteraction();
    setIsHolding(true);
    
    if (decayIntervalRef.current) {
      clearInterval(decayIntervalRef.current);
      decayIntervalRef.current = null;
    }
    
    if (level === 1 && chargeRef.current) {
      chargeRef.current.currentTime = 0;
      chargeRef.current.loop = true;
      chargeRef.current.play().catch(() => {});
    }
    
    if (level === 2 && heartbeatRef.current) {
      heartbeatRef.current.currentTime = 0;
      heartbeatRef.current.loop = true;
      heartbeatRef.current.playbackRate = 0.5;
      heartbeatRef.current.play().catch(() => {});
    }
    
    holdIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        const newProgress = Math.min(prev + 3, MAX_PROGRESS);
        
        if (level === 2 && heartbeatRef.current) {
          const rate = 0.5 + (newProgress / MAX_PROGRESS) * 1.5;
          heartbeatRef.current.playbackRate = Math.min(rate, 2);
        }
        
        if (newProgress >= MAX_PROGRESS) {
          if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
          chargeRef.current?.pause();
          heartbeatRef.current?.pause();
          triggerLevelComplete();
          return MAX_PROGRESS;
        }
        
        return newProgress;
      });
    }, 50);
  }, [dayCompleted, level, startAudioOnInteraction]);

  const stopHolding = useCallback(() => {
    setIsHolding(false);
    
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    
    chargeRef.current?.pause();
    heartbeatRef.current?.pause();
    
    if (!dayCompleted && progress < MAX_PROGRESS) {
      decayIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = Math.max(prev - 2, 0);
          if (newProgress <= 0) {
            if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
          }
          return newProgress;
        });
      }, 100);
    }
  }, [dayCompleted, progress]);

  const handleTap = () => {
    if (level !== 3 || dayCompleted || isHatched) return;
    
    startAudioOnInteraction();
    crackRef.current?.play().catch(() => {});
    
    setTapCount(prev => {
      const newCount = prev + 1;
      setProgress((newCount / TAPS_REQUIRED) * MAX_PROGRESS);
      
      if (newCount >= TAPS_REQUIRED) {
        triggerHatch();
      }
      
      return newCount;
    });
  };

  const triggerLevelComplete = () => {
    if (level === 1) {
      crackRef.current?.play().catch(() => {});
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);
      
      setModalContent({
        title: '✨ Something Moved!',
        message: 'The egg is tired. Come back tomorrow.',
        showInput: false
      });
      setShowModal(true);
      setDayCompleted(true);
    } else if (level === 2) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      
      setModalContent({
        title: '💓 Ready to Hatch!',
        message: 'The shell is weak. Prepare for the final strike tomorrow.',
        showInput: false
      });
      setShowModal(true);
      setDayCompleted(true);
    }
  };

  const triggerHatch = () => {
    hatchRef.current?.play().catch(() => {});
    
    setShowFlash(true);
    setTimeout(() => {
      setShowFlash(false);
      setIsHatched(true);
      
      setModalContent({
        title: '🐣 The Guardian is Awake!',
        message: 'What is its name?',
        showInput: true
      });
      setShowModal(true);
      setDayCompleted(true);
    }, 500);
  };

  const handleModalClose = () => {
    setShowModal(false);
    
    if (isHatched && guardianName.trim()) {
      const type = trainingType === 'power' ? 'power' : 'technique';
      onComplete?.(guardianName.trim(), type);
    }
  };

  const advanceToNextDay = () => {
    if (level < 3) {
      setLevel((prev) => (prev + 1) as GameLevel);
      setProgress(0);
      setDayCompleted(false);
      setTapCount(0);
    }
  };

  const simulateFullProgress = () => {
    setProgress(MAX_PROGRESS);
    triggerLevelComplete();
  };

  const resetDay = () => {
    setProgress(0);
    setDayCompleted(false);
    setTapCount(0);
    setShowModal(false);
    setIsHatched(false);
  };

  const getButtonText = () => {
    if (dayCompleted) return 'COMPLETED';
    if (level === 3) return 'TAP TO BREAK';
    return 'HOLD TO INFUSE';
  };

  const getLevelTitle = () => {
    switch (level) {
      case 1: return 'Day 1: The Awakening';
      case 2: return 'Day 2: The Pulse';
      case 3: return 'Day 3: The Hatching';
    }
  };

  return (
    <div className="ritual-container">
      <style>{`
        .ritual-container {
          position: relative;
          width: 100%;
          height: 100vh;
          max-width: 450px;
          margin: 0 auto;
          overflow: hidden;
          background: #000;
        }
        
        .dojo-background {
          position: absolute;
          inset: 0;
          background-image: url('/assets/bg_dojo_level1.jpg');
          background-size: cover;
          background-position: center;
        }
        
        .back-button {
          position: absolute;
          top: 16px;
          left: 16px;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          z-index: 20;
          font-size: 14px;
        }
        
        .level-indicator {
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
          z-index: 20;
          text-align: center;
        }
        
        .flash-overlay {
          position: absolute;
          inset: 0;
          background: white;
          opacity: 0;
          pointer-events: none;
          z-index: 50;
          transition: opacity 0.2s;
        }
        .flash-overlay.visible {
          opacity: 1;
        }
        
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
        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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
        
        .pedestal-image {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          width: 50%;
          max-width: 220px;
          z-index: 5;
        }
        
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
          animation: shake 0.15s ease-in-out infinite;
        }
        
        .egg-image {
          width: 120px;
          height: auto;
          cursor: pointer;
          position: relative;
          z-index: 2;
        }
        
        .baby-character {
          position: absolute;
          bottom: 40%;
          left: 50%;
          transform: translateX(-50%);
          width: 150px;
          height: auto;
          z-index: 7;
          animation: bounceIn 0.5s ease-out;
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) rotate(-2deg); }
          50% { transform: translateX(-50%) rotate(2deg); }
        }
        
        @keyframes bounceIn {
          0% { transform: translateX(-50%) scale(0); opacity: 0; }
          50% { transform: translateX(-50%) scale(1.2); }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        
        .modal-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          z-index: 40;
          animation: fadeIn 0.3s ease-out;
        }
        
        .modal-content {
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
        
        .modal-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 16px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        
        .modal-message {
          font-size: 16px;
          margin-bottom: 20px;
          line-height: 1.5;
        }
        
        .modal-input {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          border: 2px solid #22d3ee;
          border-radius: 8px;
          background: rgba(0,0,0,0.5);
          color: white;
          text-align: center;
          margin-bottom: 16px;
        }
        .modal-input::placeholder {
          color: rgba(255,255,255,0.5);
        }
        
        .modal-button {
          background: linear-gradient(to right, #22d3ee, #06b6d4);
          border: none;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.1s;
        }
        .modal-button:hover {
          transform: scale(1.05);
        }
        
        .dev-panel {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.9);
          border: 1px solid #444;
          border-radius: 8px;
          padding: 12px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 11px;
        }
        
        .dev-panel-title {
          color: #22d3ee;
          font-weight: bold;
          text-align: center;
          border-bottom: 1px solid #444;
          padding-bottom: 8px;
          margin-bottom: 4px;
        }
        
        .dev-btn {
          background: #333;
          border: 1px solid #555;
          color: white;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          transition: background 0.2s;
        }
        .dev-btn:hover {
          background: #444;
        }
        .dev-btn.red {
          background: #991b1b;
          border-color: #dc2626;
        }
        .dev-btn.blue {
          background: #1e3a8a;
          border-color: #3b82f6;
        }
        .dev-btn.green {
          background: #166534;
          border-color: #22c55e;
        }
        
        .dev-status {
          color: #888;
          font-size: 10px;
          text-align: center;
        }
        
        .dev-toggle {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          border: 1px solid #444;
          color: #22d3ee;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 10px;
          z-index: 99;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <div className="dojo-background" />
      
      <div className={`flash-overlay ${showFlash ? 'visible' : ''}`} />
      
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>
      
      <div className="level-indicator">
        {getLevelTitle()}
      </div>
      
      {!showDevPanel && (
        <button className="dev-toggle" onClick={() => setShowDevPanel(true)}>
          DEV
        </button>
      )}
      
      {showDevPanel && (
        <div className="dev-panel">
          <div className="dev-panel-title">
            🛠️ Dev Panel
            <button 
              style={{ marginLeft: 8, background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              onClick={() => setShowDevPanel(false)}
            >✕</button>
          </div>
          
          <button className="dev-btn green" onClick={simulateFullProgress}>
            Simulate: 300 XP
          </button>
          
          <button 
            className={`dev-btn ${trainingType === 'power' ? 'red' : ''}`}
            onClick={() => setTrainingType('power')}
          >
            Set Type: Power/Red
          </button>
          
          <button 
            className={`dev-btn ${trainingType === 'technique' ? 'blue' : ''}`}
            onClick={() => setTrainingType('technique')}
          >
            Set Type: Tech/Blue
          </button>
          
          <button className="dev-btn" onClick={resetDay}>
            Reset Day
          </button>
          
          <button className="dev-btn" onClick={advanceToNextDay} disabled={level >= 3}>
            Next Day →
          </button>
          
          <div className="dev-status">
            Level: {level} | Type: {trainingType}
            <br />
            Progress: {Math.round(progress)}/{MAX_PROGRESS}
            {level === 3 && <><br />Taps: {tapCount}/{TAPS_REQUIRED}</>}
          </div>
        </div>
      )}
      
      <img src="/assets/pedestal_stone.png" alt="Pedestal" className="pedestal-image" />
      
      <div 
        className={`egg-container ${level === 3 && !isHatched && !dayCompleted ? 'shaking' : ''}`}
        onClick={level === 3 ? handleTap : undefined}
      >
        <img 
          src={getEggImage()} 
          alt="Egg" 
          className="egg-image"
        />
      </div>
      
      {isHatched && (
        <img 
          src="/assets/char_baby_guardian.png" 
          alt="Baby Guardian" 
          className="baby-character"
        />
      )}
      
      <div className="ui-container">
        <div className="progress-bar-container">
          <img src="/assets/ui_bar_frame.png" alt="" className="bar-frame" />
          <div 
            className="bar-fill"
            style={{ width: `${(progress / MAX_PROGRESS) * 90}%`, right: 'auto' }}
          />
          <span className="bar-text">
            {level === 3 ? `${tapCount}/${TAPS_REQUIRED}` : `${Math.round(progress)}/${MAX_PROGRESS}`}
          </span>
        </div>
        
        <button
          className={`action-button ${isHolding ? 'pressing' : ''}`}
          onMouseDown={level !== 3 ? startHolding : undefined}
          onMouseUp={level !== 3 ? stopHolding : undefined}
          onMouseLeave={level !== 3 ? stopHolding : undefined}
          onTouchStart={level !== 3 ? startHolding : undefined}
          onTouchEnd={level !== 3 ? stopHolding : undefined}
          onClick={level === 3 ? handleTap : undefined}
          disabled={dayCompleted}
        >
          <img src="/assets/ui_btn_action.png" alt="" className="button-image" />
          <span className="button-text">{getButtonText()}</span>
        </button>
      </div>
      
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-title">{modalContent.title}</div>
            <div className="modal-message">{modalContent.message}</div>
            
            {modalContent.showInput && (
              <input
                type="text"
                className="modal-input"
                placeholder="Enter guardian name..."
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                autoFocus
              />
            )}
            
            <button 
              className="modal-button"
              onClick={handleModalClose}
              disabled={modalContent.showInput && !guardianName.trim()}
            >
              {modalContent.showInput ? 'Awaken!' : 'Okay'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AwakeningRitual;
