/**
 * The one text-search rule every Studio list applies: a case-insensitive substring
 * match of the trimmed query against the texts the reader sees. A blank query matches
 * everything.
 */

/**
 * The query in the form a match compares: trimmed and lower-cased. A list that tests
 * many texts against one query computes this once and hands it to {@link textHasNeedle}.
 */
export function searchNeedle(query: string): string {
  return query.trim().toLowerCase();
}

/** True when `needle` (from {@link searchNeedle}) is blank or `loweredText` contains it. */
export function textHasNeedle(loweredText: string, needle: string): boolean {
  return needle === '' || loweredText.includes(needle);
}

/**
 * True when `query` holds nothing but blanks, so it matches every text: a list that
 * draws itself differently while no search is active asks this.
 */
export function isBlankSearch(query: string): boolean {
  return searchNeedle(query) === '';
}

/**
 * True when any one of `texts` contains `query`, ignoring case and the query's
 * surrounding blanks; a blank query matches every row. Each text is tested on its own,
 * so a row searched by several fields (a name and a display name) never matches across
 * the seam between two of them.
 *
 * @param query - what the reader typed.
 * @param texts - the texts the row is searched by (for a row of the connector's tool
 *   list, its `toolDisplayLabel`, which carries both the display name and the raw name).
 */
export function matchesSearch(query: string, ...texts: readonly string[]): boolean {
  const needle = searchNeedle(query);
  return needle === '' || texts.some((text) => textHasNeedle(text.toLowerCase(), needle));
}
