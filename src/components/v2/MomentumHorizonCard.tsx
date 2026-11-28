import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';

export function MomentumHorizonCard({
  isDark,
  streakDays,
}: {
  isDark: boolean;
  streakDays: number;
}) {
  const T = getV2Theme(isDark);
  const readingDom = getDom('reading', isDark);

  const steps = [7, 14, 30, 90];
  const nextGoal = steps.find((s) => streakDays < s) ?? 90;
  const pct = Math.min(100, Math.round((streakDays / nextGoal) * 100));

  return (
    <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${
              isDark ? 'text-[#34D399]' : 'text-[#059669]'
            }`}
          >
            MOMENTUM HORIZON
          </span>
          <h3 className={`mt-0.5 font-display text-xl font-extrabold tracking-tight ${T.text}`}>
            Next milestone: {nextGoal}d
          </h3>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${readingDom.soft} ${readingDom.text}`}
        >
          <DuoIcon name="flame" className="h-7 w-7" />
        </div>
      </div>

      <svg viewBox="0 0 280 58" className="h-14 w-full overflow-visible" aria-hidden="true">
        <line
          x1="26"
          y1="24"
          x2="254"
          y2="24"
          stroke={isDark ? '#262626' : '#E5E7EB'}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line
          x1="26"
          y1="24"
          x2={26 + Math.min(228, (Math.min(streakDays, 90) / 90) * 228)}
          y2="24"
          stroke="#10B981"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {steps.map((s, idx) => {
          const x = 26 + idx * 76;
          const reached = streakDays >= s;
          const isNext = s === nextGoal;
          return (
            <g key={s}>
              {isNext && <circle cx={x} cy="24" r="13" fill="#10B981" fillOpacity="0.16" />}
              <circle
                cx={x}
                cy="24"
                r="8"
                fill={
                  reached
                    ? '#10B981'
                    : isNext
                      ? isDark
                        ? '#101010'
                        : '#FFFFFF'
                      : isDark
                        ? '#1A1A1A'
                        : '#F1F5F9'
                }
                stroke={reached || isNext ? '#10B981' : isDark ? '#333333' : '#CBD5E1'}
                strokeWidth="2.5"
              />
              <text
                x={x}
                y="49"
                textAnchor="middle"
                fill={
                  reached || isNext
                    ? isDark
                      ? '#F5F5F5'
                      : '#0F172A'
                    : isDark
                      ? '#737373'
                      : '#94A3B8'
                }
                fontSize="11"
                fontWeight="800"
              >
                {s}d
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between text-xs font-extrabold tabular-nums">
        <span className={T.muted}>{streakDays}d active</span>
        <span className={isDark ? 'text-[#34D399]' : 'text-[#059669]'}>
          {pct}% to {nextGoal}d
        </span>
      </div>
    </div>
  );
}
