import { supabase } from '@/lib/supabase';
import type { HabitLog } from '@/types/domain';

export async function listHabitLogs(
  userId: string,
  habitKey?: string
): Promise<HabitLog[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  let query = supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false });

  if (habitKey) {
    query = query.eq('habit_key', habitKey);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as HabitLog[];
}

export async function toggleHabitLog(
  userId: string,
  habitKey: string,
  logDate: string,
  completed: boolean
): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  if (!completed) {
    const { error } = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_key', habitKey)
      .eq('log_date', logDate);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('habit_logs').upsert(
    {
      user_id: userId,
      habit_key: habitKey,
      log_date: logDate,
      completed: true,
    },
    { onConflict: 'user_id,habit_key,log_date' }
  );
  if (error) throw new Error(error.message);
}

export async function markHabitFailed(
  userId: string,
  habitKey: string,
  logDate: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { error } = await supabase.from('habit_logs').upsert(
    {
      user_id: userId,
      habit_key: habitKey,
      log_date: logDate,
      completed: false,
    },
    { onConflict: 'user_id,habit_key,log_date' }
  );
  if (error) throw new Error(error.message);
}
