import { Activity, Calendar, HeartPulse, Target } from 'lucide-react';
import { Card, CategoryBadge, EmptyState, PageHeader, ProvenanceBadge, StatTile } from '@/design-system';
import { useAuth } from '@/modules/auth/AuthContext';
import { TRAINING_PHASE_LABELS } from '@/types/domain';
import { formatDurationSeconds, getLocalDateString, getMondayWeekStart } from '@/lib/datetime';

export function OverviewPage() {
  const { profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const weekStart = getMondayWeekStart(today);

  return (
    <div>
      <PageHeader
        title="Training Overview"
        subtitle={`Week starting ${weekStart} (${tz}) · ${
          profile ? TRAINING_PHASE_LABELS[profile.current_phase] : 'Phase 1 — Rebuilding'
        }`}
      />

      {/* Core Metric Tiles — zero fabricated defaults */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Weekly Running Distance"
          value="0.00 km"
          meta="No completed runs recorded this week"
          origin="RECORDED"
        />
        <StatTile
          label="Running Frequency"
          value="0 runs"
          meta="Completed runs this week"
          origin="RECORDED"
        />
        <StatTile
          label="Recent Running Pace"
          value="Unavailable"
          meta="Requires recorded running sessions"
          origin="MISSING"
        />
        <StatTile
          label="Recovery Status"
          value="Unavailable"
          meta="No recent readiness check-in recorded"
          origin="MISSING"
        />
      </div>

      {/* 5K Goals & Phase Card */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-brand-run" />
              <h2 className="text-sm font-semibold text-slate-900">5K Progression Targets</h2>
            </div>
            <ProvenanceBadge origin="MISSING" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Goals represent future targets, not current prescribed training paces.
          </p>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Immediate Focus</dt>
              <dd className="font-medium text-slate-900">
                {profile?.immediate_goal ?? 'Rebuild consistency & aerobic base'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">First Major 5K Goal</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                Sub-{formatDurationSeconds(profile?.first_major_5k_goal_s ?? 1200)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Long-Term 5K Goal</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums">
                {formatDurationSeconds(profile?.long_term_5k_goal_s ?? 1050)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-brand-recovery" />
              <h2 className="text-sm font-semibold text-slate-900">Activity Separation Model</h2>
            </div>
            <CategoryBadge category="RUNNING" />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Running statistics are strictly isolated from non-running commitments.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CategoryBadge category="RUNNING" />
            <CategoryBadge category="KARATE" />
            <CategoryBadge category="RECOVERY" />
            <CategoryBadge category="VOCAL" />
            <CategoryBadge category="DRUMMING" />
            <CategoryBadge category="UNIVERSITY" />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Completed karate sessions inform recovery and scheduling in Stage 4 &amp; Stage 6 without
            ever adding running mileage or affecting personal bests.
          </p>
        </Card>
      </div>

      {/* Empty States for Upcoming Modules */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No running sessions recorded yet"
          description="Manual run logging, historical August 2026 baseline import, and split tracking will be activated in Stage 2."
        />
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title="Upcoming schedule is empty"
          description="Recurring Wednesday/Friday karate, daily vocal practice, drumming, university blocks, and rest days will be configured in Stage 4."
        />
      </div>
    </div>
  );
}