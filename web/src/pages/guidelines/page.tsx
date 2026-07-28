import { useTranslation } from 'react-i18next';
import PageShell from '@/components/feature/PageShell';
import PageMasthead from '@/components/feature/PageMasthead';
import PageColophon from '@/components/feature/PageColophon';

export default function GuidelinesPage() {
  const { t } = useTranslation();

  const sections = [
    { num: '01', titleKey: 'guidelines.section1.title', p1Key: 'guidelines.section1.p1', p2Key: 'guidelines.section1.p2' },
    { num: '02', titleKey: 'guidelines.section2.title', p1Key: 'guidelines.section2.p1', p2Key: 'guidelines.section2.p2' },
    { num: '03', titleKey: 'guidelines.section3.title', p1Key: 'guidelines.section3.p1', p2Key: 'guidelines.section3.p2' },
    { num: '04', titleKey: 'guidelines.section4.title', p1Key: 'guidelines.section4.p1', p2Key: 'guidelines.section4.p2' },
    { num: '05', titleKey: 'guidelines.section5.title', p1Key: 'guidelines.section5.p1', p2Key: 'guidelines.section5.p2' },
  ];

  return (
    <PageShell width="full" flexMain contentClassName="py-8 md:py-10">
      {/* ── Band 1: Masthead ── */}
      <PageMasthead title={t('guidelines.title')} deck={t('guidelines.deck')} />

      {/* ── Band 2: Five sections in 2-column grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 pt-8 md:pt-10">
        {sections.map((s) => (
          <div key={s.num}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500 mb-3 pb-2 border-b border-foreground-950/[0.06]">
              {s.num} &mdash; {t(s.titleKey)}
            </h2>
            <div className="space-y-2.5">
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
                {t(s.p1Key)}
              </p>
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
                {t(s.p2Key)}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Colophon strip ── */}
      <PageColophon backLabel={t('guidelines.backToCommunity')} />
    </PageShell>
  );
}