import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { useTranslation } from '../i18n/useTranslation';

const LANGUAGE_OPTIONS = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

function detectBrowserLanguage(): string {
    const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
    const short = browserLang.slice(0, 2).toLowerCase();
    if (['fr', 'de'].includes(short)) return short;
    return 'en';
}

export const RequestAccessPage: React.FC = () => {
    const [language, setLanguage] = useState(() => detectBrowserLanguage());
    const { t } = useTranslation(language);
    const [fullName, setFullName] = useState('');
    const [clubName, setClubName] = useState('');
    const [websiteUrl, setWebsiteUrl] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [cityState, setCityState] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName || !clubName || !websiteUrl || !email) {
            setError(t('requestAccess.requiredFields'));
            return;
        }
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, clubName, websiteUrl, email, phone, cityState, language }),
            });

            if (response.ok) {
                setSubmitted(true);
            } else {
                const data = await response.json();
                setError(data.error || t('requestAccess.networkError'));
            }
        } catch {
            setError(t('requestAccess.networkError'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
            <SEO title="Request VIP Access | TaekUp" description="Request VIP early access to the TaekUp platform." />
            <div className="max-w-lg w-full">
                <div className="text-center mb-8">
                    <Link to="/" className="inline-block mb-4">
                        <span className="text-3xl font-black tracking-tight">
                            <span className="text-white">TAEK</span>
                            <span className="text-cyan-400">UP</span>
                        </span>
                    </Link>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                        </span>
                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">{t('requestAccess.vipEarlyAccess')}</span>
                    </div>
                </div>

                <div className="flex justify-center gap-1 mb-4">
                    {LANGUAGE_OPTIONS.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => setLanguage(lang.code)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                language === lang.code
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                                    : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                            }`}
                        >
                            <span className="mr-1.5">{lang.flag}</span>
                            {lang.label}
                        </button>
                    ))}
                </div>

                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl shadow-cyan-500/5 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-600"></div>

                    <div className="p-8">
                        {submitted ? (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30">
                                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-3">{t('requestAccess.successTitle')}</h2>
                                <p className="text-zinc-400 leading-relaxed mb-2">
                                    {t('requestAccess.successMessage')}
                                </p>
                                <p className="text-zinc-400 leading-relaxed mb-6">
                                    {t('requestAccess.successTimeframe')}
                                </p>
                                <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 border border-zinc-700/50">
                                    <p className="text-sm text-zinc-500">{t('requestAccess.confirmationSent')}</p>
                                    <p className="text-cyan-400 font-medium">{email}</p>
                                </div>
                                <Link
                                    to="/"
                                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    {t('requestAccess.backToHome')}
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold text-white mb-2">{t('requestAccess.title')}</h2>
                                    <p className="text-zinc-400 text-sm break-words">
                                        {t('requestAccess.subtitle')}
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.fullName')} <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={e => setFullName(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.fullNamePlaceholder')}
                                            disabled={isLoading}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.clubName')} <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={clubName}
                                            onChange={e => setClubName(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.clubNamePlaceholder')}
                                            disabled={isLoading}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.websiteLabel')} <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={websiteUrl}
                                            onChange={e => setWebsiteUrl(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.websitePlaceholder')}
                                            disabled={isLoading}
                                            required
                                        />
                                        <p className="text-xs text-zinc-600 mt-1">{t('requestAccess.websiteHint')}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.cityState')} <span className="text-zinc-600">({t('requestAccess.optional')})</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={cityState}
                                            onChange={e => setCityState(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.cityStatePlaceholder')}
                                            disabled={isLoading}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.emailLabel')} <span className="text-cyan-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.emailPlaceholder')}
                                            disabled={isLoading}
                                            required
                                        />
                                        <p className="text-xs text-zinc-600 mt-1">{t('requestAccess.emailHint')}</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                                            {t('requestAccess.phoneLabel')} <span className="text-zinc-600">({t('requestAccess.optional')})</span>
                                        </label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            className="w-full bg-zinc-800/50 text-white border border-zinc-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all placeholder-zinc-600"
                                            placeholder={t('requestAccess.phonePlaceholder')}
                                            disabled={isLoading}
                                        />
                                    </div>

                                    {error && (
                                        <div className="bg-red-900/20 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                                    >
                                        {isLoading ? (
                                            <span className="flex items-center justify-center">
                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                {t('requestAccess.submitting')}
                                            </span>
                                        ) : t('requestAccess.submit')}
                                    </button>
                                </form>

                                <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
                                    <p className="text-zinc-500 text-sm">
                                        {t('requestAccess.alreadyHaveAccount')}{' '}
                                        <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">{t('requestAccess.logIn')}</Link>
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center text-zinc-700 text-xs mt-6">
                    {t('requestAccess.termsAgree')}{' '}
                    <Link to="/terms" className="text-zinc-500 hover:text-zinc-400">{t('requestAccess.terms')}</Link> &{' '}
                    <Link to="/privacy" className="text-zinc-500 hover:text-zinc-400">{t('requestAccess.privacyPolicy')}</Link>.
                </p>
            </div>
        </div>
    );
};
