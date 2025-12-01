import React, { useState, useEffect } from 'react';
import { SUBSCRIPTION_PLANS, formatPrice, getRequiredPlan } from '../services/subscriptionService';
import { stripeAPI } from '../services/apiClient';
import type { SubscriptionPlan, SubscriptionPlanId, Student } from '../types';

interface PricingPageProps {
  students: Student[];
  currentPlanId?: SubscriptionPlanId | null;
  onSelectPlan: (planId: SubscriptionPlanId) => void;
  onBack?: () => void;
  clubId?: string;
  email?: string;
}

interface StripePriceMap {
  [key: string]: string;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  students,
  currentPlanId,
  onSelectPlan,
  onBack,
  clubId,
  email
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
            priceMap[planId] = product.prices[0].id;
          }
        }
        
        console.log('Loaded Stripe prices:', priceMap);
        setStripePrices(priceMap);
      } catch (err) {
        console.warn('Could not load Stripe prices, using demo mode:', err);
      }
    };

    loadStripePrices();
  }, []);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    const priceId = stripePrices[plan.id] || stripePrices[plan.name.toLowerCase()];
    
    if (!priceId) {
      onSelectPlan(plan.id);
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
      console.error('Checkout error:', err);
      setError('Unable to start checkout. Please try again.');
      onSelectPlan(plan.id);
    } finally {
      setIsLoading(null);
    }
  };

  const isPlanDisabled = (plan: SubscriptionPlan): boolean => {
    if (plan.studentLimit === null) return false;
    return studentCount > plan.studentLimit;
  };

  const getPlanStatus = (plan: SubscriptionPlan): string => {
    if (currentPlanId === plan.id) return 'Current Plan';
    if (isPlanDisabled(plan)) return `Need ${plan.studentLimit}+ students`;
    if (plan.id === requiredPlan.id && !currentPlanId) return 'Recommended';
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        )}

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-400">
            {studentCount > 0 
              ? `You have ${studentCount} student${studentCount === 1 ? '' : 's'}. Select a plan that fits your dojo.`
              : 'Select a plan that fits your dojo. No limits during your 14-day trial!'}
          </p>
          {error && (
            <p className="mt-4 text-red-400 text-sm">{error}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const disabled = isPlanDisabled(plan);
            const status = getPlanStatus(plan);
            const isRecommended = plan.id === requiredPlan.id && !currentPlanId;
            const isCurrent = currentPlanId === plan.id;
            const isLoadingPlan = isLoading === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 flex flex-col ${
                  plan.popular
                    ? 'bg-gradient-to-b from-sky-900/50 to-gray-800 border-2 border-sky-500'
                    : 'bg-gray-800 border border-gray-700'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    MOST POPULAR
                  </div>
                )}

                {isRecommended && !plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    RECOMMENDED
                  </div>
                )}

                <div className="text-center mb-6">
                  <span className="text-4xl mb-2 block">{plan.icon}</span>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {plan.studentLimit ? `Up to ${plan.studentLimit} students` : 'Unlimited students'}
                  </p>
                </div>

                <div className="text-center mb-6">
                  <span className="text-3xl font-bold text-white">{formatPrice(plan.price)}</span>
                  <span className="text-gray-400">/mo</span>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={disabled || isCurrent || isLoadingPlan}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                    isCurrent
                      ? 'bg-green-600 text-white cursor-default'
                      : disabled
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : isLoadingPlan
                          ? 'bg-sky-600 text-white cursor-wait'
                          : plan.popular
                            ? 'bg-sky-500 hover:bg-sky-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {isCurrent 
                    ? 'Current Plan' 
                    : disabled 
                      ? 'Not Enough Capacity' 
                      : isLoadingPlan 
                        ? 'Loading...' 
                        : 'Select Plan'}
                </button>

                {status && !isCurrent && !disabled && (
                  <p className="text-center text-xs text-sky-400 mt-2">{status}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-400 text-sm">
            All plans include a 14-day free trial. No credit card required to start.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Prices are in USD. Cancel anytime. Secure payments powered by Stripe.
          </p>
        </div>
      </div>
    </div>
  );
};
