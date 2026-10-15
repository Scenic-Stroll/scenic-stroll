// Tiny helpers shared by all Edge Functions: JSON responses and body validation.
// CORS and auth are handled by `withSupabase` from @supabase/server.
import type { z } from 'zod';

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** Our error shape: { error: "readable message" }. The app shows `error` to the user. */
export function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** Parses and validates a JSON body. Returns either the data or a 400 Response to send back. */
export async function readBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: errorResponse('Body must be JSON', 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'body';
    return { response: errorResponse(`Invalid ${where}: ${first?.message}`, 400) };
  }
  return { data: parsed.data };
}
