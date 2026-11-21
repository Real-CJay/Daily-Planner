import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Clock, X } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS, CategoryMark } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listScheduleBlocks, listScheduleCompletions } from '@/modules/calendar/repository';
import {
  DEFAULT_REMINDER_PREFERENCES,
  findDueReminders,
  formatReminderLeadText,
  getCurrentLocalMinutes,
  getUpcomingRemindersForToday,
  type DueReminder,
  type ReminderPreferences,
} from '@/modules/reminders/reminderEngine';
import {
  getBrowserNotificationPermission,
  loadFiredReminderKeys,
  loadReminderPreferences,
  playGentleChime,
  saveFiredReminderKeys,
  saveReminderPreferences,
} from '@/modules/reminders/storage';
import { ReminderPreferencesPanel } from '@/modules/reminders/ReminderPreferencesPanel';
import type { ScheduleBlock, ScheduleCompletion } from '@/types/domain';

export function SessionReminderManager() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [prefs, setPrefs] = useState<ReminderPreferences>(DEFAULT_REMINDER_PREFERENCES);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [activeToasts, setActiveToasts] = useState<DueReminder[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [nowMinutes, setNowMinutes] = useState<number>(() =>
    getCurrentLocalMinutes(new Date(), tz)
  );

  const firedKeysRef = useRef<Set<string>>(new Set());
  const snoozedUntilRef = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLElement | null>(null);

  // Load saved preferences & fired keys for today
  useEffect(() => {
    if (!user) return;
    setPrefs(loadReminderPreferences(user.id));
    firedKeysRef.current = loadFiredReminderKeys(user.id, today);
    setPermission(getBrowserNotificationPermission());
  }, [user, today]);

  // Listen for custom open-reminders event (from bell button or settings)
  useEffect(() => {
    const onOpen = () => setPanelOpen((prev) => !prev);
    const onPrefsChanged = (e: Event) => {
      const detail = (e as CustomEvent<ReminderPreferences>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener('stride:open-reminders', onOpen);
    window.addEventListener('stride:reminder-prefs-changed', onPrefsChanged);
    return () => {
      window.removeEventListener('stride:open-reminders', onOpen);
      window.removeEventListener('stride:reminder-prefs-changed', onPrefsChanged);
    };
  }, []);

  // Outside click & Escape close for the preferences popover (no background blur)
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [panelOpen]);

  // Sync today's schedule blocks & completions from Supabase
  const syncSchedule = useCallback(async () => {
    if (!user) return;
    try {
      const [blockRows, compRows] = await Promise.all([
        listScheduleBlocks(user.id),
        listScheduleCompletions(user.id, today, today).catch(() => [] as ScheduleCompletion[]),
      ]);
      setBlocks(blockRows);
      setCompletions(compRows);
    } catch {
      // Fail silently in background reminder poller
    }
  }, [user, today]);

  useEffect(() => {
    if (!user) return;
    void syncSchedule();
    const syncId = window.setInterval(() => {
      void syncSchedule();
    }, 3 * 60 * 1000);

    const onFocus = () => {
      setPermission(getBrowserNotificationPermission());
      void syncSchedule();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(syncId);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, syncSchedule]);

  const dispatchBrowserNotification = useCallback(
    (reminder: DueReminder) => {
      if (!prefs.browserNotifications) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (window.Notification.permission !== 'granted') return;

      try {
        const n = new window.Notification(
          `${reminder.title} · ${formatReminderLeadText(reminder.minutesUntilStart)}`,
          {
            body: `${CATEGORY_SHORT_LABELS[reminder.category]} scheduled at ${reminder.startTime}${
              reminder.durationMin ? ` (${reminder.durationMin} min)` : ''
            }.`,
            tag: reminder.reminderKey,
          }
        );
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Ignore OS notification dispatch errors
      }
    },
    [prefs.browserNotifications]
  );

  const checkDueReminders = useCallback(() => {
    if (!user) return;
    const currentMin = getCurrentLocalMinutes(new Date(), tz);
    setNowMinutes(currentMin);

    const due = findDueReminders({
      todayIso: today,
      nowMinutes: currentMin,
      blocks,
      completions,
      prefs,
      firedKeys: firedKeysRef.current,
      snoozedUntilMap: snoozedUntilRef.current,
    });

    if (due.length === 0) return;

    let firedAny = false;
    for (const item of due) {
      firedKeysRef.current.add(item.reminderKey);
      delete snoozedUntilRef.current[item.reminderKey];
      dispatchBrowserNotification(item);
      firedAny = true;
    }

    if (firedAny) {
      saveFiredReminderKeys(user.id, today, firedKeysRef.current);
      if (prefs.soundEnabled) {
        playGentleChime();
      }
      setActiveToasts((prev) => {
        const existingKeys = new Set(prev.map((p) => p.reminderKey));
        const additions = due.filter((d) => !existingKeys.has(d.reminderKey));
        return [...additions, ...prev].slice(0, 4);
      });
    }
  }, [user, tz, today, blocks, completions, prefs, dispatchBrowserNotification]);

  // Poll every 20s for due reminders
  useEffect(() => {
    if (!user) return;
    checkDueReminders();
    const tickId = window.setInterval(checkDueReminders, 20_000);
    return () => window.clearInterval(tickId);
  }, [user, checkDueReminders]);

  function handleUpdatePrefs(next: ReminderPreferences) {
    if (!user) return;
    setPrefs(next);
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
      const next = { ...prefs, browserNotifications: true };
      setPrefs(next);
      saveReminderPreferences(user.id, next);
    }
  }

  function handleSendTestAlert() {
    const testItem: DueReminder = {
      reminderKey: `test:${Date.now()}`,
      blockId: 'test',
      title: 'Vocal Practice (Test Reminder)',
      category: 'VOCAL',
      date: today,
      startTime: 'Now',
      durationMin: 30,
      minutesUntilStart: prefs.leadMinutes,
    };

    setActiveToasts((prev) => [testItem, ...prev.filter((t) => !t.reminderKey.startsWith('test:'))]);
    if (prefs.soundEnabled) {
      playGentleChime();
    }
    dispatchBrowserNotification(testItem);
  }

  function handleDismissToast(reminderKey: string) {
    setActiveToasts((prev) => prev.filter((t) => t.reminderKey !== reminderKey));
  }

  function handleSnoozeToast(item: DueReminder) {
    const currentMin = getCurrentLocalMinutes(new Date(), tz);
    snoozedUntilRef.current[item.reminderKey] = currentMin + 5;
    setActiveToasts((prev) => prev.filter((t) => t.reminderKey !== item.reminderKey));
  }

  const upcomingPreview = useMemo(
    () =>
      getUpcomingRemindersForToday({
        todayIso: today,
        nowMinutes,
        blocks,
        completions,
        prefs,
        firedKeys: firedKeysRef.current,
      }),
    [today, nowMinutes, blocks, completions, prefs]
  );

  if (!user) return null;

  return (
    <>
      {/* Top-Right In-App Reminder Toast Stack */}
      {activeToasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed right-4 top-[68px] z-50 flex w-[min(368px,calc(100vw-2rem))] flex-col gap-2.5"
        >
          {activeToasts.map((item) => {
            const catColor = CATEGORY_COLORS[item.category];
            return (
              <div
                key={item.reminderKey}
                style={{ borderLeftColor: catColor }}
                className="overflow-hidden rounded-2xl border border-[var(--line-strong)] border-l-[4px] bg-[var(--surface)] p-4 text-[var(--ink)] shadow-[0_18px_45px_rgba(0,0,0,0.18)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.55)]"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <CategoryMark category={item.category} size="sm" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-[var(--blue-lite)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--blue-ink)]">
                          {formatReminderLeadText(item.minutesUntilStart)}
                        </span>
                        <span className="font-mono text-[10.5px] text-[var(--muted)]">
                          {item.startTime}
                          {item.durationMin ? ` · ${item.durationMin}m` : ''}
                        </span>
                      </div>
                      <strong className="mt-1 block truncate text-[13.5px] font-bold text-[var(--ink)]">
                        {item.title}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDismissToast(item.reminderKey)}
                    aria-label="Dismiss reminder"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-2.5">
                  <button
                    type="button"
                    onClick={() => handleSnoozeToast(item)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)]"
                  >
                    <Clock className="h-3 w-3 text-[var(--muted)]" />
                    <span>Snooze 5m</span>
                  </button>

                  <Link
                    to="/calendar"
                    onClick={() => handleDismissToast(item.reminderKey)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--blue)] hover:underline"
                  >
                    <span>Open Calendar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Reminder Preferences Popover (no background blur) */}
      {panelOpen && (
        <section
          ref={panelRef}
          role="dialog"
          aria-label="Session Reminder Preferences"
          className="fixed bottom-[84px] right-4 z-50 flex max-h-[min(600px,calc(100vh-6.5rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_20px_60px_rgba(0,0,0,0.22)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] md:bottom-6 md:right-6"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--blue-lite)] text-[var(--blue)]">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <strong className="block text-[14px] font-bold text-[var(--ink)]">
                  Session Reminders
                </strong>
                <span className="block font-mono text-[10px] text-[var(--muted)]">
                  {prefs.enabled ? `Active · ${prefs.leadMinutes}m lead (${tz})` : 'Paused'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="Close reminder preferences"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ReminderPreferencesPanel
              prefs={prefs}
              permission={permission}
              upcoming={upcomingPreview}
              onUpdatePrefs={handleUpdatePrefs}
              onRequestBrowserPermission={handleRequestBrowserPermission}
              onSendTestAlert={handleSendTestAlert}
            />
          </div>
        </section>
      )}
    </>
  );
}
