/**
 * `Tabs` — a token-styled wrapper over Radix Tabs (roles `tablist` / `tab` /
 * `tabpanel`, arrow-key roving focus). Panels are declared inline per item.
 */
import * as RadixTabs from '@radix-ui/react-tabs';
import type { CSSProperties, ReactNode } from 'react';

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
}

const listStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-1)',
  borderBottom: '1px solid var(--tai-color-border)',
};

const triggerStyle: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text-muted)',
  cursor: 'pointer',
};

const panelStyle: CSSProperties = {
  padding: 'var(--tai-space-4) 0',
  color: 'var(--tai-color-text)',
};

export function Tabs({ items, value, defaultValue, onValueChange }: TabsProps) {
  const firstValue = items[0]?.value;
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? firstValue}
      onValueChange={onValueChange}
    >
      <RadixTabs.List style={listStyle}>
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            style={triggerStyle}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value} style={panelStyle}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
