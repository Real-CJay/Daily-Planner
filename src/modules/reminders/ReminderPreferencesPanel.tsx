import { Bell, BellRing, Check, Clock, Volume2, VolumeX } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS, CategoryMark } from '@/design-system';
import type { ActivityCategory } from '@/types/domain';
import {
  ALL_REMINDER_CATEGORIES,
  formatMinutesTo12h,
  LEAD_TIME_OPTIONS,
  type ReminderPreferences,
  type UpcomingReminderPreview,
} from './reminderEngine';

export function ReminderPreferencesPanel({
  prefs,
  permission,
  upcoming,
  onUpdatePrefs,
  onRequestBrowserPermission,
  onSendTestAlert,
}: {
  prefs: ReminderPreferences;
  permission: NotificationPermission | 'unsupported';
  upcoming: UpcomingReminderPreview[];
  onUpdatePrefs: (next: ReminderPreferences) => void;
  onRequestBrowserPermission: () => Promise<void>;
  onSendTestAlert: () => void;
}) {
  function toggleCategory(cat: ActivityCategory) {
    const exists = prefs.enabledCategories.includes(cat);
    const nextCats = exists
      ? prefs.enabledCategories.filter((c) => c !== cat)
      : [...prefs.enabledCategories, cat];
    onUpdatePrefs({ ...prefs, enabledCategories: nextCats });
  }

  return (
    <div className="space-y-4">
      {/* Master & Sound Toggles */}
      <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[13px] font-bold text-[var(--ink)]">In-app reminders</div>
            <p className="text-[11.5px] text-[var(--muted)]">
              Show a Stride alert banner before timed sessions start.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            onClick={() => onUpdatePrefs({ ...prefs, enabled: !prefs.enabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              prefs.enabled ? 'bg-[var(--blue)]' : 'bg-[var(--surface-3)]'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                prefs.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink)]">
              <span>Browser desktop alerts</span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase ${
                  permission === 'granted'
                    ? 'bg-[#2D9D87]/15 text-[#2D9D87]'
                    : permission === 'denied'
                      ? 'bg-red-500/12 text-red-600 dark:text-red-400'
                      : 'bg-[var(--surface-2)] text-[var(--muted)]'
                }`}
              >
                {permission === 'granted'
                  ? 'Allowed'
                  : permission === 'denied'
                    ? 'Blocked'
                    : permission === 'unsupported'
                      ? 'Unsupported'
                      : 'Off'}
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--muted)]">
              {permission === 'denied'
                ? 'Blocked in browser site settings. Allow notifications for this site to enable.'
                : 'Send native OS popups even when Stride is in a background tab.'}
            </p>
          </div>

          {permission === 'granted' ? (
            <button
              type="button"
              role="switch"
              aria-checked={prefs.browserNotifications}
              onClick={() =>
                onUpdatePrefs({
                  ...prefs,
                  browserNotifications: !prefs.browserNotifications,
                })
              }
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                prefs.browserNotifications ? 'bg-[var(--blue)]' : 'bg-[var(--surface-3)]'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  prefs.browserNotifications ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              disabled={permission === 'denied' || permission === 'unsupported'}
              onClick={() => void onRequestBrowserPermission()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-[var(--blue)] px-3 text-[11.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-[#121315]"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Enable</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {prefs.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-[var(--blue)]" />
            ) : (
              <VolumeX className="h-4 w-4 text-[var(--muted)]" />
            )}
            <div>
              <div className="text-[13px] font-bold text-[var(--ink)]">Soft chime sound</div>
              <p className="text-[11.5px] text-[var(--muted)]">
                Play a gentle two-note bell when a reminder triggers.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.soundEnabled}
            onClick={() => onUpdatePrefs({ ...prefs, soundEnabled: !prefs.soundEnabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              prefs.soundEnabled ? 'bg-[var(--blue)]' : 'bg-[var(--surface-3)]'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                prefs.soundEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Lead Time Picker */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            Notify before session
          </span>
          <button
            type="button"
            onClick={onSendTestAlert}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <BellRing className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>Send test alert</span>
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {LEAD_TIME_OPTIONS.map((mins) => {
            const active = prefs.leadMinutes === mins;
            return (
              <button
                key={mins}
                type="button"
                onClick={() => onUpdatePrefs({ ...prefs, leadMinutes: mins })}
                className={`rounded-xl border py-2 font-mono text-[12px] font-bold transition-colors ${
                  active
                    ? 'border-[var(--blue)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
                    : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {mins} min
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity Category Filter */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            Remind me for
          </span>
          <span className="font-mono text-[10.5px] text-[var(--faint)]">
            {prefs.enabledCategories.length}/{ALL_REMINDER_CATEGORIES.length} active
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_REMINDER_CATEGORIES.map((cat) => {
            const active = prefs.enabledCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  active
                    ? 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]'
                    : 'border-[var(--line)] bg-[var(--bg)] text-[var(--faint)] opacity-60 hover:opacity-90'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span>{CATEGORY_SHORT_LABELS[cat]}</span>
                {active && <Check className="h-3 w-3 text-[var(--blue)]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming Today Queue Preview */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            <Clock className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>Upcoming today</span>
          </span>
          <span className="font-mono text-[10.5px] text-[var(--faint)]">
            {upcoming.length} scheduled
          </span>
        </div>

        {upcoming.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            No remaining timed sessions left for today.
          </p>
        ) : (
          <div className="mt-2.5 divide-y divide-[var(--line)]">
            {upcoming.slice(0, 4).map((item) => (
              <div
                key={item.reminderKey}
                className="flex items-center justify-between gap-2.5 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <CategoryMark category={item.category} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[var(--ink)]">
                      {item.title}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--muted)]">
                      Starts {formatMinutesTo12h(item.startMin)} · Alert{' '}
                      {formatMinutesTo12h(item.reminderAtMin)}
                    </div>
                  </div>
                </div>
                {item.isFired && (
                  <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[var(--muted)]">
                    Sent
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
