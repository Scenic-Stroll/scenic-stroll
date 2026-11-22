// One call to Google's Gemini API asking for JSON (D53). Gemini is the provider the project chose
// for AI text (docs/SETUP.md §7). The key is a Supabase secret (GEMINI_API_KEY) and goes in a
// header — never in the address, the app or git.
const TIMEOUT_MS = 60_000;

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export class LlmError extends Error {}

export async function generateJson(args: {
  apiKey: string;
  model: string;
  prompt: string;
  fetchFn?: typeof fetch;
}): Promise<unknown> {
  const fetchFn = args.fetchFn ?? fetch;
  const res = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': args.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
        // Low temperature: stick to the given facts rather than being creative.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new LlmError(`Gemini error ${res.status}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new LlmError('Gemini returned no text');
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError('Gemini did not return valid JSON');
  }
}
