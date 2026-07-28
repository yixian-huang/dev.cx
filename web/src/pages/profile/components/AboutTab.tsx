import { useTranslation } from 'react-i18next';
import type { UIProfile } from '@/lib/adapters/types';

export default function AboutTab({ profile }: { profile: UIProfile }) {
  const { t } = useTranslation();

  const statItems = [
    { value: profile.stats.worksCount, label: t('profile.works') },
    { value: profile.stats.followers, label: t('profile.followers') },
    { value: profile.stats.following, label: t('profile.following') },
  ];

  const detailRows = [
    { label: t('profile.locationLabel'), value: profile.location },
    { label: t('profile.companyLabel'), value: profile.company },
  ];

  return (
    <div className="py-6 md:py-8 space-y-8 md:space-y-10">
      {/* Stats */}
      <div className="flex items-baseline gap-10 md:gap-16">
        {statItems.map((item) => (
          <div key={item.label}>
            <span className="font-heading text-[22px] md:text-[24px] font-semibold text-foreground-950 leading-none tabular-nums">
              {item.value}
            </span>
            <span className="block mt-1.5 text-[11px] uppercase tracking-[0.14em] text-foreground-400">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Details */}
      <div>
        {detailRows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline gap-6 py-3 border-t border-foreground-950/[0.06]"
          >
            <span className="w-20 shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-400">
              {row.label}
            </span>
            <span className="text-[14px] text-foreground-800">{row.value}</span>
          </div>
        ))}

        {profile.links.length > 0 && (
          <div className="flex items-baseline gap-6 py-3 border-t border-b border-foreground-950/[0.06]">
            <span className="w-20 shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground-400">
              {t('profile.linksLabel')}
            </span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {profile.links.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[14px] text-foreground-700 hover:text-accent-500 transition-colors duration-200"
                >
                  <span>{link.label}</span>
                  <i className="ri-arrow-right-up-line text-[13px] text-foreground-400"></i>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}