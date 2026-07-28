import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/api';
import {
  adminListInvites, adminListWaitlist, adminMintInvites, adminVoidInvite,
  type AdminInvite, type WaitlistEntry,
} from '@/lib/actions';
import { inviteRegisterUrl } from '@/lib/invite-link';

const client = () => createClient({ baseURL: '' });

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function InvitesSection() {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [n, setN] = useState('1');
  const [uses, setUses] = useState('1');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState<string[]>([]);
  /** 最近一次复制成功的标识：code 本体，或 `__all__` 表示批量。 */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [inv, wl] = await Promise.all([
      adminListInvites(client()),
      adminListWaitlist(client()),
    ]);
    setInvites(inv);
    setWaitlist(wl.waitlist);
    setWaitlistCount(wl.count);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!copiedKey) return;
    const id = window.setTimeout(() => setCopiedKey(null), 2000);
    return () => window.clearTimeout(id);
  }, [copiedKey]);

  const mint = async () => {
    const codes = await adminMintInvites(
      client(), parseInt(n, 10) || 1, parseInt(uses, 10) || 1, note.trim());
    setFresh(codes);
    setNote('');
    setCopiedKey(null);
    await load();
  };

  const copyLink = async (code: string) => {
    const url = inviteRegisterUrl(code);
    if (await copyText(url)) setCopiedKey(code);
  };

  const copyAllFreshLinks = async () => {
    if (fresh.length === 0) return;
    const text = fresh.map((c) => inviteRegisterUrl(c)).join('\n');
    if (await copyText(text)) setCopiedKey('__all__');
  };

  const copyBtnLabel = (key: string) =>
    copiedKey === key ? t('admin.invitesLinkCopied') : t('admin.invitesCopyLink');

  return (
    <section className="mb-12">
      <h2 className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-4">
        {t('admin.invitesSection')}
      </h2>
      <p className="mb-3 text-[12px] text-foreground-400 leading-relaxed">
        {t('admin.invitesLinkHint')}
      </p>
      <div className="mb-3 text-[13px] text-foreground-600">
        <button
          type="button"
          onClick={() => setWaitlistOpen((v) => !v)}
          className="cursor-pointer hover:text-primary-600 transition-colors duration-200"
        >
          {t('admin.waitlistCount')}: {waitlistCount}
        </button>
        {waitlistOpen && (
          <ul className="mt-1.5 space-y-1">
            {waitlist.map((w) => (
              <li key={w.email} className="flex items-center gap-3 text-[13px]">
                <span className="font-mono text-foreground-800">{w.email}</span>
                <span className="ml-auto font-mono text-[11px] text-foreground-400">
                  {w.created_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input value={n} onChange={(e) => setN(e.target.value)}
          className="w-14 px-2 py-1.5 text-[13px] bg-background-50 border border-background-200 rounded-md"
          aria-label="n" />
        <span className="text-[12px] text-foreground-400">×</span>
        <input value={uses} onChange={(e) => setUses(e.target.value)}
          className="w-14 px-2 py-1.5 text-[13px] bg-background-50 border border-background-200 rounded-md"
          aria-label="uses" />
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.invitesNotePlaceholder')}
          className="flex-1 min-w-40 px-2 py-1.5 text-[13px] bg-background-50 border border-background-200 rounded-md" />
        <button type="button" onClick={() => void mint()}
          className="px-3 py-1.5 text-[13px] bg-foreground-900 text-background-50 rounded-md cursor-pointer">
          {t('admin.invitesMint')}
        </button>
      </div>
      {fresh.length > 0 && (
        <div className="mb-4 px-3 py-3 bg-background-100 rounded-md space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[12px] text-foreground-500">{t('admin.invitesFreshTitle')}</p>
            {fresh.length > 1 && (
              <button
                type="button"
                onClick={() => void copyAllFreshLinks()}
                className="text-[12px] text-primary-600 hover:text-primary-700 cursor-pointer"
              >
                {copiedKey === '__all__' ? t('admin.invitesLinkCopied') : t('admin.invitesCopyAllLinks')}
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {fresh.map((code) => {
              const url = inviteRegisterUrl(code);
              return (
                <li key={code} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-[13px]">
                  <span className="font-mono text-foreground-900 shrink-0">{code}</span>
                  <span className="font-mono text-[12px] text-foreground-500 break-all min-w-0 flex-1">
                    {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyLink(code)}
                    className="shrink-0 self-start sm:self-auto text-[12px] text-primary-600 hover:text-primary-700 cursor-pointer"
                  >
                    {copyBtnLabel(code)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul className="space-y-1.5">
        {invites.map((iv) => (
          <li key={iv.code} className="flex items-center gap-3 text-[13px] border-b border-background-200/40 pb-1.5">
            <span className={`font-mono ${iv.active ? 'text-foreground-800' : 'text-foreground-300 line-through'}`}>
              {iv.code}
            </span>
            <span className="text-foreground-400">{iv.used_count}/{iv.max_uses}</span>
            {iv.note && <span className="text-foreground-500 truncate">{iv.note}</span>}
            <span className="ml-auto font-mono text-[11px] text-foreground-400">
              {iv.created_at.slice(0, 10)}
            </span>
            {iv.active && (
              <>
                <button
                  type="button"
                  onClick={() => void copyLink(iv.code)}
                  className="text-[12px] text-foreground-500 hover:text-primary-600 cursor-pointer"
                  title={inviteRegisterUrl(iv.code)}
                >
                  {copyBtnLabel(iv.code)}
                </button>
                <button
                  type="button"
                  onClick={async () => { await adminVoidInvite(client(), iv.code); await load(); }}
                  className="text-[12px] text-foreground-400 hover:text-accent-600 cursor-pointer"
                >
                  {t('admin.invitesVoid')}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
