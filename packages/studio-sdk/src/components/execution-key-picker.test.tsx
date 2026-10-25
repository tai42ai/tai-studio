/**
 * The execution-key picker driven with a stub query and a binding: what each binding
 * renders, the read states, the session's own identity offered as a choice, the
 * unlisted row with its comparison lines, and the Field error rule (the host's error
 * shows exactly while a `Select` renders).
 */
import type { TokensPayload } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ExecutionKeyBinding, OwnIdentity } from '../hooks/useCapabilities';
import {
  canHoldExecutionKey,
  ExecutionKeyPicker,
  type ExecutionKeyQuery,
  isExecutionKeyListEmpty,
} from './execution-key-picker';

const KEY_ERROR = 'An execution key is required.';
const FORBIDDEN_NOTE =
  'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.';
const KEY_EMPTY_NOTE =
  'No api keys of yours are listed. Mint one on the settings API-keys tab to run as a narrower key.';
const ACCOUNT_EMPTY_NOTE =
  'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.';

function apiKey(overrides: Partial<TokensPayload[number]> = {}): TokensPayload[number] {
  return {
    user_id: 'svc-events',
    description: 'events service key',
    scopes: [],
    policy_data: { key_fingerprint: 'fp-events' },
    condition: null,
    principal: null,
    orphaned: false,
    ...overrides,
  };
}

function query(overrides: Partial<ExecutionKeyQuery>): ExecutionKeyQuery {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

const loaded = (keys: TokensPayload): ExecutionKeyQuery => query({ data: keys, isSuccess: true });
const pending = (): ExecutionKeyQuery => query({ isPending: true });
const forbidden = (): ExecutionKeyQuery => query({ isError: true, error: { status: 403 } });
const failed = (): ExecutionKeyQuery =>
  query({ isError: true, error: Object.assign(new Error('keys boom'), { status: 500 }) });

function checked(own: Partial<OwnIdentity> = {}): ExecutionKeyBinding {
  return { mode: 'checked', own: { userId: 'me', kind: 'key', admin: false, ...own } };
}
const ACCOUNT = checked({ kind: 'account' });
const UNCHECKED: ExecutionKeyBinding = { mode: 'unchecked', fillKey: '__no_auth__' };
const PENDING: ExecutionKeyBinding = { mode: 'pending' };

function renderPicker(
  q: ExecutionKeyQuery,
  binding: ExecutionKeyBinding,
  value = '',
  extra: { readonly description?: string; readonly error?: string } = { error: KEY_ERROR },
) {
  const onValueChange = vi.fn();
  const view = render(
    <ExecutionKeyPicker
      query={q}
      binding={binding}
      value={value}
      onValueChange={onValueChange}
      {...extra}
    />,
  );
  return { onValueChange, ...view };
}

async function optionLabels(): Promise<(string | null)[]> {
  await userEvent.setup().click(screen.getByRole('combobox', { name: /Execution key/ }));
  return screen.getAllByRole('option').map((option) => option.textContent);
}

function describedTexts(element: HTMLElement): string[] {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '');
}

describe('ExecutionKeyPicker — binding', () => {
  it('unchecked renders nothing over any query', () => {
    for (const q of [loaded([apiKey()]), pending(), failed(), loaded([])]) {
      const { container, unmount } = renderPicker(q, UNCHECKED);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('pending renders the disabled "Loading keys…" Select over a loaded list', () => {
    renderPicker(loaded([apiKey()]), PENDING);
    const combobox = screen.getByRole('combobox', { name: /Execution key/ });
    expect(combobox).toBeDisabled();
    expect(combobox).toHaveTextContent('Loading keys…');
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
  });

  it('keeps the same control when the binding resolves, enabling it in place', () => {
    const { rerender } = renderPicker(loaded([apiKey()]), PENDING);
    const combobox = screen.getByRole('combobox', { name: /Execution key/ });
    rerender(
      <ExecutionKeyPicker
        query={loaded([apiKey()])}
        binding={ACCOUNT}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    expect(combobox).toBeInTheDocument();
    expect(combobox).toBeEnabled();
    expect(combobox).toHaveTextContent('Select an execution key');
  });

  it('takes a description; the default speaks of a fire', () => {
    const { unmount } = renderPicker(loaded([apiKey()]), ACCOUNT, '', {
      description: 'The api key each turn runs AS.',
    });
    expect(screen.getByText('The api key each turn runs AS.')).toBeInTheDocument();
    unmount();
    renderPicker(loaded([apiKey()]), ACCOUNT);
    expect(screen.getByText(/The api key this fire runs AS\./)).toBeInTheDocument();
  });
});

describe('ExecutionKeyPicker — read states (account session)', () => {
  it('lists the pickable keys and shows the required-field error while the list is healthy', () => {
    renderPicker(loaded([apiKey()]), ACCOUNT);
    expect(screen.getByRole('combobox', { name: /Execution key/ })).toBeInTheDocument();
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
  });

  it('over an empty list: the account note, no own-identity option, no error', () => {
    renderPicker(loaded([]), ACCOUNT);
    expect(screen.getByRole('status')).toHaveTextContent(ACCOUNT_EMPTY_NOTE);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(KEY_ERROR)).toBeNull();
  });

  it('a failed list shows the ErrorState with Retry and no error', () => {
    renderPicker(failed(), ACCOUNT);
    expect(screen.getByRole('alert')).toHaveTextContent('keys boom');
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByText(KEY_ERROR)).toBeNull();
  });

  it('a 403: the no-grant note, no Retry, no Select and no error', () => {
    renderPicker(forbidden(), ACCOUNT);
    expect(screen.getByRole('status')).toHaveTextContent(FORBIDDEN_NOTE);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(KEY_ERROR)).toBeNull();
  });

  it('no own-identity option over a list', async () => {
    renderPicker(loaded([apiKey()]), ACCOUNT);
    expect(await optionLabels()).toEqual(['svc-events — events service key · fp-events']);
  });
});

describe('ExecutionKeyPicker — a key session’s own identity', () => {
  it('over [] the own identity is the sole option, with the key note in place of the empty note', async () => {
    const { onValueChange } = renderPicker(loaded([]), checked());
    expect(screen.getByRole('status')).toHaveTextContent(KEY_EMPTY_NOTE);
    expect(screen.queryByText(ACCOUNT_EMPTY_NOTE)).toBeNull();
    expect(await optionLabels()).toEqual(["me — this session's identity"]);
    await userEvent
      .setup()
      .click(screen.getByRole('option', { name: "me — this session's identity" }));
    expect(onValueChange).toHaveBeenCalledWith('me');
  });

  it('selected, it shows the own-identity line in the control description', () => {
    renderPicker(loaded([]), checked(), 'me');
    const line = "This runs as this session's own identity, me, with its live grants.";
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(describedTexts(screen.getByRole('combobox', { name: /Execution key/ }))).toContain(line);
    expect(screen.queryByText(/not a listed key/)).toBeNull();
  });

  it('over a list holding the identity the option appears once, with the key’s own label', async () => {
    renderPicker(loaded([apiKey({ user_id: 'me', description: 'mine' })]), checked());
    const labels = await optionLabels();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatch(/^me — mine/);
  });

  it('under a 403 it sits beside the stored value, below the no-grant note', async () => {
    renderPicker(forbidden(), checked(), 'svc-x');
    expect(screen.getByRole('status')).toHaveTextContent(FORBIDDEN_NOTE);
    expect(await optionLabels()).toEqual(['svc-x', "me — this session's identity"]);
  });

  it('not while pending and not on a 500', async () => {
    const { unmount } = renderPicker(pending(), checked());
    expect(screen.getByRole('combobox', { name: /Execution key/ })).toBeDisabled();
    unmount();
    renderPicker(failed(), checked());
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ExecutionKeyPicker — the Field error rule', () => {
  it.each([
    ['[]', loaded([])],
    ['a 403', forbidden()],
  ])('a key session over %s shows the error under the Select, in its description', (_, q) => {
    renderPicker(q, checked());
    const combobox = screen.getByRole('combobox', { name: 'Execution key' });
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
    expect(describedTexts(combobox)).toContain(KEY_ERROR);
    expect(screen.queryByRole('group', { name: /Execution key/ })).toBeNull();
  });

  it.each([
    ['[]', loaded([])],
    ['a 403', forbidden()],
  ])('an account session over %s shows no error', (_, q) => {
    renderPicker(q, ACCOUNT);
    expect(screen.queryByText(KEY_ERROR)).toBeNull();
  });

  it.each([
    ['[]', loaded([])],
    ['a 403', forbidden()],
  ])('a stored value over %s shows the error under the Select', (_, q) => {
    renderPicker(q, ACCOUNT, 'svc-x');
    expect(screen.getByRole('combobox', { name: 'Execution key' })).toBeInTheDocument();
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
  });

  it('the pending Select shows it; a 500 does not', () => {
    const { unmount } = renderPicker(pending(), checked());
    expect(screen.getByText(KEY_ERROR)).toBeInTheDocument();
    unmount();
    renderPicker(failed(), checked());
    expect(screen.queryByText(KEY_ERROR)).toBeNull();
  });
});

describe('ExecutionKeyPicker — an unlisted stored key', () => {
  const LIST = [apiKey({ user_id: 'svc-a', description: 'a' })];

  it.each([
    [
      'key, non-admin',
      checked({ userId: 'alice' }),
      'svc-x is not a listed key. The server accepts an unlisted key only when it is your own identity; any other value is refused on save.',
      "svc-x is not this session's identity (alice), so the server will refuse it on save.",
    ],
    [
      'key, admin',
      checked({ userId: 'alice', admin: true }),
      'svc-x is not a listed key. As an admin you may bind another identity; the server checks it on save.',
      "svc-x is not this session's identity (alice).",
    ],
    [
      'account, non-admin',
      checked({ userId: 'alice', kind: 'account' }),
      'svc-x is not a listed key. The server accepts only an api key you own; any other value is refused on save.',
      "svc-x is not this session's identity (alice), so the server will refuse it on save.",
    ],
    [
      'account, admin',
      checked({ userId: 'alice', kind: 'account', admin: true }),
      'svc-x is not a listed key. As an admin you may bind another identity; the server checks it on save.',
      "svc-x is not this session's identity (alice).",
    ],
  ])(
    '%s: the flagged first option, the unlisted line and the identity line',
    async (_, binding, hint, note) => {
      renderPicker(loaded(LIST), binding, 'svc-x');
      const combobox = screen.getByRole('combobox', { name: 'Execution key' });
      expect(combobox).toHaveTextContent('svc-x (not a listed key)');
      expect(combobox).toBeEnabled();
      const hintLine = screen.getByText(hint, { exact: false });
      expect(within(hintLine).getByText('not a listed key')).toBeInTheDocument();
      const noteLine = screen.getByRole('status');
      expect(noteLine).toHaveTextContent(`not your identity ${note}`);
      const described = describedTexts(combobox);
      expect(described[0]).toBe(`not a listed key ${hint}`);
      expect(described[1]).toBe(`not your identity ${note}`);
      expect((await optionLabels())[0]).toBe('svc-x (not a listed key)');
    },
  );

  it('an account session’s own account: the badge "not an api key" and its line', () => {
    renderPicker(loaded(LIST), checked({ userId: 'alice', kind: 'account' }), 'alice');
    expect(screen.getByRole('status')).toHaveTextContent(
      "not an api key alice is this session's account, not an api key, so the server will refuse it on save.",
    );
  });

  it('a key session’s own identity is the offered choice, with neither line', () => {
    renderPicker(loaded(LIST), checked({ userId: 'alice' }), 'alice');
    expect(screen.getByRole('combobox', { name: 'Execution key' })).toHaveTextContent(
      "alice — this session's identity",
    );
    expect(screen.queryByText(/not a listed key/)).toBeNull();
    expect(screen.queryByText(/not your identity/)).toBeNull();
  });

  it('an empty list with a stored key: the flagged sole option beside the empty note', async () => {
    renderPicker(loaded([]), ACCOUNT, 'svc-x');
    expect(screen.getByText(ACCOUNT_EMPTY_NOTE)).toBeInTheDocument();
    expect(await optionLabels()).toEqual(['svc-x (not a listed key)']);
  });

  it('no line for a listed value, while pending, on a 403 or another error', () => {
    const cases: [ExecutionKeyQuery, string][] = [
      [loaded(LIST), 'svc-a'],
      [pending(), 'svc-x'],
      [forbidden(), 'svc-x'],
      [failed(), 'svc-x'],
    ];
    for (const [q, value] of cases) {
      const { unmount } = renderPicker(q, checked({ userId: 'alice' }), value);
      expect(screen.queryByText(/not a listed key/)).toBeNull();
      expect(screen.queryByText(/not your identity/)).toBeNull();
      unmount();
    }
  });
});

describe('canHoldExecutionKey', () => {
  const lists = [pending(), failed(), forbidden(), loaded([]), loaded([apiKey()])];

  it('unchecked is true over any list; pending is false over any list', () => {
    for (const q of lists) {
      expect(canHoldExecutionKey(q, UNCHECKED, '')).toBe(true);
      expect(canHoldExecutionKey(q, PENDING, 'svc-x')).toBe(false);
    }
  });

  it('checked: an empty list is true for a key session and false for an account', () => {
    expect(canHoldExecutionKey(loaded([]), checked(), '')).toBe(true);
    expect(canHoldExecutionKey(loaded([]), ACCOUNT, '')).toBe(false);
    expect(canHoldExecutionKey(loaded([]), ACCOUNT, 'svc-x')).toBe(true);
  });

  it('checked: a pending or failed list stays false whatever the value', () => {
    for (const binding of [checked(), ACCOUNT]) {
      for (const value of ['', 'svc-x']) {
        expect(canHoldExecutionKey(pending(), binding, value)).toBe(false);
        expect(canHoldExecutionKey(failed(), binding, value)).toBe(false);
      }
    }
  });

  it('checked: a 403 is true for a key session, and for an account only with a value', () => {
    expect(canHoldExecutionKey(forbidden(), checked(), '')).toBe(true);
    expect(canHoldExecutionKey(forbidden(), ACCOUNT, '')).toBe(false);
    expect(canHoldExecutionKey(forbidden(), ACCOUNT, 'svc-x')).toBe(true);
  });

  it('checked: a listed key is true', () => {
    expect(canHoldExecutionKey(loaded([apiKey()]), ACCOUNT, '')).toBe(true);
  });
});

describe('isExecutionKeyListEmpty', () => {
  it('is empty only when the read resolved with no keys', () => {
    expect(isExecutionKeyListEmpty(query({ data: [], isSuccess: true }))).toBe(true);
    expect(isExecutionKeyListEmpty(query({ data: [apiKey()], isSuccess: true }))).toBe(false);
    expect(isExecutionKeyListEmpty(query({ isPending: true }))).toBe(false);
  });
});
