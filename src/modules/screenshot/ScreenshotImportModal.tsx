import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileText,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button, Card, ProvenanceBadge } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { formatPace, parseDurationToSeconds } from '@/modules/running/calculations';
import {
  parseWorkoutTextToDraft,
  recognizeWorkoutFromImage,
  type ScreenshotExtractionResult,
} from './parser';
import {
  WORKOUT_TYPE_LABELS,
  type RunningSessionDraft,
  type SplitDraft,
  type WorkoutType,
} from '@/types/domain';

interface EditableSplitRow {
  distanceKm: string;
  durationStr: string;
  isPartial: boolean;
  avgHr: string;
}

export function ScreenshotImportModal({
  timezone,
  onClose,
  onSave,
}: {
  timezone: string;
  onClose: () => void;
  onSave: (draft: RunningSessionDraft) => Promise<void>;
}) {
  const today = getLocalDateString(new Date(), timezone);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [extraction, setExtraction] = useState<ScreenshotExtractionResult | null>(null);
  const [pasteText, setPasteText] = useState('');

  // Editable verified form state
  const [sessionDate, setSessionDate] = useState(today);
  const [distanceKm, setDistanceKm] = useState('');
  const [durationStr, setDurationStr] = useState('');
  const [workoutType, setWorkoutType] = useState<WorkoutType>('EASY');
  const [isIndoor, setIsIndoor] = useState(false);
  const [avgHr, setAvgHr] = useState('');
  const [cadence, setCadence] = useState('');
  const [elevation, setElevation] = useState('');
  const [rpe, setRpe] = useState('');
  const [notes, setNotes] = useState('');
  const [splits, setSplits] = useState<EditableSplitRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyExtraction(result: ScreenshotExtractionResult) {
    setExtraction(result);
    setSessionDate(result.draft.session_date);
    setDistanceKm(result.distanceKmInput);
    setDurationStr(result.durationInput);
    setWorkoutType(result.draft.workout_type);
    setIsIndoor(result.draft.is_indoor);
    setAvgHr(result.draft.avg_hr_bpm ? String(result.draft.avg_hr_bpm) : '');
    setCadence(result.draft.cadence_spm ? String(result.draft.cadence_spm) : '');
    setElevation(
      result.draft.elevation_gain_m !== null ? String(result.draft.elevation_gain_m) : ''
    );
    setNotes(result.draft.notes ?? '');
    setSplits(
      result.draft.splits.map((s) => ({
        distanceKm: (s.distance_m / 1000).toFixed(2),
        durationStr: `${Math.floor(s.duration_s / 60)}:${String(s.duration_s % 60).padStart(
          2,
          '0'
        )}`,
        isPartial: s.is_partial,
        avgHr: s.avg_hr_bpm ? String(s.avg_hr_bpm) : '',
      }))
    );
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setRecognizing(true);
    setOcrProgress(0);

    try {
      const result = await recognizeWorkoutFromImage(file, today, (pct) => {
        setOcrProgress(pct);
      });
      applyExtraction(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? `OCR failed: ${err.message}. You can paste text below or enter metrics manually.`
          : 'OCR failed. You can paste workout text below.'
      );
    } finally {
      setRecognizing(false);
    }
  }

  function handleParsePastedText() {
    if (!pasteText.trim()) return;
    setError(null);
    const result = parseWorkoutTextToDraft(pasteText, today);
    applyExtraction(result);
  }

  const livePace = useMemo(() => {
    const meters = Math.round(Number(distanceKm) * 1000);
    const seconds = parseDurationToSeconds(durationStr);
    if (!meters || !seconds) return 'Enter distance & duration';
    return formatPace(meters, seconds);
  }, [distanceKm, durationStr]);

  async function handleConfirmSave(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const distanceM = Math.round(Number(distanceKm) * 1000);
    const durationS = parseDurationToSeconds(durationStr);

    if (!Number.isFinite(distanceM) || distanceM < 100) {
      setError('Confirm a valid distance (at least 0.10 km).');
      return;
    }
    if (!durationS) {
      setError('Confirm a valid duration in mm:ss or h:mm:ss format.');
      return;
    }

    const verifiedSplits: SplitDraft[] = [];
    for (let i = 0; i < splits.length; i++) {
      const row = splits[i];
      const splitDistM = Math.round(Number(row.distanceKm) * 1000);
      const splitDurS = parseDurationToSeconds(row.durationStr);
      if (!splitDistM || !splitDurS) {
        setError(`Split #${i + 1}: enter valid distance (km) and duration (mm:ss).`);
        return;
      }
      verifiedSplits.push({
        split_index: i + 1,
        distance_m: splitDistM,
        duration_s: splitDurS,
        is_partial: row.isPartial || splitDistM !== 1000,
        avg_hr_bpm: row.avgHr.trim() ? Number(row.avgHr) : null,
      });
    }

    const draft: RunningSessionDraft = {
      session_date: sessionDate,
      start_time: null,
      distance_m: distanceM,
      duration_s: durationS,
      workout_type: workoutType,
      is_indoor: isIndoor || workoutType === 'TREADMILL',
      avg_hr_bpm: avgHr.trim() ? Number(avgHr) : null,
      max_hr_bpm: null,
      cadence_spm: cadence.trim() ? Number(cadence) : null,
      elevation_gain_m: elevation.trim() ? Number(elevation) : null,
      rpe: rpe.trim() ? Number(rpe) : null,
      energy_level: null,
      muscle_soreness: null,
      pain_present: false,
      pain_details: null,
      conditions: isIndoor || workoutType === 'TREADMILL' ? 'Indoor / Treadmill' : null,
      notes: notes.trim() ? notes.trim() : null,
      entry_method: 'SCREENSHOT',
      is_historical_record: false,
      splits: verifiedSplits,
    };

    try {
      setSubmitting(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save imported run.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/45 p-4">
      <Card className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto p-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-blue-700" />
              <h2 className="text-lg font-semibold text-slate-900">
                Import Workout from Screenshot
              </h2>
              <ProvenanceBadge origin="RECORDED" />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Extract candidate metrics from a running watch or app screenshot, verify every field
              below, and save only confirmed data.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close screenshot import"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload & Fallback Text Parser */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/30">
              <Upload className="h-6 w-6 text-blue-700" />
              <span className="mt-2 text-sm font-semibold text-slate-900">
                Choose screenshot image (PNG, JPG, WEBP)
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Runs local OCR in your browser — no secret keys sent to client
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handleFileChange(e)}
                className="sr-only"
              />
            </label>

            {recognizing && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex justify-between text-xs font-medium text-blue-900">
                  <span>Recognizing workout text...</span>
                  <span className="font-mono">{ocrProgress ?? 0}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-blue-100">
                  <div
                    style={{ width: `${ocrProgress ?? 0}%` }}
                    className="h-full rounded-full bg-blue-700 transition-all"
                  />
                </div>
              </div>
            )}

            {previewUrl && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                <img
                  src={previewUrl}
                  alt="Uploaded workout screenshot"
                  className="max-h-56 w-full object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Or Paste OCR / Watch Summary Text</span>
              </div>
              <textarea
                rows={5}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Example:\nAug 13, 2026 · Progression Run\nDistance: 5.00 km · Time: 28:10'}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-900"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={handleParsePastedText}
                disabled={!pasteText.trim()}
              >
                <span>Extract from Text</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Extraction Warnings & Raw OCR Preview */}
        {extraction && (
          <div className="mt-5 space-y-3">
            {extraction.warnings.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Items Requiring Your Verification</span>
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {extraction.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Core metrics extracted — review and confirm before saving.</span>
              </div>
            )}

            {extraction.rawText && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs">
                <summary className="cursor-pointer font-medium text-slate-600">
                  View raw OCR text ({extraction.rawText.length} chars)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-700">
                  {extraction.rawText}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Verification & Save Form */}
        <form onSubmit={handleConfirmSave} className="mt-6 space-y-5 border-t border-slate-200 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Verify &amp; Confirm Extracted Fields
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Distance (km) *</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                placeholder="5.00"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Duration (mm:ss) *
              </label>
              <input
                type="text"
                required
                placeholder="28:10"
                value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-medium text-slate-500">Calculated Pace</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-blue-700 tabular-nums">
                {livePace}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-slate-700">Workout Type</label>
              <select
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(WORKOUT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Avg HR (bpm)</label>
              <input
                type="number"
                min="30"
                max="240"
                placeholder="—"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Cadence (spm)</label>
              <input
                type="number"
                min="80"
                max="250"
                placeholder="—"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Elevation (m)</label>
              <input
                type="number"
                min="0"
                placeholder="—"
                value={elevation}
                onChange={(e) => setElevation(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">RPE (1–10)</label>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="—"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isIndoor || workoutType === 'TREADMILL'}
                onChange={(e) => setIsIndoor(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>Indoor / Treadmill</span>
            </label>
          </div>

          {/* Splits Editor */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Extracted Splits ({splits.length})
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSplits((prev) => [
                    ...prev,
                    { distanceKm: '1.00', durationStr: '', isPartial: false, avgHr: '' },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                <span>Add Split</span>
              </Button>
            </div>

            {splits.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {splits.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="col-span-2 pl-1 font-mono text-xs font-medium text-slate-600">
                      Split {idx + 1}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0.05"
                        value={row.distanceKm}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, distanceKm: e.target.value } : r
                            )
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="mm:ss"
                        value={row.durationStr}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, durationStr: e.target.value } : r
                            )
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="HR"
                        value={row.avgHr}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, avgHr: e.target.value } : r))
                          )
                        }
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove split ${idx + 1}`}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Confirm & Save Run'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}