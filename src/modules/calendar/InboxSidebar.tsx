import { useState, type FormEvent } from 'react';
import { ArrowRight, Clock, Inbox, Plus } from 'lucide-react';
import { Button, Card, CategoryBadge } from '@/design-system';
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
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[#176D3E] dark:text-morgen-red" />
          <h2 className="text-sm font-semibold text-[#161C19] dark:text-white">
            Unscheduled Inbox
          </h2>
        </div>
        <span className="rounded-md bg-[#F7F9F8] px-2 py-0.5 font-mono text-[11px] font-medium text-flomo-slate dark:bg-morgen-elevated dark:text-morgen-muted">
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
          className="w-full rounded-lg border border-[#E5EAE7] bg-white px-3 py-2 text-xs text-[#161C19] placeholder:text-flomo-slate/70 focus:border-[#176D3E] focus:outline-none dark:border-morgen-border dark:bg-morgen-black dark:text-white dark:placeholder:text-morgen-muted dark:focus:border-morgen-red"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ActivityCategory)}
            aria-label="Task category"
            className="min-w-0 flex-1 rounded-lg border border-[#E5EAE7] bg-white px-2 py-1.5 text-xs text-[#161C19] focus:border-[#176D3E] focus:outline-none dark:border-morgen-border dark:bg-morgen-black dark:text-white"
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
            className="w-20 rounded-lg border border-[#E5EAE7] bg-white px-2 py-1.5 font-mono text-xs text-[#161C19] focus:border-[#176D3E] focus:outline-none dark:border-morgen-border dark:bg-morgen-black dark:text-white"
          >
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {formatDurationCompact(m)}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            disabled={adding || !title.trim()}
            className="!min-h-[32px] !px-2.5 !py-1.5"
            aria-label="Add to inbox"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>

      {/* Unscheduled Items List */}
      <div className="mt-4 space-y-2">
        {inboxBlocks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#E5EAE7] px-3 py-4 text-center text-xs text-flomo-slate dark:border-morgen-border dark:text-morgen-muted">
            Inbox clear. Capture university tasks, vocal warmups, or errands here and slot them into
            free timeline gaps later.
          </p>
        ) : (
          inboxBlocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#E5EAE7] bg-[#F7F9F8]/70 px-3 py-2.5 transition-colors hover:border-[#2CCC74]/50 dark:border-morgen-border dark:bg-morgen-elevated/70 dark:hover:border-morgen-red/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-[#161C19] dark:text-white">
                  {block.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <CategoryBadge category={block.category} />
                  {block.duration_min && (
                    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-flomo-slate dark:text-morgen-muted">
                      <Clock className="h-3 w-3" />
                      {formatDurationCompact(block.duration_min)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSlotToSelectedDay(block)}
                title={`Schedule on ${selectedDate}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E5EAE7] bg-white text-[#176D3E] transition-colors hover:bg-[#176D3E] hover:text-white dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-red dark:hover:bg-morgen-rose dark:hover:text-white"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
