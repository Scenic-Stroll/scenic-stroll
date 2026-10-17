/**
 * Road incidents and closures (multimodal step 5) from the Transport Department's "Special
 * Traffic News" feed: a small public XML file (no key) with English and Chinese text, updated as
 * incidents happen. Positions are often missing, so the app pins only the incidents that have one
 * and lists all of them.
 *
 * Feed checked 2026-10-18 (DATA.GOV.HK, free to reuse with attribution):
 *   https://www.td.gov.hk/en/special_news/trafficnews.xml
 * (The resource.data.gov.hk mirror refused connections that day, so we use the TD address.)
 *
 * The parser is a few regular expressions rather than an XML library: the file is flat (a list
 * of <message> elements with plain text fields) and React Native has no built-in XML parser.
 */
import type { LatLng } from './schemas.ts';

export const TRAFFIC_NEWS_URL = 'https://www.td.gov.hk/en/special_news/trafficnews.xml';

export type TrafficIncident = {
  id: string;
  heading_en: string;
  heading_zh: string;
  location_en: string;
  location_zh: string;
  district_en: string;
  direction_en: string;
  /** Full announcement text. */
  content_en: string;
  content_zh: string;
  /** ISO with +08:00 (the feed writes Hong Kong time without a zone). */
  announced_at: string | null;
  /** The feed's status word: NEW, UPDATED, CLOSED… */
  status: string;
  /** false once TD says it's over ("CLOSED") — we hide those. */
  active: boolean;
  point: LatLng | null;
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/** Text of `<tag>…</tag>` inside one message ('' when empty or missing). */
function field(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1]!
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTITIES[e]!)
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTrafficNews(xml: string): TrafficIncident[] {
  if (!/<list[\s>]/.test(xml)) throw new Error('Traffic news: unexpected answer');
  const messages = xml.match(/<message>[\s\S]*?<\/message>/g) ?? [];
  return messages.map((m): TrafficIncident => {
    const lat = Number.parseFloat(field(m, 'LATITUDE'));
    const lng = Number.parseFloat(field(m, 'LONGITUDE'));
    const date = field(m, 'ANNOUNCEMENT_DATE');
    const status = field(m, 'INCIDENT_STATUS_EN').toUpperCase();
    return {
      id: field(m, 'ID') || field(m, 'INCIDENT_NUMBER'),
      heading_en: field(m, 'INCIDENT_HEADING_EN'),
      heading_zh: field(m, 'INCIDENT_HEADING_CN'),
      location_en: field(m, 'LOCATION_EN'),
      location_zh: field(m, 'LOCATION_CN'),
      district_en: field(m, 'DISTRICT_EN'),
      direction_en: field(m, 'DIRECTION_EN'),
      content_en: field(m, 'CONTENT_EN'),
      content_zh: field(m, 'CONTENT_CN'),
      announced_at: /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(date) ? `${date.slice(0, 19)}+08:00` : null,
      status,
      active: status !== 'CLOSED',
      // Only trust a position that is inside Hong Kong (the feed sometimes leaves 0 or blanks).
      point:
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat > 22 &&
        lat < 23 &&
        lng > 113 &&
        lng < 115
          ? { lat, lng }
          : null,
    };
  });
}
