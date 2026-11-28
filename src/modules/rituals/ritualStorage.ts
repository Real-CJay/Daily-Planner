import type { DuoIconName } from '@/design-system/DuoIcon';

export interface RitualTemplateItem {
  id: string;
  label: string;
  icon: DuoIconName;
}

export interface RitualConfig {
  morning: [RitualTemplateItem, RitualTemplateItem, RitualTemplateItem];
  evening: [RitualTemplateItem, RitualTemplateItem, RitualTemplateItem];
}

export const DEFAULT_RITUAL_CONFIG: RitualConfig = {
  morning: [
    { id: 'rm-1', label: 'Hydrate', icon: 'water' },
    { id: 'rm-2', label: 'Sunlight', icon: 'sun' },
    { id: 'rm-3', label: 'Top Block', icon: 'spark' },
  ],
  evening: [
    { id: 're-1', label: 'Prep Gear', icon: 'running' },
    { id: 're-2', label: 'Phone Out', icon: 'moon' },
    { id: 're-3', label: 'Lock Start', icon: 'monk' },
  ],
};

function configKey(userId: string): string {
  return `stride_ritual_config_${userId}`;
}

function doneKey(userId: string, dateIso: string): string {
  return `stride_ritual_done_${userId}_${dateIso}`;
}

export function loadRitualConfig(userId: string): RitualConfig {
  try {
    const raw = localStorage.getItem(configKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RitualConfig>;
      if (
        Array.isArray(parsed.morning) &&
        parsed.morning.length === 3 &&
        Array.isArray(parsed.evening) &&
        parsed.evening.length === 3
      ) {
        return {
          morning: [
            { ...DEFAULT_RITUAL_CONFIG.morning[0], ...parsed.morning[0] },
            { ...DEFAULT_RITUAL_CONFIG.morning[1], ...parsed.morning[1] },
            { ...DEFAULT_RITUAL_CONFIG.morning[2], ...parsed.morning[2] },
          ],
          evening: [
            { ...DEFAULT_RITUAL_CONFIG.evening[0], ...parsed.evening[0] },
            { ...DEFAULT_RITUAL_CONFIG.evening[1], ...parsed.evening[1] },
            { ...DEFAULT_RITUAL_CONFIG.evening[2], ...parsed.evening[2] },
          ],
        };
      }
    }
  } catch {
    // ignore storage error
  }
  return DEFAULT_RITUAL_CONFIG;
}

export function saveRitualConfig(userId: string, config: RitualConfig): void {
  try {
    localStorage.setItem(configKey(userId), JSON.stringify(config));
  } catch {
    // ignore storage error
  }
}

export function loadRitualDoneIds(userId: string, dateIso: string): string[] {
  try {
    const raw = localStorage.getItem(doneKey(userId, dateIso));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    // ignore storage error
  }
  return [];
}

export function saveRitualDoneIds(userId: string, dateIso: string, ids: string[]): void {
  try {
    localStorage.setItem(doneKey(userId, dateIso), JSON.stringify(ids));
  } catch {
    // ignore storage error
  }
}
