/**
 * The register form's notices for a failed side read: the form stays usable without
 * the read, so the failure is stated above the fields with what it costs. A failed
 * hooks list costs overwrite detection; a failed tool-declarations read costs the
 * description search, so while the Tool picker draws its search the notice says it
 * matches tool names only.
 */
import { errorMessage, TOOL_SEARCH_NAMES_ONLY_NOTE, toolSearchShown } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { TOOL_UNLISTED_LABEL } from './HookIdentityFields';
import type { HookFormData } from './useHookFormData';

const noticeStyle = { margin: 0, color: 'var(--tai-color-warn-text)' };

export function HookFormReadNotices({
  data,
  tool,
}: {
  readonly data: Pick<HookFormData, 'hooksQuery' | 'toolsQuery' | 'toolTagsQuery'>;
  /** The Tool picker's value, `''` for none. */
  readonly tool: string;
}): ReactNode {
  const { hooksQuery, toolsQuery, toolTagsQuery } = data;
  const searchShown = toolSearchShown({
    query: toolsQuery,
    value: tool,
    unlistedLabel: TOOL_UNLISTED_LABEL,
  });
  return (
    <>
      {hooksQuery.isError ? (
        <p role="alert" style={noticeStyle}>
          Could not load existing hooks: {errorMessage(hooksQuery.error)}. Overwrite detection is
          unavailable; a register still replaces any existing hook with the same name.
        </p>
      ) : null}
      {toolTagsQuery.isError ? (
        <p role="alert" style={noticeStyle}>
          Could not load tool descriptions: {errorMessage(toolTagsQuery.error)}.
          {searchShown ? ` ${TOOL_SEARCH_NAMES_ONLY_NOTE}` : null}
        </p>
      ) : null}
    </>
  );
}
