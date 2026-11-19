// Phones: no analytics. The web version is analytics.web.ts (DECISIONS D47).
export type AnalyticsEvent = 'route-planned' | 'route-recorded' | 'feedback-sent';

export function startAnalytics(): void {}

export function track(_event: AnalyticsEvent): void {}
