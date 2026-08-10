/**
 * `Tabs` — a wrapper over Radix Tabs (roles `tablist` / `tab` / `tabpanel`,
 * arrow-key roving focus). Panels are declared inline per item. The selected
 * tab's accent rail and heavier label come from `.tai-tab[data-state='active']`
 * in the stylesheet, keyed off the `data-state` Radix stamps on each trigger.
 */
import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export interface TabItem {
  readonly value: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** `'manual'` commits on Enter/Space/click only — arrows just move focus. */
  readonly activationMode?: 'automatic' | 'manual';
}

export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  activationMode = 'automatic',
}: TabsProps) {
  const firstValue = items[0]?.value;
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? firstValue}
      onValueChange={onValueChange}
      activationMode={activationMode}
    >
      <RadixTabs.List className="tai-tablist">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="tai-tab"
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} className="tai-tabpanel">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
