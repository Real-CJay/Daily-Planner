import { useEffect, useState, type FormEvent } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MonkFocusOverlay({
  isDark,
  onClose,
  onFinish,
}: {
  isDark: boolean;
  onClose: () => void;
  onFinish: (activity: string) => void;
}) {
  const T = getV2Theme(isDark);
  const sleepDom = getDom('sleep', isDark);

  const [activity, setActivity] = useState('Deep Focus');
  const [totalSec, setTotalSec] = useState(25 * 60);
  const [remSec, setRemSec] = useState(25 * 60);
  const [customMin, setCustomMin] = useState('15');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && remSec === 0) {
      setRunning(false);
      onFinish(activity);
    }
  }, [running, remSec, activity, onFinish]);

  function handleSetCustom(e: FormEvent) {
    e.preventDefault();
    const mins = Math.max(1, Math.min(180, Number(customMin) || 15));
    setRunning(false);
    setTotalSec(mins * 60);
    setRemSec(mins * 60);
  }

  const circ = 2 * Math.PI * 100;
  const ratio = totalSec ? (totalSec - remSec) / totalSec : 0;

  return (
    <div
      className={`animate-pop fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 ${T.pageBg}`}
    >
      <div className="flex w-full max-w-3xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${sleepDom.soft} ${sleepDom.border} ${sleepDom.text}`}
          >
            <DuoIcon name="monk" className="h-5 w-5" />
          </div>
          <span className={`font-display text-lg font-extrabold ${T.text}`}>Monk Focus</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
        >
          Exit
        </button>
      </div>

      <div className="my-auto flex flex-col items-center gap-6">
        <div className="flex flex-wrap justify-center gap-2">
          {['Deep Focus', 'Vocal', 'Strength', 'Reading', 'Kata'].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setActivity(a)}
              className={`cursor-pointer rounded-xl border px-3.5 py-1.5 text-xs font-extrabold transition-all active:scale-[0.98] ${
                activity === a
                  ? `${sleepDom.soft} ${sleepDom.border} ${sleepDom.text}`
                  : `${T.card} ${T.muted}`
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {[25, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setRunning(false);
                setTotalSec(m * 60);
                setRemSec(m * 60);
              }}
              className={`cursor-pointer rounded-xl border px-4 py-1.5 text-xs font-extrabold tabular-nums transition-all active:scale-[0.98] ${
                totalSec === m * 60 ? T.btnInk : T.btnWhite
              }`}
            >
              {m}m
            </button>
          ))}
          <form onSubmit={handleSetCustom} className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={180}
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value)}
              className={`w-14 rounded-xl border px-2 py-1.5 text-center text-xs font-extrabold tabular-nums ${T.input}`}
            />
            <button
              type="submit"
              className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-xs font-extrabold ${T.btnNeutral}`}
            >
              Set
            </button>
          </form>
        </div>

        <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
          {running && (
            <div className="animate-ring-pulse absolute inset-3 rounded-full border-2 border-[#3B82F6]/40" />
          )}
          <svg className="h-full w-full -rotate-90" viewBox="0 0 230 230">
            <circle
              cx="115"
              cy="115"
              r="100"
              stroke={isDark ? '#1D1D1D' : '#E5E7EB'}
              strokeWidth="14"
              fill="none"
            />
            <circle
              cx="115"
              cy="115"
              r="100"
              stroke="#2563EB"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - ratio)}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute text-center">
            <span
              className={`text-xs font-extrabold uppercase tracking-wider ${
                isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]'
              }`}
            >
              {activity}
            </span>
            <div
              className={`mt-1 font-display text-5xl font-extrabold tabular-nums sm:text-6xl ${T.text}`}
            >
              {fmtClock(remSec)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setRemSec(totalSec);
            }}
            className={`cursor-pointer rounded-xl px-5 py-3 font-display text-sm font-bold ${T.btnNeutral}`}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className={`cursor-pointer rounded-xl px-8 py-3 font-display text-base font-bold ${T.btnPrimary}`}
          >
            {running ? 'Pause' : 'Start Focus'}
          </button>
        </div>
      </div>

      <span className={`text-xs font-extrabold uppercase tracking-widest ${T.muted}`}>
        Single-task · Zero noise
      </span>
    </div>
  );
}
