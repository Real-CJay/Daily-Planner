import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, mapCategoryToDomain, type DomainId } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { V2BlockModal } from '@/components/v2/V2BlockModal';
import { V2InboxDrawer } from '@/components/v2/V2InboxDrawer';
import { V2ReadinessModal } from '@/components/v2/V2ReadinessModal';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  deleteScheduleCompletion,
  listReadinessCheckIns,
  listScheduleBlocks,
  listScheduleCompletions,
  updateScheduleBlock,
  upsertReadinessCheckIn,
  upsertScheduleCompletion,
} from '@/modules/calendar/repository';
import { addDaysIso, getIsoWeekday, getMonthGridDates } from '@/modules/calendar/scheduleEngine';
import type {
  ReadinessCheckIn,
  ReadinessCheckInDraft,
  ScheduleBlock,
  ScheduleBlockDraft,
  ScheduleCompletion,
} from '@/types/domain';

type CalendarViewMode = 'week' | 'day' | 'month' | 'agenda';

const FILTER_DOMAINS: DomainId[] = [
  'running',
  'strength',
  'karate',
  'music',
  'recovery',
  'reading',
  'health',
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dow: days[dt.getUTCDay()],
    dayNum: d,
    monthName: months[dt.getUTCMonth()],
    year: y,
    short: `${months[dt.getUTCMonth()]} ${d}`,
    full: `${days[dt.getUTCDay()]}, ${months[dt.getUTCMonth()]} ${d}`,
  };
}

function fmtTime12(hhmm: string | null): string {
  if (!hhmm) return 'Anytime';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeToMin(hhmm: string | null): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtGap(mins: number): string {
  if (mins < 60) return `${mins}m open`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m open` : `${h}h open`;
}

function pillShortName(title: string): string {
  const first = (title || '').split(' ')[0];
  return first.length > 10 ? `${first.slice(0, 9)}.` : first;
}

function isInboxBlock(block: ScheduleBlock): boolean {
  return !block.is_recurring && !block.start_time;
}

function occursOnDate(block: ScheduleBlock, dateIso: string): boolean {
  if (isInboxBlock(block)) return false;
  if (block.is_recurring && block.recurrence_days.length > 0) {
    return block.recurrence_days.includes(getIsoWeekday(dateIso));
  }
  return block.block_date === dateIso;
}

export function CalendarPage() {
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const initialDate = searchParams.get('date') || today;
  const initialViewParam = searchParams.get('view');
  const initialView: CalendarViewMode =
    initialViewParam === 'week' || initialViewParam === 'month' || initialViewParam === 'agenda'
      ? initialViewParam
      : 'day';

  const [calView, setCalView] = useState<CalendarViewMode>(initialView);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [weekStart, setWeekStart] = useState(() => getMondayWeekStart(initialDate));
  const [filterDomain, setFilterDomain] = useState<'all' | DomainId>('all');

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [readinessList, setReadinessList] = useState<ReadinessCheckIn[]>([]);

  const [blockModal, setBlockModal] = useState<{
    open: boolean;
    block: ScheduleBlock | null;
    defaultDate: string;
  }>({ open: false, block: null, defaultDate: today });
  const [savingBlock, setSavingBlock] = useState(false);

  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxBusyId, setInboxBusyId] = useState<string | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [savingReadiness, setSavingReadiness] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [showPastAgenda, setShowPastAgenda] = useState(false);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );

  const selectedYear = Number(selectedDate.slice(0, 4));
  const selectedMonthIdx = Number(selectedDate.slice(5, 7)) - 1;
  const monthCells = useMemo(
    () => getMonthGridDates(selectedYear, selectedMonthIdx),
    [selectedYear, selectedMonthIdx]
  );

  const rangeStart = calView === 'month' ? monthCells[0] : weekDates[0];
  const rangeEnd = calView === 'month' ? monthCells[monthCells.length - 1] : weekDates[6];

  const loadData = useCallback(async () => {
    if (!user) return;
    const [blks, comps, ready] = await Promise.all([
      listScheduleBlocks(user.id),
      listScheduleCompletions(user.id, rangeStart, rangeEnd),
      listReadinessCheckIns(user.id, 14),
    ]);
    setBlocks(blks);
    setCompletions(comps);
    setReadinessList(ready);
  }, [user, rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const completionMap = useMemo(() => {
    const m = new Map<string, ScheduleCompletion>();
    for (const c of completions) {
      m.set(`${c.block_id}__${c.occurrence_date}`, c);
    }
    return m;
  }, [completions]);

  const inboxBlocks = useMemo(() => blocks.filter(isInboxBlock), [blocks]);

  const filteredBlocks = useMemo(() => {
    if (filterDomain === 'all') return blocks;
    return blocks.filter((b) => mapCategoryToDomain(b.category) === filterDomain);
  }, [blocks, filterDomain]);

  const todayReadiness = useMemo(
    () => readinessList.find((r) => r.checkin_date === today) ?? readinessList[0] ?? null,
    [readinessList, today]
  );

  const readinessScore = useMemo(() => {
    if (!todayReadiness) return null;
    const e = todayReadiness.energy_level ?? 3;
    const s = todayReadiness.sleep_quality ?? 3;
    const sore = todayReadiness.muscle_soreness ?? 3;
    return Math.round(((e + s + (6 - sore)) / 15) * 100);
  }, [todayReadiness]);

  function getBlocksForDate(iso: string): ScheduleBlock[] {
    return filteredBlocks
      .filter((b) => occursOnDate(b, iso))
      .sort((a, b) => (a.start_time ?? '23:59').localeCompare(b.start_time ?? '23:59'));
  }

  function shiftPeriod(delta: number) {
    if (calView === 'month') {
      const nextDt = new Date(Date.UTC(selectedYear, selectedMonthIdx + delta, 1));
      const nextIso = nextDt.toISOString().slice(0, 10);
      setSelectedDate(nextIso);
      setWeekStart(getMondayWeekStart(nextIso));
    } else if (calView === 'day') {
      const nextIso = addDaysIso(selectedDate, delta);
      setSelectedDate(nextIso);
      setWeekStart(getMondayWeekStart(nextIso));
    } else {
      const nextWeek = addDaysIso(weekStart, delta * 7);
      setWeekStart(nextWeek);
      setSelectedDate(nextWeek);
    }
  }

  async function handleToggleDone(block: ScheduleBlock, dateIso: string, e: MouseEvent) {
    if (!user) return;
    const key = `${block.id}__${dateIso}`;
    if (togglingKey === key) return;
    setTogglingKey(key);
    const existing = completionMap.get(key);
    try {
      if (existing?.status === 'COMPLETED') {
        await deleteScheduleCompletion(user.id, block.id, dateIso);
      } else {
        await upsertScheduleCompletion(user.id, {
          block_id: block.id,
          occurrence_date: dateIso,
          status: 'COMPLETED',
          strength_focus: block.category === 'STRENGTH' ? 'UPPER' : null,
          duration_min: block.duration_min ?? 30,
          physical_load: block.physical_load,
          notes: null,
        });
        triggerConfetti(e.clientX, e.clientY);
      }
      const fresh = await listScheduleCompletions(user.id, rangeStart, rangeEnd);
      setCompletions(fresh);
    } finally {
      setTogglingKey(null);
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
        pushToast('Block added', '#2563EB');
      }
      setBlockModal({ open: false, block: null, defaultDate: selectedDate });
      await loadData();
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!user) return;
    setSavingBlock(true);
    try {
      await deleteScheduleBlock(user.id, blockId);
      setBlockModal({ open: false, block: null, defaultDate: selectedDate });
      pushToast('Block deleted', '#DB2777');
      await loadData();
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleAddInbox(title: string) {
    if (!user) return;
    await createScheduleBlock(user.id, {
      title,
      category: 'CUSTOM',
      block_date: today,
      start_time: null,
      end_time: null,
      duration_min: 30,
      is_recurring: false,
      recurrence_days: [],
      status: 'PLANNED',
      physical_load: 'NONE',
      notes: 'Inbox',
    });
    pushToast('Added to Inbox', '#4F46E5');
    await loadData();
  }

  async function handleScheduleInbox(block: ScheduleBlock) {
    if (!user) return;
    setInboxBusyId(block.id);
    try {
      await updateScheduleBlock(user.id, block.id, {
        title: block.title,
        category: block.category,
        block_date: selectedDate,
        start_time: '16:00',
        end_time: '16:30',
        duration_min: block.duration_min ?? 30,
        is_recurring: false,
        recurrence_days: [],
        status: 'PLANNED',
        physical_load: block.physical_load,
        notes: block.notes,
      });
      pushToast(`Scheduled "${block.title}"`, '#10B981');
      await loadData();
    } finally {
      setInboxBusyId(null);
    }
  }

  async function handleDeleteInbox(blockId: string) {
    if (!user) return;
    setInboxBusyId(blockId);
    try {
      await deleteScheduleBlock(user.id, blockId);
      await loadData();
    } finally {
      setInboxBusyId(null);
    }
  }

  async function handleSaveReadiness(draft: ReadinessCheckInDraft) {
    if (!user) return;
    setSavingReadiness(true);
    try {
      await upsertReadinessCheckIn(user.id, draft);
      setReadinessOpen(false);
      pushToast('Readiness updated', '#0D9488');
      await loadData();
    } finally {
      setSavingReadiness(false);
    }
  }

  const sleepDom = getDom('sleep', isDark);
  const healthDom = getDom('health', isDark);
  const readDom = getDom('reading', isDark);
  const monthPrefix = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}`;
  const agendaTotalBlocks = weekDates.reduce((acc, iso) => acc + getBlocksForDate(iso).length, 0);
  const agendaDoneBlocks = weekDates.reduce(
    (acc, iso) =>
      acc +
      getBlocksForDate(iso).filter(
        (b) => completionMap.get(`${b.id}__${iso}`)?.status === 'COMPLETED'
      ).length,
    0
  );
  const agendaActiveDays = weekDates.filter((iso) => getBlocksForDate(iso).length > 0).length;

  return (
    <div className="animate-pop flex flex-1 flex-col space-y-5">
      {/* Toolbar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-4 ${T.card}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftPeriod(-1)}
            aria-label="Previous"
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedDate(today);
              setWeekStart(getMondayWeekStart(today));
            }}
            className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-extrabold ${T.btnNeutral}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftPeriod(1)}
            aria-label="Next"
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
          >
            ›
          </button>
          <span className={`ml-1 font-display text-sm font-extrabold tabular-nums sm:text-base ${T.text}`}>
            {calView === 'month'
              ? `${fmtDate(selectedDate).monthName} ${selectedYear}`
              : `${fmtDate(weekDates[0]).short} – ${fmtDate(weekDates[6]).short}`}
          </span>
        </div>

        {/* Segmented View Switcher */}
        <div className={`inline-flex rounded-2xl border p-1 ${T.cardSubtle}`}>
          {(['day', 'week', 'month', 'agenda'] as CalendarViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCalView(v)}
              className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-extrabold capitalize transition-all active:scale-[0.98] ${
                calView === v
                  ? isDark
                    ? 'bg-[#242424] text-[#F5F5F5]'
                    : 'bg-white text-[#0F172A] shadow-sm'
                  : T.muted
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInboxOpen(true)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold ${T.btnNeutral}`}
          >
            Inbox
            <span className={`rounded-md px-1.5 py-0.5 tabular-nums ${sleepDom.soft} ${sleepDom.text}`}>
              {inboxBlocks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setReadinessOpen(true)}
            className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-extrabold tabular-nums transition-all active:scale-[0.98] ${healthDom.soft} ${healthDom.border} ${healthDom.text}`}
          >
            {readinessScore !== null ? `Readiness ${readinessScore}%` : 'Readiness'}
          </button>

          <button
            type="button"
            onClick={() => setBlockModal({ open: true, block: null, defaultDate: selectedDate })}
            className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold ${T.btnPrimary}`}
          >
            + Add block
          </button>
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterDomain('all')}
          className={`shrink-0 cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all active:scale-[0.98] ${
            filterDomain === 'all' ? T.btnInk : T.btnWhite
          }`}
        >
          All
        </button>
        {FILTER_DOMAINS.map((cid) => {
          const d = getDom(cid, isDark);
          const sel = filterDomain === cid;
          return (
            <button
              key={cid}
              type="button"
              onClick={() => setFilterDomain(cid)}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all active:scale-[0.98] ${
                sel ? `${d.bg} border-transparent text-white` : `${T.card} ${T.muted} hover:${T.text}`
              }`}
            >
              <span className={sel ? 'text-white' : d.text}>
                <DuoIcon name={cid} className="h-3.5 w-3.5" />
              </span>
              {d.label}
            </button>
          );
        })}
      </div>

      {/* WEEK VIEW */}
      {calView === 'week' && (
        <div className="grid flex-1 grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-7">
          {weekDates.map((iso) => {
            const f = fmtDate(iso);
            const isToday = iso === today;
            const dayEvs = getBlocksForDate(iso);
            return (
              <div
                key={iso}
                className={`flex h-full min-h-[calc(100vh-235px)] flex-col justify-between gap-3 rounded-3xl border p-3.5 ${
                  isToday
                    ? isDark
                      ? 'border-[#3B82F6] bg-[#101010]'
                      : 'border-[#2563EB] bg-white'
                    : T.card
                }`}
              >
                <div className="space-y-2.5">
                  <div className={`flex items-center justify-between border-b pb-2 ${T.divider}`}>
                    <div>
                      <span
                        className={`block text-[10px] font-extrabold uppercase ${
                          isToday ? 'text-[#2563EB]' : T.muted
                        }`}
                      >
                        {f.dow}
                      </span>
                      <span
                        className={`font-display text-xl font-extrabold tabular-nums ${
                          isToday ? (isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]') : T.text
                        }`}
                      >
                        {f.dayNum}
                      </span>
                    </div>
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold tabular-nums ${T.cardSubtle} ${T.muted}`}
                    >
                      {dayEvs.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dayEvs.map((ev) => {
                      const domId = mapCategoryToDomain(ev.category);
                      const d = getDom(domId, isDark);
                      const done = completionMap.get(`${ev.id}__${iso}`)?.status === 'COMPLETED';
                      return (
                        <div
                          key={`${ev.id}-${iso}`}
                          className={`rounded-2xl border p-2.5 transition-all ${
                            done
                              ? isDark
                                ? 'border-[#34D399]/30 bg-[#10B981]/10'
                                : 'border-[#A7F3D0] bg-[#ECFDF5]'
                              : `${d.soft} ${d.border}`
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setBlockModal({ open: true, block: ev, defaultDate: iso })
                              }
                              className="min-w-0 flex-1 cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={d.text}>
                                  <DuoIcon name={domId} className="h-4 w-4" />
                                </span>
                                <span className={`text-[10px] font-extrabold tabular-nums ${T.muted}`}>
                                  {fmtTime12(ev.start_time)}
                                </span>
                              </div>
                              <div
                                className={`mt-1 font-display text-xs font-bold leading-snug ${
                                  done ? `line-through opacity-60 ${T.muted}` : T.text
                                }`}
                              >
                                {ev.title}
                              </div>
                              <span
                                className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                                  isDark ? 'bg-black/50' : 'bg-white/80'
                                } ${d.text}`}
                              >
                                {d.label} · {ev.duration_min ?? 30}m
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => void handleToggleDone(ev, iso, e)}
                              className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-[11px] font-extrabold transition-all active:scale-95 ${
                                done
                                  ? 'border-transparent bg-[#059669] text-white'
                                  : isDark
                                    ? 'border-[#333333] bg-[#101010] text-transparent hover:border-[#34D399]'
                                    : 'border-[#CBD5E1] bg-white text-transparent hover:border-[#059669]'
                              }`}
                            >
                              ✓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setBlockModal({ open: true, block: null, defaultDate: iso })}
                  className={`w-full cursor-pointer rounded-xl py-2 text-xs font-extrabold ${T.btnNeutral}`}
                >
                  + Add
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* DAY VIEW */}
      {calView === 'day' && (() => {
        const dayEvs = getBlocksForDate(selectedDate);
        const doneN = dayEvs.filter(
          (e) => completionMap.get(`${e.id}__${selectedDate}`)?.status === 'COMPLETED'
        ).length;
        return (
          <div className="space-y-5">
            <div className={`grid grid-cols-7 gap-2 rounded-3xl border p-2.5 ${T.card}`}>
              {weekDates.map((iso) => {
                const f = fmtDate(iso);
                const sel = iso === selectedDate;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedDate(iso)}
                    className={`flex cursor-pointer flex-col items-center rounded-2xl border py-2.5 transition-all active:scale-[0.98] ${
                      sel
                        ? 'border-transparent bg-[#2563EB] text-white'
                        : `${T.cardSubtle} ${T.text} ${T.surfaceHover}`
                    }`}
                  >
                    <span className={`text-[10px] font-extrabold uppercase ${sel ? 'text-blue-100' : T.muted}`}>
                      {f.dow}
                    </span>
                    <span className="font-display text-lg font-extrabold tabular-nums">{f.dayNum}</span>
                  </button>
                );
              })}
            </div>

            <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
              <div className="flex items-center justify-between">
                <h2 className={`font-display text-xl font-extrabold ${T.text}`}>
                  {fmtDate(selectedDate).full}
                </h2>
                <span
                  className={`rounded-xl border px-3 py-1 text-xs font-extrabold tabular-nums ${readDom.soft} ${readDom.border} ${readDom.text}`}
                >
                  {doneN} / {dayEvs.length} done
                </span>
              </div>

              <div className="space-y-3">
                {dayEvs.length === 0 && (
                  <div
                    className={`rounded-2xl border border-dashed p-8 text-center text-sm font-bold ${T.cardSubtle} ${T.muted}`}
                  >
                    Open day · Tap + Add block
                  </div>
                )}
                {dayEvs.map((ev, idx) => {
                  const domId = mapCategoryToDomain(ev.category);
                  const d = getDom(domId, isDark);
                  const done = completionMap.get(`${ev.id}__${selectedDate}`)?.status === 'COMPLETED';
                  const prevEv = idx > 0 ? dayEvs[idx - 1] : null;
                  const gapMin =
                    prevEv && ev.start_time && prevEv.start_time
                      ? timeToMin(ev.start_time) -
                        (timeToMin(prevEv.start_time) + (prevEv.duration_min ?? 30))
                      : 0;

                  return (
                    <div key={`${ev.id}-${selectedDate}`} className="space-y-3">
                      {gapMin >= 15 && (
                        <div className="flex items-center gap-3 py-1">
                          <div className={`h-[1px] flex-1 ${isDark ? 'bg-[#242424]' : 'bg-[#E5E7EB]'}`} />
                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-extrabold tabular-nums ${T.cardSubtle} ${T.muted}`}
                          >
                            {fmtGap(gapMin)}
                          </span>
                          <div className={`h-[1px] flex-1 ${isDark ? 'bg-[#242424]' : 'bg-[#E5E7EB]'}`} />
                        </div>
                      )}
                      <div
                        className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                          done
                            ? isDark
                              ? 'border-[#34D399]/30 bg-[#10B981]/10'
                              : 'border-[#A7F3D0] bg-[#ECFDF5]/60'
                            : T.card
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <div
                            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${d.soft} ${d.border} ${d.text}`}
                          >
                            <DuoIcon name={domId} className="h-8 w-8" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-lg border px-2.5 py-0.5 text-xs font-extrabold tabular-nums ${T.cardSubtle} ${T.text}`}
                              >
                                {fmtTime12(ev.start_time)}
                              </span>
                              <span
                                className={`rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${d.soft} ${d.text}`}
                              >
                                {d.label} · {ev.duration_min ?? 30}m
                              </span>
                            </div>
                            <h3
                              className={`mt-1 font-display text-base font-extrabold sm:text-lg ${
                                done ? `line-through ${T.muted}` : T.text
                              }`}
                            >
                              {ev.title}
                            </h3>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setBlockModal({ open: true, block: ev, defaultDate: selectedDate })
                            }
                            className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-extrabold ${T.btnNeutral}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => void handleToggleDone(ev, selectedDate, e)}
                            className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold ${
                              done ? T.btnSuccess : T.btnNeutral
                            }`}
                          >
                            {done ? '✓ Done' : 'Done'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MONTH VIEW — VERTICAL-FIRST THEN HORIZONTAL PILL STACKING */}
      {calView === 'month' && (
        <div className={`space-y-3 rounded-3xl border p-4 sm:p-6 ${T.card}`}>
          <div className="grid grid-cols-7 gap-2 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((h) => (
              <div
                key={h}
                className={`pb-1 text-[11px] font-extrabold uppercase tracking-wider ${T.muted}`}
              >
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {monthCells.map((iso) => {
              const inMonth = iso.startsWith(monthPrefix);
              const isToday = iso === today;
              const evs = getBlocksForDate(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    setSelectedDate(iso);
                    setWeekStart(getMondayWeekStart(iso));
                    setCalView('day');
                  }}
                  className={`flex min-h-[118px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-2.5 text-left transition-all active:scale-[0.99] sm:min-h-[128px] ${
                    isToday
                      ? isDark
                        ? 'border-[#3B82F6] bg-[#2563EB]/15'
                        : 'border-[#2563EB] bg-[#EFF6FF]/80'
                      : inMonth
                        ? `${T.cardSubtle} ${T.surfaceHover}`
                        : 'border-transparent opacity-35'
                  }`}
                >
                  <div className="mb-1.5 flex w-full items-center justify-between">
                    <span
                      className={`font-display text-xs font-extrabold tabular-nums sm:text-sm ${
                        isToday ? (isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]') : T.text
                      }`}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    {evs.length > 0 && (
                      <span className={`text-[10px] font-extrabold tabular-nums ${T.muted}`}>
                        {evs.length}
                      </span>
                    )}
                  </div>

                  {/* Stack vertically first (3 rows), then flow horizontally */}
                  <div className="grid w-full auto-cols-max grid-flow-col grid-rows-3 content-start items-start gap-1 overflow-x-hidden">
                    {evs.slice(0, 6).map((ev) => {
                      const domId = mapCategoryToDomain(ev.category);
                      const d = getDom(domId, isDark);
                      const done = completionMap.get(`${ev.id}__${iso}`)?.status === 'COMPLETED';
                      return (
                        <span
                          key={`${ev.id}-${iso}`}
                          className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold leading-tight ${d.soft} ${d.border} ${d.text} ${
                            done ? 'line-through opacity-60' : ''
                          }`}
                        >
                          <span className="hidden sm:inline">{pillShortName(ev.title)}</span>
                          <span className={`h-2 w-2 rounded-full sm:hidden ${d.bg}`} />
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AGENDA VIEW */}
      {calView === 'agenda' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Scheduled', val: agendaTotalBlocks, icon: 'running' as const, domId: 'running' as DomainId },
              { label: 'Completed', val: agendaDoneBlocks, icon: 'reading' as const, domId: 'reading' as DomainId },
              { label: 'Active Days', val: agendaActiveDays, icon: 'flame' as const, domId: 'karate' as DomainId },
            ].map((kpi) => {
              const d = getDom(kpi.domId, isDark);
              return (
                <div key={kpi.label} className={`flex items-center gap-4 rounded-3xl border p-5 ${T.card}`}>
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${d.soft} ${d.border} ${d.text}`}
                  >
                    <DuoIcon name={kpi.icon} className="h-8 w-8" />
                  </div>
                  <div>
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider ${T.muted}`}>
                      {kpi.label}
                    </span>
                    <div className={`font-display text-3xl font-extrabold tabular-nums ${T.text}`}>
                      {kpi.val}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(() => {
            const isCurrentWeek = weekDates.includes(today);
            const upcomingDates = isCurrentWeek
              ? weekDates.filter((iso) => iso >= today)
              : weekDates;
            const pastDates = isCurrentWeek
              ? weekDates.filter((iso) => iso < today && getBlocksForDate(iso).length > 0)
              : [];

            const renderAgendaDay = (iso: string) => {
              const evs = getBlocksForDate(iso);
              if (evs.length === 0) return null;
              const isToday = iso === today;
              return (
                <div
                  key={iso}
                  className={`space-y-3 rounded-3xl border p-5 ${
                    isToday
                      ? isDark
                        ? 'border-[#3B82F6] bg-[#101010]'
                        : 'border-[#2563EB] bg-white'
                      : T.card
                  }`}
                >
                  <div className={`flex items-center justify-between border-b pb-2 ${T.divider}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-display text-base font-extrabold ${
                          isToday ? (isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]') : T.text
                        }`}
                      >
                        {fmtDate(iso).full}
                      </span>
                      {isToday && (
                        <span className="rounded-lg bg-[#2563EB] px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
                          Today
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-extrabold tabular-nums ${T.muted}`}>
                      {evs.length} blocks
                    </span>
                  </div>
                  <div className="space-y-2">
                    {evs.map((ev) => {
                      const domId = mapCategoryToDomain(ev.category);
                      const d = getDom(domId, isDark);
                      const done = completionMap.get(`${ev.id}__${iso}`)?.status === 'COMPLETED';
                      return (
                        <div
                          key={`${ev.id}-${iso}`}
                          className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${T.cardSubtle}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => void handleToggleDone(ev, iso, e)}
                              className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-xl border text-xs font-extrabold ${
                                done
                                  ? 'border-transparent bg-[#059669] text-white'
                                  : `${T.card} text-transparent hover:border-[#10B981]`
                              }`}
                            >
                              ✓
                            </button>
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${d.soft} ${d.text}`}
                            >
                              <DuoIcon name={domId} className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <div
                                className={`truncate font-display text-sm font-bold ${
                                  done ? `line-through ${T.muted}` : T.text
                                }`}
                              >
                                {ev.title}
                              </div>
                              <span className={`text-[11px] font-bold tabular-nums ${T.muted}`}>
                                {fmtTime12(ev.start_time)} · {ev.duration_min ?? 30}m
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setBlockModal({ open: true, block: ev, defaultDate: iso })
                            }
                            className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-extrabold ${T.btnWhite}`}
                          >
                            Edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-4">
                {upcomingDates.map(renderAgendaDay)}
                {pastDates.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPastAgenda((v) => !v)}
                      className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
                    >
                      {showPastAgenda
                        ? `Hide earlier this week (${pastDates.length})`
                        : `Show earlier this week (${pastDates.length})`}
                    </button>
                    {showPastAgenda && pastDates.map(renderAgendaDay)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Modals & Drawers */}
      {blockModal.open && (
        <V2BlockModal
          isDark={isDark}
          block={blockModal.block}
          defaultDate={blockModal.defaultDate}
          saving={savingBlock}
          onClose={() => setBlockModal({ open: false, block: null, defaultDate: selectedDate })}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
        />
      )}

      {inboxOpen && (
        <V2InboxDrawer
          isDark={isDark}
          items={inboxBlocks}
          busyId={inboxBusyId}
          onClose={() => setInboxOpen(false)}
          onAdd={handleAddInbox}
          onScheduleToday={handleScheduleInbox}
          onDelete={handleDeleteInbox}
        />
      )}

      {readinessOpen && (
        <V2ReadinessModal
          isDark={isDark}
          todayIso={today}
          existing={todayReadiness}
          saving={savingReadiness}
          onClose={() => setReadinessOpen(false)}
          onSave={handleSaveReadiness}
        />
      )}
    </div>
  );
}
