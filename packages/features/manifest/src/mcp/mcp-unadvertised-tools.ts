/**
 * The tool names an MCP entry lists that its server does not advertise, and the words
 * that say what saving them does. The server accepts such a name (it may be bound later,
 * or by a stored preset), so every editor view warns and none refuses the save; each
 * view states it in these same words.
 */
import { baseToolOf } from './mcp-config-parse';

/** The two tool lists an MCP entry carries. */
export type McpToolList = 'include' | 'exclude';

/** The listed tokens whose base tool is not in `advertised`. */
export function unadvertisedTokens(
  values: readonly string[],
  advertised: ReadonlySet<string>,
): string[] {
  return values.filter((value) => !advertised.has(baseToolOf(value)));
}

/**
 * The warning for `tokens` the server does not advertise on its `list`. Inside one
 * entry's own list the server is "This server"; naming `server` also names the list,
 * for a view that shows every entry at once.
 */
export function unadvertisedWarning(
  list: McpToolList,
  tokens: readonly string[],
  server?: string,
): string {
  const one = tokens.length === 1;
  const subject = server === undefined ? 'This server' : `The server “${server}”`;
  const where = server === undefined ? '' : ` in its ${list} list`;
  const effect =
    list === 'include'
      ? `${one ? 'it binds' : 'they bind'} no tool from this server`
      : `${one ? 'it hides' : 'they hide'} nothing`;
  return `${subject} does not advertise ${tokens.join(', ')}${where}. Saving keeps ${one ? 'it' : 'them'}, but ${effect}.`;
}
