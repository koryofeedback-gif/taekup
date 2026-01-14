import React, { useState, useEffect } from 'react';
import { SUBSCRIPTION_PLANS, formatPrice, getRequiredPlan } from '../services/subscriptionService';
import { stripeAPI } from '../services/apiClient';
import type { SubscriptionPlan, Student } from '../types';

interface AccountLockedPageProps {
  students: Student[];
  clubName: string;
  clubId?: string;
  email?: string;
  isOwner?: boolean;
  isTrialExpired?: boolean;
}

interface StripePriceMap {
  [key: string]: string;
}

export const AccountLockedPage: React.FC<AccountLockedPageProps> = ({
  students,
  clubName,
  clubId,
  email,
  isOwner = true,
  isTrialExpired = true
}) => {
  const [stripePrices, setStripePrices] = useState<StripePriceMap>({});
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const studentCount = students.length;
  const requiredPlan = getRequiredPlan(studentCount);

  useEffect(() => {
    const loadStripePrices = async () => {
      try {
        const products = await stripeAPI.getProductsWithPrices();
        const priceMap: StripePriceMap = {};
        
        for (const product of products) {
          const metadata = product.metadata || {};
          const planId = (
            metadata.planId || 
            metadata.tier || 
            product.name || 
            ''
          ).toLowerCase().trim();
          
          if (planId && product.prices && product.prices.length > 0) {
            for (const price of product.prices) {
              if (price.recurring?.interval === 'month') {
                priceMap[planId] = price.id;
              }
            }
          }
        }
        
        setStripePrices(priceMap);
      } catch (err) {
        console.warn('Could not load Stripe prices:', err);
      }
    };

    if (isOwner) {
      loadStripePrices();
    }
  }, [isOwner]);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    const priceId = stripePrices[plan.id] || stripePrices[plan.name.toLowerCase()];
    
    if (!priceId) {
      setError('Unable to load pricing. Please refresh and try again.');
      return;
    }

    setIsLoading(plan.id);
    setError(null);

    try {
      const checkoutUrl = await stripeAPI.createCheckoutSession(priceId, { clubId, email });
      
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('[AccountLocked] Checkout error:', err);
      setError(`Checkout error: ${err.message || 'Please try again'}`);
      setIsLoading(null);
    }
  };

  const title = isTrialExpired ? 'Trial Period Ended' : 'Plan Upgrade Required';
  const description = isTrialExpired 
    ? `Your 14-day free trial for ${clubName} has ended.`
    : `Your current plan doesn't support ${studentCount} students. Please upgrade to continue.`;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-gray-800 rounded-2xl p-8 border border-red-500/50 shadow-lg shadow-red-500/10">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m10-6a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
            <p className="text-gray-400">{description}</p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400">Your students:</span>
              <span className="text-2xl font-bold text-white">{studentCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Required plan:</span>
              <span className="text-xl font-bold text-sky-400">
                {requiredPlan.icon} {requiredPlan.name}
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center">
              {error}
            </div>
          )}

          {isOwner ? (
            <>
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold text-white">Select a plan to continue:</h3>
                
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const canSelect = plan.studentLimit === null || studentCount <= plan.studentLimit;
                  const isRecommended = plan.id === requiredPlan.id;
                  const isLoadingThis = isLoading === plan.id;

                  return (
                    <button
                      key={plan.id}
                      onClick={() => canSelect && !isLoading && handleSelectPlan(plan)}
                      disabled={!canSelect || !!isLoading}
                      className={`w-full p-4 rounded-xl border transition-all flex items-center justify-between ${
                        isRecommended
                          ? 'border-sky-500 bg-sky-500/10 hover:bg-sky-500/20'
                          : canSelect && !isLoading
                            ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50 hover:bg-gray-800'
                            : 'border-gray-800 bg-gray-900/50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{plan.icon}</span>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{plan.name}</span>
                            {isRecommended && (
                              <span className="text-xs bg-sky-500 text-white px-2 py-0.5 rounded">
                                RECOMMENDED
                              </span>
                            )}
                          </div>
                          <span className="text-sm text-gray-400">
                            {plan.studentLimit ? `Up to ${plan.studentLimit} students` : 'Unlimited students'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        {isLoadingThis ? (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
                        ) : (
                          <>
                            <span className="text-xl font-bold text-white">{formatPrice(plan.price)}</span>
                            <span className="text-gray-400 text-sm">/mo</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-center text-sm text-gray-500">
                <p>Your data is safe. Choose a plan to unlock your account.</p>
                <p className="mt-1">Questions? Contact support@taekup.com</p>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 mb-6">
                <p className="text-yellow-400 font-medium mb-2">Account Access Restricted</p>
                <p className="text-gray-400 text-sm">
                  Please contact your club administrator to resolve this issue.
                </p>
              </div>
              <p className="text-gray-500 text-sm">
                Questions? Contact support@taekup.com
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
