import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon, type DuoIconName } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString } from '@/lib/datetime';
import { loadHealthStore, saveHealthStore, type HealthStore } from '@/modules/health/healthEngine';

type MealStatus = 'pending' | 'clean' | 'protein' | 'treat';
type SnackCategory = 'dairy' | 'buns' | 'sweet';

interface MealSlot {
  id: string;
  slot: string;
  status: MealStatus;
}

interface SnackItem {
  id: string;
  name: string;
  category: SnackCategory;
}

interface DailyHealthV2State {
  meals: MealSlot[];
  snacks: SnackItem[];
  soreZones: string[];
  socialMin: number;
  socialCapMin: number;
}

const DEFAULT_DAILY_V2: DailyHealthV2State = {
  meals: [
    { id: 'ml-1', slot: 'Breakfast', status: 'pending' },
    { id: 'ml-2', slot: 'Lunch', status: 'pending' },
    { id: 'ml-3', slot: 'Dinner', status: 'pending' },
    { id: 'ml-4', slot: 'Pre-Run', status: 'pending' },
  ],
  snacks: [],
  soreZones: [],
  socialMin: 0,
  socialCapMin: 30,
};

const MEAL_CYCLE: MealStatus[] = ['pending', 'clean', 'protein', 'treat'];
const MEAL_LABELS: Record<MealStatus, string> = {
  pending: 'Tap to log',
  clean: 'Clean',
  protein: 'High-Protein',
  treat: 'Treat',
};

const SNACK_CATS: { id: SnackCategory; label: string; domId: DomainId }[] = [
  { id: 'dairy', label: 'Dairy & Drinks', domId: 'running' },
  { id: 'buns', label: 'Buns & Hoppers', domId: 'karate' },
  { id: 'sweet', label: 'Sweet / Light', domId: 'music' },
];

const BODY_ZONES = [
  { id: 'shoulders', label: 'Shoulders', cx: 60, cy: 52, r: 12 },
  { id: 'lowerback', label: 'Lower Back', cx: 60, cy: 84, r: 12 },
  { id: 'hips', label: 'Hips', cx: 60, cy: 112, r: 13 },
  { id: 'knees', label: 'Knees', cx: 60, cy: 152, r: 13 },
  { id: 'calves', label: 'Calves', cx: 60, cy: 186, r: 12 },
];

const RULE_ICONS: DuoIconName[] = ['sugar', 'meal', 'leaf'];

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function HealthPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('health', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const [store, setStore] = useState<HealthStore>(() => loadHealthStore(user?.id ?? 'guest'));
  useEffect(() => {
    if (user) setStore(loadHealthStore(user.id));
  }, [user]);

  const v2Key = user ? `stride_health_v2_${user.id}_${today}` : `stride_health_v2_${today}`;
  const [daily, setDaily] = useState<DailyHealthV2State>(() => {
    try {
      const raw = localStorage.getItem(v2Key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DailyHealthV2State>;
        return { ...DEFAULT_DAILY_V2, ...parsed };
      }
    } catch {
      // ignore
    }
    return DEFAULT_DAILY_V2;
  });

  useEffect(() => {
    try {
      localStorage.setItem(v2Key, JSON.stringify(daily));
    } catch {
      // ignore
    }
  }, [v2Key, daily]);

  const [snackName, setSnackName] = useState('');
  const [snackCat, setSnackCat] = useState<SnackCategory>('dairy');
  const [mobSec, setMobSec] = useState(5 * 60);
  const [mobRunning, setMobRunning] = useState(false);

  useEffect(() => {
    if (!mobRunning) return;
    const id = window.setInterval(() => {
      setMobSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mobRunning]);

  useEffect(() => {
    if (mobRunning && mobSec === 0) {
      setMobRunning(false);
      triggerConfetti();
      pushToast('5-min mobility reset complete!', '#0D9488');
    }
  }, [mobRunning, mobSec, triggerConfetti, pushToast]);

  const topRules = store.rules.slice(0, 3);
  const checkedToday = store.checkedByDate[today] ?? [];

  function toggleRule(ruleId: string, e: MouseEvent) {
    const already = checkedToday.includes(ruleId);
    if (!already) triggerConfetti(e.clientX, e.clientY);
    setStore((prev) => {
      const cur = prev.checkedByDate[today] ?? [];
      const nextList = already ? cur.filter((x) => x !== ruleId) : [...cur, ruleId];
      const nextStore = {
        ...prev,
        checkedByDate: { ...prev.checkedByDate, [today]: nextList },
      };
      if (user) saveHealthStore(user.id, nextStore);
      return nextStore;
    });
  }

  function handleAddSnack(e: FormEvent) {
    e.preventDefault();
    const trimmed = snackName.trim();
    if (!trimmed) return;
    setDaily((prev) => ({
      ...prev,
      snacks: [{ id: `sn-${Date.now()}`, name: trimmed, category: snackCat }, ...prev.snacks],
    }));
    setSnackName('');
    pushToast('Snack logged', '#EA580C');
  }

  function toggleSoreZone(zid: string) {
    setDaily((prev) => ({
      ...prev,
      soreZones: prev.soreZones.includes(zid)
        ? prev.soreZones.filter((x) => x !== zid)
        : [...prev.soreZones, zid],
    }));
  }

  const proteinHits =
    daily.meals.filter((m) => m.status === 'protein').length * 2 +
    daily.meals.filter((m) => m.status === 'clean').length;
  const proteinPct = Math.min(100, Math.round((proteinHits / 6) * 100));
  const carbHits = daily.meals.filter((m) => m.status !== 'pending').length;
  const carbPct = Math.min(100, Math.round((carbHits / 4) * 100));
  const socialPct = Math.min(100, Math.round((daily.socialMin / Math.max(1, daily.socialCapMin)) * 100));

  return (
    <div className="animate-pop space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/modes')}
          className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnWhite}`}
        >
          ← All Modes
        </button>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dom.soft} ${dom.border} ${dom.text}`}
          >
            <DuoIcon name="health" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Health</span>
        </div>
      </div>

      {/* 3 Daily Health Rules */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {topRules.map((r, idx) => {
          const checked = checkedToday.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={(e) => toggleRule(r.id, e)}
              className={`flex cursor-pointer items-center justify-between rounded-3xl border p-6 text-left transition-all active:scale-[0.99] ${
                checked ? `${dom.soft} ${dom.border}` : T.card
              }`}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                    checked ? `${dom.bg} text-white` : `${dom.soft} ${dom.text}`
                  }`}
                >
                  <DuoIcon name={RULE_ICONS[idx % RULE_ICONS.length]} className="h-8 w-8" />
                </span>
                <span className={`font-display text-base font-extrabold leading-snug ${T.text}`}>
                  {r.title}
                </span>
              </div>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-extrabold ${
                  checked ? `${dom.bg} text-white` : `${T.cardSubtle} border text-transparent`
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>

      {/* Meal & Fuel Tracker + Snack Counter */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Meal & Fuel */}
        <div className={`space-y-5 rounded-3xl border p-6 lg:col-span-7 ${T.card}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className={`text-[10px] font-extrabold uppercase tracking-widest ${dom.text}`}>
                MEAL & FUEL
              </span>
              <h2 className={`font-display text-lg font-extrabold ${T.text}`}>
                Tap slots to tag fuel
              </h2>
            </div>
            <span className={`rounded-xl px-3 py-1 text-xs font-extrabold tabular-nums ${dom.soft} ${dom.text}`}>
              {carbHits}/4 logged
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {daily.meals.map((m) => {
              const toneDom =
                m.status === 'protein'
                  ? getDom('strength', isDark)
                  : m.status === 'clean'
                    ? getDom('reading', isDark)
                    : m.status === 'treat'
                      ? getDom('karate', isDark)
                      : null;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const next = MEAL_CYCLE[(MEAL_CYCLE.indexOf(m.status) + 1) % MEAL_CYCLE.length];
                    setDaily((prev) => ({
                      ...prev,
                      meals: prev.meals.map((x) => (x.id === m.id ? { ...x, status: next } : x)),
                    }));
                  }}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3.5 text-center transition-all active:scale-[0.98] ${
                    toneDom ? `${toneDom.soft} ${toneDom.border}` : `${T.cardSubtle} ${T.surfaceHover}`
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      toneDom ? `${toneDom.bg} text-white` : `${T.card} ${T.muted}`
                    }`}
                  >
                    <DuoIcon name="meal" className="h-6 w-6" />
                  </span>
                  <div>
                    <span className={`block font-display text-xs font-extrabold ${T.text}`}>
                      {m.slot}
                    </span>
                    <span
                      className={`mt-0.5 block text-[10px] font-extrabold ${
                        toneDom ? toneDom.text : T.muted
                      }`}
                    >
                      {MEAL_LABELS[m.status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
            <div className={`space-y-2 rounded-2xl border p-3.5 ${T.cardSubtle}`}>
              <div className="flex justify-between text-xs font-extrabold tabular-nums">
                <span className={T.text}>Protein Target</span>
                <span className={getDom('strength', isDark).text}>{proteinPct}%</span>
              </div>
              <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? 'bg-[#0A0A0A]' : 'bg-white'}`}>
                <div
                  className="h-full rounded-full bg-[#7C3AED] transition-all"
                  style={{ width: `${proteinPct}%` }}
                />
              </div>
            </div>
            <div className={`space-y-2 rounded-2xl border p-3.5 ${T.cardSubtle}`}>
              <div className="flex justify-between text-xs font-extrabold tabular-nums">
                <span className={T.text}>Training Carbs</span>
                <span className={dom.text}>{carbPct}%</span>
              </div>
              <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? 'bg-[#0A0A0A]' : 'bg-white'}`}>
                <div
                  className="h-full rounded-full bg-[#0D9488] transition-all"
                  style={{ width: `${carbPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Compact Social Media Cap Strip */}
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 ${T.cardSubtle}`}>
            <div className="min-w-[160px] flex-1 space-y-1.5">
              <div className="flex justify-between text-xs font-extrabold tabular-nums">
                <span className={T.text}>Social Media Cap</span>
                <span className={daily.socialMin > daily.socialCapMin ? 'text-[#E11D48]' : dom.text}>
                  {daily.socialMin} / {daily.socialCapMin}m
                </span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-[#0A0A0A]' : 'bg-white'}`}>
                <div
                  className={`h-full rounded-full transition-all ${
                    daily.socialMin > daily.socialCapMin ? 'bg-[#E11D48]' : 'bg-[#2563EB]'
                  }`}
                  style={{ width: `${socialPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setDaily((p) => ({ ...p, socialMin: Math.max(0, p.socialMin - 5) }))
                }
                className={`h-8 w-8 cursor-pointer rounded-xl font-extrabold ${T.btnWhite}`}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setDaily((p) => ({ ...p, socialMin: p.socialMin + 5 }))}
                className={`h-8 cursor-pointer rounded-xl px-2.5 text-xs font-extrabold ${T.btnWhite}`}
              >
                +5m
              </button>
            </div>
          </div>
        </div>

        {/* Snack Counter */}
        <div className={`space-y-4 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-[10px] font-extrabold uppercase tracking-widest ${getDom('karate', isDark).text}`}>
                SNACK COUNTER
              </span>
              <h2 className={`font-display text-lg font-extrabold ${T.text}`}>Log snacks</h2>
            </div>
            <span
              className={`rounded-xl px-3 py-1 text-xs font-extrabold tabular-nums ${getDom('karate', isDark).soft} ${getDom('karate', isDark).text}`}
            >
              {daily.snacks.length} today
            </span>
          </div>

          <form onSubmit={handleAddSnack} className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {SNACK_CATS.map((sc) => {
                const sd = getDom(sc.domId, isDark);
                const sel = snackCat === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setSnackCat(sc.id)}
                    className={`cursor-pointer rounded-xl border px-2 py-2 text-center text-[11px] font-extrabold transition-all active:scale-[0.98] ${
                      sel ? `${sd.soft} ${sd.border} ${sd.text}` : `${T.cardSubtle} ${T.muted}`
                    }`}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={snackName}
                onChange={(e) => setSnackName(e.target.value)}
                placeholder="e.g., Yoghurt drink, Egg hopper..."
                className={`flex-1 rounded-xl border px-3.5 py-2.5 text-xs font-bold focus:outline-none ${T.input}`}
              />
              <button
                type="submit"
                className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-xs font-bold ${T.btnPrimary}`}
              >
                + Add
              </button>
            </div>
          </form>

          <div className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
            {daily.snacks.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-4 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                No snacks logged today
              </div>
            ) : (
              daily.snacks.map((sn) => {
                const sc = SNACK_CATS.find((c) => c.id === sn.category) ?? SNACK_CATS[0];
                const sd = getDom(sc.domId, isDark);
                return (
                  <div
                    key={sn.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${T.cardSubtle}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${sd.soft} ${sd.text}`}>
                        {sc.label}
                      </span>
                      <span className={`truncate font-display text-xs font-bold ${T.text}`}>
                        {sn.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove snack"
                      onClick={() =>
                        setDaily((prev) => ({
                          ...prev,
                          snacks: prev.snacks.filter((x) => x.id !== sn.id),
                        }))
                      }
                      className={`h-6 w-6 cursor-pointer rounded-lg text-xs font-extrabold ${T.btnWhite} ${T.muted}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Body Soreness Map & 5-Min Mobility Reset */}
      <div className={`rounded-3xl border p-6 ${T.card}`}>
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          <div className="flex flex-col items-center lg:col-span-4">
            <svg viewBox="0 0 120 220" className="h-56 w-36 overflow-visible" aria-label="Body soreness map">
              <circle
                cx="60"
                cy="22"
                r="14"
                fill={isDark ? '#1A1A1A' : '#EEF2F6'}
                stroke={isDark ? '#333333' : '#CBD5E1'}
                strokeWidth="2"
              />
              <rect
                x="38"
                y="42"
                width="44"
                height="62"
                rx="16"
                fill={isDark ? '#1A1A1A' : '#EEF2F6'}
                stroke={isDark ? '#333333' : '#CBD5E1'}
                strokeWidth="2"
              />
              <rect
                x="40"
                y="106"
                width="17"
                height="96"
                rx="8"
                fill={isDark ? '#1A1A1A' : '#EEF2F6'}
                stroke={isDark ? '#333333' : '#CBD5E1'}
                strokeWidth="2"
              />
              <rect
                x="63"
                y="106"
                width="17"
                height="96"
                rx="8"
                fill={isDark ? '#1A1A1A' : '#EEF2F6'}
                stroke={isDark ? '#333333' : '#CBD5E1'}
                strokeWidth="2"
              />

              {BODY_ZONES.map((z) => {
                const sore = daily.soreZones.includes(z.id);
                return (
                  <g key={z.id} onClick={() => toggleSoreZone(z.id)} className="cursor-pointer">
                    {sore && <circle cx={z.cx} cy={z.cy} r={z.r + 5} fill="#EA580C" fillOpacity="0.22" />}
                    <circle
                      cx={z.cx}
                      cy={z.cy}
                      r={z.r - 3}
                      fill={sore ? '#EA580C' : isDark ? '#262626' : '#FFFFFF'}
                      stroke={sore ? '#FB923C' : isDark ? '#404040' : '#94A3B8'}
                      strokeWidth="2.2"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="space-y-5 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${getDom('recovery', isDark).text}`}>
                  RECOVERY RADAR
                </span>
                <h2 className={`font-display text-xl font-extrabold ${T.text}`}>
                  Body Soreness & Mobility Reset
                </h2>
              </div>
              <span
                className={`rounded-xl px-3 py-1 text-xs font-extrabold tabular-nums ${
                  daily.soreZones.length > 0
                    ? `${getDom('karate', isDark).soft} ${getDom('karate', isDark).text}`
                    : `${dom.soft} ${dom.text}`
                }`}
              >
                {daily.soreZones.length > 0 ? `${daily.soreZones.length} tight zones` : 'All clear'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {BODY_ZONES.map((z) => {
                const sore = daily.soreZones.includes(z.id);
                const kd = getDom('karate', isDark);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => toggleSoreZone(z.id)}
                    className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-all active:scale-[0.98] ${
                      sore ? `${kd.soft} ${kd.border} ${kd.text}` : `${T.cardSubtle} ${T.muted}`
                    }`}
                  >
                    {sore ? '● ' : ''}
                    {z.label}
                  </button>
                );
              })}
            </div>

            <div className={`flex flex-col items-center justify-between gap-4 rounded-2xl border p-4 sm:flex-row ${T.cardSubtle}`}>
              <div className="flex items-center gap-3.5">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${getDom('recovery', isDark).soft} ${getDom('recovery', isDark).border} ${getDom('recovery', isDark).text}`}
                >
                  <DuoIcon name="recovery" className="h-7 w-7" />
                </span>
                <div>
                  <span className={`block text-[10px] font-extrabold uppercase tracking-wider ${T.muted}`}>
                    5-MIN MOBILITY RESET
                  </span>
                  <span className={`font-display text-2xl font-extrabold tabular-nums ${T.text}`}>
                    {fmtClock(mobSec)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobRunning(false);
                    setMobSec(5 * 60);
                  }}
                  className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-extrabold ${T.btnWhite}`}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setMobRunning((r) => !r)}
                  className={`cursor-pointer rounded-xl px-5 py-2 font-display text-xs font-bold ${T.btnSuccess}`}
                >
                  {mobRunning ? 'Pause' : 'Start 5m'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
