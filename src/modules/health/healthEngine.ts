import { addDaysIso, getMondayIso, getWeekDatesIso } from '@/modules/calendar/timelineEngine';

export type HealthRuleCategory = 'SUGAR' | 'DIET' | 'HYDRATION' | 'HABIT';

export interface HealthRule {
  id: string;
  title: string;
  category: HealthRuleCategory;
  targetNote: string | null;
  createdAt: string;
}

export interface HealthStore {
  rules: HealthRule[];
  /** Map of YYYY-MM-DD -> array of completed rule IDs */
  checkedByDate: Record<string, string[]>;
}

export const HEALTH_PRESET_TEMPLATES: {
  title: string;
  category: HealthRuleCategory;
  targetNote: string;
}[] = [
  { title: 'No added sugar / sugary drinks', category: 'SUGAR', targetNote: 'Keep blood sugar steady' },
  { title: 'Low-fat & clean whole foods', category: 'DIET', targetNote: 'Avoid deep-fried & heavy oils' },
  { title: 'Drink 3L water', category: 'HYDRATION', targetNote: 'Hydration baseline' },
  { title: 'No eating 2h before sleep', category: 'HABIT', targetNote: 'Better deep sleep & recovery' },
  { title: 'No junk / ultra-processed food', category: 'DIET', targetNote: 'Clean fuel only' },
];

const DEFAULT_HEALTH_STORE: HealthStore = {
  rules: [
    {
      id: 'h-sugar',
      title: 'No added sugar / sugary drinks',
      category: 'SUGAR',
      targetNote: 'Keep blood sugar steady',
      createdAt: '2026-01-01',
    },
    {
      id: 'h-lowfat',
      title: 'Low-fat & clean whole foods',
      category: 'DIET',
      targetNote: 'Avoid deep-fried & heavy oils',
      createdAt: '2026-01-01',
    },
  ],
  checkedByDate: {},
};

function healthKey(userId: string): string {
  return `stride:health:${userId}`;
}

export function loadHealthStore(userId: string): HealthStore {
  try {
    const raw = window.localStorage.getItem(healthKey(userId));
    if (!raw) return structuredClone(DEFAULT_HEALTH_STORE);
    const parsed = JSON.parse(raw) as Partial<HealthStore>;
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : DEFAULT_HEALTH_STORE.rules,
      checkedByDate: parsed.checkedByDate ?? {},
    };
  } catch {
    return structuredClone(DEFAULT_HEALTH_STORE);
  }
}

export function saveHealthStore(userId: string, store: HealthStore): void {
  try {
    window.localStorage.setItem(healthKey(userId), JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function calculateHealthSummary(store: HealthStore, todayIso: string) {
  const totalRules = store.rules.length;
  const todayChecked = new Set(store.checkedByDate[todayIso] ?? []);
  const doneToday = store.rules.filter((r) => todayChecked.has(r.id)).length;

  const isDayComplete = (dateIso: string) => {
    if (totalRules === 0) return false;
    const set = new Set(store.checkedByDate[dateIso] ?? []);
    return store.rules.every((r) => set.has(r.id));
  };

  let currentStreak = 0;
  let cursor = isDayComplete(todayIso) ? todayIso : addDaysIso(todayIso, -1);
  while (isDayComplete(cursor)) {
    currentStreak++;
    cursor = addDaysIso(cursor, -1);
  }

  const monday = getMondayIso(todayIso);
  const weekDates = getWeekDatesIso(monday);
  const weekStatus = weekDates.map((date) => {
    const set = new Set(store.checkedByDate[date] ?? []);
    const count = store.rules.filter((r) => set.has(r.id)).length;
    return {
      date,
      completed: totalRules > 0 && count === totalRules,
      count,
    };
  });

  return {
    totalRules,
    doneToday,
    currentStreak,
    weekStatus,
  };
}
