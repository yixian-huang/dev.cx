import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiErrorMessage } from '@/lib/api-errors';
import { createClient, type ApiError } from '@/lib/api';
import { forgotPassword, joinWaitlist } from '@/lib/actions';
import Footer from '@/components/feature/Footer';
import BrandMark from '@/components/feature/BrandMark';
import FormAlert from '@/components/base/FormAlert';
import LoginForm from './components/LoginForm';
import OAuthSection from './components/OAuthSection';

// 假流程拆除记录(C3 清单项,高优先):
// - 旧「注册」tab 伪造两步验证(发码是 setTimeout,验证后直接调 login)——真实注册流在
//   /onboarding(邀请码 + 身份信息,见 onboarding/page.tsx handleFinish),此处只留入口链接。
// - 旧「忘记密码」伪造「重置成功」——当时 API 没有任何发码/重置端点,整块删除。现在
//   forgot/reset-password 端点已落地,入口以真实实现回归(见 handleForgot)。
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, githubStart } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // GitHub OAuth 回跳失败走 302 `/login?error=<code>`(github_handlers.go),不经 JSON
  // 信封——suspended/invite_required 在此提示;其余码沿用旧行为不展示。
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(() => {
    switch (searchParams.get('error')) {
      case 'suspended': return t('login.errorSuspended');
      case 'invite_required': return t('login.errorInviteRequired');
      default: return '';
    }
  });
  const [resetSent, setResetSent] = useState(false);
  // 候补名单折叠小表单:done 置位后恒显示登记成功文案(端点恒 204,不泄露是否已在列)。
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistDone, setWaitlistDone] = useState(false);
  // 登录页仪式感:印章延迟盖下一次(非确认时刻,无 seal-stamp 动画;仅入场淡入)。
  const [sealReady, setSealReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSealReady(true), 120);
    return () => clearTimeout(timer);
  }, []);

  const handleWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    try {
      await joinWaitlist(createClient({ baseURL: '' }), waitlistEmail.trim());
    } catch {
      // 与端点的去重静默语义一致:失败也不暴露细节
    }
    setWaitlistDone(true);
  };

  // 忘记密码:直接用邮箱输入框的当前值;无论 API 结果如何恒显示同一文案
  // (与 forgot-password 端点的防枚举语义一致,前端不暴露邮箱是否存在)。
  const handleForgot = async () => {
    setError('');
    if (!email.trim()) {
      setError(t('login.errorEmailRequired'));
      return;
    }
    try {
      await forgotPassword(createClient({ baseURL: '' }), email.trim());
    } catch {
      // 防枚举:失败也不改变提示
    }
    setResetSent(true);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError(t('login.errorRequired'));
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err as ApiError));
    } finally {
      setLoading(false);
    }
  };

  // Only GitHub is wired to a real provider; other buttons stay visible-but-disabled
  // (see OAuthSection) so this guard is defensive, not the primary gate.
  const handleOAuth = (provider: string) => {
    if (provider !== 'github') return;
    setError('');
    githubStart('login');
  };

  return (
    <div className="min-h-screen bg-background-50 flex flex-col paper-grain">
      <main className="flex-1 flex items-center justify-center px-6 py-12 md:py-16">
        <div className={`w-full max-w-[400px] page-enter ${sealReady ? 'opacity-100' : ''}`}>
          {/* 画布 2e:表单顶部 34px 印章 — 门槛页多一点仪式感,仍 type-first */}
          <div
            className={`mb-7 transition-opacity duration-500 ${sealReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <BrandMark to="/" showWordmark={false} size="lg" />
          </div>

          <p className="font-mono text-[11px] tracking-[0.24em] uppercase text-foreground-400 mb-3">
            {t('login.kicker')}
          </p>
          <h1 className="font-heading text-[28px] md:text-[32px] leading-[1.2] font-semibold text-foreground-950 mb-2.5 tracking-tight">
            {t('login.title')}
          </h1>
          <p className="text-[14px] leading-relaxed text-foreground-600 mb-9 max-w-[28em]">
            {t('login.deck')}
          </p>

          {error && (
            <FormAlert className="mb-5">{error}</FormAlert>
          )}

          {resetSent && (
            <FormAlert tone="info" className="mb-5">
              {t('reset.sent')}
            </FormAlert>
          )}

          <LoginForm
            email={email}
            onEmailChange={setEmail}
            password={password}
            onPasswordChange={setPassword}
            loading={loading}
            onClearError={() => setError('')}
            onSubmit={handleLogin}
            onForgot={() => void handleForgot()}
          />

          <OAuthSection loading={loading} onOAuth={handleOAuth} />

          <div className="mt-7 text-center space-y-3">
            <div>
              <Link
                to="/onboarding"
                className="text-[13px] text-foreground-600 hover:text-primary-600 transition-colors duration-200"
              >
                {t('login.switchToRegister')}
              </Link>
            </div>

            <div>
              {waitlistDone ? (
                <p className="text-[13px] text-foreground-600">{t('waitlist.done')}</p>
              ) : waitlistOpen ? (
                <form onSubmit={handleWaitlist} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder={t('waitlist.placeholder')}
                    autoComplete="email"
                    className="ink-field flex-1 min-w-0"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer shrink-0"
                  >
                    {t('waitlist.submit')}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setWaitlistOpen(true)}
                  className="text-[13px] text-foreground-400 hover:text-primary-600 transition-colors duration-200 cursor-pointer"
                >
                  {t('waitlist.prompt')}
                </button>
              )}
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className="text-[12px] text-foreground-400 hover:text-foreground-700 transition-colors duration-200"
              >
                ← {t('login.backToHome')}
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer hideCTA />
    </div>
  );
}
