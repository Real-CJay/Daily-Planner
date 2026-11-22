import { addDaysIso, getMondayIso, getWeekDatesIso } from '@/modules/calendar/timelineEngine';
import type { ScheduleBlock, ScheduleBlockDraft } from '@/types/domain';

export interface ReadingLogMeta {
  bookTitle: string;
  author: string | null;
  pagesRead: number;
  currentPage: number | null;
  totalPages: number | null;
  durationMin: number;
  notes: string | null;
}

export interface ReadingLogEntry {
  id: string;
  block: ScheduleBlock;
  date: string;
  meta: ReadingLogMeta;
}

export interface BookSummary {
  bookTitle: string;
  author: string | null;
  totalPagesRead: number;
  latestPage: number | null;
  totalPages: number | null;
  totalMinutes: number;
  sessionsCount: number;
  lastDate: string;
}

export interface ReadingStats {
  checkedToday: boolean;
  currentStreak: number;
  bestStreak: number;
  weekMinutes: number;
  weekPages: number;
  weekStatus: { date: string; completed: boolean; minutes: number; pages: number }[];
  books: BookSummary[];
}

const READING_META_PREFIX = '__READING_LOG__:';

export function serializeReadingMeta(meta: ReadingLogMeta): string {
  return `${READING_META_PREFIX}${JSON.stringify(meta)}`;
}

export function isReadingBlock(block: ScheduleBlock): boolean {
  return Boolean(block.notes && block.notes.startsWith(READING_META_PREFIX));
}

export function parseReadingMeta(block: ScheduleBlock): ReadingLogMeta | null {
  if (!block.notes || !block.notes.startsWith(READING_META_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      block.notes.slice(READING_META_PREFIX.length)
    ) as Partial<ReadingLogMeta>;
    return {
      bookTitle: parsed.bookTitle?.trim() || block.title || 'Untitled Book',
      author: parsed.author ?? null,
      pagesRead: Math.max(0, Number(parsed.pagesRead) || 0),
      currentPage: typeof parsed.currentPage === 'number' ? parsed.currentPage : null,
      totalPages: typeof parsed.totalPages === 'number' ? parsed.totalPages : null,
      durationMin: Math.max(1, Number(parsed.durationMin) || block.duration_min || 20),
      notes: parsed.notes ?? null,
    };
  } catch {
    return null;
  }
}

export function extractReadingEntries(blocks: ScheduleBlock[]): ReadingLogEntry[] {
  const entries: ReadingLogEntry[] = [];
  for (const b of blocks) {
    const meta = parseReadingMeta(b);
    if (!meta) continue;
    entries.push({ id: b.id, block: b, date: b.block_date, meta });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildReadingBlockDraft(date: string, meta: ReadingLogMeta): ScheduleBlockDraft {
  return {
    title: `Read · ${meta.bookTitle}`,
    category: 'CUSTOM',
    block_date: date,
    start_time: null,
    end_time: null,
    duration_min: Math.max(1, Math.round(meta.durationMin)),
    is_recurring: false,
    recurrence_days: [],
    status: 'COMPLETED',
    physical_load: 'NONE',
    notes: serializeReadingMeta(meta),
  };
}

export function calculateReadingStats(
  entries: ReadingLogEntry[],
  todayIso: string
): ReadingStats {
  const minByDate = new Map<string, number>();
  const pagesByDate = new Map<string, number>();
  const bookMap = new Map<string, BookSummary>();

  for (const e of entries) {
    minByDate.set(e.date, (minByDate.get(e.date) ?? 0) + e.meta.durationMin);
    pagesByDate.set(e.date, (pagesByDate.get(e.date) ?? 0) + e.meta.pagesRead);

    const key = e.meta.bookTitle.toLowerCase();
    const existing = bookMap.get(key);
    if (!existing) {
      bookMap.set(key, {
        bookTitle: e.meta.bookTitle,
        author: e.meta.author,
        totalPagesRead: e.meta.pagesRead,
        latestPage: e.meta.currentPage,
        totalPages: e.meta.totalPages,
        totalMinutes: e.meta.durationMin,
        sessionsCount: 1,
        lastDate: e.date,
      });
    } else {
      existing.totalPagesRead += e.meta.pagesRead;
      existing.totalMinutes += e.meta.durationMin;
      existing.sessionsCount += 1;
      if (e.meta.author && !existing.author) existing.author = e.meta.author;
      if (e.meta.totalPages && !existing.totalPages) existing.totalPages = e.meta.totalPages;
      if (e.meta.currentPage !== null && (existing.latestPage === null || e.meta.currentPage > existing.latestPage)) {
        existing.latestPage = e.meta.currentPage;
      }
      if (e.date > existing.lastDate) existing.lastDate = e.date;
    }
  }

  const dates = new Set(minByDate.keys());
  const checkedToday = dates.has(todayIso);

  let currentStreak = 0;
  let cursor = checkedToday ? todayIso : addDaysIso(todayIso, -1);
  while (dates.has(cursor)) {
    currentStreak++;
    cursor = addDaysIso(cursor, -1);
  }

  const sorted = Array.from(dates).sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) run = 1;
    else run = sorted[i] === addDaysIso(sorted[i - 1], 1) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  const monday = getMondayIso(todayIso);
  const weekDates = getWeekDatesIso(monday);
  const weekStatus = weekDates.map((d) => ({
    date: d,
    completed: dates.has(d),
    minutes: minByDate.get(d) ?? 0,
    pages: pagesByDate.get(d) ?? 0,
  }));

  const weekMinutes = weekStatus.reduce((s, d) => s + d.minutes, 0);
  const weekPages = weekStatus.reduce((s, d) => s + d.pages, 0);
  const books = Array.from(bookMap.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));

  return {
    checkedToday,
    currentStreak,
    bestStreak,
    weekMinutes,
    weekPages,
    weekStatus,
    books,
  };
}
