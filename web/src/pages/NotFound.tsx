import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

// C3:替换 Readdy 模板遗留的「页面尚未生成/我可以为你生成它」文案——那是生成器语境,
// 不是产品语境。样式对齐画布 7b-04 空状态卡:小方章 + 一句话 + 回首页箭头。
export default function NotFound() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-background-50">
      <div className="w-8 h-8 mb-5 rounded-xs bg-accent-500 text-accent-50 flex items-center justify-center -rotate-6">
        <span className="font-mono text-[12px] font-semibold tracking-[-0.02em]">cx</span>
      </div>
      <p className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-3">404</p>
      <h1 className="font-heading text-display-lg font-semibold text-foreground-950 mb-2">{t('notFound.title')}</h1>
      <p className="mt-1 text-body-sm font-mono text-foreground-400">{location.pathname}</p>
      <p className="mt-3 text-body-md text-foreground-500">{t('notFound.deck')}</p>
      <Link
        to="/"
        className="mt-6 text-[13px] text-foreground-600 hover:text-primary-500 transition-colors duration-200"
      >
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
