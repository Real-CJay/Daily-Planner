import {
  ALL_REMINDER_CATEGORIES,
  DEFAULT_REMINDER_PREFERENCES,
  LEAD_TIME_OPTIONS,
  type ReminderLeadMinutes,
  type ReminderPreferences,
} from './reminderEngine';
import type { ActivityCategory } from '@/types/domain';

function prefsKey(userId: string): string {
  return `stride:reminder-prefs:${userId}`;
}

function firedKey(userId: string, todayIso: string): string {
  return `stride:reminders-fired:${userId}:${todayIso}`;
}

export function loadReminderPreferences(userId: string): ReminderPreferences {
  try {
    const raw = window.localStorage.getItem(prefsKey(userId));
    if (!raw) return { ...DEFAULT_REMINDER_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<ReminderPreferences>;

    const lead = LEAD_TIME_OPTIONS.includes(parsed.leadMinutes as ReminderLeadMinutes)
      ? (parsed.leadMinutes as ReminderLeadMinutes)
      : DEFAULT_REMINDER_PREFERENCES.leadMinutes;

    const validCats = Array.isArray(parsed.enabledCategories)
      ? parsed.enabledCategories.filter((c): c is ActivityCategory =>
          ALL_REMINDER_CATEGORIES.includes(c as ActivityCategory)
        )
      : [...ALL_REMINDER_CATEGORIES];

    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      browserNotifications:
        typeof parsed.browserNotifications === 'boolean' ? parsed.browserNotifications : false,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      leadMinutes: lead,
      enabledCategories: validCats,
    };
  } catch {
    return { ...DEFAULT_REMINDER_PREFERENCES };
  }
}

export function saveReminderPreferences(userId: string, prefs: ReminderPreferences): void {
  try {
    window.localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent('stride:reminder-prefs-changed', { detail: prefs }));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFiredReminderKeys(userId: string, todayIso: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(firedKey(userId, todayIso));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function saveFiredReminderKeys(
  userId: string,
  todayIso: string,
  keys: Set<string>
): void {
  try {
    window.localStorage.setItem(firedKey(userId, todayIso), JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage quota errors
  }
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export function playGentleChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [587.33, 880]; // Soft D5 -> A5 fifth
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.45);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Ignore autoplay-blocked audio context
  }
}
