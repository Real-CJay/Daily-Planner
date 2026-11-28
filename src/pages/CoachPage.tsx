import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { COACH_QUICK_PROMPTS, useLiveCoach } from '@/modules/coach/useLiveCoach';

export function CoachPage() {
  const { resolvedTheme } = useTheme();
  const { pushToast } = useFeedback();
  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const runDom = getDom('running', isDark);

  const { messages, loading, sending, askCoach, clearHistory } = useLiveCoach();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    await askCoach(q);
  }

  async function handleClear() {
    if (!window.confirm('Clear Coach chat history?')) return;
    await clearHistory();
    pushToast('Chat history cleared', '#2563EB');
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 animate-pop">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${runDom.soft} ${runDom.border} ${runDom.text}`}
          >
            <DuoIcon name="spark" className="h-7 w-7" />
          </div>
          <div>
            <h1 className={`font-display text-3xl font-extrabold ${T.text}`}>Coach</h1>
            <span className={`text-xs font-extrabold ${isDark ? 'text-[#34D399]' : 'text-[#059669]'}`}>
              Live telemetry synced
            </span>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-extrabold ${T.btnNeutral}`}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Chat Card */}
      <div className={`flex min-h-0 flex-1 flex-col gap-4 rounded-3xl border p-5 ${T.card}`}>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className={`p-6 text-center text-xs font-bold ${T.muted}`}>Loading chat...</div>
          ) : messages.length === 0 ? (
            <div className={`space-y-2 rounded-2xl border p-5 ${T.cardSubtle}`}>
              <div className={`font-display text-sm font-extrabold ${T.text}`}>
                Ready when you are.
              </div>
              <p className={`text-xs font-semibold leading-relaxed ${T.muted}`}>
                Ask about your Sub-20 5K pacing, weekly training balance, Karate + Strength load, or recovery readiness.
              </p>
            </div>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 font-display text-xs font-bold sm:text-sm ${
                      isDark ? 'bg-[#2563EB] text-white' : 'bg-[#0F172A] text-white'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ) : (
                <div
                  key={m.id}
                  className={`max-w-[92%] space-y-2 rounded-2xl border p-4 ${T.cardSubtle}`}
                >
                  <div className={`whitespace-pre-wrap text-xs font-semibold leading-relaxed sm:text-sm ${T.text}`}>
                    {m.content}
                  </div>
                  {m.model_used && (
                    <span className={`inline-block text-[10px] font-extrabold uppercase tracking-wider ${T.muted}`}>
                      {m.model_used}
                    </span>
                  )}
                </div>
              )
            )
          )}

          {sending && (
            <div className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#2563EB]" />
              Thinking with your live telemetry...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Prompt Chips */}
        <div className={`flex flex-wrap gap-2 border-t pt-3 ${T.divider}`}>
          {COACH_QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={sending}
              onClick={() => void askCoach(p)}
              className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all active:scale-[0.98] disabled:opacity-50 ${runDom.soft} ${runDom.border} ${runDom.text}`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Coach..."
            disabled={sending}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold focus:outline-none disabled:opacity-50 ${T.input}`}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className={`cursor-pointer rounded-xl px-5 py-3 font-display text-sm font-bold disabled:opacity-50 ${T.btnPrimary}`}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
