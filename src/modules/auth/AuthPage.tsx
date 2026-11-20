import { useState, type FormEvent } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Button, Card } from '@/design-system';

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        setNotice(
          'Account created. If email confirmation is enabled in your Supabase project, check your inbox before signing in.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-run text-white">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Running Rebuild</h1>
            <p className="text-xs text-slate-500">Personal Training &amp; Recovery Workspace</p>
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Supabase environment not configured</p>
                <p className="mt-1">
                  Copy <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">.env.example</code>{' '}
                  to <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">.env</code>, add your{' '}
                  <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
                  <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>, then restart Vite.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="mb-5 flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {notice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {notice}
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting
                  ? 'Please wait...'
                  : mode === 'signin'
                    ? 'Sign In to Workspace'
                    : 'Create Personal Account'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}