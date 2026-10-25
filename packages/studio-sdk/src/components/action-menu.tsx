/**
 * `ActionMenu` — a row's or a card's overflow menu: a ghost "Actions" button
 * whose accessible name the caller completes ("Actions for <name>", which keeps
 * the visible word at its start) that opens a `role="menu"` list of
 * `role="menuitem"` buttons, the WAI-ARIA menu-button pattern.
 *
 * Opening moves focus to the first item; ArrowDown/ArrowUp move between items
 * (wrapping), Home/End jump to the ends, Escape closes and returns focus to the
 * trigger, Tab closes. Activating an item closes the menu, returns focus to the
 * trigger, then runs the item's action, so a dialog the action opens takes focus
 * from a settled trigger. A pointer press outside the menu closes it.
 *
 * The caller passes only the items the session may use; with none the menu is
 * not drawn at all (a hidden control takes no line).
 */
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ChevronDownIcon } from './icons';

export interface ActionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  /** Paints the item in the error tone (a destructive action). */
  readonly danger?: boolean;
}

export interface ActionMenuProps {
  /** The trigger's accessible name, e.g. "Actions for Acme". */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
}

export function ActionMenu({ label, items }: ActionMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[0]?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (menuRef.current?.contains(target) === true) return;
      if (triggerRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusItem = (index: number): void => {
    const count = items.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="tai-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="tai-btn tai-btn-ghost"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((was) => !was);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        Actions
        <ChevronDownIcon />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          className="tai-action-menu-list"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={
                item.danger === true
                  ? 'tai-action-menu-item tai-action-menu-item-danger'
                  : 'tai-action-menu-item'
              }
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
