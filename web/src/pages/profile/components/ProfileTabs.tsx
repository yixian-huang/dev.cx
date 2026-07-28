import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import TabSwitcher from '@/components/base/TabSwitcher';
import type { UIProfile } from '@/lib/adapters/types';
import WorksTab from '@/pages/profile/components/WorksTab';
import ActivityTab from '@/pages/profile/components/ActivityTab';
import AboutTab from '@/pages/profile/components/AboutTab';

type TabKey = 'works' | 'activity' | 'about';

export default function ProfileTabs({ profile }: { profile: UIProfile }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('works');

  const tabOptions = useMemo(
    () => [
      { key: 'works' as TabKey, label: t('profile.works') },
      { key: 'activity' as TabKey, label: t('profile.activity') },
      { key: 'about' as TabKey, label: t('profile.about') },
    ],
    [t]
  );

  return (
    <section className="pt-6 pb-10 md:pb-14 border-t border-background-200/50">
      <div className="mb-6 pb-2">
        <TabSwitcher<TabKey> tabs={tabOptions} activeKey={activeTab} onChange={(key) => setActiveTab(key)} />
      </div>

      {activeTab === 'works' && <WorksTab profile={profile} />}
      {activeTab === 'activity' && <ActivityTab profile={profile} />}
      {activeTab === 'about' && <AboutTab profile={profile} />}
    </section>
  );
}