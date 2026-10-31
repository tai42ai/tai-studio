/**
 * The tool choosers search each tool's own description, against the LIVE boot skeleton:
 * the tool list and the tools' declared descriptions are the live reads, nothing served.
 *
 * Legs: the conversation route dialog's Tool chooser and the hook register form's Tool
 * chooser each find the reference plugin's echo tool by a word of its docstring that its
 * name does not carry, and take it.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { pickTool, seedCredential } from './helpers';

needs('kind:studio_plugins:reference_plugin');

/** The reference plugin's echo tool, declared "Echo a message back, optionally upper-cased." */
const TOOL = 'studio_demo_echo';

/** A word of the tool's description that its name does not carry. */
const DESCRIPTION_WORD = 'optionally';

/** Open the route create dialog with the target kind set to Tool. */
async function openToolRouteDialog(page: Page): Promise<Locator> {
  await page.goto('/conversations');
  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create route' });
  await dialog.getByRole('combobox', { name: 'Target kind', exact: true }).click();
  await page.getByRole('option', { name: 'Tool', exact: true }).click();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await seedCredential(page);
});

test('the route Tool chooser finds a tool by a word of its description', async ({ page }) => {
  const dialog = await openToolRouteDialog(page);

  await pickTool(page, dialog, TOOL, DESCRIPTION_WORD);

  await expect(dialog.getByRole('combobox', { name: 'Tool', exact: true })).toContainText(TOOL);
});

test('the hook Tool chooser finds a tool by a word of its description', async ({ page }) => {
  await page.goto('/hooks');
  const form = page.getByRole('form', { name: 'Register hook' });

  await pickTool(page, form, TOOL, DESCRIPTION_WORD);

  await expect(form.getByRole('combobox', { name: 'Tool', exact: true })).toContainText(TOOL);
});
