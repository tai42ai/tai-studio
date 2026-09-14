/**
 * The record-page subject-param codec. A record's four-part identity rides two URL
 * params (`subject=<kind>:<key>`, `target=<target_kind>:<target_name>`); each splits
 * on its FIRST `:` only (a key or a name may itself contain colons) and the tail is
 * URL-decoded, so the identity survives a deep link and a reload.
 */
import type { StateSubjectRef } from '@tai42/api-client';

/** Split a `<head>:<tail>` param on the FIRST colon; the tail is URL-decoded. */
export function parseColonPair(raw: string): { head: string; tail: string } | null {
  const idx = raw.indexOf(':');
  if (idx < 0) return null;
  const head = raw.slice(0, idx);
  if (head === '') return null;
  return { head, tail: decodeURIComponent(raw.slice(idx + 1)) };
}

/** Format one subject param `<kind>:<key>` (key URL-encoded). */
export function formatSubjectParam(kind: string, key: string): string {
  return `${kind}:${encodeURIComponent(key)}`;
}

/** Format one target param `<target_kind>:<target_name>` (name URL-encoded). */
export function formatTargetParam(targetKind: string, targetName: string): string {
  return `${targetKind}:${encodeURIComponent(targetName)}`;
}

/**
 * Resolve the four-part subject from its two URL params, or `null` when either is
 * missing/malformed — the page then shows a repair prompt rather than a doomed read.
 */
export function parseSubjectRef(
  subjectParam: string | undefined,
  targetParam: string | undefined,
): StateSubjectRef | null {
  if (subjectParam === undefined || targetParam === undefined) return null;
  const subject = parseColonPair(subjectParam);
  const target = parseColonPair(targetParam);
  if (subject === null || target === null || subject.tail === '' || target.tail === '') return null;
  return {
    target_kind: target.head,
    target_name: target.tail,
    kind: subject.head,
    key: subject.tail,
  };
}
