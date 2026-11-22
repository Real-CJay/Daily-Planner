import { useEffect, useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { getMondayIso } from '@/modules/calendar/timelineEngine';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatMonthLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function HabitHistoryModal({
  title,
  todayIso,
  completedDates,
  failedDates,
  currentStreak,
  bestStreak,
  busyDate,
  onToggleDate,
  onClose,
}: {
  title: string;
  todayIso: string;
  completedDates: Set<string>;
  failedDates?: Set<string>;
  currentStreak: number;
  bestStreak: number;
  busyDate: string | null;
  onToggleDate: (dateIso: string) => Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const gridDates = useMemo(() => {
    const thisMonday = getMondayIso(todayIso);
    const startMonday = addDaysIso(thisMonday, -28);
    return Array.from({ length: 35 }, (_, i) => addDaysIso(startMonday, i));
  }, [todayIso]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} history`}
        className="w-full max-w-[460px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              {title}
            </h2>
            <p className="mt-0.5 font-mono text-[11.5px] text-[var(--muted)]">
              Current {currentStreak}d · Best {bestStreak}d · Tap any past day to toggle
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
          {DAY_HEADERS.map((d) => (
            <span
              key={d}
              className="pb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--faint)]"
            >
              {d}
            </span>
          ))}

          {gridDates.map((dateIso) => {
            const isFuture = dateIso > todayIso;
            const isToday = dateIso === todayIso;
            const failed = Boolean(failedDates?.has(dateIso));
            const completed = !failed && completedDates.has(dateIso);
            const isBusy = busyDate === dateIso;

            return (
              <button
                key={dateIso}
                type="button"
                disabled={isFuture || failed || isBusy}
                onClick={() => void onToggleDate(dateIso)}
                title={
                  isFuture
                    ? `${formatMonthLabel(dateIso)} (future)`
                    : failed
                      ? `${formatMonthLabel(dateIso)} — Failed (locked)`
                      : `${formatMonthLabel(dateIso)} — ${completed ? 'Checked in (tap to undo)' : 'Not checked (tap to check in)'}`
                }
                className={`relative flex h-11 flex-col items-center justify-center rounded-xl border font-mono text-[12px] font-bold transition-all ${
                  isFuture
                    ? 'cursor-not-allowed border-transparent bg-transparent text-[var(--faint)] opacity-35'
                    : failed
                      ? 'cursor-not-allowed border-red-400/50 bg-red-500/12 text-red-700 dark:text-red-300'
                      : completed
                        ? 'border-[#e4ad42]/60 bg-[#e4ad42]/18 text-[var(--ink)] hover:bg-[#e4ad42]/28'
                        : isToday
                          ? 'border-[var(--blue)] bg-[var(--blue-lite)]/60 text-[var(--blue-ink)] hover:bg-[var(--blue-lite)]'
                          : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
                }`}
              >
                <span>{Number(dateIso.slice(8))}</span>
                {failed ? (
                  <X className="mt-0.5 h-3 w-3 stroke-[2.8]" />
                ) : completed ? (
                  <Check className="mt-0.5 h-3 w-3 stroke-[2.8] text-[#b98529] dark:text-[#f4cf72]" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4">
          <span className="text-[11px] text-[var(--muted)]">
            {formatMonthLabel(gridDates[0])} – {formatMonthLabel(todayIso)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[9px] bg-[var(--primary-button)] px-4 text-[12.5px] font-bold text-[var(--button-text)] hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
