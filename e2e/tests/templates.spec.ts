/**
 * Templates (PLAN_7), against the LIVE boot skeleton with the storage-presence
 * signal + template list + upload door stubbed via `page.route`.
 *
 * Legs: path-shaped template keys fold into a virtual folder tree that navigates
 * inward; a multi-file upload loops the single-item door and reports a per-file
 * outcome — one simulated failure stays marked Failed while its sibling uploads.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

const TEMPLATE_KEYS = ['prompts/welcome.md', 'prompts/emails/greeting.md', 'root.md'];

async function stubTemplates(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/storage',
    async (route) => {
      await route.fulfill({ json: { data: { present: true, provider: 'fs', module: 'fs' } } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/templates',
    async (route) => {
      await route.fulfill({ json: { data: TEMPLATE_KEYS } });
    },
  );
}

test('path-shaped keys fold into a folder tree that navigates inward', async ({ page }) => {
  await stubTemplates(page);
  await page.goto('/templates');

  // The root shows the `prompts` folder and the root-level file — not the nested keys flat.
  await expect(page.getByRole('button', { name: 'prompts', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open template root.md' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open template prompts/welcome.md' })).toHaveCount(0);

  // Opening the folder descends into it: the nested `emails` subfolder and the
  // folder's own file surface.
  await page.getByRole('button', { name: 'prompts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'emails', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open template prompts/welcome.md' })).toBeVisible();
});

test('a multi-file upload reports a per-file outcome with one simulated failure', async ({
  page,
}) => {
  await stubTemplates(page);
  // The upload door succeeds for one path and 500s for the other.
  await page.route(
    (url) => url.pathname === '/api/upload-template',
    async (route) => {
      const body = route.request().postDataJSON() as { path?: string };
      if (body.path === 'bad.md') {
        await route.fulfill({ status: 500, json: { error: 'disk full' } });
        return;
      }
      await route.fulfill({ json: { data: { path: body.path, uploaded: true } } });
    },
  );

  await page.goto('/templates');
  await page.getByRole('radio', { name: 'Files' }).check();

  await page.getByLabel('Choose files').setInputFiles([
    { name: 'ok.md', mimeType: 'text/markdown', buffer: Buffer.from('hello') },
    { name: 'bad.md', mimeType: 'text/markdown', buffer: Buffer.from('nope') },
  ]);

  const list = page.getByRole('list', { name: 'Selected files' });
  await expect(list.getByText('ok.md')).toBeVisible();
  await expect(list.getByText('bad.md')).toBeVisible();

  await page.getByRole('button', { name: 'Upload', exact: true }).click();

  // Each file carries its OWN settled outcome: one Uploaded, one Failed — and the
  // batch surfaces that some failed (the failed one is retryable, not hidden).
  await expect(list.getByText('Uploaded')).toBeVisible();
  await expect(list.getByText('Failed')).toBeVisible();
  await expect(page.getByText('Some files failed to upload.')).toBeVisible();
});
