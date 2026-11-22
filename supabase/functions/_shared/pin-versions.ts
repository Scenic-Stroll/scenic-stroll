// The prompt for generate-pin-versions and the check of the model's answer (D53).
// The model only rewrites what the expert wrote: same facts, three reading levels, plus questions.
import {
  CHILD_TARGET_WORDS,
  GeneratedVersionsSchema,
  type GeneratedVersions,
} from './scenic/pin-api.ts';

export type PinForPrompt = {
  title: string;
  summary: string;
  beyond_hk_text: string | null;
  sources: { title: string; url: string; doi: string | null }[];
};

export function buildPrompt(pin: PinForPrompt): string {
  const sources = pin.sources
    .map((s, i) => `${i + 1}. ${s.title} — ${s.doi ? `doi:${s.doi}` : s.url}`)
    .join('\n');
  return `You write short reading versions of a "knowledge pin": a note about a place in Hong Kong that
people read after walking past it. An expert wrote the summary below from the listed sources.

RULES — follow all of them:
- Use ONLY facts stated in the SUMMARY (and the "beyond Hong Kong" line if given). Do not add any new
  facts, names, numbers, dates or claims, even if you believe them to be true. If something is not in
  the summary, leave it out.
- Do not mention the sources' titles or the expert. Do not give advice or opinions.
- Write three versions with the same facts:
  * "child": ages 8–11, very simple words and short sentences, at most ${CHILD_TARGET_WORDS} words.
  * "teen": ages 12–17, clear and lively, at most 150 words.
  * "adult": precise and complete, at most 220 words.
- For each version write 1 or 2 multiple-choice questions whose answer is in that version's text:
  2–4 options, exactly one correct; "answer" must be copied exactly from "options"; "explanation"
  says in one or two sentences why, using only the text.
- Answer with JSON only, in exactly this shape:
{"versions":[{"reading_level":"child","body":"…","questions":[{"prompt":"…","options":["…","…"],"answer":"…","explanation":"…"}]},
 {"reading_level":"teen", …}, {"reading_level":"adult", …}]}

TITLE: ${pin.title}

SUMMARY (the only facts you may use):
${pin.summary}
${pin.beyond_hk_text ? `\nBEYOND HONG KONG (may also be used):\n${pin.beyond_hk_text}\n` : ''}
SOURCES the expert used (for context only):
${sources}`;
}

/** The model's answer checked against the schema; a readable error if it doesn't fit. */
export function parseGenerated(
  raw: unknown,
): { ok: true; value: GeneratedVersions } | { ok: false; error: string } {
  const parsed = GeneratedVersionsSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: `${issue?.path.join('.') || 'answer'}: ${issue?.message}` };
}
