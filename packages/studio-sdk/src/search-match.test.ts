import { describe, expect, it } from 'vitest';

import { isBlankSearch, matchesSearch, searchNeedle, textHasNeedle } from './search-match';

describe('matchesSearch', () => {
  it('matches a substring anywhere in the text, ignoring case', () => {
    expect(matchesSearch('MESSAGE', 'Send Message (chat.send)')).toBe(true);
    expect(matchesSearch('chat.se', 'Send Message (chat.send)')).toBe(true);
    expect(matchesSearch('receive', 'Send Message (chat.send)')).toBe(false);
  });

  it('matches when any one of several texts contains the query, each on its own', () => {
    expect(matchesSearch('notice', 'notify', 'Send Notice')).toBe(true);
    expect(matchesSearch('NOTIFY', 'notify', 'Send Notice')).toBe(true);
    // The texts are tested apart, never joined into one.
    expect(matchesSearch('notifysend', 'notify', 'Send Notice')).toBe(false);
    expect(matchesSearch('x')).toBe(false);
  });

  it('ignores blanks around the query but not inside it', () => {
    expect(matchesSearch('  send ', 'Send Message')).toBe(true);
    expect(matchesSearch('send  message', 'Send Message')).toBe(false);
  });

  it('matches every text for a blank query', () => {
    expect(matchesSearch('', 'anything')).toBe(true);
    expect(matchesSearch('   ', '')).toBe(true);
  });
});

describe('isBlankSearch', () => {
  it('is true only for a query of blanks', () => {
    expect(isBlankSearch('')).toBe(true);
    expect(isBlankSearch('  ')).toBe(true);
    expect(isBlankSearch(' a ')).toBe(false);
  });
});

describe('searchNeedle and textHasNeedle', () => {
  it('compare a pre-lowered text against a trimmed, lowered query', () => {
    const needle = searchNeedle(' Beta ');
    expect(needle).toBe('beta');
    expect(textHasNeedle('alpha beta', needle)).toBe(true);
    expect(textHasNeedle('alpha', needle)).toBe(false);
    expect(textHasNeedle('alpha', '')).toBe(true);
  });
});
