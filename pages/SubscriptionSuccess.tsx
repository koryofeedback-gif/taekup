import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';

export const SubscriptionSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [loading, setLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState<any>(null);

  useEffect(() => {
    const verifySession = async () => {
      if (sessionId) {
        try {
          const response = await fetch(`/api/verify-checkout-session?session_id=${sessionId}`);
          if (response.ok) {
            const data = await response.json();
            setSubscriptionInfo(data);
          }
        } catch (error) {
          console.error('Failed to verify session:', error);
        }
      }
      setLoading(false);
    };

    verifySession();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <SEO title="Subscription Successful | TaekUp" />
      <div className="max-w-md w-full text-center">
        <div className="bg-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700">
          {loading ? (
            <div className="py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Verifying your subscription...</p>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h1 className="text-3xl font-bold text-white mb-3">Payment Successful!</h1>
              <p className="text-gray-400 mb-6">
                Thank you for subscribing to TaekUp. Your subscription is now active.
              </p>

              {subscriptionInfo && (
                <div className="bg-gray-700/50 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm text-gray-400">Subscription Details:</p>
                  <p className="text-white font-medium">{subscriptionInfo.planName || 'Premium Plan'}</p>
                  {subscriptionInfo.email && (
                    <p className="text-gray-400 text-sm">{subscriptionInfo.email}</p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <Link
                  to="/login"
                  className="block w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  Log In to Your Dashboard
                </Link>
                <Link
                  to="/"
                  className="block text-gray-400 hover:text-white transition-colors"
                >
                  Return to Home
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-gray-500 text-sm mt-6">
          Need help? Contact us at support@mytaek.com
        </p>
      </div>
    </div>
  );
};
