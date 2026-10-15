import { describe, expect, it } from 'vitest';

import { LlmTaggingOutputSchema, TagSchema } from './schemas.ts';
import { TAG_GROUPS, TAGS, TAXONOMY, isTag, tagsInGroup } from './taxonomy.ts';

describe('taxonomy', () => {
  it('contains exactly the 30 tags from the spec', () => {
    expect(TAGS).toHaveLength(30);
  });

  it('every group from the spec has tags', () => {
    for (const group of TAG_GROUPS) {
      expect(tagsInGroup(group).length).toBeGreaterThan(0);
    }
  });

  it('every tag has English and Traditional Chinese labels and an icon', () => {
    for (const tag of TAGS) {
      const info = TAXONOMY[tag];
      expect(info.en.length).toBeGreaterThan(0);
      expect(info.zh).toMatch(/\p{Script=Han}/u);
      expect(info.icon.length).toBeGreaterThan(0);
    }
  });

  it('isTag accepts known tags and rejects unknown ones', () => {
    expect(isTag('step_free')).toBe(true);
    expect(isTag('wheelchair')).toBe(false);
    expect(isTag('toString')).toBe(false); // not fooled by Object.prototype
  });

  it('TagSchema rejects tags outside the vocabulary', () => {
    expect(TagSchema.safeParse('lift').success).toBe(true);
    expect(TagSchema.safeParse('teleporter').success).toBe(false);
  });
});

describe('LlmTaggingOutputSchema', () => {
  it('accepts the output shape from the spec', () => {
    const result = LlmTaggingOutputSchema.safeParse({
      detected_lang: 'mixed',
      tags: [{ tag: 'lift', value: 'true', confidence: 0.9, evidence: '搭𨋢上L2' }],
      summary_en: 'Indoor route through Festival Walk.',
      summary_zh: '經又一城的室內路線。',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence outside 0–1', () => {
    const result = LlmTaggingOutputSchema.safeParse({
      detected_lang: 'en',
      tags: [{ tag: 'lift', value: 'true', confidence: 1.5, evidence: 'lift' }],
      summary_en: '',
      summary_zh: '',
    });
    expect(result.success).toBe(false);
  });
});
