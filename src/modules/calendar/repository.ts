import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type {
  ReadinessCheckIn,
  ReadinessCheckInDraft,
  ScheduleBlock,
  ScheduleBlockDraft,
} from '@/types/domain';

export const scheduleBlockDraftSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  category: z.enum([
    'RUNNING',
    'KARATE',
    'STRENGTH',
    'RECOVERY',
    'VOCAL',
    'DRUMMING',
    'UNIVERSITY',
    'CUSTOM',
  ]),
  block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable(),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable(),
  duration_min: z.number().int().min(1).max(1440).nullable(),
  is_recurring: z.boolean(),
  recurrence_days: z.array(z.number().int().min(1).max(7)),
  status: z.enum(['PLANNED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED']),
  physical_load: z.enum(['NONE', 'LOW', 'MODERATE', 'HIGH']),
  notes: z.string().max(1000).nullable(),
});

export const readinessCheckInDraftSchema = z.object({
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  sleep_hours: z.number().min(0).max(24).nullable(),
  sleep_quality: z.number().int().min(1).max(5).nullable(),
  energy_level: z.number().int().min(1).max(5).nullable(),
  muscle_soreness: z.number().int().min(1).max(5).nullable(),
  stress_level: z.number().int().min(1).max(5).nullable(),
  resting_hr_bpm: z.number().int().min(30).max(140).nullable(),
  pain_present: z.boolean(),
  pain_details: z.string().max(1000).nullable(),
  notes: z.string().max(1000).nullable(),
});

export async function listScheduleBlocks(userId: string): Promise<ScheduleBlock[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduleBlock[];
}

export async function createScheduleBlock(
  userId: string,
  draft: ScheduleBlockDraft
): Promise<ScheduleBlock> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = scheduleBlockDraftSchema.parse(draft);

  const { data, error } = await supabase
    .from('schedule_blocks')
    .insert({
      user_id: userId,
      ...validated,
      data_origin: validated.status === 'COMPLETED' ? 'RECORDED' : 'PLANNED',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save schedule block.');
  return data as ScheduleBlock;
}

export async function updateScheduleBlock(
  userId: string,
  blockId: string,
  draft: ScheduleBlockDraft
): Promise<ScheduleBlock> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = scheduleBlockDraftSchema.parse(draft);

  const { data, error } = await supabase
    .from('schedule_blocks')
    .update({
      ...validated,
      data_origin: validated.status === 'COMPLETED' ? 'RECORDED' : 'PLANNED',
    })
    .eq('user_id', userId)
    .eq('id', blockId)
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to update schedule block.');
  return data as ScheduleBlock;
}

export async function deleteScheduleBlock(userId: string, blockId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const { error } = await supabase
    .from('schedule_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('id', blockId);

  if (error) throw new Error(error.message);
}

/* Seeds recurring non-running commitments (Wed/Fri Karate, daily Vocal, Drumming, Sun Rest). Idempotent. */
export async function seedDefaultRecurringSchedule(
  userId: string,
  anchorDate: string
): Promise<number> {
  const existing = await listScheduleBlocks(userId);

  const defaults: ScheduleBlockDraft[] = [
    {
      title: 'Karate Training',
      category: 'KARATE',
      block_date: anchorDate,
      start_time: '17:30',
      end_time: '19:00',
      duration_min: 90,
      is_recurring: true,
      recurrence_days: [3, 5], // Wednesday & Friday
      status: 'PLANNED',
      physical_load: 'HIGH',
      notes: 'Non-running physical load — informs recovery without adding running mileage.',
    },
    {
      title: 'Vocal Practice',
      category: 'VOCAL',
      block_date: anchorDate,
      start_time: '07:30',
      end_time: '08:00',
      duration_min: 30,
      is_recurring: true,
      recurrence_days: [1, 2, 3, 4, 5, 6, 7],
      status: 'PLANNED',
      physical_load: 'NONE',
      notes: 'Daily vocal warmups and technique.',
    },
    {
      title: 'Drumming Practice',
      category: 'DRUMMING',
      block_date: anchorDate,
      start_time: '19:30',
      end_time: '20:15',
      duration_min: 45,
      is_recurring: true,
      recurrence_days: [2, 4, 6],
      status: 'PLANNED',
      physical_load: 'LOW',
      notes: 'Rhythm and coordination practice.',
    },
    {
      title: 'Protected Rest & Recovery Day',
      category: 'RECOVERY',
      block_date: anchorDate,
      start_time: null,
      end_time: null,
      duration_min: null,
      is_recurring: true,
      recurrence_days: [7], // Sunday
      status: 'PLANNED',
      physical_load: 'NONE',
      notes: 'Full recovery, mobility, and sleep prioritization.',
    },
    {
      title: 'Home Workout (Rotating Split)',
      category: 'STRENGTH',
      block_date: anchorDate,
      start_time: '06:45',
      end_time: '07:10',
      duration_min: 25,
      is_recurring: true,
      recurrence_days: [1, 2, 3, 4, 5, 6], // Mon–Sat (Sun protected rest)
      status: 'PLANNED',
      physical_load: 'MODERATE',
      notes: 'Tag Upper, Core, Lower, Full Body, or App Rest Day on check-off.',
    },
  ];

  let added = 0;
  for (const item of defaults) {
    const exists = existing.some(
      (b) => b.title.toLowerCase() === item.title.toLowerCase() && b.category === item.category
    );
    if (!exists) {
      await createScheduleBlock(userId, item);
      added++;
    }
  }
  return added;
}

export async function listReadinessCheckIns(
  userId: string,
  limit = 30
): Promise<ReadinessCheckIn[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('readiness_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('checkin_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ReadinessCheckIn[];
}

export async function upsertReadinessCheckIn(
  userId: string,
  draft: ReadinessCheckInDraft
): Promise<ReadinessCheckIn> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = readinessCheckInDraftSchema.parse(draft);

  const { data, error } = await supabase
    .from('readiness_checkins')
    .upsert(
      {
        user_id: userId,
        ...validated,
      },
      { onConflict: 'user_id,checkin_date' }
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save readiness check-in.');
  return data as ReadinessCheckIn;
}