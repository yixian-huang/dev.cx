import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface PageColophonProps {
  backLabel: string;
  backTo?: string;
}

/**
 * Shared colophon strip used at the bottom of About and Guidelines pages.
 */
export default function PageColophon({ backLabel, backTo = '/' }: PageColophonProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-8 md:mt-10 pt-4 border-t border-foreground-950/[0.08] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-x-3 text-[11.5px] text-foreground-350">
        <span>{t('about.colophon.version')}</span>
        <span className="text-foreground-200 select-none">|</span>
        <span>{t('about.colophon.builtOn')} dev.cx</span>
      </div>
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-[11.5px] text-foreground-400 hover:text-accent-500 transition-colors duration-200"
      >
        <i className="ri-arrow-left-line text-xs w-3 h-3 flex items-center justify-center"></i>
        <span>{backLabel}</span>
      </Link>
    </div>
  );
}