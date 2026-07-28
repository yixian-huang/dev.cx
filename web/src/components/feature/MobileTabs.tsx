import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Mobile bottom tab bar.
 *
 * CRITICAL: This bar is rendered through a portal directly into <body>.
 * Reason — the router wraps every page in a `.page-transition-enter` div whose
 * animation leaves a lingering `transform`/`filter` on the element. Any non-`none`
 * transform/filter on an ancestor turns `position: fixed` into "fixed relative to
 * that ancestor" instead of the viewport, which pushed this bar to the bottom of the
 * full-height page (invisible until you scrolled all the way down). Portaling to
 * <body> escapes that containing block entirely, so `position: fixed` truly anchors
 * to the viewport.
 */
export default function MobileTabs() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isLoggedIn } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const tabs = [
    { key: 'discover', icon: 'ri-compass-3-line', href: '/', label: t('mobile.discover') },
    { key: 'latest', icon: 'ri-chat-1-line', href: '/feed', label: t('mobile.latest') },
    { key: 'post', icon: 'ri-add-line', href: isLoggedIn ? '/compose' : '/login', label: t('mobile.post'), isPrimary: true },
    { key: 'notifications', icon: 'ri-notification-3-line', href: isLoggedIn ? '/notifications' : '/login', label: t('mobile.notifications') },
    { key: 'me', icon: 'ri-user-3-line', href: isLoggedIn ? '/me' : '/login', label: t('mobile.me') },
  ];

  const bar = (
    <nav className="mobile-tabs-container bg-background-50 border-t border-background-200/70">
      <div
        className="flex items-center justify-around h-14 px-2 max-w-full"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === 'discover' ? location.pathname === '/' : location.pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              to={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-0 px-2 py-1 transition-colors duration-200 rounded-xs ${
                tab.isPrimary
                  ? 'text-primary-500'
                  : isActive
                    ? 'text-primary-500'
                    : 'text-foreground-400 hover:text-foreground-700'
              }`}
            >
              <i className={`${tab.icon} ${tab.isPrimary ? 'text-xl' : 'text-lg'} w-5 h-5 flex items-center justify-center`}></i>
              <span className="text-[10px] whitespace-nowrap">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {/* Spacer keeps the last page content from hiding behind the fixed bar */}
      <div className="mobile-tabs-spacer h-14" aria-hidden="true" />
      {/* Portal the fixed bar into <body> so it escapes any transformed ancestor */}
      {mounted ? createPortal(bar, document.body) : null}
    </>
  );
}