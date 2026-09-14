/**
 * The prose DOM walk: finding every scrollable `<table>` and `<pre>` inside
 * injected markup, naming each by the heading that precedes it, and disambiguating
 * names a section shares. React never renders these surfaces, so they are located
 * and wrapped imperatively.
 */
import { SCROLL_REGION_CLASS, type TrackedSurface } from './overflow-measure';

/**
 * The names for a prose surface that has no heading above it.
 *
 * They say what the surface IS and nothing about which document it came from,
 * because this walk cannot know: it instruments whatever markup the caller
 * injected. A default that named one document put that document's name on every
 * caller's regions, and a region a reader hears the wrong name for is worse than
 * a plain one.
 */
export const DEFAULT_PROSE_LABELS = { table: 'Table', pre: 'Code block' } as const;

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/**
 * Headings AND the surfaces they name, in one selector: a single query returns
 * both interleaved in document order, which is what lets one walk name every
 * surface (see `labelledProseSurfaces`).
 */
const PROSE_SURFACE_SELECTOR = `${HEADING_SELECTOR}, table, pre`;

/**
 * The most surfaces one rendered document is given regions for.
 *
 * The prose is publisher-authored and unbounded in length, and every region is
 * an entry in the landmark list a screen-reader user navigates the page by: a
 * README with more surfaces than this turns that list into the very thing the
 * regions exist to spare a reader. Past the cap a table still gets its scrolling
 * wrapper — the wrapper is what keeps it inside the column — but no name and no
 * tab stop, so the landmark list stays a list a person can read.
 */
export const MAX_PROSE_REGIONS = 200;

/**
 * The wrapper a prose table sits inside, creating it on first pass. Idempotent:
 * a table already inside a `.tai-scroll-region` keeps the wrapper it has.
 */
export function ensureScrollWrapper(table: HTMLTableElement): HTMLElement {
  const parent = table.parentElement;
  if (parent?.classList.contains(SCROLL_REGION_CLASS) === true) return parent;
  const wrapper = table.ownerDocument.createElement('div');
  wrapper.className = SCROLL_REGION_CLASS;
  table.replaceWith(wrapper);
  wrapper.append(table);
  return wrapper;
}

/** A heading that can name the surfaces below it, and the text it would give. */
interface ProseHeading {
  readonly element: Element;
  readonly text: string;
}

/** A scrollable prose surface, with the heading text that names it. */
interface LabelledProseSurface {
  readonly element: HTMLElement;
  readonly heading: string | undefined;
}

/**
 * The text of the last heading in `headings` that does not ENCLOSE `surface`.
 *
 * A heading wrapping the surface does precede it in document order, but it is
 * not a section the surface sits UNDER, so it is stepped over in favour of the
 * heading before it — which is the answer an outward walk from the surface
 * reaches. In well-formed prose no heading contains a table or a code block, so
 * this returns the last heading on the first look.
 */
function namingHeadingText(
  headings: readonly ProseHeading[],
  surface: Element,
): string | undefined {
  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const heading = headings[index];
    if (heading !== undefined && !heading.element.contains(surface)) return heading.text;
  }
  return undefined;
}

/**
 * Every scrollable prose surface under `root` — each `<table>` and each `<pre>`
 * — paired with the text of the nearest heading PRECEDING it, or `undefined`
 * when no heading does.
 *
 * One query returns the headings and the surfaces interleaved in document order,
 * so a single walk over that list names all of them: the heading a surface
 * belongs to is the last one seen before reaching it. Naming each surface by
 * searching backwards from it instead would re-read the same prose once per
 * surface, at a cost that grows with the product of the two.
 *
 * Blank headings never enter the list, so a decorative empty heading names
 * nothing and the section above it is used instead. A heading INSIDE a surface
 * (a `<pre>` or a table cell holding one) comes AFTER that surface in document
 * order and so can never name it, though it does name later surfaces — exactly
 * as being the last heading before them implies.
 *
 * Read in full before the pass wraps anything, and safely so: a name depends
 * only on what PRECEDES its surface, and `ensureScrollWrapper` puts the wrapper
 * in the table's own place, moving nothing else and leaving every heading where
 * it was — so a name stays true whether its table is wrapped yet or not.
 */
export function labelledProseSurfaces(root: Element): LabelledProseSurface[] {
  const headings: ProseHeading[] = [];
  const surfaces: LabelledProseSurface[] = [];

  for (const node of root.querySelectorAll<HTMLElement>(PROSE_SURFACE_SELECTOR)) {
    if (node.matches(HEADING_SELECTOR)) {
      // textContent is nullable under strict DOM typings; the local eslint
      // profile assumes non-null, so the necessary guard trips its rule.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const text = (node.textContent ?? '').trim();
      if (text !== '') headings.push({ element: node, text });
      continue;
    }
    surfaces.push({ element: node, heading: namingHeadingText(headings, node) });
  }
  return surfaces;
}

/** A prose surface's scrolling box and the name it would take on its own. */
interface ProseSurfaceBox {
  readonly surface: HTMLElement;
  readonly name: string;
}

/**
 * The same surfaces, each given a name no other one in the list carries.
 *
 * A name is only as useful as it is distinguishing, and one heading names every
 * surface under it: two wide tables in one section, or two code blocks under no
 * heading at all, would otherwise be two landmarks a reader hears identically
 * and cannot choose between. A name more than one surface claims is therefore
 * numbered, in document order, and a name only one surface claims is left alone.
 */
export function uniquelyNamed(boxes: readonly ProseSurfaceBox[]): TrackedSurface[] {
  const claims = new Map<string, number>();
  for (const { name } of boxes) claims.set(name, (claims.get(name) ?? 0) + 1);

  const taken = new Map<string, number>();
  return boxes.map(({ surface, name }) => {
    if (claims.get(name) === 1) return { surface, label: name };
    const ordinal = (taken.get(name) ?? 0) + 1;
    taken.set(name, ordinal);
    return { surface, label: `${name} (${String(ordinal)})` };
  });
}
