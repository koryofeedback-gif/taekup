
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';

interface SetupCompleteProps {
  language?: string;
  onGoToDashboard: () => void;
}

export const SetupComplete: React.FC<SetupCompleteProps> = ({ language, onGoToDashboard }) => {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  
  const handleClick = async () => {
    await onGoToDashboard();
    navigate('/app/admin');
  };

  return (
    <div className="container mx-auto px-6 py-20 md:py-32 text-center">
      <div className="max-w-2xl mx-auto">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 break-words">
          {t('wizard.complete.title')}
        </h1>
        <p className="text-xl text-gray-300 mb-8 break-words">
          {t('wizard.complete.message')}
        </p>
        <button
          onClick={handleClick}
          className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-8 rounded-full text-lg transition-transform transform hover:scale-105 shadow-lg shadow-blue-600/30"
        >
          {t('wizard.complete.goToDashboard')} →
        </button>
      </div>
    </div>
  );
};
