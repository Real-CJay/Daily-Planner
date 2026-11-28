import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { listRunningSessions } from '@/modules/running/repository';
import { listScheduleBlocks } from '@/modules/calendar/repository';
import { isMusicInstrument } from '@/modules/music/musicLog';
import { parseSleepMeta } from '@/modules/sleep/sleepLog';
import { extractReadingEntries } from '@/modules/reading/readingLog';
import { loadHealthStore } from '@/modules/health/healthEngine';
import type { RunningSession, ScheduleBlock } from '@/types/domain';

interface ModeCardItem {
  id: DomainId;
  title: string;
  to: string;
  stat: string;
}

export function ModesPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);
  const weekStart = useMemo(() => getMondayWeekStart(today), [today]);
  const weekEnd = useMemo(() => addDaysIso(weekStart, 6), [weekStart]);

  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);

  useEffect(() => {
    if (!user) return;
    void Promise.all([listRunningSessions(user.id), listScheduleBlocks(user.id)]).then(
      ([r, b]) => {
        setRuns(r);
        setBlocks(b);
      }
    );
  }, [user]);

  const stats = useMemo(() => {
    const weeklyKm = runs
      .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
      .reduce((acc, r) => acc + (r.distance_m || 0) / 1000, 0);

    const karateCount = blocks.filter((b) => b.category === 'KARATE' && !b.is_recurring).length;

    const musicMin = blocks
      .filter((b) => isMusicInstrument(b.category) && !b.is_recurring)
      .reduce((acc, b) => acc + (b.duration_min ?? 0), 0);

    const sleepLogs = blocks
      .map((b) => parseSleepMeta(b))
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(0, 7);
    const avgSleepH =
      sleepLogs.length > 0
        ? (sleepLogs.reduce((acc, s) => acc + s.totalMin, 0) / sleepLogs.length / 60).toFixed(1)
        : '0.0';

    const readingEntries = extractReadingEntries(blocks);
    const totalPages = readingEntries.reduce((acc, e) => acc + e.meta.pagesRead, 0);

    const healthStore = loadHealthStore(user?.id ?? 'guest');
    const healthDoneToday = (healthStore.checkedByDate[today] ?? []).length;
    const healthTotal = Math.max(3, healthStore.rules.length);

    return { weeklyKm, karateCount, musicMin, avgSleepH, totalPages, healthDoneToday, healthTotal };
  }, [runs, blocks, weekStart, weekEnd, user, today]);

  const cards: ModeCardItem[] = [
    { id: 'running', title: 'Running', to: '/runs', stat: `${stats.weeklyKm.toFixed(1)} km / wk` },
    { id: 'karate', title: 'Karate', to: '/karate', stat: `${stats.karateCount} sessions` },
    { id: 'music', title: 'Music', to: '/music', stat: `${stats.musicMin}m logged` },
    { id: 'sleep', title: 'Sleep', to: '/sleep', stat: `${stats.avgSleepH}h avg` },
    { id: 'reading', title: 'Reading', to: '/reading', stat: `${stats.totalPages} pages` },
    { id: 'health', title: 'Health', to: '/health', stat: `${stats.healthDoneToday}/${stats.healthTotal} rules` },
  ];

  return (
    <div className="animate-pop space-y-6">
      <h1 className={`font-display text-3xl font-extrabold tracking-tight sm:text-4xl ${T.text}`}>
        Choose your <span className={isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]'}>mode.</span>
      </h1>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const d = getDom(card.id, isDark);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => navigate(card.to)}
              className={`group flex cursor-pointer flex-col justify-between gap-7 rounded-3xl border p-6 text-left transition-all hover:-translate-y-0.5 active:scale-[0.99] ${T.card} ${T.surfaceHover}`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl border transition-transform group-hover:scale-105 ${d.soft} ${d.border} ${d.text}`}
                >
                  <DuoIcon name={card.id} className="h-11 w-11" />
                </div>
                <span
                  className={`rounded-xl border px-3 py-1 text-xs font-extrabold tabular-nums ${d.soft} ${d.border} ${d.text}`}
                >
                  {card.stat}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <h2 className={`font-display text-2xl font-extrabold ${T.text}`}>{card.title}</h2>
                <span className={`rounded-xl px-3.5 py-2 font-display text-xs font-bold transition-colors ${T.btnNeutral}`}>
                  Open →
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
