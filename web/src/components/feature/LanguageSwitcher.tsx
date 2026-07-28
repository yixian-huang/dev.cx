import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Lang = 'zh' | 'en';

const LANG_KEY = 'devcx_lang';

function getStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch { /* noop */ }
  return null;
}

function setStoredLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* noop */ }
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState<Lang>(
    () => getStoredLang() || (i18n.language?.startsWith('en') ? 'en' : 'zh'),
  );

  useEffect(() => {
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  const switchTo = (next: Lang) => {
    setLang(next);
    setStoredLang(next);
  };

  // 画布 1b:mono「中 / EN」纯文字态——胶囊底是自家反 pill 模式,已废弃。
  return (
    <div className="flex items-center gap-1 font-mono text-[11px]">
      <button
        onClick={() => switchTo('zh')}
        className={`p-0 bg-transparent border-none transition-colors duration-200 cursor-pointer ${
          lang === 'zh' ? 'text-foreground-800' : 'text-foreground-400 hover:text-foreground-600'
        }`}
        aria-label="切换到中文"
      >
        中
      </button>
      <span className="text-foreground-300">/</span>
      <button
        onClick={() => switchTo('en')}
        className={`p-0 bg-transparent border-none transition-colors duration-200 cursor-pointer ${
          lang === 'en' ? 'text-foreground-800' : 'text-foreground-400 hover:text-foreground-600'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
    </div>
  );
}