import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { stripeAPI } from '../services/apiClient';

interface StripeConnectModalProps {
  clubId: string;
  ownerEmail: string;
  clubName: string;
  onClose: () => void;
  onSuccess: (url: string) => void;
  t: (key: string) => string;
}

type BusinessType = 'individual' | 'company';

export const StripeConnectModal: React.FC<StripeConnectModalProps> = ({
  clubId, ownerEmail, clubName, onClose, onSuccess, t
}) => {
  const [step, setStep] = useState<'form' | 'processing'>('form');
  const [error, setError] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('individual');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(ownerEmail);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('FR');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  const [companyName, setCompanyName] = useState(clubName);
  const [companyTaxId, setCompanyTaxId] = useState('');

  const [tosAccepted, setTosAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('processing');

    try {
      const publishableKey = await stripeAPI.getPublishableKey();
      if (!publishableKey) {
        setError('Payment system not configured. Please contact support.');
        setStep('form');
        return;
      }

      const stripe = await loadStripe(publishableKey);
      if (!stripe) {
        setError('Failed to load payment system. Please try again.');
        setStep('form');
        return;
      }

      let accountTokenResult;

      if (businessType === 'individual') {
        accountTokenResult = await stripe.createToken('account', {
          business_type: 'individual',
          individual: {
            first_name: firstName,
            last_name: lastName,
            email: email,
            address: {
              line1: line1,
              city: city,
              postal_code: postalCode,
              country: country,
            },
            dob: {
              day: parseInt(dobDay),
              month: parseInt(dobMonth),
              year: parseInt(dobYear),
            },
          },
          tos_shown_and_accepted: true,
        } as any);
      } else {
        accountTokenResult = await stripe.createToken('account', {
          business_type: 'company',
          company: {
            name: companyName,
            address: {
              line1: line1,
              city: city,
              postal_code: postalCode,
              country: country,
            },
            tax_id: companyTaxId || undefined,
          },
          tos_shown_and_accepted: true,
        } as any);
      }

      if (accountTokenResult.error) {
        setError(accountTokenResult.error.message || 'Failed to create account token');
        setStep('form');
        return;
      }

      const accountToken = accountTokenResult.token!.id;

      const response = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubId,
          email,
          clubName,
          accountToken,
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

  const isFormValid = () => {
    if (!tosAccepted) return false;
    if (!line1 || !city || !postalCode || !country) return false;
    if (businessType === 'individual') {
      return firstName && lastName && email && dobDay && dobMonth && dobYear;
    }
    return companyName && email;
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
              <p className="text-sm text-gray-500 mt-2">This may take a few seconds</p>
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

              {businessType === 'individual' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">First Name *</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Last Name *</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Date of Birth *</label>
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="number"
                        placeholder="Day"
                        min="1"
                        max="31"
                        value={dobDay}
                        onChange={e => setDobDay(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Month"
                        min="1"
                        max="12"
                        value={dobMonth}
                        onChange={e => setDobMonth(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Year"
                        min="1940"
                        max="2008"
                        value={dobYear}
                        onChange={e => setDobYear(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Company Name *</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Tax ID (SIRET/SIREN)</label>
                    <input
                      type="text"
                      value={companyTaxId}
                      onChange={e => setCompanyTaxId(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                      placeholder="Optional"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm text-gray-400 block mb-1">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Address *</label>
                <input
                  type="text"
                  value={line1}
                  onChange={e => setLine1(e.target.value)}
                  placeholder="Street address"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">City *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Postal Code *</label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={e => setPostalCode(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 block mb-1">Country *</label>
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="FR">France</option>
                  <option value="DE">Germany</option>
                  <option value="ES">Spain</option>
                  <option value="IT">Italy</option>
                  <option value="NL">Netherlands</option>
                  <option value="BE">Belgium</option>
                  <option value="AT">Austria</option>
                  <option value="PT">Portugal</option>
                  <option value="IE">Ireland</option>
                  <option value="GB">United Kingdom</option>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="AU">Australia</option>
                  <option value="KR">South Korea</option>
                </select>
              </div>

              <div className="flex items-start gap-3 bg-gray-700/50 p-3 rounded-lg">
                <input
                  type="checkbox"
                  checked={tosAccepted}
                  onChange={e => setTosAccepted(e.target.checked)}
                  className="mt-1 accent-purple-500"
                  id="tos-checkbox"
                />
                <label htmlFor="tos-checkbox" className="text-sm text-gray-300">
                  I agree to the{' '}
                  <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                    Stripe Connected Account Agreement
                  </a>
                  {' '}and authorize TaekUp to facilitate payments to my account.
                </label>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/20 p-3 rounded-lg">
                <p className="text-xs text-blue-300">
                  <span className="font-bold">🔒 Secure & PSD2 Compliant:</span> Your information is sent directly to Stripe and never stored on our servers. After this step, Stripe may ask for additional verification documents.
                </p>
              </div>

              <button
                type="submit"
                disabled={!isFormValid()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
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
