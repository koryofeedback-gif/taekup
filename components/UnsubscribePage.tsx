import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Mail, CheckCircle, XCircle, RotateCcw, ArrowLeft } from 'lucide-react';

type PageState = 'loading' | 'confirm' | 'success' | 'resubscribed' | 'error' | 'no-email';

export const UnsubscribePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';

  const [state, setState] = useState<PageState>(email ? 'loading' : 'no-email');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!email) return;
    fetch(`/api/unsubscribe/status?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        setState(data.unsubscribed ? 'success' : 'confirm');
      })
      .catch(() => setState('confirm'));
  }, [email]);

  const handleUnsubscribe = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setState('success');
      else setState('error');
    } catch {
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubscribe = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setState('resubscribed');
      else setState('error');
    } catch {
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to MyTaek</span>
          </Link>
          <div className="mt-6">
            <div className="text-2xl font-black tracking-tight text-white">
              My<span className="text-red-500">Taek</span>
            </div>
            <p className="text-gray-500 text-xs mt-1">Email Preferences</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">

          {/* Loading */}
          {state === 'loading' && (
            <div className="text-center py-4">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Checking your preferences…</p>
            </div>
          )}

          {/* No email in URL */}
          {state === 'no-email' && (
            <div className="text-center">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-white mb-2">Invalid Link</h2>
              <p className="text-gray-400 text-sm">
                This unsubscribe link appears to be invalid. Please use the unsubscribe link from your email.
              </p>
            </div>
          )}

          {/* Confirm unsubscribe */}
          {state === 'confirm' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
                <Mail className="w-7 h-7 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Unsubscribe from emails?</h2>
              <p className="text-gray-400 text-sm mb-1">You're unsubscribing</p>
              <p className="text-cyan-300 text-sm font-mono font-semibold mb-6 break-all">{email}</p>
              <p className="text-gray-500 text-xs mb-6">
                You will no longer receive promotional or update emails from MyTaek.
                You can re-subscribe at any time.
              </p>
              <button
                onClick={handleUnsubscribe}
                disabled={isSubmitting}
                className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {isSubmitting ? 'Processing…' : 'Yes, unsubscribe me'}
              </button>
              <Link
                to="/"
                className="block mt-3 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                No, keep me subscribed
              </Link>
            </div>
          )}

          {/* Successfully unsubscribed */}
          {state === 'success' && (
            <div className="text-center">
              <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-5" />
              <h2 className="text-xl font-bold text-white mb-2">You're unsubscribed</h2>
              <p className="text-gray-400 text-sm mb-1">
                <span className="text-cyan-300 font-mono break-all">{email}</span>
              </p>
              <p className="text-gray-500 text-xs mt-3 mb-8">
                You won't receive marketing or update emails from MyTaek anymore.
                Transactional emails (like billing receipts) may still be sent.
              </p>
              <button
                onClick={handleResubscribe}
                disabled={isSubmitting}
                className="w-full py-3 px-6 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 border border-gray-700"
              >
                <RotateCcw className="w-4 h-4" />
                {isSubmitting ? 'Processing…' : 'Re-subscribe'}
              </button>
            </div>
          )}

          {/* Re-subscribed */}
          {state === 'resubscribed' && (
            <div className="text-center">
              <CheckCircle className="w-14 h-14 text-cyan-400 mx-auto mb-5" />
              <h2 className="text-xl font-bold text-white mb-2">Welcome back!</h2>
              <p className="text-gray-400 text-sm mb-6">
                <span className="text-cyan-300 font-mono break-all">{email}</span>
                <br />
                <span className="text-gray-500 text-xs mt-1 block">is now subscribed to MyTaek emails again.</span>
              </p>
              <Link
                to="/"
                className="block w-full py-3 px-6 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition-colors text-sm text-center"
              >
                Go to MyTaek
              </Link>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="text-center">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-gray-400 text-sm mb-6">
                We couldn't process your request. Please try again or contact support.
              </p>
              <button
                onClick={() => setState('confirm')}
                className="w-full py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition-colors text-sm border border-gray-700"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          © {new Date().getFullYear()} MyTaek · All rights reserved
        </p>
      </div>
    </div>
  );
};
