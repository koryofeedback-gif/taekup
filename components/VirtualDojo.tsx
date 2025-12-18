import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Package, RotateCcw, ArrowLeft, X, Cookie, Flower2, Gem, Star, Zap } from 'lucide-react';

interface DojoItem {
  id: string;
  itemName: string;
  itemType: 'FOOD' | 'DECORATION';
  itemRarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  itemEmoji: string;
  quantity: number;
  evolutionPoints: number;
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

const WHEEL_ITEMS = [
  { name: 'Rice Ball', type: 'FOOD', rarity: 'COMMON', emoji: '🍙', evolutionPoints: 10, weight: 30 },
  { name: 'Sushi', type: 'FOOD', rarity: 'COMMON', emoji: '🍣', evolutionPoints: 15, weight: 25 },
  { name: 'Ramen', type: 'FOOD', rarity: 'RARE', emoji: '🍜', evolutionPoints: 25, weight: 15 },
  { name: 'Golden Apple', type: 'FOOD', rarity: 'EPIC', emoji: '🍎', evolutionPoints: 50, weight: 8 },
  { name: 'Dragon Fruit', type: 'FOOD', rarity: 'LEGENDARY', emoji: '🐉', evolutionPoints: 100, weight: 2 },
  { name: 'Bonsai Tree', type: 'DECORATION', rarity: 'COMMON', emoji: '🌳', evolutionPoints: 0, weight: 20 },
  { name: 'Lucky Cat', type: 'DECORATION', rarity: 'RARE', emoji: '🐱', evolutionPoints: 0, weight: 10 },
  { name: 'Golden Trophy', type: 'DECORATION', rarity: 'EPIC', emoji: '🏆', evolutionPoints: 0, weight: 5 },
  { name: 'Crystal Orb', type: 'DECORATION', rarity: 'LEGENDARY', emoji: '🔮', evolutionPoints: 0, weight: 2 },
];

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

export default function VirtualDojo({ studentId, studentName, onBack }: VirtualDojoProps) {
  const [xpBalance, setXpBalance] = useState<number>(0);
  const [inventory, setInventory] = useState<DojoItem[]>([]);
  const [monster, setMonster] = useState<MonsterState>({ stage: 'egg', evolutionPoints: 0, name: 'My Monster' });
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [spinResult, setSpinResult] = useState<typeof WHEEL_ITEMS[0] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedingItem, setFeedingItem] = useState<string | null>(null);

  const fetchDojoState = useCallback(async () => {
    try {
      const response = await fetch(`/api/dojo/state?studentId=${studentId}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setXpBalance(data.xpBalance || 0);
      setInventory(data.inventory || []);
      setMonster(data.monster || { stage: 'egg', evolutionPoints: 0, name: 'My Monster' });
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
    
    try {
      const response = await fetch('/api/dojo/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, itemId }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setMonster(data.monster);
      setInventory(data.inventory);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFeedingItem(null);
    }
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
      <div className="min-h-screen bg-gradient-to-b from-cyan-900 via-teal-800 to-emerald-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading Virtual Dojo...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-900 via-teal-800 to-emerald-900 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-10 left-10 text-6xl animate-bounce">🏯</div>
        <div className="absolute top-20 right-20 text-4xl animate-pulse">⛩️</div>
        <div className="absolute bottom-20 left-20 text-5xl">🎋</div>
        <div className="absolute bottom-10 right-10 text-4xl animate-bounce" style={{ animationDelay: '0.5s' }}>🌸</div>
      </div>

      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-6 bg-black/30 backdrop-blur-sm rounded-xl p-4">
          <button onClick={onBack} className="flex items-center gap-2 text-white hover:text-cyan-300 transition">
            <ArrowLeft size={20} />
            <span>Back</span>
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Virtual Dojo</h1>
            <p className="text-cyan-300 text-sm">{studentName}'s Training Ground</p>
          </div>
          <div className="flex items-center gap-2 bg-yellow-500/20 rounded-lg px-4 py-2">
            <Zap className="text-yellow-400" size={20} />
            <span className="text-yellow-300 font-bold text-lg">{xpBalance.toLocaleString()} XP</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-400 rounded-lg p-3 mb-4 text-red-200 text-center">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <div className="w-48 h-48 rounded-full bg-gradient-to-br from-cyan-400/30 to-emerald-400/30 flex items-center justify-center backdrop-blur-sm border-4 border-white/20 shadow-2xl">
              <span className="text-8xl animate-bounce" style={{ animationDuration: '3s' }}>
                {currentStage.emoji}
              </span>
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white/90 rounded-full px-4 py-1 text-sm font-bold text-gray-800">
              {currentStage.name}
            </div>
          </div>

          <div className="mt-8 w-full max-w-xs">
            <div className="flex justify-between text-sm text-white mb-1">
              <span>Evolution Progress</span>
              <span>{monster.evolutionPoints} EP</span>
            </div>
            <div className="h-4 bg-black/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${evolutionProgress()}%` }}
              />
            </div>
            {nextStage && (
              <p className="text-cyan-300 text-xs mt-1 text-center">
                {nextStage.minPoints - monster.evolutionPoints} EP to {nextStage.name} {nextStage.emoji}
              </p>
            )}
          </div>

          {decorItems.length > 0 && (
            <div className="mt-4 flex gap-2">
              {decorItems.slice(0, 5).map(item => (
                <span key={item.id} className="text-2xl" title={item.itemName}>
                  {item.itemEmoji}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button
            onClick={() => setShowInventory(true)}
            className="flex flex-col items-center gap-2 bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white rounded-xl p-6 shadow-lg transition transform hover:scale-105"
          >
            <Package size={32} />
            <span className="font-bold">Inventory</span>
            <span className="text-xs opacity-80">{inventory.reduce((sum, i) => sum + i.quantity, 0)} items</span>
          </button>
          
          <button
            onClick={() => setShowWheel(true)}
            className="flex flex-col items-center gap-2 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl p-6 shadow-lg transition transform hover:scale-105"
          >
            <Sparkles size={32} />
            <span className="font-bold">Lucky Wheel</span>
            <span className="text-xs opacity-80">{SPIN_COST} XP per spin</span>
          </button>
        </div>
      </div>

      {showInventory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Package size={24} /> Inventory
              </h2>
              <button onClick={() => setShowInventory(false)} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-96">
              {inventory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package size={48} className="mx-auto mb-2 opacity-50" />
                  <p>Your inventory is empty!</p>
                  <p className="text-sm">Spin the Lucky Wheel to get items.</p>
                </div>
              ) : (
                <>
                  {foodItems.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                        <Cookie size={18} /> Food Items
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {foodItems.map(item => (
                          <div 
                            key={item.id} 
                            className={`p-3 rounded-lg border-2 ${RARITY_COLORS[item.itemRarity]} ${RARITY_GLOW[item.itemRarity]}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{item.itemEmoji}</span>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{item.itemName}</p>
                                <p className="text-xs opacity-70">+{item.evolutionPoints} EP × {item.quantity}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleFeed(item.id)}
                              disabled={feedingItem === item.id}
                              className="mt-2 w-full bg-green-500 hover:bg-green-600 text-white text-sm py-1 rounded-lg disabled:opacity-50 transition"
                            >
                              {feedingItem === item.id ? 'Feeding...' : 'Feed Monster'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {decorItems.length > 0 && (
                    <div>
                      <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                        <Flower2 size={18} /> Decorations
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {decorItems.map(item => (
                          <div 
                            key={item.id} 
                            className={`p-3 rounded-lg border-2 text-center ${RARITY_COLORS[item.itemRarity]} ${RARITY_GLOW[item.itemRarity]}`}
                          >
                            <span className="text-3xl">{item.itemEmoji}</span>
                            <p className="font-medium text-xs mt-1">{item.itemName}</p>
                            <p className="text-xs opacity-70">×{item.quantity}</p>
                          </div>
                        ))}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
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
                <div className="inline-flex items-center gap-2 bg-yellow-100 rounded-full px-4 py-2">
                  <Zap className="text-yellow-600" size={20} />
                  <span className="font-bold text-yellow-700">{xpBalance.toLocaleString()} XP</span>
                </div>
                <p className="text-gray-500 text-sm mt-2">Cost: {SPIN_COST} XP per spin</p>
              </div>

              <div className="relative w-48 h-48 mx-auto mb-6">
                <div className={`w-full h-full rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-xl ${spinning ? 'animate-spin' : ''}`} 
                     style={{ animationDuration: '0.3s' }}>
                  {spinning ? (
                    <RotateCcw className="text-white animate-pulse" size={64} />
                  ) : spinResult ? (
                    <div className="text-center">
                      <span className={`text-6xl ${RARITY_GLOW[spinResult.rarity as keyof typeof RARITY_GLOW]}`}>
                        {spinResult.emoji}
                      </span>
                    </div>
                  ) : (
                    <span className="text-6xl">🎰</span>
                  )}
                </div>
              </div>

              {spinResult && !spinning && (
                <div className={`text-center p-4 rounded-xl mb-4 ${RARITY_COLORS[spinResult.rarity as keyof typeof RARITY_COLORS]}`}>
                  <p className="font-bold text-lg">{spinResult.name}</p>
                  <p className="text-sm opacity-80">{spinResult.rarity} {spinResult.type}</p>
                  {spinResult.evolutionPoints > 0 && (
                    <p className="text-xs mt-1">+{spinResult.evolutionPoints} Evolution Points when fed!</p>
                  )}
                </div>
              )}

              <button
                onClick={handleSpin}
                disabled={spinning || xpBalance < SPIN_COST}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
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
                <p className="text-red-500 text-sm text-center mt-2">
                  Not enough XP! Earn more through training.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Debug Button - Bottom of screen */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={handleDebugAddXP}
          className="bg-gray-700/80 hover:bg-gray-600 text-gray-300 text-xs px-3 py-2 rounded-lg border border-gray-500/50 transition"
        >
          DEV: Add 1000 XP
        </button>
      </div>
    </div>
  );
}
