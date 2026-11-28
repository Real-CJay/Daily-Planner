import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString } from '@/lib/datetime';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { createScheduleBlock, listScheduleBlocks } from '@/modules/calendar/repository';
import {
  buildReadingBlockDraft,
  extractReadingEntries,
  type ReadingLogEntry,
} from '@/modules/reading/readingLog';

interface ReadingPrefs {
  book: string;
  totalPages: number;
  queue: string[];
}

const DEFAULT_PREFS: ReadingPrefs = {
  book: 'Atomic Habits',
  totalPages: 320,
  queue: ['Deep Work', 'Endure', 'The Practice'],
};

export function ReadingPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);
  const dom = getDom('reading', isDark);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);

  const prefKey = user ? `stride_reading_prefs_${user.id}` : 'stride_reading_prefs';
  const [prefs, setPrefs] = useState<ReadingPrefs>(() => {
    try {
      const raw = localStorage.getItem(prefKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ReadingPrefs;
        if (parsed.book) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PREFS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(prefKey, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefKey, prefs]);

  const [entries, setEntries] = useState<ReadingLogEntry[]>([]);
  const [addPages, setAddPages] = useState('15');
  const [newQueueBook, setNewQueueBook] = useState('');
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    const blocks = await listScheduleBlocks(user.id);
    const list = extractReadingEntries(blocks);
    setEntries(list);
    if (list.length > 0 && prefs.book === DEFAULT_PREFS.book) {
      const latest = list[0].meta;
      setPrefs((prev) => ({
        ...prev,
        book: latest.bookTitle || prev.book,
        totalPages: latest.totalPages || prev.totalPages,
      }));
    }
  }, [user, prefs.book]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const currentBookPages = useMemo(() => {
    return entries
      .filter((e) => e.meta.bookTitle.toLowerCase() === prefs.book.toLowerCase())
      .reduce((acc, e) => acc + e.meta.pagesRead, 0);
  }, [entries, prefs.book]);

  const readingStreak = useMemo(() => {
    const dates = new Set(entries.map((e) => e.date));
    let streak = 0;
    let cursor = dates.has(today) ? today : addDaysIso(today, -1);
    while (dates.has(cursor)) {
      streak++;
      cursor = addDaysIso(cursor, -1);
    }
    return streak;
  }, [entries, today]);

  const pct = Math.min(100, Math.round((currentBookPages / Math.max(1, prefs.totalPages)) * 100));

  async function handleLogPages(e: FormEvent) {
    e.preventDefault();
    const add = Number(addPages) || 0;
    if (!user || add <= 0 || saving) return;
    setSaving(true);
    try {
      const draft = buildReadingBlockDraft(today, {
        bookTitle: prefs.book,
        author: null,
        pagesRead: add,
        currentPage: Math.min(prefs.totalPages, currentBookPages + add),
        totalPages: prefs.totalPages,
        durationMin: Math.max(10, Math.round(add * 1.5)),
        notes: null,
      });
      await createScheduleBlock(user.id, { ...draft, status: 'COMPLETED' });
      triggerConfetti();
      pushToast(`+${add} pages logged!`, '#10B981');
      await loadEntries();
    } finally {
      setSaving(false);
    }
  }

  function handleAddQueue(e: FormEvent) {
    e.preventDefault();
    const trimmed = newQueueBook.trim();
    if (!trimmed) return;
    setPrefs((prev) => ({ ...prev, queue: [...prev.queue, trimmed] }));
    setNewQueueBook('');
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
            <DuoIcon name="reading" className="h-6 w-6" />
          </span>
          <span className={`font-display text-xl font-extrabold ${T.text}`}>Reading</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Active Book */}
        <div className={`space-y-6 rounded-3xl border p-7 lg:col-span-7 ${T.card}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${dom.soft} ${dom.border} ${dom.text}`}
              >
                <DuoIcon name="reading" className="h-11 w-11" />
              </div>
              <div>
                <span className={`text-[11px] font-extrabold uppercase ${dom.text}`}>
                  ACTIVE BOOK
                </span>
                <h2 className={`font-display text-2xl font-extrabold ${T.text}`}>{prefs.book}</h2>
                <span className={`text-xs font-extrabold tabular-nums ${T.muted}`}>
                  {currentBookPages} / {prefs.totalPages} pages ({pct}%)
                </span>
              </div>
            </div>
            <span
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-extrabold tabular-nums ${dom.soft} ${dom.border} ${dom.text}`}
            >
              {readingStreak}d streak
            </span>
          </div>

          <div className={`h-3.5 w-full overflow-hidden rounded-full ${T.surface}`}>
            <div
              className="h-full rounded-full bg-[#10B981] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <form onSubmit={(e) => void handleLogPages(e)} className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              max={200}
              value={addPages}
              onChange={(e) => setAddPages(e.target.value)}
              className={`w-24 rounded-xl border px-3.5 py-2.5 font-display text-base font-extrabold tabular-nums focus:outline-none ${T.input}`}
            />
            <button
              type="submit"
              disabled={saving}
              className={`cursor-pointer rounded-xl px-5 py-2.5 font-display text-sm font-bold disabled:opacity-50 ${T.btnSuccess}`}
            >
              {saving ? 'Saving...' : '+ Log pages'}
            </button>
          </form>
        </div>

        {/* Reading Queue */}
        <div className={`space-y-4 rounded-3xl border p-6 lg:col-span-5 ${T.card}`}>
          <h3 className={`font-display text-base font-extrabold ${T.text}`}>Reading Queue</h3>
          <div className="space-y-2">
            {prefs.queue.map((b, i) => (
              <div
                key={`${b}-${i}`}
                className={`flex items-center justify-between rounded-2xl border p-3 ${T.cardSubtle}`}
              >
                <span className={`font-display text-sm font-bold ${T.text}`}>{b}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((prev) => ({
                      ...prev,
                      book: b,
                      queue: prev.queue.filter((_, idx) => idx !== i),
                    }))
                  }
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${T.btnWhite}`}
                >
                  Start
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddQueue} className="flex gap-2">
            <input
              value={newQueueBook}
              onChange={(e) => setNewQueueBook(e.target.value)}
              placeholder="Add book..."
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
      </div>
    </div>
  );
}
