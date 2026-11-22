// POST /functions/v1/generate-pin-versions  { pin_id } → { saved: 3, model }
// Writes child / teen / adult reading versions with 1–2 questions each from the expert's summary and
// sources, using Gemini (GEMINI_API_KEY secret). Everything is saved as "in_review": a reviewer
// checks it before anyone reads it (D53, docs/PINS.md).
//
// Runs with the CALLER's rights (ctx.supabase): only the pin's author or an admin can read the pin
// and write its versions — the database's rules decide, not this function.
import { guarded, LIMITS } from '../_shared/guard.ts';
import { errorResponse, json, readBody } from '../_shared/http.ts';
import { DEFAULT_GEMINI_MODEL, generateJson, LlmError } from '../_shared/llm/gemini.ts';
import { buildPrompt, parseGenerated } from '../_shared/pin-versions.ts';
import {
  GenerateVersionsRequestSchema,
  GenerateVersionsResponseSchema,
} from '../_shared/scenic/pin-api.ts';

export default {
  fetch: guarded('generate-pin-versions', LIMITS.generatePinVersions, async (req, ctx) => {
    if (req.method === 'GET') {
      const missing = Deno.env.get('GEMINI_API_KEY') ? [] : ['GEMINI_API_KEY'];
      return json({
        ok: missing.length === 0,
        function: 'generate-pin-versions',
        missingSecrets: missing,
      });
    }
    if (req.method !== 'POST') return errorResponse('Use POST', 405);
    const body = await readBody(req, GenerateVersionsRequestSchema);
    if ('response' in body) return body.response;
    const db = ctx.supabase;

    const { data: pin } = await db
      .from('pins')
      .select('id, title, summary, beyond_hk_text')
      .eq('id', body.data.pin_id)
      .maybeSingle();
    if (!pin) return errorResponse('Pin not found, or not yours to edit', 404);
    if (!pin.summary) return errorResponse('Write the summary first', 400);
    const { data: sources } = await db
      .from('pin_sources')
      .select('title, url, doi')
      .eq('pin_id', pin.id);
    if (!sources || sources.length === 0)
      return errorResponse('Add at least one source first', 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return errorResponse(
        'AI versions are not set up yet (the team must add GEMINI_API_KEY)',
        503,
      );
    }
    const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const prompt = buildPrompt({ ...pin, sources });

    // One retry: models occasionally break the JSON shape.
    let result = parseGenerated(null);
    for (let attempt = 0; attempt < 2 && !result.ok; attempt++) {
      try {
        result = parseGenerated(await generateJson({ apiKey, model, prompt }));
      } catch (err) {
        console.error('generate-pin-versions: model call failed', err);
        if (err instanceof LlmError) return errorResponse('The AI service failed — try again', 502);
        throw err;
      }
      if (!result.ok) console.warn('generate-pin-versions: answer rejected:', result.error);
    }
    if (!result.ok)
      return errorResponse(`The AI answer didn't pass the checks (${result.error})`, 502);

    // Save each version (new, or replacing the text of an existing one) and its questions, all in review.
    const { data: existing } = await db
      .from('pin_versions')
      .select('id, reading_level')
      .eq('pin_id', pin.id);
    for (const v of result.value.versions) {
      const old = existing?.find((e) => e.reading_level === v.reading_level);
      const saved = old
        ? await db
            .from('pin_versions')
            .update({ body: v.body, status: 'in_review' })
            .eq('id', old.id)
            .select('id')
            .single()
        : await db
            .from('pin_versions')
            .insert({
              pin_id: pin.id,
              reading_level: v.reading_level,
              body: v.body,
              generated_by_ai: true,
            })
            .select('id')
            .single();
      if (saved.error || !saved.data) {
        console.error('generate-pin-versions: save failed', saved.error);
        return errorResponse('Could not save the versions (is the pin still a draft?)', 409);
      }
      const versionId = saved.data.id;
      await db.from('pin_questions').delete().eq('pin_version_id', versionId);
      const { error } = await db.from('pin_questions').insert(
        v.questions.map((q) => ({
          pin_version_id: versionId,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
        })),
      );
      if (error) {
        console.error('generate-pin-versions: questions failed', error);
        return errorResponse('Could not save the questions', 409);
      }
    }
    return json(
      GenerateVersionsResponseSchema.parse({ saved: result.value.versions.length, model }),
    );
  }),
};
