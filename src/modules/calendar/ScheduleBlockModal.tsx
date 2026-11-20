import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button, Card } from '@/design-system';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/45 p-4">
      <Card className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {initialBlock ? 'Edit Schedule Block' : 'Add Schedule Block'}
            </h2>
            <p className="text-xs text-slate-500">
              Non-running commitments stay isolated from running mileage and pace metrics.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Karate Training, University Lab, Rest Day"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Category</label>
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
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Physical Load</label>
              <select
                value={physicalLoad}
                onChange={(e) => setPhysicalLoad(e.target.value as PhysicalLoadLevel)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="NONE">None (Mental / Rest)</option>
                <option value="LOW">Low</option>
                <option value="MODERATE">Moderate</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                {isRecurring ? 'Start Date *' : 'Date *'}
              </label>
              <input
                type="date"
                required
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="PLANNED">Planned</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
                <option value="RESCHEDULED">Rescheduled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Start Time (Optional)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                End Time (Optional)
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Duration (min, optional)
              </label>
              <input
                type="number"
                min="1"
                max="1440"
                placeholder="60"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>Repeat weekly (Monday–Sunday)</span>
            </label>

            {isRecurring && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ISO_WEEKDAYS.map((day) => {
                  const active = recurrenceDays.includes(day.iso);
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() => toggleWeekday(day.iso)}
                      className={`rounded-md border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
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
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <input
              type="text"
              placeholder="Optional context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : initialBlock ? 'Update Block' : 'Save Block'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
