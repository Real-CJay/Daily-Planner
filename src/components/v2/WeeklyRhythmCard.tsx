import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';

export interface DomainRhythmStat {
  id: DomainId;
  done: number;
  total: number;
}

export function WeeklyRhythmCard({
  isDark,
  stats,
  onOpenAnalytics,
}: {
  isDark: boolean;
  stats: DomainRhythmStat[];
  onOpenAnalytics?: () => void;
}) {
  const T = getV2Theme(isDark);
  const circ = 2 * Math.PI * 22;

  return (
    <div className={`space-y-5 rounded-3xl border p-6 ${T.card}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${T.muted}`}>
            WEEKLY RHYTHM
          </span>
          <h3 className={`mt-0.5 font-display text-xl font-extrabold tracking-tight ${T.text}`}>
            Balance across domains
          </h3>
        </div>
        {onOpenAnalytics && (
          <button
            type="button"
            onClick={onOpenAnalytics}
            className={`cursor-pointer text-xs font-extrabold ${
              isDark ? 'text-[#60A5FA] hover:text-white' : 'text-[#2563EB] hover:underline'
            }`}
          >
            Analytics →
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const d = getDom(s.id, isDark);
          const pct = s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
          return (
            <div
              key={s.id}
              className={`flex flex-col items-center gap-2.5 rounded-2xl border p-3.5 ${T.cardSubtle}`}
            >
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 54 54">
                  <circle
                    cx="27"
                    cy="27"
                    r="22"
                    stroke={isDark ? '#262626' : '#E5E7EB'}
                    strokeWidth="5"
                    fill="none"
                  />
                  <circle
                    cx="27"
                    cy="27"
                    r="22"
                    stroke={d.accentHex}
                    strokeWidth="5"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - pct / 100)}
                  />
                </svg>
                <span className={`absolute ${d.text}`}>
                  <DuoIcon name={s.id} className="h-6 w-6" />
                </span>
              </div>
              <div className="text-center">
                <span className={`block font-display text-xs font-extrabold ${T.text}`}>
                  {d.label}
                </span>
                <span className={`block text-[11px] font-extrabold tabular-nums ${d.text}`}>
                  {s.done}/{s.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
