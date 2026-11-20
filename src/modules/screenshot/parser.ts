import { createWorker } from 'tesseract.js';
import { parseDurationToSeconds } from '@/modules/running/calculations';
import type { RunningSessionDraft, SplitDraft, WorkoutType } from '@/types/domain';

export interface ParsedFieldConfidence {
  distance: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
  duration: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
  date: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
  splits: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
}

export interface ScreenshotExtractionResult {
  rawText: string;
  draft: RunningSessionDraft;
  distanceKmInput: string;
  durationInput: string;
  confidence: ParsedFieldConfidence;
  warnings: string[];
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[–—]/g, '-')
    .replace(/(\d)[oO](\d)/g, '$10$2')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractDate(text: string, fallbackDate: string): {
  value: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
} {
  // ISO YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return { value: `${y}-${m}-${d}`, confidence: 'HIGH' };
  }

  // Month name + day (+ optional year), e.g., "Aug 13, 2026" or "13 Aug 2026" or "Aug 13"
  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  const monthDayYear = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i
  );
  if (monthDayYear) {
    const month = months[monthDayYear[1].slice(0, 3).toLowerCase()];
    const day = monthDayYear[2].padStart(2, '0');
    const year = monthDayYear[3] ?? fallbackDate.slice(0, 4);
    return {
      value: `${year}-${month}-${day}`,
      confidence: monthDayYear[3] ? 'HIGH' : 'MEDIUM',
    };
  }

  const dayMonthYear = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d{2}))?\b/i
  );
  if (dayMonthYear) {
    const day = dayMonthYear[1].padStart(2, '0');
    const month = months[dayMonthYear[2].slice(0, 3).toLowerCase()];
    const year = dayMonthYear[3] ?? fallbackDate.slice(0, 4);
    return {
      value: `${year}-${month}-${day}`,
      confidence: dayMonthYear[3] ? 'HIGH' : 'MEDIUM',
    };
  }

  return { value: fallbackDate, confidence: 'MISSING' };
}

function extractDistanceMeters(text: string): {
  meters: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
} {
  // Match explicit km values like "5.00 km", "5.14km", "Distance 5.0 km"
  const kmMatch = text.match(/\b(\d{1,3}(?:[.,]\d{1,3})?)\s*km\b/i);
  if (kmMatch) {
    const km = Number(kmMatch[1].replace(',', '.'));
    if (Number.isFinite(km) && km > 0 && km <= 200) {
      return { meters: Math.round(km * 1000), confidence: 'HIGH' };
    }
  }

  // Match meter values like "5000 m" or "400m" (not bpm/spm/mm/am/pm)
  const mMatch = text.match(/\b(\d{2,6})\s*m(?![a-z])\b/i);
  if (mMatch) {
    const meters = Number(mMatch[1]);
    if (Number.isFinite(meters) && meters >= 100 && meters <= 200000) {
      return { meters: Math.round(meters), confidence: 'MEDIUM' };
    }
  }

  return { meters: null, confidence: 'MISSING' };
}

function extractDurationSeconds(text: string): {
  seconds: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
} {
  // Look near time/duration labels first
  const labeledMatch = text.match(
    /(?:duration|time|elapsed|moving\s*time|total\s*time)[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)/i
  );
  if (labeledMatch) {
    const parsed = parseDurationToSeconds(labeledMatch[1]);
    if (parsed) return { seconds: parsed, confidence: 'HIGH' };
  }

  // Otherwise find standalone mm:ss or h:mm:ss tokens that are not pace ("/km" or "min/km")
  const tokens = [...text.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g)];
  for (const match of tokens) {
    const token = match[1];
    const startIdx = match.index ?? 0;
    const afterContext = text.slice(startIdx + token.length, startIdx + token.length + 8).toLowerCase();
    if (afterContext.includes('/km') || afterContext.includes('min/')) {
      continue;
    }
    const parsed = parseDurationToSeconds(token);
    if (parsed && parsed >= 30) {
      return { seconds: parsed, confidence: 'MEDIUM' };
    }
  }

  return { seconds: null, confidence: 'MISSING' };
}

function extractWorkoutType(text: string): WorkoutType {
  const lower = text.toLowerCase();
  if (lower.includes('treadmill') || lower.includes('indoor')) return 'TREADMILL';
  if (lower.includes('interval')) return 'INTERVALS';
  if (lower.includes('tempo') || lower.includes('threshold')) return 'TEMPO';
  if (lower.includes('progression') || lower.includes('progressive')) return 'PROGRESSION';
  if (lower.includes('recovery')) return 'RECOVERY';
  if (lower.includes('long run') || lower.includes('long')) return 'LONG';
  if (lower.includes('time trial') || lower.includes('tt')) return 'TIME_TRIAL';
  if (lower.includes('race') || lower.includes('5k') || lower.includes('10k')) return 'RACE';
  if (lower.includes('walk')) return 'RUN_WALK';
  return 'EASY';
}

function extractIntegerMetric(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const val = Number(match[1]);
      if (Number.isFinite(val)) return Math.round(val);
    }
  }
  return null;
}

function extractSplits(text: string): {
  splits: SplitDraft[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MISSING';
} {
  const lines = text.split('\n');
  const splits: SplitDraft[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Matches lines like:
    // "Km 1: 5:45 155 bpm"
    // "Split 2 (1.00 km): 5:38"
    // "4  0.14 km  0:44"
    const splitMatch = trimmed.match(
      /^(?:km|split|#)?\s*(\d{1,2})\s*[:.)-]?\s*(?:\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*km\s*\)?\s*[:.-]?\s*)?(\d{1,2}:\d{2})(?:[^0-9\n]+(\d{2,3})\s*bpm)?/i
    );
    if (!splitMatch) continue;

    const index = Number(splitMatch[1]);
    const distKm = splitMatch[2] ? Number(splitMatch[2].replace(',', '.')) : 1.0;
    const durS = parseDurationToSeconds(splitMatch[3]);
    const hr = splitMatch[4] ? Number(splitMatch[4]) : null;

    if (!Number.isInteger(index) || index <= 0 || !durS || !Number.isFinite(distKm) || distKm <= 0) {
      continue;
    }

    const hasExplicitPrefix = /^(?:km|split|#)\s*\d/i.test(trimmed);
    const hasExplicitKm = Boolean(splitMatch[2]);
    if (!hasExplicitPrefix && !hasExplicitKm) continue;

    const distanceM = Math.round(distKm * 1000);
    splits.push({
      split_index: index,
      distance_m: distanceM,
      duration_s: durS,
      is_partial: distanceM < 950 || distanceM > 1050,
      avg_hr_bpm: hr && hr >= 30 && hr <= 240 ? hr : null,
    });
  }

  const byIndex = new Map<number, SplitDraft>();
  for (const s of splits) {
    if (!byIndex.has(s.split_index)) {
      byIndex.set(s.split_index, s);
    }
  }

  const ordered = [...byIndex.values()]
    .sort((a, b) => a.split_index - b.split_index)
    .map((s, idx) => ({ ...s, split_index: idx + 1 }));

  return {
    splits: ordered,
    confidence: ordered.length >= 2 ? 'HIGH' : ordered.length === 1 ? 'MEDIUM' : 'MISSING',
  };
}

export function parseWorkoutTextToDraft(
  rawInputText: string,
  fallbackDate: string
): ScreenshotExtractionResult {
  const rawText = normalizeOcrText(rawInputText);
  const warnings: string[] = [];

  const dateRes = extractDate(rawText, fallbackDate);
  if (dateRes.confidence === 'MISSING') {
    warnings.push(`Date not clearly detected in screenshot; defaulted to ${fallbackDate}.`);
  }

  const distRes = extractDistanceMeters(rawText);
  if (!distRes.meters) {
    warnings.push('Distance could not be read automatically — enter distance before saving.');
  }

  const durRes = extractDurationSeconds(rawText);
  if (!durRes.seconds) {
    warnings.push('Duration could not be read automatically — enter duration (mm:ss) before saving.');
  }

  const workoutType = extractWorkoutType(rawText);
  const isIndoor = workoutType === 'TREADMILL' || /\bindoor\b/i.test(rawText);

  const avgHr = extractIntegerMetric(rawText, [
    /(?:avg\.?\s*hr|average\s*hr|avg\s*heart\s*rate)[:\s]+(\d{2,3})/i,
    /\b(\d{2,3})\s*bpm\b/i,
  ]);
  const maxHr = extractIntegerMetric(rawText, [
    /(?:max\.?\s*hr|maximum\s*hr|max\s*heart\s*rate)[:\s]+(\d{2,3})/i,
  ]);
  const cadence = extractIntegerMetric(rawText, [
    /(?:cadence|spm)[:\s]+(\d{2,3})/i,
  ]);
  const elevation = extractIntegerMetric(rawText, [
    /(?:elev(?:ation)?(?:\s*gain)?|climb)[:\s]+(\d{1,5})\s*m?\b/i,
  ]);

  const splitRes = extractSplits(rawText);

  const draft: RunningSessionDraft = {
    session_date: dateRes.value,
    start_time: null,
    distance_m: distRes.meters ?? 0,
    duration_s: durRes.seconds ?? 0,
    workout_type: workoutType,
    is_indoor: isIndoor,
    avg_hr_bpm: avgHr && avgHr >= 30 && avgHr <= 240 ? avgHr : null,
    max_hr_bpm: maxHr && maxHr >= 30 && maxHr <= 240 ? maxHr : null,
    cadence_spm: cadence && cadence >= 80 && cadence <= 250 ? cadence : null,
    elevation_gain_m: elevation !== null && elevation >= 0 ? elevation : null,
    rpe: null,
    energy_level: null,
    muscle_soreness: null,
    pain_present: false,
    pain_details: null,
    conditions: isIndoor ? 'Indoor / Treadmill' : null,
    notes: rawText ? `Imported via screenshot OCR.` : null,
    entry_method: 'SCREENSHOT',
    is_historical_record: false,
    splits: splitRes.splits,
  };

  return {
    rawText,
    draft,
    distanceKmInput: distRes.meters ? (distRes.meters / 1000).toFixed(2) : '',
    durationInput: durRes.seconds
      ? `${Math.floor(durRes.seconds / 60)}:${String(durRes.seconds % 60).padStart(2, '0')}`
      : '',
    confidence: {
      distance: distRes.confidence,
      duration: durRes.confidence,
      date: dateRes.confidence,
      splits: splitRes.confidence,
    },
    warnings,
  };
}

export async function recognizeWorkoutFromImage(
  file: File,
  fallbackDate: string,
  onProgress?: (pct: number) => void
): Promise<ScreenshotExtractionResult> {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return parseWorkoutTextToDraft(text, fallbackDate);
  } finally {
    await worker.terminate();
  }
}