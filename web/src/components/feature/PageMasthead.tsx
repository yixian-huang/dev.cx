import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface PageMastheadProps {
  title: string;
  deck: string;
  showSeal?: boolean;
}

/**
 * Shared magazine-style masthead used on About and Guidelines pages.
 * Title/deck + optional year colophon. Brand identity lives in Navbar.
 */
export default function PageMasthead({ title, deck, showSeal = false }: PageMastheadProps) {
  const { t } = useTranslation();
  const [sealReady, setSealReady] = useState(false);

  useEffect(() => {
    if (!showSeal) return;
    const timer = setTimeout(() => setSealReady(true), 450);
    return () => clearTimeout(timer);
  }, [showSeal]);

  return (
    <header className="flex items-start md:items-center justify-between gap-4 pb-6 md:pb-7 border-b border-foreground-950/[0.08]">
      <div className="flex-1 min-w-0">
        <h1 className="font-heading text-[1.2rem] md:text-[1.35rem] text-foreground-950 leading-tight tracking-tight">
          {title}
        </h1>
        <p className="mt-1.5 text-[13px] text-foreground-500 leading-relaxed max-w-[560px]">
          {deck}
        </p>
      </div>
      <span className="hidden md:block font-mono text-[10px] uppercase tracking-[0.28em] text-foreground-350 shrink-0 whitespace-nowrap pt-1">
        {t('about.colophon.year')}
      </span>
    </header>
  );
}