import https from 'node:https';

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
2. Strictly separate running mileage/pace from non-running commitments (Karate, Vocal, Drumming, Guitar, Keyboard, Strength, University). Non-running activities contribute physical load/fatigue, NEVER running distance.
3. Distinguish clearly between Confirmed Personal Bests, Fastest Logged Runs, Riegel Estimates, and Planned targets.
4. If pain is flagged in recent runs or readiness check-ins, prioritize safety, pain-free recovery, and medical/physio assessment over pace or volume targets.
5. Keep replies concise, structured, and actionable.`;

function postJsonIpv4(
  urlStr: string,
  payload: unknown,
  timeoutMs: number
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        family: 4, // Force IPv4 at the socket level
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 502,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function callGeminiModel(
  modelId: string,
  apiKey: string,
  userPrompt: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; reply?: string; error?: string }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelId
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await postJsonIpv4(
      endpoint,
      {
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 1200,
        },
      },
      timeoutMs
    );

    let parsed: {
      error?: { message?: string };
      candidates?: {
        content?: {
          parts?: { text?: string; thought?: boolean }[];
        };
      }[];
    } = {};

    try {
      parsed = upstream.body ? JSON.parse(upstream.body) : {};
    } catch {
      return {
        ok: false,
        status: upstream.status || 502,
        error: `Non-JSON response from Gemini (${upstream.status}): ${upstream.body.slice(0, 240)}`,
      };
    }

    if (upstream.status < 200 || upstream.status >= 300) {
      return {
        ok: false,
        status: upstream.status,
        error: parsed.error?.message || upstream.body.slice(0, 300) || `Gemini HTTP ${upstream.status}`,
      };
    }

    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    const reply = parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n')
      .trim();

    if (!reply) {
      return {
        ok: false,
        status: 502,
        error: `Empty response from ${modelId}.`,
      };
    }

    return { ok: true, status: 200, reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error calling Gemini.';
    const isTimeout = msg.toLowerCase().includes('timed out');
    return {
      ok: false,
      status: isTimeout ? 504 : 500,
      error: `${modelId}: ${msg}`,
    };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();

  if (!apiKey) {
    return res
      .status(503)
      .json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const body = (req.body ?? {}) as CoachRequestBody;
  const primaryModel =
    !body.preferredModel || body.preferredModel === 'gemini-2.5-flash'
      ? 'gemini-4-hydrogen'
      : body.preferredModel;
  const fallbackModel = 'gemini-3.8-flash';
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

  const primaryResult = await callGeminiModel(primaryModel, apiKey, userPrompt, 15000);
  if (primaryResult.ok && primaryResult.reply) {
    return res.status(200).json({ reply: primaryResult.reply, model: primaryModel });
  }

  if (primaryModel !== fallbackModel) {
    const fallbackResult = await callGeminiModel(fallbackModel, apiKey, userPrompt, 15000);
    if (fallbackResult.ok && fallbackResult.reply) {
      return res.status(200).json({
        reply: fallbackResult.reply,
        model: `${fallbackModel} (fallback from ${primaryModel})`,
      });
    }

    return res.status(fallbackResult.status || 502).json({
      error: `Primary (${primaryModel}): ${primaryResult.error} | Fallback (${fallbackModel}): ${fallbackResult.error}`,
    });
  }

  return res.status(primaryResult.status || 502).json({
    error: primaryResult.error || 'Gemini request failed.',
  });
}
