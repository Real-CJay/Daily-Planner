import { addDaysIso, buildDateRange } from '@/modules/calendar/scheduleEngine';
import { getMondayIso } from '@/modules/calendar/timelineEngine';
import type { ActivityCategory } from '@/types/domain';

export type CommitmentTier = 'NON_NEGOTIABLE' | 'NEGOTIABLE';

export interface PlannerCommitment {
  id: string;
  title: string;
  category: ActivityCategory;
  tier: CommitmentTier;
  targetMinutes: number | null;
  /** For NEGOTIABLE commitments: how many times per Mon-Sun week */
  targetPerWeek?: number | null;
  /** Optional preferred ISO weekdays (1=Mon .. 7=Sun) for planning convenience */
  intendedDays?: number[];
  createdAt: string;
}

export interface LockedNegotiableRule {
  id: string;
  title: string;
  targetPerWeek: number;
  intendedDays: number[];
}

export interface MonkModeSession {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  plannedDays: number;
  lockedCommitmentIds: string[];
  lockedCommitmentTitles: string[];
  lockedNegotiables?: LockedNegotiableRule[];
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

export interface WeeklyQuotaStatus {
  commitmentId: string;
  title: string;
  completed: number;
  required: number;
  passed: boolean;
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
  weeklyQuotasPassed: number;
  weeklyQuotasMissed: number;
  currentWeekQuotas: WeeklyQuotaStatus[];
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
    {
      id: 'neg-drums-3x',
      title: 'Drumming Practice',
      category: 'DRUMMING',
      tier: 'NEGOTIABLE',
      targetMinutes: 45,
      targetPerWeek: 3,
      intendedDays: [2, 4, 6],
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
  if (
    commitment.tier === 'NON_NEGOTIABLE' &&
    activeMonk.lockedCommitmentIds.includes(commitment.id)
  ) {
    return true;
  }
  return Boolean(activeMonk.lockedNegotiables?.some((n) => n.id === commitment.id));
}

export function getWeeklyCompletionCount(
  commitmentId: string,
  completionsByDate: Record<string, string[]>,
  referenceDateIso: string
): number {
  const monday = getMondayIso(referenceDateIso);
  const sunday = addDaysIso(monday, 6);
  const weekDates = buildDateRange(monday, sunday);
  let count = 0;
  for (const d of weekDates) {
    if ((completionsByDate[d] ?? []).includes(commitmentId)) {
      count++;
    }
  }
  return count;
}

/**
 * Evaluates a Monk Mode session:
 * - Daily Non-Negotiables: each compliant day *= 1.01, each broken day *= 0.99.
 * - Weekly Negotiables: evaluated per Mon-Sun week (not strict days). Skipping an
 *   intended day and completing it on another day in the same week counts as a PASS.
 *   Each closed week where count >= required *= 1.01; missed quota *= 0.99.
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
      session.lockedCommitmentIds.length === 0 ||
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

  // Evaluate flexible weekly quotas for locked negotiables
  const lockedNegotiables = session.lockedNegotiables ?? [];
  const weekBuckets = new Map<string, string[]>();
  for (const d of dates) {
    const mon = getMondayIso(d);
    const list = weekBuckets.get(mon) ?? [];
    list.push(d);
    weekBuckets.set(mon, list);
  }

  let weeklyQuotasPassed = 0;
  let weeklyQuotasMissed = 0;
  const currentWeekMonday = getMondayIso(referenceTodayIso);
  const currentWeekQuotas: WeeklyQuotaStatus[] = [];

  for (const [monday, weekDatesInSession] of weekBuckets.entries()) {
    const sunday = addDaysIso(monday, 6);
    const isClosedWeek =
      session.status !== 'ACTIVE' || sunday <= effectiveEnd;

    for (const rule of lockedNegotiables) {
      let completed = 0;
      for (const d of weekDatesInSession) {
        if ((completionsByDate[d] ?? []).includes(rule.id)) {
          completed++;
        }
      }
      const required = Math.min(rule.targetPerWeek, weekDatesInSession.length);
      const passed = completed >= required;

      if (monday === currentWeekMonday) {
        currentWeekQuotas.push({
          commitmentId: rule.id,
          title: rule.title,
          completed,
          required: rule.targetPerWeek,
          passed: completed >= rule.targetPerWeek,
        });
      }

      if (isClosedWeek) {
        if (passed) {
          weeklyQuotasPassed++;
          score = Number((score * 1.01).toFixed(4));
        } else {
          weeklyQuotasMissed++;
          score = Number((score * 0.99).toFixed(4));
        }
      }
    }
  }

  const elapsedDays = dates.length;
  const remainingDays = Math.max(0, session.plannedDays - elapsedDays);
  const totalChecks = elapsedDays + weeklyQuotasPassed + weeklyQuotasMissed;
  const totalPasses = compliantDays + weeklyQuotasPassed;
  const compliancePct = totalChecks > 0 ? Math.round((totalPasses / totalChecks) * 100) : 0;

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
    weeklyQuotasPassed,
    weeklyQuotasMissed,
    currentWeekQuotas,
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
  negotiables?: PlannerCommitment[];
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
    lockedNegotiables: (params.negotiables ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      targetPerWeek: Math.max(1, Math.min(7, n.targetPerWeek ?? 3)),
      intendedDays: n.intendedDays ?? [],
    })),
    status: 'ACTIVE',
    endedAtDate: null,
    earlyExitReason: null,
    createdAt: new Date().toISOString(),
  };
}
