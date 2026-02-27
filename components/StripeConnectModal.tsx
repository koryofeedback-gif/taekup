import React, { useState } from 'react';

interface StripeConnectModalProps {
  clubId: string;
  ownerEmail: string;
  clubName: string;
  clubCountry?: string;
  onClose: () => void;
  onSuccess: (url: string) => void;
  t: (key: string) => string;
}

type BusinessType = 'individual' | 'company';

const STRIPE_SUPPORTED_COUNTRIES = [
  'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'IE', 'GB', 'US', 'CA', 'AU', 'KR',
  'CH', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SK', 'SI', 'GR',
  'CY', 'MT', 'LU', 'LV', 'LT', 'EE', 'NZ', 'JP', 'SG', 'HK', 'MX', 'BR',
];

export const StripeConnectModal: React.FC<StripeConnectModalProps> = ({
  clubId, ownerEmail, clubName, clubCountry, onClose, onSuccess, t
}) => {
  const [step, setStep] = useState<'form' | 'processing'>('form');
  const [error, setError] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('individual');
  const [country, setCountry] = useState(() => {
    if (clubCountry && STRIPE_SUPPORTED_COUNTRIES.includes(clubCountry)) return clubCountry;
    return 'US';
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('processing');

    try {
      const response = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          email: ownerEmail,
          clubName,
          businessType,
          country,
        })
      });

      const result = await response.json();

      if (result.url) {
        onSuccess(result.url);
      } else {
        setError(result.error || 'Failed to create connection. Please try again.');
        setStep('form');
      }
    } catch (err: any) {
      console.error('Stripe Connect error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setStep('form');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-purple-500/30 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <span className="text-2xl mr-3">🏦</span>
              <div>
                <h3 className="text-lg font-bold text-white">Connect Your Bank Account</h3>
                <p className="text-sm text-gray-400">Required for receiving revenue share payments</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
          </div>

          {step === 'processing' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="animate-spin h-10 w-10 text-purple-400 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <p className="text-gray-300">Setting up your account...</p>
              <p className="text-sm text-gray-500 mt-2">You'll be redirected to Stripe to complete verification</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-900/30 border border-red-500/30 text-red-300 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="text-sm text-gray-400 block mb-2">Account Type</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setBusinessType('individual')}
                    className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      businessType === 'individual'
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBusinessType('company')}
                    className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                      businessType === 'company'
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Country *</label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="AT">Austria</option>
                  <option value="AU">Australia</option>
                  <option value="BE">Belgium</option>
                  <option value="BG">Bulgaria</option>
                  <option value="BR">Brazil</option>
                  <option value="CA">Canada</option>
                  <option value="CH">Switzerland</option>
                  <option value="CY">Cyprus</option>
                  <option value="CZ">Czech Republic</option>
                  <option value="DE">Germany</option>
                  <option value="DK">Denmark</option>
                  <option value="EE">Estonia</option>
                  <option value="ES">Spain</option>
                  <option value="FI">Finland</option>
                  <option value="FR">France</option>
                  <option value="GB">United Kingdom</option>
                  <option value="GR">Greece</option>
                  <option value="HK">Hong Kong</option>
                  <option value="HR">Croatia</option>
                  <option value="HU">Hungary</option>
                  <option value="IE">Ireland</option>
                  <option value="IT">Italy</option>
                  <option value="JP">Japan</option>
                  <option value="KR">South Korea</option>
                  <option value="LT">Lithuania</option>
                  <option value="LU">Luxembourg</option>
                  <option value="LV">Latvia</option>
                  <option value="MT">Malta</option>
                  <option value="MX">Mexico</option>
                  <option value="NL">Netherlands</option>
                  <option value="NO">Norway</option>
                  <option value="NZ">New Zealand</option>
                  <option value="PL">Poland</option>
                  <option value="PT">Portugal</option>
                  <option value="RO">Romania</option>
                  <option value="SE">Sweden</option>
                  <option value="SG">Singapore</option>
                  <option value="SI">Slovenia</option>
                  <option value="SK">Slovakia</option>
                  <option value="US">United States</option>
                </select>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/20 p-3 rounded-lg">
                <p className="text-xs text-blue-300">
                  <span className="font-bold">🔒 Secure & PSD2 Compliant:</span> You'll be redirected to Stripe's secure platform to enter your personal details, verify your identity, and connect your bank account. No sensitive data is stored on our servers.
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Continue to Stripe Verification
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
