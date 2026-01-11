import React from 'react';
import { getDaysRemaining } from '../services/subscriptionService';
import type { SubscriptionStatus } from '../types';

interface TrialBannerProps {
  subscription: SubscriptionStatus;
  onUpgradeClick: () => void;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({ subscription, onUpgradeClick }) => {
  // Only hide if there's a confirmed active subscription (planId + not in trial)
  if (subscription.planId && !subscription.isTrialActive) {
    console.log('[TrialBanner] Hidden: has active subscription');
    return null;
  }

  const daysRemaining = getDaysRemaining(subscription.trialEndDate);
  console.log('[TrialBanner] State:', { 
    planId: subscription.planId, 
    isTrialActive: subscription.isTrialActive, 
    trialEndDate: subscription.trialEndDate, 
    daysRemaining 
  });
  
  if (daysRemaining <= 0) {
    console.log('[TrialBanner] Hidden: no days remaining');
    return null;
  }

  const isUrgent = daysRemaining <= 3;
  const bgColor = isUrgent ? 'bg-red-600' : 'bg-sky-600';
  const message = isUrgent 
    ? `Trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}! Upgrade now to keep your data.`
    : `${daysRemaining} days left in your free trial. Enjoying TaekUp?`;

  return (
    <div className={`${bgColor} text-white px-4 py-2 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{isUrgent ? '⚠️' : '🎉'}</span>
        <span className="text-sm font-medium">{message}</span>
      </div>
      <button
        onClick={onUpgradeClick}
        className={`px-4 py-1 rounded-lg text-sm font-semibold transition-colors ${
          isUrgent 
            ? 'bg-white text-red-600 hover:bg-gray-100' 
            : 'bg-white/20 hover:bg-white/30'
        }`}
      >
        {isUrgent ? 'Upgrade Now' : 'View Plans'}
      </button>
    </div>
  );
};
