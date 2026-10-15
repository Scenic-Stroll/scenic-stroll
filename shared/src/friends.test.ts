import { describe, expect, it } from 'vitest';

import { FRIEND_CODE_PATTERN, friendInviteText, friendLink, parseFriendCode } from './friends.ts';

describe('parseFriendCode', () => {
  it.each([
    ['STROLL-7K2Q', 'STROLL-7K2Q'],
    ['stroll-7k2q', 'STROLL-7K2Q'],
    ['STROLL 7K2Q', 'STROLL-7K2Q'],
    ['  7k2q ', 'STROLL-7K2Q'],
    ['scenicstroll://friend/STROLL-7K2Q', 'STROLL-7K2Q'],
  ])('%j → %s', (input, expected) => {
    expect(parseFriendCode(input)).toBe(expected);
  });

  it('reads the code out of an invite message', () => {
    expect(parseFriendCode(friendInviteText('STROLL-AB3Z'))).toBe('STROLL-AB3Z');
  });

  it.each(['', 'hello', 'STROLL-7K2', 'STROLL-7K2QX', 'STROLL-IO01', '7K2Q5'])(
    'rejects %j',
    (input) => {
      expect(parseFriendCode(input)).toBeNull();
    },
  );

  it('the QR link round-trips', () => {
    expect(parseFriendCode(friendLink('STROLL-9XYZ'))).toBe('STROLL-9XYZ');
  });

  it('matches the database check constraint format', () => {
    expect(FRIEND_CODE_PATTERN.test('STROLL-7K2Q')).toBe(true);
    expect(FRIEND_CODE_PATTERN.test('STROLL-7K2O')).toBe(false); // no O
  });
});
