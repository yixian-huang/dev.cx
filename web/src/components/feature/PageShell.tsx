import { type ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import MobileTabs from './MobileTabs';
import VerifyBanner from './VerifyBanner';

export type ShellWidth = 'narrow' | 'default' | 'wide' | 'full' | 'none';

const widthClass: Record<ShellWidth, string> = {
  narrow: 'max-w-[640px]',
  default: 'max-w-[680px]',
  wide: 'max-w-[720px]',
  full: 'max-w-[1040px]',
  none: '',
};

interface PageShellProps {
  children: ReactNode;
  width?: ShellWidth;
  className?: string;
  mainClassName?: string;
  contentClassName?: string;
  pageEnter?: boolean;
  flexMain?: boolean;
  hideFooterCTA?: boolean;
}

/**
 * Standard page shell — wraps every content page with:
 * - Navbar (fixed top)
 * - Main content area with standard top padding
 * - Footer
 * - Mobile bottom tabs
 *
 * Eliminates the repeated shell boilerplate across 18 pages.
 */
export default function PageShell({
  children,
  width = 'default',
  className = '',
  mainClassName = '',
  contentClassName = '',
  pageEnter = true,
  flexMain = false,
  hideFooterCTA = false,
}: PageShellProps) {
  const outerFlex = flexMain ? 'flex flex-col' : '';
  const mainFlex = flexMain ? 'flex-1 flex flex-col justify-center' : '';
  const enterClass = pageEnter ? 'page-enter' : '';
  const widthCls = widthClass[width];
  const containerCls = width === 'full'
    ? 'w-full mx-auto px-6 md:px-10'
    : 'mx-auto px-6';

  return (
    <div className={`min-h-screen bg-background-50 ${outerFlex} ${className}`}>
      <Navbar />
      <main className={`pt-14 pb-14 md:pb-0 ${mainFlex} ${enterClass} ${mainClassName}`}>
        <VerifyBanner />
        <div className={`${widthCls} ${containerCls} ${contentClassName}`}>
          {children}
        </div>
      </main>
      <Footer hideCTA={hideFooterCTA} />
      <MobileTabs />
    </div>
  );
}