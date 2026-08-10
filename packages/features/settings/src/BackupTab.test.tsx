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
    const warning = await screen.findByText(/store it like a secret/i);
    expect(warning).toBeInTheDocument();
    // The panel is the design system's published warn surface, not a local formula:
    // hand-rolled copies drifted to three background recipes and two paddings. Only
    // the gap to what follows stays local. (jsdom evaluates no CSS — what is pinned
    // is which surface owns the styling.)
    expect(warning).toHaveClass('tai-warn-state');
    expect(warning.style.padding).toBe('');
    expect(warning.style.background).toBe('');
    expect(warning.style.border).toBe('');
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
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
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

  it('fronts the import surface with a danger-zone note and a danger restore button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BackupTab readOnly={false} />, { client: baseStub() });

    // A restore overwrites live config, so the import surface wears the danger ground:
    // the note is up front, before any file is chosen.
    expect(await screen.findByText(/overwrites this deployment/i)).toBeInTheDocument();

    await uploadBackup(user);
    // The restore action itself is a danger button, not the neutral primary it was.
    const restore = await screen.findByRole('button', { name: 'Import selected' });
    expect(restore).toHaveClass('tai-btn-danger');
  });

  it('hides the danger zone in read-only mode', async () => {
    renderWithProviders(<BackupTab readOnly />, { client: baseStub() });

    // The read-only note replaces the import controls, so no destructive surface renders.
    expect(await screen.findByText(/read-only for this deployment/i)).toBeInTheDocument();
    expect(screen.queryByText(/overwrites this deployment/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import selected' })).not.toBeInTheDocument();
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
