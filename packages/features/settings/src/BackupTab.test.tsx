import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient, BackupImportReport } from '@tai42/api-client';

import { BackupTab } from './BackupTab';
import { renderWithProviders } from './test-utils';

function sectionsFixture(): { name: string; secret: boolean }[] {
  return [
    { name: 'manifest', secret: false },
    { name: 'env', secret: true },
    { name: 'access_control', secret: true },
  ];
}

function backupDoc(): unknown {
  return {
    version: 1,
    created_at: '2026-07-05T00:00:00Z',
    sections: { manifest: { mcp: [] }, env: { env: {} } },
  };
}

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}
function baseStub(overrides: Stub = {}): ApiClient {
  return stubClient({
    listBackupSections: vi.fn(() => Promise.resolve(sectionsFixture())),
    ...overrides,
  });
}

async function uploadBackup(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const input = screen.getByLabelText('Backup file');
  const file = new File([JSON.stringify(backupDoc())], 'backup.json', {
    type: 'application/json',
  });
  await user.upload(input, file);
}

let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createObjectURL = vi.fn(() => 'blob:mock');
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BackupTab', () => {
  it('defaults secret sections unchecked and warns when one is checked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub() });

    expect(await screen.findByRole('checkbox', { name: 'manifest' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'env' })).not.toBeChecked();
    expect(screen.queryByText(/store it like a secret/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'env' }));
    expect(await screen.findByText(/store it like a secret/i)).toBeInTheDocument();
  });

  it('exports the chosen sections and triggers a download', async () => {
    const user = userEvent.setup();
    const exportBackup = vi.fn(() =>
      Promise.resolve(new Blob(['{}'], { type: 'application/json' })),
    );
    // Spy the anchor click so jsdom does not attempt (and log) a real navigation;
    // the download wiring is still asserted for real via the captured anchor.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const appendChild = vi.spyOn(document.body, 'appendChild');
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub({ exportBackup }) });

    await screen.findByRole('checkbox', { name: 'manifest' });
    await user.click(screen.getByRole('button', { name: 'Export backup' }));

    await waitFor(() => {
      expect(exportBackup).toHaveBeenCalledWith(['manifest']);
    });
    const anchor = appendChild.mock.calls
      .map((call) => call[0])
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
    expect(createObjectURL).toHaveBeenCalled();
    expect(anchor?.getAttribute('href')).toBe('blob:mock');
    expect(anchor?.download).toMatch(/^tai-backup-.*\.json$/);
  });

  it('renders the import report with highlighted error rows', async () => {
    const user = userEvent.setup();
    const report: BackupImportReport = {
      ok: true,
      sections: {
        manifest: { created: 1, updated: 0, skipped: 0, errors: [] },
        env: { created: 0, updated: 0, skipped: 1, errors: ['env var rejected'] },
      },
    };
    const importBackup = vi.fn().mockResolvedValue(report);
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub({ importBackup }) });

    await screen.findByRole('button', { name: 'Choose backup file' });
    await uploadBackup(user);
    await user.click(await screen.findByRole('button', { name: 'Import selected' }));

    const errorRow = await screen.findByTestId('report-row-env');
    expect(within(errorRow).getByText('env var rejected')).toBeInTheDocument();
    expect(screen.getByTestId('report-row-manifest')).toBeInTheDocument();
  });

  it('escapes untrusted per-section error strings', async () => {
    const user = userEvent.setup();
    const report: BackupImportReport = {
      ok: false,
      sections: {
        env: { created: 0, updated: 0, skipped: 0, errors: ['<img src=x onerror=alert(1)>'] },
      },
    };
    const importBackup = vi.fn().mockResolvedValue(report);
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub({ importBackup }) });

    await screen.findByRole('button', { name: 'Choose backup file' });
    await uploadBackup(user);
    await user.click(await screen.findByRole('button', { name: 'Import selected' }));

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[onerror]')).toBeNull();
  });

  it('raises a loud failure banner when the report is not ok', async () => {
    const user = userEvent.setup();
    const report: BackupImportReport = {
      ok: false,
      sections: { env: { created: 0, updated: 0, skipped: 0, errors: ['boom'] } },
    };
    const importBackup = vi.fn().mockResolvedValue(report);
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub({ importBackup }) });

    await screen.findByRole('button', { name: 'Choose backup file' });
    await uploadBackup(user);
    await user.click(await screen.findByRole('button', { name: 'Import selected' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Import failed');
  });

  it('surfaces malformed JSON loudly and does not import', async () => {
    const user = userEvent.setup();
    const importBackup = vi.fn();
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub({ importBackup }) });

    await screen.findByRole('button', { name: 'Choose backup file' });
    const input = screen.getByLabelText('Backup file');
    await user.upload(input, new File(['{not json'], 'bad.json', { type: 'application/json' }));

    expect(await screen.findByText(/not valid JSON/i)).toBeInTheDocument();
    expect(importBackup).not.toHaveBeenCalled();
  });
});
