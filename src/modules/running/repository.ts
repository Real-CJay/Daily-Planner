import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { RunningSession, RunningSessionDraft, RunningSplit } from '@/types/domain';

export const splitDraftSchema = z.object({
  split_index: z.number().int().positive(),
  distance_m: z.number().int().min(50).max(50000),
  duration_s: z.number().int().min(5).max(86400),
  is_partial: z.boolean(),
  avg_hr_bpm: z.number().int().min(30).max(240).nullable(),
});

export const runningSessionDraftSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable(),
  distance_m: z.number().int().min(100, 'Distance must be at least 100m').max(200000),
  duration_s: z.number().int().min(10, 'Duration must be at least 10 seconds').max(172800),
  workout_type: z.enum([
    'EASY',
    'RECOVERY',
    'LONG',
    'TEMPO',
    'INTERVALS',
    'PROGRESSION',
    'TIME_TRIAL',
    'RACE',
    'TREADMILL',
    'RUN_WALK',
    'OTHER',
  ]),
  is_indoor: z.boolean(),
  avg_hr_bpm: z.number().int().min(30).max(240).nullable(),
  max_hr_bpm: z.number().int().min(30).max(240).nullable(),
  cadence_spm: z.number().int().min(80).max(250).nullable(),
  elevation_gain_m: z.number().int().min(0).max(15000).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  energy_level: z.number().int().min(1).max(5).nullable(),
  muscle_soreness: z.number().int().min(1).max(5).nullable(),
  pain_present: z.boolean(),
  pain_details: z.string().max(1000).nullable(),
  conditions: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  entry_method: z.enum(['MANUAL', 'SCREENSHOT', 'HISTORICAL_IMPORT']).optional(),
  is_historical_record: z.boolean().optional(),
  splits: z.array(splitDraftSchema),
});

export async function listRunningSessions(userId: string): Promise<RunningSession[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('running_sessions')
    .select('*, splits:running_splits(*)')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...(row as RunningSession),
    splits: ((row as { splits?: RunningSplit[] }).splits ?? []).sort(
      (a, b) => a.split_index - b.split_index
    ),
  }));
}

export async function getRunningSessionById(
  userId: string,
  sessionId: string
): Promise<RunningSession | null> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('running_sessions')
    .select('*, splits:running_splits(*)')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...(data as RunningSession),
    splits: ((data as { splits?: RunningSplit[] }).splits ?? []).sort(
      (a, b) => a.split_index - b.split_index
    ),
  };
}

export async function createRunningSession(
  userId: string,
  draft: RunningSessionDraft
): Promise<RunningSession> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = runningSessionDraftSchema.parse(draft);

  const { data: inserted, error: insertError } = await supabase
    .from('running_sessions')
    .insert({
      user_id: userId,
      session_date: validated.session_date,
      start_time: validated.start_time,
      distance_m: validated.distance_m,
      duration_s: validated.duration_s,
      workout_type: validated.workout_type,
      is_indoor: validated.is_indoor,
      avg_hr_bpm: validated.avg_hr_bpm,
      max_hr_bpm: validated.max_hr_bpm,
      cadence_spm: validated.cadence_spm,
      elevation_gain_m: validated.elevation_gain_m,
      rpe: validated.rpe,
      energy_level: validated.energy_level,
      muscle_soreness: validated.muscle_soreness,
      pain_present: validated.pain_present,
      pain_details: validated.pain_details,
      conditions: validated.conditions,
      notes: validated.notes,
      data_origin: 'RECORDED',
      entry_method: validated.entry_method ?? 'MANUAL',
      is_historical_record: validated.is_historical_record ?? false,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? 'Failed to save running session.');
  }

  if (validated.splits.length > 0) {
    const splitRows = validated.splits.map((s) => ({
      user_id: userId,
      session_id: inserted.id,
      split_index: s.split_index,
      distance_m: s.distance_m,
      duration_s: s.duration_s,
      is_partial: s.is_partial,
      avg_hr_bpm: s.avg_hr_bpm,
      data_origin: 'RECORDED' as const,
    }));

    const { error: splitError } = await supabase.from('running_splits').insert(splitRows);
    if (splitError) {
      throw new Error(`Run saved, but splits failed: ${splitError.message}`);
    }
  }

  await syncFiveKFastestLogged(userId);
  const full = await getRunningSessionById(userId, inserted.id);
  if (!full) throw new Error('Unable to reload created running session.');
  return full;
}

export async function updateRunningSession(
  userId: string,
  sessionId: string,
  draft: RunningSessionDraft
): Promise<RunningSession> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = runningSessionDraftSchema.parse(draft);

  const { error: updateError } = await supabase
    .from('running_sessions')
    .update({
      session_date: validated.session_date,
      start_time: validated.start_time,
      distance_m: validated.distance_m,
      duration_s: validated.duration_s,
      workout_type: validated.workout_type,
      is_indoor: validated.is_indoor,
      avg_hr_bpm: validated.avg_hr_bpm,
      max_hr_bpm: validated.max_hr_bpm,
      cadence_spm: validated.cadence_spm,
      elevation_gain_m: validated.elevation_gain_m,
      rpe: validated.rpe,
      energy_level: validated.energy_level,
      muscle_soreness: validated.muscle_soreness,
      pain_present: validated.pain_present,
      pain_details: validated.pain_details,
      conditions: validated.conditions,
      notes: validated.notes,
    })
    .eq('user_id', userId)
    .eq('id', sessionId);

  if (updateError) throw new Error(updateError.message);

  // Replace splits cleanly
  const { error: delSplitErr } = await supabase
    .from('running_splits')
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  if (delSplitErr) throw new Error(delSplitErr.message);

  if (validated.splits.length > 0) {
    const splitRows = validated.splits.map((s) => ({
      user_id: userId,
      session_id: sessionId,
      split_index: s.split_index,
      distance_m: s.distance_m,
      duration_s: s.duration_s,
      is_partial: s.is_partial,
      avg_hr_bpm: s.avg_hr_bpm,
      data_origin: 'RECORDED' as const,
    }));
    const { error: insSplitErr } = await supabase.from('running_splits').insert(splitRows);
    if (insSplitErr) throw new Error(insSplitErr.message);
  }

  await syncFiveKFastestLogged(userId);
  const full = await getRunningSessionById(userId, sessionId);
  if (!full) throw new Error('Unable to reload updated running session.');
  return full;
}

export async function deleteRunningSession(userId: string, sessionId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { error } = await supabase
    .from('running_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
  await syncFiveKFastestLogged(userId);
}

/**
 * Keeps the 5K FASTEST_LOGGED row synchronized whenever runs are added, edited, or deleted.
 * Never auto-promotes to CONFIRMED_PB without explicit user confirmation.
 */
export async function syncFiveKFastestLogged(userId: string): Promise<void> {
  if (!supabase) return;

  const { data: fiveKs } = await supabase
    .from('running_sessions')
    .select('id, session_date, distance_m, duration_s')
    .eq('user_id', userId)
    .gte('distance_m', 4950)
    .lte('distance_m', 5250);

  if (!fiveKs || fiveKs.length === 0) {
    await supabase
      .from('personal_bests')
      .delete()
      .eq('user_id', userId)
      .eq('distance_bucket', '5K')
      .eq('classification', 'FASTEST_LOGGED');
    return;
  }

  let best = fiveKs[0];
  for (const r of fiveKs) {
    if (r.duration_s / r.distance_m < best.duration_s / best.distance_m) {
      best = r;
    }
  }

  await supabase.from('personal_bests').upsert(
    {
      user_id: userId,
      distance_bucket: '5K',
      session_id: best.id,
      duration_s: best.duration_s,
      recorded_date: best.session_date,
      classification: 'FASTEST_LOGGED',
      confirmed_at: null,
      notes: 'Automatically tracked fastest logged ~5K result (not confirmed lifetime PB).',
    },
    { onConflict: 'user_id,distance_bucket,classification' }
  );
}

/**
 * Imports the user's two known historical August 2026 benchmarks without inventing splits or HR.
 * Idempotent: skips any benchmark that already exists by date + distance + duration.
 */
export async function importHistoricalAugust2026Records(userId: string): Promise<number> {
  const existing = await listRunningSessions(userId);

  const benchmarks: RunningSessionDraft[] = [
    {
      session_date: '2026-08-13',
      start_time: null,
      distance_m: 5000,
      duration_s: 1690, // 28:10 (5:38 /km)
      workout_type: 'PROGRESSION',
      is_indoor: false,
      avg_hr_bpm: null,
      max_hr_bpm: null,
      cadence_spm: null,
      elevation_gain_m: null,
      rpe: null,
      energy_level: null,
      muscle_soreness: null,
      pain_present: false,
      pain_details: null,
      conditions: null,
      notes:
        'Historical user-reported record. Demanding run with progressively faster pacing toward the end. Splits and heart rate not recorded.',
      entry_method: 'HISTORICAL_IMPORT',
      is_historical_record: true,
      splits: [],
    },
    {
      session_date: '2026-08-18',
      start_time: null,
      distance_m: 5140,
      duration_s: 1858, // 30:58 (~6:02 /km)
      workout_type: 'EASY',
      is_indoor: false,
      avg_hr_bpm: null,
      max_hr_bpm: null,
      cadence_spm: null,
      elevation_gain_m: null,
      rpe: null,
      energy_level: null,
      muscle_soreness: null,
      pain_present: false,
      pain_details: null,
      conditions: null,
      notes:
        'Historical user-reported record. Splits and heart rate not recorded.',
      entry_method: 'HISTORICAL_IMPORT',
      is_historical_record: true,
      splits: [],
    },
  ];

  let importedCount = 0;
  for (const item of benchmarks) {
    const duplicate = existing.some(
      (e) =>
        e.session_date === item.session_date &&
        e.distance_m === item.distance_m &&
        e.duration_s === item.duration_s
    );
    if (!duplicate) {
      await createRunningSession(userId, item);
      importedCount++;
    }
  }

  return importedCount;
}