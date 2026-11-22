// Visit counts for the web app, with Umami (umami.is): no cookies, no cross-site tracking, no
// personal data — just page views and three events, so we can measure impact (DECISIONS D47).
// Off unless EXPO_PUBLIC_UMAMI_WEBSITE_ID is set (it's public: it only says which site to count).
import { anonymiseUrl } from '@scenic/shared';

import type { AnalyticsEvent } from './analytics';

export type { AnalyticsEvent } from './analytics';

const WEBSITE_ID = process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID;
const SCRIPT_URL = 'https://cloud.umami.is/script.js';

type Umami = { track: (event: string) => void };
declare global {
  interface Window {
    umami?: Umami;
    scenicUmamiBeforeSend?: (type: string, payload: { url?: string }) => unknown;
  }
}

export function startAnalytics(): void {
  if (__DEV__ || !WEBSITE_ID || document.querySelector(`script[src="${SCRIPT_URL}"]`)) return;
  window.scenicUmamiBeforeSend = (_type, payload) => ({
    ...payload,
    url: payload.url ? anonymiseUrl(payload.url) : payload.url,
  });
  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT_URL;
  script.dataset.websiteId = WEBSITE_ID;
  script.dataset.beforeSend = 'scenicUmamiBeforeSend';
  script.dataset.doNotTrack = 'true'; // respect the browser's "Do Not Track" setting
  document.head.appendChild(script);
}

export function track(event: AnalyticsEvent): void {
  // Before the script has loaded (or with analytics off) this does nothing — fine for counts.
  window.umami?.track(event);
}
