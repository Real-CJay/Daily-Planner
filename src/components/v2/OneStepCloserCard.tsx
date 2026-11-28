import { useState } from 'react';
import { getV2Theme } from '@/design-system/v2Theme';

function formatTimeMMSS(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPacePerKm(fiveKSec: number): string {
  const secPerKm = fiveKSec / 5;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function OneStepCloserCard({
  isDark,
  weeklyRunKm,
  currentFiveKSec,
  firstGoalSec,
  longTermGoalSec,
  onOpenRunning,
}: {
  isDark: boolean;
  weeklyRunKm: number;
  currentFiveKSec: number | null;
  firstGoalSec?: number | null;
  longTermGoalSec?: number | null;
  onOpenRunning?: () => void;
}) {
  const T = getV2Theme(isDark);
  const firstGoal = firstGoalSec && firstGoalSec > 0 ? firstGoalSec : 1199; // 19:59 default
  const longGoal = longTermGoalSec && longTermGoalSec > 0 ? longTermGoalSec : 1050; // 17:30 default
  const baselineSec = currentFiveKSec && currentFiveKSec > 0 ? currentFiveKSec : 1300; // 21:40 fallback

  const firstGoalStr = formatTimeMMSS(firstGoal);
  const longGoalStr = formatTimeMMSS(longGoal);

  const milestones = [
    {
      id: 'current',
      label: 'Current',
      time: formatTimeMMSS(baselineSec),
      pace: formatPacePerKm(baselineSec),
      cx: 48,
      cy: 76,
    },
    {
      id: 'first',
      label: 'First Goal',
      time: firstGoalStr,
      pace: formatPacePerKm(firstGoal),
      cx: 146,
      cy: 52,
    },
    {
      id: 'longterm',
      label: 'Long-Term',
      time: longGoalStr,
      pace: formatPacePerKm(longGoal),
      cx: 244,
      cy: 26,
    },
  ];

  const [selectedId, setSelectedId] = useState('first');
  const active = milestones.find((m) => m.id === selectedId) ?? milestones[1];

  const spanSec = 400;
  const liveProgress =
    baselineSec <= firstGoal
      ? 100
      : Math.min(99, Math.max(12, Math.round(((firstGoal + spanSec - baselineSec) / spanSec) * 100)));

  return (
    <div
      className={`overflow-hidden rounded-3xl border transition-colors ${
        isDark
          ? 'border-[#242424] bg-gradient-to-br from-[#141414] via-[#101010] to-[#0A0A0A]'
          : 'border-[#D8E2FE] bg-gradient-to-br from-[#EEF2FF] via-[#F5F7FF] to-[#FFFFFF]'
      }`}
    >
      <div className="relative px-6 pb-1 pt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${
              isDark ? 'text-[#93C5FD]' : 'text-[#4F46E5]'
            }`}
          >
            THE LONG GAME
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
              isDark
                ? 'bg-[#2563EB]/20 text-[#93C5FD]'
                : 'border border-[#BFDBFE] bg-white/90 text-[#2563EB]'
            }`}
          >
            {active.pace}
          </span>
        </div>

        <svg viewBox="0 0 292 104" className="h-28 w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="strideTrackGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={isDark ? '#60A5FA' : '#3B82F6'} />
              <stop offset="55%" stopColor={isDark ? '#818CF8' : '#2563EB'} />
              <stop offset="100%" stopColor={isDark ? '#34D399' : '#059669'} />
            </linearGradient>
            <linearGradient id="strideAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isDark ? '#3B82F6' : '#2563EB'}
                stopOpacity={isDark ? '0.24' : '0.16'}
              />
              <stop offset="100%" stopColor={isDark ? '#3B82F6' : '#2563EB'} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[24, 52, 80].map((y) => (
            <line
              key={y}
              x1="8"
              y1={y}
              x2="284"
              y2={y}
              stroke={isDark ? '#242424' : '#DCE4F8'}
              strokeWidth="1"
              strokeDasharray="4 5"
            />
          ))}

          <path
            d="M168 14v14M161 21h14"
            stroke={isDark ? '#333333' : '#CBD5E1'}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle
            cx="238"
            cy="24"
            r="19"
            fill={isDark ? '#F59E0B' : '#FCD34D'}
            fillOpacity={isDark ? '0.18' : '0.45'}
          />
          <circle
            cx="238"
            cy="24"
            r="11"
            fill={isDark ? '#FBBF24' : '#F59E0B'}
            fillOpacity={isDark ? '0.32' : '0.55'}
          />

          <path
            d="M16 86 C 68 84, 102 62, 146 52 C 190 42, 214 34, 276 20 L 276 96 L 16 96 Z"
            fill="url(#strideAreaGrad)"
          />

          <path
            d="M16 86 C 68 84, 102 62, 146 52 C 190 42, 214 34, 276 20"
            fill="none"
            stroke="url(#strideTrackGrad)"
            strokeWidth="5.5"
            strokeLinecap="round"
          />

          {milestones.map((m) => {
            const isSel = m.id === selectedId;
            return (
              <g key={m.id} onClick={() => setSelectedId(m.id)} className="cursor-pointer">
                {isSel && (
                  <circle
                    cx={m.cx}
                    cy={m.cy}
                    r="13"
                    fill={m.id === 'longterm' ? '#10B981' : '#2563EB'}
                    fillOpacity="0.22"
                  />
                )}
                <circle
                  cx={m.cx}
                  cy={m.cy}
                  r={isSel ? '7.5' : '5.5'}
                  fill={m.id === 'longterm' ? '#10B981' : '#2563EB'}
                  stroke={isDark ? '#101010' : '#FFFFFF'}
                  strokeWidth="2.5"
                />
                <text
                  x={m.cx}
                  y={m.cy + 21}
                  textAnchor="middle"
                  fill={
                    isSel
                      ? isDark
                        ? '#F5F5F5'
                        : '#0F172A'
                      : isDark
                        ? '#8E8E8E'
                        : '#64748B'
                  }
                  fontSize="10"
                  fontWeight="800"
                >
                  {m.time}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-4 px-6 pb-6 pt-1">
        <div>
          <h3 className={`font-display text-2xl font-extrabold tracking-tight ${T.text}`}>
            One step closer.
          </h3>
          <p className={`mt-1 text-xs font-semibold ${T.muted}`}>
            First milestone: {firstGoalStr} · Next chapter: {longGoalStr}.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {milestones.map((m) => {
            const sel = m.id === selectedId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`cursor-pointer rounded-xl border px-2 py-2 text-center transition-all active:scale-[0.98] ${
                  sel
                    ? isDark
                      ? 'border-[#60A5FA]/50 bg-[#2563EB]/20 text-[#F5F5F5]'
                      : 'border-[#2563EB] bg-white text-[#0F172A] shadow-sm'
                    : isDark
                      ? 'border-[#262626] bg-[#171717] text-[#8E8E8E] hover:text-[#F5F5F5]'
                      : 'border-[#DCE4F8] bg-white/60 text-[#64748B] hover:bg-white'
                }`}
              >
                <span className="block font-display text-xs font-extrabold tabular-nums">
                  {m.time}
                </span>
                <span className="block text-[10px] font-bold opacity-80">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-extrabold tabular-nums">
            <span className={T.muted}>{weeklyRunKm.toFixed(1)} km this week</span>
            <span className={isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]'}>
              {liveProgress}% to {firstGoalStr}
            </span>
          </div>
          <div
            className={`h-2 w-full overflow-hidden rounded-full ${
              isDark ? 'bg-[#1C1C1C]' : 'border border-[#DCE4F8] bg-white/90'
            }`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#10B981] transition-all duration-300"
              style={{ width: `${liveProgress}%` }}
            />
          </div>
        </div>

        {onOpenRunning && (
          <button
            type="button"
            onClick={onOpenRunning}
            className={`inline-flex cursor-pointer items-center gap-1.5 font-display text-xs font-extrabold transition-colors sm:text-sm ${
              isDark ? 'text-[#93C5FD] hover:text-white' : 'text-[#0F172A] hover:text-[#2563EB]'
            }`}
          >
            <span>Your running goals</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
}
