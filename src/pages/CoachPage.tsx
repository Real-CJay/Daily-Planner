import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  Eye,
  HeartPulse,
  Info,
  MoreHorizontal,
  Route,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button, ProvenanceBadge } from '@/design-system';
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

  const threadRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef<number>(0);

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

  useLayoutEffect(() => {
    if (loading || !threadRef.current) return;
    const el = threadRef.current;
    const grew = messages.length > prevCountRef.current && prevCountRef.current > 0;
    if (grew || sending) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [loading, messages.length, sending]);

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

  const canCallGemini = Boolean(profile?.ai_enabled || profile?.ai_privacy_consent_acknowledged);
  const activeModelName =
    !profile?.ai_preferred_model || profile.ai_preferred_model === 'gemini-2.5-flash'
      ? 'gemini-4-hydrogen'
      : profile.ai_preferred_model;

  const latestCheckIn = checkIns[0] ?? null;

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
            preferredModel: activeModelName,
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Compact Single-Row Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-bold tracking-[-0.04em] text-[var(--ink)] sm:text-[26px]">
            Train with <em className="not-italic text-[var(--blue)]">intention.</em>
          </h1>
          <span className="hidden text-[12px] text-[var(--muted)] md:inline">
            Grounded strictly in your verified Supabase records
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to="/weekly-review"
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>Weekly review</span>
          </Link>
          <Button
            variant="secondary"
            onClick={() => setShowContext((v) => !v)}
            className="!min-h-[32px] !rounded-[8px] !px-3 !py-1 !text-[12px]"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{showContext ? 'Hide JSON' : 'Context'}</span>
          </Button>
          {messages.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => void handleClearHistory()}
              className="!min-h-[32px] !rounded-[8px] !px-2.5 !py-1 !text-[12px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </Button>
          )}
        </div>
      </div>

      {showContext && (
        <div className="shrink-0 rounded-xl border border-[var(--line)] bg-[#14161a] p-3.5 text-[#e8eaef]">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#a1a3ab]">
            <span>Verified Compact Context Payload Sent to Coach</span>
            <span className="font-mono text-[10px]">
              {JSON.stringify(compactContext).length} bytes
            </span>
          </div>
          <pre className="max-h-40 overflow-auto font-mono text-[10.5px] leading-relaxed">
            {JSON.stringify(compactContext, null, 2)}
          </pre>
        </div>
      )}

      {(notice || error) && (
        <div
          className={`shrink-0 rounded-lg border px-3.5 py-2 text-xs font-semibold ${
            error
              ? 'border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-300'
              : 'border-[var(--line)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
          }`}
        >
          {error ?? notice}
        </div>
      )}

      {/* Viewport-Locked 2-Column Workspace */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(270px,0.82fr)]">
        {/* Left: Modern Editorial Chat Canvas */}
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {/* Minimal Status Header */}
          <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-[var(--line)] px-5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--blue-lite)] text-[var(--blue)]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="flex min-w-0 items-baseline gap-2">
                <strong className="text-[13px] font-bold text-[var(--ink)]">
                  Stride Coach
                </strong>
                <span className="truncate font-mono text-[10.5px] text-[var(--muted)]">
                  {canCallGemini ? activeModelName : 'deterministic-local'}
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  canCallGemini ? 'bg-[#2D9D87]' : 'bg-[#D58D38]'
                }`}
              />
              {canCallGemini ? 'Connected' : 'Local'}
            </span>
          </div>

          {/* Scrollable Editorial Message Thread */}
          <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6 sm:px-9">
            {loading ? (
              <div className="m-auto text-sm text-[var(--muted)]">
                Loading conversation history...
              </div>
            ) : messages.length === 0 ? (
              <div className="m-auto w-full max-w-[460px] py-4 text-center">
                <div className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-[var(--blue-lite)] text-[var(--blue)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-3.5 text-[22px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  What are we working on today?
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  Ask about pacing, 5K trajectory, Karate load balance, or recovery.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendMessage(prompt)}
                      className="flex items-start justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-left text-[11.5px] font-medium leading-snug text-[var(--ink)] transition-colors hover:border-[var(--blue)]/50 hover:bg-[var(--surface-2)] disabled:opacity-50"
                    >
                      <span>{prompt}</span>
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  if (isUser) {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-[var(--blue-lite)] px-4 py-2.5 text-[13.5px] font-medium leading-relaxed text-[var(--ink)]">
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="flex items-start gap-3">
                      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--blue)]">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11.5px] font-bold text-[var(--ink)]">
                            Coach
                          </span>
                          <span className="font-mono text-[10px] text-[var(--faint)]">
                            {msg.model_used ?? 'grounded'}
                          </span>
                          <ProvenanceBadge origin={msg.data_origin} />
                        </div>
                        <div className="whitespace-pre-wrap text-[13.5px] leading-[1.68] text-[var(--ink)]">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sending && (
                  <div className="flex items-center gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--blue)]">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--muted)]">
                      <span>Reviewing your training data</span>
                      <span className="inline-flex gap-0.5">
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--blue)]" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--blue)] [animation-delay:120ms]" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--blue)] [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                )}
                
              </>
            )}
          </div>

          {/* Modern Pinned Composer */}
          <div className="shrink-0 px-4 pb-3 pt-1 sm:px-6">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 rounded-2xl border border-[var(--line-strong)] bg-[var(--bg)] p-1.5 pl-4 transition-colors focus-within:border-[var(--blue)] focus-within:bg-[var(--surface)]"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your running coach…"
                aria-label="Ask your coach"
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--blue)] text-white transition-opacity hover:opacity-90 disabled:bg-[var(--surface-3)] disabled:text-[var(--faint)] dark:text-[#121315]"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </button>
            </form>
            <div className="mt-1.5 text-center text-[10px] text-[var(--faint)]">
              Grounded strictly in your recorded Supabase runs, readiness, and schedule.
            </div>
          </div>
        </section>

        {/* Right: Grounded Context Sidebar */}
        <aside className="hidden h-full min-h-0 flex-col overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:flex">
          <div className="text-[10.5px] font-bold tracking-[0.12em] text-[var(--muted)]">
            WHAT YOUR COACH KNOWS
          </div>
          <h2 className="mt-1.5 text-[19px] font-bold leading-tight tracking-[-0.035em] text-[var(--ink)]">
            Grounded in your real life.
          </h2>

          <div className="mt-3.5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            <div className="flex items-center gap-3 py-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--surface-2)] text-[var(--run)]">
                <Route className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-[12px] text-[var(--ink)]">Recorded runs</b>
                <span className="text-[11px] text-[var(--muted)]">
                  {sessions.length} session{sessions.length === 1 ? '' : 's'} available
                </span>
              </div>
              {sessions.length > 0 ? (
                <Check className="h-4 w-4 text-[var(--muted)]" />
              ) : (
                <MoreHorizontal className="h-4 w-4 text-[var(--faint)]" />
              )}
            </div>

            <div className="flex items-center gap-3 py-3">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                style={{
                  color: 'var(--karate)',
                  background: 'color-mix(in srgb, var(--karate) 12%, var(--surface))',
                }}
              >
                <HeartPulse className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-[12px] text-[var(--ink)]">Readiness</b>
                <span className="text-[11px] text-[var(--muted)]">
                  {latestCheckIn
                    ? `Checked in on ${latestCheckIn.checkin_date}`
                    : 'No check-in logged yet'}
                </span>
              </div>
              {latestCheckIn ? (
                <Check className="h-4 w-4 text-[var(--muted)]" />
              ) : (
                <MoreHorizontal className="h-4 w-4 text-[var(--faint)]" />
              )}
            </div>

            <div className="flex items-center gap-3 py-3">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
                style={{
                  color: 'var(--music)',
                  background: 'color-mix(in srgb, var(--music) 12%, var(--surface))',
                }}
              >
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <b className="block text-[12px] text-[var(--ink)]">Non-running load</b>
                <span className="text-[11px] text-[var(--muted)]">
                  {blocks.length} blocks · Karate{' '}
                  {compactContext.privacyApplied.shareKarate ? 'ON' : 'OFF'}
                </span>
              </div>
              <Check className="h-4 w-4 text-[var(--muted)]" />
            </div>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-[8px] bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your coach never invents sessions or treats planned workouts as completed.
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-3">
            <Link
              to="/calendar"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
            >
              <span>Log today&apos;s readiness</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/settings"
              className="text-center text-[11px] font-semibold text-[var(--blue)] hover:underline"
            >
              Manage AI &amp; Privacy →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
