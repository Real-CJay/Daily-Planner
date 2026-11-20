import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type {
  PlanAdjustment,
  PlanAdjustmentDraft,
  PlannedWorkout,
  PlannedWorkoutDraft,
  PlannedWorkoutStatus,
} from '@/types/domain';

export const plannedWorkoutDraftSchema = z.object({
  plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
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
  title: z.string().trim().min(1).max(160),
  target_distance_m: z.number().int().min(0).max(100000),
  target_duration_s: z.number().int().min(0).nullable(),
  target_pace_min_s: z.number().int().min(120).max(1200).nullable(),
  target_pace_max_s: z.number().int().min(120).max(1500).nullable(),
  target_rpe_range: z.string().max(100).nullable(),
  phase: z.enum([
    'REBUILDING',
    'BUILDING_CONSISTENCY',
    'PERFORMANCE_DEVELOPMENT',
    'GOAL_SPECIFIC_5K',
  ]),
  rationale: z.string().trim().min(1).max(600),
  status: z.enum(['PLANNED', 'COMPLETED', 'SKIPPED', 'ADJUSTED']),
  linked_session_id: z.string().uuid().nullable(),
  data_origin: z.enum(['PLANNED', 'SUGGESTED']),
});

export const planAdjustmentDraftSchema = z.object({
  adjustment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trigger_code: z.string().min(1).max(80),
  trigger_reason: z.string().min(1).max(500),
  previous_summary: z.string().min(1).max(300),
  proposed_summary: z.string().min(1).max(300),
  decision: z.enum(['ACCEPTED', 'DISMISSED']),
});

export async function listPlannedWorkouts(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<PlannedWorkout[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('planned_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('plan_date', fromDate)
    .lte('plan_date', toDate)
    .order('plan_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PlannedWorkout[];
}

export async function upsertPlannedWorkouts(
  userId: string,
  drafts: PlannedWorkoutDraft[]
): Promise<PlannedWorkout[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  if (drafts.length === 0) return [];

  const rows = drafts.map((d) => ({
    user_id: userId,
    ...plannedWorkoutDraftSchema.parse(d),
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('planned_workouts')
    .upsert(rows, { onConflict: 'user_id,plan_date' })
    .select('*')
    .order('plan_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PlannedWorkout[];
}

export async function updatePlannedWorkoutStatus(
  userId: string,
  workoutId: string,
  status: PlannedWorkoutStatus
): Promise<PlannedWorkout> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('planned_workouts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', workoutId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to update workout status.');
  return data as PlannedWorkout;
}

export async function deletePlannedWorkout(userId: string, workoutId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { error } = await supabase
    .from('planned_workouts')
    .delete()
    .eq('user_id', userId)
    .eq('id', workoutId);

  if (error) throw new Error(error.message);
}

export async function listPlanAdjustments(userId: string, limit = 15): Promise<PlanAdjustment[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('plan_adjustments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as PlanAdjustment[];
}

export async function createPlanAdjustment(
  userId: string,
  draft: PlanAdjustmentDraft
): Promise<PlanAdjustment> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = planAdjustmentDraftSchema.parse(draft);

  const { data, error } = await supabase
    .from('plan_adjustments')
    .insert({
      user_id: userId,
      ...validated,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to record adjustment decision.');
  return data as PlanAdjustment;
}