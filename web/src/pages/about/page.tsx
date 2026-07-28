import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import PageMasthead from '@/components/feature/PageMasthead';
import PageColophon from '@/components/feature/PageColophon';

export default function AboutPage() {
  const { t } = useTranslation();
  const [sealReady, setSealReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSealReady(true), 450);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PageShell width="full" flexMain contentClassName="py-8 md:py-10">
      {/* ── Band 1: Masthead ── */}
      <PageMasthead title={t('about.title')} deck={t('about.deck')} />

      {/* ── Band 2: Pitch (hero statement) ── */}
      <section className="py-10 md:py-14 border-b border-foreground-950/[0.08] flex flex-col items-center text-center">
        <span className="font-heading text-4xl md:text-5xl text-foreground-200 leading-none select-none mb-3">
          &ldquo;
        </span>
        <p className="font-heading text-[1.15rem] md:text-[1.5rem] text-foreground-900 leading-relaxed max-w-[680px]">
          {t('about.pitch')}
        </p>
        <div className="mt-6 flex items-center gap-2.5">
          <span
            className={`w-8 h-8 flex items-center justify-center rounded-sm border border-accent-500/45 text-accent-500 text-[11px] font-mono shrink-0 ${
              sealReady ? 'seal-stamp' : 'opacity-0 -rotate-6'
            }`}
          >
            cx
          </span>
          <span className="text-[12px] text-foreground-400 tracking-[0.14em]">
            {t('about.sealLabel')}
          </span>
        </div>
      </section>

      {/* ── Band 3: Three aligned columns ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 pt-8 md:pt-10">

        {/* 01 Why */}
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500 mb-3 pb-2 border-b border-foreground-950/[0.06]">
            01 &mdash; {t('about.whyTitle')}
          </h2>
          <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
            {t('about.why.p1')}
          </p>
          <p className="mt-3 text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
            {t('about.why.p2')}
          </p>
        </div>

        {/* 02 Principles */}
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500 mb-3 pb-2 border-b border-foreground-950/[0.06]">
            02 &mdash; {t('about.principles.title')}
          </h2>
          <div className="space-y-3.5">
            <div className="flex gap-2.5">
              <span className="font-heading text-[12px] text-foreground-300 leading-none tabular-nums shrink-0 mt-[3px]">01</span>
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">{t('about.principles.p1')}</p>
            </div>
            <div className="flex gap-2.5">
              <span className="font-heading text-[12px] text-foreground-300 leading-none tabular-nums shrink-0 mt-[3px]">02</span>
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">{t('about.principles.p2')}</p>
            </div>
            <div className="flex gap-2.5">
              <span className="font-heading text-[12px] text-foreground-300 leading-none tabular-nums shrink-0 mt-[3px]">03</span>
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">{t('about.principles.p3')}</p>
            </div>
            {/* 数据可导出承诺(ops spec):整句挂 /me——登录后在设置里一键下载 JSON。 */}
            <div className="flex gap-2.5">
              <span className="font-heading text-[12px] text-foreground-300 leading-none tabular-nums shrink-0 mt-[3px]">04</span>
              <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
                <Link to="/me" className="hover:text-accent-500 transition-colors duration-200">
                  {t('about.principles.p4')}
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* 03 Contact */}
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-500 mb-3 pb-2 border-b border-foreground-950/[0.06]">
            03 &mdash; {t('about.contact.title')}
          </h2>
          <p className="text-[13px] md:text-[13.5px] text-foreground-600 leading-relaxed">
            {t('about.contact.p1')}
          </p>
          <div className="mt-4 flex flex-col gap-2.5 text-[13px]">
            <a
              href="https://github.com/yixian-huang/dev.cx"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-foreground-600 hover:text-accent-500 transition-colors duration-200 w-fit"
            >
              <i className="ri-github-line text-sm w-4 h-4 flex items-center justify-center text-foreground-400"></i>
              <span>GitHub</span>
            </a>
            <a
              href="mailto:hello@dev.cx"
              className="inline-flex items-center gap-2 text-foreground-600 hover:text-accent-500 transition-colors duration-200 w-fit"
            >
              <i className="ri-mail-line text-sm w-4 h-4 flex items-center justify-center text-foreground-400"></i>
              <span>hello@dev.cx</span>
            </a>
            <Link
              to="/guidelines"
              className="inline-flex items-center gap-2 text-foreground-600 hover:text-accent-500 transition-colors duration-200 w-fit"
            >
              <i className="ri-book-2-line text-sm w-4 h-4 flex items-center justify-center text-foreground-400"></i>
              <span>{t('about.guidelinesLink')}</span>
            </Link>
          </div>
        </div>

      </section>

      {/* ── Colophon strip ── */}
      <PageColophon backLabel={t('about.backToCommunity')} />
    </PageShell>
  );
}