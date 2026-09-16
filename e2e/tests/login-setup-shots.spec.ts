/**
 * Opt-in design-review frames for the login screen's setup state and the
 * sign-in state it becomes once a deployment is initialized. Title prefix
 * `sweep:` marks it opt-in — reveal it with `--grep "sweep:"`; a plain run
 * collects it and SKIPS it, because it only runs against a deployment that still
 * reports `needs_setup` (boot with `STUDIO_SEED_AUTH=0`).
 *
 * The setup door initializes the deployment exactly once, so the five frames are
 * captured in ONE ordered sweep over a single page, and both themes are shot at
 * each step by toggling `emulateMedia` — never by a fresh page, which would find
 * the deployment already set up. The order is: the token step; the revealed owner
 * form; the owner form carrying the rejected-token error (a deliberately wrong
 * token is submitted first, which creates nothing); then the correct token is
 * entered and submitted, giving the once-shown success view; then a reload lands
 * on the initialized deployment's sign-in state.
 *
 * The frames adapt to the running deployment's login capability: with an
 * accounts provider that can attach a login (`setup_login` non-null) the owner
 * form carries the email + login-method fields; with none (the lean boot) it
 * carries the keys-only note and the success view shows the key alone.
 *
 * The PNGs land in `SETUP_SHOTS_OUT` (default: the gitignored `test-results/`),
 * so a reviewer can point it at any directory for out-of-tree evidence without
 * the shots ever being committed.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Page, request as apiRequest, test } from '@playwright/test';

/** The login card master viewport, matched to the other login/docs frames. */
const VIEWPORT = { width: 1440, height: 900 } as const;

/** The skeleton origin. Mirrors playwright.config.ts's `baseURL`, so the probe
 * reaches the same skeleton the page drives (a reused server on a non-default
 * port is honoured through `STUDIO_PORT`). */
const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

/** Where the PNGs are written. An absolute out-of-tree path is passed through the
 * env; the default keeps artifacts inside the gitignored `test-results/` tree. */
const OUT_DIR =
  process.env.SETUP_SHOTS_OUT ??
  fileURLToPath(new URL('../test-results/login-setup-shots', import.meta.url));

/** The setup-door token the deployment requires. Matches boot.sh's default so the
 * sweep runs against the standard e2e boot without extra wiring. */
const SETUP_TOKEN = process.env.TAI_SETUP_TOKEN ?? 'e2e-setup-token-DO-NOT-USE-IN-PRODUCTION';

/** A token the deployment does not hold, so its submit is rejected with the 403
 * copy — the state the error frame captures. It creates nothing, so the correct
 * token still initializes the deployment afterwards. */
const WRONG_TOKEN = 'not-the-setup-token';

/** The owner's display name the frames create the deployment under. */
const OWNER_DISPLAY_NAME = 'Studio owner';

/** An email used only when the deployment attaches an interactive login. */
const OWNER_EMAIL = 'owner@example.com';

/** A password meeting the setup form's minimum, used with a password login. */
const OWNER_PASSWORD = 'correct horse staple';

/** The fixed copy the frames key their waits on — one source with the screen. */
const COPY = {
  setupHeading: 'Set up this deployment',
  successHeading: 'Deployment set up',
  signInHeading: 'Sign in to the Studio',
  badToken: 'The setup token was not accepted.',
} as const;

const THEMES = ['light', 'dark'] as const;

/** The deployment's setup capability, read once before the sweep: whether it
 * awaits setup at all, and which login kinds (if any) it can attach. */
let needsSetup = false;
let loginKinds: readonly string[] | null = null;

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const api = await apiRequest.newContext({ baseURL: BASE_URL });
  try {
    const res = await api.get('/api/login/methods');
    if (!res.ok()) {
      throw new Error(
        `GET /api/login/methods failed (${String(res.status())}): ${await res.text()}`,
      );
    }
    const body = (await res.json()) as {
      data?: { needs_setup?: boolean; setup_login?: { kinds?: string[] } | null };
    };
    needsSetup = body.data?.needs_setup === true;
    const setupLogin = body.data?.setup_login;
    loginKinds = setupLogin == null ? null : (setupLogin.kinds ?? []);
  } finally {
    await api.dispose();
  }
});

/** Toggle each theme and capture the current screen. The theme provider follows
 * `prefers-color-scheme`, so emulating it flips `data-theme`; the frame asserts
 * the flip resolved before shooting, and lets layout settle first. */
async function frame(page: Page, name: string): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_DIR}/${name}-${theme}.png` });
  }
}

test.describe(() => {
  test.use({ viewport: VIEWPORT });

  test('sweep: login setup and sign-in frames', async ({ page }) => {
    test.skip(
      !needsSetup,
      'the setup frames need a deployment that still reports needs_setup (boot with STUDIO_SEED_AUTH=0)',
    );

    const attachesLogin = loginKinds !== null;

    // State A, token step: the token field alone; the owner form is hidden until
    // Continue reveals it client-side (the token is not sent yet).
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: COPY.setupHeading }).waitFor({ state: 'visible' });
    // The token form and its input share the "Setup token" accessible name, so a
    // label lookup resolves both; the input is the only control that carries the
    // textbox role, so it is addressed by role with the exact name.
    const tokenField = page.getByRole('textbox', { name: 'Setup token', exact: true });
    await tokenField.fill(WRONG_TOKEN);
    await frame(page, 'login-setup-token');

    // State A, revealed owner form. With no login-attaching provider it is the
    // keys-only variant (a note, no email/method fields); with one it carries the
    // email and the login-method radio, whose "Set a password now" option is the
    // default when the provider offers a password login, so the password field is
    // shown without selecting it. Fields are addressed unambiguously: the exact
    // label for Display name and Email, and the textbox role for Password (its
    // "Password" label is a substring of the "Set a password now" radio's name).
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const displayName = page.getByLabel('Display name', { exact: true });
    await displayName.waitFor({ state: 'visible' });
    await displayName.fill(OWNER_DISPLAY_NAME);
    if (attachesLogin) {
      await page.getByLabel('Email', { exact: true }).fill(OWNER_EMAIL);
      if (loginKinds?.includes('password')) {
        await page.getByRole('textbox', { name: 'Password' }).fill(OWNER_PASSWORD);
      }
    }
    await frame(page, 'login-setup-owner');

    // State A, rejected token: submitting the wrong token surfaces the 403 copy
    // inline above the primary button, keeping the owner values.
    await page.getByRole('button', { name: 'Create owner and key' }).click();
    await page.getByRole('alert').filter({ hasText: COPY.badToken }).waitFor({ state: 'visible' });
    await frame(page, 'login-setup-error-token');

    // The correct token: Change token returns to the token step (the owner values
    // are kept), the right token is entered, and the single submit initializes the
    // deployment and shows the success view with the once-shown key.
    await page.getByRole('button', { name: 'Change token' }).click();
    await tokenField.waitFor({ state: 'visible' });
    await tokenField.fill(SETUP_TOKEN);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await displayName.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Create owner and key' }).click();
    await page.getByRole('heading', { name: COPY.successHeading }).waitFor({ state: 'visible' });
    // With a password login attached, the success view confirms it against the
    // owner email; the keys-only variant shows no such line.
    if (attachesLogin && loginKinds?.includes('password')) {
      await expect(page.getByText(`Password set for ${OWNER_EMAIL}.`)).toBeVisible();
    }
    await frame(page, 'login-setup-success');

    // State B: the deployment is initialized, so a reload lands on the sign-in
    // state — no setup entry. With a login-attaching provider the deployment now
    // declares its password sign-in form, and the key-paste fallback collapses
    // behind its opener; with none the key-paste form is the whole surface,
    // expanded. The frame waits on whichever the running deployment shows.
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: COPY.signInHeading }).waitFor({ state: 'visible' });
    if (attachesLogin) {
      await page
        .getByRole('button', { name: 'Sign in', exact: true })
        .waitFor({ state: 'visible' });
    } else {
      await page.getByLabel('API key').waitFor({ state: 'visible' });
    }
    await frame(page, 'login-signin');
  });
});
