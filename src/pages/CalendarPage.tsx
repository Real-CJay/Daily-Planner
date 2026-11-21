import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  HeartPulse,
  Inbox,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS, CategoryDot, CategoryMark, EmptyState } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  deleteScheduleCompletion,
  listReadinessCheckIns,
  listScheduleBlocks,
  listScheduleCompletions,
  seedDefaultRecurringSchedule,
  updateScheduleBlock,
  upsertReadinessCheckIn,
  upsertScheduleCompletion,
} from '@/modules/calendar/repository';
import {
  ISO_WEEKDAYS,
  addDaysIso,
  evaluateReadiness,
  getMonthGridDates,
  getWeekDates,
} from '@/modules/calendar/scheduleEngine';
import {
  buildDailyTimeline,
  formatMinutesToTime,
  getMondayIso,
  getUnscheduledInboxBlocks,
  parseTimeToMinutes,
} from '@/modules/calendar/timelineEngine';
import { DailyTimelineView } from '@/modules/calendar/DailyTimelineView';
import { WeeklyGridView } from '@/modules/calendar/WeeklyGridView';
import { InboxSidebar } from '@/modules/calendar/InboxSidebar';
import { ScheduleBlockModal } from '@/modules/calendar/ScheduleBlockModal';
import { ReadinessCheckInModal } from '@/modules/calendar/ReadinessCheckInModal';
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type PlannedWorkout,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
  type ScheduleCompletion,
  type ScheduleCompletionDraft,
} from '@/types/domain';

type CalendarView = 'WEEK' | 'TIMELINE' | 'MONTH' | 'AGENDA';

const ALL_CATEGORIES: ActivityCategory[] = [
  'RUNNING',
  'KARATE',
  'STRENGTH',
  'RECOVERY',
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
  'UNIVERSITY',
  'CUSTOM',
];

async function fetchPlannedWorkoutsRange(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<PlannedWorkout[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('plan_date', fromDate)
    .lte('plan_date', toDate)
    .order('plan_date', { ascending: true });

  if (error) return [];
  return (data ?? []) as PlannedWorkout[];
}

export function CalendarPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [view, setView] = useState<CalendarView>('WEEK');
  const [showInbox, setShowInbox] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'ALL'>('ALL');

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [plannedRuns, setPlannedRuns] = useState<PlannedWorkout[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [modalInitialBlock, setModalInitialBlock] = useState<ScheduleBlock | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const weekStartIso = useMemo(() => getMondayIso(selectedDate), [selectedDate]);

  const [anchorYear, anchorMonth] = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return [y, m - 1] as const;
  }, [selectedDate]);

  const visibleDates = useMemo(() => {
    if (view === 'MONTH') return getMonthGridDates(anchorYear, anchorMonth);
    if (view === 'AGENDA') {
      const start = getMondayIso(selectedDate);
      return Array.from({ length: 14 }, (_, i) => addDaysIso(start, i));
    }
    return getWeekDates(selectedDate);
  }, [view, anchorYear, anchorMonth, selectedDate]);

  const rangeStart = visibleDates[0];
  const rangeEnd = visibleDates[visibleDates.length - 1];

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const fetchStart = addDaysIso(rangeStart, -7);
      const fetchEnd = addDaysIso(rangeEnd, 7);

      const [blockRows, runRows, checkInRows, completionRows, planRows] = await Promise.all([
        listScheduleBlocks(user.id),
        listRunningSessions(user.id),
        listReadinessCheckIns(user.id, 30),
        listScheduleCompletions(user.id, fetchStart, fetchEnd).catch(() => []),
        fetchPlannedWorkoutsRange(user.id, fetchStart, fetchEnd),
      ]);

      setBlocks(blockRows);
      setRuns(runRows);
      setCheckIns(checkInRows);
      setCompletions(completionRows);
      setPlannedRuns(planRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar data.');
    } finally {
      setLoading(false);
    }
  }, [user, rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredBlocks = useMemo(() => {
    if (categoryFilter === 'ALL') return blocks;
    return blocks.filter((b) => b.category === categoryFilter);
  }, [blocks, categoryFilter]);

  const filteredRuns = useMemo(() => {
    if (categoryFilter === 'ALL' || categoryFilter === 'RUNNING') return runs;
    return [];
  }, [runs, categoryFilter]);

  const filteredPlannedRuns = useMemo(() => {
    if (categoryFilter === 'ALL' || categoryFilter === 'RUNNING') return plannedRuns;
    return [];
  }, [plannedRuns, categoryFilter]);

  const inboxBlocks = useMemo(() => getUnscheduledInboxBlocks(blocks), [blocks]);

  // Unified timelines for Month and Agenda views so recurring blocks render consistently across all weeks
  const rangeTimelines = useMemo(() => {
    if (view !== 'MONTH' && view !== 'AGENDA') return [];
    return visibleDates.map((d) =>
      buildDailyTimeline(d, filteredBlocks, completions, filteredPlannedRuns, filteredRuns)
    );
  }, [view, visibleDates, filteredBlocks, completions, filteredPlannedRuns, filteredRuns]);

  const todayCheckIn = useMemo(
    () => checkIns.find((c) => c.checkin_date === today) ?? null,
    [checkIns, today]
  );
  const readinessEval = useMemo(() => evaluateReadiness(todayCheckIn), [todayCheckIn]);

  const hasStrengthBlock = useMemo(
    () => blocks.some((b) => b.category === 'STRENGTH'),
    [blocks]
  );

  function stepPeriod(direction: -1 | 1) {
    if (view === 'MONTH') {
      const next = new Date(Date.UTC(anchorYear, anchorMonth + direction, 1));
      setSelectedDate(next.toISOString().slice(0, 10));
    } else if (view === 'TIMELINE') {
      setSelectedDate(addDaysIso(selectedDate, direction));
    } else {
      setSelectedDate(addDaysIso(selectedDate, direction * 7));
    }
  }

  function openNewBlockModal() {
    setEditingBlockId(null);
    setModalInitialBlock(null);
    setShowBlockModal(true);
  }

  function openEditBlockModal(block: ScheduleBlock) {
    setEditingBlockId(block.id);
    setModalInitialBlock(block);
    setShowBlockModal(true);
  }

  function openSlotModal(dateIso: string, startTime: string, endTime: string) {
    if (!user) return;
    const startMin = parseTimeToMinutes(startTime) ?? 9 * 60;
    const endMin = parseTimeToMinutes(endTime) ?? startMin + 45;
    const defaultDur = Math.min(60, Math.max(15, endMin - startMin));
    const suggestedEnd = formatMinutesToTime(startMin + defaultDur);

    setEditingBlockId(null);
    setModalInitialBlock({
      id: '',
      user_id: user.id,
      title: '',
      category: 'UNIVERSITY',
      block_date: dateIso,
      start_time: startTime,
      end_time: suggestedEnd,
      duration_min: defaultDur,
      is_recurring: false,
      recurrence_days: [],
      status: 'PLANNED',
      physical_load: 'NONE',
      notes: null,
      data_origin: 'PLANNED',
      created_at: new Date().toISOString(),
    });
    setShowBlockModal(true);
  }

  function openSlotInboxModal(block: ScheduleBlock) {
    const dur = block.duration_min ?? 45;
    setEditingBlockId(block.id);
    setModalInitialBlock({
      ...block,
      block_date: selectedDate,
      start_time: '09:00',
      end_time: formatMinutesToTime(9 * 60 + dur),
      duration_min: dur,
    });
    setShowBlockModal(true);
  }

  async function handleSaveCompletion(draft: ScheduleCompletionDraft) {
    if (!user) return;
    setError(null);
    try {
      const saved = await upsertScheduleCompletion(user.id, draft);
      setCompletions((prev) => {
        const rest = prev.filter(
          (c) =>
            !(c.block_id === saved.block_id && c.occurrence_date === saved.occurrence_date)
        );
        return [saved, ...rest];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save daily check-off.');
    }
  }

  async function handleClearCompletion(blockId: string, occurrenceDate: string) {
    if (!user) return;
    setError(null);
    try {
      await deleteScheduleCompletion(user.id, blockId, occurrenceDate);
      setCompletions((prev) =>
        prev.filter(
          (c) => !(c.block_id === blockId && c.occurrence_date === occurrenceDate)
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo daily check-off.');
    }
  }

  async function handleSeedDefaults() {
    if (!user) return;
    setSeeding(true);
    setNotice(null);
    setError(null);
    try {
      const added = await seedDefaultRecurringSchedule(user.id, today);
      await loadData();
      setNotice(
        added > 0
          ? `Added ${added} recurring schedule template(s).`
          : 'Default recurring templates already exist.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to seed default schedule.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!user) return;
    if (!window.confirm('Delete this schedule block?')) return;
    await deleteScheduleBlock(user.id, blockId);
    await loadData();
  }

  const periodTitle = useMemo(() => {
    if (view === 'MONTH') {
      return new Date(Date.UTC(anchorYear, anchorMonth, 1)).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    if (view === 'TIMELINE') {
      const [y, m, d] = selectedDate.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    return `${rangeStart} → ${rangeEnd}`;
  }, [view, anchorYear, anchorMonth, selectedDate, rangeStart, rangeEnd]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Compact Single-Row Stride Control Bar (viewport-locked, zero page scroll) */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-3">
        {/* Left: Date Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepPeriod(-1)}
            aria-label="Previous"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(today)}
            className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepPeriod(1)}
            aria-label="Next"
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h1 className="ml-2.5 text-[15px] font-bold tracking-[-0.02em] text-[var(--ink)]">
            {periodTitle}
          </h1>
        </div>

        {/* Center: Stride Segmented View Switcher */}
        <div
          role="tablist"
          aria-label="Calendar view"
          className="inline-flex rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-1 text-[12px] font-semibold"
        >
          {(
            [
              { id: 'WEEK', label: 'Week' },
              { id: 'TIMELINE', label: 'Day' },
              { id: 'MONTH', label: 'Month' },
              { id: 'AGENDA', label: 'Agenda' },
            ] as const
          ).map(({ id, label }) => {
            const selected = view === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={selected}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-[7px] px-3.5 py-1.5 transition-colors ${
                  selected
                    ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Right: Utility Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {!loading && (blocks.length === 0 || !hasStrengthBlock) && (
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeedDefaults()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-transparent bg-[var(--blue-lite)] px-3 text-[12px] font-semibold text-[var(--blue-ink)] transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{seeding ? 'Adding...' : 'Seed Templates'}</span>
            </button>
          )}

          {/* Category Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu((v) => !v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-semibold transition-colors ${
                categoryFilter !== 'ALL'
                  ? 'border-[var(--blue)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>
                {categoryFilter === 'ALL'
                  ? 'All activities'
                  : CATEGORY_SHORT_LABELS[categoryFilter]}
              </span>
            </button>

            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div className="absolute right-0 top-11 z-40 w-52 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow)]">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('ALL');
                      setShowFilterMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors ${
                      categoryFilter === 'ALL'
                        ? 'bg-[var(--blue-lite)] font-semibold text-[var(--blue-ink)]'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <span>All activities</span>
                  </button>
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(cat);
                        setShowFilterMenu(false);
                      }}
                      className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors ${
                        categoryFilter === cat
                          ? 'bg-[var(--blue-lite)] font-semibold text-[var(--blue-ink)]'
                          : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <CategoryDot category={cat} />
                      <span>{ACTIVITY_CATEGORY_LABELS[cat]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Inbox Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowInbox((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[12px] font-semibold transition-colors ${
              showInbox
                ? 'border-[var(--blue)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
                : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inbox</span>
            <span className="rounded-[6px] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--muted)]">
              {inboxBlocks.length}
            </span>
          </button>

          {/* Readiness Pill */}
          <button
            type="button"
            onClick={() => setShowReadinessModal(true)}
            title={readinessEval.summary}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <HeartPulse className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span className="hidden md:inline">
              {readinessEval.score !== null ? `${readinessEval.score}/100` : 'Readiness'}
            </span>
          </button>

          {/* Primary Add Block */}
          <button
            type="button"
            onClick={openNewBlockModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 active:translate-y-px dark:text-[#121315]"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add block</span>
          </button>
        </div>
      </div>

      {/* Slim Dismissible Alert Strip */}
      {(error || notice) && (
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-b px-5 py-2 text-xs font-medium ${
            error
              ? 'border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-[var(--line)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
          }`}
        >
          <span>{error ?? notice}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Full-Height Calendar Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Optional Slide-In Unscheduled Inbox Rail */}
        {showInbox && (
          <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--bg)] p-3.5">
            <InboxSidebar
              selectedDate={selectedDate}
              inboxBlocks={inboxBlocks}
              onQuickAddInbox={async (draft) => {
                if (!user) return;
                await createScheduleBlock(user.id, draft);
                await loadData();
              }}
              onSlotToSelectedDay={openSlotInboxModal}
            />
          </div>
        )}

        {/* Active Calendar Surface */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
              Loading calendar...
            </div>
          ) : view === 'WEEK' ? (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)] p-4 sm:p-5">
              <div className="mx-auto flex h-full min-h-0 w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <WeeklyGridView
                  weekStartIso={weekStartIso}
                  todayIso={today}
                  blocks={filteredBlocks}
                  completions={completions}
                  plannedRuns={filteredPlannedRuns}
                  recordedRuns={filteredRuns}
                  onSelectDate={(dateIso) => {
                    setSelectedDate(dateIso);
                    setView('TIMELINE');
                  }}
                  onEditBlock={openEditBlockModal}
                  onCreateAtSlot={openSlotModal}
                />
              </div>
            </div>
          ) : view === 'TIMELINE' ? (
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-5 sm:p-6">
              <div className="mx-auto max-w-4xl">
                <DailyTimelineView
                  weekStartIso={weekStartIso}
                  selectedDate={selectedDate}
                  todayIso={today}
                  blocks={filteredBlocks}
                  completions={completions}
                  plannedRuns={filteredPlannedRuns}
                  recordedRuns={filteredRuns}
                  onSelectDate={setSelectedDate}
                  onEditBlock={openEditBlockModal}
                  onCreateAtGap={openSlotModal}
                  onSaveCompletion={handleSaveCompletion}
                  onClearCompletion={handleClearCompletion}
                />
              </div>
            </div>
          ) : view === 'MONTH' ? (
            (() => {
              const monthRows = Math.max(4, Math.ceil(rangeTimelines.length / 7));
              return (
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)] p-4 sm:p-5">
                  <div className="mx-auto flex h-full min-h-0 w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl border border-[#bfc2bc] bg-[var(--surface)] dark:border-[#52565f]">
                    <div
                      className="grid h-full min-h-0 flex-1 grid-cols-7 gap-px bg-[#bfc2bc] dark:bg-[#52565f]"
                      style={{
                        gridTemplateRows: `36px repeat(${monthRows}, minmax(0, 1fr))`,
                      }}
                    >
                      {ISO_WEEKDAYS.map((d) => (
                        <div
                          key={d.iso}
                          className="grid place-items-center bg-[var(--surface-2)] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]"
                        >
                          {d.short}
                        </div>
                      ))}

                      {rangeTimelines.map((dt) => {
                        const date = dt.dateStr;
                        const inMonth = Number(date.slice(5, 7)) - 1 === anchorMonth;
                        const isToday = date === today;
                        const dayItems = [...dt.allDayItems, ...dt.timedItems];

                        return (
                          <button
                            key={date}
                            type="button"
                            onClick={() => {
                              setSelectedDate(date);
                              setView('TIMELINE');
                            }}
                            className={`flex min-h-0 min-w-0 flex-col items-start gap-1.5 overflow-hidden px-3 py-2 text-left transition-colors ${
                              inMonth
                                ? 'bg-[var(--surface)] hover:bg-[var(--surface-2)] dark:bg-[#14161a] dark:hover:bg-[#1a1d23]'
                                : 'bg-[var(--surface-2)]/75 text-[var(--faint)] hover:bg-[var(--surface-2)] dark:bg-[#23262d] dark:hover:bg-[#292d35]'
                            }`}
                          >
                            <strong
                              className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] font-mono text-[13px] font-bold ${
                                isToday
                                  ? 'bg-[var(--blue)] text-white'
                                  : inMonth
                                    ? 'text-[var(--ink)]'
                                    : 'text-[var(--faint)]'
                              }`}
                            >
                              {Number(date.slice(8))}
                            </strong>

                            {dayItems.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                {dayItems.slice(0, 4).map((item) => (
                                  <i
                                    key={item.id}
                                    className="inline-block h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[item.category] }}
                                  />
                                ))}
                                {dayItems.length > 4 && (
                                  <small className="font-mono text-[9.5px] font-semibold text-[var(--muted)]">
                                    +{dayItems.length - 4}
                                  </small>
                                )}
                              </div>
                            )}

                            {dayItems.length > 0 && (
                              <div className="w-full truncate text-[10.5px] font-semibold text-[var(--muted)]">
                                {dayItems[0].title}
                                {dayItems.length > 1 ? ` +${dayItems.length - 1}` : ''}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const allAgendaItems = rangeTimelines.flatMap((dt) => [
                ...dt.allDayItems,
                ...dt.timedItems,
              ]);
              const completedCount = allAgendaItems.filter((i) => i.isCompleted).length;
              const plannedCount = Math.max(0, allAgendaItems.length - completedCount);
              const activeDays = rangeTimelines.filter(
                (dt) => dt.allDayItems.length + dt.timedItems.length > 0
              ).length;

              return (
                <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-4 sm:p-6">
                  <div className="mx-auto max-w-4xl space-y-4">
                    {/* Plane-inspired Compact Workload Summary Strip */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-[2px] bg-[var(--blue)]" />
                          <span>Scheduled</span>
                        </div>
                        <div className="mt-1 font-mono text-[18px] font-bold text-[var(--ink)] tabular-nums">
                          {plannedCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-[2px] bg-[#2D9D87]" />
                          <span>Completed</span>
                        </div>
                        <div className="mt-1 font-mono text-[18px] font-bold text-[var(--ink)] tabular-nums">
                          {completedCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-[2px] bg-[#D58D38]" />
                          <span>Active days</span>
                        </div>
                        <div className="mt-1 font-mono text-[18px] font-bold text-[var(--ink)] tabular-nums">
                          {activeDays} / 14
                        </div>
                      </div>
                    </div>

                    {allAgendaItems.length === 0 ? (
                      <EmptyState
                        icon={<CalendarDays className="h-5 w-5" />}
                        title="No scheduled items in this 14-day window"
                        description="Add a commitment or seed your recurring templates from the top bar."
                      />
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                        {rangeTimelines.map((dt) => {
                          const items = [...dt.allDayItems, ...dt.timedItems];
                          if (items.length === 0) return null;
                          return (
                            <div
                              key={dt.dateStr}
                              className="border-b border-[var(--line)] last:border-b-0"
                            >
                              <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[12px] font-bold text-[var(--ink)]">
                                    {dt.dateStr}
                                  </span>
                                  {dt.dateStr === today && (
                                    <span className="rounded-[5px] bg-[var(--blue-lite)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--blue-ink)]">
                                      TODAY
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[10.5px] text-[var(--muted)]">
                                  {items.length} item{items.length === 1 ? '' : 's'}
                                </span>
                              </div>

                              <div className="divide-y divide-[var(--line)]">
                                {items.map((item) => (
                                  <div
                                    key={`${dt.dateStr}-${item.id}`}
                                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]/50"
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <CategoryMark category={item.category} size="sm" />
                                      <span className="w-[52px] shrink-0 font-mono text-[11px] text-[var(--muted)]">
                                        {item.startMin !== null
                                          ? formatMinutesToTime(item.startMin)
                                          : 'All-day'}
                                      </span>
                                      <div className="min-w-0">
                                        <div
                                          className={`truncate text-[13px] font-semibold text-[var(--ink)] ${
                                            item.isCompleted ? 'line-through opacity-55' : ''
                                          }`}
                                        >
                                          {item.title}
                                        </div>
                                        <div className="truncate text-[11px] text-[var(--muted)]">
                                          {CATEGORY_SHORT_LABELS[item.category]}
                                          {item.subtitle ? ` · ${item.subtitle}` : ''}
                                        </div>
                                      </div>
                                    </div>

                                    {item.recordedRun ? (
                                      <Link
                                        to={`/runs/${item.recordedRun.id}`}
                                        className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--blue)] hover:bg-[var(--blue-lite)]"
                                      >
                                        Open Run
                                      </Link>
                                    ) : item.block ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => openEditBlockModal(item.block!)}
                                          className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteBlock(item.block!.id)}
                                          aria-label={`Delete ${item.title}`}
                                          className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
      {showBlockModal && user && (
        <ScheduleBlockModal
          initialBlock={modalInitialBlock}
          defaultDate={selectedDate}
          onClose={() => {
            setShowBlockModal(false);
            setModalInitialBlock(null);
            setEditingBlockId(null);
          }}
          onSave={async (draft) => {
            if (editingBlockId) {
              await updateScheduleBlock(user.id, editingBlockId, draft);
            } else {
              await createScheduleBlock(user.id, draft);
            }
            await loadData();
          }}
        />
      )}

      {showReadinessModal && user && (
        <ReadinessCheckInModal
          initialCheckIn={todayCheckIn}
          defaultDate={today}
          onClose={() => setShowReadinessModal(false)}
          onSave={async (draft) => {
            await upsertReadinessCheckIn(user.id, draft);
            await loadData();
          }}
        />
      )}
    </div>
  );
}