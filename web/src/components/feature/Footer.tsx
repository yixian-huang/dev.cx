import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import BrandMark from '@/components/feature/BrandMark';

interface FooterProps {
  hideCTA?: boolean;
}

export default function Footer({ hideCTA = false }: FooterProps) {
  const { t } = useTranslation();
  const { isLoggedIn, user } = useAuth();
  const hasProfile = !!(user && user.handle);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (showLoginModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showLoginModal]);

  return (
    <footer className="w-full bg-background-50 border-t border-background-200/50">
      <div className="max-w-[680px] mx-auto px-6 py-8 flex flex-col items-center text-center gap-5">
        {/* CTA line */}
        {!hideCTA && (
          <div>
            {!isLoggedIn ? (
              <button
                onClick={() => setShowLoginModal(true)}
                className="text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0"
              >
                {t('footer.improve')}
              </button>
            ) : !hasProfile ? (
              <Link
                to="/onboarding"
                className="text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200"
              >
                {t('footer.improve')}
              </Link>
            ) : (
              <Link
                to="/compose"
                className="text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200"
              >
                {t('nav.post')}
              </Link>
            )}
          </div>
        )}

        {/* Signature seal */}
        <BrandMark to="/" showWordmark={false} />

        {/* Weak links */}
        <div className="flex items-center gap-4">
          <Link
            to="/about"
            className="text-[11px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200"
          >
            {t('footer.about')}
          </Link>
          <span className="text-foreground-200 text-[10px]">·</span>
          <Link
            to="/guidelines"
            className="text-[11px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200"
          >
            {t('footer.guidelines')}
          </Link>
          <span className="text-foreground-200 text-[10px]">·</span>
          <Link
            to="/privacy"
            className="text-[11px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200"
          >
            {t('footer.privacy')}
          </Link>
          <span className="text-foreground-200 text-[10px]">·</span>
          <Link
            to="/terms"
            className="text-[11px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200"
          >
            {t('footer.terms')}
          </Link>
          <span className="text-foreground-200 text-[10px]">·</span>
          <a
            href="mailto:report@dev.cx?subject=%5Breport%5D"
            className="text-[11px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200"
          >
            {t('footer.report')}
          </a>
          <span className="text-foreground-200 text-[10px]">·</span>
          <span className="text-[11px] text-foreground-300">
            dev.cx &copy; {new Date().getFullYear()}
          </span>
        </div>
      </div>

      {/* Login prompt modal */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t('footer.loginPrompt')}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowLoginModal(false)}
          ></div>

          {/* Modal panel */}
          <div className="relative w-[360px] max-w-[90vw] bg-background-50 rounded-md p-6 z-10">
            <div className="mb-5">
              <div className="w-10 h-10 mx-auto mb-3 rounded-xs bg-secondary-100 flex items-center justify-center">
                <i className="ri-user-3-line text-secondary-600 text-lg"></i>
              </div>
              <h3 className="font-heading text-[16px] font-semibold text-foreground-950 text-center mb-1">
                {t('footer.loginPrompt')}
              </h3>
              <p className="text-[13px] text-foreground-500 text-center">
                {t('footer.loginPromptDesc')}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setShowLoginModal(false)}
                className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap"
              >
                {t('footer.goLogin')}
              </Link>
              <button
                onClick={() => setShowLoginModal(false)}
                className="w-full inline-flex items-center justify-center px-4 py-2 text-sm text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer bg-transparent border-none"
              >
                {t('footer.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}