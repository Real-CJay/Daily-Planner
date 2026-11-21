import type { PhysicalLoadLevel, ScheduleBlock, ScheduleBlockDraft } from '@/types/domain';

export type KarateFocus = 'KATA' | 'KUMITE' | 'KIHON' | 'CLASS' | 'CONDITIONING';

export const KARATE_FOCUS_LABELS: Record<KarateFocus, string> = {
  KATA: 'Kata',
  KUMITE: 'Kumite',
  KIHON: 'Kihon',
  CLASS: 'Class / Mixed',
  CONDITIONING: 'Conditioning',
};

export const KARATE_FEEL_OPTIONS = ['Sharp', 'Strong', 'Steady', 'Heavy legs', 'Fatigued'] as const;
export type KarateFeel = (typeof KARATE_FEEL_OPTIONS)[number];

export const COMMON_KATAS = [
  'Heian Shodan',
  'Heian Nidan',
  'Heian Sandan',
  'Heian Yondan',
  'Heian Godan',
  'Tekki Shodan',
  'Bassai Dai',
  'Kanku Dai',
  'Empi',
  'Jion',
  'Hangetsu',
  'Sochin',
  'Unsu',
];

export interface KarateSessionMeta {
  focus: KarateFocus;
  katas: string[];
  rpe: number | null;
  feel: KarateFeel | null;
  painPresent: boolean;
  painDetails: string | null;
  notes: string | null;
}

export interface KarateSessionView {
  id: string;
  block: ScheduleBlock;
  date: string;
  startTime: string | null;
  durationMin: number;
  title: string;
  physicalLoad: PhysicalLoadLevel;
  meta: KarateSessionMeta;
}

const META_PREFIX = '__KARATE_LOG__:';

export function serializeKarateMeta(meta: KarateSessionMeta): string {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

export function parseKarateMeta(rawNotes: string | null | undefined): KarateSessionMeta {
  if (rawNotes && rawNotes.startsWith(META_PREFIX)) {
    try {
      const parsed = JSON.parse(rawNotes.slice(META_PREFIX.length)) as Partial<KarateSessionMeta>;
      return {
        focus: parsed.focus ?? 'CLASS',
        katas: Array.isArray(parsed.katas) ? parsed.katas.filter(Boolean) : [],
        rpe: typeof parsed.rpe === 'number' ? parsed.rpe : null,
        feel: parsed.feel ?? null,
        painPresent: Boolean(parsed.painPresent),
        painDetails: parsed.painDetails ?? null,
        notes: parsed.notes ?? null,
      };
    } catch {
      // fall through to plain text notes
    }
  }

  return {
    focus: 'CLASS',
    katas: [],
    rpe: null,
    feel: null,
    painPresent: false,
    painDetails: null,
    notes: rawNotes ?? null,
  };
}

export function toKarateSessionView(block: ScheduleBlock): KarateSessionView {
  return {
    id: block.id,
    block,
    date: block.block_date,
    startTime: block.start_time,
    durationMin: block.duration_min ?? 60,
    title: block.title,
    physicalLoad: block.physical_load,
    meta: parseKarateMeta(block.notes),
  };
}

export function buildKarateBlockDraft(input: {
  title: string;
  date: string;
  startTime: string | null;
  durationMin: number;
  physicalLoad: PhysicalLoadLevel;
  meta: KarateSessionMeta;
}): ScheduleBlockDraft {
  let endTime: string | null = null;
  if (input.startTime) {
    const [hh, mm] = input.startTime.split(':').map(Number);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const endTotal = hh * 60 + mm + input.durationMin;
      endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(
        endTotal % 60
      ).padStart(2, '0')}`;
    }
  }

  return {
    title: input.title.trim() || `${KARATE_FOCUS_LABELS[input.meta.focus]} Session`,
    category: 'KARATE',
    block_date: input.date,
    start_time: input.startTime || null,
    end_time: endTime,
    duration_min: Math.max(5, Math.round(input.durationMin)),
    is_recurring: false,
    recurrence_days: [],
    status: 'COMPLETED',
    physical_load: input.physicalLoad,
    notes: serializeKarateMeta(input.meta),
  };
}
