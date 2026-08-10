import { act, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScrollRegion, useProseScrollRegions } from './scroll-region';
import type { ProseScrollLabels } from './scroll-region';
import { flushResizeObservers, flushResizeObserversFor, setElementOverflow } from '../testing';

/** The one `.tai-scroll-region` in the tree, failing loudly when it is missing. */
function scrollRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector<HTMLElement>('.tai-scroll-region');
  if (region === null) throw new Error('no .tai-scroll-region rendered');
  return region;
}

/** The one injected `<pre>` in the tree, failing loudly when it is missing. */
function codeBlock(container: HTMLElement): HTMLElement {
  const pre = container.querySelector<HTMLElement>('pre');
  if (pre === null) throw new Error('no <pre> rendered');
  return pre;
}

/** The nth element of `list`, failing loudly rather than typing around a hole. */
function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`nothing at index ${String(index)}`);
  return item;
}

/** Flips the region's measured overflow and lets its observer see the change. */
function setOverflowing(region: HTMLElement, overflowing: boolean): void {
  setElementOverflow(region, overflowing);
  act(() => {
    flushResizeObservers();
  });
}

/**
 * Makes every instrumented surface in the tree overflow, so each one takes the
 * name the pass computed for it. Use it when a case has more than one surface.
 */
function setEverythingOverflowing(container: HTMLElement): void {
  for (const surface of container.querySelectorAll<HTMLElement>('.tai-scroll-region, pre')) {
    setElementOverflow(surface, true);
  }
  act(() => {
    flushResizeObservers();
  });
}

describe('ScrollRegion', () => {
  it('is neither a tab stop nor a landmark while its content fits', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <table>
          <tbody>
            <tr>
              <td>fits</td>
            </tr>
          </tbody>
        </table>
      </ScrollRegion>,
    );

    const region = scrollRegion(container);
    expect(region).not.toHaveAttribute('tabindex');
    expect(region).not.toHaveAttribute('role');
    expect(region).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('becomes a named, focusable region once it overflows', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );

    setOverflowing(scrollRegion(container), true);

    const region = screen.getByRole('region', { name: 'Tool results' });
    expect(region).toHaveClass('tai-scroll-region');
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('registers every scrolling box on ONE shared ResizeObserver', () => {
    // `useOverflowRegion` is per-INSTANCE: a timeline renders two code blocks
    // per tool call and windows none of them, so an observer per mount grows
    // with the content. Constructions are the observable difference, so they are
    // what is pinned — and the count is taken as a DELTA, because the shared
    // observer is built once on first use and may already exist.
    const Native = globalThis.ResizeObserver;
    let constructed = 0;
    class CountingResizeObserver extends Native {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        constructed += 1;
      }
    }
    globalThis.ResizeObserver = CountingResizeObserver;

    try {
      render(
        <ScrollRegion label="first">
          <p>wide</p>
        </ScrollRegion>,
      );
      const afterOne = constructed;

      const { container } = render(
        <>
          {['second', 'third', 'fourth', 'fifth', 'sixth'].map((label) => (
            <ScrollRegion key={label} label={label}>
              <p>wide</p>
            </ScrollRegion>
          ))}
        </>,
      );
      expect(constructed - afterOne).toBe(0);

      // Sharing must not be bought by observing less: a resize of one box still
      // has to reach that box's own measurement.
      const boxes = [...container.querySelectorAll<HTMLElement>('.tai-scroll-region')];
      expect(boxes).toHaveLength(5);
      const third = nth(boxes, 2);
      setElementOverflow(third, true);
      act(() => {
        flushResizeObserversFor(third);
      });
      expect(third).toHaveAttribute('role', 'region');
      expect(boxes[0]).not.toHaveAttribute('role');
    } finally {
      globalThis.ResizeObserver = Native;
    }
  });

  it('watches every scrolling box for content changes on ONE shared MutationObserver', async () => {
    // The content side of the measurement is per-INSTANCE for the same reason
    // the resize side is, and a `MutationObserver` per mount is a second
    // callback the browser schedules and a second registration it maintains for
    // every code block on screen. Constructions are the observable difference,
    // and the count is a DELTA because the shared observer is built once on
    // first use and may already exist.
    const Native = globalThis.MutationObserver;
    let constructed = 0;
    class CountingMutationObserver extends Native {
      constructor(callback: MutationCallback) {
        super(callback);
        constructed += 1;
      }
    }
    globalThis.MutationObserver = CountingMutationObserver;

    try {
      render(
        <ScrollRegion label="first">
          <p>wide</p>
        </ScrollRegion>,
      );
      const afterOne = constructed;

      const { container } = render(
        <>
          {['second', 'third', 'fourth', 'fifth', 'sixth'].map((label) => (
            <ScrollRegion key={label} label={label}>
              <p>wide</p>
            </ScrollRegion>
          ))}
        </>,
      );
      expect(constructed - afterOne).toBe(0);

      // Sharing must not be bought by watching less: a content change inside one
      // box still has to reach that box's own measurement, and only that one.
      const boxes = [...container.querySelectorAll<HTMLElement>('.tai-scroll-region')];
      expect(boxes).toHaveLength(5);
      const third = nth(boxes, 2);
      setElementOverflow(third, true);
      const paragraph = third.querySelector('p');
      if (paragraph === null) throw new Error('no <p> in the third box');
      act(() => {
        paragraph.textContent = 'much wider than the box';
      });

      await waitFor(() => {
        expect(third).toHaveAttribute('role', 'region');
      });
      expect(nth(boxes, 0)).not.toHaveAttribute('role');
    } finally {
      globalThis.MutationObserver = Native;
    }
  });

  it('re-registers nothing, and measures once, for an edit in place', async () => {
    function Host({ text }: { text: string }) {
      return (
        <ScrollRegion label="Tool results">
          <p>{text}</p>
        </ScrollRegion>
      );
    }
    const { container, rerender } = render(<Host text="short" />);
    const region = scrollRegion(container);

    // `scrollWidth` is the layout-forcing read, and re-observing an element the
    // shared observer already holds re-arms its initial notification — one more
    // forced read, per target, for a box whose children did not change at all.
    // The read count is what that costs, so the read count is what is pinned.
    let reads = 0;
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(region, 'scrollWidth', {
      configurable: true,
      get: () => {
        reads += 1;
        return 400;
      },
    });

    rerender(<Host text="a much longer line than the box can hold" />);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(region).toHaveAttribute('role', 'region');
    expect(reads).toBe(1);
  });

  it('forwards a consumer ref to the scrolling element', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <ScrollRegion label="Tool results" ref={ref}>
        <p>wide</p>
      </ScrollRegion>,
    );

    expect(ref.current).toBe(scrollRegion(container));
    // The consumer ref rides along with the measurement rather than replacing
    // it: the element it points at is still the one that becomes the region.
    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Tool results' })).toBe(ref.current);
  });

  it('forwards a consumer CALLBACK ref, and releases whichever way it answers', () => {
    const attached: (HTMLElement | null)[] = [];
    const plain = render(
      <ScrollRegion
        label="Tool results"
        ref={(node) => {
          attached.push(node);
        }}
      >
        <p>wide</p>
      </ScrollRegion>,
    );
    const plainRegion = scrollRegion(plain.container);
    expect(attached).toEqual([plainRegion]);
    plain.unmount();
    expect(attached).toEqual([plainRegion, null]);

    // A callback ref that answers with its own cleanup gets that cleanup called
    // instead of a second call with `null`, exactly as React does for a ref it
    // owns itself.
    let cleaned = 0;
    const cleaning = render(
      <ScrollRegion
        label="Tool results"
        ref={() => () => {
          cleaned += 1;
        }}
      >
        <p>wide</p>
      </ScrollRegion>,
    );
    expect(cleaned).toBe(0);
    cleaning.unmount();
    expect(cleaned).toBe(1);
  });

  it('keeps the tab stop while it holds focus, and releases it on blur', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );
    const region = scrollRegion(container);

    setOverflowing(region, true);
    act(() => {
      region.focus();
    });
    expect(region).toHaveFocus();

    // A window resize is not the reader's doing: taking `tabindex` off the
    // element they are standing on would drop them onto the document body.
    setOverflowing(region, false);
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveFocus();

    // The stop outlives its reason only for as long as they stay.
    act(() => {
      region.blur();
    });
    expect(region).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('re-evaluates when the measurement changes back', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );
    const region = scrollRegion(container);

    setOverflowing(region, true);
    expect(screen.getByRole('region', { name: 'Tool results' })).toBe(region);

    setOverflowing(region, false);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(region).not.toHaveAttribute('tabindex');
  });

  it('re-measures, and observes the new child, when content is appended', async () => {
    function Host() {
      const [extra, setExtra] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setExtra(true);
            }}
          >
            widen
          </button>
          <ScrollRegion label="Tool results">
            <p data-testid="first">first</p>
            {extra ? <p data-testid="second">second</p> : null}
          </ScrollRegion>
        </>
      );
    }
    const { container } = render(<Host />);
    const region = scrollRegion(container);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    // The appended content overflows; adding it must re-take the measurement
    // rather than keep the mount-time answer.
    setElementOverflow(region, true);
    act(() => {
      screen.getByRole('button', { name: 'widen' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Tool results' })).toBe(region);
    });
    expect(screen.getByTestId('second')).toBeInTheDocument();

    // The child added after mount is under the observer too, so its own resize
    // still drives the measurement.
    setElementOverflow(region, false);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('merges the caller className and style onto the region', () => {
    const { container } = render(
      <ScrollRegion label="Tool results" className="extra" style={{ maxWidth: '20rem' }}>
        <p>body</p>
      </ScrollRegion>,
    );

    const region = scrollRegion(container);
    expect(region).toHaveClass('tai-scroll-region', 'extra');
    expect(region.style.maxWidth).toBe('20rem');
  });

  it('names an overflowing region and keeps its content inside it', () => {
    const { container } = render(
      <ScrollRegion label="Tool results">
        <p>body</p>
      </ScrollRegion>,
    );
    setOverflowing(scrollRegion(container), true);

    const region = screen.getByRole('region', { name: 'Tool results' });
    expect(region).toHaveClass('tai-scroll-region');
    expect(within(region).getByText('body')).toBeInTheDocument();
  });
});

function ProseHost({ html, labels }: { html: string; labels?: ProseScrollLabels }) {
  const ref = useProseScrollRegions(labels);
  return <div ref={ref} data-testid="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

const TABLE_HTML = '<table><tbody><tr><td>cell</td></tr></tbody></table>';
const PRE_HTML = '<pre><code>pnpm add @tai42/studio-sdk</code></pre>';
/** A table whose own cell holds a heading — one that must not name the table. */
const TABLE_WITH_HEADING_HTML =
  '<table><tbody><tr><td><h3>Inner</h3>cell</td></tr></tbody></table>';

/**
 * Records every `observe`/`unobserve` any live `ResizeObserver` makes, by patching
 * the stub's PROTOTYPE rather than the constructor.
 *
 * The shared observer in `scroll-region.tsx` is built once, on first use, and held
 * at module scope for the life of the process — so by the time a case runs it
 * already exists and a counting SUBCLASS installed now would never be
 * constructed. The prototype is the one seam that reaches the instance that is
 * really doing the work.
 *
 * It is installed BEFORE the render it measures, deliberately. The stub delivers
 * a target's initial notification from inside `observe()`, synchronously, so a
 * recorder installed afterwards would miss exactly the registrations the
 * assertions are about and report an empty list as agreement.
 */
function trackResizeRegistrations(): {
  readonly observed: Element[];
  readonly released: Element[];
  restore: () => void;
} {
  const prototype = globalThis.ResizeObserver.prototype;
  // The originals are held UNBOUND on purpose and re-supplied a `this` at every
  // call below: the patched method has to run against whichever observer instance
  // invoked it, and binding here would pin every call to the prototype.
  /* eslint-disable @typescript-eslint/unbound-method -- re-invoked with `.call(this, …)`. */
  const observe = prototype.observe;
  const unobserve = prototype.unobserve;
  /* eslint-enable @typescript-eslint/unbound-method */
  const observed: Element[] = [];
  const released: Element[] = [];
  prototype.observe = function record(this: ResizeObserver, target: Element): void {
    observed.push(target);
    observe.call(this, target);
  };
  prototype.unobserve = function record(this: ResizeObserver, target: Element): void {
    released.push(target);
    unobserve.call(this, target);
  };
  return {
    observed,
    released,
    restore: () => {
      prototype.observe = observe;
      prototype.unobserve = unobserve;
    },
  };
}

/** Counts `disconnect()` calls on every `MutationObserver`, prototype-patched. */
function trackContentDisconnects(): { count: () => number; restore: () => void } {
  const prototype = globalThis.MutationObserver.prototype;
  // Held unbound and re-invoked with the calling observer's own `this`, as above.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-invoked with `.call(this)`.
  const disconnect = prototype.disconnect;
  let calls = 0;
  prototype.disconnect = function record(this: MutationObserver): void {
    calls += 1;
    disconnect.call(this);
  };
  return {
    count: () => calls,
    restore: () => {
      prototype.disconnect = disconnect;
    },
  };
}

describe('shared observer hygiene', () => {
  it('hands back every shared registration when a scrolling box unmounts', async () => {
    // Deleting `useOverflowRegion`'s ENTIRE teardown left the whole repository
    // green: the shared observers are module-level and outlive the mount, so a
    // registration nobody releases is a dead element the browser keeps measuring
    // and a handler that fires for a component that no longer exists. The
    // one-call-site prose hook's teardown WAS pinned; the per-instance hook's,
    // which every code block and JSON pane on a page goes through, was not.
    const tracked = trackResizeRegistrations();
    try {
      const { container, unmount } = render(
        <ScrollRegion label="Tool results">
          <p>wide</p>
          <p>wider</p>
        </ScrollRegion>,
      );
      const box = scrollRegion(container);
      const held = [...tracked.observed];
      // The box AND its children: the children are what report the overflowing
      // width, so a teardown that released only the box would leave two behind.
      expect(held).toContain(box);
      expect(held.length).toBeGreaterThanOrEqual(3);

      tracked.observed.length = 0;
      unmount();

      const releasedTargets = new Set(tracked.released);
      expect(held.map((target) => releasedTargets.has(target))).toEqual(held.map(() => true));

      // …and the CONTENT registration goes back too. Editing the detached box
      // must reach no handler: one still registered would re-run the measurement
      // and re-observe the box's children on the shared resize observer.
      box.append(document.createElement('span'));
      await Promise.resolve();
      expect(tracked.observed).toEqual([]);
    } finally {
      tracked.restore();
    }
  });

  it('keeps delivering to the boxes that survive a registration-shedding rebuild', async () => {
    // `MutationObserver` has no `unobserve`, so the only way to drop ONE
    // registration is to disconnect and re-observe everything else. That rebuild
    // is deferred until the dead registrations outnumber the live ones — and it
    // was asserted nowhere, in either half: not that it re-observes the survivors,
    // and not that the records already QUEUED when it happens are still
    // delivered. `takeRecords()` is what carries them across the disconnect, and
    // dropping that call loses a content change silently.
    const disconnects = trackContentDisconnects();
    try {
      const labels = ['a', 'b', 'c', 'd', 'e', 'f'];
      const { container, rerender } = render(
        <>
          {labels.map((label) => (
            <ScrollRegion key={label} label={label}>
              <p>wide</p>
            </ScrollRegion>
          ))}
        </>,
      );
      const boxes = [...container.querySelectorAll<HTMLElement>('.tai-scroll-region')];
      expect(boxes).toHaveLength(labels.length);
      const survivor = nth(boxes, 0);
      setElementOverflow(survivor, true);
      expect(survivor).not.toHaveAttribute('role');

      const before = disconnects.count();
      act(() => {
        // The record is queued FIRST and the rebuild forced SECOND, inside one
        // synchronous turn: `MutationObserver` delivers on a microtask, so this
        // record is sitting on the observer at the moment it is disconnected.
        survivor.append(document.createElement('span'));
        rerender(
          <>
            <ScrollRegion key="a" label="a">
              <p>wide</p>
            </ScrollRegion>
          </>,
        );
      });
      // Five of six registrations died, so the rebuild really ran.
      expect(disconnects.count()).toBeGreaterThan(before);

      // The queued record survived it: the survivor re-measured and took the
      // region attributes its faked overflow calls for.
      await waitFor(() => {
        expect(survivor).toHaveAttribute('role', 'region');
      });

      // …and the survivor is still watched AFTER the rebuild, not only across it.
      survivor.append(document.createElement('em'));
      setElementOverflow(survivor, false);
      await waitFor(() => {
        expect(survivor).not.toHaveAttribute('role');
      });
    } finally {
      disconnects.restore();
    }
  });

  it('takes its focus-release listener back off the box when it unmounts', () => {
    // The per-instance hook adds a `blur` listener to release the tab stop the
    // moment the reader leaves; its teardown must remove it. A box unmounted with
    // the listener still on it is a detached element holding a handler that
    // re-measures a component that no longer exists — invisible to every other
    // assertion here, which watch the shared OBSERVER registrations, not this
    // listener. Deleting `box.removeEventListener('blur', …)` left it green.
    const { container, unmount } = render(
      <ScrollRegion label="Tool results">
        <p>wide</p>
      </ScrollRegion>,
    );
    const box = scrollRegion(container);
    const removed = vi.spyOn(box, 'removeEventListener');
    unmount();
    expect(removed).toHaveBeenCalledWith('blur', expect.any(Function));
  });
});

describe('useProseScrollRegions', () => {
  it('disconnects its own content observer when the prose host unmounts', () => {
    // The prose hook builds its OWN `MutationObserver` — the shared one the
    // per-instance boxes use is module-level and outlives every mount — so its
    // teardown is the only thing that stops it. Rendering a bare prose host and
    // nothing else, the only `MutationObserver.disconnect()` on unmount is this
    // one; dropping it leaves a detached prose subtree re-instrumented forever.
    const disconnects = trackContentDisconnects();
    try {
      const { unmount } = render(<ProseHost html={TABLE_HTML} />);
      const before = disconnects.count();
      unmount();
      expect(disconnects.count()).toBeGreaterThan(before);
    } finally {
      disconnects.restore();
    }
  });

  it('takes its focus-release listener off the root when the prose host unmounts', () => {
    // One `focusout` listener on the ref root releases a stop the whole prose
    // subtree shares; its teardown must remove it, or a detached root keeps a
    // handler firing for regions that no longer exist. No rendered assertion here
    // catches it, so deleting `root.removeEventListener('focusout', …)` was green.
    const { getByTestId, unmount } = render(<ProseHost html={TABLE_HTML} />);
    const root = getByTestId('prose');
    const removed = vi.spyOn(root, 'removeEventListener');
    unmount();
    expect(removed).toHaveBeenCalledWith('focusout', expect.any(Function));
  });

  it('never re-observes a prose surface it is already watching', async () => {
    // Re-observing an element already under a `ResizeObserver` RE-ARMS its
    // initial notification, and the notification re-runs the measurement — so a
    // re-instrumentation pass that re-observed its existing surfaces would make
    // each pass trigger the next one for as long as the document is mounted.
    // Membership of `observed` is the guard, and deleting it left every case in
    // this file green while the identical guard on the shared path reddened.
    //
    // The recorder is installed BEFORE the first render: the stub delivers a
    // target's initial notification from inside `observe()`, so a recorder that
    // arrived later would miss the first pass entirely and read an empty list as
    // proof of a guard that is not there.
    const tracked = trackResizeRegistrations();
    try {
      const { container } = render(<ProseHost html={`<h2>Schema</h2>${TABLE_HTML}`} />);
      const alreadyObserved = new Set(tracked.observed);
      expect(alreadyObserved.size).toBeGreaterThanOrEqual(2);
      tracked.observed.length = 0;

      // A subtree edit that re-runs the whole pass and ADDS a surface, so the
      // pass is proved to have run rather than assumed. The surfaces already
      // instrumented are unchanged elements.
      const prose = within(container).getByTestId('prose');
      prose.insertAdjacentHTML('beforeend', `<h2>Install</h2>${PRE_HTML}`);
      await waitFor(() => {
        expect(tracked.observed.length).toBeGreaterThan(0);
      });

      // The new surface was observed; not one of the old ones was observed again.
      expect(tracked.observed.filter((target) => alreadyObserved.has(target))).toEqual([]);
      expect(tracked.observed).toContain(codeBlock(container));
    } finally {
      tracked.restore();
    }
  });

  it('wraps each injected table in a scroll region', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);

    const wrappers = container.querySelectorAll('.tai-scroll-region');
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]?.firstElementChild?.tagName).toBe('TABLE');
  });

  it('names an overflowing table after the nearest preceding heading', () => {
    const { container } = render(
      <ProseHost
        html={`<h2>Installation</h2><p>text</p><h3>Options</h3><p>text</p>${TABLE_HTML}`}
      />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('finds a heading that sits above the table in an earlier ancestor branch', () => {
    const { container } = render(
      <ProseHost html={`<section><h2>Reference</h2></section><div>${TABLE_HTML}</div>`} />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Reference' })).toBeInTheDocument();
  });

  it('takes the LAST heading inside an earlier sibling, not the first', () => {
    const { container } = render(
      <ProseHost
        html={`<section><h2>Reference</h2><p>text</p><h3>Options</h3><p>text</p></section><div>${TABLE_HTML}</div>`}
      />,
    );

    setOverflowing(scrollRegion(container), true);
    // The section the table follows ended in "Options": that is the section it
    // belongs to, not the "Reference" the section opened with.
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('skips a blank heading and names the table after the section above it', () => {
    const { container } = render(
      <ProseHost html={`<h2>Options</h2><h3>   </h3><p>text</p>${TABLE_HTML}`} />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('skips a blank heading that is the last one inside an earlier sibling', () => {
    const { container } = render(
      <ProseHost html={`<section><h2>Options</h2><h3>   </h3></section>${TABLE_HTML}`} />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('never names a table after a heading inside the table itself', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_WITH_HEADING_HTML}`} />);

    setOverflowing(scrollRegion(container), true);
    // The cell's own heading comes AFTER the table starts, so it names nothing
    // above it — the region belongs to the section the table sits in.
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inner' })).not.toBeInTheDocument();
  });

  it('falls back to the label when the only heading is inside the table', () => {
    const { container } = render(<ProseHost html={TABLE_WITH_HEADING_HTML} />);

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Table' })).toBeInTheDocument();
  });

  it('lets a heading inside an earlier table name the surface that follows it', () => {
    const { container } = render(<ProseHost html={`${TABLE_WITH_HEADING_HTML}${PRE_HTML}`} />);

    setEverythingOverflowing(container);
    expect(screen.getByRole('region', { name: 'Inner' })).toBe(codeBlock(container));
  });

  it('steps over a heading that ENCLOSES the table', () => {
    const { container } = render(
      <ProseHost html={`<h2>Above</h2><h2>Enclosing${TABLE_HTML}</h2>`} />,
    );

    setOverflowing(scrollRegion(container), true);
    // A heading the table sits INSIDE is not a section it sits under.
    expect(screen.getByRole('region', { name: 'Above' })).toBeInTheDocument();
  });

  it('names each surface after its own heading in a single pass', () => {
    const { container } = render(
      <ProseHost html={`<h2>Schema</h2>${TABLE_HTML}<h2>Install</h2>${PRE_HTML}`} />,
    );

    setEverythingOverflowing(container);
    expect(screen.getByRole('region', { name: 'Schema' })).toBe(scrollRegion(container));
    expect(screen.getByRole('region', { name: 'Install' })).toBe(codeBlock(container));
  });

  it('ignores a heading that precedes the instrumented root but sits outside it', () => {
    function Sibling() {
      const ref = useProseScrollRegions();
      return (
        <>
          <h2>Outside</h2>
          <div ref={ref} dangerouslySetInnerHTML={{ __html: TABLE_HTML }} />
        </>
      );
    }
    const { container } = render(<Sibling />);

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Table' })).toBeInTheDocument();
  });

  it('ignores a heading that only FOLLOWS the code block', () => {
    const { container } = render(<ProseHost html={`${PRE_HTML}<h2>Later</h2>`} />);

    setOverflowing(codeBlock(container), true);
    expect(screen.getByRole('region', { name: 'Code block' })).toBeInTheDocument();
  });

  it('falls back to the generic table label with no preceding heading', () => {
    const { container } = render(<ProseHost html={TABLE_HTML} />);

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Table' })).toBeInTheDocument();
  });

  it('honours a caller-supplied fallback label', () => {
    const { container } = render(
      <ProseHost html={TABLE_HTML} labels={{ table: 'Manifest table' }} />,
    );

    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Manifest table' })).toBeInTheDocument();
  });

  it('keeps an injected region focusable while it holds focus, and lets go on blur', () => {
    const { container } = render(<ProseHost html={TABLE_HTML} />);
    const region = scrollRegion(container);

    setOverflowing(region, true);
    act(() => {
      region.focus();
    });
    expect(region).toHaveFocus();

    setOverflowing(region, false);
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveFocus();

    act(() => {
      region.blur();
    });
    expect(region).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('leaves a table that fits unnamed and untabbable', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);

    const wrapper = scrollRegion(container);
    expect(wrapper).not.toHaveAttribute('tabindex');
    expect(wrapper).not.toHaveAttribute('role');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('never double-wraps a table across repeated passes', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
    const wrapper = scrollRegion(container);

    act(() => {
      flushResizeObservers();
      flushResizeObservers();
    });

    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);
    expect(scrollRegion(container)).toBe(wrapper);
  });

  it('re-instruments after the injected HTML is replaced', async () => {
    const { container, rerender } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);

    rerender(<ProseHost html={`<h2>Limits</h2>${TABLE_HTML}${TABLE_HTML}`} />);

    await waitFor(() => {
      expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(2);
    });
    setEverythingOverflowing(container);
    expect(screen.getByRole('region', { name: 'Limits (1)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Limits (2)' })).toBeInTheDocument();
  });

  it('numbers the regions a single heading would otherwise name identically', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}${TABLE_HTML}`} />);

    setEverythingOverflowing(container);
    // Two landmarks answering to "Options" are two a reader cannot choose
    // between, which is the whole use of the region list they appear in.
    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Options (1)',
      'Options (2)',
    ]);
  });

  it('numbers a shared FALLBACK name, and leaves a name only one surface claims', () => {
    const { container } = render(<ProseHost html={`${PRE_HTML}${PRE_HTML}<h2>Install</h2>`} />);

    setEverythingOverflowing(container);
    expect(screen.getByRole('region', { name: 'Code block (1)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code block (2)' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Code block' })).not.toBeInTheDocument();
  });

  it('mints no region past the cap, and still wraps every table', () => {
    // `MAX_PROSE_REGIONS`: publisher-authored prose is unbounded, and every
    // region is an entry in the landmark list a reader navigates by.
    const { container } = render(<ProseHost html={TABLE_HTML.repeat(205)} />);

    // The wrapper is the scroller a `width: 100%` prose table has no other way
    // of getting, so it goes on whether the table is named or not.
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(205);

    setEverythingOverflowing(container);
    expect(screen.getAllByRole('region')).toHaveLength(200);
  });

  it('strips the region from a surface an insertion pushed past the cap', async () => {
    const { container } = render(<ProseHost html={TABLE_HTML.repeat(200)} />);
    setEverythingOverflowing(container);
    const wrappers = [...container.querySelectorAll<HTMLElement>('.tai-scroll-region')];
    expect(wrappers).toHaveLength(200);
    const last = nth(wrappers, 199);
    expect(last).toHaveAttribute('role', 'region');

    // The prose grew at the front, so the surface that was the last named one is
    // now past the cap: it keeps its wrapper and loses its landmark.
    act(() => {
      screen.getByTestId('prose').insertAdjacentHTML('afterbegin', TABLE_HTML);
    });

    await waitFor(() => {
      expect(last).not.toHaveAttribute('role');
    });
    expect(last).not.toHaveAttribute('tabindex');
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(201);
  });

  it('drops the observer registrations a re-instrumentation replaced', async () => {
    const observed = new Set<Element>();
    const Native = globalThis.ResizeObserver;
    class TrackingResizeObserver extends Native {
      override observe(target: Element): void {
        observed.add(target);
        super.observe(target);
      }
      override unobserve(target: Element): void {
        observed.delete(target);
        super.unobserve(target);
      }
      override disconnect(): void {
        observed.clear();
        super.disconnect();
      }
    }
    globalThis.ResizeObserver = TrackingResizeObserver;

    try {
      const { container, rerender } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
      const stale = scrollRegion(container);

      rerender(<ProseHost html={`<h2>Limits</h2>${TABLE_HTML}`} />);
      await waitFor(() => {
        expect(scrollRegion(container)).not.toBe(stale);
      });

      // Every element the replaced pass had registered is detached now, and a
      // registration on a detached element is one the browser keeps maintaining
      // for a surface nobody can see.
      expect([...observed].filter((target) => !container.contains(target))).toEqual([]);
      expect(observed.size).toBeGreaterThan(0);
    } finally {
      globalThis.ResizeObserver = Native;
    }
  });

  it('instruments an overflowing code block in place, with no wrapper', () => {
    const { container } = render(<ProseHost html={`<h2>Install</h2>${PRE_HTML}`} />);

    const pre = codeBlock(container);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(0);
    expect(pre).not.toHaveAttribute('tabindex');

    setOverflowing(pre, true);
    expect(screen.getByRole('region', { name: 'Install' })).toBe(pre);
    expect(pre).toHaveAttribute('tabindex', '0');
  });

  it('falls back to the generic code-block label, and honours a caller override', () => {
    const { container, unmount } = render(<ProseHost html={PRE_HTML} />);
    setOverflowing(codeBlock(container), true);
    expect(screen.getByRole('region', { name: 'Code block' })).toBeInTheDocument();
    unmount();

    const withLabel = render(<ProseHost html={PRE_HTML} labels={{ pre: 'Install snippet' }} />);
    setOverflowing(codeBlock(withLabel.container), true);
    expect(screen.getByRole('region', { name: 'Install snippet' })).toBeInTheDocument();
  });

  it('watches the TABLE, not just its wrapper, so a widening table is re-measured', () => {
    const { container } = render(<ProseHost html={`<h2>Options</h2>${TABLE_HTML}`} />);
    const wrapper = scrollRegion(container);
    const table = wrapper.querySelector('table');
    expect(table).not.toBeNull();

    // The wrapper's own box is fixed by its parent: only the table grows. If the
    // table were not observed, this resize would never reach the measurement.
    setElementOverflow(wrapper, true);
    act(() => {
      flushResizeObserversFor(table as HTMLElement);
    });

    expect(screen.getByRole('region', { name: 'Options' })).toBe(wrapper);
  });

  it('does nothing when the ref is never attached', () => {
    function Detached() {
      useProseScrollRegions();
      return <div data-testid="empty" />;
    }
    const { container } = render(<Detached />);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(0);
  });

  it('instruments a root that mounts later than the hook', () => {
    function LateProse() {
      const ref = useProseScrollRegions();
      const [loaded, setLoaded] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setLoaded(true);
            }}
          >
            load
          </button>
          {loaded ? (
            <div ref={ref} dangerouslySetInnerHTML={{ __html: `<h2>Options</h2>${TABLE_HTML}` }} />
          ) : null}
        </>
      );
    }
    const { container } = render(<LateProse />);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(0);

    // A README that arrives with a later render is the ordinary case — the pane
    // is gated on a query. Nothing re-runs on its own, so the instrumentation
    // has to be attached to the ELEMENT rather than taken from a ref that was
    // empty the one time it was read.
    act(() => {
      screen.getByRole('button', { name: 'load' }).click();
    });

    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);
    setOverflowing(scrollRegion(container), true);
    expect(screen.getByRole('region', { name: 'Options' })).toBeInTheDocument();
  });

  it('follows a root that is swapped for another element', () => {
    function SwappedProse({ section }: { section: string }) {
      const ref = useProseScrollRegions();
      return (
        <div
          key={section}
          ref={ref}
          dangerouslySetInnerHTML={{ __html: `<h2>${section}</h2>${TABLE_HTML}` }}
        />
      );
    }
    const { container, rerender } = render(<SwappedProse section="First" />);
    const first = scrollRegion(container);

    // A keyed remount replaces the element wholesale; the instrumentation has to
    // go with it rather than stay on the detached one.
    rerender(<SwappedProse section="Second" />);

    const second = scrollRegion(container);
    expect(second).not.toBe(first);
    expect(container.querySelectorAll('.tai-scroll-region')).toHaveLength(1);
    setOverflowing(second, true);
    expect(screen.getByRole('region', { name: 'Second' })).toBe(second);
  });

  it('stops observing once the host unmounts', () => {
    const { container, unmount } = render(<ProseHost html={TABLE_HTML} />);
    const wrapper = scrollRegion(container);
    setElementOverflow(wrapper, true);

    unmount();
    act(() => {
      flushResizeObservers();
    });
    expect(wrapper).not.toHaveAttribute('role');
  });

  it('re-measures only the surfaces a resize names, not the whole prose', () => {
    const { container } = render(<ProseHost html={`${PRE_HTML}${PRE_HTML}`} />);
    const surfaces = [...container.querySelectorAll<HTMLElement>('pre')];
    expect(surfaces).toHaveLength(2);
    const first = nth(surfaces, 0);
    const second = nth(surfaces, 1);

    // Both surfaces now overflow, but only ONE of them resized. A callback that
    // re-runs the whole instrumentation pass measures both and names both; an
    // observer that answers the elements it was handed names only the one that
    // moved. On a long document that difference is a full subtree re-query per
    // resize frame.
    setElementOverflow(first, true);
    setElementOverflow(second, true);
    act(() => {
      flushResizeObserversFor(first);
    });

    expect(first).toHaveAttribute('role', 'region');
    expect(second).not.toHaveAttribute('role');
  });

  it('reads every surface before it writes any, so a pass costs one layout', () => {
    const { container } = render(<ProseHost html={`${PRE_HTML}${PRE_HTML}${PRE_HTML}`} />);
    const surfaces = [...container.querySelectorAll<HTMLElement>('pre')];
    expect(surfaces).toHaveLength(3);
    for (const surface of surfaces) setElementOverflow(surface, true);

    // `scrollWidth` is the layout-forcing READ and `setAttribute` the WRITE that
    // invalidates the layout it read. Taken surface by surface, every read after
    // the first write forces the page to be laid out again — so the order the
    // hook touches the DOM in IS the cost, and nothing else here would notice it
    // changing.
    const order: ('read' | 'write')[] = [];
    for (const surface of surfaces) {
      const width = Object.getOwnPropertyDescriptor(surface, 'scrollWidth')?.value as number;
      Object.defineProperty(surface, 'scrollWidth', {
        configurable: true,
        get: () => {
          order.push('read');
          return width;
        },
      });
      const write = surface.setAttribute.bind(surface);
      surface.setAttribute = (name: string, value: string): void => {
        order.push('write');
        write(name, value);
      };
    }

    act(() => {
      flushResizeObservers();
    });

    expect(order.filter((one) => one === 'read')).toHaveLength(3);
    expect(order.filter((one) => one === 'write').length).toBeGreaterThan(0);
    expect(order.lastIndexOf('read')).toBeLessThan(order.indexOf('write'));
  });
});
