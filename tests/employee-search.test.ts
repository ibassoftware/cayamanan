import { describe, expect, it } from 'vitest';

import { buildSearchPatterns } from '@/modules/employee/service/employee-search';

// The regression this file exists for: searching "Maria Clara" — or "Maria Santos", first
// name plus last name — returned zero results for an employee called Maria Clara Santos,
// because the whole query was matched as one ILIKE against one column at a time. Missy hit
// it live and concluded the employee did not exist.
describe('buildSearchPatterns', () => {
  it('splits a multi-word name into one pattern per word', () => {
    expect(buildSearchPatterns('Maria Clara')).toEqual(['%Maria%', '%Clara%']);
  });

  it('collapses arbitrary whitespace', () => {
    expect(buildSearchPatterns('  Maria   Santos \n')).toEqual(['%Maria%', '%Santos%']);
  });

  it('treats a blank query as no filter rather than as matching nothing', () => {
    expect(buildSearchPatterns('')).toEqual([]);
    expect(buildSearchPatterns('   ')).toEqual([]);
  });

  it('keeps a single token working', () => {
    expect(buildSearchPatterns('EMP-1001')).toEqual(['%EMP-1001%']);
  });

  // `%` would otherwise match every employee and turn the search box into a full scan;
  // `_` would match any single character. Both are surprising in a name search.
  it('escapes ILIKE wildcards in user input', () => {
    expect(buildSearchPatterns('%')).toEqual(['%\\%%']);
    expect(buildSearchPatterns('_')).toEqual(['%\\_%']);
    expect(buildSearchPatterns('50%_off')).toEqual(['%50\\%\\_off%']);
  });

  // Escaped first, or the backslashes added for % and _ would themselves be eaten.
  it('escapes the escape character itself', () => {
    expect(buildSearchPatterns('a\\b')).toEqual(['%a\\\\b%']);
  });

  it('caps the token count against a pathological query', () => {
    const patterns = buildSearchPatterns(Array.from({ length: 50 }, (_, i) => `t${i}`).join(' '));
    expect(patterns).toHaveLength(10);
  });
});
