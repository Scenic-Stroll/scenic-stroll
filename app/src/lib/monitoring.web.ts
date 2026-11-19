// Crash and error reports for the web app, with Sentry (free tier). DECISIONS D47.
// Off unless EXPO_PUBLIC_SENTRY_DSN is set (a DSN is public: it only says where reports go).
// Personal data is removed before anything leaves the browser: no IP address or user id, no
// query strings, and anything that looks like a map coordinate becomes "[coord]".
import { scrubText } from '@scenic/shared';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function startMonitoring(): void {
  if (__DEV__ || !DSN) return;
  // Loaded only when switched on, so the app stays small without it.
  void import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      // Sentry v11 collects these by default; we switch every one of them off.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      environment: location.hostname === 'scenic-stroll.expo.app' ? 'production' : 'preview',
      tracesSampleRate: 0, // errors only, no performance tracing
      beforeSend(event) {
        delete event.user;
        if (event.request) {
          event.request = { url: event.request.url && scrubText(event.request.url) };
        }
        if (event.message) event.message = scrubText(event.message);
        for (const ex of event.exception?.values ?? []) {
          if (ex.value) ex.value = scrubText(ex.value);
        }
        return event;
      },
      beforeBreadcrumb(crumb) {
        if (crumb.category === 'console') return null; // logs can contain places and routes
        if (crumb.message) crumb.message = scrubText(crumb.message);
        if (typeof crumb.data?.url === 'string') crumb.data.url = scrubText(crumb.data.url);
        if (typeof crumb.data?.from === 'string') crumb.data.from = scrubText(crumb.data.from);
        if (typeof crumb.data?.to === 'string') crumb.data.to = scrubText(crumb.data.to);
        return crumb;
      },
    });
  });
}
