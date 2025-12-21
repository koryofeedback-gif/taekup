import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AwakeningRitualProps {
  onComplete?: (guardianName: string, guardianType: 'power' | 'technique') => void;
  onBack?: () => void;
}

type TrainingType = 'power' | 'technique' | 'neutral';
type GameLevel = 1 | 2 | 3;
type SwipeDirection = 'up' | 'down' | 'left' | 'right';

const AwakeningRitual: React.FC<AwakeningRitualProps> = ({ onComplete, onBack }) => {
  const [level, setLevel] = useState<GameLevel>(1);
  const [progress, setProgress] = useState(0);
  const [trainingType, setTrainingType] = useState<TrainingType>('neutral');
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', showInput: false });
  const [guardianName, setGuardianName] = useState('');
  const [dayCompleted, setDayCompleted] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isHatched, setIsHatched] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(true);
  const [screenShake, setScreenShake] = useState(false);
  
  // Level 1: Breath Sync state
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'exhale' | 'waiting'>('waiting');
  const [isHolding, setIsHolding] = useState(false);
  const [combo, setCombo] = useState(0);
  const [showComboText, setShowComboText] = useState(false);
  const [breathProgress, setBreathProgress] = useState(0);
  const [breathTargetZone, setBreathTargetZone] = useState(false);
  const [breathSuccess, setBreathSuccess] = useState<'perfect' | 'good' | 'miss' | null>(null);
  
  // Level 2: Pulse Alignment state
  const [currentPrompt, setCurrentPrompt] = useState<SwipeDirection | 'tap' | 'hold' | null>(null);
  const [promptQueue, setPromptQueue] = useState<(SwipeDirection | 'tap' | 'hold')[]>([]);
  const [promptActive, setPromptActive] = useState(false);
  const [promptResult, setPromptResult] = useState<'success' | 'fail' | null>(null);
  const [promptTimeLeft, setPromptTimeLeft] = useState(100);
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  
  // Level 3: Spirit Sigils state
  const [sigilSequence, setSigilSequence] = useState<('tap' | 'hold' | 'swipe')[]>([]);
  const [sigilPhase, setSigilPhase] = useState<'memorize' | 'execute' | 'waiting'>('waiting');
  const [sigilIndex, setSigilIndex] = useState(0);
  const [displaySigilIndex, setDisplaySigilIndex] = useState(0);
  const [sigilResult, setSigilResult] = useState<'success' | 'fail' | null>(null);
  const [sigilRound, setSigilRound] = useState(1);
  
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const chargeRef = useRef<HTMLAudioElement | null>(null);
  const heartbeatRef = useRef<HTMLAudioElement | null>(null);
  const crackRef = useRef<HTMLAudioElement | null>(null);
  const hatchRef = useRef<HTMLAudioElement | null>(null);
  const successRef = useRef<HTMLAudioElement | null>(null);
  
  const breathIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const promptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sigilTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);

  const MAX_PROGRESS = 300;
  const BREATH_CYCLE_DURATION = 3000;
  const PROMPT_WINDOW = 1500;
  const SIGIL_DISPLAY_TIME = 800;

  useEffect(() => {
    ambienceRef.current = new Audio('/assets/sfx_ambience_dojo.wav');
    chargeRef.current = new Audio('/assets/sfx_energy_charge.wav');
    heartbeatRef.current = new Audio('/assets/sfx_heartbeat_low.wav');
    crackRef.current = new Audio('/assets/sfx_crack_crisp.wav');
    hatchRef.current = new Audio('/assets/sfx_hatch_poof.mp3');
    successRef.current = new Audio('/assets/sfx_creature_cute.wav');
    
    if (ambienceRef.current) {
      ambienceRef.current.loop = true;
      ambienceRef.current.volume = 0.3;
    }
    
    return () => {
      ambienceRef.current?.pause();
      chargeRef.current?.pause();
      heartbeatRef.current?.pause();
      if (breathIntervalRef.current) clearInterval(breathIntervalRef.current);
      if (promptTimeoutRef.current) clearTimeout(promptTimeoutRef.current);
      if (sigilTimeoutRef.current) clearTimeout(sigilTimeoutRef.current);
    };
  }, []);

  // Level 1: Breath Sync - Start breathing cycle
  useEffect(() => {
    if (level !== 1 || dayCompleted) return;
    
    let phase: 'inhale' | 'exhale' = 'inhale';
    let progressVal = 0;
    
    const runBreathCycle = () => {
      phase = 'inhale';
      setBreathPhase('inhale');
      progressVal = 0;
      
      const tick = setInterval(() => {
        progressVal += 2;
        setBreathProgress(progressVal);
        
        // Target zone is 40-60%
        setBreathTargetZone(progressVal >= 40 && progressVal <= 60);
        
        if (progressVal >= 100) {
          clearInterval(tick);
          phase = 'exhale';
          setBreathPhase('exhale');
          
          // Check if player was holding during target zone
          setTimeout(() => {
            setBreathPhase('waiting');
            setBreathProgress(0);
            setBreathTargetZone(false);
          }, 500);
        }
      }, BREATH_CYCLE_DURATION / 50);
      
      return tick;
    };
    
    const cycle = runBreathCycle();
    const mainInterval = setInterval(() => {
      runBreathCycle();
    }, BREATH_CYCLE_DURATION + 1000);
    
    breathIntervalRef.current = mainInterval;
    
    return () => {
      clearInterval(cycle);
      clearInterval(mainInterval);
    };
  }, [level, dayCompleted]);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const promptIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Level 2: Pulse Alignment - Generate prompts
  useEffect(() => {
    if (level !== 2 || dayCompleted) return;
    
    const generatePrompt = () => {
      const prompts: (SwipeDirection | 'tap' | 'hold')[] = ['up', 'down', 'left', 'right', 'tap'];
      const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
      
      setCurrentPrompt(randomPrompt);
      setPromptActive(true);
      setPromptTimeLeft(100);
      setPromptResult(null);
      
      let timeLeft = 100;
      if (countdownRef.current) clearInterval(countdownRef.current);
      
      countdownRef.current = setInterval(() => {
        timeLeft -= 5;
        setPromptTimeLeft(timeLeft);
        
        if (timeLeft <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          handlePromptMiss();
        }
      }, PROMPT_WINDOW / 20);
    };
    
    promptIntervalRef.current = setInterval(generatePrompt, 2500);
    generatePrompt();
    
    return () => {
      if (promptIntervalRef.current) clearInterval(promptIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    };
  }, [level, dayCompleted]);

  // Level 3: Spirit Sigils - Generate and display sequence
  const startSigilRound = useCallback(() => {
    const length = Math.min(sigilRound + 2, 6);
    const types: ('tap' | 'hold' | 'swipe')[] = ['tap', 'hold', 'swipe'];
    const sequence = Array.from({ length }, () => types[Math.floor(Math.random() * types.length)]);
    
    setSigilSequence(sequence);
    setSigilPhase('memorize');
    setDisplaySigilIndex(0);
    setSigilIndex(0);
    
    // Display each sigil one by one
    let idx = 0;
    const showNext = () => {
      if (idx < sequence.length) {
        setDisplaySigilIndex(idx);
        idx++;
        sigilTimeoutRef.current = setTimeout(showNext, SIGIL_DISPLAY_TIME);
      } else {
        setSigilPhase('execute');
      }
    };
    
    sigilTimeoutRef.current = setTimeout(showNext, 500);
  }, [sigilRound]);

  useEffect(() => {
    if (level !== 3 || dayCompleted || sigilPhase !== 'waiting') return;
    startSigilRound();
  }, [level, dayCompleted, sigilPhase, startSigilRound]);

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

  const addProgress = (amount: number) => {
    setProgress(prev => {
      const newProgress = Math.min(prev + amount, MAX_PROGRESS);
      if (newProgress >= MAX_PROGRESS) {
        triggerLevelComplete();
      }
      return newProgress;
    });
  };

  // Level 1: Handle breath sync interaction
  const handleBreathHoldStart = () => {
    if (level !== 1 || dayCompleted) return;
    startAudioOnInteraction();
    setIsHolding(true);
    chargeRef.current?.play().catch(() => {});
  };

  const handleBreathHoldEnd = () => {
    if (level !== 1 || dayCompleted) return;
    setIsHolding(false);
    chargeRef.current?.pause();
    
    if (breathTargetZone && breathPhase === 'inhale') {
      // Perfect timing!
      const newCombo = combo + 1;
      setCombo(newCombo);
      setBreathSuccess('perfect');
      setShowComboText(true);
      
      const bonus = Math.min(newCombo, 5) * 5;
      addProgress(20 + bonus);
      
      successRef.current?.play().catch(() => {});
      triggerScreenShake();
      
      setTimeout(() => {
        setBreathSuccess(null);
        setShowComboText(false);
      }, 800);
    } else if (breathPhase === 'inhale') {
      // Close but not perfect
      setBreathSuccess('good');
      setCombo(0);
      addProgress(10);
      
      setTimeout(() => setBreathSuccess(null), 500);
    } else {
      // Missed
      setBreathSuccess('miss');
      setCombo(0);
      
      setTimeout(() => setBreathSuccess(null), 500);
    }
  };

  // Level 2: Handle prompt responses
  const handlePromptMiss = useCallback(() => {
    if (!promptActive) return;
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    
    setPromptResult('fail');
    setPromptActive(false);
    setCurrentPrompt(null);
    setCombo(0);
  }, [promptActive]);

  const handlePromptSuccess = useCallback(() => {
    if (!promptActive) return;
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    
    setPromptResult('success');
    setPromptActive(false);
    setCurrentPrompt(null);
    
    setCombo(prev => {
      const newCombo = prev + 1;
      setShowComboText(true);
      
      const bonus = Math.min(newCombo, 5) * 3;
      addProgress(15 + bonus);
      
      return newCombo;
    });
    
    successRef.current?.play().catch(() => {});
    triggerScreenShake();
    
    setTimeout(() => {
      setPromptResult(null);
      setShowComboText(false);
    }, 500);
  }, [promptActive]);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    startAudioOnInteraction();
    
    if (level === 2 && promptActive && currentPrompt) {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setTouchStart({ x: clientX, y: clientY });
      
      if (currentPrompt === 'tap') {
        handlePromptSuccess();
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (level === 2 && touchStart && promptActive && currentPrompt) {
      const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
      const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
      
      const dx = clientX - touchStart.x;
      const dy = clientY - touchStart.y;
      const threshold = 40;
      
      let swipeDir: SwipeDirection | null = null;
      
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        swipeDir = dx > 0 ? 'right' : 'left';
      } else if (Math.abs(dy) > threshold) {
        swipeDir = dy > 0 ? 'down' : 'up';
      }
      
      if (swipeDir && swipeDir === currentPrompt) {
        handlePromptSuccess();
      }
      
      setTouchStart(null);
    }
    setIsHolding(false);
  };

  // Level 3: Handle sigil input
  const handleSigilInput = (type: 'tap' | 'hold' | 'swipe') => {
    if (level !== 3 || sigilPhase !== 'execute' || dayCompleted) return;
    startAudioOnInteraction();
    
    if (sigilSequence[sigilIndex] === type) {
      setSigilResult('success');
      successRef.current?.play().catch(() => {});
      
      const newIndex = sigilIndex + 1;
      setSigilIndex(newIndex);
      
      if (newIndex >= sigilSequence.length) {
        // Round complete!
        addProgress(30 + sigilRound * 10);
        triggerScreenShake();
        
        setTimeout(() => {
          setSigilResult(null);
          if (progress + 30 + sigilRound * 10 < MAX_PROGRESS) {
            setSigilRound(prev => prev + 1);
            setSigilPhase('waiting');
          }
        }, 800);
      } else {
        setTimeout(() => setSigilResult(null), 300);
      }
    } else {
      // Wrong input - restart round
      setSigilResult('fail');
      crackRef.current?.play().catch(() => {});
      
      setTimeout(() => {
        setSigilResult(null);
        setSigilPhase('waiting');
      }, 1000);
    }
  };

  const triggerLevelComplete = () => {
    if (level === 1) {
      crackRef.current?.play().catch(() => {});
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 500);
      
      setModalContent({
        title: '✨ Something Moved!',
        message: 'You mastered the breath of awakening. The egg stirs with new energy. Return tomorrow.',
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
        message: 'The spirit within responds to your rhythm. One final challenge awaits.',
        showInput: false
      });
      setShowModal(true);
      setDayCompleted(true);
    } else if (level === 3) {
      triggerHatch();
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
        message: 'You have awakened a spirit guardian. What shall you name it?',
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
      setCombo(0);
      setSigilRound(1);
      setSigilPhase('waiting');
    }
  };

  const simulateFullProgress = () => {
    setProgress(MAX_PROGRESS);
    triggerLevelComplete();
  };

  const resetDay = () => {
    setProgress(0);
    setDayCompleted(false);
    setCombo(0);
    setShowModal(false);
    setIsHatched(false);
    setSigilRound(1);
    setSigilPhase('waiting');
  };

  const getLevelTitle = () => {
    switch (level) {
      case 1: return 'Day 1: Breath Sync';
      case 2: return 'Day 2: Pulse Alignment';
      case 3: return 'Day 3: Spirit Sigils';
    }
  };

  const getPromptIcon = (prompt: SwipeDirection | 'tap' | 'hold' | null) => {
    switch (prompt) {
      case 'up': return '⬆️';
      case 'down': return '⬇️';
      case 'left': return '⬅️';
      case 'right': return '➡️';
      case 'tap': return '👆';
      case 'hold': return '✊';
      default: return '';
    }
  };

  const getSigilIcon = (type: 'tap' | 'hold' | 'swipe') => {
    switch (type) {
      case 'tap': return '👆';
      case 'hold': return '✊';
      case 'swipe': return '👋';
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
          touch-action: none;
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
          0% { transform: translateY(100vh) scale(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100px) scale(1); opacity: 0; }
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
          bottom: 20%;
          left: 50%;
          transform: translateX(-50%);
          width: 300px;
          height: 350px;
          display: flex;
          justify-content: center;
          align-items: flex-end;
          z-index: 5;
        }
        
        .pedestal-image {
          position: absolute;
          bottom: 0;
          width: 200px;
          z-index: 5;
          filter: drop-shadow(0 10px 25px rgba(0,0,0,0.9));
        }
        
        .vfx-glow {
          position: absolute;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          width: 280px;
          height: 280px;
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
          bottom: 50px;
          width: 160px;
          height: 220px;
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
          transition: all 0.2s;
          filter: drop-shadow(0 0 15px rgba(0,0,0,0.6));
          cursor: pointer;
        }
        
        .baby-character {
          position: absolute;
          bottom: 100px;
          width: 140px;
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
        
        /* Breath Sync UI */
        .breath-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 280px;
          height: 280px;
          border-radius: 50%;
          border: 4px solid rgba(255,255,255,0.2);
          z-index: 15;
          pointer-events: none;
        }
        
        .breath-progress-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 280px;
          height: 280px;
          border-radius: 50%;
          z-index: 16;
          pointer-events: none;
        }
        
        .breath-progress-ring svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        
        .breath-progress-ring circle {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
        }
        
        .breath-progress-ring .bg-circle {
          stroke: rgba(255,255,255,0.1);
        }
        
        .breath-progress-ring .progress-circle {
          stroke: #22d3ee;
          transition: stroke-dashoffset 0.1s;
        }
        
        .breath-progress-ring .progress-circle.target-zone {
          stroke: #22c55e;
          filter: drop-shadow(0 0 10px #22c55e);
        }
        
        .breath-instruction {
          position: absolute;
          top: 55%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 18px;
          font-weight: bold;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
          z-index: 17;
          text-align: center;
        }
        
        .breath-instruction.inhale {
          color: #22d3ee;
        }
        
        .breath-instruction.target {
          color: #22c55e;
          animation: pulse-text 0.3s infinite alternate;
        }
        
        @keyframes pulse-text {
          0% { transform: translate(-50%, -50%) scale(1); }
          100% { transform: translate(-50%, -50%) scale(1.1); }
        }
        
        .combo-display {
          position: absolute;
          top: 35%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #fbbf24;
          font-size: 32px;
          font-weight: bold;
          text-shadow: 0 2px 10px rgba(251, 191, 36, 0.5);
          z-index: 18;
          animation: combo-pop 0.5s ease-out;
        }
        
        @keyframes combo-pop {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.2); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        
        .result-feedback {
          position: absolute;
          top: 40%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 48px;
          z-index: 19;
          animation: result-pop 0.5s ease-out;
        }
        
        @keyframes result-pop {
          0% { transform: translate(-50%, -50%) scale(0); }
          50% { transform: translate(-50%, -50%) scale(1.3); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        
        /* Prompt UI (Level 2) */
        .prompt-display {
          position: absolute;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120px;
          height: 120px;
          background: rgba(0,0,0,0.8);
          border: 4px solid #22d3ee;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 20;
          animation: prompt-appear 0.2s ease-out;
        }
        
        .prompt-display.success {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.3);
        }
        
        .prompt-display.fail {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.3);
        }
        
        @keyframes prompt-appear {
          0% { transform: translate(-50%, -50%) scale(0); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        
        .prompt-icon {
          font-size: 48px;
        }
        
        .prompt-timer {
          position: absolute;
          bottom: -8px;
          width: 80%;
          height: 6px;
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
          overflow: hidden;
        }
        
        .prompt-timer-fill {
          height: 100%;
          background: #22d3ee;
          transition: width 0.05s linear;
        }
        
        /* Sigil UI (Level 3) */
        .sigil-display {
          position: absolute;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 16px;
          z-index: 20;
        }
        
        .sigil-item {
          width: 60px;
          height: 60px;
          background: rgba(0,0,0,0.6);
          border: 3px solid rgba(255,255,255,0.3);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          transition: all 0.2s;
        }
        
        .sigil-item.active {
          border-color: #22d3ee;
          background: rgba(34, 211, 238, 0.2);
          transform: scale(1.1);
        }
        
        .sigil-item.complete {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.3);
        }
        
        .sigil-item.current {
          border-color: #fbbf24;
          animation: sigil-pulse 0.5s infinite alternate;
        }
        
        @keyframes sigil-pulse {
          0% { box-shadow: 0 0 10px rgba(251, 191, 36, 0.3); }
          100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.6); }
        }
        
        .sigil-buttons {
          position: absolute;
          bottom: 8%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 16px;
          z-index: 20;
        }
        
        .sigil-btn {
          width: 80px;
          height: 80px;
          background: rgba(0,0,0,0.7);
          border: 3px solid #22d3ee;
          border-radius: 50%;
          color: white;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: all 0.1s;
        }
        
        .sigil-btn:active {
          transform: scale(0.9);
          background: rgba(34, 211, 238, 0.3);
        }
        
        .sigil-btn-icon {
          font-size: 28px;
        }
        
        .sigil-phase-text {
          position: absolute;
          top: 12%;
          left: 50%;
          transform: translateX(-50%);
          color: white;
          font-size: 16px;
          font-weight: bold;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
          z-index: 21;
        }
        
        .sigil-phase-text.memorize {
          color: #fbbf24;
        }
        
        .sigil-phase-text.execute {
          color: #22c55e;
        }
        
        /* Progress Bar */
        .ui-container {
          position: absolute;
          bottom: 5%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          width: 100%;
          z-index: 10;
        }
        
        .progress-container {
          position: relative;
          width: 280px;
          height: 40px;
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
          transition: width 0.2s;
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
        
        /* Level 1 Hold Button */
        .hold-area {
          position: absolute;
          inset: 0;
          z-index: 8;
          cursor: pointer;
        }
        
        .hold-hint {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255,255,255,0.7);
          font-size: 14px;
          text-align: center;
          z-index: 9;
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
          animation: modalBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes modalBounce {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .modal-title {
          font-size: 22px;
          font-weight: bold;
          margin-bottom: 16px;
          text-shadow: 0 2px 6px rgba(0,0,0,0.6);
        }
        
        .modal-message {
          font-size: 15px;
          margin-bottom: 24px;
          line-height: 1.5;
          opacity: 0.9;
        }
        
        .modal-input {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          border: 2px solid #22d3ee;
          border-radius: 10px;
          background: rgba(0,0,0,0.6);
          color: white;
          text-align: center;
          margin-bottom: 16px;
          outline: none;
        }
        .modal-input::placeholder {
          color: rgba(255,255,255,0.5);
        }
        
        .modal-button {
          background: linear-gradient(135deg, #22d3ee, #06b6d4);
          border: none;
          color: white;
          padding: 12px 36px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        .modal-button:disabled {
          opacity: 0.5;
        }
        
        .dev-panel {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.9);
          border: 1px solid #333;
          border-radius: 10px;
          padding: 12px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 10px;
        }
        
        .dev-panel-title {
          color: #22d3ee;
          font-weight: bold;
          text-align: center;
          border-bottom: 1px solid #333;
          padding-bottom: 6px;
          margin-bottom: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .dev-btn {
          background: #222;
          border: 1px solid #444;
          color: white;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 10px;
        }
        .dev-btn.red { background: #7f1d1d; border-color: #dc2626; }
        .dev-btn.blue { background: #1e3a8a; border-color: #3b82f6; }
        .dev-btn.green { background: #166534; border-color: #22c55e; }
        
        .dev-status {
          color: #666;
          font-size: 9px;
          text-align: center;
          padding-top: 6px;
          border-top: 1px solid #333;
        }
        
        .dev-toggle {
          position: absolute;
          top: 60px;
          right: 8px;
          background: rgba(0,0,0,0.8);
          border: 1px solid #333;
          color: #22d3ee;
          padding: 4px 8px;
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

      <img src="/assets/bg_dojo_level1.jpg" alt="" className="bg-image" />
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
      
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="level-indicator">{getLevelTitle()}</div>
      
      {!showDevPanel && (
        <button className="dev-toggle" onClick={() => setShowDevPanel(true)}>🛠️</button>
      )}
      
      {showDevPanel && (
        <div className="dev-panel">
          <div className="dev-panel-title">
            <span>🛠️ Dev</span>
            <button style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }} onClick={() => setShowDevPanel(false)}>✕</button>
          </div>
          <button className="dev-btn green" onClick={simulateFullProgress}>⚡ Max XP</button>
          <button className={`dev-btn ${trainingType === 'power' ? 'red' : ''}`} onClick={() => setTrainingType('power')}>🔴 Power</button>
          <button className={`dev-btn ${trainingType === 'technique' ? 'blue' : ''}`} onClick={() => setTrainingType('technique')}>🔵 Tech</button>
          <button className="dev-btn" onClick={resetDay}>🔄 Reset</button>
          <button className="dev-btn" onClick={advanceToNextDay} disabled={level >= 3}>➡️ Next</button>
          <div className="dev-status">
            L{level} | {Math.round(progress)}/{MAX_PROGRESS}
            {level === 1 && ` | x${combo}`}
          </div>
        </div>
      )}

      {/* Level 1: Breath Sync UI */}
      {level === 1 && !dayCompleted && (
        <>
          <div 
            className="hold-area"
            onMouseDown={handleBreathHoldStart}
            onMouseUp={handleBreathHoldEnd}
            onMouseLeave={handleBreathHoldEnd}
            onTouchStart={handleBreathHoldStart}
            onTouchEnd={handleBreathHoldEnd}
          />
          
          <div className="breath-progress-ring">
            <svg viewBox="0 0 100 100">
              <circle className="bg-circle" cx="50" cy="50" r="45" />
              <circle 
                className={`progress-circle ${breathTargetZone ? 'target-zone' : ''}`}
                cx="50" cy="50" r="45"
                strokeDasharray={`${breathProgress * 2.83} 283`}
              />
            </svg>
          </div>
          
          <div className={`breath-instruction ${breathTargetZone ? 'target' : breathPhase}`}>
            {breathPhase === 'inhale' && !breathTargetZone && 'Wait...'}
            {breathTargetZone && (isHolding ? '✨ PERFECT!' : 'HOLD NOW!')}
            {breathPhase === 'exhale' && 'Release...'}
            {breathPhase === 'waiting' && 'Get ready...'}
          </div>
          
          {showComboText && combo > 1 && (
            <div className="combo-display">x{combo} Combo!</div>
          )}
          
          {breathSuccess && (
            <div className="result-feedback">
              {breathSuccess === 'perfect' && '⭐'}
              {breathSuccess === 'good' && '✓'}
              {breathSuccess === 'miss' && '✗'}
            </div>
          )}
          
          <div className="hold-hint">
            Hold anywhere when the ring turns green
          </div>
        </>
      )}

      {/* Level 2: Pulse Alignment UI */}
      {level === 2 && !dayCompleted && (
        <div 
          className="hold-area"
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentPrompt && (
            <div className={`prompt-display ${promptResult || ''}`}>
              <span className="prompt-icon">{getPromptIcon(currentPrompt)}</span>
              <div className="prompt-timer">
                <div className="prompt-timer-fill" style={{ width: `${promptTimeLeft}%` }} />
              </div>
            </div>
          )}
          
          {showComboText && combo > 1 && (
            <div className="combo-display">x{combo} Combo!</div>
          )}
        </div>
      )}

      {/* Level 3: Spirit Sigils UI */}
      {level === 3 && !dayCompleted && !isHatched && (
        <>
          <div className={`sigil-phase-text ${sigilPhase}`}>
            {sigilPhase === 'memorize' && '👁️ Memorize the pattern...'}
            {sigilPhase === 'execute' && '⚡ Repeat the sequence!'}
          </div>
          
          <div className="sigil-display">
            {sigilSequence.map((sigil, idx) => (
              <div 
                key={idx} 
                className={`sigil-item ${
                  sigilPhase === 'memorize' && displaySigilIndex === idx ? 'active' : ''
                } ${sigilPhase === 'execute' && idx < sigilIndex ? 'complete' : ''
                } ${sigilPhase === 'execute' && idx === sigilIndex ? 'current' : ''}`}
              >
                {(sigilPhase === 'memorize' && displaySigilIndex >= idx) || sigilPhase === 'execute' 
                  ? getSigilIcon(sigil) 
                  : '?'}
              </div>
            ))}
          </div>
          
          {sigilPhase === 'execute' && (
            <div className="sigil-buttons">
              <button className="sigil-btn" onClick={() => handleSigilInput('tap')}>
                <span className="sigil-btn-icon">👆</span>
                TAP
              </button>
              <button className="sigil-btn" onClick={() => handleSigilInput('hold')}>
                <span className="sigil-btn-icon">✊</span>
                HOLD
              </button>
              <button className="sigil-btn" onClick={() => handleSigilInput('swipe')}>
                <span className="sigil-btn-icon">👋</span>
                SWIPE
              </button>
            </div>
          )}
          
          {sigilResult && (
            <div className="result-feedback">
              {sigilResult === 'success' ? '✓' : '✗'}
            </div>
          )}
        </>
      )}

      <div className="scene-wrapper">
        <div className={`vfx-glow ${progress > 0 || isHolding ? 'active' : ''} ${getGlowClass()}`} />
        <img src="/assets/pedestal_stone.png" alt="Pedestal" className="pedestal-image" />
        
        <div className={`egg-container ${isHolding && level === 1 ? 'charging' : ''} ${level === 3 && sigilPhase === 'execute' ? 'shaking' : ''}`}>
          <img src={getEggImage()} alt="Egg" className="egg-image" />
        </div>
        
        {isHatched && (
          <img src="/assets/char_baby_guardian.png" alt="Baby Guardian" className="baby-character" />
        )}
      </div>
      
      <div className="ui-container">
        <div className="progress-container">
          <img src="/assets/ui_bar_frame.png" alt="" className="bar-frame" />
          <div 
            className={`bar-fill ${(progress / MAX_PROGRESS) >= 0.75 ? 'high' : ''}`}
            style={{ width: `${(progress / MAX_PROGRESS) * 94}%` }}
          />
          <span className="bar-text">{Math.round(progress)}/{MAX_PROGRESS}</span>
        </div>
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
              {modalContent.showInput ? '✨ Awaken!' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AwakeningRitual;
