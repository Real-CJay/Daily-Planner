// Server-side serverless handler (Vercel / Node). Never import this inside src/.
declare const process: { env: Record<string, string | undefined> };
interface CoachRequestBody {
  mode?: 'CHAT' | 'WEEKLY_REVIEW';
  message?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  context?: Record<string, unknown>;
  weeklySummary?: Record<string, unknown>;
  preferredModel?: string;
}

const SYSTEM_INSTRUCTION = `You are a grounded, conservative running coach.
Rules:
1. Base EVERY number strictly on the verified JSON context provided. NEVER invent missing splits, heart rate, sleep hours, or personal bests.
2. Strictly separate running mileage/pace from non-running commitments (Karate, Vocal, Drumming, University). Karate contributes physical load/fatigue, NEVER running distance.
3. Distinguish clearly between Confirmed Personal Bests, Fastest Logged Runs, Riegel Estimates, and Planned targets.
4. If pain is flagged in recent runs or readiness check-ins, prioritize safety, pain-free recovery, and medical/physio assessment over pace or volume targets.
5. Keep replies concise, structured, and actionable.`;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(503)
      .json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const body = (req.body ?? {}) as CoachRequestBody;
  const model = body.preferredModel || 'gemini-2.5-flash';
  const mode = body.mode || 'CHAT';

  const contextBlock = JSON.stringify(
    {
      mode,
      verifiedAthleteContext: body.context ?? {},
      weeklySummary: body.weeklySummary ?? null,
    },
    null,
    2
  );

  const historyText = (body.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Athlete' : 'Coach'}: ${m.content}`)
    .join('\n');

  const userPrompt =
    mode === 'WEEKLY_REVIEW'
      ? `Write a concise, structured Monday-to-Sunday training review (3 short sections: Key Wins, Load & Recovery Balance, Focus for Next Week) strictly using this verified data:\n\n${contextBlock}`
      : `Verified Athlete Data:\n${contextBlock}\n\nRecent Conversation:\n${historyText || '(none)'}\n\nAthlete Question:\n${body.message ?? ''}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 700,
        },
      }),
    });

    if (!upstream.ok) {
      const errDetail = await upstream.text();
      return res.status(upstream.status).json({ error: errDetail });
    }

    const data = (await upstream.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'No reply returned from Gemini.' });
    }

    return res.status(200).json({ reply, model });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Unexpected server error.',
    });
  }
}