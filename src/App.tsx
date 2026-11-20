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
import { TrainingPlanPage } from '@/pages/TrainingPlanPage';
import { CoachPage } from '@/pages/CoachPage';
import { WeeklyReviewPage } from '@/pages/WeeklyReviewPage';
import { SettingsPage } from '@/pages/SettingsPage';

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
        <Route path="/plan" element={<TrainingPlanPage />} />
        <Route path="/coach" element={<CoachPage />} />
        <Route path="/weekly-review" element={<WeeklyReviewPage />} />
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