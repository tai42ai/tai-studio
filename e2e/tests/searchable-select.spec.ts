/**
 * The searchable chooser's keyboard and its long-list search, driven through the
 * conversation route dialog's Tool picker against the LIVE boot skeleton. The tool list
 * is served through `page.route` as two hundred names, so the list scrolls far past its
 * first rows; the route list is served empty, and every other read is the live one.
 *
 * Legs: Home and End move the highlight to the first and last tool; Tab closes the popup
 * without choosing and lands on the control after the chooser, Shift+Tab on the one before
 * it; and a new query over a list scrolled or hovered far down highlights the first match
 * with the list shown from its top.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import { stubRead } from './session-stubs';

needs();

/** Two hundred tool names, `tool_000` to `tool_199`, in list order. */
const TOOLS = Array.from({ length: 200 }, (_, index) => `tool_${String(index).padStart(3, '0')}`);

/** Open the route create dialog with the target kind set to Tool, and its Tool chooser. */
async function openToolChooser(page: Page): Promise<{ dialog: Locator; trigger: Locator }> {
  await seedCredential(page);
  await stubRead(page, '/api/conversations', {
    data: { items: [], total: 0, page: 1, page_size: 100, next_page: null, truncated: false },
  });
  await stubRead(page, '/api/tools', { data: TOOLS });
  await page.goto('/conversations');
  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Target kind', exact: true }).click();
  await page.getByRole('option', { name: 'Tool', exact: true }).click();
  const trigger = dialog.getByRole('combobox', { name: 'Tool', exact: true });
  await trigger.click();
  await expect(search(page)).toBeFocused();
  await expect(page.getByRole('option', { name: TOOLS[0], exact: true })).toBeVisible();
  return { dialog, trigger };
}

function search(page: Page): Locator {
  return page.getByRole('combobox', { name: 'Search tools' });
}

function option(page: Page, name: string): Locator {
  return page.getByRole('option', { name, exact: true });
}

/** The chooser's scrolling list of options. */
function list(page: Page): Locator {
  return page.getByRole('listbox');
}

test('Home and End move the highlight to the first and the last tool', async ({ page }) => {
  await openToolChooser(page);

  await search(page).press('End');
  await expect(option(page, 'tool_199')).toHaveAttribute('data-highlighted');
  await expect(option(page, 'tool_199')).toBeInViewport();

  await search(page).press('Home');
  await expect(option(page, 'tool_000')).toHaveAttribute('data-highlighted');
  await expect(option(page, 'tool_000')).toBeInViewport();
});

test('Tab leaves the chooser for the next control without choosing, Shift+Tab for the one before', async ({
  page,
}) => {
  const { dialog, trigger } = await openToolChooser(page);

  await search(page).press('ArrowDown');
  await search(page).press('Tab');
  await expect(search(page)).toBeHidden();
  await expect(dialog.getByRole('combobox', { name: 'Door', exact: true })).toBeFocused();
  await expect(trigger).not.toContainText('tool_');

  await trigger.click();
  await expect(search(page)).toBeFocused();
  await search(page).press('Shift+Tab');
  await expect(search(page)).toBeHidden();
  await expect(dialog.getByRole('combobox', { name: 'Target kind', exact: true })).toBeFocused();
  await expect(trigger).not.toContainText('tool_');
});

test('a query typed after scrolling far down highlights the first match at the top of the list', async ({
  page,
}) => {
  await openToolChooser(page);

  await option(page, 'tool_190').scrollIntoViewIfNeeded();
  await expect(option(page, 'tool_000')).not.toBeInViewport();

  // The query still matches a hundred tools, the scrolled-to one among them.
  await search(page).fill('tool_1');
  await expect(option(page, 'tool_100')).toHaveAttribute('data-highlighted');
  await expect(option(page, 'tool_100')).toBeInViewport();
  await expect.poll(() => list(page).evaluate((element) => element.scrollTop)).toBe(0);
});

test('a query that still matches a hovered tool far down highlights the first match instead', async ({
  page,
}) => {
  await openToolChooser(page);

  await option(page, 'tool_185').scrollIntoViewIfNeeded();
  await option(page, 'tool_185').hover();
  await expect(option(page, 'tool_185')).toHaveAttribute('data-highlighted');

  await search(page).fill('tool_18');
  await expect(option(page, 'tool_180')).toHaveAttribute('data-highlighted');
  await expect(option(page, 'tool_185')).not.toHaveAttribute('data-highlighted');
  await expect(option(page, 'tool_180')).toBeInViewport();
  await expect.poll(() => list(page).evaluate((element) => element.scrollTop)).toBe(0);
});
