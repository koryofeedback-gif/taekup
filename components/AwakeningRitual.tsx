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
  const [screenShake, setScreenShake] = useState(false);
  const [milestoneHit, setMilestoneHit] = useState<number[]>([]);
  
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

  const getGlowClass = () => {
    const percentage = (progress / MAX_PROGRESS) * 100;
    if (percentage >= 75) return 'high';
    if (percentage >= 40) return 'medium';
    if (percentage > 0) return 'low';
    return '';
  };

  const triggerScreenShake = () => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), 300);
  };

  const checkMilestone = (newProgress: number) => {
    const milestones = [75, 150, 225];
    milestones.forEach(milestone => {
      if (newProgress >= milestone && !milestoneHit.includes(milestone)) {
        setMilestoneHit(prev => [...prev, milestone]);
        triggerScreenShake();
        crackRef.current?.play().catch(() => {});
      }
    });
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
        const increment = level === 1 ? 1 : 1.2;
        const newProgress = Math.min(prev + increment, MAX_PROGRESS);
        
        checkMilestone(newProgress);
        
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
    }, 100);
  }, [dayCompleted, level, startAudioOnInteraction, milestoneHit]);

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
          const newProgress = Math.max(prev - 3, 0);
          if (newProgress <= 0) {
            if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
          }
          return newProgress;
        });
      }, 50);
    }
  }, [dayCompleted, progress]);

  const handleTap = () => {
    if (level !== 3 || dayCompleted || isHatched) return;
    
    startAudioOnInteraction();
    crackRef.current?.play().catch(() => {});
    triggerScreenShake();
    
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
      setTimeout(() => setShowFlash(false), 500);
      
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
    }, 800);
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
      setMilestoneHit([]);
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
    setMilestoneHit([]);
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

  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 10,
    duration: 8 + Math.random() * 6,
    size: 2 + Math.random() * 4
  }));

  return (
    <div className={`game-container ${screenShake ? 'screen-shake' : ''}`}>
      <style>{`
        .game-container {
          position: relative;
          width: 100%;
          height: 100vh;
          max-width: 450px;
          margin: 0 auto;
          overflow: hidden;
          background: #050505;
        }
        
        .game-container.screen-shake {
          animation: screen-rumble 0.3s ease-out;
        }
        
        @keyframes screen-rumble {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-4px, 3px); }
          40% { transform: translate(4px, -3px); }
          60% { transform: translate(-3px, -2px); }
          80% { transform: translate(3px, 2px); }
        }
        
        .bg-image {
          position: absolute;
          width: 110%;
          height: 110%;
          top: -5%;
          left: -5%;
          object-fit: cover;
          z-index: 0;
          animation: camera-breathe 20s infinite alternate ease-in-out;
          filter: brightness(0.6);
        }
        
        @keyframes camera-breathe {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.05) translate(-10px, -5px); }
        }
        
        .vignette-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.85) 95%);
          z-index: 1;
          pointer-events: none;
        }
        
        .particle {
          position: absolute;
          background: rgba(255, 255, 255, 0.4);
          border-radius: 50%;
          z-index: 2;
          pointer-events: none;
          animation: float-up linear infinite;
        }
        
        @keyframes float-up {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100px) scale(1);
            opacity: 0;
          }
        }
        
        .particle.charging {
          background: rgba(255, 200, 0, 0.6);
          box-shadow: 0 0 6px rgba(255, 200, 0, 0.8);
        }
        
        .back-button {
          position: absolute;
          top: 16px;
          left: 16px;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          z-index: 20;
          font-size: 14px;
          transition: all 0.2s;
        }
        .back-button:hover {
          background: rgba(0,0,0,0.8);
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
          border: 1px solid rgba(255,255,255,0.1);
        }
        
        .flash-overlay {
          position: absolute;
          inset: 0;
          background: white;
          z-index: 50;
          pointer-events: none;
          animation: flash-fade 1.5s forwards ease-out;
        }
        
        @keyframes flash-fade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        .scene-wrapper {
          position: absolute;
          bottom: 15%;
          left: 50%;
          transform: translateX(-50%);
          width: 300px;
          height: 400px;
          display: flex;
          justify-content: center;
          align-items: flex-end;
          z-index: 5;
        }
        
        .pedestal-image {
          position: absolute;
          bottom: 0;
          width: 220px;
          z-index: 5;
          filter: drop-shadow(0 10px 25px rgba(0,0,0,0.9));
        }
        
        .vfx-glow {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          width: 300px;
          height: 300px;
          border-radius: 50%;
          z-index: 4;
          opacity: 0;
          transition: opacity 0.3s, background 0.3s;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        
        .vfx-glow.active {
          opacity: 1;
          animation: glow-pulse 0.5s infinite alternate;
        }
        
        .vfx-glow.low {
          background: radial-gradient(circle, rgba(100, 200, 255, 0.4) 0%, transparent 70%);
        }
        .vfx-glow.medium {
          background: radial-gradient(circle, rgba(255, 200, 0, 0.5) 0%, transparent 70%);
        }
        .vfx-glow.high {
          background: radial-gradient(circle, rgba(255, 100, 0, 0.6) 0%, transparent 70%);
        }
        
        @keyframes glow-pulse {
          0% { transform: translateX(-50%) scale(1); opacity: 0.8; }
          100% { transform: translateX(-50%) scale(1.15); opacity: 1; }
        }
        
        .egg-container {
          position: absolute;
          bottom: 60px;
          width: 180px;
          height: 240px;
          z-index: 6;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: egg-float 4s infinite ease-in-out;
        }
        
        @keyframes egg-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        
        .egg-container.charging {
          animation: egg-shake 0.1s infinite;
        }
        
        .egg-container.charging .egg-image {
          filter: brightness(1.3) drop-shadow(0 0 20px rgba(255, 200, 0, 0.8));
        }
        
        .egg-container.shaking {
          animation: egg-shake-intense 0.1s infinite;
        }
        
        @keyframes egg-shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          25% { transform: translate(-1px, -2px) rotate(-1deg); }
          50% { transform: translate(-2px, 0px) rotate(1deg); }
          75% { transform: translate(2px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -1px) rotate(1deg); }
        }
        
        @keyframes egg-shake-intense {
          0% { transform: translate(2px, 2px) rotate(0deg); }
          25% { transform: translate(-3px, -3px) rotate(-2deg); }
          50% { transform: translate(-4px, 0px) rotate(2deg); }
          75% { transform: translate(4px, 3px) rotate(0deg); }
          100% { transform: translate(2px, -2px) rotate(2deg); }
        }
        
        .egg-image {
          width: 100%;
          height: auto;
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          filter: drop-shadow(0 0 15px rgba(0,0,0,0.6));
          cursor: pointer;
        }
        
        .baby-character {
          position: absolute;
          bottom: 120px;
          width: 160px;
          height: auto;
          z-index: 7;
          animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          filter: drop-shadow(0 5px 20px rgba(0,0,0,0.5));
        }
        
        @keyframes bounceIn {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(5deg); }
          70% { transform: scale(0.9) rotate(-3deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        
        .ui-container {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          width: 100%;
          z-index: 10;
        }
        
        .progress-container {
          position: relative;
          width: 280px;
          height: 45px;
          opacity: 0.95;
        }
        
        .bar-frame {
          position: absolute;
          width: 100%;
          height: 100%;
          z-index: 2;
          filter: drop-shadow(0 3px 8px rgba(0,0,0,0.8));
        }
        
        .bar-fill {
          position: absolute;
          top: 14%;
          left: 3%;
          height: 72%;
          background: linear-gradient(90deg, #ff8800, #ffcc00);
          border-radius: 6px;
          box-shadow: 0 0 15px rgba(255, 136, 0, 0.6);
          z-index: 1;
          transition: width 0.1s linear;
        }
        
        .bar-fill.high {
          background: linear-gradient(90deg, #ff4400, #ff8800);
          box-shadow: 0 0 20px rgba(255, 68, 0, 0.8);
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
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          z-index: 5;
        }
        
        .action-button {
          position: relative;
          width: 240px;
          height: 75px;
          background: none;
          border: none;
          cursor: pointer;
          z-index: 20;
          transition: all 0.1s;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .action-button img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 5px 15px rgba(0,0,0,0.6));
          transition: all 0.1s;
        }
        
        .action-button:active:not(:disabled) {
          transform: scale(0.95);
        }
        
        .action-button:active:not(:disabled) img {
          filter: brightness(0.8) drop-shadow(0 3px 10px rgba(0,0,0,0.6));
        }
        
        .button-text {
          position: relative;
          z-index: 10;
          color: white;
          font-weight: bold;
          font-size: 16px;
          text-shadow: 0 2px 6px rgba(0,0,0,0.8);
          letter-spacing: 1px;
        }
        
        .modal-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          z-index: 40;
          animation: fadeIn 0.4s ease-out;
        }
        
        .modal-content {
          position: relative;
          width: 90%;
          max-width: 350px;
          min-height: 220px;
          background-image: url('/assets/ui_panel_bg.png');
          background-size: 100% 100%;
          background-repeat: no-repeat;
          padding: 45px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          color: #fff;
          animation: modalBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes modalBounce {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .modal-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 16px;
          text-shadow: 0 2px 6px rgba(0,0,0,0.6);
        }
        
        .modal-message {
          font-size: 16px;
          margin-bottom: 24px;
          line-height: 1.6;
          opacity: 0.9;
        }
        
        .modal-input {
          width: 100%;
          padding: 14px;
          font-size: 16px;
          border: 2px solid #22d3ee;
          border-radius: 10px;
          background: rgba(0,0,0,0.6);
          color: white;
          text-align: center;
          margin-bottom: 20px;
          outline: none;
          transition: border-color 0.2s;
        }
        .modal-input:focus {
          border-color: #06b6d4;
        }
        .modal-input::placeholder {
          color: rgba(255,255,255,0.5);
        }
        
        .modal-button {
          background: linear-gradient(135deg, #22d3ee, #06b6d4);
          border: none;
          color: white;
          padding: 14px 40px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(34, 211, 238, 0.3);
        }
        .modal-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(34, 211, 238, 0.4);
        }
        .modal-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .dev-panel {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.9);
          border: 1px solid #333;
          border-radius: 10px;
          padding: 14px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 11px;
          backdrop-filter: blur(4px);
        }
        
        .dev-panel-title {
          color: #22d3ee;
          font-weight: bold;
          text-align: center;
          border-bottom: 1px solid #333;
          padding-bottom: 8px;
          margin-bottom: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .dev-btn {
          background: #222;
          border: 1px solid #444;
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
        }
        .dev-btn:hover {
          background: #333;
          border-color: #555;
        }
        .dev-btn.red {
          background: #7f1d1d;
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
          color: #666;
          font-size: 10px;
          text-align: center;
          padding-top: 8px;
          border-top: 1px solid #333;
        }
        
        .dev-toggle {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          border: 1px solid #333;
          color: #22d3ee;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 10px;
          z-index: 99;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <img 
        src="/assets/bg_dojo_level1.jpg" 
        alt="" 
        className="bg-image"
      />
      
      <div className="vignette-overlay" />
      
      {particles.map(p => (
        <div
          key={p.id}
          className={`particle ${isHolding ? 'charging' : ''}`}
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`
          }}
        />
      ))}
      
      {showFlash && <div className="flash-overlay" />}
      
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>
      
      <div className="level-indicator">
        {getLevelTitle()}
      </div>
      
      {!showDevPanel && (
        <button className="dev-toggle" onClick={() => setShowDevPanel(true)}>
          🛠️ DEV
        </button>
      )}
      
      {showDevPanel && (
        <div className="dev-panel">
          <div className="dev-panel-title">
            <span>🛠️ Dev Panel</span>
            <button 
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14 }}
              onClick={() => setShowDevPanel(false)}
            >✕</button>
          </div>
          
          <button className="dev-btn green" onClick={simulateFullProgress}>
            ⚡ Simulate: 300 XP
          </button>
          
          <button 
            className={`dev-btn ${trainingType === 'power' ? 'red' : ''}`}
            onClick={() => setTrainingType('power')}
          >
            🔴 Set Type: Power/Red
          </button>
          
          <button 
            className={`dev-btn ${trainingType === 'technique' ? 'blue' : ''}`}
            onClick={() => setTrainingType('technique')}
          >
            🔵 Set Type: Tech/Blue
          </button>
          
          <button className="dev-btn" onClick={resetDay}>
            🔄 Reset Day
          </button>
          
          <button className="dev-btn" onClick={advanceToNextDay} disabled={level >= 3}>
            ➡️ Next Day
          </button>
          
          <div className="dev-status">
            Level: {level} | Type: {trainingType}
            <br />
            Progress: {Math.round(progress)}/{MAX_PROGRESS}
            {level === 3 && <><br />Taps: {tapCount}/{TAPS_REQUIRED}</>}
          </div>
        </div>
      )}
      
      <div className="scene-wrapper">
        <div 
          className={`vfx-glow ${isHolding || progress > 0 ? 'active' : ''} ${getGlowClass()}`}
        />
        
        <img src="/assets/pedestal_stone.png" alt="Pedestal" className="pedestal-image" />
        
        <div 
          className={`egg-container ${isHolding ? 'charging' : ''} ${level === 3 && !isHatched && !dayCompleted ? 'shaking' : ''}`}
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
      </div>
      
      <div className="ui-container">
        <div className="progress-container">
          <img src="/assets/ui_bar_frame.png" alt="" className="bar-frame" />
          <div 
            className={`bar-fill ${(progress / MAX_PROGRESS) >= 0.75 ? 'high' : ''}`}
            style={{ width: `${(progress / MAX_PROGRESS) * 94}%` }}
          />
          <span className="bar-text">
            {level === 3 ? `${tapCount}/${TAPS_REQUIRED}` : `${Math.round(progress)}/${MAX_PROGRESS}`}
          </span>
        </div>
        
        <button
          className="action-button"
          onMouseDown={level !== 3 ? startHolding : undefined}
          onMouseUp={level !== 3 ? stopHolding : undefined}
          onMouseLeave={level !== 3 ? stopHolding : undefined}
          onTouchStart={level !== 3 ? startHolding : undefined}
          onTouchEnd={level !== 3 ? stopHolding : undefined}
          onClick={level === 3 ? handleTap : undefined}
          disabled={dayCompleted}
        >
          <img src="/assets/ui_btn_action.png" alt="" />
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
              {modalContent.showInput ? '✨ Awaken!' : 'Okay'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AwakeningRitual;
