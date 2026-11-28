import { useEffect, useMemo, useState } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { parseDurationToSeconds } from '@/modules/running/calculations';
import { listRunningSessions } from '@/modules/running/repository';
import { listScheduleBlocks } from '@/modules/calendar/repository';
import { listHabitLogs } from '@/modules/habits/repository';
import {
  loadRitualConfig,
  saveRitualConfig,
  type RitualConfig,
} from '@/modules/rituals/ritualStorage';
import {
  loadReminderPreferences,
  saveReminderPreferences,
} from '@/modules/reminders/storage';
import { TRAINING_PHASE_LABELS, type TrainingPhase } from '@/types/domain';

const PHASES: TrainingPhase[] = [
  'REBUILDING',
  'BUILDING_CONSISTENCY',
  'PERFORMANCE_DEVELOPMENT',
  'GOAL_SPECIFIC_5K',
];

function fmtSecMMSS(sec: number | null | undefined, fallback: string): string {
  if (!sec || sec <= 0) return fallback;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const runDom = getDom('running', isDark);
  const karateDom = getDom('karate', isDark);
  const sleepDom = getDom('sleep', isDark);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [phase, setPhase] = useState<TrainingPhase>(profile?.current_phase ?? 'REBUILDING');
  const [firstFiveKTarget, setFirstFiveKTarget] = useState(
    fmtSecMMSS(profile?.first_major_5k_goal_s, '19:59')
  );
  const [longTermFiveKTarget, setLongTermFiveKTarget] = useState(
    fmtSecMMSS(profile?.long_term_5k_goal_s, '17:30')
  );
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'Asia/Colombo');
  const [ritualConfig, setRitualConfig] = useState<RitualConfig>(() =>
    loadRitualConfig(user?.id ?? 'guest')
  );
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setPhase(profile.current_phase);
      setFirstFiveKTarget(fmtSecMMSS(profile.first_major_5k_goal_s, '19:59'));
      setLongTermFiveKTarget(fmtSecMMSS(profile.long_term_5k_goal_s, '17:30'));
      setTimezone(profile.timezone || 'Asia/Colombo');
    }
  }, [profile]);

  useEffect(() => {
    if (user) {
      setRitualConfig(loadRitualConfig(user.id));
      const prefs = loadReminderPreferences(user.id);
      setRemindersEnabled(prefs.enabled);
    }
  }, [user]);

  async function saveProfilePatch(patch: Record<string, unknown>, toastLabel: string) {
    if (!user || !supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(patch)
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      pushToast(toastLabel, '#2563EB');
    } catch {
      pushToast('Failed to update settings', '#E11D48');
    } finally {
      setSaving(false);
    }
  }

  function updateRitualLabel(period: 'morning' | 'evening', idx: 0 | 1 | 2, value: string) {
    setRitualConfig((prev) => {
      const copy = [...prev[period]] as RitualConfig['morning'];
      copy[idx] = { ...copy[idx], label: value };
      return { ...prev, [period]: copy };
    });
  }

  async function handleSaveAll() {
    if (!user) return;
    const firstSec = parseDurationToSeconds(firstFiveKTarget);
    const longSec = parseDurationToSeconds(longTermFiveKTarget);
    if (!firstSec || firstSec <= 0 || !longSec || longSec <= 0) {
      pushToast('Enter 5K goals as MM:SS (e.g. 19:59 and 17:30)', '#EA580C');
      return;
    }

    const cleanedRituals: RitualConfig = {
      morning: [
        { ...ritualConfig.morning[0], label: ritualConfig.morning[0].label.trim() || 'Hydrate' },
        { ...ritualConfig.morning[1], label: ritualConfig.morning[1].label.trim() || 'Sunlight' },
        { ...ritualConfig.morning[2], label: ritualConfig.morning[2].label.trim() || 'Top Block' },
      ],
      evening: [
        { ...ritualConfig.evening[0], label: ritualConfig.evening[0].label.trim() || 'Prep Gear' },
        { ...ritualConfig.evening[1], label: ritualConfig.evening[1].label.trim() || 'Phone Out' },
        { ...ritualConfig.evening[2], label: ritualConfig.evening[2].label.trim() || 'Lock Start' },
      ],
    };

    saveRitualConfig(user.id, cleanedRituals);
    setRitualConfig(cleanedRituals);

    await saveProfilePatch(
      {
        display_name: displayName.trim() || null,
        first_major_5k_goal_s: firstSec,
        long_term_5k_goal_s: longSec,
        timezone: timezone.trim() || 'Asia/Colombo',
      },
      'Settings & goals saved'
    );
  }

  function handleToggleReminders() {
    if (!user) return;
    const current = loadReminderPreferences(user.id);
    const next = { ...current, enabled: !remindersEnabled };
    saveReminderPreferences(user.id, next);
    setRemindersEnabled(next.enabled);
    pushToast(next.enabled ? 'Reminders enabled' : 'Reminders paused', '#2563EB');
  }

  async function handleExportBackup() {
    if (!user) return;
    try {
      const [blocks, runs, habits] = await Promise.all([
        listScheduleBlocks(user.id),
        listRunningSessions(user.id),
        listHabitLogs(user.id),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        profile,
        ritualConfig,
        blocks,
        runs,
        habits,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stride-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      pushToast('Exported stride-backup.json', '#2563EB');
    } catch {
      pushToast('Export failed', '#E11D48');
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-pop space-y-6">
      <h1 className={`font-display text-3xl font-extrabold tracking-tight ${T.text}`}>Settings</h1>

      <div className={`space-y-6 rounded-3xl border p-6 ${T.card}`}>
        {/* Appearance */}
        <div className={`flex items-center justify-between rounded-2xl border p-4 ${T.cardSubtle}`}>
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                isDark ? 'bg-[#FBBF24]/15 text-[#FBBF24]' : 'bg-[#EEF2FF] text-[#4F46E5]'
              }`}
            >
              <DuoIcon name={isDark ? 'moon' : 'sun'} className="h-5 w-5" />
            </span>
            <div>
              <div className={`font-display text-sm font-extrabold ${T.text}`}>Appearance</div>
              <span className={`text-xs font-bold ${T.muted}`}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold ${T.btnPrimary}`}
          >
            Switch to {isDark ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Training Phase */}
        <div className="space-y-2.5">
          <span className={`text-xs font-extrabold uppercase tracking-wider ${T.muted}`}>
            Training Phase
          </span>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {PHASES.map((p) => (
              <button
                key={p}
                type="button"
                disabled={saving}
                onClick={() => {
                  setPhase(p);
                  void saveProfilePatch({ current_phase: p }, TRAINING_PHASE_LABELS[p]);
                }}
                className={`cursor-pointer rounded-2xl border p-3.5 text-left font-display text-xs font-extrabold transition-all active:scale-[0.98] ${
                  phase === p
                    ? `${runDom.soft} ${runDom.border} ${runDom.text}`
                    : `${T.cardSubtle} ${T.text}`
                }`}
              >
                {TRAINING_PHASE_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Running 5K Goals */}
        <div className="space-y-2.5">
          <span className={`text-xs font-extrabold uppercase tracking-wider ${runDom.text}`}>
            Running Goals (Shown on Overview & Running)
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`space-y-1.5 rounded-2xl border p-4 ${T.cardSubtle}`}>
              <span className={`block text-[11px] font-extrabold uppercase ${T.muted}`}>
                First 5K Milestone (MM:SS)
              </span>
              <input
                type="text"
                value={firstFiveKTarget}
                onChange={(e) => setFirstFiveKTarget(e.target.value)}
                placeholder="19:59"
                className={`w-full rounded-xl border px-3 py-2 font-display text-base font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>

            <div className={`space-y-1.5 rounded-2xl border p-4 ${T.cardSubtle}`}>
              <span className={`block text-[11px] font-extrabold uppercase ${T.muted}`}>
                Long-Term 5K Goal (MM:SS)
              </span>
              <input
                type="text"
                value={longTermFiveKTarget}
                onChange={(e) => setLongTermFiveKTarget(e.target.value)}
                placeholder="17:30"
                className={`w-full rounded-xl border px-3 py-2 font-display text-base font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
          </div>
        </div>

        {/* Morning Launch & Evening Shutdown Rituals */}
        <div className="space-y-4">
          <div className="space-y-2">
            <span className={`text-xs font-extrabold uppercase tracking-wider ${karateDom.text}`}>
              Morning Launch (3 items)
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {([0, 1, 2] as const).map((idx) => (
                <div
                  key={ritualConfig.morning[idx].id}
                  className={`flex items-center gap-2 rounded-2xl border p-2.5 ${T.cardSubtle}`}
                >
                  <span className={`shrink-0 ${karateDom.text}`}>
                    <DuoIcon name={ritualConfig.morning[idx].icon} className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={ritualConfig.morning[idx].label}
                    onChange={(e) => updateRitualLabel('morning', idx, e.target.value)}
                    className={`w-full rounded-lg border px-2 py-1.5 font-display text-xs font-bold focus:outline-none ${T.input}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className={`text-xs font-extrabold uppercase tracking-wider ${sleepDom.text}`}>
              Evening Shutdown (3 items)
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {([0, 1, 2] as const).map((idx) => (
                <div
                  key={ritualConfig.evening[idx].id}
                  className={`flex items-center gap-2 rounded-2xl border p-2.5 ${T.cardSubtle}`}
                >
                  <span className={`shrink-0 ${sleepDom.text}`}>
                    <DuoIcon name={ritualConfig.evening[idx].icon} className="h-5 w-5" />
                  </span>
                  <input
                    type="text"
                    value={ritualConfig.evening[idx].label}
                    onChange={(e) => updateRitualLabel('evening', idx, e.target.value)}
                    className={`w-full rounded-lg border px-2 py-1.5 font-display text-xs font-bold focus:outline-none ${T.input}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Profile & Timezone */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={`space-y-1.5 rounded-2xl border p-4 ${T.cardSubtle}`}>
            <span className={`block text-[11px] font-extrabold uppercase ${T.muted}`}>Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Athlete"
              className={`w-full rounded-xl border px-3 py-1.5 font-display text-sm font-bold focus:outline-none ${T.input}`}
            />
          </div>

          <div className={`space-y-1.5 rounded-2xl border p-4 ${T.cardSubtle}`}>
            <span className={`block text-[11px] font-extrabold uppercase ${T.muted}`}>Timezone</span>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={`w-full rounded-xl border px-3 py-1.5 text-xs font-bold focus:outline-none ${T.input}`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggleReminders}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
          >
            Reminders: {remindersEnabled ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAll()}
            className={`cursor-pointer rounded-xl px-5 py-2.5 font-display text-xs font-bold disabled:opacity-50 ${T.btnSuccess}`}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Export / Sign Out */}
        <div className={`flex flex-wrap items-center justify-between gap-2 border-t pt-4 ${T.divider}`}>
          <span className={`text-xs font-bold ${T.muted}`}>Synced with Supabase</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportBackup()}
              className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold ${T.btnNeutral}`}
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold ${T.btnDangerSoft}`}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
