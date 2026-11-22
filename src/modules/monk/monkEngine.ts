import { addDaysIso, buildDateRange } from '@/modules/calendar/scheduleEngine';
import type { ActivityCategory } from '@/types/domain';

export type CommitmentTier = 'NON_NEGOTIABLE' | 'NEGOTIABLE';

export interface PlannerCommitment {
  id: string;
  title: string;
  category: ActivityCategory;
  tier: CommitmentTier;
  targetMinutes: number | null;
  createdAt: string;
}

export interface MonkModeSession {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  plannedDays: number;
  lockedCommitmentIds: string[];
  lockedCommitmentTitles: string[];
  status: 'ACTIVE' | 'COMPLETED' | 'ENDED_EARLY';
  endedAtDate: string | null;
  earlyExitReason: string | null;
  createdAt: string;
}

export interface MonkDayPoint {
  date: string;
  compliant: boolean;
  score: number;
}

export interface MonkModeReport {
  sessionId: string;
  title: string;
  status: MonkModeSession['status'];
  plannedDays: number;
  elapsedDays: number;
  remainingDays: number;
  compliantDays: number;
  brokenDays: number;
  compliancePct: number;
  rawScore: number;
  earlyExitPenalty: number;
  finalScore: number;
  earlyExitReason: string | null;
  curve: MonkDayPoint[];
}

export interface PlannerDisciplineStore {
  commitments: PlannerCommitment[];
  /** Map of YYYY-MM-DD -> array of completed commitment IDs */
  completionsByDate: Record<string, string[]>;
  activeMonk: MonkModeSession | null;
  pastMonkSessions: MonkModeSession[];
}

const DEFAULT_STORE: PlannerDisciplineStore = {
  commitments: [
    {
      id: 'nn-vocal-30',
      title: '30 min Vocal Practice',
      category: 'VOCAL',
      tier: 'NON_NEGOTIABLE',
      targetMinutes: 30,
      createdAt: '2026-01-01',
    },
    {
      id: 'nn-clean-diet',
      title: 'Zero added sugar & clean meals',
      category: 'RECOVERY',
      tier: 'NON_NEGOTIABLE',
      targetMinutes: null,
      createdAt: '2026-01-01',
    },
  ],
  completionsByDate: {},
  activeMonk: null,
  pastMonkSessions: [],
};

function storageKey(userId: string): string {
  return `stride:discipline:${userId}`;
}

export function loadDisciplineStore(userId: string): PlannerDisciplineStore {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return structuredClone(DEFAULT_STORE);
    const parsed = JSON.parse(raw) as Partial<PlannerDisciplineStore>;
    return {
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments : DEFAULT_STORE.commitments,
      completionsByDate: parsed.completionsByDate ?? {},
      activeMonk: parsed.activeMonk ?? null,
      pastMonkSessions: Array.isArray(parsed.pastMonkSessions) ? parsed.pastMonkSessions : [],
    };
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveDisciplineStore(userId: string, store: PlannerDisciplineStore): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

export function isCommitmentLocked(
  commitment: PlannerCommitment,
  activeMonk: MonkModeSession | null
): boolean {
  if (!activeMonk || activeMonk.status !== 'ACTIVE') return false;
  return (
    commitment.tier === 'NON_NEGOTIABLE' &&
    activeMonk.lockedCommitmentIds.includes(commitment.id)
  );
}

/**
 * Evaluates a Monk Mode session using an exponential compounding curve:
 * - Starts at 1.00
 * - Each compliant day (all locked non-negotiables completed): score *= 1.01
 * - Each broken day: score *= 0.99
 * - Early exit applies a proportional penalty based on remaining days / plannedDays.
 */
export function evaluateMonkModeReport(
  session: MonkModeSession,
  completionsByDate: Record<string, string[]>,
  referenceTodayIso: string
): MonkModeReport {
  const effectiveEnd =
    session.status === 'ENDED_EARLY' && session.endedAtDate
      ? session.endedAtDate
      : session.status === 'COMPLETED'
        ? session.endDate
        : referenceTodayIso < session.endDate
          ? referenceTodayIso
          : session.endDate;

  const dates =
    effectiveEnd >= session.startDate ? buildDateRange(session.startDate, effectiveEnd) : [];

  let score = 1.0;
  let compliantDays = 0;
  let brokenDays = 0;
  const curve: MonkDayPoint[] = [];

  for (const date of dates) {
    const doneIds = new Set(completionsByDate[date] ?? []);
    const allDone =
      session.lockedCommitmentIds.length > 0 &&
      session.lockedCommitmentIds.every((id) => doneIds.has(id));

    if (allDone) {
      compliantDays++;
      score = Number((score * 1.01).toFixed(4));
    } else {
      brokenDays++;
      score = Number((score * 0.99).toFixed(4));
    }

    curve.push({ date, compliant: allDone, score });
  }

  const elapsedDays = dates.length;
  const remainingDays = Math.max(0, session.plannedDays - elapsedDays);
  const compliancePct = elapsedDays > 0 ? Math.round((compliantDays / elapsedDays) * 100) : 0;

  const rawScore = Number(score.toFixed(4));
  let earlyExitPenalty = 0;
  if (session.status === 'ENDED_EARLY' && session.plannedDays > 0 && remainingDays > 0) {
    const remainingRatio = remainingDays / session.plannedDays;
    earlyExitPenalty = Number((rawScore * remainingRatio * 0.35).toFixed(4));
  }

  const finalScore = Math.max(0, Number((rawScore - earlyExitPenalty).toFixed(4)));

  return {
    sessionId: session.id,
    title: session.title,
    status: session.status,
    plannedDays: session.plannedDays,
    elapsedDays,
    remainingDays,
    compliantDays,
    brokenDays,
    compliancePct,
    rawScore,
    earlyExitPenalty,
    finalScore,
    earlyExitReason: session.earlyExitReason,
    curve,
  };
}

export function createMonkModeSession(params: {
  title: string;
  startDate: string;
  plannedDays: number;
  nonNegotiables: PlannerCommitment[];
}): MonkModeSession {
  const days = Math.max(3, Math.min(365, Math.round(params.plannedDays)));
  return {
    id: `monk-${Date.now()}`,
    title: params.title.trim() || `${days}-Day Monk Mode`,
    startDate: params.startDate,
    endDate: addDaysIso(params.startDate, days - 1),
    plannedDays: days,
    lockedCommitmentIds: params.nonNegotiables.map((c) => c.id),
    lockedCommitmentTitles: params.nonNegotiables.map((c) => c.title),
    status: 'ACTIVE',
    endedAtDate: null,
    earlyExitReason: null,
    createdAt: new Date().toISOString(),
  };
}
