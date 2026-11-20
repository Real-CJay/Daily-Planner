import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Eye,
  Lock,
  Send,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, ProvenanceBadge } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { listPersonalBests } from '@/modules/analytics/repository';
import { listReadinessCheckIns, listScheduleBlocks } from '@/modules/calendar/repository';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { listPlannedWorkouts } from '@/modules/plan/repository';
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
import type {
  CoachMessage,
  PersonalBest,
  PlannedWorkout,
  ReadinessCheckIn,
  RunningSession,
  ScheduleBlock,
} from '@/types/domain';

const QUICK_PROMPTS = [
  'How should I pace my next run based on my recorded data?',
  'Am I balancing Karate load and running safely this week?',
  'What is my realistic step toward my Sub-20 5K goal?',
  'Summarize my recovery signals and whether I should adjust intensity.',
];

export function CoachPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [msgRows, runRows, pbRows, planRows, blockRows, checkInRows] = await Promise.all([
        listCoachMessages(user.id, 40),
        listRunningSessions(user.id),
        listPersonalBests(user.id).catch(() => [] as PersonalBest[]),
        listPlannedWorkouts(user.id, today, addDaysIso(today, 6)).catch(() => [] as PlannedWorkout[]),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listReadinessCheckIns(user.id, 14).catch(() => [] as ReadinessCheckIn[]),
      ]);
      setMessages(msgRows);
      setSessions(runRows);
      setPbs(pbRows);
      setPlanned(planRows);
      setBlocks(blockRows);
      setCheckIns(checkInRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coach workspace.');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const compactContext = useMemo(() => {
    return buildCompactCoachContext({
      today,
      profile: {
        timezone: tz,
        current_phase: profile?.current_phase ?? 'REBUILDING',
        immediate_goal: profile?.immediate_goal ?? 'Rebuild consistent pain-free running',
        first_major_5k_goal_s: profile?.first_major_5k_goal_s ?? 1200,
        long_term_5k_goal_s: profile?.long_term_5k_goal_s ?? 1050,
        ai_share_notes: profile?.ai_share_notes ?? false,
        ai_share_recovery: profile?.ai_share_recovery ?? true,
        ai_share_karate: profile?.ai_share_karate ?? true,
        ai_share_commitments: profile?.ai_share_commitments ?? false,
      },
      sessions,
      personalBests: pbs,
      plannedWorkouts: planned,
      blocks,
      checkIns,
    });
  }, [today, tz, profile, sessions, pbs, planned, blocks, checkIns]);

  const canCallGemini = Boolean(profile?.ai_enabled && profile?.ai_privacy_consent_acknowledged);

  async function sendMessage(text: string) {
    if (!user || !text.trim() || sending) return;
    const trimmed = text.trim();
    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const savedUserMsg = await insertCoachMessage(user.id, {
        role: 'user',
        content: trimmed,
        model_used: null,
        context_snapshot: null,
        data_origin: 'RECORDED',
      });
      setMessages((prev) => [...prev, savedUserMsg]);
      setInput('');

      let replyText = '';
      let modelUsed = 'deterministic-local';

      if (canCallGemini) {
        try {
          const res = await requestServerCoachReply({
            mode: 'CHAT',
            message: trimmed,
            history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
            context: compactContext,
            preferredModel: profile?.ai_preferred_model || 'gemini-2.5-flash',
          });
          replyText = res.reply;
          modelUsed = res.model;
        } catch {
          replyText = generateDeterministicCoachFallback(trimmed, compactContext, sessions);
          setNotice(
            'Server endpoint `/api/coach` was unreachable; replied using the grounded deterministic engine.'
          );
        }
      } else {
        replyText = generateDeterministicCoachFallback(trimmed, compactContext, sessions);
      }

      const savedAssistantMsg = await insertCoachMessage(user.id, {
        role: 'assistant',
        content: replyText,
        model_used: modelUsed,
        context_snapshot: compactContext as unknown as Record<string, unknown>,
        data_origin: 'SUGGESTED',
      });
      setMessages((prev) => [...prev, savedAssistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  async function handleClearHistory() {
    if (!user) return;
    if (!window.confirm('Clear all saved coach messages?')) return;
    await clearCoachMessages(user.id);
    setMessages([]);
    setNotice('Conversation history cleared.');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Running Coach"
        subtitle="Grounded strictly in your verified Supabase records with explicit privacy boundaries."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowContext((v) => !v)}>
              <Eye className="h-4 w-4" />
              <span>{showContext ? 'Hide Context JSON' : 'Inspect Context'}</span>
            </Button>
            {messages.length > 0 && (
              <Button variant="secondary" onClick={() => void handleClearHistory()}>
                <Trash2 className="h-4 w-4" />
                <span>Clear Chat</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Privacy & Mode Status Banner */}
      <Card className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          {canCallGemini ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          ) : (
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          )}
          <div className="text-xs">
            <div className="font-semibold text-slate-900">
              {canCallGemini
                ? `Server-Side AI Enabled (${profile?.ai_preferred_model || 'gemini-2.5-flash'})`
                : 'Deterministic Local Mode Active'}
            </div>
            <p className="mt-0.5 text-slate-600">
              Sharing scope: Notes {compactContext.privacyApplied.shareNotes ? 'ON' : 'OFF'} ·
              Recovery {compactContext.privacyApplied.shareRecovery ? 'ON' : 'OFF'} · Karate{' '}
              {compactContext.privacyApplied.shareKarate ? 'ON' : 'OFF'} · Other Commitments{' '}
              {compactContext.privacyApplied.shareCommitments ? 'ON' : 'OFF'}.
            </p>
          </div>
        </div>
        <Link
          to="/settings"
          className="shrink-0 text-xs font-semibold text-blue-700 hover:underline"
        >
          Manage AI &amp; Privacy →
        </Link>
      </Card>

      {showContext && (
        <Card className="bg-slate-950 p-4 text-slate-100">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Verified Compact Context Payload Sent to Coach</span>
            <span className="font-mono text-[11px] text-slate-400">
              {JSON.stringify(compactContext).length} bytes
            </span>
          </div>
          <pre className="max-h-72 overflow-auto font-mono text-[11px] leading-relaxed text-slate-200">
            {JSON.stringify(compactContext, null, 2)}
          </pre>
        </Card>
      )}

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-900">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={sending}
            onClick={() => void sendMessage(prompt)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-800 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Thread */}
      <Card className="flex flex-col overflow-hidden">
        <div className="max-h-[520px] min-h-[300px] space-y-4 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading conversation history...
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<Bot className="h-5 w-5" />}
              title="Start a grounded coaching conversation"
              description="Ask about pacing, 5K trajectory, Karate load balance, or recovery. Replies only reference verified data from your logs."
            />
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-blue-400">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                  >
                    {!isUser && (
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase text-slate-500">
                          {msg.model_used ?? 'coach'}
                        </span>
                        <ProvenanceBadge origin={msg.data_origin} />
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your running coach..."
            disabled={sending}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
            <span>{sending ? 'Thinking...' : 'Send'}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}