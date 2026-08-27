import { normalizePhone } from './normalizePhone';

describe('normalizePhone', () => {
  it.each([
    ['010-1234-5678', '01012345678'],
    ['010 1234 5678', '01012345678'],
    ['(010) 1234-5678', '01012345678'],
    ['+82 10-1234-5678', '01012345678'],
    ['+821012345678', '01012345678'],
    ['0082-10-1234-5678', '01012345678'],
  ])('collapses %s to %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it('leaves domestic landlines alone beyond stripping punctuation', () => {
    expect(normalizePhone('02-123-4567')).toBe('021234567');
  });

  it('does not invent a leading zero for non-Korean country codes', () => {
    expect(normalizePhone('+1 415 555 0123')).toBe('14155550123');
  });

  it.each([null, undefined, '', '---'])('returns "" for %p', (raw) => {
    expect(normalizePhone(raw)).toBe('');
  });

  it('matches the same number written two different ways', () => {
    // The case the whole feature rests on: the contact was typed with dashes, the
    // telephony API reports bare digits (or the +82 form).
    expect(normalizePhone('010-9876-5432')).toBe(normalizePhone('+821098765432'));
  });
});
