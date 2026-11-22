// Looks up a source for a pin from a DOI or a title (pin-tools, D53): OpenAlex first, then Crossref.
// Both are free scholarly databases with no key. Google Scholar is not used (no API, and its terms
// forbid automated queries).
import type { PinSource } from './scenic/pins.ts';

const TIMEOUT_MS = 8000;
const HEADERS = {
  'User-Agent': 'ScenicStroll/1.0 (https://github.com/Scenic-Stroll/scenic-stroll)',
};

/** "10.1234/abc", "doi:10.1234/abc" or "https://doi.org/10.1234/abc" → "10.1234/abc"; else null. */
export function extractDoi(text: string): string | null {
  const m = text.trim().match(/(10\.\d{4,9}\/\S+)$/i);
  return m ? m[1]!.replace(/[.,;)]+$/, '') : null;
}

// deno-lint-ignore no-explicit-any
type Json = any;

/** An OpenAlex "work" → our source, or null if it has no title or link. */
export function fromOpenAlex(work: Json): PinSource | null {
  const title = typeof work?.display_name === 'string' ? work.display_name.trim() : '';
  const doi = typeof work?.doi === 'string' ? extractDoi(work.doi) : null;
  const url: string | undefined =
    work?.open_access?.oa_url ??
    work?.primary_location?.landing_page_url ??
    (doi ? `https://doi.org/${doi}` : undefined) ??
    work?.id;
  if (title.length < 2 || typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  return {
    title: title.slice(0, 300),
    url,
    doi,
    source_db: 'openalex',
    is_open_access: work?.open_access?.is_oa === true,
  };
}

/** A Crossref "item" → our source. Crossref doesn't say whether it's open access. */
export function fromCrossref(item: Json): PinSource | null {
  const title =
    Array.isArray(item?.title) && typeof item.title[0] === 'string' ? item.title[0] : '';
  const doi = typeof item?.DOI === 'string' ? extractDoi(item.DOI) : null;
  const url: string | undefined = item?.URL ?? (doi ? `https://doi.org/${doi}` : undefined);
  if (title.trim().length < 2 || typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  return {
    title: title.trim().slice(0, 300),
    url,
    doi,
    source_db: 'crossref',
    is_open_access: false,
  };
}

async function getJson(fetchFn: typeof fetch, url: string): Promise<Json | null> {
  try {
    const res = await fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The best match for a DOI or a title, or null if neither database knows it. */
export async function lookupSource(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<PinSource | null> {
  const doi = extractDoi(query);
  const q = encodeURIComponent(doi ?? query.trim());

  const openAlex = doi
    ? await getJson(fetchFn, `https://api.openalex.org/works/doi:${q}`)
    : (await getJson(fetchFn, `https://api.openalex.org/works?search=${q}&per-page=1`))
        ?.results?.[0];
  const fromOa = openAlex ? fromOpenAlex(openAlex) : null;
  if (fromOa) return fromOa;

  const crossref = doi
    ? (await getJson(fetchFn, `https://api.crossref.org/works/${q}`))?.message
    : (await getJson(fetchFn, `https://api.crossref.org/works?query.bibliographic=${q}&rows=1`))
        ?.message?.items?.[0];
  return crossref ? fromCrossref(crossref) : null;
}
