import { useCallback, useEffect, useState } from 'react';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listPersonalBests } from '@/modules/analytics/repository';
import { listReadinessCheckIns, listScheduleBlocks } from '@/modules/calendar/repository';
import { listRunningSessions } from '@/modules/running/repository';
import {
  buildCompactCoachContext,
  generateDeterministicCoachFallback,
} from '@/modules/coach/coachEngine';
import {
  clearCoachMessages,
  insertCoachMessage,
  listCoachMessages,
  requestServerCoachReply,
} from '@/modules/coach/repository';
import type { CoachMessage, UserProfile } from '@/types/domain';

export const COACH_QUICK_PROMPTS = [
  'Review my week',
  'Sub-20 5K pacing',
  "Adjust today's load",
  'Recovery check',
];

export function useLiveCoach() {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const list = await listCoachMessages(user.id, 40);
      setMessages(list);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const askCoach = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!user || !question || sending) return;
      setSending(true);

      const tz = profile?.timezone ?? 'Asia/Colombo';
      const today = getLocalDateString(new Date(), tz);

      const safeProfile: Pick<
        UserProfile,
        | 'timezone'
        | 'current_phase'
        | 'immediate_goal'
        | 'first_major_5k_goal_s'
        | 'long_term_5k_goal_s'
        | 'ai_share_notes'
        | 'ai_share_recovery'
        | 'ai_share_karate'
        | 'ai_share_commitments'
      > = {
        timezone: tz,
        current_phase: profile?.current_phase ?? 'REBUILDING',
        immediate_goal: profile?.immediate_goal ?? 'Sub-20 5K',
        first_major_5k_goal_s: profile?.first_major_5k_goal_s ?? 1199,
        long_term_5k_goal_s: profile?.long_term_5k_goal_s ?? 1050,
        ai_share_notes: profile?.ai_share_notes ?? true,
        ai_share_recovery: profile?.ai_share_recovery ?? true,
        ai_share_karate: profile?.ai_share_karate ?? true,
        ai_share_commitments: profile?.ai_share_commitments ?? true,
      };

      try {
        const savedUserMsg = await insertCoachMessage(user.id, {
          role: 'user',
          content: question,
          model_used: null,
          context_snapshot: null,
          data_origin: 'RECORDED',
        });
        setMessages((prev) => [...prev, savedUserMsg]);

        const [sessions, personalBests, blocks, checkIns] = await Promise.all([
          listRunningSessions(user.id),
          listPersonalBests(user.id),
          listScheduleBlocks(user.id),
          listReadinessCheckIns(user.id, 14),
        ]);

        const context = buildCompactCoachContext({
          today,
          profile: safeProfile,
          sessions,
          personalBests,
          plannedWorkouts: [],
          blocks,
          checkIns,
        });

        let replyText = '';
        let modelUsed = 'deterministic-fallback';

        try {
          const history = messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const serverRes = await requestServerCoachReply({
            mode: 'CHAT',
            message: question,
            history,
            context,
            preferredModel: profile?.ai_preferred_model || 'gemini-2.5-flash',
          });
          replyText = serverRes.reply;
          modelUsed = serverRes.model || 'gemini';
        } catch {
          replyText = generateDeterministicCoachFallback(question, context, sessions);
        }

        const savedReply = await insertCoachMessage(user.id, {
          role: 'assistant',
          content: replyText,
          model_used: modelUsed,
          context_snapshot: context as unknown as Record<string, unknown>,
          data_origin: 'SUGGESTED',
        });
        setMessages((prev) => [...prev, savedReply]);
      } finally {
        setSending(false);
      }
    },
    [user, profile, messages, sending]
  );

  const clearHistory = useCallback(async () => {
    if (!user) return;
    await clearCoachMessages(user.id);
    setMessages([]);
  }, [user]);

  return {
    messages,
    loading,
    sending,
    askCoach,
    clearHistory,
    reload: loadHistory,
  };
}
