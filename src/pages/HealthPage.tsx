import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, HeartPulse, Plus, Trash2 } from 'lucide-react';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  calculateHealthSummary,
  HEALTH_PRESET_TEMPLATES,
  loadHealthStore,
  saveHealthStore,
  type HealthRuleCategory,
  type HealthStore,
} from '@/modules/health/healthEngine';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CATEGORY_LABELS: Record<HealthRuleCategory, string> = {
  SUGAR: 'Sugar control',
  DIET: 'Clean diet',
  HYDRATION: 'Hydration',
  HABIT: 'Health habit',
};

export function HealthPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [store, setStore] = useState<HealthStore>({ rules: [], checkedByDate: {} });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<HealthRuleCategory>('SUGAR');
  const [targetNote, setTargetNote] = useState('');

  useEffect(() => {
    if (!user) return;
    setStore(loadHealthStore(user.id));
  }, [user]);

  function updateStore(next: HealthStore) {
    if (!user) return;
    setStore(next);
    saveHealthStore(user.id, next);
  }

  const summary = useMemo(() => calculateHealthSummary(store, today), [store, today]);
  const todaySet = useMemo(() => new Set(store.checkedByDate[today] ?? []), [store, today]);

  function toggleRuleToday(ruleId: string) {
    const current = new Set(store.checkedByDate[today] ?? []);
    if (current.has(ruleId)) current.delete(ruleId);
    else current.add(ruleId);
    updateStore({
      ...store,
      checkedByDate: { ...store.checkedByDate, [today]: Array.from(current) },
    });
  }

  function handleAddRule(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const nextRule = {
      id: `h-${Date.now()}`,
      title: title.trim(),
      category,
      targetNote: targetNote.trim() || null,
      createdAt: today,
    };
    updateStore({ ...store, rules: [...store.rules, nextRule] });
    setTitle('');
    setTargetNote('');
  }

  function handleQuickAddTemplate(tpl: (typeof HEALTH_PRESET_TEMPLATES)[number]) {
    if (store.rules.some((r) => r.title.toLowerCase() === tpl.title.toLowerCase())) return;
    updateStore({
      ...store,
      rules: [
        ...store.rules,
        {
          id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: tpl.title,
          category: tpl.category,
          targetNote: tpl.targetNote,
          createdAt: today,
        },
      ],
    });
  }

  function handleDeleteRule(ruleId: string) {
    updateStore({
      ...store,
      rules: store.rules.filter((r) => r.id !== ruleId),
    });
  }

  return (
    <div className="space-y-7 pb-6">
      <header>
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Fuel with <em className="not-italic text-[var(--health)]">discipline.</em>
        </h1>
      </header>

      {/* Main 2-Column Layout */}
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: Today's Health Rules Checklist */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Today&apos;s health rules
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                {summary.doneToday} of {summary.totalRules} completed today
              </p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--health-lite)] text-[var(--health)]">
              <HeartPulse className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {store.rules.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--muted)]">
                Add your first health rule below (e.g. sugar control, low-fat meals, hydration).
              </div>
            ) : (
              store.rules.map((rule) => {
                const done = todaySet.has(rule.id);
                return (
                  <div key={rule.id} className="flex items-center gap-3.5 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleRuleToday(rule.id)}
                      aria-label={`Toggle ${rule.title}`}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border-2 transition-colors ${
                        done
                          ? 'border-[var(--health)] bg-[var(--health)] text-[var(--health-btn-text)]'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--health)]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[2.8]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleRuleToday(rule.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <strong
                        className={`block truncate text-[13.5px] font-bold ${
                          done ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]'
                        }`}
                      >
                        {rule.title}
                      </strong>
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                        {CATEGORY_LABELS[rule.category]}
                        {rule.targetNote ? ` · ${rule.targetNote}` : ''}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      aria-label={`Remove ${rule.title}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Custom Rule Form */}
          <form
            onSubmit={handleAddRule}
            className="mt-5 space-y-3 border-t border-[var(--line)] pt-5"
          >
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--faint)]">
              ADD A HEALTH RULE
            </div>
            <div className="grid gap-2.5 sm:grid-cols-[1.4fr_0.9fr]">
              <input
                type="text"
                required
                placeholder="e.g. No added sugar, Low-fat dinner..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--health)] focus:outline-none"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as HealthRuleCategory)}
                className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] focus:border-[var(--health)] focus:outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional note (e.g. under 20g sugar, grilled only)..."
                value={targetNote}
                onChange={(e) => setTargetNote(e.target.value)}
                className="min-w-0 flex-1 rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--health)] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] bg-[var(--health)] px-4 text-[12.5px] font-bold text-[var(--health-btn-text)] transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4 stroke-[2.4]" />
                <span>Add</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: Clean-Day Streak + Quick Templates */}
        <aside className="space-y-5">
          <section
            className="rounded-[15px] border border-[var(--line)] p-6"
            style={{ background: 'color-mix(in srgb, var(--health) 4%, var(--surface))' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
              CLEAN DISCIPLINE STREAK
            </span>
            <div className="mt-3 flex items-baseline gap-2.5">
              <strong className="font-mono text-[48px] font-bold leading-none tracking-[-0.07em] text-[var(--ink)] tabular-nums">
                {summary.currentStreak}
              </strong>
              <span className="text-[13px] font-semibold text-[var(--muted)]">
                full clean day{summary.currentStreak === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-1.5 border-t border-[var(--line)] pt-4">
              {summary.weekStatus.map((d, i) => (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <span
                    className={`text-[10px] font-semibold ${
                      d.date === today ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {DAY_LETTERS[i]}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full border ${
                      d.completed
                        ? 'border-[var(--health)] bg-[var(--health)]'
                        : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                    }`}
                  />
                  <span className="font-mono text-[9.5px] text-[var(--faint)]">
                    {Number(d.date.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
            <h2 className="text-[17px] font-bold tracking-[-0.035em] text-[var(--ink)]">
              Quick-add protocols
            </h2>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Tap to add common nutrition &amp; Monk Mode health rules.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {HEALTH_PRESET_TEMPLATES.map((tpl) => {
                const exists = store.rules.some(
                  (r) => r.title.toLowerCase() === tpl.title.toLowerCase()
                );
                return (
                  <button
                    key={tpl.title}
                    type="button"
                    disabled={exists}
                    onClick={() => handleQuickAddTemplate(tpl)}
                    className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--health)] disabled:opacity-40"
                  >
                    + {tpl.title}
                  </button>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
