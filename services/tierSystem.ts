export interface AvatarTier {
  id: number;
  name: string;
  minXP: number;
  maxXP: number;
  icon: string;
  color: string;
  glowColor: string;
  bgGradient: string;
  borderStyle: string;
  auraAnimation: string;
  unlocks: string[];
}

export const AVATAR_TIERS: AvatarTier[] = [
  {
    id: 1,
    name: "Dojo Initiate",
    minXP: 0,
    maxXP: 99,
    icon: "🥋",
    color: "#9CA3AF",
    glowColor: "rgba(156, 163, 175, 0.5)",
    bgGradient: "from-gray-600 to-gray-800",
    borderStyle: "border-gray-500",
    auraAnimation: "",
    unlocks: ["Basic avatar frame", "White belt glow"]
  },
  {
    id: 2,
    name: "Rising Challenger",
    minXP: 100,
    maxXP: 249,
    icon: "⚡",
    color: "#3B82F6",
    glowColor: "rgba(59, 130, 246, 0.5)",
    bgGradient: "from-blue-600 to-blue-800",
    borderStyle: "border-blue-500",
    auraAnimation: "animate-pulse",
    unlocks: ["Blue aura ring", "Electric frame effect", "Custom stance selection"]
  },
  {
    id: 3,
    name: "Guardian of the Dojang",
    minXP: 250,
    maxXP: 499,
    icon: "🛡️",
    color: "#10B981",
    glowColor: "rgba(16, 185, 129, 0.5)",
    bgGradient: "from-emerald-600 to-emerald-800",
    borderStyle: "border-emerald-500",
    auraAnimation: "animate-pulse",
    unlocks: ["Emerald guardian aura", "Shield frame effect", "Dojo background selection"]
  },
  {
    id: 4,
    name: "Legendary Dragon",
    minXP: 500,
    maxXP: 999,
    icon: "🐉",
    color: "#8B5CF6",
    glowColor: "rgba(139, 92, 246, 0.6)",
    bgGradient: "from-purple-600 to-purple-900",
    borderStyle: "border-purple-500",
    auraAnimation: "animate-pulse",
    unlocks: ["Dragon spirit aura", "Mythic frame glow", "Spirit companion preview", "Animated background"]
  },
  {
    id: 5,
    name: "World Champion",
    minXP: 1000,
    maxXP: Infinity,
    icon: "🏆",
    color: "#F59E0B",
    glowColor: "rgba(245, 158, 11, 0.7)",
    bgGradient: "from-yellow-500 to-orange-600",
    borderStyle: "border-yellow-400",
    auraAnimation: "animate-pulse",
    unlocks: ["Golden champion aura", "Legendary frame with particles", "World Champion banner", "Exclusive seasonal items"]
  }
];

export function getTierFromXP(globalXP: number): AvatarTier {
  for (let i = AVATAR_TIERS.length - 1; i >= 0; i--) {
    if (globalXP >= AVATAR_TIERS[i].minXP) {
      return AVATAR_TIERS[i];
    }
  }
  return AVATAR_TIERS[0];
}

export function getNextTier(currentTier: AvatarTier): AvatarTier | null {
  const nextIndex = AVATAR_TIERS.findIndex(t => t.id === currentTier.id) + 1;
  if (nextIndex < AVATAR_TIERS.length) {
    return AVATAR_TIERS[nextIndex];
  }
  return null;
}

export function getProgressToNextTier(globalXP: number): { 
  currentTier: AvatarTier; 
  nextTier: AvatarTier | null; 
  progress: number; 
  xpNeeded: number;
  xpInCurrentTier: number;
  tierRange: number;
} {
  const currentTier = getTierFromXP(globalXP);
  const nextTier = getNextTier(currentTier);
  
  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      progress: 100,
      xpNeeded: 0,
      xpInCurrentTier: globalXP - currentTier.minXP,
      tierRange: 0
    };
  }
  
  const xpInCurrentTier = globalXP - currentTier.minXP;
  const tierRange = nextTier.minXP - currentTier.minXP;
  const progress = Math.min(100, Math.floor((xpInCurrentTier / tierRange) * 100));
  const xpNeeded = nextTier.minXP - globalXP;
  
  return {
    currentTier,
    nextTier,
    progress,
    xpNeeded,
    xpInCurrentTier,
    tierRange
  };
}
