import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type {
  CoachMessage,
  CoachMessageDraft,
  WeeklyReviewDraft,
  WeeklyReviewRecord,
} from '@/types/domain';
import type { CompactCoachContext, DeterministicWeeklyReview } from './coachEngine';

const coachMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(8000),
  model_used: z.string().max(120).nullable(),
  context_snapshot: z.record(z.string(), z.unknown()).nullable(),
  data_origin: z.enum(['RECORDED', 'SUGGESTED']),
});

const weeklyReviewSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary_snapshot: z.record(z.string(), z.unknown()),
  ai_narrative: z.string().max(8000).nullable(),
  ai_model: z.string().max(120).nullable(),
  user_reflection: z.string().max(4000).nullable(),
});

export async function listCoachMessages(userId: string, limit = 40): Promise<CoachMessage[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('coach_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as CoachMessage[];
}

export async function insertCoachMessage(
  userId: string,
  draft: CoachMessageDraft
): Promise<CoachMessage> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = coachMessageSchema.parse(draft);

  const { data, error } = await supabase
    .from('coach_messages')
    .insert({
      user_id: userId,
      ...validated,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save message.');
  return data as CoachMessage;
}

export async function clearCoachMessages(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { error } = await supabase.from('coach_messages').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function listWeeklyReviews(userId: string, limit = 12): Promise<WeeklyReviewRecord[]> {
  if (!supabase) throw new Error('Supabase client is not configured.');

  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklyReviewRecord[];
}

export async function upsertWeeklyReview(
  userId: string,
  draft: WeeklyReviewDraft
): Promise<WeeklyReviewRecord> {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const validated = weeklyReviewSchema.parse(draft);

  const { data, error } = await supabase
    .from('weekly_reviews')
    .upsert(
      {
        user_id: userId,
        ...validated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,week_start' }
    )
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to save weekly review.');
  return data as WeeklyReviewRecord;
}

export interface ServerCoachResponse {
  reply: string;
  model: string;
}

/* Calls the server-side /api/coach endpoint so GEMINI_API_KEY is never exposed in the browser. */
export async function requestServerCoachReply(params: {
  mode: 'CHAT' | 'WEEKLY_REVIEW';
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  context: CompactCoachContext;
  weeklySummary?: DeterministicWeeklyReview;
  preferredModel: string;
}): Promise<ServerCoachResponse> {
  const endpoint = (import.meta.env.VITE_COACH_API_URL as string | undefined) || '/api/coach';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      errText || `Coach server endpoint returned HTTP ${res.status}.`
    );
  }

  const json = (await res.json()) as { reply?: string; model?: string };
  if (!json.reply) {
    throw new Error('Coach server returned an empty response.');
  }

  return {
    reply: json.reply,
    model: json.model ?? params.preferredModel,
  };
}