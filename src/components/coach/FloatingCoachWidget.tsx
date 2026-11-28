import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useTheme } from '@/modules/theme/ThemeContext';
import { COACH_QUICK_PROMPTS, useLiveCoach } from '@/modules/coach/useLiveCoach';

export function FloatingCoachWidget() {
  const { pathname } = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const runDom = getDom('running', isDark);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, sending, askCoach } = useLiveCoach();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Hide floating pill on the dedicated /coach route
  if (pathname.startsWith('/coach')) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    await askCoach(q);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-20 right-4 z-30 inline-flex cursor-pointer items-center gap-2.5 rounded-full border py-2.5 pl-3 pr-5 font-display text-sm font-extrabold shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98] md:bottom-5 md:right-5 ${
          isDark
            ? 'border-[#2A2A2A] bg-[#111111] text-[#F5F5F5] hover:border-[#404040]'
            : 'border-[#BFDBFE] bg-white text-[#0F172A] hover:border-[#2563EB]'
        }`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-white">
          <DuoIcon name="spark" className="h-4 w-4" />
        </span>
        <span>Ask Coach</span>
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-40 ${T.modalOverlay}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside
            className={`animate-slide absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col border-l shadow-2xl ${T.card}`}
          >
            <div className={`flex items-center justify-between border-b px-5 py-4 ${T.divider}`}>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${runDom.soft} ${runDom.border} ${runDom.text}`}
                >
                  <DuoIcon name="spark" className="h-5 w-5" />
                </div>
                <div>
                  <h2 className={`font-display text-base font-extrabold ${T.text}`}>
                    Stride Coach
                  </h2>
                  <span
                    className={`text-[11px] font-extrabold ${
                      isDark ? 'text-[#34D399]' : 'text-[#059669]'
                    }`}
                  >
                    Live telemetry
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close coach"
                className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
              >
                ×
              </button>
            </div>

            <div className={`flex-1 space-y-3 overflow-y-auto p-5 ${T.surface}`}>
              {messages.length === 0 ? (
                <div className={`space-y-1.5 rounded-2xl border p-4 ${T.card}`}>
                  <div className={`font-display text-sm font-extrabold ${T.text}`}>
                    Ask anything about your training
                  </div>
                  <p className={`text-xs font-semibold ${T.muted}`}>
                    Grounded in your real runs, schedule, streaks, and readiness.
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
                      className={`max-w-[92%] rounded-2xl border p-3.5 text-xs font-semibold leading-relaxed whitespace-pre-wrap ${T.card} ${T.text}`}
                    >
                      {m.content}
                    </div>
                  )
                )
              )}

              {sending && (
                <div className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-bold ${T.card} ${T.muted}`}>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#2563EB]" />
                  Thinking...
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className={`space-y-3 border-t p-4 ${T.card} ${T.divider}`}>
              <div className="flex flex-wrap gap-1.5">
                {COACH_QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={sending}
                    onClick={() => void askCoach(p)}
                    className={`cursor-pointer rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition-all active:scale-[0.98] disabled:opacity-50 ${runDom.soft} ${runDom.border} ${runDom.text}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => void handleSubmit(e)} className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Coach..."
                  disabled={sending}
                  className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-bold focus:outline-none disabled:opacity-50 ${T.input}`}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-sm font-bold disabled:opacity-50 ${T.btnPrimary}`}
                >
                  Send
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
