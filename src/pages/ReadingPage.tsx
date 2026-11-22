import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Check, Clock, Trash2 } from 'lucide-react';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
} from '@/modules/calendar/repository';
import {
  buildReadingBlockDraft,
  calculateReadingStats,
  extractReadingEntries,
  type ReadingLogEntry,
} from '@/modules/reading/readingLog';
import type { ScheduleBlock } from '@/types/domain';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const PRESETS = [15, 30, 45, 60];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ReadingPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reading logger state
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pagesRead, setPagesRead] = useState('15');
  const [currentPage, setCurrentPage] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Live reading stopwatch
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const loadReading = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const all = await listScheduleBlocks(user.id);
      setBlocks(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reading logs.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadReading();
  }, [loadReading]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSec((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const entries = useMemo(() => extractReadingEntries(blocks), [blocks]);
  const stats = useMemo(() => calculateReadingStats(entries, today), [entries, today]);

  function handleToggleTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      if (elapsedSec >= 30) {
        setMinutes(Math.max(1, Math.round(elapsedSec / 60)));
      }
    } else {
      setTimerRunning(true);
    }
  }

  function handleSelectBook(book: (typeof stats.books)[number]) {
    setBookTitle(book.bookTitle);
    setAuthor(book.author ?? '');
    setTotalPages(book.totalPages ? String(book.totalPages) : '');
    setCurrentPage(book.latestPage ? String(book.latestPage) : '');
  }

  async function handleSaveReading(e: FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    if (!bookTitle.trim()) {
      setError('Enter the book title you read.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const draft = buildReadingBlockDraft(today, {
        bookTitle: bookTitle.trim(),
        author: author.trim() || null,
        pagesRead: Math.max(0, Number(pagesRead) || 0),
        currentPage: currentPage.trim() ? Number(currentPage) : null,
        totalPages: totalPages.trim() ? Number(totalPages) : null,
        durationMin: Math.max(1, minutes),
        notes: notes.trim() || null,
      });

      await createScheduleBlock(user.id, draft);
      setTimerRunning(false);
      setElapsedSec(0);
      setNotes('');
      await loadReading();
      setNotice(`Logged ${pagesRead || 0} pages (${minutes} min) of "${bookTitle.trim()}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save reading session.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: ReadingLogEntry) {
    if (!user) return;
    if (!window.confirm(`Delete reading log for "${entry.meta.bookTitle}"?`)) return;
    await deleteScheduleBlock(user.id, entry.id);
    await loadReading();
  }

  const inputClass =
    'mt-1.5 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--reading)] focus:outline-none';

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header */}
      <header>
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Read a little <em className="not-italic text-[var(--reading)]">deeper.</em>
        </h1>
      </header>

      {notice && (
        <div className="rounded-xl border border-[var(--reading)]/30 bg-[var(--reading-lite)] px-4 py-2.5 text-xs font-semibold text-[var(--reading-ink)]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Main 2-Column Studio Grid */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: Reading Logger + Live Timer */}
        <form
          onSubmit={(e) => void handleSaveReading(e)}
          className="flex flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7"
        >
          <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Today&apos;s reading session
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Track the book, pages read, and rough time with the built-in timer.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Book title *
              <input
                type="text"
                required
                placeholder="e.g. Atomic Habits"
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Author (optional)
              <input
                type="text"
                placeholder="e.g. James Clear"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-3">
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Pages read
              <input
                type="number"
                min={0}
                value={pagesRead}
                onChange={(e) => setPagesRead(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Reached page
              <input
                type="number"
                min={0}
                placeholder="e.g. 120"
                value={currentPage}
                onChange={(e) => setCurrentPage(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Total pages
              <input
                type="number"
                min={1}
                placeholder="e.g. 320"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          {/* Duration Row + Presets */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline">
              <input
                type="number"
                min={1}
                max={300}
                aria-label="Reading minutes"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Math.min(300, Number(e.target.value) || 15)))}
                className="w-[100px] bg-transparent font-mono text-[54px] font-bold leading-none tracking-[-0.07em] text-[var(--reading)] tabular-nums focus:outline-none"
              />
              <small className="ml-1 text-[15px] font-semibold text-[var(--muted)]">min</small>
            </div>

            <div className="flex items-center gap-1.5">
              {[-5, 5].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => setMinutes((m) => Math.max(1, Math.min(300, m + delta)))}
                  className="h-9 min-w-[46px] rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
                >
                  {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </button>
              ))}
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinutes(n)}
                  className={`hidden h-9 rounded-[8px] border px-2.5 font-mono text-[11.5px] font-semibold sm:inline-flex sm:items-center ${
                    minutes === n
                      ? 'border-[var(--reading)]/45 bg-[var(--reading-lite)] text-[var(--reading-ink)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {n}m
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional takeaway or quote..."
            className="mt-4 w-full rounded-[9px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--reading)] focus:outline-none"
          />

          {/* Bottom Bar: Live Stopwatch + Save */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
              <Clock className="h-4 w-4" />
              <strong className="font-mono text-[12.5px] tracking-wider text-[var(--ink)] tabular-nums">
                {formatHms(elapsedSec)}
              </strong>
              <button
                type="button"
                onClick={handleToggleTimer}
                className="px-1.5 font-bold text-[var(--reading)] hover:underline"
              >
                {timerRunning ? 'Pause' : 'Start'}
              </button>
              {elapsedSec > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setElapsedSec(0);
                  }}
                  className="px-1 font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Reset
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[41px] items-center gap-2 rounded-[9px] bg-[var(--reading)] px-4 text-[12.5px] font-bold text-[var(--reading-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{saving ? 'Saving...' : 'Save reading'}</span>
            </button>
          </div>
        </form>

        {/* Right: Reading Streak + Active Books */}
        <aside className="flex flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                This week
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                {stats.weekPages} pages · {stats.weekMinutes} min read
              </p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--reading-lite)] text-[var(--reading)]">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-2.5">
            <strong className="font-mono text-[42px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
              {stats.currentStreak}
            </strong>
            <span className="text-[12px] text-[var(--muted)]">
              day reading streak · Best {stats.bestStreak}d
            </span>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {stats.weekStatus.map((d, i) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[10px] font-semibold ${
                    d.date === today ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {DAY_LETTERS[i]}
                </span>
                <span
                  title={`${d.date}: ${d.pages}p · ${d.minutes}m`}
                  className={`h-2.5 w-2.5 rounded-full border ${
                    d.completed
                      ? 'border-[var(--reading)] bg-[var(--reading)]'
                      : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                  }`}
                />
                <span className="font-mono text-[9.5px] text-[var(--faint)]">
                  {Number(d.date.slice(8))}
                </span>
              </div>
            ))}
          </div>

          <div className="my-5 h-px bg-[var(--line)]" />

          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
            YOUR SHELF (TAP TO CONTINUE)
          </div>

          {stats.books.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">
              Books you log will appear here with their progress.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.books.slice(0, 4).map((b) => {
                const pct =
                  b.totalPages && b.latestPage
                    ? Math.min(100, Math.round((b.latestPage / b.totalPages) * 100))
                    : null;
                return (
                  <button
                    key={b.bookTitle}
                    type="button"
                    onClick={() => handleSelectBook(b)}
                    className="block w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-left transition-colors hover:border-[var(--reading)]/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-[12.5px] font-bold text-[var(--ink)]">
                        {b.bookTitle}
                      </strong>
                      <span className="shrink-0 font-mono text-[10.5px] font-semibold text-[var(--reading)]">
                        {pct !== null ? `${pct}%` : `${b.totalPagesRead}p`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {b.author ? `${b.author} · ` : ''}
                      {b.latestPage && b.totalPages
                        ? `p. ${b.latestPage}/${b.totalPages}`
                        : `${b.totalPagesRead} pages`}
                    </div>
                    {pct !== null && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <span
                          style={{ width: `${pct}%` }}
                          className="block h-full rounded-full bg-[var(--reading)]"
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Reading History */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Reading history
          </h2>
          <span className="rounded-[6px] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
            {entries.length} logged
          </span>
        </div>

        {loading ? (
          <div className="border-t border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
            Loading reading history...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex min-h-[150px] flex-col items-center justify-center border-t border-[var(--line)] py-8 text-center">
            <h3 className="text-[16px] font-bold text-[var(--ink)]">Nothing logged yet.</h3>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Log your first reading session above to start your streak.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3.5 py-3.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--reading-lite)] text-[var(--reading)]">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[13px] font-bold text-[var(--ink)]">
                    {entry.meta.bookTitle}
                    {entry.meta.author ? ` · ${entry.meta.author}` : ''}
                  </strong>
                  <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                    {formatShortDate(entry.date)}
                    {entry.meta.pagesRead > 0 ? ` · ${entry.meta.pagesRead} pages` : ''}
                    {entry.meta.currentPage ? ` (p. ${entry.meta.currentPage})` : ''}
                    {entry.meta.notes ? ` · ${entry.meta.notes}` : ''}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[12.5px] font-bold text-[var(--ink)] tabular-nums">
                  {entry.meta.durationMin} min
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(entry)}
                  aria-label={`Delete ${entry.meta.bookTitle}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
