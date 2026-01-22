import React from 'react';
import type { SubscriptionStatus } from '../types';

interface TrialBannerProps {
  subscription: SubscriptionStatus;
  onUpgradeClick: () => void;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({ subscription, onUpgradeClick }) => {
  // Only hide if there's a confirmed active subscription (planId + not in trial)
  if (subscription.planId && !subscription.isTrialActive) {
    return null;
  }

  return (
    <div className="bg-sky-600 text-white px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎉</span>
        <span className="text-sm font-medium">Enjoy your free trial! Explore all TaekUp features.</span>
      </div>
      <button
        onClick={onUpgradeClick}
        className="px-4 py-1 rounded-lg text-sm font-semibold transition-colors bg-white/20 hover:bg-white/30"
      >
        View Plans
      </button>
    </div>
  );
};
