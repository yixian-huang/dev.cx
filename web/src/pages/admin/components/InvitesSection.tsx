import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/api';
import {
  adminListInvites, adminListWaitlist, adminMintInvites, adminVoidInvite,
  type AdminInvite, type WaitlistEntry,
} from '@/lib/actions';

const client = () => createClient({ baseURL: '' });

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

  const mint = async () => {
    const codes = await adminMintInvites(
      client(), parseInt(n, 10) || 1, parseInt(uses, 10) || 1, note.trim());
    setFresh(codes);
    setNote('');
    await load();
  };

  return (
    <section className="mb-12">
      <h2 className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-4">
        {t('admin.invitesSection')}
      </h2>
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
        <button onClick={() => void mint()}
          className="px-3 py-1.5 text-[13px] bg-foreground-900 text-background-50 rounded-md cursor-pointer">
          {t('admin.invitesMint')}
        </button>
      </div>
      {fresh.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-background-100 rounded-md font-mono text-[13px] text-foreground-800">
          {fresh.join('  ')}
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
              <button
                onClick={async () => { await adminVoidInvite(client(), iv.code); await load(); }}
                className="text-[12px] text-foreground-400 hover:text-accent-600 cursor-pointer"
              >
                {t('admin.invitesVoid')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
