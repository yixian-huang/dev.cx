import { useTranslation } from 'react-i18next';

interface OAuthSectionProps {
  loading: boolean;
  onOAuth: (provider: string) => void;
}

// 画布 2e:OAuth 按钮与输入框同规——纸面底 + rounded-xs,无阴影。
const oauthBtnCls =
  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium text-foreground-700 bg-background-100 hover:bg-background-200/70 active:bg-background-200 rounded-xs transition-colors duration-200 disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer border border-transparent hover:border-foreground-200/40';

export default function OAuthSection({ loading, onOAuth }: OAuthSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-8 pt-6 border-t border-foreground-200/35">
      <p className="text-center font-mono text-[11px] tracking-[0.18em] uppercase text-foreground-400 mb-4">
        {t('login.oauthHint')}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => onOAuth('github')} disabled={loading} className={oauthBtnCls}>
          <span className="w-4 h-4 flex items-center justify-center" aria-hidden>
            <i className="ri-github-fill text-base" />
          </span>
          GitHub
        </button>
        <button
          type="button"
          onClick={() => onOAuth('google')}
          disabled
          title={t('login.oauthComingSoon')}
          className={oauthBtnCls}
        >
          <span className="w-4 h-4 flex items-center justify-center" aria-hidden>
            <i className="ri-google-fill text-base" />
          </span>
          Google
        </button>
      </div>
    </div>
  );
}
