import { useMemo } from 'react';
import { en } from './en';
import { fr } from './fr';
import { de } from './de';

const translations: Record<string, typeof en> = {
  en,
  fr,
  de,
};

const languageMap: Record<string, string> = {
  'English': 'en',
  'French': 'fr',
  'Français': 'fr',
  'German': 'de',
  'Deutsch': 'de',
  'en': 'en',
  'fr': 'fr',
  'de': 'de',
};

function getNestedValue(obj: any, path: string): string | undefined {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

export function useTranslation(language?: string) {
  const lang = useMemo(() => {
    if (!language) return 'en';
    return languageMap[language] || 'en';
  }, [language]);

  const t = useMemo(() => {
    const currentTranslations = translations[lang] || translations.en;
    const fallback = translations.en;

    return (key: string, vars?: Record<string, string | number>): string => {
      let text = getNestedValue(currentTranslations, key) || getNestedValue(fallback, key) || key;

      if (vars) {
        Object.entries(vars).forEach(([varKey, value]) => {
          text = text.replace(new RegExp(`\\{${varKey}\\}`, 'g'), String(value));
        });
      }

      return text;
    };
  }, [lang]);

  return { t, lang };
}
