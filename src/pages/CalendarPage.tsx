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
import { Button, Card, CategoryBadge, EmptyState } from '@/design-system';
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

const MONTH_CHIP_STYLES: Record<ActivityCategory, string> = {
  RUNNING:
    'bg-[#E8F9EF] text-[#114A2B] dark:bg-[#3C1C26] dark:text-[#FFE4E8]',
  KARATE:
    'bg-[#FEF3C7] text-[#78350F] dark:bg-[#3A2E1B] dark:text-[#FDE68A]',
  STRENGTH:
    'bg-teal-50 text-teal-900 dark:bg-[#143336] dark:text-teal-100',
  RECOVERY:
    'bg-emerald-50 text-emerald-900 dark:bg-[#133228] dark:text-emerald-100',
  VOCAL:
    'bg-rose-50 text-rose-900 dark:bg-[#381E2E] dark:text-pink-100',
  DRUMMING:
    'bg-violet-50 text-violet-900 dark:bg-[#2B2042] dark:text-violet-100',
  GUITAR:
    'bg-orange-50 text-orange-900 dark:bg-[#3A2418] dark:text-orange-100',
  KEYBOARD:
    'bg-sky-50 text-sky-900 dark:bg-[#162C3D] dark:text-sky-100',
  UNIVERSITY:
    'bg-slate-100 text-slate-800 dark:bg-[#272D3D] dark:text-slate-100',
  CUSTOM:
    'bg-[#F3F5F4] text-[#161C19] dark:bg-[#2A2C3A] dark:text-slate-100',
};

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
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-morgen-black">
      {/* Compact Single-Row Calendar Control Bar */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#E5EAE7] bg-white px-5 py-3.5 dark:border-morgen-border dark:bg-morgen-black">
        {/* Left: Date Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepPeriod(-1)}
            aria-label="Previous"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5EAE7] bg-white text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-white dark:hover:bg-morgen-elevated"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(today)}
            className="h-9 rounded-xl border border-[#E5EAE7] bg-white px-3.5 text-xs font-semibold text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-white dark:hover:bg-morgen-elevated"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => stepPeriod(1)}
            aria-label="Next"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5EAE7] bg-white text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-white dark:hover:bg-morgen-elevated"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h1 className="ml-2.5 font-display text-lg font-bold tracking-tight text-[#161C19] dark:text-white">
            {periodTitle}
          </h1>
        </div>

        {/* Center: View Switcher */}
        <div className="inline-flex rounded-xl border border-[#E5EAE7] bg-[#F8FAF9] p-1 text-xs font-semibold dark:border-morgen-border dark:bg-morgen-surface">
          {(
            [
              { id: 'WEEK', label: 'Week' },
              { id: 'TIMELINE', label: 'Day' },
              { id: 'MONTH', label: 'Month' },
              { id: 'AGENDA', label: 'Agenda' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                view === id
                  ? 'bg-[#176D3E] text-white dark:bg-morgen-rose dark:text-white'
                  : 'text-flomo-slate hover:text-[#161C19] dark:text-morgen-muted dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right: Compact Utility Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Seed templates button only if missing */}
          {!loading && (blocks.length === 0 || !hasStrengthBlock) && (
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeedDefaults()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#2CCC74]/50 bg-[#2CCC74]/10 px-2.5 text-xs font-semibold text-[#176D3E] hover:bg-[#2CCC74]/15 dark:border-morgen-red/40 dark:bg-morgen-wine dark:text-morgen-red"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{seeding ? 'Adding...' : 'Seed Templates'}</span>
            </button>
          )}

          {/* Compact Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterMenu((v) => !v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
                categoryFilter !== 'ALL'
                  ? 'border-[#176D3E] bg-[#176D3E]/10 text-[#176D3E] dark:border-morgen-red dark:bg-morgen-wine dark:text-morgen-red'
                  : 'border-[#E5EAE7] bg-white text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-body dark:hover:bg-morgen-elevated'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>
                {categoryFilter === 'ALL' ? 'Filter' : ACTIVITY_CATEGORY_LABELS[categoryFilter]}
              </span>
            </button>

            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowFilterMenu(false)}
                />
                <div className="absolute right-0 top-10 z-40 w-48 rounded-xl border border-[#E5EAE7] bg-white p-1.5 shadow-lg dark:border-morgen-border dark:bg-morgen-surface">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('ALL');
                      setShowFilterMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                      categoryFilter === 'ALL'
                        ? 'bg-[#176D3E] text-white dark:bg-morgen-rose'
                        : 'text-[#161C19] hover:bg-[#F7F9F8] dark:text-morgen-body dark:hover:bg-morgen-elevated'
                    }`}
                  >
                    <span>All Categories</span>
                  </button>
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(cat);
                        setShowFilterMenu(false);
                      }}
                      className={`mt-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                        categoryFilter === cat
                          ? 'bg-[#176D3E] text-white dark:bg-morgen-rose'
                          : 'text-[#161C19] hover:bg-[#F7F9F8] dark:text-morgen-body dark:hover:bg-morgen-elevated'
                      }`}
                    >
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
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${
              showInbox
                ? 'border-[#176D3E] bg-[#176D3E]/10 text-[#176D3E] dark:border-morgen-red dark:bg-morgen-wine dark:text-morgen-red'
                : 'border-[#E5EAE7] bg-white text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-body dark:hover:bg-morgen-elevated'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inbox</span>
            <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">
              {inboxBlocks.length}
            </span>
          </button>

          {/* Compact Readiness Pill */}
          <button
            type="button"
            onClick={() => setShowReadinessModal(true)}
            title={readinessEval.summary}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5EAE7] bg-white px-2.5 text-xs font-semibold text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-body dark:hover:bg-morgen-elevated"
          >
            <HeartPulse className="h-3.5 w-3.5 text-[#176D3E] dark:text-morgen-red" />
            <span className="hidden md:inline">
              {readinessEval.score !== null ? `${readinessEval.score}/100` : 'Check-In'}
            </span>
          </button>

          {/* Primary Add Block */}
          <Button
            onClick={openNewBlockModal}
            className="!min-h-[32px] !px-3 !py-1 !text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>
        </div>
      </div>

      {/* Slim Dismissible Alert Strip (only shown on error or notice) */}
      {(error || notice) && (
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1.5 text-xs font-medium ${
            error
              ? 'border-red-200 bg-red-50 text-red-800 dark:border-morgen-rose/40 dark:bg-morgen-wine/80 dark:text-morgen-red'
              : 'border-[#2CCC74]/40 bg-[#2CCC74]/10 text-[#176D3E] dark:border-emerald-400/30 dark:bg-emerald-950/60 dark:text-emerald-300'
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
          <div className="w-72 shrink-0 overflow-y-auto border-r border-[#E5EAE7] bg-[#F7F9F8]/60 p-3 dark:border-morgen-border dark:bg-morgen-black">
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
            <div className="flex flex-1 items-center justify-center text-sm text-flomo-slate dark:text-morgen-muted">
              Loading calendar...
            </div>
          ) : view === 'WEEK' ? (
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
          ) : view === 'TIMELINE' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white dark:bg-morgen-surface">
              <div className="grid shrink-0 grid-cols-7 border-b border-[#E5EAE7] bg-[#F7F9F8] text-center text-[11px] font-semibold uppercase tracking-wider text-flomo-slate dark:border-morgen-border dark:bg-morgen-black dark:text-morgen-muted">
                {ISO_WEEKDAYS.map((d) => (
                  <div key={d.iso} className="py-2">
                    {d.short}
                  </div>
                ))}
              </div>
              <div className="grid flex-1 auto-rows-fr grid-cols-7 divide-x divide-y divide-[#E5EAE7] dark:divide-morgen-border">
                {rangeTimelines.map((dt) => {
                  const date = dt.dateStr;
                  const inMonth = Number(date.slice(5, 7)) - 1 === anchorMonth;
                  const isToday = date === today;
                  const dayItems = [...dt.allDayItems, ...dt.timedItems];

                  return (
                    <div
                      key={date}
                      onClick={() => {
                        setSelectedDate(date);
                        setView('TIMELINE');
                      }}
                      className={`min-h-[112px] cursor-pointer p-1.5 transition-colors hover:bg-[#F7F9F8] dark:hover:bg-morgen-elevated/60 ${
                        inMonth
                          ? 'bg-white dark:bg-morgen-surface'
                          : 'bg-[#F7F9F8]/60 dark:bg-morgen-black/60'
                      }`}
                    >
                      <div className="flex justify-end">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                            isToday
                              ? 'bg-[#176D3E] text-white dark:bg-morgen-rose'
                              : inMonth
                                ? 'text-[#161C19] dark:text-white'
                                : 'text-flomo-slate/45 dark:text-morgen-muted/45'
                          }`}
                        >
                          {Number(date.slice(8))}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayItems.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            title={item.title}
                            className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              MONTH_CHIP_STYLES[item.category]
                            }`}
                          >
                            {item.startMin !== null && (
                              <span className="mr-1 font-mono text-[10px] opacity-75">
                                {formatMinutesToTime(item.startMin)}
                              </span>
                            )}
                            {item.title}
                          </div>
                        ))}
                        {dayItems.length > 3 && (
                          <div className="px-1 font-mono text-[10px] font-medium text-flomo-slate dark:text-morgen-muted">
                            +{dayItems.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="mx-auto max-w-4xl space-y-3">
                {rangeTimelines.every(
                  (dt) => dt.allDayItems.length === 0 && dt.timedItems.length === 0
                ) ? (
                  <EmptyState
                    icon={<CalendarDays className="h-5 w-5" />}
                    title="No scheduled items in this 14-day window"
                    description="Add a commitment or seed your recurring templates from the top bar."
                  />
                ) : (
                  rangeTimelines.map((dt) => {
                    const items = [...dt.allDayItems, ...dt.timedItems];
                    if (items.length === 0) return null;
                    return (
                      <div key={dt.dateStr} className="space-y-1.5">
                        <div className="flex items-center gap-2 pt-1">
                          <span className="font-mono text-xs font-bold text-[#161C19] dark:text-white">
                            {dt.dateStr}
                          </span>
                          {dt.dateStr === today && (
                            <span className="rounded bg-[#2CCC74]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#176D3E] dark:bg-morgen-wine dark:text-morgen-red">
                              TODAY
                            </span>
                          )}
                        </div>
                        {items.map((item) => (
                          <Card
                            key={`${dt.dateStr}-${item.id}`}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {item.startMin !== null && (
                                  <span className="font-mono text-xs text-flomo-slate dark:text-morgen-muted">
                                    {formatMinutesToTime(item.startMin)}
                                  </span>
                                )}
                                <CategoryBadge category={item.category} />
                                <span className="text-sm font-semibold text-[#161C19] dark:text-white">
                                  {item.title}
                                </span>
                              </div>
                              {item.subtitle && (
                                <p className="mt-0.5 text-xs text-flomo-slate dark:text-morgen-body/75">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>

                            {item.recordedRun ? (
                              <Link
                                to={`/runs/${item.recordedRun.id}`}
                                className="text-xs font-semibold text-[#176D3E] hover:underline dark:text-morgen-red"
                              >
                                Open Run
                              </Link>
                            ) : item.block ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditBlockModal(item.block!)}
                                  className="rounded-lg border border-[#E5EAE7] bg-white px-2.5 py-1 text-xs font-semibold text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:bg-morgen-surface dark:text-white dark:hover:bg-morgen-elevated"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteBlock(item.block!.id)}
                                  aria-label={`Delete ${item.title}`}
                                  className="rounded-lg border border-[#E5EAE7] p-1.5 text-flomo-slate hover:bg-red-50 hover:text-red-600 dark:border-morgen-border dark:text-morgen-muted dark:hover:bg-morgen-wine dark:hover:text-morgen-red"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </Card>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
