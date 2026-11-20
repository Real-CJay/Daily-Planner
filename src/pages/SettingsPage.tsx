import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Card, PageHeader } from '@/design-system';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/modules/auth/AuthContext';

export function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [preferredModel, setPreferredModel] = useState('gemini-4-hydrogen');
  const [consentAck, setConsentAck] = useState(false);
  const [shareNotes, setShareNotes] = useState(true);
  const [shareRecovery, setShareRecovery] = useState(true);
  const [shareKarate, setShareKarate] = useState(true);
  const [shareCommitments, setShareCommitments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setTimezone(profile.timezone);
    setAiEnabled(profile.ai_enabled);
    setPreferredModel(profile.ai_preferred_model);
    setConsentAck(profile.ai_privacy_consent_acknowledged);
    setShareNotes(profile.ai_share_notes);
    setShareRecovery(profile.ai_share_recovery);
    setShareKarate(profile.ai_share_karate);
    setShareCommitments(profile.ai_share_commitments);
  }, [profile]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    if (aiEnabled && !consentAck) {
      setError('Please acknowledge the free-tier Gemini privacy disclosure before enabling AI.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        display_name: displayName.trim() || null,
        timezone: timezone.trim() || 'Asia/Colombo',
        ai_enabled: aiEnabled,
        ai_preferred_model: preferredModel.trim() || 'gemini-4-hydrogen',
        ai_privacy_consent_acknowledged: consentAck,
        ai_share_notes: shareNotes,
        ai_share_recovery: shareRecovery,
        ai_share_karate: shareKarate,
        ai_share_commitments: shareCommitments,
      })
      .eq('user_id', user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await refreshProfile();
    setMessage('Settings saved to Supabase.');
  }

  return (
    <div>
      <PageHeader
        title="Settings & AI Privacy Controls"
        subtitle="Workspace preferences, timezone configuration, and Gemini free-tier controls."
      />

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900">Profile &amp; Calendar Defaults</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-slate-700">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-slate-700">
                Timezone (Week starts Monday)
              </label>
              <input
                id="timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Gemini AI Configuration</h2>
              <p className="mt-1 text-sm text-slate-600">
                All deterministic analytics, logs, and adaptive planning remain fully functional
                when AI is disabled.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-slate-400" />
          </div>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            <strong>Free-Tier Privacy Disclosure:</strong> Google Gemini Developer API free-tier
            terms may permit submitted prompts and screenshots to be used by Google for product
            improvement. Never silently routes to paid endpoints.
          </div>

          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={consentAck}
                onChange={(e) => setConsentAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-run focus:ring-blue-600"
              />
              <span>I acknowledge the Gemini free-tier terms and data handling notice.</span>
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-slate-900">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={(e) => setAiEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-run focus:ring-blue-600"
              />
              <span>Enable Gemini AI features (screenshot extraction, run analysis, AI coach)</span>
            </label>

            <div>
              <label htmlFor="preferredModel" className="block text-sm font-medium text-slate-700">
                Preferred Gemini Model
              </label>
              <input
                id="preferredModel"
                type="text"
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">
                Live model verification against your API project will be wired in Stage 3 &amp; Stage 7.
              </p>
            </div>

            <fieldset className="border-t border-slate-200 pt-4">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Context Permitted for Gemini Requests
              </legend>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {[
                  { label: 'Session notes', checked: shareNotes, set: setShareNotes },
                  { label: 'Recovery check-ins', checked: shareRecovery, set: setShareRecovery },
                  { label: 'Karate sessions', checked: shareKarate, set: setShareKarate },
                  { label: 'Schedule commitments', checked: shareCommitments, set: setShareCommitments },
                ].map((item) => (
                  <label key={item.label} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.set(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-run focus:ring-blue-600"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>
    </div>
  );
}