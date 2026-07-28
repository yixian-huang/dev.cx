import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface SuccessStateProps {
  /** 新帖 slug——「查看帖子」直达真实地址。 */
  slug: string;
  onNewPost: () => void;
}

// 发布成功 = 「确认时刻」:朱砂方章盖章动画一次一枚(交互规则,seal-stamp 只用于此类时刻)。
export default function SuccessState({ slug, onNewPost }: SuccessStateProps) {
  const { t } = useTranslation();

  return (
    <div className="py-20 text-center fade-in-up">
      <div className="mb-6">
        <div className="w-10 h-10 mx-auto mb-4 rounded-xs bg-accent-500 text-accent-50 flex items-center justify-center seal-stamp">
          <span className="font-mono text-[13px] font-semibold tracking-[-0.02em]">cx</span>
        </div>
        <p className="font-heading text-[22px] font-semibold text-foreground-950 mb-1">
          {t('compose.published')}
        </p>
        <p className="text-body-sm text-foreground-500">{t('compose.publishedDesc')}</p>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Link
          to={`/t/${slug}`}
          className="inline-flex items-center px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap"
        >
          {t('compose.viewPost')}
        </Link>
        <button
          onClick={onNewPost}
          className="inline-flex items-center px-4 py-2 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
        >
          {t('compose.newPost')} →
        </button>
      </div>
    </div>
  );
}
