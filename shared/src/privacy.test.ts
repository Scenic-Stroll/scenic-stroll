import { describe, expect, it } from 'vitest';

import { anonymiseUrl, scrubText } from './privacy.ts';

describe('scrubText (error reports)', () => {
  it('removes coordinates', () => {
    expect(scrubText('No route from 22.3375,114.1729 to 22.33612, 114.17208')).toBe(
      'No route from [coord],[coord] to [coord], [coord]',
    );
  });

  it('keeps ordinary numbers', () => {
    expect(scrubText('HTTP 502 after 1.5 s, 3 retries')).toBe('HTTP 502 after 1.5 s, 3 retries');
  });

  it('removes query strings and ids in addresses', () => {
    expect(scrubText('GET https://x.supabase.co/functions/v1/geocode?q=Festival+Walk failed')).toBe(
      'GET https://x.supabase.co/functions/v1/geocode failed',
    );
    expect(scrubText('/friend/6f1c2a9e-1111-4222-8333-944455556666 crashed')).toBe(
      '/friend/[id] crashed',
    );
  });
});

describe('anonymiseUrl (visit counts)', () => {
  it('counts every friend page as one page', () => {
    expect(anonymiseUrl('https://scenic-stroll.expo.app/friend/abc-123')).toBe(
      'https://scenic-stroll.expo.app/friend/[id]',
    );
    expect(anonymiseUrl('/recording/42?from=review#top')).toBe('/recording/[id]');
  });

  it('leaves other pages alone', () => {
    expect(anonymiseUrl('https://scenic-stroll.expo.app/privacy')).toBe(
      'https://scenic-stroll.expo.app/privacy',
    );
  });
});
