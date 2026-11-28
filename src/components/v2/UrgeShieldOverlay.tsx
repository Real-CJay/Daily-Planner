import { useEffect, useState } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function UrgeShieldOverlay({
  isDark,
  deflectedCount,
  onClose,
  onDeflect,
}: {
  isDark: boolean;
  deflectedCount: number;
  onClose: () => void;
  onDeflect: () => void;
}) {
  const T = getV2Theme(isDark);
  const runDom = getDom('running', isDark);

  const [remSec, setRemSec] = useState(90);
  const [running, setRunning] = useState(true);
  const [steps, setSteps] = useState([
    { id: 'us-1', label: '25 Pushups', done: false },
    { id: 'us-2', label: 'Cold Water', done: false },
    { id: 'us-3', label: 'Step Outside', done: false },
  ]);

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
      setRemSec((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed = 90 - remSec;
  const phaseSec = elapsed % 12;
  const breathCue = phaseSec < 4 ? 'Inhale · 4s' : phaseSec < 8 ? 'Hold · 4s' : 'Exhale · 4s';
  const circ = 2 * Math.PI * 92;
  const ratio = elapsed / 90;

  return (
    <div
      className={`animate-pop fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-10 ${T.pageBg}`}
    >
      <div className="flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${runDom.soft} ${runDom.border} ${runDom.text}`}
          >
            <DuoIcon name="shield" className="h-6 w-6" />
          </div>
          <div>
            <span className={`block font-display text-lg font-extrabold leading-none ${T.text}`}>
              Urge Shield
            </span>
            <span className={`text-[11px] font-bold ${T.muted}`}>{deflectedCount} deflected</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
        >
          Close
        </button>
      </div>

      <div className="my-auto flex w-full max-w-md flex-col items-center gap-6">
        <div className="relative flex h-56 w-56 items-center justify-center">
          {running && (
            <div className="animate-ring-pulse absolute inset-3 rounded-full border-2 border-[#10B981]/40" />
          )}
          <svg className="h-full w-full -rotate-90" viewBox="0 0 210 210">
            <circle
              cx="105"
              cy="105"
              r="92"
              stroke={isDark ? '#1D1D1D' : '#E5E7EB'}
              strokeWidth="12"
              fill="none"
            />
            <circle
              cx="105"
              cy="105"
              r="92"
              stroke="#10B981"
              strokeWidth="12"
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
                isDark ? 'text-[#34D399]' : 'text-[#059669]'
              }`}
            >
              {remSec === 0 ? 'Reset Complete' : breathCue}
            </span>
            <div className={`mt-1 font-display text-5xl font-extrabold tabular-nums ${T.text}`}>
              {fmtClock(remSec)}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                setSteps((prev) => prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))
              }
              className={`cursor-pointer rounded-2xl border p-3 text-center transition-all active:scale-[0.98] ${
                s.done
                  ? isDark
                    ? 'border-[#34D399]/40 bg-[#10B981]/15 text-[#34D399]'
                    : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
                  : `${T.card} ${T.text}`
              }`}
            >
              <span className="block font-display text-xs font-extrabold">
                {s.done ? '✓ ' : ''}
                {s.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className={`cursor-pointer rounded-xl px-5 py-3 font-display text-sm font-bold ${T.btnNeutral}`}
          >
            {running ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={onDeflect}
            className={`cursor-pointer rounded-xl px-7 py-3 font-display text-sm font-bold ${T.btnSuccess}`}
          >
            ✓ Urge Deflected
          </button>
        </div>
      </div>

      <span className={`text-xs font-extrabold uppercase tracking-widest ${T.muted}`}>
        90 seconds · Ride the wave
      </span>
    </div>
  );
}
