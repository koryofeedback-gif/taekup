import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Package, RotateCcw, ArrowLeft, X, Cookie, Flower2, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DojoItem {
  id: string;
  itemName: string;
  itemType: 'FOOD' | 'DECORATION';
  itemRarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  itemEmoji: string;
  quantity: number;
  evolutionPoints: number;
}

interface PlacedDecoration {
  id: string;
  emoji: string;
  name: string;
  x: number;
  y: number;
  scale: number;
}

interface MonsterState {
  stage: 'egg' | 'baby' | 'teen' | 'adult' | 'master';
  evolutionPoints: number;
  name: string;
}

interface VirtualDojoProps {
  studentId: string;
  studentName: string;
  onBack: () => void;
}

const SPIN_COST = 200;

const EVOLUTION_STAGES = [
  { stage: 'egg', emoji: '🥚', minPoints: 0, name: 'Egg' },
  { stage: 'baby', emoji: '🐣', minPoints: 50, name: 'Baby' },
  { stage: 'teen', emoji: '🐥', minPoints: 150, name: 'Teen' },
  { stage: 'adult', emoji: '🦅', minPoints: 400, name: 'Adult' },
  { stage: 'master', emoji: '🐉', minPoints: 1000, name: 'Master' },
];

const RARITY_COLORS = {
  COMMON: 'bg-gray-100 border-gray-300 text-gray-700',
  RARE: 'bg-blue-100 border-blue-400 text-blue-700',
  EPIC: 'bg-purple-100 border-purple-400 text-purple-700',
  LEGENDARY: 'bg-yellow-100 border-yellow-400 text-yellow-700',
};

const RARITY_GLOW = {
  COMMON: '',
  RARE: 'shadow-blue-300',
  EPIC: 'shadow-purple-400 shadow-lg',
  LEGENDARY: 'shadow-yellow-400 shadow-xl animate-pulse',
};

const DECORATION_POSITIONS = [
  { x: 10, y: 20 },
  { x: 80, y: 15 },
  { x: 5, y: 60 },
  { x: 85, y: 55 },
  { x: 15, y: 40 },
  { x: 75, y: 35 },
  { x: 25, y: 10 },
  { x: 70, y: 65 },
];

export default function VirtualDojo({ studentId, studentName, onBack }: VirtualDojoProps) {
  const [xpBalance, setXpBalance] = useState<number>(0);
  const [inventory, setInventory] = useState<DojoItem[]>([]);
  const [monster, setMonster] = useState<MonsterState>({ stage: 'egg', evolutionPoints: 0, name: 'My Monster' });
  const [placedDecorations, setPlacedDecorations] = useState<PlacedDecoration[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [spinResult, setSpinResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedingItem, setFeedingItem] = useState<string | null>(null);
  const [feedToast, setFeedToast] = useState<{ ep: number; show: boolean } | null>(null);
  const [evolveToast, setEvolveToast] = useState<{ newStage: string; emoji: string } | null>(null);
  const [isMonsterBouncing, setIsMonsterBouncing] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);

  const fetchDojoState = useCallback(async () => {
    try {
      const response = await fetch(`/api/dojo/state?studentId=${studentId}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setXpBalance(data.xpBalance || 0);
      setInventory(data.inventory || []);
      setMonster(data.monster || { stage: 'egg', evolutionPoints: 0, name: 'My Monster' });
      
      const savedDecorations = localStorage.getItem(`dojo-decorations-${studentId}`);
      if (savedDecorations) {
        setPlacedDecorations(JSON.parse(savedDecorations));
      }
    } catch (err: any) {
      console.error('[Dojo] Failed to fetch state:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchDojoState();
  }, [fetchDojoState]);

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
      });
    }, 250);
  };

  const handleSpin = async () => {
    if (xpBalance < SPIN_COST) {
      setError(`Not enough XP! You need ${SPIN_COST} XP to spin.`);
      return;
    }
    
    setSpinning(true);
    setError(null);
    
    try {
      const response = await fetch('/api/dojo/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setTimeout(() => {
        setSpinResult(data.item);
        setXpBalance(data.newXpBalance);
        setInventory(data.inventory);
        setSpinning(false);
      }, 2000);
      
    } catch (err: any) {
      setError(err.message);
      setSpinning(false);
    }
  };

  const handleFeed = async (itemId: string) => {
    setFeedingItem(itemId);
    setError(null);
    
    const feedingItemData = inventory.find(i => i.id === itemId);
    const oldStage = monster.stage;
    
    try {
      const response = await fetch('/api/dojo/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, itemId }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const epGained = feedingItemData?.evolutionPoints || 10;
      setFeedToast({ ep: epGained, show: true });
      
      setIsMonsterBouncing(true);
      setTimeout(() => setIsMonsterBouncing(false), 600);
      
      setTimeout(() => setFeedToast(null), 2000);
      
      if (data.monster.stage !== oldStage) {
        const newStageInfo = EVOLUTION_STAGES.find(s => s.stage === data.monster.stage);
        if (newStageInfo) {
          setTimeout(() => {
            triggerConfetti();
            setEvolveToast({ newStage: newStageInfo.name, emoji: newStageInfo.emoji });
            setTimeout(() => setEvolveToast(null), 4000);
          }, 500);
        }
      }
      
      setMonster(data.monster);
      setInventory(data.inventory);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFeedingItem(null);
    }
  };

  const handleEquipDecoration = (item: DojoItem) => {
    const existingIndex = placedDecorations.findIndex(d => d.id === item.id);
    
    if (existingIndex >= 0) {
      const newDecorations = placedDecorations.filter(d => d.id !== item.id);
      setPlacedDecorations(newDecorations);
      localStorage.setItem(`dojo-decorations-${studentId}`, JSON.stringify(newDecorations));
      return;
    }
    
    const usedPositions = placedDecorations.map(d => ({ x: d.x, y: d.y }));
    const availablePositions = DECORATION_POSITIONS.filter(
      pos => !usedPositions.some(used => Math.abs(used.x - pos.x) < 10 && Math.abs(used.y - pos.y) < 10)
    );
    
    const position = availablePositions[0] || {
      x: 10 + Math.random() * 30,
      y: 10 + Math.random() * 50,
    };
    
    const newDecoration: PlacedDecoration = {
      id: item.id,
      emoji: item.itemEmoji,
      name: item.itemName,
      x: position.x,
      y: position.y,
      scale: item.itemRarity === 'LEGENDARY' ? 1.5 : item.itemRarity === 'EPIC' ? 1.3 : 1.1,
    };
    
    const newDecorations = [...placedDecorations, newDecoration];
    setPlacedDecorations(newDecorations);
    localStorage.setItem(`dojo-decorations-${studentId}`, JSON.stringify(newDecorations));
  };

  const handleDebugAddXP = async () => {
    try {
      const response = await fetch('/api/dojo/debug-add-xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, amount: 1000 }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setXpBalance(data.xpBalance);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getCurrentEvolutionStage = () => {
    const sorted = [...EVOLUTION_STAGES].reverse();
    return sorted.find(s => monster.evolutionPoints >= s.minPoints) || EVOLUTION_STAGES[0];
  };

  const getNextEvolutionStage = () => {
    const currentIndex = EVOLUTION_STAGES.findIndex(s => s.stage === getCurrentEvolutionStage().stage);
    return EVOLUTION_STAGES[currentIndex + 1] || null;
  };

  const evolutionProgress = () => {
    const current = getCurrentEvolutionStage();
    const next = getNextEvolutionStage();
    if (!next) return 100;
    const range = next.minPoints - current.minPoints;
    const progress = monster.evolutionPoints - current.minPoints;
    return Math.min(100, (progress / range) * 100);
  };

  const currentStage = getCurrentEvolutionStage();
  const nextStage = getNextEvolutionStage();
  const foodItems = inventory.filter(i => i.itemType === 'FOOD' && i.quantity > 0);
  const decorItems = inventory.filter(i => i.itemType === 'DECORATION' && i.quantity > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading Virtual Dojo...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      <style>{`
        @keyframes monster-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-30px) scale(1.1); }
          50% { transform: translateY(-15px) scale(1.05); }
          75% { transform: translateY(-25px) scale(1.08); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); }
          50% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.6); }
        }
        .monster-bounce {
          animation: monster-bounce 0.6s ease-in-out;
        }
        .float-animation {
          animation: float 3s ease-in-out infinite;
        }
        .glow-animation {
          animation: glow-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-4 bg-black/40 backdrop-blur-md rounded-xl p-3">
          <button onClick={onBack} className="flex items-center gap-2 text-white hover:text-cyan-300 transition">
            <ArrowLeft size={20} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">🏯 Virtual Dojo</h1>
            <p className="text-cyan-300 text-xs">{studentName}'s Training Ground</p>
          </div>
          <div className="flex items-center gap-2 bg-yellow-500/20 rounded-lg px-3 py-2">
            <Zap className="text-yellow-400" size={18} />
            <span className="text-yellow-300 font-bold">{xpBalance.toLocaleString()} XP</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-400 rounded-lg p-3 mb-4 text-red-200 text-center text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        <div 
          ref={roomRef}
          className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-4 border-amber-800/50 glow-animation"
          style={{
            height: '400px',
            background: `
              linear-gradient(to bottom, 
                rgba(139, 90, 43, 0.9) 0%, 
                rgba(101, 67, 33, 0.95) 30%,
                rgba(74, 54, 34, 1) 100%
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 48px,
                rgba(0,0,0,0.1) 48px,
                rgba(0,0,0,0.1) 50px
              ),
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 48px,
                rgba(0,0,0,0.05) 48px,
                rgba(0,0,0,0.05) 50px
              )
            `,
          }}
        >
          <div 
            className="absolute top-0 left-0 right-0 h-24"
            style={{
              background: 'linear-gradient(to bottom, rgba(45, 35, 25, 0.9), transparent)',
            }}
          />
          
          <div className="absolute top-2 left-4 text-4xl opacity-60">🏯</div>
          <div className="absolute top-2 right-4 text-3xl opacity-60">⛩️</div>
          
          <div 
            className="absolute bottom-0 left-0 right-0 h-20"
            style={{
              background: 'linear-gradient(to top, rgba(34, 25, 15, 0.8), transparent)',
            }}
          />

          {placedDecorations.map((decoration, index) => (
            <div
              key={decoration.id}
              className="absolute float-animation cursor-pointer hover:scale-110 transition-transform"
              style={{
                left: `${decoration.x}%`,
                top: `${decoration.y}%`,
                fontSize: `${3 * decoration.scale}rem`,
                animationDelay: `${index * 0.3}s`,
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
                zIndex: 10,
              }}
              title={decoration.name}
            >
              {decoration.emoji}
            </div>
          ))}

          <div 
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center ${isMonsterBouncing ? 'monster-bounce' : ''}`}
            style={{ zIndex: 20 }}
          >
            <div 
              className="relative"
              style={{
                filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))',
              }}
            >
              <span 
                className="block text-[8rem] leading-none"
                style={{
                  textShadow: currentStage.stage === 'master' 
                    ? '0 0 30px gold, 0 0 60px orange' 
                    : '0 0 20px rgba(255,255,255,0.3)',
                }}
              >
                {currentStage.emoji}
              </span>
              
              {currentStage.stage === 'master' && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xl animate-bounce">
                  👑
                </div>
              )}
            </div>
            
            <div className="mt-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/20">
              <span className="text-white font-bold text-sm">{currentStage.name}</span>
            </div>
          </div>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-64">
            <div className="flex justify-between text-xs text-white/80 mb-1">
              <span>Evolution</span>
              <span>{monster.evolutionPoints} / {nextStage?.minPoints || 'MAX'} EP</span>
            </div>
            <div className="h-3 bg-black/40 rounded-full overflow-hidden border border-white/20">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 transition-all duration-700"
                style={{ width: `${evolutionProgress()}%` }}
              />
            </div>
            {nextStage && (
              <p className="text-cyan-300/80 text-xs mt-1 text-center">
                {nextStage.minPoints - monster.evolutionPoints} EP to {nextStage.emoji}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mt-6">
          <button
            onClick={() => setShowInventory(true)}
            className="flex flex-col items-center gap-2 bg-gradient-to-br from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl p-5 shadow-lg transition transform hover:scale-105 border border-purple-400/30"
          >
            <Package size={28} />
            <span className="font-bold">Inventory</span>
            <span className="text-xs opacity-80">{inventory.reduce((sum, i) => sum + i.quantity, 0)} items</span>
          </button>
          
          <button
            onClick={() => setShowWheel(true)}
            className="flex flex-col items-center gap-2 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl p-5 shadow-lg transition transform hover:scale-105 border border-amber-400/30"
          >
            <Sparkles size={28} />
            <span className="font-bold">Lucky Wheel</span>
            <span className="text-xs opacity-80">{SPIN_COST} XP per spin</span>
          </button>
        </div>

        {placedDecorations.length > 0 && (
          <div className="max-w-md mx-auto mt-4 bg-black/30 backdrop-blur-sm rounded-xl p-3">
            <p className="text-white/60 text-xs text-center mb-2">Placed Decorations (tap to remove)</p>
            <div className="flex flex-wrap justify-center gap-2">
              {placedDecorations.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleEquipDecoration({ id: d.id, itemEmoji: d.emoji, itemName: d.name } as DojoItem)}
                  className="text-2xl hover:scale-125 transition-transform bg-white/10 rounded-lg p-2"
                  title={`Remove ${d.name}`}
                >
                  {d.emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showInventory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden border border-purple-500/30">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Package size={24} /> Inventory
              </h2>
              <button onClick={() => setShowInventory(false)} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {inventory.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Package size={48} className="mx-auto mb-2 opacity-50" />
                  <p>Your inventory is empty!</p>
                  <p className="text-sm">Spin the Lucky Wheel to get items.</p>
                </div>
              ) : (
                <>
                  {foodItems.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                        <Cookie size={18} className="text-orange-400" /> Food Items
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {foodItems.map(item => (
                          <div 
                            key={item.id} 
                            className={`p-3 rounded-xl border-2 ${RARITY_COLORS[item.itemRarity]} ${RARITY_GLOW[item.itemRarity]}`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-3xl">{item.itemEmoji}</span>
                              <div className="flex-1">
                                <p className="font-bold text-sm">{item.itemName}</p>
                                <p className="text-xs opacity-70">+{item.evolutionPoints} EP × {item.quantity}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleFeed(item.id)}
                              disabled={feedingItem === item.id}
                              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white text-sm py-2 rounded-lg disabled:opacity-50 transition font-bold"
                            >
                              {feedingItem === item.id ? '🍽️ Feeding...' : '🍽️ Feed Monster'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {decorItems.length > 0 && (
                    <div>
                      <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                        <Flower2 size={18} className="text-pink-400" /> Decorations
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {decorItems.map(item => {
                          const isPlaced = placedDecorations.some(d => d.id === item.id);
                          return (
                            <div 
                              key={item.id} 
                              className={`p-3 rounded-xl border-2 ${RARITY_COLORS[item.itemRarity]} ${RARITY_GLOW[item.itemRarity]} ${isPlaced ? 'ring-2 ring-cyan-400' : ''}`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-3xl">{item.itemEmoji}</span>
                                <div className="flex-1">
                                  <p className="font-bold text-sm">{item.itemName}</p>
                                  <p className="text-xs opacity-70">×{item.quantity}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleEquipDecoration(item)}
                                className={`w-full text-white text-sm py-2 rounded-lg transition font-bold ${
                                  isPlaced 
                                    ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500' 
                                    : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500'
                                }`}
                              >
                                {isPlaced ? '📤 Remove' : '📍 Place in Dojo'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showWheel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full overflow-hidden border border-amber-500/30">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles size={24} /> Lucky Wheel
              </h2>
              <button onClick={() => { setShowWheel(false); setSpinResult(null); }} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-yellow-500/20 rounded-full px-4 py-2 border border-yellow-500/30">
                  <Zap className="text-yellow-400" size={20} />
                  <span className="font-bold text-yellow-300">{xpBalance.toLocaleString()} XP</span>
                </div>
                <p className="text-gray-400 text-sm mt-2">Cost: {SPIN_COST} XP per spin</p>
              </div>

              <div className="relative w-52 h-52 mx-auto mb-6">
                <div 
                  className={`w-full h-full rounded-full flex items-center justify-center shadow-2xl border-4 border-amber-400/50 ${spinning ? 'animate-spin' : ''}`} 
                  style={{ 
                    animationDuration: '0.3s',
                    background: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #8b5cf6, #06b6d4, #10b981, #f59e0b)',
                  }}
                >
                  <div className="w-40 h-40 rounded-full bg-slate-800 flex items-center justify-center border-4 border-slate-700">
                    {spinning ? (
                      <RotateCcw className="text-white animate-pulse" size={64} />
                    ) : spinResult ? (
                      <span className="text-7xl">{spinResult.emoji}</span>
                    ) : (
                      <span className="text-7xl">🎰</span>
                    )}
                  </div>
                </div>
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-3xl">▼</div>
              </div>

              {spinResult && !spinning && (
                <div className={`text-center p-4 rounded-xl mb-4 border-2 ${RARITY_COLORS[spinResult.rarity as keyof typeof RARITY_COLORS]}`}>
                  <p className="font-bold text-lg">{spinResult.name}</p>
                  <p className="text-sm opacity-80">{spinResult.rarity} {spinResult.type}</p>
                  {spinResult.evolutionPoints > 0 && (
                    <p className="text-xs mt-1">+{spinResult.evolutionPoints} EP when fed!</p>
                  )}
                </div>
              )}

              <button
                onClick={handleSpin}
                disabled={spinning || xpBalance < SPIN_COST}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 border border-amber-400/30"
              >
                {spinning ? (
                  <>
                    <RotateCcw className="animate-spin" size={20} />
                    Spinning...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Spin for {SPIN_COST} XP
                  </>
                )}
              </button>
              
              {xpBalance < SPIN_COST && !spinning && (
                <p className="text-red-400 text-sm text-center mt-2">
                  Not enough XP! Earn more through training.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {feedToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-bounce">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-full shadow-2xl font-bold text-xl border-2 border-green-300">
            Yum! +{feedToast.ep} EP 🍽️
          </div>
        </div>
      )}

      {evolveToast && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 blur-3xl opacity-50 animate-pulse" />
            <div className="relative bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl p-10 text-center border-4 border-yellow-400/50">
              <div className="text-[10rem] mb-4 animate-bounce leading-none">{evolveToast.emoji}</div>
              <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-400 mb-2">
                ✨ EVOLUTION! ✨
              </h2>
              <p className="text-2xl text-white">
                Your monster evolved to{' '}
                <span className="font-bold text-yellow-300">{evolveToast.newStage}</span>!
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={handleDebugAddXP}
          className="bg-gray-800/80 hover:bg-gray-700 text-gray-400 text-xs px-3 py-2 rounded-lg border border-gray-600/50 transition"
        >
          DEV: +1000 XP
        </button>
      </div>
    </div>
  );
}
