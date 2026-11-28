import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, mapCategoryToDomain, type DomainId } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { WeeklyRhythmCard, type DomainRhythmStat } from '@/components/v2/WeeklyRhythmCard';
import { V2BlockModal } from '@/components/v2/V2BlockModal';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
  listScheduleCompletions,
  updateScheduleBlock,
} from '@/modules/calendar/repository';
import { addDaysIso, getIsoWeekday } from '@/modules/calendar/scheduleEngine';
import { listRunningSessions } from '@/modules/running/repository';
import {
  createMonkModeSession,
  evaluateMonkModeReport,
  getWeeklyCompletionCount,
  isCommitmentLocked,
  loadDisciplineStore,
  saveDisciplineStore,
  type PlannerCommitment,
  type PlannerDisciplineStore,
} from '@/modules/monk/monkEngine';
import type {
  ActivityCategory,
  RunningSession,
  ScheduleBlock,
  ScheduleBlockDraft,
  ScheduleCompletion,
} from '@/types/domain';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dow: days[dt.getUTCDay()],
    dayNum: d,
    short: `${months[dt.getUTCMonth()]} ${d}`,
  };
}

function occursOnDate(block: ScheduleBlock, dateIso: string): boolean {
  if (!block.is_recurring && !block.start_time) return false;
  if (block.is_recurring && block.recurrence_days.length > 0) {
    return block.recurrence_days.includes(getIsoWeekday(dateIso));
  }
  return block.block_date === dateIso;
}

export function TrainingPlanPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { openMonkFocus, triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);
  const weekStart = useMemo(() => getMondayWeekStart(today), [today]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const weekEnd = weekDates[6];

  const [store, setStore] = useState<PlannerDisciplineStore>(() =>
    loadDisciplineStore(user?.id ?? 'guest')
  );
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);

  // Inline add commitment form
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'nq' | 'nn'>('nq');
  const [cat, setCat] = useState<ActivityCategory>('VOCAL');
  const [dur, setDur] = useState('30');
  const [quota, setQuota] = useState('3');

  // Modals
  const [blockModal, setBlockModal] = useState<{
    open: boolean;
    block: ScheduleBlock | null;
    defaultCat: ActivityCategory;
  }>({ open: false, block: null, defaultCat: 'RUNNING' });
  const [savingBlock, setSavingBlock] = useState(false);
  const [draftingRuns, setDraftingRuns] = useState(false);

  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [sprintDays, setSprintDays] = useState(14);
  const [sprintTitle, setSprintTitle] = useState('Monk Sprint');

  useEffect(() => {
    if (user) {
      setStore(loadDisciplineStore(user.id));
    }
  }, [user]);

  const updateStore = useCallback(
    (updater: (prev: PlannerDisciplineStore) => PlannerDisciplineStore) => {
      setStore((prev) => {
        const next = updater(prev);
        if (user) saveDisciplineStore(user.id, next);
        return next;
      });
    },
    [user]
  );

  const loadSchedule = useCallback(async () => {
    if (!user) return;
    const [blks, comps, runList] = await Promise.all([
      listScheduleBlocks(user.id),
      listScheduleCompletions(user.id, weekStart, weekEnd),
      listRunningSessions(user.id),
    ]);
    setBlocks(blks);
    setCompletions(comps);
    setRuns(runList);
  }, [user, weekStart, weekEnd]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const nonNegotiables = useMemo(
    () => store.commitments.filter((c) => c.tier === 'NON_NEGOTIABLE'),
    [store.commitments]
  );

  const negotiables = useMemo(
    () => store.commitments.filter((c) => c.tier === 'NEGOTIABLE'),
    [store.commitments]
  );

  const todayDoneIds = store.completionsByDate[today] ?? [];

  const monkReport = useMemo(() => {
    if (!store.activeMonk) return null;
    return evaluateMonkModeReport(store.activeMonk, store.completionsByDate, today);
  }, [store.activeMonk, store.completionsByDate, today]);

  const completionMap = useMemo(() => {
    const m = new Map<string, ScheduleCompletion>();
    for (const c of completions) {
      m.set(`${c.block_id}__${c.occurrence_date}`, c);
    }
    return m;
  }, [completions]);

  const rhythmStats: DomainRhythmStat[] = useMemo(() => {
    const domains: DomainId[] = ['running', 'strength', 'karate', 'music'];
    return domains.map((dom) => {
      let total = 0;
      let done = 0;
      for (const iso of weekDates) {
        for (const blk of blocks) {
          if (mapCategoryToDomain(blk.category) === dom && occursOnDate(blk, iso)) {
            total++;
            if (completionMap.get(`${blk.id}__${iso}`)?.status === 'COMPLETED') {
              done++;
            }
          }
        }
      }
      if (dom === 'running') {
        const weekRuns = runs.filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd).length;
        done = Math.max(done, weekRuns);
        total = Math.max(total, weekRuns, 3);
      }
      return { id: dom, done, total };
    });
  }, [blocks, weekDates, completionMap, runs, weekStart, weekEnd]);

  function handleToggleNonNegotiable(id: string, e: MouseEvent) {
    const already = todayDoneIds.includes(id);
    if (!already) triggerConfetti(e.clientX, e.clientY);
    updateStore((prev) => {
      const list = prev.completionsByDate[today] ?? [];
      const nextList = already ? list.filter((x) => x !== id) : [...list, id];
      return {
        ...prev,
        completionsByDate: { ...prev.completionsByDate, [today]: nextList },
      };
    });
  }

  function handleIncrementQuota(item: PlannerCommitment, e: MouseEvent) {
    triggerConfetti(e.clientX, e.clientY);
    updateStore((prev) => {
      // Find first day this week not yet logged for this commitment (prefer today)
      const candidates = [today, ...weekDates.filter((d) => d !== today && d <= weekEnd)];
      const targetDay =
        candidates.find((d) => !(prev.completionsByDate[d] ?? []).includes(item.id)) ?? today;
      const list = prev.completionsByDate[targetDay] ?? [];
      if (list.includes(item.id)) return prev;
      return {
        ...prev,
        completionsByDate: {
          ...prev.completionsByDate,
          [targetDay]: [...list, item.id],
        },
      };
    });
    pushToast(`${item.title} +1 logged`, '#10B981');
  }

  function handleDeleteCommitment(item: PlannerCommitment) {
    if (isCommitmentLocked(item, store.activeMonk)) {
      pushToast('Locked during active Monk Sprint', '#EA580C');
      return;
    }
    updateStore((prev) => ({
      ...prev,
      commitments: prev.commitments.filter((c) => c.id !== item.id),
    }));
  }

  function handleAddRule(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const newItem: PlannerCommitment = {
      id: `cm-${Date.now()}`,
      title: trimmed,
      category: cat,
      tier: kind === 'nn' ? 'NON_NEGOTIABLE' : 'NEGOTIABLE',
      targetMinutes: Number(dur) || 30,
      targetPerWeek: kind === 'nq' ? Math.max(1, Math.min(7, Number(quota) || 3)) : null,
      intendedDays: kind === 'nq' ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7],
      createdAt: new Date().toISOString(),
    };

    updateStore((prev) => ({
      ...prev,
      commitments: [...prev.commitments, newItem],
    }));
    setName('');
    pushToast('Commitment added', '#10B981');
  }

  function handleStartMonkSprint() {
    if (nonNegotiables.length === 0) {
      pushToast('Add at least 1 Non-Negotiable first', '#EA580C');
      return;
    }
    const session = createMonkModeSession({
      title: sprintTitle.trim() || `${sprintDays}-Day Monk Sprint`,
      startDate: today,
      plannedDays: sprintDays,
      nonNegotiables,
      negotiables,
    });
    updateStore((prev) => ({
      ...prev,
      activeMonk: session,
    }));
    setSprintModalOpen(false);
    triggerConfetti();
    pushToast(`${sprintDays}-day Monk Sprint locked!`, '#4F46E5');
  }

  function handleEndMonkEarly() {
    if (!store.activeMonk) return;
    if (!window.confirm('End Monk Sprint early? This applies an early-exit penalty to your score.')) {
      return;
    }
    updateStore((prev) => {
      if (!prev.activeMonk) return prev;
      const ended = {
        ...prev.activeMonk,
        status: 'ENDED_EARLY' as const,
        endedAtDate: today,
        earlyExitReason: 'Ended manually',
      };
      return {
        ...prev,
        activeMonk: null,
        pastMonkSessions: [ended, ...prev.pastMonkSessions],
      };
    });
    pushToast('Monk Sprint ended early', '#E11D48');
  }

  async function handleDraftRuns() {
    if (!user || draftingRuns) return;
    setDraftingRuns(true);
    try {
      const drafts = [
        { date: addDaysIso(weekStart, 1), title: 'Easy Aerobic Run', duration: 35, note: 'Zone 2 easy' },
        { date: addDaysIso(weekStart, 3), title: 'Tempo / Threshold Run', duration: 40, note: 'Controlled tempo' },
        { date: addDaysIso(weekStart, 5), title: 'Steady Long Run', duration: 50, note: 'Relaxed aerobic' },
      ];
      let added = 0;
      for (const d of drafts) {
        const exists = blocks.some((b) => b.category === 'RUNNING' && occursOnDate(b, d.date));
        if (!exists) {
          await createScheduleBlock(user.id, {
            title: d.title,
            category: 'RUNNING',
            block_date: d.date,
            start_time: '06:15',
            end_time: '07:00',
            duration_min: d.duration,
            is_recurring: false,
            recurrence_days: [],
            status: 'PLANNED',
            physical_load: 'MODERATE',
            notes: d.note,
          });
          added++;
        }
      }
      await loadSchedule();
      pushToast(
        added > 0 ? `Drafted ${added} weekly runs` : 'Weekly runs already scheduled',
        '#2563EB'
      );
    } finally {
      setDraftingRuns(false);
    }
  }

  async function handleSaveBlock(draft: ScheduleBlockDraft, existingId: string | null) {
    if (!user) return;
    setSavingBlock(true);
    try {
      if (existingId) {
        await updateScheduleBlock(user.id, existingId, draft);
        pushToast('Block updated', '#2563EB');
      } else {
        await createScheduleBlock(user.id, draft);
        pushToast('Activity planned', '#2563EB');
      }
      setBlockModal({ open: false, block: null, defaultCat: 'RUNNING' });
      await loadSchedule();
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!user) return;
    setSavingBlock(true);
    try {
      await deleteScheduleBlock(user.id, blockId);
      setBlockModal({ open: false, block: null, defaultCat: 'RUNNING' });
      pushToast('Block deleted', '#DB2777');
      await loadSchedule();
    } finally {
      setSavingBlock(false);
    }
  }

  const readDom = getDom('reading', isDark);
  const musicDom = getDom('music', isDark);
  const runDom = getDom('running', isDark);
  const sleepDom = getDom('sleep', isDark);

  return (
    <div className="animate-pop space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className={`font-display text-3xl font-extrabold tracking-tight sm:text-4xl ${T.text}`}>
          Plan your <span className={isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]'}>week.</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openMonkFocus}
            className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-xs font-bold transition-all active:scale-[0.98] sm:text-sm ${
              isDark
                ? 'border border-[#818CF8]/30 bg-[#4F46E5]/15 text-[#818CF8] hover:bg-[#4F46E5]/25'
                : 'border border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]'
            }`}
          >
            Focus Timer
          </button>
          {!store.activeMonk && (
            <button
              type="button"
              onClick={() => setSprintModalOpen(true)}
              className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-xs font-bold sm:text-sm ${T.btnWhite}`}
            >
              Lock Monk Sprint
            </button>
          )}
          <button
            type="button"
            disabled={draftingRuns}
            onClick={() => void handleDraftRuns()}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2.5 font-display text-xs font-bold disabled:opacity-50 sm:text-sm ${T.btnWhite}`}
          >
            <span className={runDom.text}>
              <DuoIcon name="running" className="h-4 w-4" />
            </span>
            {draftingRuns ? 'Drafting...' : 'Draft runs'}
          </button>
          <button
            type="button"
            onClick={() => setBlockModal({ open: true, block: null, defaultCat: 'RUNNING' })}
            className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-xs font-bold sm:text-sm ${T.btnPrimary}`}
          >
            + Plan activity
          </button>
        </div>
      </div>

      {/* Active Monk Mode Sprint Banner (Compact V2 Card) */}
      {store.activeMonk && monkReport && (
        <div
          className={`flex flex-wrap items-center justify-between gap-4 rounded-3xl border p-5 ${sleepDom.soft} ${sleepDom.border}`}
        >
          <div className="flex items-center gap-3.5">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4F46E5] text-white`}
            >
              <DuoIcon name="monk" className="h-6 w-6" />
            </span>
            <div>
              <span className={`text-[10px] font-extrabold uppercase tracking-widest ${sleepDom.text}`}>
                MONK SPRINT ACTIVE · {monkReport.elapsedDays}/{monkReport.plannedDays} DAYS
              </span>
              <h2 className={`font-display text-lg font-extrabold ${T.text}`}>
                {monkReport.title}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-2xl border px-3.5 py-2 text-center ${T.card}`}>
              <span className={`block text-[10px] font-extrabold uppercase ${T.muted}`}>Score</span>
              <span className={`font-display text-base font-extrabold tabular-nums ${sleepDom.text}`}>
                {monkReport.finalScore.toFixed(2)}×
              </span>
            </div>
            <div className={`rounded-2xl border px-3.5 py-2 text-center ${T.card}`}>
              <span className={`block text-[10px] font-extrabold uppercase ${T.muted}`}>Compliance</span>
              <span className={`font-display text-base font-extrabold tabular-nums ${readDom.text}`}>
                {monkReport.compliancePct}%
              </span>
            </div>
            <button
              type="button"
              onClick={handleEndMonkEarly}
              className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-extrabold ${T.btnDangerSoft}`}
            >
              End early
            </button>
          </div>
        </div>
      )}

      {/* Non-Negotiables & Weekly Quotas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Non-Negotiables */}
        <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-display text-lg font-extrabold ${T.text}`}>Non-Negotiables</h2>
            <span
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-extrabold ${readDom.soft} ${readDom.border} ${readDom.text}`}
            >
              DAILY
            </span>
          </div>
          <div className="space-y-3">
            {nonNegotiables.length === 0 && (
              <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                No daily non-negotiables yet
              </div>
            )}
            {nonNegotiables.map((item) => {
              const domId = mapCategoryToDomain(item.category);
              const d = getDom(domId, isDark);
              const done = todayDoneIds.includes(item.id);
              const locked = isCommitmentLocked(item, store.activeMonk);
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${
                    done
                      ? isDark
                        ? 'border-[#34D399]/30 bg-[#10B981]/10'
                        : 'border-[#A7F3D0] bg-[#ECFDF5]/60'
                      : T.cardSubtle
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${d.soft} ${d.border} ${d.text}`}
                    >
                      <DuoIcon name={domId} className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate font-display text-sm font-extrabold sm:text-base ${T.text}`}>
                        {item.title}
                      </div>
                      <span className={`text-[11px] font-bold ${T.muted}`}>
                        Daily{item.targetMinutes ? ` · ${item.targetMinutes}m` : ''}
                        {locked ? ' · Locked' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleToggleNonNegotiable(item.id, e)}
                      className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold ${
                        done ? T.btnSuccess : T.btnWhite
                      }`}
                    >
                      {done ? '✓ Done' : 'Check'}
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => handleDeleteCommitment(item)}
                        className={`h-8 w-8 cursor-pointer rounded-xl font-bold ${T.btnWhite} ${T.muted}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Quotas */}
        <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-display text-lg font-extrabold ${T.text}`}>Weekly Quotas</h2>
            <span
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-extrabold ${musicDom.soft} ${musicDom.border} ${musicDom.text}`}
            >
              FLEXIBLE
            </span>
          </div>

          <div className="space-y-3">
            {negotiables.length === 0 && (
              <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                Add flexible weekly quotas below
              </div>
            )}
            {negotiables.map((item) => {
              const domId = mapCategoryToDomain(item.category);
              const d = getDom(domId, isDark);
              const target = item.targetPerWeek ?? 3;
              const doneCount = getWeeklyCompletionCount(item.id, store.completionsByDate, today);
              const locked = isCommitmentLocked(item, store.activeMonk);
              const dayLabels = (item.intendedDays ?? [])
                .map((n) => DAY_NAMES[n - 1])
                .filter(Boolean)
                .join(', ');

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${T.cardSubtle}`}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${d.soft} ${d.border} ${d.text}`}
                    >
                      <DuoIcon name={domId} className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`truncate font-display text-sm font-extrabold sm:text-base ${T.text}`}>
                          {item.title}
                        </span>
                        <span
                          className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold tabular-nums ${T.card} ${d.text}`}
                        >
                          {doneCount}/{target} wk
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        {Array.from({ length: target }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-3.5 w-3.5 rounded-full ${
                              i < doneCount ? d.bg : isDark ? 'bg-[#262626]' : 'bg-[#E5E7EB]'
                            }`}
                          />
                        ))}
                        {dayLabels && (
                          <span className={`ml-1 text-[11px] font-bold ${T.muted}`}>{dayLabels}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleIncrementQuota(item, e)}
                      className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold text-white transition-all active:scale-[0.98] ${d.bg} ${d.hover}`}
                    >
                      +1
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => handleDeleteCommitment(item)}
                        className={`h-8 w-8 cursor-pointer rounded-xl font-bold ${T.btnWhite} ${T.muted}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleAddRule} className={`grid grid-cols-12 gap-2 border-t pt-3 ${T.divider}`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New commitment..."
              className={`col-span-12 rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none sm:col-span-4 ${T.input}`}
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'nq' | 'nn')}
              className={`col-span-4 rounded-xl border px-2 py-2 text-xs font-bold sm:col-span-2 ${T.input}`}
            >
              <option value="nq">Quota</option>
              <option value="nn">Daily</option>
            </select>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as ActivityCategory)}
              className={`col-span-4 rounded-xl border px-2 py-2 text-xs font-bold sm:col-span-2 ${T.input}`}
            >
              <option value="VOCAL">Music</option>
              <option value="RUNNING">Run</option>
              <option value="STRENGTH">Strength</option>
              <option value="KARATE">Karate</option>
              <option value="CUSTOM">Other</option>
            </select>
            {kind === 'nq' ? (
              <input
                type="number"
                min={1}
                max={7}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                title="Sessions per week"
                className={`col-span-2 rounded-xl border px-2 py-2 text-center text-xs font-bold tabular-nums sm:col-span-2 ${T.input}`}
              />
            ) : (
              <input
                type="number"
                min={5}
                max={180}
                value={dur}
                onChange={(e) => setDur(e.target.value)}
                title="Minutes"
                className={`col-span-2 rounded-xl border px-2 py-2 text-center text-xs font-bold tabular-nums sm:col-span-2 ${T.input}`}
              />
            )}
            <button
              type="submit"
              className={`col-span-2 cursor-pointer rounded-xl px-2 py-2 font-display text-xs font-bold ${T.btnInk}`}
            >
              + Add
            </button>
          </form>
        </div>
      </div>

      {/* Visual Balance Card */}
      <WeeklyRhythmCard
        isDark={isDark}
        stats={rhythmStats}
        onOpenAnalytics={() => navigate('/analytics')}
      />

      {/* 7-Day Schedule Strip */}
      <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className={`font-display text-lg font-extrabold ${T.text}`}>7-day schedule</h2>
            <span className={`rounded-xl border px-2.5 py-0.5 text-xs font-extrabold ${T.cardSubtle} ${T.muted}`}>
              {fmtDate(weekDates[0]).short} – {fmtDate(weekDates[6]).short}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBlockModal({ open: true, block: null, defaultCat: 'RUNNING' })}
            className={`cursor-pointer text-xs font-extrabold ${
              isDark ? 'text-[#60A5FA] hover:text-white' : 'text-[#2563EB] hover:underline'
            }`}
          >
            + Add running workout
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {weekDates.map((iso) => {
            const f = fmtDate(iso);
            const evs = blocks
              .filter((b) => occursOnDate(b, iso))
              .sort((a, b) => (a.start_time ?? '23:59').localeCompare(b.start_time ?? '23:59'));
            const isToday = iso === today;
            return (
              <div
                key={iso}
                className={`min-h-[150px] space-y-2 rounded-2xl border p-3 ${
                  isToday
                    ? isDark
                      ? 'border-[#3B82F6] bg-[#2563EB]/15'
                      : 'border-[#2563EB] bg-[#EFF6FF]/60'
                    : T.cardSubtle
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-extrabold uppercase ${
                      isToday ? (isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]') : T.muted
                    }`}
                  >
                    {f.dow}
                  </span>
                  <span className={`font-display text-sm font-extrabold tabular-nums ${T.text}`}>
                    {f.dayNum}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {evs.map((ev) => {
                    const domId = mapCategoryToDomain(ev.category);
                    const d = getDom(domId, isDark);
                    return (
                      <button
                        key={`${ev.id}-${iso}`}
                        type="button"
                        onClick={() =>
                          setBlockModal({ open: true, block: ev, defaultCat: ev.category })
                        }
                        className={`flex w-full cursor-pointer items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left transition-all active:scale-[0.98] ${T.card}`}
                      >
                        <span className={`shrink-0 ${d.text}`}>
                          <DuoIcon name={domId} className="h-4 w-4" />
                        </span>
                        <span className={`truncate text-[11px] font-bold ${T.text}`}>{ev.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monk Sprint Lock Modal */}
      {sprintModalOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${T.modalOverlay}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSprintModalOpen(false);
          }}
        >
          <div className={`animate-pop w-full max-w-md space-y-5 rounded-3xl border p-6 shadow-2xl ${T.card}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-display text-xl font-extrabold ${T.text}`}>Lock Monk Sprint</h3>
              <button
                type="button"
                onClick={() => setSprintModalOpen(false)}
                className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={sprintTitle}
                onChange={(e) => setSprintTitle(e.target.value)}
                placeholder="Sprint name..."
                className={`w-full rounded-xl border px-3.5 py-2.5 font-display text-sm font-bold ${T.input}`}
              />
              <div className="grid grid-cols-3 gap-2">
                {[7, 14, 21, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSprintDays(d)}
                    className={`cursor-pointer rounded-xl border py-2 font-display text-xs font-extrabold tabular-nums ${
                      sprintDays === d ? T.btnPrimary : T.btnNeutral
                    }`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <p className={`text-xs font-semibold ${T.muted}`}>
                Locks {nonNegotiables.length} daily rules & {negotiables.length} weekly quotas using the 1.01/0.99 compounding score.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSprintModalOpen(false)}
                className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartMonkSprint}
                className={`cursor-pointer rounded-xl px-5 py-2 font-display text-xs font-bold ${T.btnPrimary}`}
              >
                Start Sprint
              </button>
            </div>
          </div>
        </div>
      )}

      {blockModal.open && (
        <V2BlockModal
          isDark={isDark}
          block={blockModal.block}
          defaultDate={today}
          defaultCategory={blockModal.defaultCat}
          saving={savingBlock}
          onClose={() => setBlockModal({ open: false, block: null, defaultCat: 'RUNNING' })}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
        />
      )}
    </div>
  );
}
