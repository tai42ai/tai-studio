/** The tool-list editor for one MCP entry (`include` or `exclude`): removable token
 *  chips, each flagged when the server does not advertise its tool, plus an add row
 *  that picks an advertised tool and, for `include`, stacks extensions into a composed
 *  `tool:ext[:ext]` token. */
import type { Extension } from '@tai42/api-client';
import {
  Badge,
  Button,
  CloseIcon,
  errorMessage,
  ErrorState,
  ExtensionPicker,
  ToolPicker,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { baseToolOf } from './mcp-config-parse';
import { serverStartingNote, type ServerTools } from './mcp-server-tools';
import {
  type McpToolList,
  unadvertisedTokens,
  unadvertisedWarning,
} from './mcp-unadvertised-tools';

const MUTED_TEXT = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
} as const;

/** The entry token the add row would add: the base tool, with its extension stack on a composer list. */
function composedToken(base: string | null, exts: readonly string[], composer: boolean): string {
  if (base === null || base === '') return '';
  return composer && exts.length > 0 ? [base, ...exts].join(':') : base;
}

/** One removable token chip (a composed `tool:ext[:ext]` string). */
function ToolChip({
  token,
  unadvertised,
  onRemove,
}: {
  readonly token: string;
  readonly unadvertised: boolean;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--tai-space-1)' }}>
      <Badge variant={unadvertised ? 'warning' : 'neutral'}>
        {unadvertised ? `${token} (not advertised)` : token}
      </Badge>
      <Button
        type="button"
        variant="secondary"
        aria-label={`Remove ${token}`}
        onClick={onRemove}
        style={{ padding: '0 var(--tai-space-2)' }}
      >
        <CloseIcon />
      </Button>
    </span>
  );
}

/** The add row: select an advertised tool, optionally stack extensions (composer lists),
 *  and add the composed token. Owns the in-progress base/extension selection. */
function ToolAddRow({
  legend,
  values,
  serverTools,
  extensions,
  extensionsError,
  composer,
  idPrefix,
  onAdd,
}: {
  readonly legend: string;
  readonly values: readonly string[];
  readonly serverTools: ServerTools;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly composer: boolean;
  readonly idPrefix: string;
  readonly onAdd: (token: string) => void;
}): ReactNode {
  const [base, setBase] = useState<string | null>(null);
  const [exts, setExts] = useState<readonly string[]>([]);
  // An advertised MCP tool may carry no overlay row yet, so the picker falls back to
  // the bare raw name; a mapped one shows its human display name.
  const displayNames = useToolDisplayNames();

  const token = composedToken(base, exts, composer);
  const duplicate = token !== '' && values.includes(token);

  const add = (): void => {
    if (token === '' || duplicate) return;
    onAdd(token);
    setBase(null);
    setExts([]);
  };

  // A server whose start is still in progress has no tools to read until that start binds.
  if (serverTools.starting) {
    return (
      <p style={MUTED_TEXT}>{`${serverStartingNote()} Existing entries above stay editable.`}</p>
    );
  }
  // A server the status does not carry has no tools to read until it is saved.
  if (!serverTools.mounted) {
    return (
      <p style={MUTED_TEXT}>
        This server is not mounted yet, so its tools cannot be listed. Save it to pick from its
        tools. Existing entries above stay editable.
      </p>
    );
  }
  const query = serverTools.query;
  // A server that advertises no tool is a server state, not an exhausted list.
  if (query.isSuccess && (query.data ?? []).length === 0) {
    return (
      <p style={MUTED_TEXT}>
        This server advertises no tools. Existing entries above stay editable.
      </p>
    );
  }

  // `exclude` cannot list the same tool twice; `include` can (a base tool with
  // different extension stacks), so only the non-composer list excludes its picks.
  const excludeNames = composer ? undefined : values.map(baseToolOf);

  return (
    <>
      <ToolPicker
        query={query}
        value={base}
        onChange={setBase}
        excludeNames={excludeNames}
        placeholder="Choose a tool…"
        aria-label={`${legend}: choose a tool`}
        idPrefix={`${idPrefix}-tool`}
        displayNames={displayNames}
        toolDescriptions={serverTools.descriptions}
        emptyNote="Every tool this server advertises is already in this list."
        errorNote={`This server's tools could not be read: ${errorMessage(query.error)}. Existing entries above stay editable.`}
      />
      {composer ? (
        <>
          {extensionsError !== undefined ? (
            <ErrorState message={extensionsError} />
          ) : (
            <ExtensionPicker
              available={extensions}
              value={[...exts]}
              onChange={setExts}
              disabled={base === null || base === ''}
              idPrefix={`${idPrefix}-extensions`}
            />
          )}
          <p style={MUTED_TEXT}>
            New entry: <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{token || '—'}</span>
          </p>
        </>
      ) : null}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={token === '' || duplicate}
        >
          Add to {legend.toLowerCase()}
        </Button>
        {duplicate ? (
          <span style={{ ...MUTED_TEXT, marginLeft: 'var(--tai-space-2)' }}>
            Already in the list.
          </span>
        ) : null}
      </div>
    </>
  );
}

/**
 * Editor for one tool list on an MCP entry (`include` or `exclude`). Existing
 * tokens render as removable chips — even ones the server does not advertise, so the
 * operator is never locked out of removing their own config. Once the server's tools
 * are read, a chip whose tool the server does not advertise is flagged, and a warning
 * names every such token and what saving it does on this `list`. The add row selects
 * an advertised tool; the `include` list adds an extension COMPOSER on top, stacking
 * extensions into a `tool:ext[:ext]` token.
 */
export function ToolListEditor({
  legend,
  description,
  values,
  serverTools,
  extensions,
  extensionsError,
  list,
  idPrefix,
  onChange,
}: {
  readonly legend: string;
  readonly description: string;
  readonly values: readonly string[];
  readonly serverTools: ServerTools;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly list: McpToolList;
  readonly idPrefix: string;
  readonly onChange: (next: string[]) => void;
}): ReactNode {
  const remove = (target: string): void => {
    onChange(values.filter((value) => value !== target));
  };
  const unadvertised =
    serverTools.advertised === undefined ? [] : unadvertisedTokens(values, serverTools.advertised);

  return (
    <fieldset
      data-testid={idPrefix}
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
      }}
    >
      <legend style={{ padding: 0, fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
        {legend}
      </legend>
      <p style={MUTED_TEXT}>{description}</p>

      {values.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
          {values.map((value) => (
            <ToolChip
              key={value}
              token={value}
              unadvertised={unadvertised.includes(value)}
              onRemove={() => {
                remove(value);
              }}
            />
          ))}
        </div>
      ) : null}
      {unadvertised.length > 0 ? (
        <p role="alert" className="tai-field-error">
          {unadvertisedWarning(list, unadvertised)}
        </p>
      ) : null}

      <ToolAddRow
        legend={legend}
        values={values}
        serverTools={serverTools}
        extensions={extensions}
        extensionsError={extensionsError}
        composer={list === 'include'}
        idPrefix={idPrefix}
        onAdd={(token) => {
          onChange([...values, token]);
        }}
      />
    </fieldset>
  );
}
