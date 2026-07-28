import { type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface LoginFormProps {
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  loading: boolean;
  onClearError: () => void;
  onSubmit: (e: FormEvent) => void;
  onForgot: () => void;
}

// 画布 2e:输入框 bg-background-100 + rounded-xs,无描边;提交按钮 rounded-xs。
const inputCls =
  'w-full text-sm bg-background-100 text-foreground-900 placeholder:text-foreground-300 px-4 py-2.5 rounded-xs outline-none focus:bg-background-200/60 transition-colors duration-200';

export default function LoginForm({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  loading,
  onClearError,
  onSubmit,
  onForgot,
}: LoginFormProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-[13px] text-foreground-700 mb-1.5">{t('login.email')}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => { onEmailChange(e.target.value); onClearError(); }}
          placeholder={t('login.emailPlaceholder')}
          autoComplete="email"
          className={inputCls}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[13px] text-foreground-700">{t('login.password')}</label>
          <button
            type="button"
            onClick={onForgot}
            className="text-[12px] text-foreground-400 hover:text-primary-600 transition-colors duration-200 cursor-pointer"
          >
            {t('login.forgot')}
          </button>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => { onPasswordChange(e.target.value); onClearError(); }}
          placeholder={t('login.passwordPlaceholder')}
          autoComplete="current-password"
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
      >
        {loading ? t('login.submitting') : t('login.submit')}
      </button>
    </form>
  );
}
