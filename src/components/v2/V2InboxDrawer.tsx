import { useEffect, useState, type FormEvent } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, mapCategoryToDomain } from '@/design-system/v2Theme';
import type { ScheduleBlock } from '@/types/domain';

export function V2InboxDrawer({
  isDark,
  items,
  busyId,
  onClose,
  onAdd,
  onScheduleToday,
  onDelete,
}: {
  isDark: boolean;
  items: ScheduleBlock[];
  busyId: string | null;
  onClose: () => void;
  onAdd: (title: string) => Promise<void>;
  onScheduleToday: (block: ScheduleBlock) => Promise<void>;
  onDelete: (blockId: string) => Promise<void>;
}) {
  const T = getV2Theme(isDark);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await onAdd(trimmed);
      setText('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-40 ${T.modalOverlay}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className={`animate-slide absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col border-l shadow-2xl ${T.card}`}
      >
        <div className={`flex items-center justify-between border-b px-5 py-4 ${T.divider}`}>
          <h2 className={`font-display text-base font-extrabold ${T.text}`}>Unscheduled Inbox</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inbox"
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
          >
            ×
          </button>
        </div>

        <div className={`flex-1 space-y-3 overflow-y-auto p-5 ${T.surface}`}>
          {items.length === 0 && (
            <div className={`p-8 text-center text-xs font-bold ${T.muted}`}>Inbox clear</div>
          )}
          {items.map((item) => {
            const domId = mapCategoryToDomain(item.category);
            const d = getDom(domId, isDark);
            const busy = busyId === item.id;
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 ${T.card}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${d.soft} ${d.text}`}
                  >
                    <DuoIcon name={domId} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className={`truncate font-display text-sm font-bold ${T.text}`}>
                      {item.title}
                    </div>
                    <span className={`text-[11px] font-bold ${T.muted}`}>
                      {item.duration_min ?? 30}m
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onScheduleToday(item)}
                    className={`cursor-pointer rounded-xl px-3 py-1.5 font-display text-xs font-bold disabled:opacity-50 ${T.btnPrimary}`}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Delete task"
                    onClick={() => void onDelete(item.id)}
                    className={`h-8 w-8 cursor-pointer rounded-xl text-xs font-extrabold ${T.btnNeutral} ${T.muted}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => void handleAdd(e)}
          className={`flex gap-2 border-t p-4 ${T.card} ${T.divider}`}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Quick unscheduled task..."
            className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-bold focus:outline-none ${T.input}`}
          />
          <button
            type="submit"
            disabled={adding}
            className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-sm font-bold disabled:opacity-50 ${T.btnInk}`}
          >
            Add
          </button>
        </form>
      </aside>
    </div>
  );
}
