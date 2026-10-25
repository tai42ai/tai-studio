/**
 * The pure model of one Pick tools section: its mode, its initial ticks, the body a
 * save writes, and the count line. A section in exclude mode stays in exclude mode;
 * the only other write it offers is mounting every tool.
 */
import type { McpAdvertisedTools } from '@tai42/api-client';

export type PickMode = 'include' | 'exclude';

export interface ToolFilterBody {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface PickDraft {
  readonly all: boolean;
  /** The tick of every listed name, advertised then unadvertised. */
  readonly ticks: Readonly<Record<string, boolean>>;
}

export function pickMode(read: McpAdvertisedTools): PickMode {
  return read.exclude.length > 0 ? 'exclude' : 'include';
}

/** Every name the section lists: the advertised tools, then the unadvertised names. */
export function listedNames(read: McpAdvertisedTools): string[] {
  return [...read.tools.map((tool) => tool.name), ...read.unadvertised];
}

export function initialDraft(read: McpAdvertisedTools): PickDraft {
  const mode = pickMode(read);
  const ticks: Record<string, boolean> = {};
  for (const tool of read.tools) ticks[tool.name] = tool.selected;
  for (const name of read.unadvertised) ticks[name] = mode === 'include';
  return { all: read.include.length === 0 && read.exclude.length === 0, ticks };
}

export function draftBody(read: McpAdvertisedTools, draft: PickDraft): ToolFilterBody {
  if (draft.all) return { include: [], exclude: [] };
  const names = listedNames(read);
  if (pickMode(read) === 'exclude') {
    return { include: [], exclude: names.filter((name) => draft.ticks[name] !== true) };
  }
  return { include: names.filter((name) => draft.ticks[name] === true), exclude: [] };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((name) => set.has(name));
}

export function sameBody(a: ToolFilterBody, b: ToolFilterBody): boolean {
  return sameSet(a.include, b.include) && sameSet(a.exclude, b.exclude);
}

/** Include mode with the all-checkbox off and nothing ticked: an empty include would mount every tool. */
export function draftBlocked(read: McpAdvertisedTools, draft: PickDraft): boolean {
  if (draft.all || pickMode(read) === 'exclude') return false;
  return listedNames(read).every((name) => draft.ticks[name] !== true);
}

export function countLine(read: McpAdvertisedTools, draft: PickDraft): string {
  const mode = pickMode(read);
  const advertised = read.tools.map((tool) => tool.name);
  const ticked = advertised.filter((name) => draft.ticks[name] === true).length;
  let line =
    mode === 'include'
      ? `${String(ticked)} of ${String(advertised.length)} tools picked`
      : `${String(ticked)} of ${String(advertised.length)} tools mounted`;
  if (read.unadvertised.length > 0) {
    const kept = read.unadvertised.filter((name) => draft.ticks[name] === true).length;
    line +=
      mode === 'include'
        ? ` · ${String(kept)} not advertised kept`
        : ` · ${String(read.unadvertised.length - kept)} not advertised still excluded`;
  }
  return line;
}
