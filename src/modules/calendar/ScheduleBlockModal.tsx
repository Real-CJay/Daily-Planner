import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/design-system';
import { ISO_WEEKDAYS } from './scheduleEngine';
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type PhysicalLoadLevel,
  type ScheduleBlock,
  type ScheduleBlockDraft,
  type ScheduleStatus,
} from '@/types/domain';

export function ScheduleBlockModal({
  initialBlock,
  defaultDate,
  onClose,
  onSave,
}: {
  initialBlock?: ScheduleBlock | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: ScheduleBlockDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialBlock?.title ?? '');
  const [category, setCategory] = useState<ActivityCategory>(initialBlock?.category ?? 'KARATE');
  const [blockDate, setBlockDate] = useState(initialBlock?.block_date ?? defaultDate);
  const [startTime, setStartTime] = useState(initialBlock?.start_time?.slice(0, 5) ?? '');
  const [endTime, setEndTime] = useState(initialBlock?.end_time?.slice(0, 5) ?? '');
  const [durationMin, setDurationMin] = useState(initialBlock?.duration_min?.toString() ?? '');
  const [isRecurring, setIsRecurring] = useState(initialBlock?.is_recurring ?? false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    initialBlock?.recurrence_days ?? []
  );
  const [status, setStatus] = useState<ScheduleStatus>(initialBlock?.status ?? 'PLANNED');
  const [physicalLoad, setPhysicalLoad] = useState<PhysicalLoadLevel>(
    initialBlock?.physical_load ?? 'MODERATE'
  );
  const [notes, setNotes] = useState(initialBlock?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleWeekday(isoDay: number) {
    setRecurrenceDays((prev) =>
      prev.includes(isoDay) ? prev.filter((d) => d !== isoDay) : [...prev, isoDay].sort()
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Enter a title for this schedule block.');
      return;
    }
    if (isRecurring && recurrenceDays.length === 0) {
      setError('Select at least one weekday for a recurring schedule.');
      return;
    }

    const draft: ScheduleBlockDraft = {
      title: title.trim(),
      category,
      block_date: blockDate,
      start_time: startTime.trim() ? startTime.trim() : null,
      end_time: endTime.trim() ? endTime.trim() : null,
      duration_min: durationMin.trim() ? Number(durationMin) : null,
      is_recurring: isRecurring,
      recurrence_days: isRecurring ? recurrenceDays : [],
      status,
      physical_load: physicalLoad,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      setSubmitting(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save schedule block.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none';
  const labelClass = 'block text-[11.5px] font-semibold text-[var(--muted)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialBlock ? 'Edit Schedule Block' : 'Add Schedule Block'}
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {initialBlock ? 'EDIT BLOCK' : 'ADD TO PLANNER'}
            </div>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              {initialBlock ? 'Edit schedule block' : 'Schedule a block'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Karate Training, University Lab, Rest Day"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={category}
                onChange={(e) => {
                  const next = e.target.value as ActivityCategory;
                  setCategory(next);
                  if (next === 'VOCAL' || next === 'UNIVERSITY' || next === 'RECOVERY') {
                    setPhysicalLoad('NONE');
                  } else if (next === 'DRUMMING') {
                    setPhysicalLoad('LOW');
                  } else if (next === 'KARATE') {
                    setPhysicalLoad('HIGH');
                  } else if (next === 'STRENGTH') {
                    setPhysicalLoad('MODERATE');
                  }
                }}
                className={inputClass}
              >
                {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Physical Load</label>
              <select
                value={physicalLoad}
                onChange={(e) => setPhysicalLoad(e.target.value as PhysicalLoadLevel)}
                className={inputClass}
              >
                <option value="NONE">None (Mental / Rest)</option>
                <option value="LOW">Low</option>
                <option value="MODERATE">Moderate</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>{isRecurring ? 'Start Date *' : 'Date *'}</label>
              <input
                type="date"
                required
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
                className={inputClass}
              >
                <option value="PLANNED">Planned</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
                <option value="RESCHEDULED">Rescheduled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>End time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Duration (min)</label>
              <input
                type="number"
                min="1"
                max="1440"
                placeholder="60"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--blue)]"
              />
              <span>Repeat weekly (Mon–Sun)</span>
            </label>

            {isRecurring && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {ISO_WEEKDAYS.map((day) => {
                  const active = recurrenceDays.includes(day.iso);
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() => toggleWeekday(day.iso)}
                      className={`rounded-[7px] border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                        active
                          ? 'border-[var(--blue)] bg-[var(--blue)] text-white dark:text-[#121315]'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <input
              type="text"
              placeholder="Optional context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 border-t border-[var(--line)] pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="!min-h-[38px] !px-4 !text-[12.5px]"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-[38px] items-center justify-center rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-[#121315]"
            >
              {submitting ? 'Saving...' : initialBlock ? 'Update Block' : 'Save Block'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
