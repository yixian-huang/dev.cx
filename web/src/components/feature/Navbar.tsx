import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import LanguageSwitcher from '@/components/feature/LanguageSwitcher';
import BrandMark from '@/components/feature/BrandMark';

export default function Navbar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHint, setSearchHint] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const lastScrollY = useRef(0);
  const location = useLocation();
  const { isLoggedIn, user } = useAuth();
  const unread = user?.unreadNotifications ?? 0;

  const { theme, cycleTheme } = useTheme();

  const themeIcon = theme === 'warm' ? 'ri-contrast-drop-2-line' : theme === 'light' ? 'ri-sun-line' : 'ri-moon-line';
  const themeLabel = theme === 'warm' ? t('theme.warm') : theme === 'light' ? t('theme.light') : t('theme.dark');

  // ── Scroll handling via refs (no React re-renders) ──
  useEffect(() => {
    let ticking = false;
    const HIDE_THRESHOLD = 80;
    const SHOW_THRESHOLD = 20;

    const handleScroll = () => {
      const currentY = window.scrollY;

      if (!ticking) {
        requestAnimationFrame(() => {
          const nav = navRef.current;
          if (!nav) return;

          const scrolled = currentY > 8;
          const shouldHide = currentY > HIDE_THRESHOLD && (currentY - lastScrollY.current) > SHOW_THRESHOLD;
          const shouldShow = currentY <= HIDE_THRESHOLD || (currentY - lastScrollY.current) < -SHOW_THRESHOLD;

          // Toggle background
          if (scrolled || location.pathname !== '/') {
            nav.classList.add('bg-background-50');
            nav.classList.remove('bg-transparent');
          } else {
            nav.classList.add('bg-transparent');
            nav.classList.remove('bg-background-50');
          }

          // Toggle translate
          if (shouldHide && !shouldShow) {
            nav.classList.add('-translate-y-full');
            nav.classList.remove('translate-y-0');
          } else {
            nav.classList.add('translate-y-0');
            nav.classList.remove('-translate-y-full');
          }

          lastScrollY.current = currentY;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Initialize on mount
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node) &&
        searchRef.current &&
        searchRef.current.value === ''
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (searchRef.current) {
        searchRef.current.value = '';
        searchRef.current.blur();
      }
      setSearchHint('');
      setSearchOpen(false);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = (searchRef.current?.value ?? '').trim();
    if (!q) {
      setSearchHint(t('nav.searchEmpty'));
      return;
    }
    // 暂无全局搜索 API:仅闭环「像 handle 的查询」→ 档案页;其余诚实提示。
    const handleLike = q.replace(/^@/, '');
    if (/^[a-zA-Z0-9_][a-zA-Z0-9_-]{1,31}$/.test(handleLike)) {
      setSearchHint('');
      setSearchOpen(false);
      if (searchRef.current) searchRef.current.value = '';
      navigate(`/@${handleLike}`);
      return;
    }
    setSearchHint(t('nav.searchSoon'));
  }, [navigate, t]);

  const navLinkClass = (path: string) => {
    const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
    return `px-3 py-1.5 text-sm transition-colors duration-200 whitespace-nowrap rounded-xs ${
      isActive
        ? 'text-primary-500 font-medium'
        : 'text-foreground-600 hover:text-foreground-900'
    }`;
  };

  return (
    <nav
      ref={navRef}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 translate-y-0"
    >
      <div className="max-w-[720px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: brand mark — logo only on mobile, full wordmark on desktop */}
        <div className="flex items-center gap-2 shrink-0">
          <BrandMark to="/" showWordmark={false} />
          <span className="hidden md:inline font-heading text-lg font-semibold tracking-tight text-foreground-950 whitespace-nowrap">
            dev.cx
          </span>
        </div>

        {/* Center: primary nav */}
        <div className="hidden md:flex items-center gap-1 font-label">
          <Link to="/explore" className={navLinkClass('/explore')}>
            {t('nav.explore')}
          </Link>
          <Link to="/feed" className={navLinkClass('/feed')}>
            {t('nav.discuss')}
          </Link>
          <Link to="/me/projects" className={navLinkClass('/me/projects')}>
            {t('nav.projects')}
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0 font-label">
          {/* Search — always visible; Enter 见 handleSearchKeyDown */}
          <div ref={searchContainerRef} className="relative flex items-center">
            {searchOpen ? (
              <div className="relative">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={t('nav.searchPlaceholder')}
                  onKeyDown={handleSearchKeyDown}
                  onChange={() => setSearchHint('')}
                  className="w-44 text-sm bg-background-100 text-foreground-900 placeholder:text-foreground-300 px-3 py-1.5 rounded-xs outline-none transition-all duration-200"
                />
                {searchHint && (
                  <p
                    role="status"
                    className="absolute top-full right-0 mt-1.5 w-56 px-2.5 py-1.5 text-[11px] leading-snug text-foreground-700 bg-background-50 border border-foreground-200/50 rounded-xs shadow-sm z-50"
                  >
                    {searchHint}
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setSearchOpen(true);
                  setSearchHint('');
                }}
                className="w-8 h-8 flex items-center justify-center text-foreground-500 hover:text-foreground-800 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0"
                aria-label={t('nav.search')}
              >
                <i className="ri-search-line text-base w-4 h-4 flex items-center justify-center"></i>
              </button>
            )}
          </div>

          {/* Desktop-only actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* Language switcher */}
            <LanguageSwitcher />

            {isLoggedIn ? (
              <>
                {/* Bell */}
                <Link
                  to="/notifications"
                  className="w-8 h-8 flex items-center justify-center text-foreground-500 hover:text-foreground-800 transition-colors duration-200 cursor-pointer relative"
                  aria-label={t('nav.notifications')}
                >
                  <i className="ri-notification-3-line text-base w-4 h-4 flex items-center justify-center"></i>
                  {/* B2:未读徽标来自 /api/me 的 unread_notifications(登录即带,无轮询——
                      安静编辑原则);朱砂小方,mono 数字,≤99。 */}
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-xs bg-accent-500 text-accent-50 font-mono text-[9px] font-semibold flex items-center justify-center leading-none">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </Link>

                {/* Theme toggle */}
                <button
                  onClick={cycleTheme}
                  className="w-8 h-8 flex items-center justify-center text-foreground-500 hover:text-foreground-800 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0"
                  aria-label={themeLabel}
                  title={themeLabel}
                >
                  <i className={`${themeIcon} text-base w-4 h-4 flex items-center justify-center`}></i>
                </button>

                {/* Avatar */}
                <Link
                  to="/me"
                  className="w-7 h-7 rounded-xs bg-secondary-100 flex items-center justify-center text-foreground-500 hover:text-foreground-800 transition-colors duration-200 overflow-hidden shrink-0"
                  aria-label={t('nav.profile')}
                >
                  <i className="ri-user-3-line text-sm w-4 h-4 flex items-center justify-center"></i>
                </Link>
              </>
            ) : (
              <>
                {/* Theme toggle */}
                <button
                  onClick={cycleTheme}
                  className="w-8 h-8 flex items-center justify-center text-foreground-500 hover:text-foreground-800 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0"
                  aria-label={themeLabel}
                  title={themeLabel}
                >
                  <i className={`${themeIcon} text-base w-4 h-4 flex items-center justify-center`}></i>
                </button>
                <Link
                  to="/login"
                  className="text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap"
                >
                  {t('nav.login')}
                </Link>
              </>
            )}

            {/* Primary CTA: 发布 */}
            <Link
              to={isLoggedIn ? '/compose' : '/login'}
              className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap ml-1"
            >
              {t('nav.post')}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}