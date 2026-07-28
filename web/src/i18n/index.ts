import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import messages from './local/index';
import { setAdapterLocale } from '@/lib/adapters/locale';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: 'zh',
    fallbackLng: 'zh',
    debug: false,
    resources: messages,
    interpolation: {
      escapeValue: false,
    },
  });

// adapter 层(relativeTime/KIND_LABEL)在 React 之外选串——把语言变更同步过去
// (C3:适配器文案 i18n 化,见 lib/adapters/locale.ts)。
setAdapterLocale(i18n.language);
i18n.on('languageChanged', setAdapterLocale);

export default i18n;