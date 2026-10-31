/**
 * The raw JSON view's check of the tool names each entry lists: for every entry whose
 * server the MCP status knows, the `include` and `exclude` names that server does not
 * advertise are warned about in the form view's own words, and a failed read of the
 * server's tools says so in place of that server's check. The buffer is checked as it
 * is typed; a buffer that does not parse lists nothing here (saving states the parse
 * error).
 */
import { errorMessage, ErrorState } from '@tai42/studio-sdk';
import { type ReactNode, useMemo } from 'react';

import { asRecord, parseEntries, stringArray } from './mcp-config-parse';
import { type McpStatusRead, useAdvertisedByTitle } from './mcp-server-tools';
import {
  type McpToolList,
  unadvertisedTokens,
  unadvertisedWarning,
} from './mcp-unadvertised-tools';

/** One titled entry of the buffer and the tool names it lists. */
interface ListedEntry {
  readonly title: string;
  readonly lists: Readonly<Record<McpToolList, readonly string[]>>;
}

/** The titled entries a buffer holds, or none when it does not parse. */
function listedEntries(text: string): ListedEntry[] {
  const parsed = parseEntries(text);
  if ('error' in parsed) return [];
  return parsed.entries.flatMap((entry) => {
    const record = asRecord(entry);
    if (typeof record.title !== 'string' || record.title === '') return [];
    return [
      {
        title: record.title,
        lists: { include: stringArray(record.include), exclude: stringArray(record.exclude) },
      },
    ];
  });
}

const TOOL_LISTS: readonly McpToolList[] = ['include', 'exclude'];

export function JsonToolNamesCheck({
  text,
  status,
}: {
  readonly text: string;
  readonly status: McpStatusRead;
}): ReactNode {
  const entries = useMemo(() => listedEntries(text), [text]);
  const reads = useAdvertisedByTitle(
    status,
    entries.map((entry) => entry.title),
  );

  const lines: ReactNode[] = [];
  const failedShown = new Set<string>();
  entries.forEach((entry, index) => {
    const read = reads.get(entry.title);
    if (read === undefined || read.state === 'pending') return;
    if (read.state === 'failed') {
      if (failedShown.has(entry.title)) return;
      failedShown.add(entry.title);
      lines.push(
        <ErrorState
          key={`${String(index)}-failed`}
          message={`The tools of the server “${entry.title}” could not be read: ${errorMessage(read.error)}. Its listed names are not checked.`}
          onRetry={read.retry}
        />,
      );
      return;
    }
    for (const list of TOOL_LISTS) {
      const unadvertised = unadvertisedTokens(entry.lists[list], read.advertised);
      if (unadvertised.length === 0) continue;
      lines.push(
        <p key={`${String(index)}-${list}`} role="alert" className="tai-field-error">
          {unadvertisedWarning(list, unadvertised, entry.title)}
        </p>,
      );
    }
  });
  return lines.length === 0 ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      {lines}
    </div>
  );
}
