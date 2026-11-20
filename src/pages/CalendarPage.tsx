import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  CategoryBadge,
  EmptyState,
  PageHeader,
  ProvenanceBadge,
} from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listReadinessCheckIns,
  listScheduleBlocks,
  seedDefaultRecurringSchedule,
  updateScheduleBlock,
  upsertReadinessCheckIn,
} from '@/modules/calendar/repository';
import {
  ISO_WEEKDAYS,
  addDaysIso,
  evaluateReadiness,
  expandCalendarOccurrences,
  getMonthGridDates,
  getWeekDates,
} from '@/modules/calendar/scheduleEngine';
import { ScheduleBlockModal } from '@/modules/calendar/ScheduleBlockModal';
import { ReadinessCheckInModal } from '@/modules/calendar/ReadinessCheckInModal';
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
} from '@/types/domain';

type CalendarView = 'WEEK' | 'MONTH' | 'AGENDA';

const ALL_CATEGORIES: ActivityCategory[] = [
  'RUNNING',
  'KARATE',
  'STRENGTH',
  'RECOVERY',
  'VOCAL',
  'DRUMMING',
  'UNIVERSITY',
  'CUSTOM',
];

export function CalendarPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [view, setView] = useState<CalendarView>('WEEK');
  const [anchorDate, setAnchorDate] = useState(today);
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | 'ALL'>('ALL');

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [blockRows, runRows, checkInRows] = await Promise.all([
        listScheduleBlocks(user.id),
        listRunningSessions(user.id),
        listReadinessCheckIns(user.id, 30),
      ]);
      setBlocks(blockRows);
      setRuns(runRows);
      setCheckIns(checkInRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar data.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const [anchorYear, anchorMonth] = useMemo(() => {
    const [y, m] = anchorDate.split('-').map(Number);
    return [y, m - 1] as const;
  }, [anchorDate]);

  const visibleDates = useMemo(() => {
    if (view === 'MONTH') return getMonthGridDates(anchorYear, anchorMonth);
    if (view === 'WEEK') return getWeekDates(anchorDate);
    return getWeekDates(anchorDate); // Agenda displays 14-day window starting from anchor week
  }, [view, anchorYear, anchorMonth, anchorDate]);

  const rangeStart = visibleDates[0];
  const rangeEnd = view === 'AGENDA' ? addDaysIso(rangeStart, 13) : visibleDates[visibleDates.length - 1];

  const occurrences = useMemo(() => {
    const all = expandCalendarOccurrences(blocks, runs, rangeStart, rangeEnd);
    if (categoryFilter === 'ALL') return all;
    return all.filter((o) => o.category === categoryFilter);
  }, [blocks, runs, rangeStart, rangeEnd, categoryFilter]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, typeof occurrences>();
    for (const occ of occurrences) {
      const list = map.get(occ.date) ?? [];
      list.push(occ);
      map.set(occ.date, list);
    }
    return map;
  }, [occurrences]);

  const todayCheckIn = useMemo(
    () => checkIns.find((c) => c.checkin_date === today) ?? null,
    [checkIns, today]
  );
  const readinessEval = useMemo(() => evaluateReadiness(todayCheckIn), [todayCheckIn]);

  function stepPeriod(direction: -1 | 1) {
    if (view === 'MONTH') {
      const next = new Date(Date.UTC(anchorYear, anchorMonth + direction, 1));
      setAnchorDate(next.toISOString().slice(0, 10));
    } else {
      setAnchorDate(addDaysIso(anchorDate, direction * 7));
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
          ? `Added ${added} recurring schedule template(s) (Wed/Fri Karate, daily Vocal, Drumming, Sunday Rest).`
          : 'Default recurring schedule templates are already present.'
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
    return `${rangeStart} → ${rangeEnd}`;
  }, [view, anchorYear, anchorMonth, rangeStart, rangeEnd]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unified Training Calendar"
        subtitle={`Monday–Sunday schedule (${tz}) separating running sessions from Karate, Vocal, Drumming, Rest Days, and University commitments.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowReadinessModal(true)}>
              <HeartPulse className="h-4 w-4 text-emerald-700" />
              <span>{todayCheckIn ? 'Update Readiness' : 'Daily Check-In'}</span>
            </Button>
            <Button
              onClick={() => {
                setEditingBlock(null);
                setShowBlockModal(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Add Schedule Block</span>
            </Button>
          </div>
        }
      />

      {/* Readiness Banner */}
      <Card className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Today&apos;s Readiness ({today}): {readinessEval.label}
              </span>
              {readinessEval.score !== null && (
                <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                  {readinessEval.score}/100
                </span>
              )}
              <ProvenanceBadge origin={todayCheckIn ? 'RECORDED' : 'MISSING'} />
            </div>
            <p className="mt-0.5 text-xs text-slate-600">{readinessEval.summary}</p>
            {readinessEval.flags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {readinessEval.flags.map((flag, idx) => (
                  <span
                    key={idx}
                    className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={() => setShowReadinessModal(true)} className="shrink-0">
          {todayCheckIn ? 'Edit Today' : 'Log Check-In'}
        </Button>
      </Card>

      {/* One-Click Recurring Template Seeding when no blocks exist */}
      {!loading && blocks.length === 0 && (
        <Card className="flex flex-col justify-between gap-4 border-blue-200 bg-blue-50/50 p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Load Default Weekly Commitments
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Adds recurring Wed/Fri Karate, daily Vocal Practice, Tue/Thu/Sat Drumming, and a
              protected Sunday Rest Day. You can edit or delete any block anytime.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={seeding}
            onClick={() => void handleSeedDefaults()}
            className="shrink-0 bg-white"
          >
            <Sparkles className="h-4 w-4" />
            <span>{seeding ? 'Adding...' : 'Seed Default Schedule'}</span>
          </Button>
        </Card>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {/* Calendar Toolbar */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepPeriod(-1)}
              aria-label="Previous period"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchorDate(today)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => stepPeriod(1)}
              aria-label="Next period"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 font-mono text-sm font-bold text-slate-900">{periodTitle}</span>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            {(['WEEK', 'MONTH', 'AGENDA'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  view === mode
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'WEEK' ? 'Week' : mode === 'MONTH' ? 'Month' : 'Agenda (14d)'}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
              categoryFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                categoryFilter === cat
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ACTIVITY_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </Card>

      {/* Calendar Views */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          Loading schedule...
        </div>
      ) : view === 'WEEK' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {visibleDates.map((date, idx) => {
            const dayItems = occurrencesByDate.get(date) ?? [];
            const isToday = date === today;
            return (
              <Card
                key={date}
                className={`flex min-h-[220px] flex-col p-3 ${
                  isToday ? 'border-blue-600 ring-1 ring-blue-600' : ''
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {ISO_WEEKDAYS[idx]?.short}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                      isToday ? 'bg-blue-700 text-white' : 'text-slate-900'
                    }`}
                  >
                    {date.slice(8)}
                  </span>
                </div>

                <div className="mt-2.5 flex-1 space-y-2">
                  {dayItems.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-400">Open</div>
                  ) : (
                    dayItems.map((occ) => (
                      <div
                        key={occ.occurrenceKey}
                        className={`rounded-lg border p-2 text-xs ${
                          occ.sourceType === 'RECORDED_RUN'
                            ? 'border-blue-200 bg-blue-50/70'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] text-slate-500">
                            {occ.startTime ?? (occ.sourceType === 'RECORDED_RUN' ? 'Run' : 'Anytime')}
                          </span>
                          <span className="rounded bg-white px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-600">
                            {occ.category}
                          </span>
                        </div>
                        {occ.sourceType === 'RECORDED_RUN' ? (
                          <Link
                            to={`/runs/${occ.sourceId}`}
                            className="mt-1 block font-semibold text-blue-800 hover:underline"
                          >
                            {occ.title}
                          </Link>
                        ) : (
                          <div className="mt-1 font-semibold text-slate-900">{occ.title}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : view === 'MONTH' ? (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
            {ISO_WEEKDAYS.map((d) => (
              <div key={d.iso} className="py-2.5">
                {d.short}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
            {visibleDates.map((date) => {
              const inMonth = Number(date.slice(5, 7)) - 1 === anchorMonth;
              const isToday = date === today;
              const dayItems = occurrencesByDate.get(date) ?? [];
              return (
                <div
                  key={date}
                  className={`min-h-[110px] p-2 ${inMonth ? 'bg-white' : 'bg-slate-50/70'}`}
                >
                  <div className="flex justify-end">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                        isToday
                          ? 'bg-blue-700 text-white'
                          : inMonth
                          ? 'text-slate-900'
                          : 'text-slate-400'
                      }`}
                    >
                      {date.slice(8)}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayItems.slice(0, 3).map((occ) => (
                      <div
                        key={occ.occurrenceKey}
                        className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          occ.sourceType === 'RECORDED_RUN'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                        title={occ.title}
                      >
                        {occ.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="px-1 text-[10px] font-medium text-slate-400">
                        +{dayItems.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : occurrences.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" />}
          title="No scheduled items in this 14-day window"
          description="Add a recurring commitment or seed your default weekly schedule."
        />
      ) : (
        <div className="space-y-2.5">
          {occurrences.map((occ) => (
            <Card key={occ.occurrenceKey} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900">{occ.date}</span>
                  {occ.startTime && (
                    <span className="font-mono text-xs text-slate-500">{occ.startTime}</span>
                  )}
                  <CategoryBadge category={occ.category} />
                  {occ.isRecurring && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      Recurring
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900">{occ.title}</div>
                {occ.notes && <p className="mt-0.5 text-xs text-slate-600">{occ.notes}</p>}
              </div>

              {occ.sourceType === 'RECORDED_RUN' ? (
                <Link
                  to={`/runs/${occ.sourceId}`}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Open Run
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const raw = blocks.find((b) => b.id === occ.sourceId);
                      if (raw) {
                        setEditingBlock(raw);
                        setShowBlockModal(true);
                      }
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteBlock(occ.sourceId)}
                    aria-label={`Delete ${occ.title}`}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showBlockModal && user && (
        <ScheduleBlockModal
          initialBlock={editingBlock}
          defaultDate={today}
          onClose={() => {
            setShowBlockModal(false);
            setEditingBlock(null);
          }}
          onSave={async (draft) => {
            if (editingBlock) {
              await updateScheduleBlock(user.id, editingBlock.id, draft);
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