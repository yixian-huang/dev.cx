import PageShell from '@/components/feature/PageShell';

export type PageSkeletonVariant = 'list' | 'profile' | 'article' | 'lines';

interface PageSkeletonProps {
  variant?: PageSkeletonVariant;
  /** 与目标页 PageShell 对齐 */
  width?: 'default' | 'wide' | 'narrow';
  className?: string;
}

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-xs bg-background-200/70 ${className}`} />;
}

/**
 * SPA 导航 / 无 SSR 时的轻量骨架——替代空白 PageShell,减少「点进去什么都没有」感。
 */
export default function PageSkeleton({
  variant = 'lines',
  width = 'default',
  className = '',
}: PageSkeletonProps) {
  return (
    <PageShell width={width} pageEnter>
      <div className={`animate-pulse ${className}`} aria-hidden aria-busy="true">
        {variant === 'list' && (
          <section className="pt-10 pb-16">
            <Bar className="h-3 w-24 mb-6" />
            <Bar className="h-7 w-40 mb-8" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="py-4 border-b border-foreground-200/30">
                <Bar className="h-4 w-full max-w-md mb-2" />
                <Bar className="h-3 w-full max-w-xs bg-background-200/50" />
              </div>
            ))}
          </section>
        )}
        {variant === 'profile' && (
          <section className="pt-10 pb-10">
            <div className="flex items-start gap-4 mb-8">
              <div className="w-16 h-16 rounded-full bg-background-200/70 shrink-0" />
              <div className="flex-1 min-w-0 pt-1">
                <Bar className="h-6 w-40 mb-2" />
                <Bar className="h-3 w-24 mb-3 bg-background-200/50" />
                <Bar className="h-3 w-full max-w-lg bg-background-200/40" />
              </div>
            </div>
            <div className="flex gap-4 mb-6 border-b border-foreground-200/30 pb-2">
              <Bar className="h-3 w-12" />
              <Bar className="h-3 w-12 bg-background-200/50" />
              <Bar className="h-3 w-12 bg-background-200/40" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="py-3.5">
                <Bar className="h-4 w-48 mb-2" />
                <Bar className="h-3 w-72 max-w-full bg-background-200/50" />
              </div>
            ))}
          </section>
        )}
        {variant === 'article' && (
          <section className="pt-10 pb-16">
            <Bar className="h-3 w-32 mb-4" />
            <Bar className="h-8 w-full max-w-xl mb-3" />
            <Bar className="h-3 w-40 mb-8 bg-background-200/50" />
            <Bar className="h-3 w-full mb-2.5 bg-background-200/50" />
            <Bar className="h-3 w-full mb-2.5 bg-background-200/45" />
            <Bar className="h-3 w-full max-w-lg mb-2.5 bg-background-200/40" />
            <Bar className="h-3 w-full mb-2.5 bg-background-200/40" />
            <Bar className="h-3 w-full max-w-sm bg-background-200/35" />
          </section>
        )}
        {variant === 'lines' && (
          <section className="pt-10 pb-16 space-y-3">
            <Bar className="h-4 w-48" />
            <Bar className="h-3 w-full max-w-md bg-background-200/50" />
            <Bar className="h-3 w-full max-w-sm bg-background-200/40" />
            <Bar className="h-3 w-full max-w-xs bg-background-200/35" />
          </section>
        )}
      </div>
    </PageShell>
  );
}
