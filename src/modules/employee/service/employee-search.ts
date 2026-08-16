// Tokenising for `employee.list`'s free-text search.
//
// The original implementation matched the whole query as a single `ILIKE '%term%'`
// against `first_name`, `last_name` and `employee_no`. That fails the most ordinary thing
// a user can do — typing a person's name. "Maria Clara" matched nothing for an employee
// called Maria Clara Santos, because no single column contains that string; so did
// "Maria Santos", first name plus last name. Middle name was not searched at all.
//
// Splitting into tokens and requiring every token to match *somewhere* fixes all three at
// once, and is order-insensitive, so "Santos Maria" works too.

/** More tokens than any real name query; a guard against a pathological input. */
const MAX_SEARCH_TOKENS = 10;

/**
 * `%` and `_` are wildcards to `ILIKE`. Left unescaped, a search for `%` matches every
 * employee and a search for `_` matches any single character — both surprising, and the
 * former turns the search box into a full-table scan. `\` is the default escape character
 * for `LIKE` in Postgres, so it has to be escaped first or it would eat the ones we add.
 */
function escapeLikeWildcards(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, (char) => `\\${char}`);
}

/**
 * Splits a raw search box value into the tokens a row must match. Every returned token is
 * already wildcard-escaped and wrapped in `%…%`, ready to hand to `ilike`.
 *
 * Returns `[]` for a blank query, which the caller treats as "no search filter" rather
 * than "match nothing".
 */
export function buildSearchPatterns(rawSearch: string): string[] {
  return rawSearch
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, MAX_SEARCH_TOKENS)
    .map((token) => `%${escapeLikeWildcards(token)}%`);
}
