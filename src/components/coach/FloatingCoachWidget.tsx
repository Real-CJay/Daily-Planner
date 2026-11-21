import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUp, Bell, Maximize2, Sparkles, X } from 'lucide-react';
import { ProvenanceBadge } from '@/design-system';
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
  'How should I pace my next run?',
  'Balance Karate & running this week',
  'Next step toward Sub-20 5K',
];

export function FloatingCoachWidget() {
  const { pathname } = useLocation();
  const { user, profile } = useAuth();

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);

  const panelRef = useRef<HTMLElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef<number>(0);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const isCoachRoute = pathname.startsWith('/coach');

  const loadCoachData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [msgRows, runRows, pbRows, planRows, blockRows, checkInRows] = await Promise.all([
        listCoachMessages(user.id, 30),
        listRunningSessions(user.id).catch(() => [] as RunningSession[]),
        listPersonalBests(user.id).catch(() => [] as PersonalBest[]),
        listPlannedWorkouts(user.id, today, addDaysIso(today, 6)).catch(
          () => [] as PlannedWorkout[]
        ),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listReadinessCheckIns(user.id, 14).catch(() => [] as ReadinessCheckIn[]),
      ]);
      setMessages(msgRows);
      setSessions(runRows);
      setPbs(pbRows);
      setPlanned(planRows);
      setBlocks(blockRows);
      setCheckIns(checkInRows);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load coach.');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    if (open && !loaded && !loading) {
      void loadCoachData();
    }
  }, [open, loaded, loading, loadCoachData]);

  // Outside click & Escape close WITHOUT blurring or dimming the background
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  // Snap instantly to bottom on open or initial load (no top-to-bottom scroll jump)
  useLayoutEffect(() => {
    if (!open || loading || !threadRef.current) return;
    const el = threadRef.current;
    const grew = messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0;
    if (grew || sending) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    prevMsgCountRef.current = messages.length;
  }, [open, loading, messages.length, sending]);

  useEffect(() => {
    if (!open) {
      prevMsgCountRef.current = 0;
    }
  }, [open]);

  useEffect(() => {
    if (isCoachRoute && open) {
      setOpen(false);
    }
  }, [isCoachRoute, open]);

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

  async function sendMessage(text: string) {
    if (!user || !text.trim() || sending) return;
    const trimmed = text.trim();
    setSending(true);
    setError(null);

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

  if (!user) return null;

  return (
    <>
      {/* Slide-Up Coach Chatbox (no background blur) */}
      {!isCoachRoute && open && (
        <section
          ref={panelRef}
          role="dialog"
          aria-label="Stride AI Coach"
          className="fixed bottom-[84px] right-4 z-50 flex h-[min(580px,calc(100vh-6.5rem))] w-[min(450px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_20px_60px_rgba(0,0,0,0.22)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] md:bottom-6 md:right-6"
        >
          {/* Chatbox Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--blue-lite)] text-[var(--blue)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="text-[13.5px] font-bold text-[var(--ink)]">
                    Stride Coach
                  </strong>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      canCallGemini ? 'bg-[#2D9D87]' : 'bg-[#D58D38]'
                    }`}
                  />
                </div>
                <span className="block truncate font-mono text-[10px] text-[var(--muted)]">
                  {canCallGemini ? activeModelName : 'deterministic-local'} · {sessions.length} runs
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link
                to="/coach"
                onClick={() => setOpen(false)}
                title="Open full Coach page"
                aria-label="Open full Coach page"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close coach chatbox"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="shrink-0 border-b border-red-400/40 bg-red-500/10 px-5 py-2 text-[11.5px] font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Message Thread with Clean Reading Margins */}
          <div
            ref={threadRef}
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
          >
            {loading ? (
              <div className="m-auto text-xs text-[var(--muted)]">Syncing training context…</div>
            ) : messages.length === 0 ? (
              <div className="m-auto w-full max-w-[330px] py-2 text-center">
                <div className="inline-grid h-10 w-10 place-items-center rounded-2xl bg-[var(--blue-lite)] text-[var(--blue)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="mt-3 text-[17px] font-bold tracking-[-0.03em] text-[var(--ink)]">
                  Ask your trainer
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  Grounded strictly in your recorded runs, readiness, and weekly load.
                </p>
                <div className="mt-4 space-y-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendMessage(prompt)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-left text-[12px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--blue)]/50 hover:bg-[var(--surface-2)]"
                    >
                      <span>{prompt}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
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
                      <div key={msg.id} className="flex justify-end pl-6">
                        <div className="rounded-2xl rounded-tr-sm bg-[var(--blue-lite)] px-4 py-2.5 text-[13px] font-medium leading-[1.55] text-[var(--ink)]">
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 pr-4">
                      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-2)] text-[var(--blue)]">
                        <Sparkles className="h-3 w-3" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--bg)] px-4 py-3">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-[var(--ink)]">Coach</span>
                          <ProvenanceBadge origin={msg.data_origin} />
                        </div>
                        <div className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[var(--ink)]">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sending && (
                  <div className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--muted)]">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-[var(--blue)]" />
                    <span>Reviewing your verified logs…</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pinned Composer */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3"
          >
            <div className="flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--bg)] p-1 pl-3.5 focus-within:border-[var(--blue)] focus-within:bg-[var(--surface)]">
              <input
                type="text"
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message your coach…"
                disabled={sending}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send message"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--blue)] text-white transition-opacity hover:opacity-90 disabled:bg-[var(--surface-3)] disabled:text-[var(--faint)] dark:text-[#121315]"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Bottom-Right Action Dock: Reminders Bell + Persistent Ask Coach Pill */}
      {!open && (
        <div className="fixed bottom-[84px] right-4 z-40 flex items-center gap-2 md:bottom-6 md:right-6">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('stride:open-reminders'))}
            title="Session reminder settings"
            aria-label="Open session reminder settings"
            className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_8px_22px_rgba(0,0,0,0.12)] transition-all hover:-translate-y-0.5 hover:border-[var(--blue)] hover:text-[var(--blue)] dark:shadow-[0_8px_22px_rgba(0,0,0,0.45)]"
          >
            <Bell className="h-4 w-4 stroke-[2.2]" />
          </button>

          {!isCoachRoute && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open AI Coach chatbox"
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[var(--blue)] px-5 text-[13.5px] font-bold text-white shadow-[0_10px_28px_rgba(49,91,223,0.34)] ring-2 ring-[var(--surface)] transition-all hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 dark:text-[#121315] dark:shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
            >
              <Sparkles className="h-4 w-4 stroke-[2.3]" />
              <span>Ask Coach</span>
              <span className="h-2 w-2 rounded-full bg-[#4ee6a8] dark:bg-[#121315]/70" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
