import { useCallback, useEffect, useMemo, useState } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString } from '@/lib/datetime';
import { listPersonalBests, upsertPersonalBest } from '@/modules/analytics/repository';
import { listRunningSessions } from '@/modules/running/repository';
import { parseDurationToSeconds } from '@/modules/running/calculations';
import { listHabitLogs } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import type { BenchmarkDistance, HabitLog, PersonalBest, RunningSession } from '@/types/domain';

interface DistanceConfig {
  label: BenchmarkDistance;
  title: string;
  meters: number;
  domId: DomainId;
}

const DISTANCES: DistanceConfig[] = [
  { label: '5K', title: '5K PR', meters: 5000, domId: 'running' },
  { label: '10K', title: '10K PR', meters: 10000, domId: 'strength' },
  { label: '3K', title: '3K PR', meters: 3000, domId: 'karate' },
  { label: '1K', title: '1K PR', meters: 1000, domId: 'reading' },
];

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(meters: number, sec: number | null): string {
  if (!sec || sec <= 0 || meters <= 0) return 'Not set';
  const perKm = (sec / meters) * 1000;
  const m = Math.floor(perKm / 60);
  const s = Math.round(perKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function PersonalBestsPage() {
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const [bests, setBests] = useState<PersonalBest[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [habits, setHabits] = useState<HabitLog[]>([]);
  const [draftValues, setDraftValues] = useState<Record<BenchmarkDistance, string>>({
    '1K': '',
    '3K': '',
    '5K': '',
    '10K': '',
  });
  const [savingDist, setSavingDist] = useState<BenchmarkDistance | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [pbList, runList, habitList] = await Promise.all([
      listPersonalBests(user.id),
      listRunningSessions(user.id),
      listHabitLogs(user.id, PORN_FREE_HABIT_KEY),
    ]);
    setBests(pbList);
    setRuns(runList);
    setHabits(habitList);

    const nextDrafts: Record<BenchmarkDistance, string> = {
      '1K': '',
      '3K': '',
      '5K': '',
      '10K': '',
    };
    for (const d of DISTANCES) {
      const saved = pbList.find((p) => p.distance_label === d.label);
      if (saved) {
        nextDrafts[d.label] = fmtDuration(saved.duration_s);
      } else {
        const matchingRuns = runList.filter(
          (r) => r.distance_m >= d.meters * 0.96 && r.distance_m <= d.meters * 1.05 && r.duration_s > 0
        );
        if (matchingRuns.length > 0) {
          const fastest = Math.min(...matchingRuns.map((r) => r.duration_s));
          nextDrafts[d.label] = fmtDuration(fastest);
        }
      }
    }
    setDraftValues(nextDrafts);
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSavePB(cfg: DistanceConfig) {
    if (!user) return;
    const raw = draftValues[cfg.label].trim();
    const parsedSec = parseDurationToSeconds(raw);
    if (!parsedSec || parsedSec <= 0) {
      pushToast('Enter time as MM:SS (e.g. 21:40)', '#EA580C');
      return;
    }
    setSavingDist(cfg.label);
    try {
      await upsertPersonalBest(user.id, {
        distance_label: cfg.label,
        distance_m: cfg.meters,
        duration_s: parsedSec,
        achieved_date: today,
        session_id: null,
        notes: 'Saved in Personal Bests',
      });
      triggerConfetti();
      pushToast(`${cfg.title} updated to ${fmtDuration(parsedSec)}`, '#10B981');
      await loadData();
    } finally {
      setSavingDist(null);
    }
  }

  const pornFree = useMemo(
    () => calculateHabitStreak(PORN_FREE_HABIT_KEY, habits, today),
    [habits, today]
  );

  const longestRunKm = useMemo(() => {
    if (runs.length === 0) return 0;
    return Math.max(...runs.map((r) => r.distance_m / 1000));
  }, [runs]);

  return (
    <div className="animate-pop space-y-6">
      <div>
        <h1 className={`font-display text-3xl font-extrabold tracking-tight ${T.text}`}>
          Personal Bests
        </h1>
        <p className={`mt-1 text-xs font-semibold ${T.muted}`}>
          Tap any time (MM:SS) and press Save to update your official benchmark.
        </p>
      </div>

      {/* 4 V2 Trophy Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {DISTANCES.map((cfg) => {
          const d = getDom(cfg.domId, isDark);
          const saved = bests.find((p) => p.distance_label === cfg.label);
          const secVal = parseDurationToSeconds(draftValues[cfg.label]) ?? saved?.duration_s ?? null;
          return (
            <div key={cfg.label} className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
              <div className="flex items-center justify-between">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${d.soft} ${d.border} ${d.text}`}
                >
                  <DuoIcon name="trophy" className="h-9 w-9" />
                </div>
                <span className={`rounded-xl px-2.5 py-1 text-[11px] font-extrabold tabular-nums ${d.soft} ${d.text}`}>
                  {fmtPace(cfg.meters, secVal)}
                </span>
              </div>

              <div>
                <span className={`text-xs font-extrabold uppercase ${T.muted}`}>{cfg.title}</span>
                <input
                  type="text"
                  placeholder="MM:SS"
                  value={draftValues[cfg.label]}
                  onChange={(e) =>
                    setDraftValues((prev) => ({ ...prev, [cfg.label]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSavePB(cfg);
                  }}
                  className={`mt-1 w-full rounded-xl bg-transparent font-display text-3xl font-extrabold tabular-nums focus:outline-none ${T.text}`}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${T.muted}`}>
                  {saved ? saved.achieved_date : 'Auto / manual'}
                </span>
                <button
                  type="button"
                  disabled={savingDist === cfg.label}
                  onClick={() => void handleSavePB(cfg)}
                  className={`cursor-pointer rounded-xl px-3 py-1.5 font-display text-xs font-bold disabled:opacity-50 ${T.btnNeutral}`}
                >
                  {savingDist === cfg.label ? '...' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Consistency Records Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={`flex items-center justify-between rounded-3xl border p-6 ${T.card}`}>
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${getDom('reading', isDark).soft} ${getDom('reading', isDark).border} ${getDom('reading', isDark).text}`}
            >
              <DuoIcon name="flame" className="h-8 w-8" />
            </span>
            <div>
              <span className={`text-xs font-extrabold uppercase ${T.muted}`}>Best Clean Streak</span>
              <div className={`font-display text-3xl font-extrabold tabular-nums ${T.text}`}>
                {pornFree.bestStreak} days
              </div>
            </div>
          </div>
          <span className={`rounded-xl px-3 py-1 text-xs font-extrabold ${getDom('reading', isDark).soft} ${getDom('reading', isDark).text}`}>
            Current {pornFree.currentStreak}d
          </span>
        </div>

        <div className={`flex items-center justify-between rounded-3xl border p-6 ${T.card}`}>
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${getDom('running', isDark).soft} ${getDom('running', isDark).border} ${getDom('running', isDark).text}`}
            >
              <DuoIcon name="running" className="h-8 w-8" />
            </span>
            <div>
              <span className={`text-xs font-extrabold uppercase ${T.muted}`}>Longest Run</span>
              <div className={`font-display text-3xl font-extrabold tabular-nums ${T.text}`}>
                {longestRunKm.toFixed(1)} km
              </div>
            </div>
          </div>
          <span className={`rounded-xl px-3 py-1 text-xs font-extrabold ${getDom('running', isDark).soft} ${getDom('running', isDark).text}`}>
            {runs.length} runs logged
          </span>
        </div>
      </div>
    </div>
  );
}
