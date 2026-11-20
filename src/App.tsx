import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/modules/auth/AuthContext';
import { AuthPage } from '@/modules/auth/AuthPage';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StagePlaceholderPage } from '@/pages/StagePlaceholderPage';

function AuthenticatedWorkspace() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route
          path="/runs"
          element={
            <StagePlaceholderPage
              title="Running Log"
              subtitle="Manual entry, screenshot imports, splits, and searchable running history."
              stageLabel="Stage 2 & Stage 3"
              summary="Manual running entry, deterministic pace math, historical August 2026 baseline import, and run detail pages will be implemented in Stage 2; Gemini screenshot extraction follows in Stage 3."
            />
          }
        />
        <Route
          path="/plan"
          element={
            <StagePlaceholderPage
              title="Training Plan"
              subtitle="Rolling 7-day plan and adaptive Next Run recommendations."
              stageLabel="Stage 6"
              summary="The three-part adaptive training engine, evidence-based phases, and non-silent plan adjustments will be implemented in Stage 6."
            />
          }
        />
        <Route
          path="/calendar"
          element={
            <StagePlaceholderPage
              title="Unified Training Calendar"
              subtitle="Running, karate, rest days, vocal practice, drumming, and university commitments."
              stageLabel="Stage 4"
              summary="Monthly, weekly, and agenda calendar views with category filters, recurring schedules, readiness check-ins, and rest-day tracking will be implemented in Stage 4."
            />
          }
        />
        <Route
          path="/analytics"
          element={
            <StagePlaceholderPage
              title="Performance Analytics"
              subtitle="Weekly distance, pace progression, 5K trajectory, consistency, and activity overview."
              stageLabel="Stage 5"
              summary="Interactive Recharts analytics strictly separating running metrics from overall physical and non-physical commitments will be implemented in Stage 5."
            />
          }
        />
        <Route
          path="/coach"
          element={
            <StagePlaceholderPage
              title="AI Running Coach"
              subtitle="Context-aware coaching grounded in recorded Supabase data."
              stageLabel="Stage 7"
              summary="Persistent conversational coaching using compact verified context and server-side Gemini calls will be implemented in Stage 7."
            />
          }
        />
        <Route
          path="/personal-bests"
          element={
            <StagePlaceholderPage
              title="Personal Bests & Milestones"
              subtitle="1K, 3K, 5K, and 10K verified results and goal progression."
              stageLabel="Stage 5"
              summary="Explicit tracking distinguishing Confirmed Personal Bests, Fastest Logged Results, Estimated Performances, and Goal Targets will be implemented in Stage 5."
            />
          }
        />
        <Route
          path="/weekly-review"
          element={
            <StagePlaceholderPage
              title="Weekly Training Review"
              subtitle="Monday-to-Sunday summary in Asia/Colombo time."
              stageLabel="Stage 7"
              summary="Deterministic weekly summaries paired with optional cached Gemini narrative reviews will be implemented in Stage 7."
            />
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedWorkspace />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;