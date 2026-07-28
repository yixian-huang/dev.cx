import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { createClient, type ApiError } from '@/lib/api';
import { follow, unfollow } from '@/lib/actions';
import { apiErrorMessage } from '@/lib/api-errors';

interface FollowButtonProps {
  kind: 'user' | 'project';
  /** user 的 handle 或 project 的 slug */
  targetId: string;
  /** 服务端带来的 viewer_following;匿名为 undefined(点击引导登录) */
  initialFollowing?: boolean;
  followLabel: string;
  followingLabel: string;
  className?: string;
}

// B2 关注按钮(墨色描边,C3 既定样式):乐观更新、失败回滚;
// 关注成功 = 「确认时刻」——按钮内朱砂小方章盖章一次(seal-stamp 交互规则)。
export default function FollowButton({
  kind,
  targetId,
  initialFollowing,
  followLabel,
  followingLabel,
  className = '',
}: FollowButtonProps) {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [busy, setBusy] = useState(false);
  const [stampKey, setStampKey] = useState(0);
  const [error, setError] = useState('');

  const handleClick = async () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (busy) return;
    setError('');
    const next = !following;
    setFollowing(next); // 乐观
    setBusy(true);
    try {
      const client = createClient({ baseURL: '' });
      if (next) {
        await follow(client, kind, targetId);
        setStampKey((k) => k + 1);
      } else {
        await unfollow(client, kind, targetId);
      }
    } catch (err) {
      setFollowing(!next); // 回滚
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] rounded-xs border transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-60 ${
          following
            ? 'border-foreground-300/60 text-foreground-500 hover:text-foreground-700 bg-transparent'
            : 'border-primary-500/40 text-primary-500 hover:border-primary-500/70 bg-transparent'
        } ${className}`}
      >
        {following && stampKey > 0 && (
          <span
            key={stampKey}
            className="w-3.5 h-3.5 rounded-xs bg-accent-500 text-accent-50 inline-flex items-center justify-center seal-stamp"
          >
            <span className="font-mono text-[8px] font-semibold">cx</span>
          </span>
        )}
        {following ? followingLabel : followLabel}
      </button>
      {error && <span className="text-[12px] text-primary-700">{error}</span>}
    </span>
  );
}
