/**
 * ONE `ResizeObserver` and ONE `MutationObserver` for every scrolling box in the
 * document, rather than a pair per mount. Handlers register per target; the
 * shared observers observe an element the first time anyone asks and drop it once
 * nobody wants it.
 */

/**
 * The handlers waiting on each observed element. A SET, not a single handler:
 * one element can be both a box and another box's child — a `<pre>` inside a
 * `ScrollRegion` is exactly that — and both owners must still hear its resize.
 */
type ResizeHandler = () => void;

const resizeHandlers = new WeakMap<Element, Set<ResizeHandler>>();
let sharedResize: ResizeObserver | undefined;

function sharedResizeObserver(): ResizeObserver {
  sharedResize ??= new ResizeObserver((entries) => {
    // A box and its children are observed separately, so one frame can deliver
    // several entries owned by the same handler; measuring once is enough.
    const fired = new Set<ResizeHandler>();
    for (const entry of entries) {
      for (const handler of resizeHandlers.get(entry.target) ?? []) fired.add(handler);
    }
    for (const handler of fired) handler();
  });
  return sharedResize;
}

/**
 * Registers `handler` for `target`'s resizes, observing the element only the
 * first time anyone asks for it: re-observing an element already under a
 * `ResizeObserver` re-arms its initial notification, which spends a forced
 * layout on a measurement nobody asked for.
 */
export function holdResizeTarget(target: Element, handler: ResizeHandler): void {
  const handlers = resizeHandlers.get(target);
  if (handlers !== undefined) {
    handlers.add(handler);
    return;
  }
  // Registered before the element is observed, so the initial notification the
  // observation arms reaches the handler that asked for it.
  resizeHandlers.set(target, new Set<ResizeHandler>([handler]));
  sharedResizeObserver().observe(target);
}

/** Stops observing `target` for `handler`, and entirely once nobody wants it. */
export function releaseResizeTarget(target: Element, handler: ResizeHandler): void {
  const handlers = resizeHandlers.get(target);
  if (handlers === undefined) return;
  handlers.delete(handler);
  if (handlers.size > 0) return;
  resizeHandlers.delete(target);
  sharedResizeObserver().unobserve(target);
}

/** What a box wants to hear about: its content replaced, appended or edited. */
const CONTENT_OBSERVER_INIT: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

type ContentHandler = () => void;

/**
 * The handlers waiting on each observed box, and the boxes the shared observer
 * currently holds. Keyed by `Node` because a `characterData` record names the
 * TEXT node that changed, and the walk to the box that owns it goes through
 * whatever nodes lie between.
 */
const contentHandlers = new WeakMap<Node, Set<ContentHandler>>();
const contentTargets = new Set<Element>();
let sharedContent: MutationObserver | undefined;
/** Registrations the shared observer still holds for released boxes. */
let staleContentTargets = 0;

function deliverContentRecords(records: readonly MutationRecord[]): void {
  const fired = new Set<ContentHandler>();
  for (const record of records) {
    // A `childList` record names the changed parent and a `characterData` record
    // the text node itself, either of them at any depth under a box. Every box
    // on the ancestor chain therefore owns the change, exactly as a separate
    // observer on each of them would have seen it — a `<pre>` inside a
    // `ScrollRegion` measures both.
    for (let node: Node | null = record.target; node !== null; node = node.parentNode) {
      for (const handler of contentHandlers.get(node) ?? []) fired.add(handler);
    }
  }
  for (const handler of fired) handler();
}

function sharedContentObserver(): MutationObserver {
  sharedContent ??= new MutationObserver(deliverContentRecords);
  return sharedContent;
}

export function holdContentTarget(target: Element, handler: ContentHandler): void {
  let handlers = contentHandlers.get(target);
  if (handlers === undefined) {
    handlers = new Set<ContentHandler>();
    contentHandlers.set(target, handlers);
    contentTargets.add(target);
    sharedContentObserver().observe(target, CONTENT_OBSERVER_INIT);
  }
  handlers.add(handler);
}

/**
 * Stops watching `target`'s content for `handler`.
 *
 * `MutationObserver` has no `unobserve`: the only way to drop one registration
 * is to disconnect the observer and re-observe everything else, which would cost
 * one registration per surviving box every time a box unmounts. A released box
 * is therefore dropped from the handler map at once — its records find no
 * handler and are ignored — and the observer is rebuilt only once the dead
 * registrations outnumber the live ones, which keeps the total registration work
 * proportional to the number of mounts. Records already queued survive the
 * rebuild: they are taken off the observer and delivered by hand.
 */
export function releaseContentTarget(target: Element, handler: ContentHandler): void {
  const handlers = contentHandlers.get(target);
  if (handlers === undefined) return;
  handlers.delete(handler);
  if (handlers.size > 0) return;
  contentHandlers.delete(target);
  contentTargets.delete(target);
  staleContentTargets += 1;
  if (staleContentTargets <= contentTargets.size) return;

  const observer = sharedContentObserver();
  const queued = observer.takeRecords();
  observer.disconnect();
  staleContentTargets = 0;
  for (const live of contentTargets) observer.observe(live, CONTENT_OBSERVER_INIT);
  if (queued.length > 0) deliverContentRecords(queued);
}
