import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon, type DuoIconName } from '@/design-system/DuoIcon';
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
import {
  buildMusicBlockDraft,
  isMusicInstrument,
  type MusicInstrument,
} from '@/modules/music/musicLog';
import type { ScheduleBlock } from '@/types/domain';

const INSTRUMENTS: { id: MusicInstrument; label: string; icon: DuoIconName }[] = [
  { id: 'VOCAL', label: 'Vocal', icon: 'vocal' },
  { id: 'DRUMMING', label: 'Drumming', icon: 'drumming' },
  { id: 'GUITAR', label: 'Guitar', icon: 'guitar' },
  { id: 'KEYBOARD', label: 'Keyboard', icon: 'keyboard' },
];

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MusicPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('music', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const [activeInst, setActiveInst] = useState<MusicInstrument>('VOCAL');
  const [musicSec, setMusicSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [quickMin, setQuickMin] = useState('30');
  const [saving, setSaving] = useState(false);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setMusicSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    const all = await listScheduleBlocks(user.id);
    setBlocks(
      all
        .filter((b) => isMusicInstrument(b.category) && !b.is_recurring)
        .sort((a, b) => b.block_date.localeCompare(a.block_date))
    );
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const breakdown = useMemo(
    () =>
      INSTRUMENTS.map((inst) => ({
        ...inst,
        mins: blocks
          .filter((b) => b.category === inst.id)
          .reduce((acc, b) => acc + (b.duration_min ?? 0), 0),
      })),
    [blocks]
  );

  async function logSession(durationMin: number) {
    if (!user || saving) return;
    setSaving(true);
    try {
      const mins = Math.max(5, Math.min(240, Math.round(durationMin)));
      const draft = buildMusicBlockDraft({
        instrument: activeInst,
        date: today,
        durationMin: mins,
        tags: [],
        notes: null,
      });
      await createScheduleBlock(user.id, { ...draft, status: 'COMPLETED' });
      setRunning(false);
      setMusicSec(0);
      triggerConfetti();
      const label = INSTRUMENTS.find((i) => i.id === activeInst)?.label ?? activeInst;
      pushToast(`Logged ${mins}m ${label}`, '#DB2777');
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

  const activeLabel = INSTRUMENTS.find((i) => i.id === activeInst)?.label ?? 'Vocal';

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
            <DuoIcon name="music" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Music</span>
        </div>
      </div>

      {/* 4 Instrument Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {INSTRUMENTS.map((inst) => {
          const active = activeInst === inst.id;
          return (
            <button
              key={inst.id}
              type="button"
              onClick={() => setActiveInst(inst.id)}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border p-4 transition-all active:scale-[0.98] ${
                active ? `${dom.soft} ${dom.border} ${dom.text}` : `${T.card} ${T.muted}`
              }`}
            >
              <DuoIcon name={inst.icon} className="h-11 w-11" />
              <span className={`font-display text-sm font-extrabold ${T.text}`}>{inst.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Stopwatch + Quick Log */}
        <div className="space-y-5 lg:col-span-7">
          <div
            className={`flex flex-col items-center justify-between gap-6 rounded-3xl border p-7 sm:flex-row ${T.card}`}
          >
            <div className="text-center sm:text-left">
              <span className={`rounded-xl px-3 py-1 text-xs font-extrabold uppercase ${dom.soft} ${dom.text}`}>
                {activeLabel} stopwatch
              </span>
              <div className={`mt-3 font-display text-5xl font-extrabold tabular-nums sm:text-6xl ${T.text}`}>
                {fmtClock(musicSec)}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className={`cursor-pointer rounded-xl px-6 py-3 font-display text-sm font-bold text-white transition-all active:scale-[0.98] ${dom.bg} ${dom.hover}`}
              >
                {running ? 'Pause' : 'Start'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void logSession(Math.max(15, Math.round(musicSec / 60)))}
                className={`cursor-pointer rounded-xl px-5 py-3 font-display text-sm font-bold disabled:opacity-50 ${T.btnSuccess}`}
              >
                Log session
              </button>
            </div>
          </div>

          {/* Quick Manual Log Bar */}
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-5 ${T.card}`}>
            <span className={`font-display text-sm font-extrabold ${T.text}`}>
              Quick log {activeLabel}
            </span>
            <div className="flex items-center gap-2">
              {[15, 30, 45].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={saving}
                  onClick={() => void logSession(m)}
                  className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-extrabold tabular-nums ${T.btnNeutral}`}
                >
                  +{m}m
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={180}
                value={quickMin}
                onChange={(e) => setQuickMin(e.target.value)}
                className={`w-16 rounded-xl border px-2 py-2 text-center text-xs font-extrabold tabular-nums ${T.input}`}
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void logSession(Number(quickMin) || 30)}
                className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold ${T.btnInk}`}
              >
                Add
              </button>
            </div>
          </div>

          {/* Recent Practice */}
          <div className={`space-y-3 rounded-3xl border p-6 ${T.card}`}>
            <h3 className={`font-display text-base font-extrabold ${T.text}`}>Recent Practice</h3>
            {blocks.length === 0 ? (
              <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                No music sessions logged yet
              </div>
            ) : (
              blocks.slice(0, 8).map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 ${T.cardSubtle}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-xl px-2.5 py-1 text-xs font-extrabold ${dom.soft} ${dom.text}`}>
                      {b.category}
                    </span>
                    <span className={`font-display text-sm font-extrabold tabular-nums ${T.text}`}>
                      {b.duration_min ?? 30}m
                    </span>
                    <span className={`text-xs font-bold ${T.muted}`}>{b.block_date}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove session"
                    onClick={() => void handleDelete(b.id)}
                    className={`h-7 w-7 cursor-pointer rounded-lg text-xs font-extrabold ${T.btnWhite} ${T.muted}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Practice Breakdown */}
        <div className={`space-y-3 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}>
          <h3 className={`font-display text-base font-extrabold ${T.text}`}>Practice Breakdown</h3>
          {breakdown.map((b) => (
            <div
              key={b.id}
              className={`flex items-center justify-between rounded-2xl border p-3.5 ${T.cardSubtle}`}
            >
              <div className="flex items-center gap-2.5">
                <span className={dom.text}>
                  <DuoIcon name={b.icon} className="h-5 w-5" />
                </span>
                <span className={`font-display text-sm font-bold ${T.text}`}>{b.label}</span>
              </div>
              <span className={`font-display text-sm font-extrabold tabular-nums ${dom.text}`}>
                {b.mins}m
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
