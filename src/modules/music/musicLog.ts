import {
  addDaysIso,
  getMondayIso,
  getWeekDatesIso,
} from '@/modules/calendar/timelineEngine';
import type {
  ScheduleBlock,
  ScheduleBlockDraft,
  ScheduleCompletion,
} from '@/types/domain';

export type MusicInstrument = 'VOCAL' | 'DRUMMING' | 'GUITAR' | 'KEYBOARD';

export const MAIN_MUSIC_INSTRUMENTS: MusicInstrument[] = ['VOCAL', 'DRUMMING'];
export const SECONDARY_MUSIC_INSTRUMENTS: MusicInstrument[] = ['GUITAR', 'KEYBOARD'];
export const ALL_MUSIC_INSTRUMENTS: MusicInstrument[] = [
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
];

export const MUSIC_INSTRUMENT_CONFIG: Record<
  MusicInstrument,
  {
    label: string;
    shortLabel: string;
    defaultMin: number;
    isMain: boolean;
    focusTags: string[];
    placeholder: string;
  }
> = {
  VOCAL: {
    label: 'Vocal',
    shortLabel: 'Vocal',
    defaultMin: 30,
    isMain: true,
    focusTags: ['Warmup', 'Breath', 'Scales', 'Pitch', 'Tone', 'Songs'],
    placeholder: 'e.g. Diaphragm warmups, head voice transitions, song phrasing...',
  },
  DRUMMING: {
    label: 'Drumming',
    shortLabel: 'Drums',
    defaultMin: 45,
    isMain: true,
    focusTags: ['Rudiments', 'Grooves', 'Metronome', 'Fills', 'Independence', 'Songs'],
    placeholder: 'e.g. Paradiddles at 105 BPM, ghost notes, pocket groove...',
  },
  GUITAR: {
    label: 'Guitar',
    shortLabel: 'Guitar',
    defaultMin: 30,
    isMain: false,
    focusTags: ['Chords', 'Fingerstyle', 'Scales', 'Rhythm', 'Songs'],
    placeholder: 'e.g. Chord transitions, strumming dynamics, song section...',
  },
  KEYBOARD: {
    label: 'Keyboard',
    shortLabel: 'Keys',
    defaultMin: 30,
    isMain: false,
    focusTags: ['Scales', 'Chords', 'Voicings', 'Hands together', 'Songs'],
    placeholder: 'e.g. Major/minor inversions, left-hand arpeggios, progression...',
  },
};

export interface MusicSessionMeta {
  tags: string[];
  notes: string | null;
}

export interface MusicSessionEntry {
  id: string;
  source: 'BLOCK' | 'COMPLETION';
  instrument: MusicInstrument;
  date: string; // YYYY-MM-DD
  durationMin: number;
  title: string;
  tags: string[];
  notes: string | null;
  blockId: string;
  block?: ScheduleBlock;
  completion?: ScheduleCompletion;
}

export interface MusicInstrumentStats {
  instrument: MusicInstrument;
  checkedToday: boolean;
  currentStreak: number;
  bestStreak: number;
  totalSessions: number;
  totalMinutes: number;
  weekSessions: number;
  weekMinutes: number;
  weekStatus: { date: string; completed: boolean; minutes: number }[];
}

const MUSIC_META_PREFIX = '__MUSIC_LOG__:';

export function isMusicInstrument(category: string): category is MusicInstrument {
  return (
    category === 'VOCAL' ||
    category === 'DRUMMING' ||
    category === 'GUITAR' ||
    category === 'KEYBOARD'
  );
}

export function serializeMusicMeta(meta: MusicSessionMeta): string {
  return `${MUSIC_META_PREFIX}${JSON.stringify(meta)}`;
}

export function parseMusicMeta(rawNotes: string | null | undefined): MusicSessionMeta {
  if (rawNotes && rawNotes.startsWith(MUSIC_META_PREFIX)) {
    try {
      const parsed = JSON.parse(rawNotes.slice(MUSIC_META_PREFIX.length)) as Partial<MusicSessionMeta>;
      return {
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [],
        notes: parsed.notes ?? null,
      };
    } catch {
      // fall back to plain string notes
    }
  }
  return {
    tags: [],
    notes: rawNotes ?? null,
  };
}

export function buildMusicBlockDraft(input: {
  instrument: MusicInstrument;
  date: string;
  durationMin: number;
  tags: string[];
  notes: string | null;
  title?: string;
}): ScheduleBlockDraft {
  const cfg = MUSIC_INSTRUMENT_CONFIG[input.instrument];
  const fallbackTitle =
    input.tags.length > 0
      ? `${cfg.label} · ${input.tags.slice(0, 2).join(', ')}`
      : `${cfg.label} Practice`;

  return {
    title: input.title?.trim() || fallbackTitle,
    category: input.instrument,
    block_date: input.date,
    start_time: null,
    end_time: null,
    duration_min: Math.max(1, Math.round(input.durationMin)),
    is_recurring: false,
    recurrence_days: [],
    status: 'COMPLETED',
    physical_load: input.instrument === 'DRUMMING' ? 'LOW' : 'NONE',
    notes: serializeMusicMeta({
      tags: input.tags,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    }),
  };
}

/**
 * Merges standalone completed music blocks (logged directly on the Music page)
 * with completed schedule_completions (checked off on Overview or Calendar),
 * deduplicating by blockId + date without double-counting.
 */
export function extractMusicSessions(
  blocks: ScheduleBlock[],
  completions: ScheduleCompletion[]
): MusicSessionEntry[] {
  const blockMap = new Map<string, ScheduleBlock>();
  for (const b of blocks) {
    blockMap.set(b.id, b);
  }

  const entriesByKey = new Map<string, MusicSessionEntry>();

  // 1. Standalone completed non-recurring music blocks
  for (const b of blocks) {
    if (!isMusicInstrument(b.category)) continue;
    if (b.is_recurring || b.status !== 'COMPLETED') continue;
    const meta = parseMusicMeta(b.notes);
    const key = `${b.id}:${b.block_date}`;
    entriesByKey.set(key, {
      id: `block:${b.id}`,
      source: 'BLOCK',
      instrument: b.category,
      date: b.block_date,
      durationMin: Math.max(1, b.duration_min ?? MUSIC_INSTRUMENT_CONFIG[b.category].defaultMin),
      title: b.title,
      tags: meta.tags,
      notes: meta.notes,
      blockId: b.id,
      block: b,
    });
  }

  // 2. Schedule completions belonging to any music block (overrides same block+date with exact logged minutes)
  for (const c of completions) {
    if (c.status !== 'COMPLETED') continue;
    const blk = blockMap.get(c.block_id);
    if (!blk || !isMusicInstrument(blk.category)) continue;

    const meta = parseMusicMeta(c.notes);
    const key = `${blk.id}:${c.occurrence_date}`;
    entriesByKey.set(key, {
      id: `comp:${c.id}`,
      source: 'COMPLETION',
      instrument: blk.category,
      date: c.occurrence_date,
      durationMin: Math.max(
        1,
        c.duration_min ?? blk.duration_min ?? MUSIC_INSTRUMENT_CONFIG[blk.category].defaultMin
      ),
      title: blk.title,
      tags: meta.tags,
      notes: meta.notes,
      blockId: blk.id,
      block: blk,
      completion: c,
    });
  }

  return Array.from(entriesByKey.values()).sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.durationMin - a.durationMin;
  });
}

export function calculateInstrumentStats(
  instrument: MusicInstrument,
  sessions: MusicSessionEntry[],
  todayIso: string
): MusicInstrumentStats {
  const matching = sessions.filter((s) => s.instrument === instrument);
  const minutesByDate = new Map<string, number>();

  let totalMinutes = 0;
  for (const s of matching) {
    totalMinutes += s.durationMin;
    minutesByDate.set(s.date, (minutesByDate.get(s.date) ?? 0) + s.durationMin);
  }

  const completedDates = new Set(minutesByDate.keys());
  const checkedToday = completedDates.has(todayIso);

  // Current streak counting backwards from today (or yesterday if today isn't logged yet)
  let currentStreak = 0;
  let cursor = checkedToday ? todayIso : addDaysIso(todayIso, -1);
  while (completedDates.has(cursor)) {
    currentStreak++;
    cursor = addDaysIso(cursor, -1);
  }

  // Best streak across all logged dates for this instrument
  const sortedDates = Array.from(completedDates).sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const expected = addDaysIso(sortedDates[i - 1], 1);
      run = sortedDates[i] === expected ? run + 1 : 1;
    }
    if (run > bestStreak) bestStreak = run;
  }

  const monday = getMondayIso(todayIso);
  const weekDates = getWeekDatesIso(monday);
  const weekStatus = weekDates.map((date) => ({
    date,
    completed: completedDates.has(date),
    minutes: minutesByDate.get(date) ?? 0,
  }));

  const weekSet = new Set(weekDates);
  const weekSessions = matching.filter((s) => weekSet.has(s.date)).length;
  const weekMinutes = weekStatus.reduce((sum, d) => sum + d.minutes, 0);

  return {
    instrument,
    checkedToday,
    currentStreak,
    bestStreak,
    totalSessions: matching.length,
    totalMinutes,
    weekSessions,
    weekMinutes,
    weekStatus,
  };
}
