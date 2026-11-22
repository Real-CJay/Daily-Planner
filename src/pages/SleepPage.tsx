import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, Edit3, Moon, Trash2, Upload, X } from 'lucide-react';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
  updateScheduleBlock,
} from '@/modules/calendar/repository';
import {
  buildSleepBlockDraft,
  calculateSleepDurationMin,
  calculateSleepStats,
  extractSleepEntries,
  formatMinutesAsHrMin,
  SLEEP_QUALITY_OPTIONS,
  type SleepLogEntry,
  type SleepLogMeta,
  type SleepQualityLabel,
} from '@/modules/sleep/sleepLog';
import type { ScheduleBlock } from '@/types/domain';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function SleepPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Quick inline bedtime / wake-time logger
  const [logDate, setLogDate] = useState(today);
  const [bedTime, setBedTime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('06:45');
  const [quality, setQuality] = useState<SleepQualityLabel>('Good');
  const [sleepScore, setSleepScore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Screenshot import / full-stage edit modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SleepLogEntry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mDate, setMDate] = useState(today);
  const [mBedTime, setMBedTime] = useState('23:00');
  const [mWakeTime, setMWakeTime] = useState('06:46');
  const [mTotalH, setMTotalH] = useState('7');
  const [mTotalM, setMTotalM] = useState('46');
  const [mScore, setMScore] = useState('');
  const [mQuality, setMQuality] = useState<SleepQualityLabel>('General');
  const [mDeep, setMDeep] = useState('');
  const [mLight, setMLight] = useState('');
  const [mRem, setMRem] = useState('');
  const [mAwake, setMAwake] = useState('');
  const [mNap, setMNap] = useState('');
  const [mNotes, setMNotes] = useState('');

  const loadSleep = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const all = await listScheduleBlocks(user.id);
      setBlocks(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sleep logs.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSleep();
  }, [loadSleep]);

  useEffect(() => {
    if (!showImportModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowImportModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showImportModal]);

  const entries = useMemo(() => extractSleepEntries(blocks), [blocks]);
  const stats = useMemo(() => calculateSleepStats(entries, today), [entries, today]);
  const computedInlineMin = useMemo(
    () => calculateSleepDurationMin(bedTime, wakeTime),
    [bedTime, wakeTime]
  );

  function openImportOrEdit(entry?: SleepLogEntry) {
    setPreviewUrl(null);
    if (entry) {
      setEditingEntry(entry);
      setMDate(entry.date);
      setMBedTime(entry.meta.bedTime);
      setMWakeTime(entry.meta.wakeTime);
      setMTotalH(String(Math.floor(entry.meta.totalMin / 60)));
      setMTotalM(String(entry.meta.totalMin % 60));
      setMScore(entry.meta.sleepScore !== null ? String(entry.meta.sleepScore) : '');
      setMQuality(entry.meta.quality ?? 'General');
      setMDeep(entry.meta.deepMin !== null ? String(entry.meta.deepMin) : '');
      setMLight(entry.meta.lightMin !== null ? String(entry.meta.lightMin) : '');
      setMRem(entry.meta.remMin !== null ? String(entry.meta.remMin) : '');
      setMAwake(entry.meta.awakeMin !== null ? String(entry.meta.awakeMin) : '');
      setMNap(entry.meta.napMin !== null ? String(entry.meta.napMin) : '');
      setMNotes(entry.meta.notes ?? '');
    } else {
      setEditingEntry(null);
      setMDate(today);
      setMBedTime(bedTime);
      setMWakeTime(wakeTime);
      setMTotalH(String(Math.floor(computedInlineMin / 60)));
      setMTotalM(String(computedInlineMin % 60));
      setMScore('');
      setMQuality('General');
      setMDeep('');
      setMLight('');
      setMRem('');
      setMAwake('');
      setMNap('');
      setMNotes('');
    }
    setShowImportModal(true);
  }

  function handleScreenshotFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }

  async function handleQuickSave(e: FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const meta: SleepLogMeta = {
        bedTime,
        wakeTime,
        totalMin: computedInlineMin,
        sleepScore: sleepScore.trim() ? Number(sleepScore) : null,
        quality,
        deepMin: null,
        lightMin: null,
        remMin: null,
        awakeMin: null,
        napMin: null,
        awakeCount: null,
        notes: notes.trim() || null,
      };
      await createScheduleBlock(user.id, buildSleepBlockDraft(logDate, meta));
      setSleepScore('');
      setNotes('');
      await loadSleep();
      setNotice(`Logged ${formatMinutesAsHrMin(computedInlineMin)} sleep for ${formatShortDate(logDate)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save sleep log.');
    } finally {
      setSaving(false);
    }
  }

  async function handleModalSave(e: FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    try {
      const h = Number(mTotalH) || 0;
      const m = Number(mTotalM) || 0;
      const totalMin = h * 60 + m > 0 ? h * 60 + m : calculateSleepDurationMin(mBedTime, mWakeTime);
      const toNum = (v: string) => (v.trim() ? Number(v) : null);

      const meta: SleepLogMeta = {
        bedTime: mBedTime,
        wakeTime: mWakeTime,
        totalMin,
        sleepScore: toNum(mScore),
        quality: mQuality,
        deepMin: toNum(mDeep),
        lightMin: toNum(mLight),
        remMin: toNum(mRem),
        awakeMin: toNum(mAwake),
        napMin: toNum(mNap),
        awakeCount: null,
        notes: mNotes.trim() || null,
      };

      const draft = buildSleepBlockDraft(mDate, meta);
      if (editingEntry) {
        await updateScheduleBlock(user.id, editingEntry.id, draft);
      } else {
        await createScheduleBlock(user.id, draft);
      }
      setShowImportModal(false);
      setEditingEntry(null);
      await loadSleep();
      setNotice(`Saved sleep record for ${formatShortDate(mDate)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save sleep record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: SleepLogEntry) {
    if (!user) return;
    if (!window.confirm(`Delete sleep log for ${entry.date}?`)) return;
    await deleteScheduleBlock(user.id, entry.id);
    await loadSleep();
  }

  const inputClass =
    'mt-1.5 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] focus:border-[var(--sleep)] focus:outline-none';

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Rest with <em className="not-italic text-[var(--sleep)]">rhythm.</em>
        </h1>

        <button
          type="button"
          onClick={() => openImportOrEdit()}
          className="inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-[9px] bg-[var(--sleep)] px-4 text-[13px] font-bold text-[var(--sleep-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px"
        >
          <Upload className="h-4 w-4 stroke-[2.3]" />
          <span>Upload screenshot</span>
        </button>
      </header>

      {notice && (
        <div className="rounded-xl border border-[var(--sleep)]/30 bg-[var(--sleep-lite)] px-4 py-2.5 text-xs font-semibold text-[var(--sleep-ink)]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Top 2 Studio Cards: Bedtime/Wake Quick Logger + Weekly Summary */}
      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        {/* Left: Bedtime & Wake Time Logger */}
        <form
          onSubmit={(e) => void handleQuickSave(e)}
          className="flex flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Log bedtime &amp; wake time
              </h2>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Mark when you went to sleep and got up, or upload a tracker screenshot for stages.
              </p>
            </div>
            <div className="font-mono text-[28px] font-bold leading-none tracking-[-0.05em] text-[var(--sleep)] tabular-nums">
              {formatMinutesAsHrMin(computedInlineMin)}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Wake date
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Went to sleep
              <input
                type="time"
                value={bedTime}
                onChange={(e) => setBedTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
              Got out of sleep
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SLEEP_QUALITY_OPTIONS.map((q) => {
              const active = quality === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`rounded-[8px] border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
                    active
                      ? 'border-[var(--sleep)]/45 bg-[var(--sleep-lite)] text-[var(--sleep-ink)]'
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {q}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Score (0–100)"
              value={sleepScore}
              onChange={(e) => setSleepScore(e.target.value)}
              className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 font-mono text-[12.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--sleep)] focus:outline-none"
            />
            <input
              type="text"
              placeholder="Optional note (e.g. woke once, felt rested)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3.5 py-2 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--sleep)] focus:outline-none"
            />
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <button
              type="button"
              onClick={() => openImportOrEdit()}
              className="text-[12px] font-semibold text-[var(--sleep)] hover:underline"
            >
              Add Deep / Light / REM stages →
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[41px] items-center gap-2 rounded-[9px] bg-[var(--sleep)] px-4 text-[12.5px] font-bold text-[var(--sleep-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{saving ? 'Saving...' : 'Save sleep'}</span>
            </button>
          </div>
        </form>

        {/* Right: Weekly Average + Sleep Streak */}
        <aside
          className="flex flex-col rounded-[15px] border border-[var(--line)] p-6 sm:p-7"
          style={{ background: 'color-mix(in srgb, var(--sleep) 4%, var(--surface))' }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
              THIS WEEK
            </span>
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--sleep-lite)] text-[var(--sleep)]">
              <Moon className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 font-mono text-[48px] font-bold leading-none tracking-[-0.07em] text-[var(--ink)] tabular-nums">
            {stats.weekAvgMin > 0 ? formatMinutesAsHrMin(stats.weekAvgMin) : '—'}
          </div>
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            Weekly average · {stats.weekCount} night{stats.weekCount === 1 ? '' : 's'} logged
            {stats.weekAvgScore !== null ? ` · Avg score ${stats.weekAvgScore}` : ''}
          </p>

          <div className="mt-5 flex items-baseline gap-2.5">
            <strong className="font-mono text-[26px] font-bold text-[var(--sleep)] tabular-nums">
              {stats.currentStreak}
            </strong>
            <span className="text-[12px] text-[var(--muted)]">
              night streak · Best {stats.bestStreak}d
            </span>
          </div>

          <div className="mt-auto border-t border-[var(--line)] pt-5">
            <div className="grid grid-cols-7 gap-1.5">
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
                    title={`${d.date}: ${formatMinutesAsHrMin(d.minutes)}`}
                    className={`h-2.5 w-2.5 rounded-full border ${
                      d.completed
                        ? 'border-[var(--sleep)] bg-[var(--sleep)]'
                        : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                    }`}
                  />
                  <span className="font-mono text-[9.5px] text-[var(--faint)]">
                    {Number(d.date.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Sleep History */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Sleep history
            </h2>
            <span className="rounded-[6px] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
              {entries.length} logged
            </span>
          </div>
        </div>

        {loading ? (
          <div className="border-t border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
            Loading sleep logs...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center border-t border-[var(--line)] py-8 text-center">
            <div className="mb-3 flex h-8 items-end gap-1 -rotate-12" aria-hidden="true">
              <span className="h-3.5 w-2 rounded bg-[var(--line-strong)]" />
              <span className="h-6 w-2 rounded bg-[var(--sleep)]" />
              <span className="h-4.5 w-2 rounded bg-[var(--line-strong)]" />
            </div>
            <h3 className="text-[16px] font-bold text-[var(--ink)]">No sleep nights logged yet.</h3>
            <p className="mt-1 max-w-[300px] text-[12px] text-[var(--muted)]">
              Log your bedtime and wake time above, or upload a screenshot from your sleep tracker.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {entries.map((entry) => {
              const { deepMin, lightMin, remMin, awakeMin } = entry.meta;
              const stageTotal = (deepMin ?? 0) + (lightMin ?? 0) + (remMin ?? 0) + (awakeMin ?? 0);
              return (
                <div key={entry.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--sleep-lite)] text-[var(--sleep)]">
                        <Moon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-[13.5px] font-bold text-[var(--ink)]">
                            {formatShortDate(entry.date)}
                          </strong>
                          <span className="font-mono text-[11.5px] text-[var(--muted)]">
                            {entry.meta.bedTime} → {entry.meta.wakeTime}
                          </span>
                          {entry.meta.quality && (
                            <span className="rounded-md bg-[var(--sleep-lite)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--sleep-ink)]">
                              {entry.meta.quality}
                            </span>
                          )}
                          {entry.meta.sleepScore !== null && (
                            <span className="font-mono text-[11px] font-semibold text-[var(--muted)]">
                              Score {entry.meta.sleepScore}
                            </span>
                          )}
                        </div>
                        {entry.meta.notes && (
                          <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                            {entry.meta.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="mr-2 font-mono text-[14px] font-bold text-[var(--ink)] tabular-nums">
                        {formatMinutesAsHrMin(entry.meta.totalMin)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openImportOrEdit(entry)}
                        aria-label={`Edit sleep on ${entry.date}`}
                        className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry)}
                        aria-label={`Delete sleep on ${entry.date}`}
                        className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Proportional Sleep Stage Ratio Bar (Deep / Light / REM / Awake) */}
                  {stageTotal > 0 && (
                    <div className="mt-3 pl-12">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                        {deepMin ? (
                          <span
                            style={{ width: `${(deepMin / stageTotal) * 100}%` }}
                            className="bg-[#4b56c4]"
                            title={`Deep: ${formatMinutesAsHrMin(deepMin)}`}
                          />
                        ) : null}
                        {lightMin ? (
                          <span
                            style={{ width: `${(lightMin / stageTotal) * 100}%` }}
                            className="bg-[#7b86e8]"
                            title={`Light: ${formatMinutesAsHrMin(lightMin)}`}
                          />
                        ) : null}
                        {remMin ? (
                          <span
                            style={{ width: `${(remMin / stageTotal) * 100}%` }}
                            className="bg-[#5bb8e6]"
                            title={`REM: ${formatMinutesAsHrMin(remMin)}`}
                          />
                        ) : null}
                        {awakeMin ? (
                          <span
                            style={{ width: `${(awakeMin / stageTotal) * 100}%` }}
                            className="bg-[#e6b44c]"
                            title={`Awake: ${formatMinutesAsHrMin(awakeMin)}`}
                          />
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[10px] text-[var(--muted)]">
                        {deepMin !== null && <span>Deep {formatMinutesAsHrMin(deepMin)}</span>}
                        {lightMin !== null && <span>Light {formatMinutesAsHrMin(lightMin)}</span>}
                        {remMin !== null && <span>REM {formatMinutesAsHrMin(remMin)}</span>}
                        {awakeMin !== null && <span>Awake {formatMinutesAsHrMin(awakeMin)}</span>}
                        {entry.meta.napMin !== null && (
                          <span>Naps {formatMinutesAsHrMin(entry.meta.napMin)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Screenshot Upload & Full Sleep Stages Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowImportModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Import Sleep Screenshot & Stages"
            className="max-h-[92vh] w-full max-w-[780px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
              <div>
                <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  {editingEntry ? 'Edit sleep record' : 'Upload sleep screenshot & stages'}
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                  Drop your tracker screenshot to reference side-by-side while entering stages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                aria-label="Close modal"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[0.85fr_1.15fr]">
              {/* Left: Screenshot Dropzone / Side-by-Side Preview */}
              <div className="flex flex-col gap-3">
                <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg)] p-4 text-center transition-colors hover:border-[var(--sleep)]">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Uploaded sleep screenshot"
                      className="max-h-[340px] w-auto rounded-lg object-contain"
                    />
                  ) : (
                    <>
                      <Upload className="mb-2 h-6 w-6 text-[var(--sleep)]" />
                      <span className="text-[12.5px] font-bold text-[var(--ink)]">
                        Choose sleep screenshot
                      </span>
                      <span className="mt-1 text-[11px] text-[var(--muted)]">
                        PNG or JPG from your watch / health app
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotFile}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Right: Structured Sleep Fields */}
              <form onSubmit={(e) => void handleModalSave(e)} className="space-y-3.5">
                <div className="grid grid-cols-3 gap-2.5">
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Date
                    <input
                      type="date"
                      required
                      value={mDate}
                      onChange={(e) => setMDate(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Bedtime
                    <input
                      type="time"
                      value={mBedTime}
                      onChange={(e) => setMBedTime(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Wake time
                    <input
                      type="time"
                      value={mWakeTime}
                      onChange={(e) => setMWakeTime(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Total hrs
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={mTotalH}
                      onChange={(e) => setMTotalH(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Total min
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={mTotalM}
                      onChange={(e) => setMTotalM(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Score
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="69"
                      value={mScore}
                      onChange={(e) => setMScore(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Quality
                    <select
                      value={mQuality}
                      onChange={(e) => setMQuality(e.target.value as SleepQualityLabel)}
                      className={inputClass}
                    >
                      {SLEEP_QUALITY_OPTIONS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Deep (m)
                    <input
                      type="number"
                      min={0}
                      placeholder="77"
                      value={mDeep}
                      onChange={(e) => setMDeep(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Light (m)
                    <input
                      type="number"
                      min={0}
                      placeholder="279"
                      value={mLight}
                      onChange={(e) => setMLight(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    REM (m)
                    <input
                      type="number"
                      min={0}
                      placeholder="62"
                      value={mRem}
                      onChange={(e) => setMRem(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Awake (m)
                    <input
                      type="number"
                      min={0}
                      placeholder="13"
                      value={mAwake}
                      onChange={(e) => setMAwake(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[var(--muted)]">
                    Naps (m)
                    <input
                      type="number"
                      min={0}
                      placeholder="48"
                      value={mNap}
                      onChange={(e) => setMNap(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </label>
                </div>

                <label className="block text-[11px] font-semibold text-[var(--muted)]">
                  Notes
                  <input
                    type="text"
                    value={mNotes}
                    onChange={(e) => setMNotes(e.target.value)}
                    placeholder="Optional notes..."
                    className={inputClass}
                  />
                </label>

                <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="h-10 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-10 rounded-[9px] bg-[var(--sleep)] px-5 text-[12.5px] font-bold text-[var(--sleep-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save sleep record'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
