import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { addDaysIso, getIsoWeekday } from '@/modules/calendar/scheduleEngine';
import { listScheduleBlocks, listScheduleCompletions } from '@/modules/calendar/repository';
import { listRunningSessions } from '@/modules/running/repository';
import { listHabitLogs } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import { listWeeklyReviews, upsertWeeklyReview } from '@/modules/coach/repository';
import type {
  HabitLog,
  RunningSession,
  ScheduleBlock,
  ScheduleCompletion,
  WeeklyReviewRecord,
} from '@/types/domain';

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[dt.getUTCMonth()]} ${d}`;
}

function occursOnDate(block: ScheduleBlock, dateIso: string): boolean {
  if (!block.is_recurring && !block.start_time) return false;
  if (block.is_recurring && block.recurrence_days.length > 0) {
    return block.recurrence_days.includes(getIsoWeekday(dateIso));
  }
  return block.block_date === dateIso;
}

export function WeeklyReviewPage() {
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);
  const currentWeekStart = useMemo(() => getMondayWeekStart(today), [today]);

  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const weekEnd = weekDates[6];

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [habits, setHabits] = useState<HabitLog[]>([]);
  const [reviews, setReviews] = useState<WeeklyReviewRecord[]>([]);

  const [wins, setWins] = useState('');
  const [adjustments, setAdjustments] = useState('');
  const [nextFocus, setNextFocus] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [b, c, r, h, revList] = await Promise.all([
      listScheduleBlocks(user.id),
      listScheduleCompletions(user.id, weekStart, weekEnd),
      listRunningSessions(user.id),
      listHabitLogs(user.id, PORN_FREE_HABIT_KEY),
      listWeeklyReviews(user.id, 12),
    ]);
    setBlocks(b);
    setCompletions(c);
    setRuns(r);
    setHabits(h);
    setReviews(revList);

    const match = revList.find((rv) => rv.week_start === weekStart);
    if (match) {
      const snap = (match.summary_snapshot ?? {}) as Record<string, unknown>;
      setWins(typeof snap.wins === 'string' ? snap.wins : '');
      setAdjustments(typeof snap.adjustments === 'string' ? snap.adjustments : '');
      setNextFocus(typeof snap.nextFocus === 'string' ? snap.nextFocus : '');
    } else {
      setWins('');
      setAdjustments('');
      setNextFocus('');
    }
  }, [user, weekStart, weekEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const completionSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of completions) {
      if (c.status === 'COMPLETED') s.add(`${c.block_id}__${c.occurrence_date}`);
    }
    return s;
  }, [completions]);

  const { scheduledCount, doneCount } = useMemo(() => {
    let sched = 0;
    let done = 0;
    for (const iso of weekDates) {
      for (const blk of blocks) {
        if (occursOnDate(blk, iso)) {
          sched++;
          if (completionSet.has(`${blk.id}__${iso}`)) done++;
        }
      }
    }
    return { scheduledCount: sched, doneCount: done };
  }, [blocks, weekDates, completionSet]);

  const weeklyRunKm = useMemo(
    () =>
      runs
        .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
        .reduce((acc, r) => acc + (r.distance_m || 0) / 1000, 0),
    [runs, weekStart, weekEnd]
  );

  const strengthCount = useMemo(
    () => completions.filter((c) => c.status === 'COMPLETED' && c.strength_focus !== null).length,
    [completions]
  );

  const pornFree = useMemo(
    () => calculateHabitStreak(PORN_FREE_HABIT_KEY, habits, today),
    [habits, today]
  );

  const score = Math.min(
    100,
    Math.round(
      (doneCount / Math.max(1, scheduledCount)) * 60 +
        (pornFree.currentStreak > 0 ? 25 : 0) +
        (weeklyRunKm > 0 ? 15 : 0)
    )
  );

  async function handleSave(e: MouseEvent) {
    if (!user || saving) return;
    setSaving(true);
    try {
      const reflectionText = [
        wins.trim() ? `Wins: ${wins.trim()}` : '',
        adjustments.trim() ? `Adjustments: ${adjustments.trim()}` : '',
        nextFocus.trim() ? `Next Focus: ${nextFocus.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await upsertWeeklyReview(user.id, {
        week_start: weekStart,
        week_end: weekEnd,
        summary_snapshot: {
          score,
          doneCount,
          scheduledCount,
          weeklyRunKm: Number(weeklyRunKm.toFixed(1)),
          strengthCount,
          wins: wins.trim(),
          adjustments: adjustments.trim(),
          nextFocus: nextFocus.trim(),
        },
        ai_narrative: null,
        ai_model: null,
        user_reflection: reflectionText || null,
      });
      triggerConfetti(e.clientX, e.clientY);
      pushToast('Weekly review saved!', '#10B981');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  const circ = 2 * Math.PI * 46;
  const readDom = getDom('reading', isDark);
  const runDom = getDom('running', isDark);
  const strDom = getDom('strength', isDark);

  return (
    <div className="mx-auto max-w-3xl animate-pop space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`font-display text-3xl font-extrabold tracking-tight ${T.text}`}>
          Weekly Review
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDaysIso(w, -7))}
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
          >
            ‹
          </button>
          <span className={`px-2 font-display text-xs font-extrabold tabular-nums ${T.text}`}>
            {fmtShort(weekStart)} – {fmtShort(weekEnd)}
          </span>
          <button
            type="button"
            disabled={weekStart >= currentWeekStart}
            onClick={() => setWeekStart((w) => addDaysIso(w, 7))}
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold disabled:opacity-40 ${T.btnNeutral}`}
          >
            ›
          </button>
        </div>
      </div>

      <div className={`space-y-6 rounded-3xl border p-6 ${T.card}`}>
        {/* Score Ring + 3 KPIs */}
        <div className={`flex flex-col items-center gap-6 border-b pb-5 sm:flex-row ${T.divider}`}>
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="46" stroke={T.ringTrack} strokeWidth="11" fill="none" />
              <circle
                cx="55"
                cy="55"
                r="46"
                stroke={T.ringFill}
                strokeWidth="11"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - score / 100)}
              />
            </svg>
            <span className={`absolute font-display text-2xl font-extrabold tabular-nums ${T.text}`}>
              {score}%
            </span>
          </div>

          <div className="grid w-full grid-cols-3 gap-3">
            <div className={`rounded-2xl p-3.5 text-center ${readDom.soft}`}>
              <span className={`block font-display text-xl font-extrabold tabular-nums ${readDom.text}`}>
                {doneCount}
              </span>
              <span className={`text-[10px] font-extrabold uppercase ${T.muted}`}>Done</span>
            </div>
            <div className={`rounded-2xl p-3.5 text-center ${runDom.soft}`}>
              <span className={`block font-display text-xl font-extrabold tabular-nums ${runDom.text}`}>
                {weeklyRunKm.toFixed(1)}
              </span>
              <span className={`text-[10px] font-extrabold uppercase ${T.muted}`}>km</span>
            </div>
            <div className={`rounded-2xl p-3.5 text-center ${strDom.soft}`}>
              <span className={`block font-display text-xl font-extrabold tabular-nums ${strDom.text}`}>
                {strengthCount}/4
              </span>
              <span className={`text-[10px] font-extrabold uppercase ${T.muted}`}>Strength</span>
            </div>
          </div>
        </div>

        {/* 3 Clean Reflection Fields */}
        <div className="grid grid-cols-1 gap-4">
          {[
            { label: 'Wins', val: wins, set: setWins, domId: 'reading' as const, placeholder: 'What went well this week?' },
            { label: 'Adjustments', val: adjustments, set: setAdjustments, domId: 'karate' as const, placeholder: 'What needs tightening up?' },
            { label: 'Next Week Focus', val: nextFocus, set: setNextFocus, domId: 'running' as const, placeholder: 'Primary target for next week...' },
          ].map((f) => (
            <div key={f.label} className="space-y-1.5">
              <span className={`text-xs font-extrabold uppercase tracking-wider ${getDom(f.domId, isDark).text}`}>
                {f.label}
              </span>
              <input
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className={`w-full rounded-xl border px-4 py-3 font-display text-sm font-bold focus:outline-none ${T.input}`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold ${T.muted}`}>
            {reviews.length} saved review{reviews.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={(e) => void handleSave(e)}
            className={`cursor-pointer rounded-xl px-6 py-3 font-display text-sm font-bold disabled:opacity-50 ${T.btnSuccess}`}
          >
            {saving ? 'Saving...' : 'Save Review'}
          </button>
        </div>
      </div>
    </div>
  );
}
