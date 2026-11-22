// Removing personal data from what we send to outside services: error reports (Sentry) and
// visit counts (Umami). Used by the web app (DECISIONS D47) and the Edge Functions.

/** Numbers with 4+ decimals are almost always coordinates (4 decimals ≈ 10 m). */
const COORDINATE = /-?\d{1,3}\.\d{4,}/g;
/** Friend and recording ids in addresses. */
const ID_IN_PATH = /\/(friend|recording)\/[^/?#\s]+/g;
/** Query strings and #fragments can hold searched places or tokens. */
const QUERY = /[?#][^\s]*/g;

/** Text for an error report: no query strings, ids in addresses or coordinates. */
export function scrubText(text: string): string {
  return text.replace(QUERY, '').replace(ID_IN_PATH, '/$1/[id]').replace(COORDINATE, '[coord]');
}

/** A page address for visit counts: every friend/recording page counts as one page. */
export function anonymiseUrl(url: string): string {
  return url.replace(QUERY, '').replace(ID_IN_PATH, '/$1/[id]');
}
