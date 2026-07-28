import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UIProfile } from '@/lib/adapters/types';
import Markdown from '@/components/base/Markdown';

interface ProfileHeroProps {
  profile: UIProfile;
  actions?: ReactNode;
}

// 画布 2c:状态从胶囊降为 mono 灰字标(无红点);「本周在做」升级为 bg-100 整段色带,
// 朱砂呼吸点保留——它是该屏唯一状态点。
export default function ProfileHero({ profile, actions }: ProfileHeroProps) {
  const { t } = useTranslation();

  return (
    <div className="pt-9 md:pt-11">
      <div className="flex items-start gap-5 md:gap-[26px]">
        {/* Avatar — 方形 2px;无头像时中性占位块,不渲染破图 */}
        <div className="shrink-0">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.displayName}
              className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-xs object-cover bg-background-200 border border-foreground-200/50"
            />
          ) : (
            <div className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-xs bg-background-100 border border-foreground-200/50 flex items-center justify-center text-foreground-300">
              <i className="ri-user-3-line text-3xl"></i>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* mono 状态字标 */}
          <div className="font-mono text-[10px] font-medium tracking-[0.2em] text-foreground-500 mb-2.5 uppercase">
            {t(`profile.status.${profile.status.toLowerCase()}`)}
          </div>

          <h1 className="font-heading text-[24px] md:text-[30px] leading-[1.2] font-semibold text-foreground-950">
            {profile.displayName}
          </h1>
          <p className="font-mono text-[13px] text-foreground-400 mt-1">
            @{profile.handle} · dev.cx/@{profile.handle}
          </p>

          {/* bio 编辑端带格式工具栏——inline 变体只放行行内格式/列表,标题图片降级为纯文本 */}
          {profile.bio && (
            <div className="mt-3 text-[14px] leading-[1.8] text-foreground-700 max-w-[32em]">
              <Markdown variant="inline">{profile.bio}</Markdown>
            </div>
          )}

          {actions && <div className="flex items-center gap-3 mt-4">{actions}</div>}
        </div>
      </div>

      {/* 本周在做 — 整段色带(全出血由父级 PageShell 内边距抵消) */}
      {profile.currentWork && (
        <div className="chapter-band -mx-6 px-6 mt-7">
          <div className="py-[22px]">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.24em] text-foreground-400">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse-subtle"></span>
              {t('profile.thisWeek')}
            </div>
            <div className="mt-2.5 text-[14px] leading-[1.8] text-foreground-800 max-w-[40em]">
              <Markdown variant="inline">{profile.currentWork.text}</Markdown>
            </div>
            {profile.currentWork.updatedAt && (
              <p className="text-[11px] text-foreground-400 mt-1.5">
                {t('profile.updatedAt')} {profile.currentWork.updatedAt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
