import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString } from '@/lib/datetime';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
} from '@/modules/calendar/repository';
import { buildKarateBlockDraft, parseKarateMeta } from '@/modules/karate/karateLog';
import type { ScheduleBlock } from '@/types/domain';

type SimpleKarateType = 'KATA' | 'KUMITE';

interface FocusCue {
  id: string;
  label: string;
  done: boolean;
}

const DEFAULT_FOCUS_CUES: FocusCue[] = [
  { id: 'kf-1', label: 'Heian Godan Kata', done: false },
  { id: 'kf-2', label: 'Bassai Dai Kata', done: false },
  { id: 'kf-3', label: 'Gyaku-Zuki Snap', done: false },
  { id: 'kf-4', label: 'Kumite Footwork', done: false },
];

export function KaratePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('karate', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [kType, setKType] = useState<SimpleKarateType>('KATA');
  const [kDur, setKDur] = useState('60');
  const [kEffort, setKEffort] = useState(4);
  const [kDate, setKDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const cueKey = user ? `stride_karate_cues_${user.id}` : 'stride_karate_cues';
  const [cues, setCues] = useState<FocusCue[]>(() => {
    try {
      const raw = localStorage.getItem(cueKey);
      if (raw) {
        const parsed = JSON.parse(raw) as FocusCue[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_FOCUS_CUES;
  });
  const [newCue, setNewCue] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(cueKey, JSON.stringify(cues));
    } catch {
      // ignore
    }
  }, [cueKey, cues]);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    const all = await listScheduleBlocks(user.id);
    setBlocks(
      all
        .filter((b) => b.category === 'KARATE' && !b.is_recurring)
        .sort((a, b) => b.block_date.localeCompare(a.block_date))
    );
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const totalMin = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.duration_min ?? 60), 0),
    [blocks]
  );

  async function handleLogKarate(e: FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    try {
      const durNum = Math.max(10, Math.min(240, Number(kDur) || 60));
      const label = kType === 'KATA' ? 'Kata' : 'Kumite';
      const draft = buildKarateBlockDraft({
        title: `Karate · ${label}`,
        date: kDate,
        startTime: '17:30',
        durationMin: durNum,
        physicalLoad: kEffort >= 4 ? 'HIGH' : 'MODERATE',
        meta: {
          focus: kType,
          katas: [],
          rpe: kEffort * 2,
          feel: null,
          painPresent: false,
          painDetails: null,
          notes: null,
        },
      });
      await createScheduleBlock(user.id, { ...draft, status: 'COMPLETED' });
      triggerConfetti();
      pushToast(`Logged ${label} · ${durNum}m`, '#EA580C');
      await loadSessions();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    await deleteScheduleBlock(user.id, id);
    pushToast('Session removed', '#DB2777');
    await loadSessions();
  }

  function handleAddCue(e: FormEvent) {
    e.preventDefault();
    const trimmed = newCue.trim();
    if (!trimmed) return;
    setCues((prev) => [...prev, { id: `kf-${Date.now()}`, label: trimmed, done: false }]);
    setNewCue('');
  }

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
            <DuoIcon name="karate" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Karate</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Log Karate Form — Strictly Kata & Kumite Only */}
        <form
          onSubmit={(e) => void handleLogKarate(e)}
          className={`space-y-4 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}
        >
          <h2 className={`font-display text-xl font-extrabold ${T.text}`}>Log Karate</h2>

          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                { value: 'KATA' as SimpleKarateType, label: 'Kata' },
                { value: 'KUMITE' as SimpleKarateType, label: 'Kumite' },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKType(opt.value)}
                className={`cursor-pointer rounded-xl border py-3 text-sm font-extrabold transition-all active:scale-[0.98] ${
                  kType === opt.value
                    ? `${dom.soft} ${dom.border} ${dom.text}`
                    : `${T.cardSubtle} ${T.muted}`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>
                Duration (min)
              </label>
              <input
                type="number"
                min={10}
                max={240}
                value={kDur}
                onChange={(e) => setKDur(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 font-display text-lg font-extrabold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
            <div>
              <label className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Date</label>
              <input
                type="date"
                value={kDate}
                onChange={(e) => setKDate(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-3 text-xs font-bold tabular-nums focus:outline-none ${T.input}`}
              />
            </div>
          </div>

          <div>
            <span className={`text-[11px] font-extrabold uppercase ${T.muted}`}>Effort (1–5)</span>
            <div className="mt-1.5 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setKEffort(n)}
                  className={`cursor-pointer rounded-xl border py-2.5 font-display text-sm font-extrabold transition-all active:scale-[0.98] ${
                    kEffort === n
                      ? `${dom.bg} border-transparent text-white`
                      : `${T.cardSubtle} ${T.muted}`
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`w-full cursor-pointer rounded-xl py-3 font-display text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 ${dom.bg} ${dom.hover}`}
          >
            {saving ? 'Saving...' : '+ Log Session'}
          </button>
        </form>

        {/* Right Column: Kata & Kumite Focus + Session Log */}
        <div className="space-y-5 lg:col-span-7">
          <div className={`space-y-3 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-display text-base font-extrabold ${T.text}`}>
                Kata & Kumite Focus
              </h3>
              <span className={`text-xs font-extrabold tabular-nums ${dom.text}`}>
                {totalMin}m total
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {cues.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition-all ${
                    item.done ? `${dom.soft} ${dom.border}` : T.cardSubtle
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCues((prev) =>
                        prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c))
                      )
                    }
                    className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                  >
                    <span className={`font-display text-xs font-bold sm:text-sm ${T.text}`}>
                      {item.label}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${
                        item.done ? `${dom.bg} text-white` : `${T.card} text-transparent`
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCue} className="flex gap-2 pt-1">
              <input
                value={newCue}
                onChange={(e) => setNewCue(e.target.value)}
                placeholder="Add kata or kumite cue..."
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none ${T.input}`}
              />
              <button
                type="submit"
                className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold ${T.btnInk}`}
              >
                Add
              </button>
            </form>
          </div>

          <div className={`space-y-3 rounded-3xl border p-6 ${T.card}`}>
            <h3 className={`font-display text-base font-extrabold ${T.text}`}>Session Log</h3>
            {blocks.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                No Karate sessions logged yet
              </div>
            ) : (
              blocks.slice(0, 12).map((blk) => {
                const meta = parseKarateMeta(blk.notes);
                const focusLabel = meta.focus === 'KUMITE' ? 'Kumite' : 'Kata';
                const effortLevel = Math.max(1, Math.min(5, Math.round((meta.rpe ?? 6) / 2)));
                return (
                  <div
                    key={blk.id}
                    className={`flex items-center justify-between gap-2 rounded-2xl border p-3.5 ${T.cardSubtle}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-xl px-2.5 py-1 text-xs font-extrabold ${dom.soft} ${dom.text}`}>
                        {focusLabel}
                      </span>
                      <span className={`font-display text-sm font-extrabold tabular-nums ${T.text}`}>
                        {blk.duration_min ?? 60}m
                      </span>
                      <span className={`text-xs font-bold ${T.muted}`}>{blk.block_date}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span
                            key={i}
                            className={`h-3 w-3 rounded-sm ${
                              i <= effortLevel
                                ? 'bg-[#EA580C]'
                                : isDark
                                  ? 'bg-[#262626]'
                                  : 'bg-[#E5E7EB]'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="Delete session"
                        onClick={() => void handleDelete(blk.id)}
                        className={`h-7 w-7 cursor-pointer rounded-lg text-xs font-extrabold ${T.btnWhite} ${T.muted}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
