import { Link } from 'react-router-dom';

interface BrandMarkProps {
  to?: string;
  showWordmark?: boolean;
  className?: string;
  /** sm=24px(导航/页脚签章),lg=34px(登录页印章,画布 2e)。 */
  size?: 'sm' | 'lg';
}

/**
 * Shared cx brand mark — 朱砂方章 + optional "dev.cx" wordmark.
 * Used in Navbar, Footer signature and Login page header.
 */
export default function BrandMark({ to = '/', showWordmark = true, className = '', size = 'sm' }: BrandMarkProps) {
  const sealCls = size === 'lg' ? 'w-[34px] h-[34px]' : 'w-6 h-6';
  const textCls = size === 'lg' ? 'text-[14px]' : 'text-[11px]';
  const inner = (
    <>
      <div className={`${sealCls} flex items-center justify-center rounded-xs bg-accent-500 text-accent-50 shrink-0 -rotate-6`}>
        <span className={`font-mono ${textCls} font-semibold tracking-[-0.02em]`}>cx</span>
      </div>
      {showWordmark && (
        <span className="font-heading text-lg font-semibold tracking-tight text-foreground-950 whitespace-nowrap">
          dev.cx
        </span>
      )}
    </>
  );

  const sharedClasses = `flex items-center gap-2 hover:opacity-80 transition-opacity duration-200 ${className}`;

  if (to) {
    return (
      <Link to={to} className={sharedClasses}>
        {inner}
      </Link>
    );
  }

  return <div className={sharedClasses}>{inner}</div>;
}