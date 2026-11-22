import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Info } from 'lucide-react';
import { getLocalDateString } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/modules/auth/AuthContext';
import { listScheduleBlocks, listScheduleCompletions } from '@/modules/calendar/repository';
import {
  DEFAULT_REMINDER_PREFERENCES,
  getCurrentLocalMinutes,
  getUpcomingRemindersForToday,
  type ReminderPreferences,
} from '@/modules/reminders/reminderEngine';
import {
  getBrowserNotificationPermission,
  loadFiredReminderKeys,
  loadReminderPreferences,
  playGentleChime,
  saveReminderPreferences,
} from '@/modules/reminders/storage';
import { ReminderPreferencesPanel } from '@/modules/reminders/ReminderPreferencesPanel';
import type { ScheduleBlock, ScheduleCompletion } from '@/types/domain';

export function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [preferredModel, setPreferredModel] = useState('gemini-4-hydrogen');
  const [consentAck, setConsentAck] = useState(false);
  const [shareNotes, setShareNotes] = useState(true);
  const [shareRecovery, setShareRecovery] = useState(true);
  const [shareKarate, setShareKarate] = useState(true);
  const [shareCommitments, setShareCommitments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Embedded Session Reminder state
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPreferences>(
    DEFAULT_REMINDER_PREFERENCES
  );
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setTimezone(profile.timezone);
    setAiEnabled(profile.ai_enabled);
    setPreferredModel(profile.ai_preferred_model);
    setConsentAck(profile.ai_privacy_consent_acknowledged);
    setShareNotes(profile.ai_share_notes);
    setShareRecovery(profile.ai_share_recovery);
    setShareKarate(profile.ai_share_karate);
    setShareCommitments(profile.ai_share_commitments);
  }, [profile]);

  const loadReminderContext = useCallback(async () => {
    if (!user) return;
    setReminderPrefs(loadReminderPreferences(user.id));
    setPermission(getBrowserNotificationPermission());
    try {
      const [bRows, cRows] = await Promise.all([
        listScheduleBlocks(user.id),
        listScheduleCompletions(user.id, today, today).catch(() => [] as ScheduleCompletion[]),
      ]);
      setBlocks(bRows);
      setCompletions(cRows);
    } catch {
      // Ignore background fetch errors
    }
  }, [user, today]);

  useEffect(() => {
    void loadReminderContext();
  }, [loadReminderContext]);

  const upcomingPreview = useMemo(() => {
    if (!user) return [];
    return getUpcomingRemindersForToday({
      todayIso: today,
      nowMinutes: getCurrentLocalMinutes(new Date(), tz),
      blocks,
      completions,
      prefs: reminderPrefs,
      firedKeys: loadFiredReminderKeys(user.id, today),
    });
  }, [user, today, tz, blocks, completions, reminderPrefs]);

  function handleUpdateReminderPrefs(next: ReminderPreferences) {
    if (!user) return;
    setReminderPrefs(next);
    saveReminderPreferences(user.id, next);
  }

  async function handleRequestBrowserPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    const result = await window.Notification.requestPermission();
    setPermission(result);
    if (result === 'granted' && user) {
      const next = { ...reminderPrefs, browserNotifications: true };
      setReminderPrefs(next);
      saveReminderPreferences(user.id, next);
    }
  }

  function handleSendTestAlert() {
    if (reminderPrefs.soundEnabled) playGentleChime();
    if (
      reminderPrefs.browserNotifications &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted'
    ) {
      new window.Notification('Stride Reminder Test', {
        body: `Alerts are set for ${reminderPrefs.leadMinutes} min before timed sessions.`,
      });
    }
    setMessage('Test reminder alert dispatched.');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    if (aiEnabled && !consentAck) {
      setError('Please acknowledge the free-tier Gemini privacy disclosure before enabling AI.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        display_name: displayName.trim() || null,
        timezone: timezone.trim() || 'Asia/Colombo',
        ai_enabled: aiEnabled,
        ai_preferred_model: preferredModel.trim() || 'gemini-4-hydrogen',
        ai_privacy_consent_acknowledged: consentAck,
        ai_share_notes: shareNotes,
        ai_share_recovery: shareRecovery,
        ai_share_karate: shareKarate,
        ai_share_commitments: shareCommitments,
      })
      .eq('user_id', user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await refreshProfile();
    setMessage('Settings saved to Supabase.');
  }

  const inputClass =
    'mt-2 block w-full min-h-[42px] rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] font-medium text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none';

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header (Common Default Stride Blue) */}
      <header>
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Your space, <em className="not-italic text-[var(--blue)]">your rules.</em>
        </h1>
      </header>

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-[var(--blue)]/30 bg-[var(--blue-lite)] px-4 py-3 text-xs font-semibold text-[var(--blue-ink)]">
          {message}
        </div>
      )}

      {/* Studio 2-Column Layout */}
      <form
        onSubmit={(e) => void handleSave(e)}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
      >
        {/* Left Column: Profile + Reminders */}
        <div className="space-y-5">
          <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Personal preferences
            </h2>
            

            <div className="mt-5 space-y-4">
              <label className="block text-[12px] font-semibold text-[var(--ink)]">
                Display name
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                />
              </label>

              <label className="block text-[12px] font-semibold text-[var(--ink)]">
                Timezone
                <input
                  id="timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </label>
            </div>

            <p className="mt-5 text-[12px] leading-relaxed text-[var(--muted)]">
              Calendar weeks begin on Monday and sync across Overview, Analytics, and Reviews.
            </p>
          </section>

          <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Session reminders
            </h2>
            
            <ReminderPreferencesPanel
              prefs={reminderPrefs}
              permission={permission}
              upcoming={upcomingPreview}
              onUpdatePrefs={handleUpdateReminderPrefs}
              onRequestBrowserPermission={handleRequestBrowserPermission}
              onSendTestAlert={handleSendTestAlert}
            />
          </section>
        </div>

        {/* Right Column: AI & Privacy */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                AI &amp; privacy
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                AI is optional. Your logs, calendar, and plans remain fully usable without it.
              </p>
            </div>
            <span className="rounded-[6px] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
              {aiEnabled ? 'ENABLED' : 'OPTIONAL'}
            </span>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[12px] leading-relaxed text-[var(--muted)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#bc9346]" />
            <span>
              Google Gemini Developer API free-tier terms may permit submitted prompts and
              screenshots to be used for product improvement. Requests never silently route to paid
              endpoints.
            </span>
          </div>

          <div className="mt-5 space-y-3.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--ink)]">
              <input
                type="checkbox"
                checked={consentAck}
                onChange={(e) => setConsentAck(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--blue)]"
              />
              <span>I understand and acknowledge the provider data-handling notice.</span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] font-semibold leading-relaxed text-[var(--ink)]">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={(e) => setAiEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--blue)]"
              />
              <span>Enable Gemini AI features (screenshot extraction, run analysis, AI coach)</span>
            </label>
          </div>

          <label className="mt-6 block text-[12px] font-semibold text-[var(--ink)]">
            Preferred Gemini model
            <input
              id="preferredModel"
              type="text"
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              className={`${inputClass} font-mono`}
            />
            <small className="mt-1.5 block text-[11px] font-normal text-[var(--muted)]">
              Server-side model preference used by your AI Coach and weekly review endpoints.
            </small>
          </label>

          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
              INFORMATION YOU ALLOW THE AI TO SEE
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {[
                { label: 'Session notes', checked: shareNotes, set: setShareNotes },
                { label: 'Readiness check-ins', checked: shareRecovery, set: setShareRecovery },
                { label: 'Karate sessions', checked: shareKarate, set: setShareKarate },
                { label: 'Schedule commitments', checked: shareCommitments, set: setShareCommitments },
              ].map((item) => (
                <label
                  key={item.label}
                  className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-[var(--ink)]"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[var(--blue)]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <small className="text-[11px] text-[var(--muted)]">
              API keys remain server-side only.
            </small>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[41px] items-center gap-2 rounded-[9px] bg-[var(--blue)] px-5 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{saving ? 'Saving...' : 'Save settings'}</span>
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
