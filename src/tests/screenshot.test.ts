import { describe, expect, it } from 'vitest';
import { parseWorkoutTextToDraft } from '@/modules/screenshot/parser';

describe('Stage 3 Screenshot & OCR Text Parser', () => {
  it('extracts distance, duration, date, splits, and heart rate without fabricating missing data', () => {
    const sampleOcr = `
      Aug 13, 2026 · Progression Run
      Distance: 5.00 km
      Duration: 28:10
      Avg HR: 162 bpm
      Km 1: 5:45 155 bpm
      Km 2: 5:38 161 bpm
      Km 3: 5:30 166 bpm
    `;

    const result = parseWorkoutTextToDraft(sampleOcr, '2026-11-20');
    expect(result.draft.session_date).toBe('2026-08-13');
    expect(result.draft.distance_m).toBe(5000);
    expect(result.draft.duration_s).toBe(1690);
    expect(result.draft.workout_type).toBe('PROGRESSION');
    expect(result.draft.avg_hr_bpm).toBe(162);
    expect(result.draft.cadence_spm).toBeNull(); // Never guessed
    expect(result.draft.splits).toHaveLength(3);
    expect(result.draft.entry_method).toBe('SCREENSHOT');
  });

  it('flags missing required fields clearly when OCR text is incomplete', () => {
    const incompleteOcr = 'Evening Treadmill Session';
    const result = parseWorkoutTextToDraft(incompleteOcr, '2026-11-20');

    expect(result.draft.is_indoor).toBe(true);
    expect(result.draft.workout_type).toBe('TREADMILL');
    expect(result.draft.distance_m).toBe(0);
    expect(result.draft.duration_s).toBe(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});