import { useState, type FormEvent } from 'react';
import { ArrowRight, Clock, Inbox, Plus } from 'lucide-react';
import { CategoryBadge, CategoryMark } from '@/design-system';
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ScheduleBlock,
  type ScheduleBlockDraft,
} from '@/types/domain';
import { formatDurationCompact } from './timelineEngine';

const INBOX_CATEGORIES: ActivityCategory[] = [
  'UNIVERSITY',
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
  'STRENGTH',
  'RUNNING',
  'CUSTOM',
];

export function InboxSidebar({
  selectedDate,
  inboxBlocks,
  onQuickAddInbox,
  onSlotToSelectedDay,
}: {
  selectedDate: string;
  inboxBlocks: ScheduleBlock[];
  onQuickAddInbox: (draft: ScheduleBlockDraft) => Promise<void>;
  onSlotToSelectedDay: (block: ScheduleBlock) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('UNIVERSITY');
  const [durationMin, setDurationMin] = useState(45);
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onQuickAddInbox({
        title: trimmed,
        category,
        block_date: selectedDate,
        start_time: null,
        end_time: null,
        duration_min: durationMin,
        is_recurring: false,
        recurrence_days: [],
        status: 'PLANNED',
        physical_load: category === 'STRENGTH' ? 'MODERATE' : 'NONE',
        notes: null,
      });
      setTitle('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[var(--blue)]" />
          <h2 className="text-[13px] font-bold text-[var(--ink)]">Unscheduled Inbox</h2>
        </div>
        <span className="rounded-[6px] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[var(--muted)]">
          {inboxBlocks.length}
        </span>
      </div>

      {/* Quick Capture Form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Capture task or session..."
          className="w-full rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[12px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ActivityCategory)}
            aria-label="Task category"
            className="min-w-0 flex-1 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1.5 text-[11.5px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
          >
            {INBOX_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {ACTIVITY_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          <select
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            aria-label="Estimated duration"
            className="w-16 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-1.5 py-1.5 font-mono text-[11.5px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
          >
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {formatDurationCompact(m)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !title.trim()}
            aria-label="Add to inbox"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--blue)] text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-[#121315]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>
        </div>
      </form>

      {/* Unscheduled Items List */}
      <div className="mt-4 space-y-2">
        {inboxBlocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg)] px-3 py-4 text-center text-[11.5px] leading-relaxed text-[var(--muted)]">
            Inbox clear. Capture university tasks, vocal warmups, or errands here and slot them into
            your schedule later.
          </p>
        ) : (
          inboxBlocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 transition-colors hover:border-[var(--blue)]/50"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <CategoryMark category={block.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold text-[var(--ink)]">
                    {block.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={block.category} />
                    {block.duration_min && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-[var(--muted)]">
                        <Clock className="h-3 w-3" />
                        {formatDurationCompact(block.duration_min)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSlotToSelectedDay(block)}
                title={`Schedule on ${selectedDate}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--blue)] transition-colors hover:border-[var(--blue)] hover:bg-[var(--blue)] hover:text-white dark:hover:text-[#121315]"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
