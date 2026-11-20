import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/modules/auth/AuthContext';
import { AuthPage } from '@/modules/auth/AuthPage';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { RunningLogPage } from '@/pages/RunningLogPage';
import { RunDetailPage } from '@/pages/RunDetailPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { PersonalBestsPage } from '@/pages/PersonalBestsPage';
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
        <Route path="/runs" element={<RunningLogPage />} />
        <Route path="/runs/:id" element={<RunDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/personal-bests" element={<PersonalBestsPage />} />
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