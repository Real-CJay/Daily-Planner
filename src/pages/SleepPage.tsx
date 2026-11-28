import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString } from '@/lib/datetime';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { createScheduleBlock, listScheduleBlocks } from '@/modules/calendar/repository';
import {
  buildSleepBlockDraft,
  calculateSleepDurationMin,
  extractSleepEntries,
  type SleepLogEntry,
  type SleepQualityLabel,
} from '@/modules/sleep/sleepLog';

const QUALITY_MAP: Record<number, SleepQualityLabel> = {
  1: 'Poor',
  2: 'Fair',
  3: 'General',
  4: 'Good',
  5: 'Excellent',
};

function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
}

export function SleepPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('sleep', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const [bedtime, setBedtime] = useState('22:45');
  const [waketime, setWaketime] = useState('06:15');
  const [quality, setQuality] = useState(4);
  const [logDate, setLogDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<SleepLogEntry[]>([]);

  const loadSleep = useCallback(async () => {
    if (!user) return;
    const blocks = await listScheduleBlocks(user.id);
    setEntries(extractSleepEntries(blocks));
  }, [user]);

  useEffect(() => {
    void loadSleep();
  }, [loadSleep]);

  const calcMin = calculateSleepDurationMin(bedtime, waketime);
  const calcHrs = Number((calcMin / 60).toFixed(1));

  const last7Days = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of entries) {
      if (!byDate.has(e.date)) {
        byDate.set(e.date, Number((e.meta.totalMin / 60).toFixed(1)));
      }
    }
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(today, i - 6);
      return {
        iso,
        day: fmtDayShort(iso),
        hours: byDate.get(iso) ?? 0,
      };
    });
  }, [entries, today]);

  async function handleSaveNight() {
    if (!user || saving) return;
    setSaving(true);
    try {
      const draft = buildSleepBlockDraft(logDate, {
        bedTime: bedtime,
        wakeTime: waketime,
        totalMin: calcMin,
        sleepScore: quality * 20,
        quality: QUALITY_MAP[quality] ?? 'Good',
        deepMin: null,
        lightMin: null,
        remMin: null,
        awakeMin: null,
        napMin: null,
        awakeCount: null,
        notes: null,
      });
      await createScheduleBlock(user.id, { ...draft, status: 'COMPLETED' });
      triggerConfetti();
      pushToast(`Saved ${calcHrs}h sleep`, '#4F46E5');
      await loadSleep();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-pop space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/modes')}
          className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnWhite}`}
        >
          ← All Modes
        </button>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dom.soft} ${dom.border} ${dom.text}`}
          >
            <DuoIcon name="sleep" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Sleep</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Log Sleep Card */}
        <div className={`space-y-5 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-display text-xl font-extrabold ${T.text}`}>Log Sleep</h2>
            <span
              className={`rounded-xl px-3 py-1 font-display text-base font-extrabold tabular-nums ${dom.soft} ${dom.text}`}
            >
              {calcHrs}h
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Bedtime</label>
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2.5 font-display font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Wake</label>
              <input
                type="time"
                value={waketime}
                onChange={(e) => setWaketime(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2.5 font-display font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
          </div>

          <div>
            <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Date</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs font-bold tabular-nums focus:outline-none ${T.input}`}
            />
          </div>

          <div>
            <span className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Quality (1–5)</span>
            <div className="mt-1.5 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`cursor-pointer rounded-xl border py-2.5 font-display text-sm font-extrabold transition-all active:scale-[0.98] ${
                    quality === q
                      ? `${dom.bg} border-transparent text-white`
                      : `${T.cardSubtle} ${T.muted}`
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveNight()}
            className={`w-full cursor-pointer rounded-xl py-3 font-display text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 ${dom.bg} ${dom.hover}`}
          >
            {saving ? 'Saving...' : 'Save Night'}
          </button>
        </div>

        {/* 7-Day Sleep Chart */}
        <div className={`space-y-4 rounded-3xl border p-6 lg:col-span-7 ${T.card}`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-display text-lg font-extrabold ${T.text}`}>7-Day Sleep</h3>
            <span className={`rounded-xl px-2.5 py-1 text-xs font-extrabold ${dom.soft} ${dom.text}`}>
              Target 8h
            </span>
          </div>

          <div className="grid h-52 grid-cols-7 items-end gap-3 pt-6">
            {last7Days.map((entry) => {
              const hPx = entry.hours > 0 ? Math.max(18, Math.round((Math.min(10, entry.hours) / 10) * 165)) : 8;
              return (
                <div key={entry.iso} className="flex flex-col items-center gap-1.5">
                  <span className={`text-[11px] font-extrabold tabular-nums ${entry.hours > 0 ? T.text : T.muted}`}>
                    {entry.hours > 0 ? `${entry.hours}h` : '–'}
                  </span>
                  <div
                    className={`w-full max-w-[40px] rounded-xl transition-all ${
                      entry.hours >= 8
                        ? 'bg-[#10B981]'
                        : entry.hours > 0
                          ? 'bg-[#6366F1]'
                          : isDark
                            ? 'bg-[#222222]'
                            : 'bg-[#E5E7EB]'
                    }`}
                    style={{ height: `${hPx}px` }}
                  />
                  <span className={`text-[11px] font-bold ${T.muted}`}>{entry.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
