import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiErrorMessage } from '@/lib/api-errors';
import type { ApiError } from '@/lib/api';
import Footer from '@/components/feature/Footer';
import BrandMark from '@/components/feature/BrandMark';
import FormAlert from '@/components/base/FormAlert';

// 注册单屏化:旧的三步向导(身份 9 字段 → 作品 → 打招呼)把「创建账号」和「完善档案」捆在
// 最后一步的四段链式提交里——中途流失连账号都没建成,第 1 步的字段错误也要拖到最后才暴露。
// 现在只收 register 端点必需的 4 个字段,提交即注册、错误就地展示;display_name 默认取
// handle(事后在 /me/profile 改),头像/简介/状态/作品/周状态全部由 /me 的完善入口按场景
// 承接(编辑资料 /me/profile、发布产品 /new-project、更新状态 /me/status)。
export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();
  const [params] = useSearchParams();

  // 邀请链接 /onboarding?code=xxx:预填并隐藏该栏,用户不用抄码。
  const presetInvite = (params.get('code') ?? '').trim();
  const [inviteCode, setInviteCode] = useState(presetInvite);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(
    inviteCode.trim() && email.trim() && password.trim() && handle.trim(),
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    // 与 API 对齐：密码不足 8 位时本地先提示，避免只看到模糊 bad_input
    if (password.length < 8) {
      setError(apiErrorMessage({ status: 400, code: 'password_too_short' }));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await register({
        invite_code: inviteCode.trim(),
        email: email.trim(),
        password,
        handle: handle.trim(),
        display_name: handle.trim(),
      });
      navigate('/me', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err as ApiError));
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full text-sm text-foreground-900 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 rounded-xs outline-none transition-colors duration-200';

  return (
    <div className="min-h-screen bg-background-50 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <BrandMark to="/" showWordmark={false} size="lg" className="mb-6" />

          <h1 className="font-heading text-[26px] md:text-[30px] font-semibold text-foreground-950 mb-2">
            {t('login.registerTitle')}
          </h1>
          <p className="text-[14px] text-foreground-400 mb-8">{t('login.registerDeck')}</p>

          {error && <FormAlert className="mb-4">{error}</FormAlert>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {presetInvite ? (
              <p className="text-[13px] text-foreground-400">
                <i className="ri-checkbox-circle-line text-primary-500 mr-1"></i>
                {t('onboarding.inviteApplied')}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-label text-foreground-500">{t('login.inviteCode')}</p>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={t('login.inviteCodePlaceholder')}
                  className={`${inputClass} font-mono tracking-wider`}
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-label text-foreground-500">{t('login.email')}</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <p className="text-label text-foreground-500">{t('login.password')}</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholderRegister')}
                autoComplete="new-password"
                minLength={8}
                className={inputClass}
              />
              <p className="text-[12px] text-foreground-400">{t('login.passwordHint')}</p>
            </div>

            <div className="space-y-2">
              <p className="text-label text-foreground-500">{t('onboarding.handle')}</p>
              <div className="flex items-center">
                <span className="text-mono-md text-foreground-400 mr-1">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/\s/g, '').toLowerCase())}
                  placeholder={t('onboarding.handlePlaceholder')}
                  className={`${inputClass} flex-1 font-mono`}
                />
              </div>
              <p className="text-[12px] text-foreground-400">{t('onboarding.handleHint')}</p>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 rounded-xs whitespace-nowrap cursor-pointer"
            >
              {submitting ? t('login.submitting') : t('login.registerSubmit')}
            </button>

            <p className="text-[11px] text-foreground-400 text-center">
              {t('legal.consent')}
              <Link to="/terms" className="hover:text-foreground-600 underline">{t('legal.terms')}</Link>
              {t('legal.and')}
              <Link to="/privacy" className="hover:text-foreground-600 underline">{t('legal.privacy')}</Link>
            </p>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-[13px] text-foreground-500 hover:text-primary-600 transition-colors duration-200"
            >
              {t('login.switchToLogin')}
            </Link>
          </div>
        </div>
      </main>

      <Footer hideCTA />
    </div>
  );
}
