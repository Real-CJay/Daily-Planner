import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { PersonalBest, PersonalBestDraft } from '@/types/domain';

export const personalBestDraftSchema = z.object({
  distance_label: z.enum(['1K', '3K', '5K', '10K']),
  distance_m: z.number().int().min(100).max(50000),
  duration_s: z.number().int().min(60).max(36000),
  achieved_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  session_id: z.string().uuid().nullable(),
  notes: z.string().max(500).nullable(),
});

export async function listPersonalBests(userId: string): Promise<PersonalBest[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('personal_bests')
    .select('*')
    .eq('user_id', userId)
    .order('distance_m', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PersonalBest[];
}

export async function upsertPersonalBest(
  userId: string,
  draft: PersonalBestDraft
): Promise<PersonalBest> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = personalBestDraftSchema.parse(draft);

  const { data, error } = await supabase
    .from('personal_bests')
    .upsert(
      {
        user_id: userId,
        ...validated,
        is_confirmed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,distance_label' }
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save Personal Best.');
  return data as PersonalBest;
}

export async function deletePersonalBest(userId: string, id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { error } = await supabase
    .from('personal_bests')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) throw new Error(error.message);
}