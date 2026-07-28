import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/api';
import {
  adminListSettings, adminPutSetting, adminDeleteSetting, adminSMTPTest,
  type AdminSetting,
} from '@/lib/actions';

const client = () => createClient({ baseURL: '' });

// 键的展示顺序与分组(白名单在 API 侧;这里只管排版)
const GROUPS: { labelKey: string; keys: string[] }[] = [
  { labelKey: 'admin.settingsSMTP', keys: ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from'] },
  { labelKey: 'admin.settingsOAuth', keys: ['github_client_id', 'github_client_secret'] },
];

export default function SettingsSection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AdminSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setItems(await adminListSettings(client()));
    setDrafts({});
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byKey = Object.fromEntries(items.map((s) => [s.key, s]));

  const save = async (key: string) => {
    const v = (drafts[key] ?? '').trim();
    if (!v) return;
    await adminPutSetting(client(), key, v);
    setNotice(t('admin.settingsSaved'));
    await load();
  };

  const reset = async (key: string) => {
    await adminDeleteSetting(client(), key);
    setNotice(t('admin.settingsReset'));
    await load();
  };

  const smtpTest = async () => {
    setNotice('');
    try {
      const r = await adminSMTPTest(client());
      setNotice(t('admin.smtpTestOK') + ' → ' + r.to);
    } catch {
      setNotice(t('admin.smtpTestFail'));
    }
  };

  return (
    <section className="mb-12">
      <h2 className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-4">
        {t('admin.settingsSection')}
      </h2>
      <p className="text-[12px] text-foreground-400 mb-4">{t('admin.settingsHint')}</p>
      {notice && <p className="text-[13px] text-accent-600 mb-3">{notice}</p>}
      {GROUPS.map((g) => (
        <div key={g.labelKey} className="mb-6">
          <h3 className="text-[13px] font-semibold text-foreground-800 mb-3">{t(g.labelKey)}</h3>
          <div className="space-y-2">
            {g.keys.map((key) => {
              const s = byKey[key];
              if (!s) return null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-44 shrink-0 font-mono text-[12px] text-foreground-600">{key}</span>
                  <input
                    type={s.secret ? 'password' : 'text'}
                    value={drafts[key] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    placeholder={
                      s.secret
                        ? s.configured ? t('admin.secretSet') : t('admin.secretUnset')
                        : s.value ?? ''
                    }
                    className="flex-1 px-2 py-1.5 text-[13px] bg-background-50 border border-background-200 rounded-md focus:outline-none focus:border-primary-500"
                  />
                  <span className="w-10 shrink-0 font-mono text-[10px] text-foreground-400">{s.source}</span>
                  <button
                    onClick={() => void save(key)}
                    className="text-[12px] text-foreground-600 hover:text-primary-600 cursor-pointer"
                  >
                    {t('admin.settingsSave')}
                  </button>
                  {s.source === 'db' && (
                    <button
                      onClick={() => void reset(key)}
                      className="text-[12px] text-foreground-400 hover:text-accent-600 cursor-pointer"
                    >
                      {t('admin.settingsResetBtn')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button
        onClick={() => void smtpTest()}
        className="px-3 py-1.5 text-[13px] border border-background-200 rounded-md text-foreground-700 hover:border-primary-500 cursor-pointer"
      >
        {t('admin.smtpTestBtn')}
      </button>
    </section>
  );
}
