import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { OneStepCloserCard } from '@/components/v2/OneStepCloserCard';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import {
  createRunningSession,
  deleteRunningSession,
  listRunningSessions,
  syncFiveKFastestLogged,
} from '@/modules/running/repository';
import type { RunningSession, WorkoutType } from '@/types/domain';

const RUN_TYPES: { label: string; value: WorkoutType }[] = [
  { label: 'Easy', value: 'EASY' },
  { label: 'Tempo', value: 'TEMPO' },
  { label: 'Intervals', value: 'INTERVALS' },
  { label: 'Long', value: 'LONG' },
];

function fmtPace(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RunningLogPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('running', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);
  const weekStart = useMemo(() => getMondayWeekStart(today), [today]);
  const weekEnd = useMemo(() => addDaysIso(weekStart, 6), [weekStart]);

  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [runKm, setRunKm] = useState('5.0');
  const [runMin, setRunMin] = useState('22.0');
  const [runDate, setRunDate] = useState(today);
  const [runType, setRunType] = useState<WorkoutType>('EASY');
  const [saving, setSaving] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!user) return;
    const data = await listRunningSessions(user.id);
    setRuns(data);
  }, [user]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const kmNum = parseFloat(runKm) || 0;
  const minNum = parseFloat(runMin) || 0;
  const livePace = kmNum > 0 && minNum > 0 ? (minNum * 60) / kmNum : 0;

  const weeklyRunKm = useMemo(
    () =>
      runs
        .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
        .reduce((acc, r) => acc + (r.distance_m || 0) / 1000, 0),
    [runs, weekStart, weekEnd]
  );

  const currentFiveKSec = useMemo(() => {
    const fiveKs = runs.filter((r) => r.distance_m >= 4800 && r.distance_m <= 5300 && r.duration_s > 0);
    if (fiveKs.length > 0) {
      return Math.min(...fiveKs.map((r) => Math.round((r.duration_s / r.distance_m) * 5000)));
    }
    const valid = runs.filter((r) => r.distance_m >= 1000 && r.duration_s > 0);
    if (valid.length > 0) {
      const bestPace = Math.min(...valid.map((r) => (r.duration_s / r.distance_m) * 1000));
      return Math.round(bestPace * 5);
    }
    return null;
  }, [runs]);

  async function handleSaveRun(e: FormEvent) {
    e.preventDefault();
    if (!user || kmNum <= 0 || minNum <= 0 || saving) return;
    setSaving(true);
    try {
      await createRunningSession(user.id, {
        session_date: runDate,
        start_time: null,
        distance_m: Math.round(kmNum * 1000),
        duration_s: Math.round(minNum * 60),
        workout_type: runType,
        is_indoor: false,
        avg_hr_bpm: null,
        max_hr_bpm: null,
        cadence_spm: null,
        elevation_gain_m: null,
        rpe: null,
        energy_level: null,
        muscle_soreness: null,
        pain_present: false,
        pain_details: null,
        conditions: null,
        notes: null,
        entry_method: 'MANUAL',
        splits: [],
      });
      await syncFiveKFastestLogged(user.id);
      triggerConfetti();
      pushToast(`Logged ${kmNum.toFixed(1)} km (${fmtPace(livePace)} /km)`, '#2563EB');
      await loadRuns();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!user || !window.confirm('Delete this run?')) return;
    await deleteRunningSession(user.id, id);
    await syncFiveKFastestLogged(user.id);
    pushToast('Run deleted', '#DB2777');
    await loadRuns();
  }

  return (
    <div className="animate-pop space-y-6">
      {/* Header */}
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
            <DuoIcon name="running" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Running</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Log Run Card */}
        <form
          onSubmit={(e) => void handleSaveRun(e)}
          className={`space-y-4 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}
        >
          <div className="flex items-center justify-between">
            <h2 className={`font-display text-xl font-extrabold ${T.text}`}>Log Run</h2>
            <span className={`rounded-xl px-3 py-1 text-xs font-extrabold tabular-nums ${dom.soft} ${dom.text}`}>
              {fmtPace(livePace)} /km
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>
                Distance (km)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                value={runKm}
                onChange={(e) => setRunKm(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 font-display text-lg font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>
                Duration (min)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={runMin}
                onChange={(e) => setRunMin(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 font-display text-lg font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
          </div>

          <div>
            <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Date</label>
            <input
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
              className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-xs font-bold tabular-nums focus:outline-none ${T.input}`}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {RUN_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setRunType(t.value)}
                className={`cursor-pointer rounded-xl border py-2 text-xs font-extrabold transition-all active:scale-[0.98] ${
                  runType === t.value
                    ? `${dom.soft} ${dom.border} ${dom.text}`
                    : `${T.cardSubtle} ${T.muted}`
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`w-full cursor-pointer rounded-xl py-3 font-display text-sm font-bold disabled:opacity-50 ${T.btnPrimary}`}
          >
            {saving ? 'Saving...' : '+ Save Run'}
          </button>
        </form>

        {/* Right Column: One Step Closer + Recent Runs */}
        <div className="space-y-5 lg:col-span-7">
          <OneStepCloserCard
            isDark={isDark}
            weeklyRunKm={weeklyRunKm}
            currentFiveKSec={currentFiveKSec}
            firstGoalSec={profile?.first_major_5k_goal_s}
            longTermGoalSec={profile?.long_term_5k_goal_s}
          />

          <div className={`space-y-3 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-display text-base font-extrabold ${T.text}`}>Recent Runs</h3>
              <span className={`text-xs font-extrabold tabular-nums ${T.muted}`}>
                {runs.length} logged
              </span>
            </div>

            {runs.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                No runs logged yet
              </div>
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 12).map((l) => {
                  const km = l.distance_m / 1000;
                  const mins = (l.duration_s / 60).toFixed(1);
                  const paceSec = km > 0 ? l.duration_s / km : 0;
                  return (
                    <div
                      key={l.id}
                      className={`flex items-center justify-between gap-2 rounded-2xl border p-3.5 ${T.cardSubtle}`}
                    >
                      <Link
                        to={`/runs/${l.id}`}
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
                      >
                        <span className={`rounded-xl px-2.5 py-1 text-xs font-extrabold ${dom.soft} ${dom.text}`}>
                          {l.workout_type}
                        </span>
                        <span className={`font-display text-base font-extrabold tabular-nums ${T.text}`}>
                          {km.toFixed(1)} km
                        </span>
                        <span className={`text-xs font-bold tabular-nums ${T.muted}`}>
                          {mins}m · {l.session_date}
                        </span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`font-display text-sm font-extrabold tabular-nums ${dom.text}`}>
                          {fmtPace(paceSec)} /km
                        </span>
                        <button
                          type="button"
                          aria-label="Delete run"
                          onClick={() => void handleDelete(l.id)}
                          className={`h-7 w-7 cursor-pointer rounded-lg text-xs font-extrabold ${T.btnWhite} ${T.muted}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
