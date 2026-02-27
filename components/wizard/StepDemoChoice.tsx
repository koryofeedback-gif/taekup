import React, { useState } from 'react';
import { Sparkles, Users, Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

interface StepDemoChoiceProps {
  clubId: string;
  language?: string;
  onChooseFresh: () => void;
  onChooseDemo: () => void;
}

export const StepDemoChoice: React.FC<StepDemoChoiceProps> = ({ clubId, language, onChooseFresh, onChooseDemo }) => {
  const { t } = useTranslation(language);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLoadDemo = async () => {
    if (!clubId) {
      setError(t('wizard.demoChoice.accountError'));
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/demo/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        if (result.wizardData) {
          localStorage.removeItem('taekup_wizard_data');
          localStorage.removeItem('taekup_wizard_draft');
          localStorage.setItem('taekup_wizard_data', JSON.stringify(result.wizardData));
          
          localStorage.setItem('taekup_user_type', 'owner');
          localStorage.setItem('taekup_user_name', result.wizardData.ownerName || 'Demo Owner');
          localStorage.setItem('taekup_club_id', clubId);
          localStorage.setItem('taekup_wizard_complete', 'true');
          
          window.location.href = '/app/admin';
          return;
        }
        onChooseDemo();
      } else {
        setError(result.message || t('wizard.demoChoice.networkError'));
        setLoading(false);
      }
    } catch (err) {
      setError(t('wizard.demoChoice.networkError'));
      setLoading(false);
    }
  };

  return (
    <div className="text-center py-8">
      <h2 className="text-3xl font-bold text-white mb-4">
        {t('wizard.demoChoice.title')}
      </h2>
      <p className="text-gray-400 mb-12 max-w-lg mx-auto break-words">
        {t('wizard.demoChoice.subtitle')}
      </p>

      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <button
          onClick={handleLoadDemo}
          disabled={loading}
          className="group bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 hover:from-cyan-800/60 hover:to-cyan-700/40 border-2 border-cyan-500/50 hover:border-cyan-400 rounded-2xl p-8 transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              {loading ? (
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              ) : (
                <Sparkles className="w-6 h-6 text-cyan-400" />
              )}
            </div>
            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded">{t('wizard.demoChoice.recommended').toUpperCase()}</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{t('wizard.demoChoice.loadDemo')}</h3>
          <p className="text-gray-400 text-sm break-words">
            {t('wizard.demoChoice.loadDemoDesc')}
          </p>
        </button>

        <button
          onClick={onChooseFresh}
          disabled={loading}
          className="group bg-gray-800/50 hover:bg-gray-700/50 border-2 border-gray-600 hover:border-gray-500 rounded-2xl p-8 transition-all duration-300 text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gray-600/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{t('wizard.demoChoice.startFresh')}</h3>
          <p className="text-gray-400 text-sm break-words">
            {t('wizard.demoChoice.startFreshDesc')}
          </p>
        </button>
      </div>

      {error && (
        <p className="text-red-400 mt-6 text-sm">{error}</p>
      )}

      <p className="text-gray-500 text-xs mt-8 break-words">
        {t('wizard.demoChoice.demoNote')}
      </p>
    </div>
  );
};
